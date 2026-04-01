import { describe, it, expect, vi, afterEach } from 'vitest';
import { createGigaChat, GigaChatChatLanguageModel } from '../src/index.js';

// Mock gigachat module — overridable per test via _chatHandler / _streamHandler
let _chatHandler: ((payload: any) => any) | null = null;
let _streamHandler: ((payload: any) => AsyncGenerator<any>) | null = null;

vi.mock('gigachat', () => {
  return {
    default: class MockGigaChat {
      _config: any;
      constructor(config: any) {
        this._config = config;
      }
      async chat(payload: any) {
        if (_chatHandler) return _chatHandler(payload);
        return {
          choices: [
            {
              message: { role: 'assistant', content: 'Hello from GigaChat!' },
              finish_reason: 'stop',
              index: 0,
            },
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 5,
            total_tokens: 15,
          },
          model: payload.model,
          created: 1700000000,
          id: 'test-id',
        };
      }
      async *stream(payload: any) {
        if (_streamHandler) {
          yield* _streamHandler(payload);
          return;
        }
        yield {
          choices: [{ delta: { content: 'Hello' }, index: 0 }],
          model: payload.model,
          created: 1700000000,
          id: 'test-id',
        };
        yield {
          choices: [{ delta: { content: ' world' }, index: 0 }],
          model: payload.model,
          created: 1700000000,
          id: 'test-id',
        };
        yield {
          choices: [{ delta: {}, finish_reason: 'stop', index: 0 }],
          usage: {
            prompt_tokens: 5,
            completion_tokens: 2,
            total_tokens: 7,
          },
          model: payload.model,
          created: 1700000000,
          id: 'test-id',
        };
      }
    },
  };
});

describe('createGigaChat', () => {
  it('creates a callable provider', () => {
    const gigachat = createGigaChat({ credentials: 'test-key' });
    expect(typeof gigachat).toBe('function');
    expect(typeof gigachat.languageModel).toBe('function');
    expect(typeof gigachat.chat).toBe('function');
  });

  it('returns GigaChatChatLanguageModel instances', () => {
    const gigachat = createGigaChat({ credentials: 'test-key' });
    const model = gigachat('GigaChat');
    expect(model).toBeInstanceOf(GigaChatChatLanguageModel);
    expect(model.modelId).toBe('GigaChat');
    expect(model.provider).toBe('gigachat');
    expect(model.specificationVersion).toBe('v3');
  });

  it('supports custom provider name', () => {
    const gigachat = createGigaChat({
      credentials: 'test-key',
      name: 'my-giga',
    });
    const model = gigachat('GigaChat-Pro');
    expect(model.provider).toBe('my-giga');
  });

  it('exposes the underlying client', () => {
    const gigachat = createGigaChat({ credentials: 'test-key' });
    expect(gigachat.client).toBeDefined();
  });

  it('throws NoSuchModelError for embeddingModel', () => {
    const gigachat = createGigaChat({ credentials: 'test-key' });
    expect(() => gigachat.embeddingModel('x')).toThrow();
  });

  it('throws NoSuchModelError for imageModel', () => {
    const gigachat = createGigaChat({ credentials: 'test-key' });
    expect(() => gigachat.imageModel('x')).toThrow();
  });
});

