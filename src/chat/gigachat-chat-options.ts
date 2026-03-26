export interface GigaChatChatSettings {
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
