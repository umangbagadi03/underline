// Meaning search: turn text into vectors with a small embedding model (runs locally).

import { AutoTokenizer, AutoModel } from '@huggingface/transformers';

export const EMBED_MODEL = 'Xenova/bge-small-en-v1.5'; // ~34 MB (q8), English
const QUERY_PREFIX = 'Represent this sentence for searching relevant passages: ';
const BATCH_SIZE = 16;

// Every batch is padded to one of these lengths (in tokens).
// WebGPU is slow when every batch has a new shape (it rebuilds its programs),
// so a few fixed shapes make indexing ~15x faster (measured).
const LENGTHS = [64, 128, 256];

/** Can this GPU do half-precision (fp16) maths? */
async function gpuHasFp16() {
  const adapter = await navigator.gpu.requestAdapter();
  return Boolean(adapter && adapter.features.has('shader-f16'));
}

/**
 * Load the embedding model once. `device` is 'wasm', 'webgpu' or 'cpu' (Node).
 * On WebGPU, 8-bit (q8) is ~20x slower than fp16 (measured), so we use fp16 there.
 * Returns { tokenizer, model }.
 */
export async function loadEmbedder(device) {
  let dtype = 'q8';
  if (device === 'webgpu') dtype = (await gpuHasFp16()) ? 'fp16' : 'fp32';
  const options = { dtype };
  if (device) options.device = device;
  const tokenizer = await AutoTokenizer.from_pretrained(EMBED_MODEL);
  const model = await AutoModel.from_pretrained(EMBED_MODEL, options);
  return { tokenizer, model };
}

/** The smallest fixed length that fits the longest text in the batch. */
function pickLength(tokenizer, texts) {
  const counts = texts.map((t) => tokenizer.encode(t).length);
  const longest = Math.max(...counts);
  const fit = LENGTHS.find((n) => n >= longest);
  return fit || LENGTHS[LENGTHS.length - 1];
}

/** Make a vector length 1, so similarity is a simple dot product. */
function normalize(vector) {
  let sum = 0;
  for (const v of vector) sum += v * v;
  const length = Math.sqrt(sum) || 1;
  return vector.map((v) => v / length);
}

/** Embed one batch. bge models use the first token ([CLS]) as the sentence vector. */
async function embedBatch(embedder, texts) {
  const { tokenizer, model } = embedder;
  // Fill the batch up to a fixed size too, so the shape never changes.
  const padded = [...texts];
  while (padded.length < BATCH_SIZE) padded.push('');
  const maxLength = pickLength(tokenizer, texts);
  const inputs = tokenizer(padded, { padding: 'max_length', truncation: true, max_length: maxLength });
  const output = await model(inputs);
  const hidden = output.last_hidden_state; // [batch, tokens, dims]
  const [, tokens, dims] = hidden.dims;
  const data = hidden.data;
  const vectors = [];
  for (let i = 0; i < texts.length; i++) {
    const start = i * tokens * dims; // the first token of row i
    const cls = Array.from(data.slice(start, start + dims));
    vectors.push(normalize(cls));
  }
  return vectors;
}

/** Turn many texts into vectors (arrays of numbers). */
export async function embedTexts(embedder, texts) {
  const vectors = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const batchVectors = await embedBatch(embedder, batch);
    vectors.push(...batchVectors);
  }
  return vectors;
}

/** Turn a question into a vector. */
export async function embedQuery(embedder, question) {
  const [vector] = await embedTexts(embedder, [QUERY_PREFIX + question]);
  return vector;
}

/** Similarity of two normalized vectors (higher = closer in meaning). */
export function similarity(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}