describe('GigaChatChatLanguageModel.doGenerate', () => {
  afterEach(() => {
    _chatHandler = null;
  });

  it('generates text using gigachat-js client', async () => {
    const gigachat = createGigaChat({ credentials: 'test-key' });
    const model = gigachat('GigaChat');

    const result = await model.doGenerate({
      prompt: [
        { role: 'user', content: [{ type: 'text', text: 'Hi' }] },
      ],
    });

    expect(result.content).toEqual([
      { type: 'text', text: 'Hello from GigaChat!' },
    ]);
    expect(result.finishReason).toEqual({ unified: 'stop', raw: 'stop' });
    expect(result.usage.inputTokens.total).toBe(10);
    expect(result.usage.outputTokens.total).toBe(5);
  });

  it('returns parsed object for tool call input', async () => {
    _chatHandler = (payload: any) => ({
      choices: [
        {
          message: {
            role: 'assistant',
            content: '',
            function_call: {
              name: 'get_weather',
              arguments: { city: 'Moscow' },
            },
          },
          finish_reason: 'function_call',
          index: 0,
        },
      ],
      usage: { prompt_tokens: 5, completion_tokens: 3 },
      model: payload.model,
      created: 1700000000,
      id: 'test-fc',
    });

    const gigachat = createGigaChat({ credentials: 'test-key' });
    const model = gigachat('GigaChat');

    const result = await model.doGenerate({
      prompt: [
        { role: 'user', content: [{ type: 'text', text: 'Weather?' }] },
      ],
    });

    const toolCall = result.content.find((c) => c.type === 'tool-call');
    expect(toolCall).toBeDefined();
    expect(toolCall!.type).toBe('tool-call');
    // input should be a parsed object, not a JSON string
    expect((toolCall as any).input).toEqual({ city: 'Moscow' });
    expect(result.finishReason).toEqual({ unified: 'tool-calls', raw: 'function_call' });
  });

  it('parses string arguments in tool call response', async () => {
    _chatHandler = (payload: any) => ({
      choices: [
        {
          message: {
            role: 'assistant',
            content: '',
            function_call: {
              name: 'search',
              arguments: '{"query":"test"}',
            },
          },
          finish_reason: 'function_call',
          index: 0,
        },
      ],
      usage: { prompt_tokens: 5, completion_tokens: 3 },
      model: payload.model,
      created: 1700000000,
      id: 'test-fc-str',
    });

    const gigachat = createGigaChat({ credentials: 'test-key' });
    const model = gigachat('GigaChat');

    const result = await model.doGenerate({
      prompt: [
        { role: 'user', content: [{ type: 'text', text: 'Search' }] },
      ],
    });

    const toolCall = result.content.find((c) => c.type === 'tool-call');
    expect((toolCall as any).input).toEqual({ query: 'test' });
  });

  it('throws when no choices returned', async () => {
    _chatHandler = () => ({ choices: [], usage: {} });

    const gigachat = createGigaChat({ credentials: 'test-key' });
    const model = gigachat('GigaChat');

    await expect(
      model.doGenerate({
        prompt: [
          { role: 'user', content: [{ type: 'text', text: 'Hi' }] },
        ],
      }),
    ).rejects.toThrow('GigaChat returned no choices');
  });

  it('warns about unsupported options', async () => {
    const gigachat = createGigaChat({ credentials: 'test-key' });
    const model = gigachat('GigaChat');

    const result = await model.doGenerate({
      prompt: [
        { role: 'user', content: [{ type: 'text', text: 'Hi' }] },
      ],
      topK: 10,
      frequencyPenalty: 0.5,
      presencePenalty: 0.5,
      seed: 42,
    });

    const features = result.warnings
      .filter((w) => w.type === 'unsupported')
      .map((w) => (w as any).feature);
    expect(features).toContain('topK');
    expect(features).toContain('frequencyPenalty');
    expect(features).toContain('presencePenalty');
    expect(features).toContain('seed');
  });

  it('warns about non-text user message parts', async () => {
    const gigachat = createGigaChat({ credentials: 'test-key' });
    const model = gigachat('GigaChat');

    const result = await model.doGenerate({
      prompt: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Look at this' },
            { type: 'image', image: new Uint8Array(), mimeType: 'image/png' },
          ],
        },
      ],
    });

    const imageWarning = result.warnings.find(
      (w) => w.type === 'unsupported' && (w as any).feature?.includes('image'),
    );
    expect(imageWarning).toBeDefined();
  });

  it('generates unique tool call IDs across calls', async () => {
    _chatHandler = (payload: any) => ({
      choices: [
        {
          message: {
            role: 'assistant',
            function_call: { name: 'f', arguments: {} },
          },
          finish_reason: 'function_call',
          index: 0,
        },
      ],
      usage: {},
      model: payload.model,
      created: 1700000000,
      id: 'test-id',
    });

    const gigachat = createGigaChat({ credentials: 'test-key' });
    const model = gigachat('GigaChat');
    const prompt = [
      { role: 'user' as const, content: [{ type: 'text' as const, text: 'Hi' }] },
    ];

    const r1 = await model.doGenerate({ prompt });
    const r2 = await model.doGenerate({ prompt });

    const id1 = (r1.content.find((c) => c.type === 'tool-call') as any).toolCallId;
    const id2 = (r2.content.find((c) => c.type === 'tool-call') as any).toolCallId;
    expect(id1).not.toBe(id2);
  });
});

describe('GigaChatChatLanguageModel.doStream', () => {
  afterEach(() => {
    _streamHandler = null;
  });

  it('streams text using gigachat-js client', async () => {
    const gigachat = createGigaChat({ credentials: 'test-key' });
    const model = gigachat('GigaChat');

    const { stream } = await model.doStream({
      prompt: [
        { role: 'user', content: [{ type: 'text', text: 'Hi' }] },
      ],
    });

    const reader = stream.getReader();
    const chunks: any[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    const types = chunks.map((c) => c.type);
    expect(types).toContain('stream-start');
    expect(types).toContain('response-metadata');
    expect(types).toContain('text-start');
    expect(types).toContain('text-delta');
    expect(types).toContain('text-end');
    expect(types).toContain('finish');

    const textDeltas = chunks
      .filter((c: any) => c.type === 'text-delta')
      .map((c: any) => c.delta);
    expect(textDeltas).toEqual(['Hello', ' world']);

    const finish = chunks.find((c: any) => c.type === 'finish');
    expect(finish.finishReason).toEqual({ unified: 'stop', raw: 'stop' });
    expect(finish.usage.inputTokens.total).toBe(5);
  });

  it('streams function call with parsed input', async () => {
    _streamHandler = async function* (payload: any) {
      yield {
        choices: [
          {
            delta: {
              function_call: {
                name: 'get_weather',
                arguments: { city: 'Moscow' },
              },
            },
            finish_reason: 'function_call',
            index: 0,
          },
        ],
        usage: { prompt_tokens: 3, completion_tokens: 2 },
        model: payload.model,
        created: 1700000000,
        id: 'test-stream-fc',
      };
    };

    const gigachat = createGigaChat({ credentials: 'test-key' });
    const model = gigachat('GigaChat');

    const { stream } = await model.doStream({
      prompt: [
        { role: 'user', content: [{ type: 'text', text: 'Weather?' }] },
      ],
    });

    const reader = stream.getReader();
    const chunks: any[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    const toolCall = chunks.find((c: any) => c.type === 'tool-call');
    expect(toolCall).toBeDefined();
    expect(toolCall.toolName).toBe('get_weather');
    // input should be a parsed object
    expect(toolCall.input).toEqual({ city: 'Moscow' });

    const toolDelta = chunks.find((c: any) => c.type === 'tool-input-delta');
    expect(toolDelta).toBeDefined();
    // delta should be a string
    expect(typeof toolDelta.delta).toBe('string');

    const finish = chunks.find((c: any) => c.type === 'finish');
    expect(finish.finishReason).toEqual({
      unified: 'tool-calls',
      raw: 'function_call',
    });
  });
});
