import { createGigaChat } from '../src/index.js';
import { generateText, streamText } from 'ai';

// Create provider — credentials come from GIGACHAT_CREDENTIALS env var by default
const gigachat = createGigaChat({
  // credentials: 'your-base64-key',   // or set GIGACHAT_CREDENTIALS env var
  // scope: 'GIGACHAT_API_PERS',       // personal tier (default)
});

// --- Non-streaming ---
const { text } = await generateText({
  model: gigachat('GigaChat'),
  prompt: 'What is the capital of France?',
});
console.log('Response:', text);

// --- Streaming ---
const result = streamText({
  model: gigachat('GigaChat-Pro'),
  prompt: 'Write a short poem about Moscow.',
});

for await (const chunk of result.textStream) {
  process.stdout.write(chunk);
}
console.log();

// --- With tools ---
const { text: toolResult } = await generateText({
  model: gigachat('GigaChat'),
  prompt: 'What is the weather in Moscow?',
  tools: {
    get_weather: {
      description: 'Get current weather for a city',
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: 'City name' },
        },
        required: ['city'],
      },
      execute: async ({ city }: { city: string }) => ({
        city,
        temp: 15,
        condition: 'cloudy',
      }),
    },
  },
  maxSteps: 3,
});
console.log('Tool result:', toolResult);

// --- Access underlying gigachat-js client for advanced features ---
const models = await gigachat.client.getModels();
console.log('Available models:', models);
