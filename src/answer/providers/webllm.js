// WebLLM provider: runs the model inside the browser with WebGPU.
// The model downloads once and is then kept in the browser cache.

import { CreateMLCEngine } from '@mlc-ai/web-llm';

export const WEBLLM_MODELS = [
  'Qwen3.5-2B-q4f16_1-MLC',
  'Qwen3.5-4B-q4f16_1-MLC',
  'Qwen3-4B-q4f16_1-MLC',
  'Phi-4-mini-instruct-q4f16_1-MLC',
];

/** Does this browser have WebGPU? */
export function hasWebGPU() {
  return typeof navigator !== 'undefined' && Boolean(navigator.gpu);
}

/**
 * Load a model. `onProgress` gets { text, progress } while it downloads/loads.
 * Returns { engine, loadMs }.
 */
export async function loadWebLLM(modelId, onProgress) {
  const started = performance.now();
  const engine = await CreateMLCEngine(modelId, { initProgressCallback: onProgress });
  return { engine, loadMs: performance.now() - started };
}

/**
 * Send messages to the loaded model and stream the answer.
 * Returns { text, stats: { firstTokenMs, totalMs, tokens, tokensPerSec } }
 */
export async function askWebLLM(engine, messages, onToken) {
  const started = performance.now();
  const stream = await engine.chat.completions.create({
    messages,
    stream: true,
    stream_options: { include_usage: true },
    temperature: 0,
    max_tokens: 300,
    extra_body: { enable_thinking: false },
  });

  let text = '';
  let firstTokenMs = null;
  let usage = null;
  for await (const chunk of stream) {
    const choice = chunk.choices[0];
    const piece = choice && choice.delta ? choice.delta.content || '' : '';
    if (piece && firstTokenMs === null) firstTokenMs = performance.now() - started;
    text += piece;
    if (piece && onToken) onToken(piece);
    if (chunk.usage) usage = chunk.usage;
  }

  const totalMs = performance.now() - started;
  const extra = usage && usage.extra ? usage.extra : {};
  const stats = {
    firstTokenMs,
    totalMs,
    tokens: usage ? usage.completion_tokens : null,
    tokensPerSec: extra.decode_tokens_per_s || null,
    promptTokens: usage ? usage.prompt_tokens : null,
  };
  return { text, stats };
}
