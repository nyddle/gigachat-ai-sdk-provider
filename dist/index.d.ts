import { LanguageModelV3Prompt, LanguageModelV3FunctionTool, LanguageModelV3ProviderTool, LanguageModelV3ToolChoice, SharedV3Warning } from '@ai-sdk/provider';

interface GigaChatChatSettings {
    /**
     * Whether to enable profanity/content filtering.
     */
    profanityCheck?: boolean;
    /**
     * Repetition penalty for words (GigaChat-specific).
     */
    repetitionPenalty?: number;
    /**
     * Update interval for streaming responses, in seconds.
     */
    updateInterval?: number;
    /**
     * Feature flags to pass to the GigaChat API.
     */
    flags?: string[];
}

declare const GigaChat: any;

interface GigaChatProviderSettings {
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
interface GigaChatProvider {
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
declare function createGigaChat(options?: GigaChatProviderSettings): GigaChatProvider;

interface GigaChatChatConfig {
    provider: string;
    getClient: () => any;
    modelSettings?: GigaChatChatSettings;
}
/**
 * AI SDK LanguageModel backed by the gigachat-js client.
 * Supports both V2 (ai@5 / OpenCode) and V3 (ai@6+) specs.
 */
declare class GigaChatChatLanguageModel {
    readonly specificationVersion: string;
    readonly supportedUrls: Record<string, RegExp[]>;
    readonly modelId: string;
    readonly provider: string;
    private readonly config;
    private readonly isV2;
    private toolCallCounter;
    constructor(modelId: string, config: GigaChatChatConfig, specVersion?: 'v2' | 'v3');
    private _buildPayload;
    private _mapUsage;
    private _mapFinishReason;
    private _makeToolCallInput;
    doGenerate(options: any): Promise<any>;
    doStream(options: any): Promise<any>;
}

/**
 * GigaChat message format.
 *
 * Key differences from OpenAI:
 * - Tool results use role 'function' (not 'tool')
 * - Assistant tool use is via 'function_call' (not 'tool_calls')
 * - function_call.arguments is a parsed object, not a JSON string
 */
interface GigaChatMessage {
    role: 'system' | 'user' | 'assistant' | 'function';
    content?: string;
    name?: string;
    function_call?: {
        name: string;
        arguments: Record<string, unknown>;
    };
}
declare function convertToGigaChatChatMessages(prompt: LanguageModelV3Prompt): GigaChatMessage[];

/**
 * Maps GigaChat finish_reason to AI SDK finish reason string.
 *
 * GigaChat reasons: 'stop', 'length', 'function_call', 'blacklist', 'error'
 */
declare function mapGigaChatFinishReason(raw: string | null | undefined): string;

interface GigaChatFunction {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
}
interface GigaChatPreparedTools {
    functions: GigaChatFunction[] | undefined;
    functionCall: string | {
        name: string;
    } | undefined;
    toolWarnings: SharedV3Warning[];
}
/**
 * Converts AI SDK tool definitions to GigaChat function format.
 *
 * GigaChat uses the older "functions" API (not "tools"), so we convert
 * AI SDK tool definitions into GigaChat-compatible function definitions.
 */
declare function gigaChatPrepareTools(tools: Array<LanguageModelV3FunctionTool | LanguageModelV3ProviderTool> | undefined, toolChoice: LanguageModelV3ToolChoice | undefined): GigaChatPreparedTools;

declare const VERSION: string;

export { GigaChatChatLanguageModel, type GigaChatChatSettings, type GigaChatProvider, type GigaChatProviderSettings, VERSION, convertToGigaChatChatMessages, createGigaChat, createGigaChat as default, gigaChatPrepareTools, mapGigaChatFinishReason };
