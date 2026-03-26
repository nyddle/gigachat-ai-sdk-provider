import type {
  LanguageModelV3FunctionTool,
  LanguageModelV3ProviderTool,
  LanguageModelV3ToolChoice,
  SharedV3Warning,
} from '@ai-sdk/provider';

export interface GigaChatFunction {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface GigaChatPreparedTools {
  functions: GigaChatFunction[] | undefined;
  functionCall: string | { name: string } | undefined;
  toolWarnings: SharedV3Warning[];
}

/**
 * Converts AI SDK tool definitions to GigaChat function format.
 *
 * GigaChat uses the older "functions" API (not "tools"), so we convert
 * AI SDK tool definitions into GigaChat-compatible function definitions.
 */
export function gigaChatPrepareTools(
  tools: Array<LanguageModelV3FunctionTool | LanguageModelV3ProviderTool> | undefined,
  toolChoice: LanguageModelV3ToolChoice | undefined,
): GigaChatPreparedTools {
  const toolWarnings: SharedV3Warning[] = [];

  if (!tools?.length) {
    return { functions: undefined, functionCall: undefined, toolWarnings };
  }

  const functions: GigaChatFunction[] = [];

  for (const tool of tools) {
    if (tool.type === 'function') {
      const schema = tool.inputSchema ?? { type: 'object', properties: {} };

      // Warn when the schema looks empty — this typically happens when
      // tool() is called with a zod v4 `parameters` key instead of
      // `inputSchema` + `jsonSchema()`.  The AI SDK serialises such
      // schemas as {"properties":{},"additionalProperties":false}, which
      // makes GigaChat ignore every parameter the tool should receive.
      const props = (schema as Record<string, unknown>).properties;
      if (
        props &&
        typeof props === 'object' &&
        Object.keys(props).length === 0
      ) {
        toolWarnings.push({
          type: 'other',
          message:
            `Tool "${tool.name}" has an empty inputSchema — parameters will not be sent to the model. ` +
            'If you defined the tool with a zod `parameters` key, switch to ' +
            '`inputSchema: jsonSchema(…)` instead (AI SDK v6 + zod v4 compatibility issue).',
        });
      }

      functions.push({
        name: tool.name,
        description: tool.description ?? '',
        parameters: schema,
      });
    } else {
      toolWarnings.push({
        type: 'unsupported',
        feature: `tool type "${tool.type}"`,
      });
    }
  }

  if (functions.length === 0) {
    return { functions: undefined, functionCall: undefined, toolWarnings };
  }

  let functionCall: string | { name: string } | undefined = undefined;

  if (toolChoice) {
    switch (toolChoice.type) {
      case 'auto':
        functionCall = 'auto';
        break;
      case 'none':
        functionCall = 'none';
        break;
      case 'required':
        // GigaChat doesn't have "required" — use "auto" as approximation
        functionCall = 'auto';
        toolWarnings.push({
          type: 'unsupported',
          feature: 'toolChoice.required',
          details: 'GigaChat does not support required tool choice, using auto',
        });
        break;
      case 'tool':
        functionCall = { name: toolChoice.toolName };
        break;
    }
  }

  return { functions, functionCall, toolWarnings };
}
