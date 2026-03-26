import { describe, it, expect } from 'vitest';
import { mapGigaChatFinishReason } from '../src/chat/map-gigachat-finish-reason.js';

describe('mapGigaChatFinishReason', () => {
  it('maps "stop"', () => {
    expect(mapGigaChatFinishReason('stop')).toEqual({
      unified: 'stop',
      raw: 'stop',
    });
  });

  it('maps "length"', () => {
    expect(mapGigaChatFinishReason('length')).toEqual({
      unified: 'length',
      raw: 'length',
    });
  });

  it('maps "function_call" to "tool-calls"', () => {
    expect(mapGigaChatFinishReason('function_call')).toEqual({
      unified: 'tool-calls',
      raw: 'function_call',
    });
  });

  it('maps "blacklist" to "content-filter"', () => {
    expect(mapGigaChatFinishReason('blacklist')).toEqual({
      unified: 'content-filter',
      raw: 'blacklist',
    });
  });

  it('maps "error"', () => {
    expect(mapGigaChatFinishReason('error')).toEqual({
      unified: 'error',
      raw: 'error',
    });
  });

  it('maps unknown reasons to "other"', () => {
    expect(mapGigaChatFinishReason('something')).toEqual({
      unified: 'other',
      raw: 'something',
    });
  });

  it('maps null/undefined to "other"', () => {
    expect(mapGigaChatFinishReason(null)).toEqual({
      unified: 'other',
      raw: undefined,
    });
    expect(mapGigaChatFinishReason(undefined)).toEqual({
      unified: 'other',
      raw: undefined,
    });
  });
});
