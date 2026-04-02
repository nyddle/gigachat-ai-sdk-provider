/**
 * Maps GigaChat finish_reason to AI SDK finish reason string.
 *
 * GigaChat reasons: 'stop', 'length', 'function_call', 'blacklist', 'error'
 */
export function mapGigaChatFinishReason(
  raw: string | null | undefined,
): string {
  if (!raw) return 'other';
  switch (raw) {
    case 'stop':
      return 'stop';
    case 'length':
      return 'length';
    case 'function_call':
      return 'tool-calls';
    case 'blacklist':
      return 'content-filter';
    case 'error':
      return 'error';
    default:
      return 'other';
  }
}
