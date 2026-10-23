// Run every question in a test set against one provider + model.
// Add --questions eval/questions-holdout.json to use another set (default: eval/questions.json).
// Usage:
//   node eval/run-eval.js --provider none                     (search only: checks retrieval)
//   node eval/run-eval.js --provider local --model qwen3.5:2b             (Ollama, default URL)
//   node eval/run-eval.js --provider local --model my-model --url http://localhost:8080   (llama.cpp)
// Writes eval/results/<provider>-<model>.json

import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '@huggingface/transformers';
import { loadPdfFromFile } from './load-pdf-node.js';
import { indexPdf, addEmbeddings, answerQuestion } from '../src/engine.js';
import { loadEmbedder } from '../src/search/embed.js';
import { askOllama, unloadOllamaModel } from '../src/answer/providers/ollama.js';
import { askLocalServer, LOCAL_SERVERS } from '../src/answer/providers/local-server.js';
import { gradeResult, meetsMust } from './grade.js';
import { evalSet } from './eval-set.js';

const here = dirname(fileURLToPath(import.meta.url));
// Use the same local model files as the app (put there by `npm run setup`).
env.allowRemoteModels = false;
env.localModelPath = join(here, '..', 'public', 'models');

/** Read "--name value" pairs from the command line. */
function readArgs() {
  const args = {};
  const list = process.argv.slice(2);
  for (let i = 0; i < list.length; i += 2) args[list[i].replace(/^--/, '')] = list[i + 1];
  return args;
}

/** Load and index the three test documents. */
async function indexDocs(docs, embedder) {
  const indexes = {};
  for (const [name, doc] of Object.entries(docs)) {
    const pdf = await loadPdfFromFile(join(here, doc.file));
    indexes[name] = await indexPdf(pdf);
    await addEmbeddings(indexes[name], embedder);
    const t = indexes[name].timings;
    console.log(`indexed ${name}: ${indexes[name].pageCount} pages, ${indexes[name].sentences.length} sentences, ${Math.round(t.totalMs)} ms`);
  }
  return indexes;
}

/** Make the "ask" function for the chosen provider. */
function makeAsk(provider, model, url) {
  if (provider === 'local') return (messages) => askLocalServer(url, model, messages);
  if (provider === 'ollama') return (messages) => askOllama(model, messages); // old native API
  return null;
}

/** Search-only check: do the retrieved passages contain the expected facts? */
function gradeRetrieval(question, result) {
  if (!question.answerable) return null;
  const text = result.passages.map((p) => p.text).join(' ');
  return meetsMust(text, question.must);
}

async function main() {
  const args = readArgs();
  const provider = args.provider || 'none';
  const model = args.model || 'none';
  const url = args.url || LOCAL_SERVERS[0].url;
  const isOllama = url === LOCAL_SERVERS[0].url && provider !== 'none';
  const set = evalSet(args.questions);
  const config = JSON.parse(await readFile(set.file, 'utf8'));

  const embedStart = performance.now();
  const embedder = await loadEmbedder('cpu');
  const embedLoadMs = performance.now() - embedStart;
  const indexes = await indexDocs(config.docs, embedder);

  // Measure a cold model load once (unload first, then a tiny request).
  let modelLoadMs = null;
  if (isOllama) {
    await unloadOllamaModel(model);
    const warm = await askOllama(model, [{ role: 'user', content: 'Say OK.' }]);
    modelLoadMs = warm.stats.loadMs;
    console.log(`model load: ${Math.round(modelLoadMs)} ms`);
  }

  const ask = makeAsk(provider, model, url);
  const safeName = `${provider}-${model}`.replace(/[^a-z0-9.-]+/gi, '_');
  // Save after every question, so a stopped run can carry on where it left off.
  const partialFile = join('.cache', `partial-${basename(set.file, '.json')}-${safeName}.json`);
  const rows = await loadPartial(partialFile);
  const done = new Set(rows.map((r) => r.id));
  for (const question of config.questions) {
    if (done.has(question.id)) continue;
    const index = indexes[question.doc];
    const result = await answerQuestion(index, question.question, embedder, ask);
    const row = {
      id: question.id,
      question: question.question,
      answerable: question.answerable,
      retrievalHit: gradeRetrieval(question, result),
      passageIds: result.passages.map((p) => p.id),
      retrieveMs: result.retrieveMs,
    };
    if (result.mode === 'answer') {
      row.rawAnswer = result.rawAnswer;
      row.verification = result.verification;
      row.stats = result.stats;
      row.citedPages = result.verification.kept.flatMap((k) => k.ids.map((id) => index.sentenceById.get(id).page));
      Object.assign(row, gradeResult(question, result));
    }
    rows.push(row);
    const mark = row.correct === undefined ? (row.retrievalHit === false ? 'MISS' : 'ok') : row.correct ? 'PASS' : 'FAIL';
    console.log(`${question.id} ${mark} ${row.rawAnswer ? JSON.stringify(row.rawAnswer.slice(0, 160)) : ''}`);
    await writeFile(partialFile, JSON.stringify(rows));
  }

  const indexing = Object.fromEntries(Object.entries(indexes).map(([name, ix]) => [name, { pages: ix.pageCount, sentences: ix.sentences.length, ...ix.timings }]));
  const output = { provider, model, date: new Date().toISOString(), embedLoadMs, modelLoadMs, indexing, rows };
  await mkdir(set.resultsDir, { recursive: true });
  const outFile = join(set.resultsDir, `${safeName}.json`);
  await writeFile(outFile, JSON.stringify(output, null, 2));
  await rm(partialFile, { force: true });
  console.log(`saved ${outFile}`);
}

/** Answers saved by an earlier run that was stopped (none if it finished). */
async function loadPartial(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return [];
  }
}

main();
