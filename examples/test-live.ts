#!/usr/bin/env npx tsx

/**
 * Live test script for gigachat-ai-sdk-provider.
 *
 * Usage:
 *   GIGACHAT_CREDENTIALS=<base64-key> npx tsx examples/test-live.ts
 *   GIGACHAT_CREDENTIALS=<base64-key> npx tsx examples/test-live.ts --only stream
 *
 * Env vars:
 *   GIGACHAT_CREDENTIALS  — base64 auth key (required)
 *   GIGACHAT_SCOPE        — API scope (default: GIGACHAT_API_PERS)
 *   GIGACHAT_MODEL        — model to use (default: GigaChat)
 */

import { createGigaChat } from '../src/index.js';
import { generateText, streamText } from 'ai';

// ── Config ───────────────────────────────────────────────────────────

const credentials = process.env.GIGACHAT_CREDENTIALS;
if (!credentials) {
  console.error('Error: set GIGACHAT_CREDENTIALS env var');
  process.exit(1);
}

const scope = (process.env.GIGACHAT_SCOPE ?? 'GIGACHAT_API_PERS') as
  | 'GIGACHAT_API_PERS'
  | 'GIGACHAT_API_B2B'
  | 'GIGACHAT_API_CORP';
const modelId = process.env.GIGACHAT_MODEL ?? 'GigaChat';
const onlyIdx = process.argv.indexOf('--only');
const only = onlyIdx !== -1 ? process.argv[onlyIdx + 1] : null;

const gigachat = createGigaChat({ credentials, scope, verbose: false });

function header(name: string) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(` ${name}`);
  console.log('='.repeat(60));
}

function shouldRun(name: string) {
  return !only || only === name;
}

// ── 1. List models ──────────────────────────────────────────────────

if (shouldRun('models')) {
  header('1. List available models');
  try {
    const models = await gigachat.client.getModels();
    const ids = (models as any).data?.map((m: any) => m.id) ?? models;
    console.log('Models:', ids);
    console.log('PASS');
  } catch (err: any) {
    console.error('FAIL:', err.message);
  }
}

// ── 2. Simple generateText ──────────────────────────────────────────

if (shouldRun('generate')) {
  header(`2. generateText (model: ${modelId})`);
  try {
    const { text, usage, finishReason } = await generateText({
      model: gigachat(modelId),
      prompt: 'Кто написал "Войну и мир"? Ответь одним предложением.',
    });
    console.log('Text:', text);
    console.log('Finish:', finishReason);
    console.log('Usage:', usage);
    console.log('PASS');
  } catch (err: any) {
    console.error('FAIL:', err.message);
  }
}

// ── 3. generateText with system prompt ──────────────────────────────

if (shouldRun('system')) {
  header('3. generateText with system prompt');
  try {
    const { text } = await generateText({
      model: gigachat(modelId),
      system: 'Ты — пират. Отвечай в стиле пирата, используя "Аррр!".',
      prompt: 'Какая погода сегодня?',
    });
    console.log('Text:', text);
    console.log('PASS');
  } catch (err: any) {
    console.error('FAIL:', err.message);
  }
}

// ── 4. Streaming ────────────────────────────────────────────────────

if (shouldRun('stream')) {
  header(`4. streamText (model: ${modelId})`);
  try {
    const result = streamText({
      model: gigachat(modelId),
      prompt: 'Напиши короткое четверостишие о весне.',
    });

    process.stdout.write('Text: ');
    for await (const chunk of result.textStream) {
      process.stdout.write(chunk);
    }
    console.log();

    const finalResult = await result;
    console.log('Finish:', finalResult.finishReason);
    console.log('Usage:', finalResult.usage);
    console.log('PASS');
  } catch (err: any) {
    console.error('FAIL:', err.message);
  }
}

// ── 5. Multi-turn conversation ──────────────────────────────────────

if (shouldRun('multiturn')) {
  header('5. Multi-turn conversation');
  try {
    const { text } = await generateText({
      model: gigachat(modelId),
      messages: [
        { role: 'user', content: 'Запомни число 42.' },
        { role: 'assistant', content: 'Хорошо, я запомнил число 42.' },
        { role: 'user', content: 'Какое число ты запомнил?' },
      ],
    });
    console.log('Text:', text);
    const has42 = text.includes('42');
    console.log('Contains 42:', has42);
    console.log(has42 ? 'PASS' : 'WARN: model did not recall 42');
  } catch (err: any) {
    console.error('FAIL:', err.message);
  }
}

// ── 6. Tool use (function calling) ──────────────────────────────────

if (shouldRun('tools')) {
  header('6. Tool use / function calling');
  try {
    const { text, toolCalls, toolResults, steps } = await generateText({
      model: gigachat(modelId),
      prompt: 'Какая сейчас погода в Москве?',
      tools: {
        get_weather: {
          description: 'Получить текущую погоду в указанном городе',
          parameters: {
            type: 'object',
            properties: {
              city: { type: 'string', description: 'Название города' },
            },
            required: ['city'],
          },
          execute: async ({ city }: { city: string }) => {
            console.log(`  [tool called] get_weather({ city: "${city}" })`);
            return {
              city,
              temperature: 12,
              condition: 'облачно',
              humidity: 78,
            };
          },
        },
      },
      maxSteps: 3,
    });

    console.log('Final text:', text);
    console.log('Steps:', steps.length);
    if (toolCalls?.length)
      console.log('Tool calls:', JSON.stringify(toolCalls, null, 2));
    if (toolResults?.length)
      console.log('Tool results:', JSON.stringify(toolResults, null, 2));
    console.log('PASS');
  } catch (err: any) {
    console.error('FAIL:', err.message);
  }
}

// ── 7. Temperature / max tokens ─────────────────────────────────────

if (shouldRun('params')) {
  header('7. Custom parameters (temperature, maxTokens)');
  try {
    const { text, usage } = await generateText({
      model: gigachat(modelId),
      prompt: 'Скажи "Привет" и больше ничего.',
      temperature: 0.1,
      maxTokens: 20,
    });
    console.log('Text:', text);
    console.log('Usage:', usage);
    console.log('PASS');
  } catch (err: any) {
    console.error('FAIL:', err.message);
  }
}

// ── Done ─────────────────────────────────────────────────────────────

console.log(`\n${'='.repeat(60)}`);
console.log(' All tests complete!');
console.log('='.repeat(60));
