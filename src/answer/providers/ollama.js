// Ollama's own (native) API.
// The app answers through local-server.js (OpenAI-style API, works with Ollama and llama.cpp).
// This file is kept for the eval: unloading a model and measuring its load time.

export const OLLAMA_URL = 'http://localhost:11434';

/** Is Ollama running? Returns the list of model names, or null. */
export async function listOllamaModels(baseUrl = OLLAMA_URL) {
  try {
    const response = await fetch(`${baseUrl}/api/tags`);
    if (!response.ok) return null;
    const data = await response.json();
    return data.models.map((m) => m.name);
  } catch {
    return null;
  }
}

/** Ask Ollama to unload a model from memory (so we can measure a cold load). */
export async function unloadOllamaModel(model, baseUrl = OLLAMA_URL) {
  await fetch(`${baseUrl}/api/generate`, {
    method: 'POST',
    body: JSON.stringify({ model, keep_alive: 0 }),
  });
}

/** Read a streamed response line by line (Ollama sends one JSON object per line). */
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
  if (buffer.trim()) yield JSON.parse(buffer);
}

/**
 * Send messages to an Ollama model and stream the answer.
 * Returns { text, stats: { firstTokenMs, totalMs, tokens, tokensPerSec, loadMs } }
 */
export async function askOllama(model, messages, onToken, baseUrl = OLLAMA_URL) {
  const started = performance.now();
  const body = {
    model,
    messages,
    stream: true,
    think: false,
    options: { temperature: 0, num_ctx: 4096, num_predict: 300 },
  };
  const response = await fetch(`${baseUrl}/api/chat`, { method: 'POST', body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`Ollama error ${response.status}: ${await response.text()}`);

  let text = '';
  let firstTokenMs = null;
  let final = null;
  for await (const chunk of readJsonLines(response)) {
    const piece = chunk.message ? chunk.message.content : '';
    if (piece && firstTokenMs === null) firstTokenMs = performance.now() - started;
    text += piece;
    if (piece && onToken) onToken(piece);
    if (chunk.done) final = chunk;
  }

  const totalMs = performance.now() - started;
  const tokens = final ? final.eval_count : null;
  const evalSeconds = final ? final.eval_duration / 1e9 : null;
  const stats = {
    firstTokenMs,
    totalMs,
    tokens,
    tokensPerSec: tokens && evalSeconds ? tokens / evalSeconds : null,
    loadMs: final ? final.load_duration / 1e6 : null,
    promptTokens: final ? final.prompt_eval_count : null,
  };
  return { text, stats };
}
