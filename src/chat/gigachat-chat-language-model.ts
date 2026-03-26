import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3GenerateResult,
  LanguageModelV3StreamPart,
  LanguageModelV3StreamResult,
  LanguageModelV3Usage,
  SharedV3Warning,
} from '@ai-sdk/provider';
import { convertToGigaChatChatMessages } from './convert-to-gigachat-chat-messages.js';
import { mapGigaChatFinishReason } from './map-gigachat-finish-reason.js';
import { gigaChatPrepareTools } from './gigachat-prepare-tools.js';
import type { GigaChatChatSettings } from './gigachat-chat-options.js';

interface GigaChatChatConfig {
  provider: string;
  getClient: () => any; // gigachat-js GigaChat instance
  modelSettings?: GigaChatChatSettings;
}

function mapUsage(raw: any): LanguageModelV3Usage {
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

/**
 * AI SDK V3 LanguageModel backed by the gigachat-js client.
 *
 * Uses the `gigachat` npm package for all API calls, which handles
 * OAuth token management, automatic token refresh, and GigaChat-specific auth.
 */
export class GigaChatChatLanguageModel implements LanguageModelV3 {
  readonly specificationVersion = 'v3' as const;
  readonly supportedUrls: Record<string, RegExp[]> = {};

  readonly modelId: string;
  readonly provider: string;

  private readonly config: GigaChatChatConfig;

  constructor(modelId: string, config: GigaChatChatConfig) {
    this.modelId = modelId;
    this.provider = config.provider;
    this.config = config;
  }

  private _buildPayload(options: LanguageModelV3CallOptions, stream: boolean) {
    const warnings: SharedV3Warning[] = [];

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
    if (options.temperature != null) payload.temperature = options.temperature;
    if (options.topP != null) payload.top_p = options.topP;
    if (options.stopSequences?.length) payload.stop = options.stopSequences;

    // GigaChat-specific settings
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

  async doGenerate(
    options: LanguageModelV3CallOptions,
  ): Promise<LanguageModelV3GenerateResult> {
    const { payload, warnings } = this._buildPayload(options, false);
    const client = this.config.getClient();

    const rawResponse = await client.chat(payload);
    const choice = rawResponse.choices?.[0];

    if (!choice) {
      throw new Error('GigaChat returned no choices');
    }

    const content: LanguageModelV3GenerateResult['content'] = [];

    if (choice.message.content) {
      content.push({ type: 'text', text: choice.message.content });
    }

    if (choice.message.function_call) {
      const fc = choice.message.function_call;
      const toolCallId = `call_${Date.now()}`;
      content.push({
        type: 'tool-call',
        toolCallId,
        toolName: fc.name,
        input:
          typeof fc.arguments === 'string'
            ? fc.arguments
            : JSON.stringify(fc.arguments),
      });
    }

    return {
      content,
      finishReason: mapGigaChatFinishReason(choice.finish_reason),
      usage: mapUsage(rawResponse.usage),
      warnings,
      request: { body: payload },
      response: {
        id: rawResponse.id ?? undefined,
        modelId: rawResponse.model ?? undefined,
        timestamp: rawResponse.created
          ? new Date(rawResponse.created * 1000)
          : undefined,
        body: rawResponse,
      },
    };
  }

  async doStream(
    options: LanguageModelV3CallOptions,
  ): Promise<LanguageModelV3StreamResult> {
    const { payload, warnings } = this._buildPayload(options, true);
    const client = this.config.getClient();

    const asyncIterator = client.stream(payload);

    let isFirstChunk = true;
    let isActiveText = false;
    let finishReason = mapGigaChatFinishReason(undefined);
    let usage: any = undefined;

    const stream = new ReadableStream<LanguageModelV3StreamPart>({
      start(controller) {
        controller.enqueue({ type: 'stream-start', warnings });
      },
      async pull(controller) {
        try {
          for await (const chunk of asyncIterator) {
            if (options.includeRawChunks) {
              controller.enqueue({ type: 'raw', rawValue: chunk });
            }

            // Emit response metadata on first chunk
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
              finishReason = mapGigaChatFinishReason(choice.finish_reason);
            }

            const delta = choice.delta;
            if (!delta) continue;

            // Text content
            if (delta.content != null && delta.content.length > 0) {
              if (!isActiveText) {
                controller.enqueue({ type: 'text-start', id: 'txt-0' });
                isActiveText = true;
              }
              controller.enqueue({
                type: 'text-delta',
                id: 'txt-0',
                delta: delta.content,
              });
            }

            // GigaChat sends complete function_call in one chunk
            if (delta.function_call) {
              if (isActiveText) {
                controller.enqueue({ type: 'text-end', id: 'txt-0' });
                isActiveText = false;
              }
              const fc = delta.function_call;
              const toolCallId = `call_${Date.now()}`;
              const inputStr =
                typeof fc.arguments === 'string'
                  ? fc.arguments
                  : JSON.stringify(fc.arguments);

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

          // Stream ended
          if (isActiveText) {
            controller.enqueue({ type: 'text-end', id: 'txt-0' });
          }
          controller.enqueue({
            type: 'finish',
            finishReason,
            usage: mapUsage(usage),
          });
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });

    return {
      stream,
      request: { body: payload },
      response: {},
    };
  }
}
