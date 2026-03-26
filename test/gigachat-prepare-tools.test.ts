import { describe, it, expect } from 'vitest';
import { gigaChatPrepareTools } from '../src/chat/gigachat-prepare-tools.js';

describe('gigaChatPrepareTools', () => {
  it('returns undefined when no tools provided', () => {
    const result = gigaChatPrepareTools(undefined, undefined);
    expect(result.functions).toBeUndefined();
    expect(result.functionCall).toBeUndefined();
    expect(result.toolWarnings).toEqual([]);
  });

  it('converts function tools to GigaChat functions', () => {
    const result = gigaChatPrepareTools(
      [
        {
          type: 'function',
          name: 'get_weather',
          description: 'Get current weather',
          inputSchema: {
            type: 'object',
            properties: { city: { type: 'string' } },
            required: ['city'],
          },
        },
      ],
      undefined,
    );

    expect(result.functions).toEqual([
      {
        name: 'get_weather',
        description: 'Get current weather',
        parameters: {
          type: 'object',
          properties: { city: { type: 'string' } },
          required: ['city'],
        },
      },
    ]);
  });

  it('handles toolChoice auto', () => {
    const result = gigaChatPrepareTools(
      [{ type: 'function', name: 'f', inputSchema: {} }],
      { type: 'auto' },
    );
    expect(result.functionCall).toBe('auto');
  });

  it('handles toolChoice none', () => {
    const result = gigaChatPrepareTools(
      [{ type: 'function', name: 'f', inputSchema: {} }],
      { type: 'none' },
    );
    expect(result.functionCall).toBe('none');
  });

  it('handles toolChoice with specific tool', () => {
    const result = gigaChatPrepareTools(
      [{ type: 'function', name: 'search', inputSchema: {} }],
      { type: 'tool', toolName: 'search' },
    );
    expect(result.functionCall).toEqual({ name: 'search' });
  });

  it('warns about unsupported tool types', () => {
    const result = gigaChatPrepareTools(
      [{ type: 'provider', id: 'x.y', name: 'r', args: {} }],
      undefined,
    );
    expect(result.functions).toBeUndefined();
    expect(result.toolWarnings.length).toBe(1);
    expect(result.toolWarnings[0].type).toBe('unsupported');
  });
});
