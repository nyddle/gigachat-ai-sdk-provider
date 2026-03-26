import type { LanguageModelV3, ProviderV3 } from '@ai-sdk/provider';
import { NoSuchModelError } from '@ai-sdk/provider';
import GigaChat from 'gigachat';
import { GigaChatChatLanguageModel } from './chat/gigachat-chat-language-model.js';
import type { GigaChatChatSettings } from './chat/gigachat-chat-options.js';
import { VERSION } from './version.js';

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
}

/**
 * GigaChat provider for the Vercel AI SDK.
 *
 * Both callable and has named methods:
 * ```ts
 * const model = gigachat('GigaChat-Pro');           // callable
 * const model = gigachat.languageModel('GigaChat'); // named
 * ```
 */
export interface GigaChatProvider extends ProviderV3 {
  (
    modelId: string,
    settings?: GigaChatChatSettings,
  ): LanguageModelV3;

  languageModel(
    modelId: string,
    settings?: GigaChatChatSettings,
  ): LanguageModelV3;

  chat(
    modelId: string,
    settings?: GigaChatChatSettings,
  ): LanguageModelV3;

  /** The underlying gigachat-js client for advanced usage (embeddings, etc.) */
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
  const clientConfig: Record<string, unknown> = {};

  if (options.credentials) clientConfig.credentials = options.credentials;
  if (options.scope) clientConfig.scope = options.scope;
  if (options.baseUrl) clientConfig.baseUrl = options.baseUrl;
  if (options.authUrl) clientConfig.authUrl = options.authUrl;
  if (options.accessToken) clientConfig.accessToken = options.accessToken;
  if (options.profanityCheck != null)
    clientConfig.profanityCheck = options.profanityCheck;
  if (options.verbose != null) clientConfig.verbose = options.verbose;
  if (options.httpsAgent) clientConfig.httpsAgent = options.httpsAgent;
  if (options.timeout != null) clientConfig.timeout = options.timeout;
  if (options.user) clientConfig.user = options.user;
  if (options.password) clientConfig.password = options.password;
  if (options.flags) clientConfig.flags = options.flags;

  // Lazily create a single shared client instance
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
  ): LanguageModelV3 =>
    new GigaChatChatLanguageModel(modelId, {
      provider: providerName,
      getClient,
      modelSettings: settings,
    });

  const provider = function (
    modelId: string,
    settings?: GigaChatChatSettings,
  ) {
    return createLanguageModel(modelId, settings);
  } as GigaChatProvider;

  (provider as any).specificationVersion = 'v3';
  provider.languageModel = createLanguageModel;
  provider.chat = createLanguageModel;

  provider.embeddingModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'embeddingModel' });
  };

  provider.imageModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'imageModel' });
  };

  Object.defineProperty(provider, 'client', {
    get: getClient,
    enumerable: true,
  });

  return provider;
}
