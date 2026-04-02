// src/gigachat-provider.ts
import { NoSuchModelError } from "@ai-sdk/provider";
import GigaChatModule from "gigachat";

// src/chat/convert-to-gigachat-chat-messages.ts
function convertToGigaChatChatMessages(prompt) {
  const messages = [];
  for (const message of prompt) {
    switch (message.role) {
      case "system": {
        messages.push({ role: "system", content: message.content });
        break;
      }
      case "user": {
        const text = message.content.filter((p) => p.type === "text").map((p) => p.text).join("");
        if (text) {
          messages.push({ role: "user", content: text });
        }
        break;
      }
      case "assistant": {
        let text = "";
        let functionCall = void 0;
        for (const part of message.content) {
          if (part.type === "text") {
            text += part.text;
          } else if (part.type === "tool-call") {
            const args = part.input;
            functionCall = {
              name: part.toolName,
              arguments: typeof args === "string" ? JSON.parse(args) : args
            };
          }
        }
        const msg = {
          role: "assistant",
          content: text || void 0
        };
        if (functionCall) {
          msg.function_call = functionCall;
        }
        messages.push(msg);
        break;
      }
      case "tool": {
        for (const part of message.content) {
          if (part.type !== "tool-result") continue;
          const output = part.output;
          let content;
          if (output == null) {
            content = "";
          } else if (typeof output === "string") {
            content = output;
          } else if (typeof output === "object" && "type" in output) {
            const typed = output;
            switch (typed.type) {
              case "text":
              case "error-text":
                content = String(typed.value);
                break;
              case "json":
              case "error-json":
              case "content":
                content = JSON.stringify(typed.value);
                break;
              default:
                content = JSON.stringify(output);
            }
          } else {
            content = JSON.stringify(output);
          }
          let jsonContent;
          try {
            JSON.parse(content);
            jsonContent = content;
          } catch {
            jsonContent = JSON.stringify(content || "");
          }
          messages.push({
            role: "function",
            name: part.toolName,
            content: jsonContent
          });
        }
        break;
      }
    }
  }
  return messages;
}

// src/chat/gigachat-prepare-tools.ts
function gigaChatPrepareTools(tools, toolChoice) {
  const toolWarnings = [];
  if (!tools?.length) {
    return { functions: void 0, functionCall: void 0, toolWarnings };
  }
  const functions = [];
  for (const tool of tools) {
    if (tool.type === "function") {
      const schema = tool.inputSchema ?? { type: "object", properties: {} };
      const props = schema.properties;
      if (props && typeof props === "object" && Object.keys(props).length === 0) {
        toolWarnings.push({
          type: "other",
          message: `Tool "${tool.name}" has an empty inputSchema \u2014 parameters will not be sent to the model. If you defined the tool with a zod \`parameters\` key, switch to \`inputSchema: jsonSchema(\u2026)\` instead (AI SDK v6 + zod v4 compatibility issue).`
        });
      }
      functions.push({
        name: tool.name,
        description: tool.description ?? "",
        parameters: schema
      });
    } else {
      toolWarnings.push({
        type: "unsupported",
        feature: `tool type "${tool.type}"`
      });
    }
  }
  if (functions.length === 0) {
    return { functions: void 0, functionCall: void 0, toolWarnings };
  }
  let functionCall = void 0;
  if (toolChoice) {
    switch (toolChoice.type) {
      case "auto":
        functionCall = "auto";
        break;
      case "none":
        functionCall = "none";
        break;
      case "required":
        functionCall = "auto";
        toolWarnings.push({
          type: "unsupported",
          feature: "toolChoice.required",
          details: "GigaChat does not support required tool choice, using auto"
        });
        break;
      case "tool":
        functionCall = { name: toolChoice.toolName };
        break;
    }
  }
  return { functions, functionCall, toolWarnings };
}

