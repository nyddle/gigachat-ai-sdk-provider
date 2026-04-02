import { convertToGigaChatChatMessages } from './convert-to-gigachat-chat-messages.js';
import { gigaChatPrepareTools } from './gigachat-prepare-tools.js';
import type { GigaChatChatSettings } from './gigachat-chat-options.js';

/**
 * Normalize errors from gigachat-js which may produce unhelpful
 * "[object Object]" messages. The real info is in response.data.
 */
function normalizeError(err: unknown): never {
  if (err instanceof Error) {
    const resp = (err as any).response;
    let message = err.message;
    if (resp?.data) {
      const data = resp.data;
      const detail =
        typeof data === 'string'
          ? data
          : data.message ?? data.error ?? (function() { try { return JSON.stringify(data); } catch { return String(data.status ?? data.code ?? 'Unknown error'); } })();
      const status = resp.status;
      message = status ? `GigaChat ${status}: ${detail}` : detail;
    } else if (message === '[object Object]') {
      message = 'Unknown GigaChat error';
    }
    // Throw a clean Error without cyclic axios properties
    throw new Error(message);
  }
  throw new Error(String(err));
}

/**
 * Safely extract only known fields from a GigaChat API response.
 * Avoids JSON.stringify on potentially cyclic axios objects.
 */
function safeClone(obj: any): any {
  if (obj == null || typeof obj !== 'object') return obj;
  // Extract only the fields we care about from GigaChat responses
  const { choices, created, model, object: obj_, usage, id, xHeaders, ...rest } = obj;
  const result: any = {};
  if (id !== undefined) result.id = id;
  if (model !== undefined) result.model = model;
  if (created !== undefined) result.created = created;
  if (obj_ !== undefined) result.object = obj_;
  if (usage !== undefined) {
    result.usage = {
      prompt_tokens: usage?.prompt_tokens,
      completion_tokens: usage?.completion_tokens,
      precached_prompt_tokens: usage?.precached_prompt_tokens,
      total_tokens: usage?.total_tokens,
    };
  }
  if (choices) {
    result.choices = choices.map((c: any) => {
      const choice: any = {};
      if (c.index !== undefined) choice.index = c.index;
      if (c.finish_reason !== undefined) choice.finish_reason = c.finish_reason;
      if (c.message) {
        choice.message = {
          role: c.message.role,
          content: c.message.content,
        };
        if (c.message.function_call) {
          choice.message.function_call = {
            name: c.message.function_call.name,
            arguments: c.message.function_call.arguments,
          };
        }
      }
      if (c.delta) {
        choice.delta = {
          role: c.delta.role,
          content: c.delta.content,
        };
        if (c.delta.function_call) {
          choice.delta.function_call = {
            name: c.delta.function_call.name,
            arguments: c.delta.function_call.arguments,
          };
        }
      }
      return choice;
    });
  }
  return result;
}

interface GigaChatChatConfig {
  provider: string;
  getClient: () => any; // gigachat-js GigaChat instance
  modelSettings?: GigaChatChatSettings;
}

function mapUsageV2(raw: any) {
  return {
    inputTokens: raw?.prompt_tokens ?? undefined,
    outputTokens: raw?.completion_tokens ?? undefined,
    totalTokens:
      raw?.prompt_tokens != null && raw?.completion_tokens != null
        ? raw.prompt_tokens + raw.completion_tokens
        : undefined,
  };
}

function mapUsageV3(raw: any) {
  return {
    inputTokens: {
      total: raw?.prompt_tokens ?? undefined,
      noCache: undefined,
      cacheRead: raw?.precached_prompt_tokens ?? undefined,
      cacheWrite: undefined,
    },
    outputTokens: {
      total: raw?.completion_tokens ?? undefined,
      text: raw?.completion_tokens ?? undefined,
      reasoning: undefined,
    },
  };
}

function mapFinishReasonV2(raw: string | null | undefined): string {
  if (!raw) return 'other';
  switch (raw) {
    case 'stop':
      return 'stop';
    case 'length':
      return 'length';
    case 'function_call':
      return 'tool-calls';
    case 'blacklist':
      return 'content-filter';
    case 'error':
      return 'error';
    default:
      return 'other';
  }
}

function mapFinishReasonV3(raw: string | null | undefined) {
  return {
    unified: mapFinishReasonV2(raw) as any,
    raw: raw ?? undefined,
  };
}

/**
 * AI SDK LanguageModel backed by the gigachat-js client.
 * Supports both V2 (ai@5 / OpenCode) and V3 (ai@6+) specs.
 */
