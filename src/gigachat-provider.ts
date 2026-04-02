import { NoSuchModelError } from '@ai-sdk/provider';
import GigaChatModule from 'gigachat';

// Handle CJS/ESM interop: Bun may wrap the CJS export differently than Node
const GigaChat =
  typeof GigaChatModule === 'function'
    ? GigaChatModule
    : (GigaChatModule as any).GigaChat ?? (GigaChatModule as any).default;
import { GigaChatChatLanguageModel } from './chat/gigachat-chat-language-model.js';
import type { GigaChatChatSettings } from './chat/gigachat-chat-options.js';
import { VERSION } from './version.js';

/**
 * Detect which AI SDK spec version is available.
 * ai@5 uses @ai-sdk/provider@2 (V2), ai@6+ uses @ai-sdk/provider@3 (V3).
 */
function detectSpecVersion(): 'v2' | 'v3' {
  try {
    // V3 has LanguageModelV3FinishReason as an object type, V2 has it as string
    // Simplest heuristic: check if the provider package exports V3-specific types
    // by checking the specificationVersion we're running under
    const provider = require('@ai-sdk/provider');
    // V2 package doesn't export LanguageModelV3Usage
    if (provider.LanguageModelV3Usage) return 'v3';
  } catch {}
  return 'v2';
}

const detectedSpec = detectSpecVersion();

export interface GigaChatProviderSettings {
  /**
   * Base64-encoded authorization key from GigaChat Studio.
   * Falls back to the GIGACHAT_CREDENTIALS environment variable.
   */
  credentials?: string;

  /**
   * API access scope.
   * @default 'GIGACHAT_API_PERS'
   */
  scope?: 'GIGACHAT_API_PERS' | 'GIGACHAT_API_B2B' | 'GIGACHAT_API_CORP';

  /**
   * Custom API base URL.
   * Falls back to the GIGACHAT_BASE_URL environment variable,
   * then to the gigachat-js default.
   */
  baseUrl?: string;

  /**
   * Custom OAuth token URL.
   * Falls back to the GIGACHAT_AUTH_URL environment variable.
   */
  authUrl?: string;

  /**
   * Pre-obtained JWE access token. Skips OAuth entirely.
   * Falls back to the GIGACHAT_ACCESS_TOKEN environment variable.
   */
  accessToken?: string;

  /**
   * Enable profanity / content filtering.
   */
  profanityCheck?: boolean;

  /**
   * Enable debug logging from the gigachat-js client.
   */
  verbose?: boolean;

  /**
   * Request timeout in seconds.
   */
  timeout?: number;

  /**
   * Custom HTTPS agent (e.g. for mTLS certificates).
   */
  httpsAgent?: unknown;

  /**
   * Username for user/password authentication.
   */
  user?: string;

  /**
   * Password for user/password authentication.
   */
  password?: string;

  /**
   * Feature flags passed to the GigaChat API.
   */
  flags?: string[];

  /**
   * Override the provider name in AI SDK metadata.
   * @default 'gigachat'
   */
  name?: string;

  /**
   * Force a specific AI SDK specification version.
   * Auto-detected by default (v2 for ai@5/OpenCode, v3 for ai@6+).
   */
  specVersion?: 'v2' | 'v3';
}

/**
 * GigaChat provider for the Vercel AI SDK.
 * Supports both V2 (ai@5 / OpenCode) and V3 (ai@6+) specs.
 */
export interface GigaChatProvider {
  (modelId: string, settings?: GigaChatChatSettings): any;
  languageModel(modelId: string, settings?: GigaChatChatSettings): any;
  chat(modelId: string, settings?: GigaChatChatSettings): any;
  readonly client: InstanceType<typeof GigaChat>;
}

/**
 * Creates a GigaChat provider for the Vercel AI SDK.
 *
 * Uses the `gigachat` npm package (https://github.com/ai-forever/gigachat-js)
 * under the hood for authentication and API calls.
 */
export function createGigaChat(
  options: GigaChatProviderSettings = {},
): GigaChatProvider {
  const { name: _name, specVersion: _specVersion, ...rest } = options;
  const clientConfig: Record<string, unknown> = Object.fromEntries(
    Object.entries(rest).filter(([_, v]) => v != null),
  );

  const specVersion = _specVersion ?? detectedSpec;

  let _client: InstanceType<typeof GigaChat> | null = null;
  const getClient = () => {
    if (!_client) {
      _client = new GigaChat(clientConfig);
    }
    return _client;
  };

  const providerName = options.name ?? 'gigachat';

  const createLanguageModel = (
    modelId: string,
    settings?: GigaChatChatSettings,
  ) =>
    new GigaChatChatLanguageModel(
      modelId,
      {
        provider: providerName,
        getClient,
        modelSettings: settings,
      },
      specVersion,
    );

  const provider = Object.assign(
    function (modelId: string, settings?: GigaChatChatSettings) {
      return createLanguageModel(modelId, settings);
    } as GigaChatProvider,
    {
      specificationVersion: specVersion,
      languageModel: createLanguageModel,
      chat: createLanguageModel,
      embeddingModel(modelId: string) {
        throw new NoSuchModelError({ modelId, modelType: 'embeddingModel' });
      },
      imageModel(modelId: string) {
        throw new NoSuchModelError({ modelId, modelType: 'imageModel' });
      },
    },
  );

  Object.defineProperty(provider, 'client', {
    get: getClient,
    enumerable: true,
  });

  return provider;
}
