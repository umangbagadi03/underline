// Experiment: score every kept answer sentence with a meaning model, so we can see
// whether it separates right sentences from wrong ones (using our hand review labels).
// Uses saved answers only: no chat model is needed.
// Usage: node eval/meaning-experiment.js <modelId> [--questions eval/questions-holdout.json]
// Writes eval/results/<set>/meaning-<model>.json

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { env } from '@huggingface/transformers';
import { loadConfig, loadResults, loadDocSentences, reverifyRow } from './reverify.js';
import { evalSet, questionsArg } from './eval-set.js';
import { loadMeaningChecker, supportScores } from '../src/verify/meaning.js';

// Experiment only: download candidate models into a scratch cache.
env.allowRemoteModels = true;
env.cacheDir = join(process.cwd(), '.cache', 'nli-models');

// --with-before: also show the sentence just before each cited one
// (PDF lines often break a sentence, so the subject can be on the line before).
const WITH_BEFORE = process.argv.includes('--with-before');

/** The proof text for a sentence: its cited sentences, headings in front (and the line before). */
function proofFor(ids, byId) {
  const parts = ids.map((id) => {
    const sentence = byId.get(id);
    const headings = sentence.contextIds.map((c) => byId.get(c).text).join(' ');
    const before = WITH_BEFORE ? byId.get(`S${sentence.num - 1}`) : null;
    const lead = before && !sentence.contextIds.includes(before.id) ? `${before.text} ` : '';
    const body = `${lead}${sentence.text}`;
    return headings ? `${headings}: ${body}` : body;
  });
  return parts.join(' ');
}

function verdictOf(review, key) {
  const entry = review[key];
  if (!entry) return 'unreviewed';
  return typeof entry === 'string' ? entry : entry.verdict;
}

async function main() {
  const modelId = process.argv[2];
  const set = evalSet(questionsArg());
  const config = await loadConfig(set.file);
  const docs = await loadDocSentences(config);
  const review = JSON.parse(await readFile(set.reviewFile, 'utf8'));
  const results = await loadResults(set.resultsDir);
  const questions = new Map(config.questions.map((q) => [q.id, q]));

  const started = performance.now();
  const checker = await loadMeaningChecker(modelId, 'cpu');
  console.log(`loaded ${modelId} in ${Math.round(performance.now() - started)} ms`);

  const rows = [];
  let timeMs = 0;
  for (const result of results) {
    for (const row of result.rows) {
      const question = questions.get(row.id);
      const byId = docs[question.doc];
      const redo = reverifyRow(row, question, byId, {});
      for (const kept of redo.verification.kept) {
        const proof = proofFor(kept.ids, byId);
        const t = performance.now();
        const scores = await supportScores(checker, proof, kept.text);
        timeMs += performance.now() - t;
        const verdict = verdictOf(review, `${row.id}|${kept.text}`);
        rows.push({ id: row.id, model: result.model, text: kept.text, verdict, ...scores });
      }
    }
  }
  console.log(`${rows.length} sentences, ${Math.round(timeMs / rows.length)} ms each`);
  const name = modelId.replace(/[^a-z0-9.-]+/gi, '_') + (WITH_BEFORE ? '+before' : '');
  await writeFile(join(set.resultsDir, `meaning-${name}.json`), JSON.stringify(rows, null, 1));

  // Quick view: average entailment for each review verdict.
  const byVerdict = {};
  for (const r of rows) (byVerdict[r.verdict] ||= []).push(r.entailment);
  for (const [v, list] of Object.entries(byVerdict)) {
    const avg = list.reduce((a, b) => a + b, 0) / list.length;
    console.log(`${v.padEnd(10)} n=${String(list.length).padStart(3)}  avg entailment ${avg.toFixed(2)}`);
  }
}

main();
