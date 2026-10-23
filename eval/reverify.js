// Re-check saved model answers with verify.js, without calling the model again.
// Used to try different strictness settings on the same answers.

import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPdfFromFile } from './load-pdf-node.js';
import { readPdfLines } from '../src/pdf/read-pdf.js';
import { removeHeadersAndFooters } from '../src/pdf/clean-lines.js';
import { buildSentences } from '../src/pdf/sentences.js';
import { verifyAnswer } from '../src/verify/verify.js';
import { gradeResult } from './grade.js';

const here = dirname(fileURLToPath(import.meta.url));

/** Read a questions file. */
export async function loadConfig(file) {
  const text = await readFile(file, 'utf8');
  return JSON.parse(text);
}

/** Read all saved model results in a folder (skips the search-only run). */
export async function loadResults(folder) {
  const files = await readdir(folder);
  const results = [];
  for (const file of files.filter((f) => f.endsWith('.json') && !f.startsWith('none-') && !f.startsWith('meaning-'))) {
    const text = await readFile(join(folder, file), 'utf8');
    results.push(JSON.parse(text));
  }
  return results;
}

/** For each doc: a Map of sentence ID -> sentence (same IDs as in the eval). */
export async function loadDocSentences(config) {
  const docs = {};
  for (const [name, doc] of Object.entries(config.docs)) {
    const pdf = await loadPdfFromFile(join(here, doc.file));
    const { pageCount, lines } = await readPdfLines(pdf);
    const sentences = buildSentences(removeHeadersAndFooters(lines, pageCount));
    docs[name] = new Map(sentences.map((s) => [s.id, s]));
  }
  return docs;
}

/** Rebuild what we sent the model for one row (text + heading context). */
function suppliedFor(row, byId) {
  const supplied = new Map();
  for (const id of row.passageIds) {
    const sentence = byId.get(id);
    const context = sentence.contextIds.map((c) => byId.get(c).text).join(' ');
    supplied.set(id, { text: sentence.text, context });
  }
  return supplied;
}

/** Verify one saved row again with the given options. Returns the new row fields. */
export function reverifyRow(row, question, byId, options) {
  const supplied = suppliedFor(row, byId);
  const verification = verifyAnswer(row.rawAnswer, supplied, { question: question.question, ...options });
  const grade = gradeResult(question, { verification, rawAnswer: row.rawAnswer });
  return { verification, ...grade };
}
