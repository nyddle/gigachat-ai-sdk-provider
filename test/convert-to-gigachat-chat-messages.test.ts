import { describe, it, expect } from 'vitest';
import { convertToGigaChatChatMessages } from '../src/chat/convert-to-gigachat-chat-messages.js';
import type { LanguageModelV3Prompt } from '@ai-sdk/provider';

describe('convertToGigaChatChatMessages', () => {
  it('converts system messages', () => {
    const prompt: LanguageModelV3Prompt = [
      { role: 'system', content: 'You are helpful.' },
    ];
    expect(convertToGigaChatChatMessages(prompt)).toEqual([
      { role: 'system', content: 'You are helpful.' },
    ]);
  });

  it('converts user messages with text parts', () => {
    const prompt: LanguageModelV3Prompt = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Hello ' },
          { type: 'text', text: 'world' },
        ],
      },
    ];
    expect(convertToGigaChatChatMessages(prompt)).toEqual([
      { role: 'user', content: 'Hello world' },
    ]);
  });

  it('converts assistant messages with text', () => {
    const prompt: LanguageModelV3Prompt = [
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'Hi there' }],
      },
    ];
    expect(convertToGigaChatChatMessages(prompt)).toEqual([
      { role: 'assistant', content: 'Hi there' },
    ]);
  });

  it('converts assistant messages with tool calls', () => {
    const prompt: LanguageModelV3Prompt = [
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'call_1',
            toolName: 'get_weather',
            input: { city: 'Moscow' },
          },
        ],
      },
    ];
    expect(convertToGigaChatChatMessages(prompt)).toEqual([
      {
        role: 'assistant',
        content: undefined,
        function_call: {
          name: 'get_weather',
          arguments: { city: 'Moscow' },
        },
      },
    ]);
  });

  it('converts tool results to function role', () => {
    const prompt: LanguageModelV3Prompt = [
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'call_1',
            toolName: 'get_weather',
            output: { temp: 15 },
          },
        ],
      },
    ];
    expect(convertToGigaChatChatMessages(prompt)).toEqual([
      {
        role: 'function',
        name: 'get_weather',
        content: '{"temp":15}',
      },
    ]);
  });

  it('converts string tool output', () => {
    const prompt: LanguageModelV3Prompt = [
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'call_1',
            toolName: 'ping',
            output: 'pong',
          },
        ],
      },
    ];
    expect(convertToGigaChatChatMessages(prompt)).toEqual([
      { role: 'function', name: 'ping', content: 'pong' },
    ]);
  });
});
