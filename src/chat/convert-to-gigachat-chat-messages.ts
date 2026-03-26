import type { LanguageModelV3Prompt } from '@ai-sdk/provider';

/**
 * GigaChat message format.
 *
 * Key differences from OpenAI:
 * - Tool results use role 'function' (not 'tool')
 * - Assistant tool use is via 'function_call' (not 'tool_calls')
 * - function_call.arguments is a parsed object, not a JSON string
 */
export interface GigaChatMessage {
  role: 'system' | 'user' | 'assistant' | 'function';
  content?: string;
  name?: string;
  function_call?: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

export function convertToGigaChatChatMessages(
  prompt: LanguageModelV3Prompt,
): GigaChatMessage[] {
  const messages: GigaChatMessage[] = [];

  for (const message of prompt) {
    switch (message.role) {
      case 'system': {
        messages.push({ role: 'system', content: message.content });
        break;
      }

      case 'user': {
        const text = message.content
          .filter((p) => p.type === 'text')
          .map((p) => p.text)
          .join('');

        if (text) {
          messages.push({ role: 'user', content: text });
        }
        break;
      }

      case 'assistant': {
        let text = '';
        let functionCall: GigaChatMessage['function_call'] = undefined;

        for (const part of message.content) {
          if (part.type === 'text') {
            text += part.text;
          } else if (part.type === 'tool-call') {
            const args = part.input;
            functionCall = {
              name: part.toolName,
              arguments:
                typeof args === 'string' ? JSON.parse(args) : (args as Record<string, unknown>),
            };
          }
        }

        const msg: GigaChatMessage = {
          role: 'assistant',
          content: text || undefined,
        };
        if (functionCall) {
          msg.function_call = functionCall;
        }
        messages.push(msg);
        break;
      }

      case 'tool': {
        for (const part of message.content) {
          if (part.type !== 'tool-result') continue;

          const output = part.output;
          let content: string;

          if (output == null) {
            content = '';
          } else if (typeof output === 'string') {
            content = output;
          } else if (typeof output === 'object' && 'type' in output) {
            const typed = output as { type: string; value?: unknown };
            switch (typed.type) {
              case 'text':
              case 'error-text':
                content = String(typed.value);
                break;
              case 'json':
              case 'error-json':
              case 'content':
                content = JSON.stringify(typed.value);
                break;
              default:
                content = JSON.stringify(output);
            }
          } else {
            content = JSON.stringify(output);
          }

          messages.push({
            role: 'function',
            name: part.toolName,
            content,
          });
        }
        break;
      }
    }
  }

  return messages;
}