// src/chat/gigachat-chat-language-model.ts
function normalizeError(err) {
  if (err instanceof Error) {
    const resp = err.response;
    let message = err.message;
    if (resp?.data) {
      const data = resp.data;
      const detail = typeof data === "string" ? data : data.message ?? data.error ?? (function() {
        try {
          return JSON.stringify(data);
        } catch {
          return String(data.status ?? data.code ?? "Unknown error");
        }
      })();
      const status = resp.status;
      message = status ? `GigaChat ${status}: ${detail}` : detail;
    } else if (message === "[object Object]") {
      message = "Unknown GigaChat error";
    }
    throw new Error(message);
  }
  throw new Error(String(err));
}
function safeClone(obj) {
  if (obj == null || typeof obj !== "object") return obj;
  const { choices, created, model, object: obj_, usage, id, xHeaders, ...rest } = obj;
  const result = {};
  if (id !== void 0) result.id = id;
  if (model !== void 0) result.model = model;
  if (created !== void 0) result.created = created;
  if (obj_ !== void 0) result.object = obj_;
  if (usage !== void 0) {
    result.usage = {
      prompt_tokens: usage?.prompt_tokens,
      completion_tokens: usage?.completion_tokens,
      precached_prompt_tokens: usage?.precached_prompt_tokens,
      total_tokens: usage?.total_tokens
    };
  }
  if (choices) {
    result.choices = choices.map((c) => {
      const choice = {};
      if (c.index !== void 0) choice.index = c.index;
      if (c.finish_reason !== void 0) choice.finish_reason = c.finish_reason;
      if (c.message) {
        choice.message = {
          role: c.message.role,
          content: c.message.content
        };
        if (c.message.function_call) {
          choice.message.function_call = {
            name: c.message.function_call.name,
            arguments: c.message.function_call.arguments
          };
        }
      }
      if (c.delta) {
        choice.delta = {
          role: c.delta.role,
          content: c.delta.content
        };
        if (c.delta.function_call) {
          choice.delta.function_call = {
            name: c.delta.function_call.name,
            arguments: c.delta.function_call.arguments
          };
        }
      }
      return choice;
    });
  }
  return result;
}
function mapUsageV2(raw) {
  return {
    inputTokens: raw?.prompt_tokens ?? void 0,
    outputTokens: raw?.completion_tokens ?? void 0,
    totalTokens: raw?.prompt_tokens != null && raw?.completion_tokens != null ? raw.prompt_tokens + raw.completion_tokens : void 0
  };
}
function mapUsageV3(raw) {
  return {
    inputTokens: {
      total: raw?.prompt_tokens ?? void 0,
      noCache: void 0,
      cacheRead: raw?.precached_prompt_tokens ?? void 0,
      cacheWrite: void 0
    },
    outputTokens: {
      total: raw?.completion_tokens ?? void 0,
      text: raw?.completion_tokens ?? void 0,
      reasoning: void 0
    }
  };
}
function mapFinishReasonV2(raw) {
  if (!raw) return "other";
  switch (raw) {
    case "stop":
      return "stop";
    case "length":
      return "length";
    case "function_call":
      return "tool-calls";
    case "blacklist":
      return "content-filter";
    case "error":
      return "error";
    default:
      return "other";
  }
}
function mapFinishReasonV3(raw) {
  return {
    unified: mapFinishReasonV2(raw),
    raw: raw ?? void 0
  };
}
var GigaChatChatLanguageModel = class {
  specificationVersion;
  supportedUrls = {};
  modelId;
  provider;
  config;
  isV2;
  toolCallCounter = 0;
  constructor(modelId, config, specVersion = "v2") {
    this.modelId = modelId;
    this.provider = config.provider;
    this.config = config;
    this.specificationVersion = specVersion;
    this.isV2 = specVersion === "v2";
  }
  _buildPayload(options, stream) {
    const warnings = [];
    if (options.topK != null) {
      warnings.push({ type: "unsupported", feature: "topK" });
    }
    if (options.frequencyPenalty != null) {
      warnings.push({ type: "unsupported", feature: "frequencyPenalty" });
    }
    if (options.presencePenalty != null) {
      warnings.push({ type: "unsupported", feature: "presencePenalty" });
    }
    if (options.seed != null) {
      warnings.push({ type: "unsupported", feature: "seed" });
    }
    for (const msg of options.prompt) {
      if (msg.role === "user") {
        for (const part of msg.content) {
          if (part.type !== "text") {
            warnings.push({
              type: "unsupported",
              feature: `user message part type "${part.type}"`
            });
          }
        }
      }
    }
    const { functions, functionCall, toolWarnings } = gigaChatPrepareTools(
      options.tools,
      options.toolChoice
    );
    const payload = {
      model: this.modelId,
      messages: convertToGigaChatChatMessages(options.prompt),
      stream
    };
    if (options.maxOutputTokens != null)
      payload.max_tokens = options.maxOutputTokens;
    if (options.maxTokens != null)
      payload.max_tokens = options.maxTokens;
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
      if (functionCall !== void 0) payload.function_call = functionCall;
    }
    return { payload, warnings: [...warnings, ...toolWarnings] };
  }
  _mapUsage(raw) {
    return this.isV2 ? mapUsageV2(raw) : mapUsageV3(raw);
  }
  _mapFinishReason(raw) {
    return this.isV2 ? mapFinishReasonV2(raw) : mapFinishReasonV3(raw);
  }
  _makeToolCallInput(fc) {
    if (this.isV2) {
      return typeof fc.arguments === "string" ? JSON.parse(fc.arguments) : fc.arguments;
    }
    return typeof fc.arguments === "string" ? fc.arguments : JSON.stringify(fc.arguments);
  }
  async doGenerate(options) {
    const { payload, warnings } = this._buildPayload(options, false);
    const client = this.config.getClient();
    const rawResult = await client.chat(payload).catch(normalizeError);
    const rawResponse = safeClone(rawResult);
    const choice = rawResponse.choices?.[0];
    if (!choice) {
      throw new Error("GigaChat returned no choices");
    }
    const content = [];
    if (choice.message.content) {
      content.push({ type: "text", text: choice.message.content });
    }
    if (choice.message.function_call) {
      const fc = choice.message.function_call;
      const toolCallId = `call_${this.toolCallCounter++}`;
      content.push({
        type: "tool-call",
        toolCallId,
        toolName: fc.name,
        // V2 expects args as object, V3 expects input as string
        ...this.isV2 ? { args: this._makeToolCallInput(fc) } : { input: this._makeToolCallInput(fc) }
      });
    }
    return {
      content,
      finishReason: this._mapFinishReason(choice.finish_reason),
      usage: this._mapUsage(rawResponse.usage),
      warnings,
      request: { body: JSON.stringify(payload) },
      response: {
        id: rawResponse.id ?? void 0,
        modelId: rawResponse.model ?? void 0,
        timestamp: rawResponse.created ? new Date(rawResponse.created * 1e3) : void 0
      },
      rawCall: { rawPrompt: payload.messages, rawSettings: payload }
    };
  }
  async doStream(options) {
    const { payload, warnings } = this._buildPayload(options, true);
    const client = this.config.getClient();
    let asyncIterator;
    try {
      asyncIterator = client.stream(payload);
    } catch (err) {
      normalizeError(err);
    }
    let isFirstChunk = true;
    let isActiveText = false;
    let finishReason = this._mapFinishReason(void 0);
    let usage = void 0;
    const self = this;
    const isV2 = this.isV2;
    const stream = new ReadableStream({
      async start(controller) {
        controller.enqueue({ type: "stream-start", warnings });
        try {
          for await (const rawChunk of asyncIterator) {
            const chunk = safeClone(rawChunk);
            if (options.includeRawChunks) {
              controller.enqueue({ type: "raw", rawValue: chunk });
            }
            if (isFirstChunk) {
              isFirstChunk = false;
              controller.enqueue({
                type: "response-metadata",
                id: chunk.id ?? void 0,
                modelId: chunk.model ?? void 0,
                timestamp: chunk.created ? new Date(chunk.created * 1e3) : void 0
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
            if (delta.content != null && delta.content.length > 0) {
              if (!isActiveText) {
                controller.enqueue({ type: "text-start", id: "txt-0" });
                isActiveText = true;
              }
              controller.enqueue({
                type: "text-delta",
                id: "txt-0",
                delta: delta.content
              });
            }
            if (delta.function_call) {
              if (isActiveText) {
                controller.enqueue({ type: "text-end", id: "txt-0" });
                isActiveText = false;
              }
              const fc = delta.function_call;
              const toolCallId = `call_${self.toolCallCounter++}`;
              const input = self._makeToolCallInput(fc);
              const inputStr = typeof fc.arguments === "string" ? fc.arguments : JSON.stringify(fc.arguments);
              controller.enqueue({
                type: "tool-input-start",
                id: toolCallId,
                toolName: fc.name
              });
              controller.enqueue({
                type: "tool-input-delta",
                id: toolCallId,
                delta: inputStr
              });
              controller.enqueue({
                type: "tool-input-end",
                id: toolCallId
              });
              controller.enqueue({
                type: "tool-call",
                toolCallId,
                toolName: fc.name,
                input: inputStr
              });
            }
          }
          if (isActiveText) {
            controller.enqueue({ type: "text-end", id: "txt-0" });
          }
          controller.enqueue({
            type: "finish",
            finishReason,
            usage: self._mapUsage(usage)
          });
          controller.close();
        } catch (error) {
          try {
            normalizeError(error);
          } catch (normalized) {
            controller.error(normalized);
          }
        }
      }
    });
    return {
      stream,
      request: { body: JSON.stringify(payload) },
      response: {},
      rawCall: { rawPrompt: payload.messages, rawSettings: payload }
    };
  }
};

// src/gigachat-provider.ts
var GigaChat = typeof GigaChatModule === "function" ? GigaChatModule : GigaChatModule.GigaChat ?? GigaChatModule.default;
function detectSpecVersion() {
  return "v3";
}
var detectedSpec = detectSpecVersion();
function createGigaChat(options = {}) {
  const { name: _name, specVersion: _specVersion, ...rest } = options;
  const clientConfig = Object.fromEntries(
    Object.entries(rest).filter(([_, v]) => v != null)
  );
  const specVersion = _specVersion ?? detectedSpec;
  let _client = null;
  const getClient = () => {
    if (!_client) {
      _client = new GigaChat(clientConfig);
    }
    return _client;
  };
  const providerName = options.name ?? "gigachat";
  const createLanguageModel = (modelId, settings) => new GigaChatChatLanguageModel(
    modelId,
    {
      provider: providerName,
      getClient,
      modelSettings: settings
    },
    specVersion
  );
  const provider = Object.assign(
    function(modelId, settings) {
      return createLanguageModel(modelId, settings);
    },
    {
      specificationVersion: specVersion,
      languageModel: createLanguageModel,
      chat: createLanguageModel,
      embeddingModel(modelId) {
        throw new NoSuchModelError({ modelId, modelType: "embeddingModel" });
      },
      imageModel(modelId) {
        throw new NoSuchModelError({ modelId, modelType: "imageModel" });
      }
    }
  );
  Object.defineProperty(provider, "client", {
    get: getClient,
    enumerable: true
  });
  return provider;
}

// src/chat/map-gigachat-finish-reason.ts
function mapGigaChatFinishReason(raw) {
  if (!raw) return "other";
  switch (raw) {
    case "stop":
      return "stop";
    case "length":
      return "length";
    case "function_call":
      return "tool-calls";
    case "blacklist":
      return "content-filter";
    case "error":
      return "error";
    default:
      return "other";
  }
}

// src/version.ts
var VERSION = true ? "0.2.0" : "0.0.0-test";
export {
  GigaChatChatLanguageModel,
  VERSION,
  convertToGigaChatChatMessages,
  createGigaChat,
  createGigaChat as default,
  gigaChatPrepareTools,
  mapGigaChatFinishReason
};
//# sourceMappingURL=index.js.map