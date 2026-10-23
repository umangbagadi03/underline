// The RAG engine for Node: documents in memory, the embedding model, and the local LLM.
// Shared by the REST API (server/index.js) and the command line tool (bin/underline.js).

import { createHash } from 'node:crypto';
import { access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '@huggingface/transformers';
import { loadPdfFromBytes } from '../rag/ingest/load-pdf-node.js';
import { indexPdf, addEmbeddings, answerQuestion } from '../rag/pipeline.js';
import { loadEmbedder, EMBED_MODEL } from '../rag/retrieval/embed.js';
import { askLocalServer, LOCAL_SERVERS } from '../rag/generation/providers/local-server.js';
import { RECOMMENDED_MODEL } from '../rag/generation/engine-setup.js';
import { toAnswerJson } from './answer-json.js';

const here = dirname(fileURLToPath(import.meta.url));
const MODELS_FOLDER = join(here, '..', 'public', 'models');

// Use only the model files on this computer (put there by `npm run setup`). Nothing is downloaded at run time.
env.allowRemoteModels = false;
env.localModelPath = MODELS_FOLDER;

export const DEFAULTS = {
  llmUrl: process.env.UNDERLINE_LLM_URL || LOCAL_SERVERS[0].url,
  model: process.env.UNDERLINE_MODEL || RECOMMENDED_MODEL.name,
};

const documents = new Map(); // id -> { id, name, index, addedAt }
let embedderPromise = null;

/**
 * The embedding model for meaning search, loaded once.
 * Returns null if its files are missing: search then uses keywords only.
 */
export function getEmbedder() {
  if (!embedderPromise) {
    embedderPromise = access(join(MODELS_FOLDER, EMBED_MODEL))
      .then(() => loadEmbedder('cpu'))
      .catch(() => null);
  }
  return embedderPromise;
}

/** A short, stable id for a file: the start of its SHA-256 hash. */
function fileId(bytes) {
  return createHash('sha256').update(bytes).digest('hex').slice(0, 16);
}

function summary(doc) {
  const { index } = doc;
  return {
    id: doc.id,
    name: doc.name,
    pages: index.pageCount,
    sentences: index.sentences.length,
    meaningSearch: Boolean(index.vectors),
    indexMs: Math.round(index.timings.totalMs || index.timings.readyMs),
    addedAt: doc.addedAt,
  };
}

/** Read, chunk and index a PDF (keywords + embeddings). Adding the same file twice returns the first copy. */
export async function addDocument(bytes, name = 'document.pdf') {
  const id = fileId(bytes);
  if (documents.has(id)) return summary(documents.get(id));
  const pdf = await loadPdfFromBytes(bytes);
  const index = await indexPdf(pdf);
  const embedder = await getEmbedder();
  if (embedder) await addEmbeddings(index, embedder);
  const doc = { id, name, index, addedAt: new Date().toISOString() };
  documents.set(id, doc);
  return summary(doc);
}

export function listDocuments() {
  return [...documents.values()].map(summary);
}

export function hasDocument(id) {
  return documents.has(id);
}

export function removeDocument(id) {
  return documents.delete(id);
}

/**
 * Answer a question about one document.
 * options: { model, llmUrl, searchOnly }. Returns the JSON described in server/answer-json.js.
 */
export async function ask(id, question, options = {}) {
  const doc = documents.get(id);
  const model = options.model || DEFAULTS.model;
  const llmUrl = options.llmUrl || DEFAULTS.llmUrl;
  const llm = options.searchOnly ? null : (messages) => askLocalServer(llmUrl, model, messages);
  const result = await answerQuestion(doc.index, question, await getEmbedder(), llm);
  return toAnswerJson(result, doc.index, options.searchOnly ? null : model);
}
