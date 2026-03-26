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
      functions.push({
        name: tool.name,
        description: tool.description ?? '',
        parameters: tool.inputSchema ?? { type: 'object', properties: {} },
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