export class GigaChatChatLanguageModel {
  readonly specificationVersion: string;
  readonly supportedUrls: Record<string, RegExp[]> = {};

  readonly modelId: string;
  readonly provider: string;

  private readonly config: GigaChatChatConfig;
  private readonly isV2: boolean;
  private toolCallCounter = 0;

  constructor(
    modelId: string,
    config: GigaChatChatConfig,
    specVersion: 'v2' | 'v3' = 'v2',
  ) {
    this.modelId = modelId;
    this.provider = config.provider;
    this.config = config;
    this.specificationVersion = specVersion;
    this.isV2 = specVersion === 'v2';
  }

  private _buildPayload(options: any, stream: boolean) {
    const warnings: any[] = [];

    if (options.topK != null) {
      warnings.push({ type: 'unsupported', feature: 'topK' });
    }
    if (options.frequencyPenalty != null) {
      warnings.push({ type: 'unsupported', feature: 'frequencyPenalty' });
    }
    if (options.presencePenalty != null) {
      warnings.push({ type: 'unsupported', feature: 'presencePenalty' });
    }
    if (options.seed != null) {
      warnings.push({ type: 'unsupported', feature: 'seed' });
    }

    for (const msg of options.prompt) {
      if (msg.role === 'user') {
        for (const part of msg.content) {
          if (part.type !== 'text') {
            warnings.push({
              type: 'unsupported',
              feature: `user message part type "${part.type}"`,
            });
          }
        }
      }
    }

    const { functions, functionCall, toolWarnings } = gigaChatPrepareTools(
      options.tools,
      options.toolChoice,
    );

    const payload: Record<string, unknown> = {
      model: this.modelId,
      messages: convertToGigaChatChatMessages(options.prompt),
      stream,
    };

    if (options.maxOutputTokens != null)
      payload.max_tokens = options.maxOutputTokens;
    // V2 uses maxTokens, V3 uses maxOutputTokens
    if ((options as any).maxTokens != null)
      payload.max_tokens = (options as any).maxTokens;
    if (options.temperature != null) payload.temperature = options.temperature;
    if (options.topP != null) payload.top_p = options.topP;
    if (options.stopSequences?.length) payload.stop = options.stopSequences;

    const settings = this.config.modelSettings;
    if (settings?.profanityCheck != null)
      payload.profanity_check = settings.profanityCheck;
    if (settings?.repetitionPenalty != null)
      payload.repetition_penalty = settings.repetitionPenalty;
    if (settings?.updateInterval != null)
      payload.update_interval = settings.updateInterval;
    if (settings?.flags) payload.flags = settings.flags;

    if (functions) {
      payload.functions = functions;
      if (functionCall !== undefined) payload.function_call = functionCall;
    }

    return { payload, warnings: [...warnings, ...toolWarnings] };
  }

  private _mapUsage(raw: any) {
    return this.isV2 ? mapUsageV2(raw) : mapUsageV3(raw);
  }

  private _mapFinishReason(raw: string | null | undefined) {
    return this.isV2 ? mapFinishReasonV2(raw) : mapFinishReasonV3(raw);
  }

  private _makeToolCallInput(fc: any) {
    // V2: input is parsed object, V3: input is JSON string
    if (this.isV2) {
      return typeof fc.arguments === 'string'
        ? JSON.parse(fc.arguments)
        : fc.arguments;
    }
    return typeof fc.arguments === 'string'
      ? fc.arguments
      : JSON.stringify(fc.arguments);
  }

  async doGenerate(options: any): Promise<any> {
    const { payload, warnings } = this._buildPayload(options, false);
    const client = this.config.getClient();

    const rawResult = await client.chat(payload).catch(normalizeError);
    // Deep-clone to strip hidden axios/http references that cause cyclic errors in Bun
    const rawResponse = safeClone(rawResult);
    const choice = rawResponse.choices?.[0];

    if (!choice) {
      throw new Error('GigaChat returned no choices');
    }

    const content: any[] = [];

    if (choice.message.content) {
      content.push({ type: 'text', text: choice.message.content });
    }

    if (choice.message.function_call) {
      const fc = choice.message.function_call;
      const toolCallId = `call_${this.toolCallCounter++}`;
      content.push({
        type: 'tool-call',
        toolCallId,
        toolName: fc.name,
        // V2 expects args as object, V3 expects input as string
        ...(this.isV2
          ? { args: this._makeToolCallInput(fc) }
          : { input: this._makeToolCallInput(fc) }),
      });
    }

    return {
      content,
      finishReason: this._mapFinishReason(choice.finish_reason),
      usage: this._mapUsage(rawResponse.usage),
      warnings,
      request: { body: JSON.stringify(payload) },
      response: {
        id: rawResponse.id ?? undefined,
        modelId: rawResponse.model ?? undefined,
        timestamp: rawResponse.created
          ? new Date(rawResponse.created * 1000)
          : undefined,
      },
      rawCall: { rawPrompt: payload.messages, rawSettings: payload },
    };
  }

