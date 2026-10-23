// Find a local AI engine and, if needed, download the recommended model through it.

import { LOCAL_SERVERS, listLocalModels } from './providers/local-server.js';

// The model that did best in our tests on an 8 GB laptop (see RESULTS.md, section 8):
// Gemma 4 E2B (Apache 2.0). Most right answers, fewest wrong ones, fastest, ~2.2 GB of memory.
// The GGUF file runs on Ollama's llama.cpp engine.
export const RECOMMENDED_MODEL = { name: 'hf.co/unsloth/gemma-4-E2B-it-qat-GGUF:UD-Q4_K_XL', label: 'Gemma 4 (E2B)', size: '3.6 GB' };

// Models that are not chat models, or that did badly in our tests.
const HIDDEN = /embed|nomic|^qwen3:4b/i;

/**
 * Look for running engines.
 * Returns { engines: [{ name, url, models: [...] }], hasRecommended }.
 */
export async function findEngines() {
  const engines = [];
  for (const server of LOCAL_SERVERS) {
    const models = await listLocalModels(server.url);
    if (!models) continue;
    const chatModels = models.filter((m) => !HIDDEN.test(m));
    engines.push({ name: server.name, url: server.url, models: chatModels });
  }
  const allModels = engines.flatMap((e) => e.models);
  const hasRecommended = allModels.some((m) => m.startsWith(RECOMMENDED_MODEL.name));
  return { engines, hasRecommended };
}

/** Read Ollama's streamed lines (one JSON object per line). */
async function* readJsonLines(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      if (line.trim()) yield JSON.parse(line);
    }
  }
}

/**
 * Ask Ollama to download a model. `onProgress(fraction, text)` is called as it goes.
 * Only Ollama can do this (llama.cpp has no download API).
 */
export async function downloadModel(ollamaUrl, model, onProgress) {
  const body = JSON.stringify({ model, stream: true });
  const response = await fetch(`${ollamaUrl}/api/pull`, { method: 'POST', body });
  if (!response.ok) throw new Error(`Download failed: ${response.status}`);
  for await (const event of readJsonLines(response)) {
    if (event.error) throw new Error(event.error);
    const fraction = event.total ? event.completed / event.total : null;
    onProgress(fraction, event.status);
  }
}
