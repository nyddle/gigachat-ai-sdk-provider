import { describe, it, expect, vi } from 'vitest';
import { createGigaChat, GigaChatChatLanguageModel } from '../src/index.js';

// Mock gigachat module
vi.mock('gigachat', () => {
  return {
    default: class MockGigaChat {
      _config: any;
      constructor(config: any) {
        this._config = config;
      }
      async chat(payload: any) {
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
});

describe('GigaChatChatLanguageModel.doStream', () => {
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
});