  async doStream(options: any): Promise<any> {
    const { payload, warnings } = this._buildPayload(options, true);
    const client = this.config.getClient();

    let asyncIterator: AsyncIterable<any>;
    try {
      asyncIterator = client.stream(payload);
    } catch (err) {
      normalizeError(err);
    }

    let isFirstChunk = true;
    let isActiveText = false;
    let finishReason = this._mapFinishReason(undefined);
    let usage: any = undefined;
    const self = this;
    const isV2 = this.isV2;

    const stream = new ReadableStream({
      async start(controller) {
        controller.enqueue({ type: 'stream-start', warnings });

        try {
          for await (const rawChunk of asyncIterator) {
            // Deep-clone to strip hidden axios/http references
            const chunk = safeClone(rawChunk);

            if (options.includeRawChunks) {
              controller.enqueue({ type: 'raw', rawValue: chunk });
            }

            if (isFirstChunk) {
              isFirstChunk = false;
              controller.enqueue({
                type: 'response-metadata',
                id: chunk.id ?? undefined,
                modelId: chunk.model ?? undefined,
                timestamp: chunk.created
                  ? new Date(chunk.created * 1000)
                  : undefined,
              });
            }

            if (chunk.usage) {
              usage = chunk.usage;
            }

            const choice = chunk.choices?.[0];
            if (!choice) continue;

            if (choice.finish_reason) {
              finishReason = self._mapFinishReason(choice.finish_reason);
            }

            const delta = choice.delta;
            if (!delta) continue;

            // Text content — emit both V2 and V3 fields for compatibility
            if (delta.content != null && delta.content.length > 0) {
              if (!isActiveText) {
                controller.enqueue({ type: 'text-start', id: 'txt-0' });
                isActiveText = true;
              }
              controller.enqueue({
                type: 'text-delta',
                id: 'txt-0',
                delta: delta.content,
                textDelta: delta.content,
              });
            }

            // GigaChat sends complete function_call in one chunk
            if (delta.function_call) {
              if (isActiveText) {
                controller.enqueue({ type: 'text-end', id: 'txt-0' });
                isActiveText = false;
              }

              const fc = delta.function_call;
              const toolCallId = `call_${self.toolCallCounter++}`;
              const input = self._makeToolCallInput(fc);

              if (isV2) {
                const inputStr =
                  typeof fc.arguments === 'string'
                    ? fc.arguments
                    : JSON.stringify(fc.arguments);
                controller.enqueue({
                  type: 'tool-call-delta',
                  toolCallType: 'function',
                  toolCallId,
                  toolName: fc.name,
                  argsTextDelta: inputStr,
                });
                controller.enqueue({
                  type: 'tool-call',
                  toolCallType: 'function',
                  toolCallId,
                  toolName: fc.name,
                  args: inputStr,
                });
              } else {
                const inputStr =
                  typeof input === 'string' ? input : JSON.stringify(input);
                controller.enqueue({
                  type: 'tool-input-start',
                  id: toolCallId,
                  toolName: fc.name,
                });
                controller.enqueue({
                  type: 'tool-input-delta',
                  id: toolCallId,
                  delta: inputStr,
                });
                controller.enqueue({
                  type: 'tool-input-end',
                  id: toolCallId,
                });
                controller.enqueue({
                  type: 'tool-call',
                  toolCallId,
                  toolName: fc.name,
                  input: inputStr,
                });
              }
            }
          }

          // Stream ended
          if (isActiveText) {
            controller.enqueue({ type: 'text-end', id: 'txt-0' });
          }
          controller.enqueue({
            type: 'finish',
            finishReason,
            usage: self._mapUsage(usage),
          });
          controller.close();
        } catch (error) {
          try {
            normalizeError(error);
          } catch (normalized) {
            controller.error(normalized);
          }
        }
      },
    });

    return {
      stream,
      request: { body: JSON.stringify(payload) },
      response: {},
      rawCall: { rawPrompt: payload.messages, rawSettings: payload },
    };
  }
}
