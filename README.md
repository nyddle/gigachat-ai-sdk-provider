# gigachat-ai-sdk-provider

[Vercel AI SDK](https://sdk.vercel.ai/) provider for [GigaChat](https://developers.sber.ru/docs/ru/gigachat/overview) — powered by [gigachat-js](https://github.com/ai-forever/gigachat-js).

Implements the AI SDK **ProviderV3** / **LanguageModelV3** specification. Built with TypeScript, ships CJS + ESM + type declarations.

## Installation

```bash
npm install gigachat-ai-sdk-provider ai
```

## Quick start

```ts
import { createGigaChat } from 'gigachat-ai-sdk-provider';
import { generateText } from 'ai';

const gigachat = createGigaChat({
  credentials: process.env.GIGACHAT_CREDENTIALS,
  scope: 'GIGACHAT_API_PERS',
});

const { text } = await generateText({
  model: gigachat('GigaChat'),
  prompt: 'What is the capital of France?',
});

console.log(text);
```

## Authentication

The provider delegates all authentication to the [`gigachat`](https://github.com/ai-forever/gigachat-js) npm package, which supports three methods:

| Method | Config | Description |
|--------|--------|-------------|
| **OAuth credentials** | `credentials` | Base64-encoded authorization key from [GigaChat Studio](https://developers.sber.ru/studio/). This is the primary method. |
| **User / password** | `user`, `password` | Username + password authentication. |
| **Pre-obtained token** | `accessToken` | Supply a JWE access token directly — skips OAuth entirely. |

Token management (refresh, retry on 401) is handled automatically by gigachat-js.

### Environment variables

Instead of passing options directly, you can set environment variables. The `gigachat` package reads these automatically:

| Variable | Description |
|----------|-------------|
| `GIGACHAT_CREDENTIALS` | Base64 authorization key |
| `GIGACHAT_SCOPE` | API scope (`GIGACHAT_API_PERS`, `GIGACHAT_API_B2B`, `GIGACHAT_API_CORP`) |
| `GIGACHAT_BASE_URL` | Custom API base URL |
| `GIGACHAT_AUTH_URL` | Custom OAuth token URL |
| `GIGACHAT_ACCESS_TOKEN` | Pre-obtained access token |
| `GIGACHAT_MODEL` | Default model name |
| `GIGACHAT_TIMEOUT` | Request timeout in seconds |
| `GIGACHAT_USER` | Username for user/password auth |
| `GIGACHAT_PASSWORD` | Password for user/password auth |
| `GIGACHAT_FLAGS` | Feature flags |

## Provider options

```ts
const gigachat = createGigaChat({
  credentials: '...',           // Base64 authorization key
  scope: 'GIGACHAT_API_PERS',  // API scope (PERS / B2B / CORP)
  baseUrl: '...',               // Custom API base URL
  authUrl: '...',               // Custom OAuth token URL
  accessToken: '...',           // Pre-obtained JWE access token
  profanityCheck: false,        // Enable content filtering
  verbose: false,               // Enable debug logging
  timeout: 30,                  // Request timeout in seconds
  httpsAgent: agent,            // Custom HTTPS agent (e.g. for mTLS)
  user: '...',                  // Username for user/password auth
  password: '...',              // Password for user/password auth
  flags: [],                    // Feature flags
  name: 'gigachat',             // Provider name in AI SDK metadata
});
```

## Models

Pass any valid GigaChat model ID when creating a model instance:

```ts
gigachat('GigaChat')       // base model
gigachat('GigaChat-Pro')   // pro model
gigachat('GigaChat-Max')   // max model
```

You can also pass per-model settings (GigaChat-specific):

```ts
gigachat('GigaChat', {
  profanityCheck: true,
  repetitionPenalty: 1.1,
  updateInterval: 0.5,
  flags: ['some_flag'],
});
```

Discover available models at runtime:

```ts
const models = await gigachat.client.getModels();
console.log(models);
```

## Usage examples

### Text generation

```ts
import { generateText } from 'ai';

const { text, usage, finishReason } = await generateText({
  model: gigachat('GigaChat'),
  prompt: 'Explain quantum computing in one paragraph.',
});
```

### Streaming

```ts
import { streamText } from 'ai';

const result = streamText({
  model: gigachat('GigaChat'),
  prompt: 'Write a short poem about spring.',
});

for await (const chunk of result.textStream) {
  process.stdout.write(chunk);
}
```

### System prompt

```ts
const { text } = await generateText({
  model: gigachat('GigaChat'),
  system: 'You are a helpful assistant. Reply in Russian.',
  prompt: 'What is the weather like today?',
});
```

### Multi-turn conversation

```ts
const { text } = await generateText({
  model: gigachat('GigaChat'),
  messages: [
    { role: 'user', content: 'Remember the number 42.' },
    { role: 'assistant', content: 'Got it, I remembered 42.' },
    { role: 'user', content: 'What number did you remember?' },
  ],
});
```

### Tool use (function calling)

```ts
import { generateText } from 'ai';

const { text, toolCalls, toolResults } = await generateText({
  model: gigachat('GigaChat'),
  prompt: 'What is the weather in Moscow?',
  tools: {
    get_weather: {
      description: 'Get the current weather for a city',
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: 'City name' },
        },
        required: ['city'],
      },
      execute: async ({ city }) => ({
        city,
        temperature: 12,
        condition: 'cloudy',
      }),
    },
  },
  maxSteps: 3,
});
```

### Custom parameters

```ts
const { text } = await generateText({
  model: gigachat('GigaChat'),
  prompt: 'Say hello.',
  temperature: 0.1,
  maxTokens: 50,
  topP: 0.9,
});
```

### Accessing the underlying gigachat-js client

The provider exposes the raw `gigachat` client for features not covered by the AI SDK interface:

```ts
// Embeddings
const embeddings = await gigachat.client.embeddings(['Hello world']);

// Token count
const tokens = await gigachat.client.tokensCount(['Hello world']);

// Balance
const balance = await gigachat.client.balance();

// File upload
const file = await gigachat.client.uploadFile(buffer, 'general');
```

## GigaChat-specific behavior

This provider handles several GigaChat API differences from the OpenAI format:

| Feature | OpenAI | GigaChat |
|---------|--------|----------|
| Tool result role | `tool` | `function` |
| Tool calls field | `tool_calls` | `function_call` |
| Function arguments | JSON string | Parsed object |
| Content filter reason | — | `blacklist` (mapped to `content-filter`) |

## Supported AI SDK settings

| Setting | Supported |
|---------|-----------|
| `temperature` | Yes |
| `topP` | Yes |
| `maxTokens` | Yes |
| `stopSequences` | Yes |
| `tools` / `toolChoice` | Yes (via GigaChat functions API) |
| `topK` | No (warning emitted) |
| `frequencyPenalty` | No (warning emitted) |
| `presencePenalty` | No (warning emitted) |
| `seed` | No (warning emitted) |

## Project structure

```
src/
  index.ts                              # Barrel exports
  version.ts                            # Package version constant
  gigachat-provider.ts                  # createGigaChat() factory + ProviderV3
  chat/
    gigachat-chat-language-model.ts     # LanguageModelV3 implementation
    gigachat-chat-options.ts            # Per-model settings type
    convert-to-gigachat-chat-messages.ts
    map-gigachat-finish-reason.ts
    gigachat-prepare-tools.ts
test/                                   # Unit tests (vitest)
examples/
  basic.ts                              # Quick usage examples
  test-live.ts                          # Live integration test script
```

## Development

```bash
npm install
npm run build        # tsup → dist/ (CJS + ESM + .d.ts)
npm test             # vitest
npm run typecheck    # tsc --noEmit
```

## Running the live test script

```bash
GIGACHAT_CREDENTIALS=<your-base64-key> npx tsx examples/test-live.ts
```

Run a single test:

```bash
GIGACHAT_CREDENTIALS=<key> npx tsx examples/test-live.ts --only stream
GIGACHAT_CREDENTIALS=<key> npx tsx examples/test-live.ts --only tools
```

Available test names: `models`, `generate`, `system`, `stream`, `multiturn`, `tools`, `params`.

## License

MIT
