// The whole pipeline in two steps: index a PDF, then answer a question.
// Used by both the test page (browser) and the eval (Node).

import { readPdfLines } from './pdf/read-pdf.js';
import { removeHeadersAndFooters } from './pdf/clean-lines.js';
import { buildSentences } from './pdf/sentences.js';
import { buildIndex, addMeaningSearch, retrieve } from './search/retrieve.js';
import { buildMessages, stripThinking } from './answer/prompt.js';
import { verifyAnswer } from './verify/verify.js';

/**
 * Read a loaded pdf.js document and build the keyword index.
 * You can ask questions right after this. Returns the index with timings in ms.
 */
export async function indexPdf(pdf) {
  const t0 = performance.now();
  const { pageCount, lines } = await readPdfLines(pdf);
  const cleanLines = removeHeadersAndFooters(lines, pageCount);
  const sentences = buildSentences(cleanLines);
  const t1 = performance.now();
  const index = buildIndex(sentences);
  const t2 = performance.now();
  index.pageCount = pageCount;
  index.timings = { readMs: t1 - t0, keywordMs: t2 - t1, readyMs: t2 - t0 };
  return index;
}

/** Second step: add meaning search (embeddings). Adds timings.embedMs and timings.totalMs. */
export async function addEmbeddings(index, embedder, onProgress) {
  const t0 = performance.now();
  await addMeaningSearch(index, embedder, onProgress);
  index.timings.embedMs = performance.now() - t0;
  index.timings.totalMs = index.timings.readyMs + index.timings.embedMs;
}

/** The sentences we sent the model, with their heading context, for verify.js. */
function suppliedForVerify(index, sentences) {
  const supplied = new Map();
  for (const sentence of sentences) {
    const contextIds = sentence.contextIds || [];
    const contextTexts = contextIds.map((id) => index.sentenceById.get(id).text);
    supplied.set(sentence.id, { text: sentence.text, context: contextTexts.join(' ') });
  }
  return supplied;
}

/**
 * Answer one question.
 * `ask(messages, onToken)` is the provider: it returns { text, stats }.
 * If `ask` is null we run in search-only mode (just the best passages).
 */
export async function answerQuestion(index, question, embedder, ask, onToken) {
  const t0 = performance.now();
  const found = await retrieve(index, question, embedder);
  const retrieveMs = performance.now() - t0;
  // The best passages, best first (shown in search-only mode, and as "closest lines" when nothing is found).
  const chunkById = new Map(index.chunks.map((c) => [c.id, c]));
  const chunks = found.chunkIds.map((id) => chunkById.get(id));
  if (!ask) {
    return { mode: 'search-only', passages: found.sentences, chunks, retrieveMs };
  }

  const messages = buildMessages(question, found.sentences);
  const reply = await ask(messages, onToken);
  const rawAnswer = stripThinking(reply.text);
  const supplied = suppliedForVerify(index, found.sentences);
  const verification = verifyAnswer(rawAnswer, supplied, { question });
  return {
    mode: 'answer',
    passages: found.sentences,
    rawAnswer,
    verification,
    chunks,
    stats: reply.stats,
    retrieveMs,
  };
}
