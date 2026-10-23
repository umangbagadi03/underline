// Combine keyword search + meaning search and pick the best passages for the model.

import { makeChunks } from './chunks.js';
import { buildKeywordIndex, keywordSearch } from './keyword.js';
import { embedTexts, embedQuery, similarity } from './embed.js';

const TOP_CHUNKS = 6;
const RANK_CONSTANT = 60; // standard value for "reciprocal rank fusion"

/** Build the keyword part of the index (fast, ~1 second). Meaning search is added later. */
export function buildIndex(sentences) {
  const chunks = makeChunks(sentences);
  const keywordIndex = buildKeywordIndex(chunks);
  const sentenceById = new Map(sentences.map((s) => [s.id, s]));
  return { sentences, sentenceById, chunks, keywordIndex, vectors: null };
}

/** Rebuild a saved index (keyword search is rebuilt, it takes well under a second). */
export function restoreIndex(sentences, chunks, vectors) {
  const keywordIndex = buildKeywordIndex(chunks);
  const sentenceById = new Map(sentences.map((s) => [s.id, s]));
  return { sentences, sentenceById, chunks, keywordIndex, vectors: vectors || null };
}

const EMBED_STEP = 64; // chunks per progress update

/**
 * Add meaning search: embed every chunk (the slow part).
 * Until this finishes, retrieve() uses keyword search only.
 * `onProgress(done, total)` is called as it goes.
 */
export async function addMeaningSearch(index, embedder, onProgress) {
  const texts = index.chunks.map((c) => c.text);
  const vectors = [];
  for (let i = 0; i < texts.length; i += EMBED_STEP) {
    const part = await embedTexts(embedder, texts.slice(i, i + EMBED_STEP));
    vectors.push(...part);
    if (onProgress) onProgress(vectors.length, texts.length);
  }
  index.vectors = vectors;
}

/** Chunk IDs ordered by meaning similarity to the question. */
async function meaningSearch(index, embedder, question, limit) {
  const queryVector = await embedQuery(embedder, question);
  const scored = index.chunks.map((chunk, i) => ({
    id: chunk.id,
    score: similarity(queryVector, index.vectors[i]),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.id);
}

/** Merge ranked lists: things ranked high in either list come first. */
function fuseRankings(lists) {
  const scores = new Map();
  for (const list of lists) {
    list.forEach((id, rank) => {
      const old = scores.get(id) || 0;
      scores.set(id, old + 1 / (RANK_CONSTANT + rank + 1));
    });
  }
  const ids = [...scores.keys()];
  return ids.sort((a, b) => scores.get(b) - scores.get(a));
}

/**
 * Find the best passages for a question.
 * Returns { chunkIds, sentences } where sentences are in document order, no repeats.
 */
export async function retrieve(index, question, embedder, topChunks = TOP_CHUNKS) {
  const keywordIds = keywordSearch(index.keywordIndex, question, 20);
  const lists = [keywordIds];
  if (embedder && index.vectors) {
    const meaningIds = await meaningSearch(index, embedder, question, 20);
    lists.push(meaningIds);
  }
  const best = fuseRankings(lists).slice(0, topChunks);

  // Collect the sentences of the chosen chunks, in document order.
  const chunkById = new Map(index.chunks.map((c) => [c.id, c]));
  const ids = new Set(best.flatMap((id) => chunkById.get(id).sentenceIds));
  const sentences = [...ids].map((id) => index.sentenceById.get(id));
  sentences.sort((a, b) => a.num - b.num);
  return { chunkIds: best, sentences };
}
