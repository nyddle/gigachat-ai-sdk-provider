import type { LanguageModelV3FinishReason } from '@ai-sdk/provider';

/**
 * Maps GigaChat finish_reason to AI SDK V3 finish reason.
 *
 * GigaChat reasons: 'stop', 'length', 'function_call', 'blacklist', 'error'
 */
export function mapGigaChatFinishReason(
  raw: string | null | undefined,
): LanguageModelV3FinishReason {
  if (!raw) {
    return { unified: 'other', raw: raw ?? undefined };
  }

  switch (raw) {
    case 'stop':
      return { unified: 'stop', raw };
    case 'length':
      return { unified: 'length', raw };
    case 'function_call':
      return { unified: 'tool-calls', raw };
    case 'blacklist':
      return { unified: 'content-filter', raw };
    case 'error':
      return { unified: 'error', raw };
    default:
      return { unified: 'other', raw };
  }
}
