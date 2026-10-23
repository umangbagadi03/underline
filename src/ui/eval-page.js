// Browser eval: same questions as eval/run-eval.js, but the model runs in WebLLM.
// Open /eval.html?model=Qwen3.5-2B-q4f16_1-MLC&auto=1 to start right away.

import { openPdfUrl } from './load-pdf-browser.js';
import { indexPdf, addEmbeddings, answerQuestion } from '../engine.js';
import { loadEmbedder } from '../search/embed.js';
import { WEBLLM_MODELS, hasWebGPU, loadWebLLM, askWebLLM } from '../answer/providers/webllm.js';
import { gradeResult, meetsMust } from '../../eval/grade.js';

const $ = (id) => document.getElementById(id);

function log(text) {
  $('log').textContent += `${text}\n`;
}

/** Index the three test PDFs in the browser and time it. */
async function indexDocs(docs, embedder) {
  const indexes = {};
  for (const [name, doc] of Object.entries(docs)) {
    const pdf = await openPdfUrl(`/eval/${doc.file}`);
    indexes[name] = await indexPdf(pdf);
    await addEmbeddings(indexes[name], embedder);
    const t = indexes[name].timings;
    log(`indexed ${name}: ${indexes[name].pageCount} pages, ready to ask in ${Math.round(t.readyMs)} ms, meaning search done in ${Math.round(t.totalMs)} ms`);
  }
  return indexes;
}

/** Answer every question and grade it. */
async function runQuestions(config, indexes, embedder, ask) {
  const rows = [];
  for (const question of config.questions) {
    const index = indexes[question.doc];
    const result = await answerQuestion(index, question.question, embedder, ask);
    const passageText = result.passages.map((p) => p.text).join(' ');
    const row = {
      id: question.id,
      question: question.question,
      answerable: question.answerable,
      retrievalHit: question.answerable ? meetsMust(passageText, question.must) : null,
      passageIds: result.passages.map((p) => p.id),
      retrieveMs: result.retrieveMs,
      rawAnswer: result.rawAnswer,
      verification: result.verification,
      stats: result.stats,
      ...gradeResult(question, result),
    };
    rows.push(row);
    log(`${question.id} ${row.correct ? 'PASS' : 'FAIL'} ${Math.round(row.stats.firstTokenMs)}ms ${row.rawAnswer.slice(0, 120)}`);
  }
  return rows;
}

async function run() {
  const model = $('model').value;
  $('run').disabled = true;
  $('log').textContent = '';
  const config = await (await fetch('/eval/questions.json')).json();

  const embedStart = performance.now();
  const embedder = await loadEmbedder('webgpu');
  const embedLoadMs = performance.now() - embedStart;
  log(`embedder loaded in ${Math.round(embedLoadMs)} ms`);

  const indexes = await indexDocs(config.docs, embedder);

  const showProgress = (report) => {
    $('status').textContent = report.text;
  };
  const { engine, loadMs } = await loadWebLLM(model, showProgress);
  log(`model loaded in ${Math.round(loadMs)} ms`);
  const ask = (messages) => askWebLLM(engine, messages);

  const rows = await runQuestions(config, indexes, embedder, ask);
  const indexing = {};
  for (const [name, ix] of Object.entries(indexes)) {
    indexing[name] = { pages: ix.pageCount, sentences: ix.sentences.length, ...ix.timings };
  }
  const output = { provider: 'webllm', model, date: new Date().toISOString(), embedLoadMs, modelLoadMs: loadMs, indexing, rows, userAgent: navigator.userAgent };
  await fetch('/__save-result', { method: 'POST', body: JSON.stringify(output) });
  const passed = rows.filter((r) => r.correct).length;
  $('status').textContent = `Done: ${passed}/${rows.length} passed. Saved to eval/results/.`;
  window.evalDone = true;
  $('run').disabled = false;
}

function start() {
  if (!hasWebGPU()) {
    $('status').textContent = 'This browser has no WebGPU.';
    return;
  }
  for (const id of WEBLLM_MODELS) {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = id;
    $('model').appendChild(option);
  }
  const params = new URLSearchParams(location.search);
  if (params.get('model')) $('model').value = params.get('model');
  $('run').addEventListener('click', run);
  if (params.get('auto')) run();
}

start();
