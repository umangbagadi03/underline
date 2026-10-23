// Build the results tables for RESULTS.md from eval/results/*.json and eval/review.json.
// Usage: node eval/summarize.js            -> prints the main table + strictness sweep
//        node eval/summarize.js --unreviewed  -> lists kept sentences that still need a human check
//        node eval/summarize.js --unreviewed --all -> same, but also the ones auto-marked "ok"
// Add --questions eval/questions-holdout.json for another test set.

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, loadResults, loadDocSentences, reverifyRow } from './reverify.js';
import { meetsMust } from './grade.js';
import { evalSet, questionsArg } from './eval-set.js';

const here = dirname(fileURLToPath(import.meta.url));
const SWEEP = [0.3, 0.4, 0.5, 0.6, 0.7, 0.8];

/**
 * Human review of kept sentences: { "H1|sentence text": verdict or { verdict, note } }.
 * Verdicts: ok, partial (true but incomplete), offtopic (true but not the question),
 * junk (model's thinking text), wrong (false, or the proof does not support it).
 */
async function loadReview(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return {};
  }
}

function reviewKey(questionId, text) {
  return `${questionId}|${text}`;
}

/**
 * Judge one kept sentence: 'ok', 'wrong' or 'unreviewed'.
 * A kept sentence that alone contains the expected facts is 'ok' without a human check.
 */
// With --all, nothing is auto-marked "ok": every kept sentence needs a human verdict.
const REVIEW_ALL = process.argv.includes('--all');

function judgeSentence(question, text, review) {
  const entry = review[reviewKey(question.id, text)];
  if (entry) return typeof entry === 'string' ? entry : entry.verdict;
  if (!REVIEW_ALL && question.answerable && meetsMust(text, question.must)) return 'ok';
  return 'unreviewed';
}

function median(values) {
  const list = values.filter((v) => typeof v === 'number').sort((a, b) => a - b);
  if (!list.length) return null;
  return list[Math.floor(list.length / 2)];
}

/** Count everything for one model at one strictness level. */
function scoreModel(result, config, docs, review, options) {
  const questions = new Map(config.questions.map((q) => [q.id, q]));
  const score = { correct: 0, answerable: 0, refusedOk: 0, notInDoc: 0, rightDropped: 0, wrongKept: 0, noiseKept: 0, unreviewed: [], wrongList: [] };
  for (const row of result.rows) {
    const question = questions.get(row.id);
    const redo = reverifyRow(row, question, docs[question.doc], options);
    if (question.answerable) {
      score.answerable++;
      if (redo.correct) score.correct++;
      if (redo.rawCorrect && !redo.correct) score.rightDropped++;
    } else {
      score.notInDoc++;
      if (redo.correct) score.refusedOk++;
    }
    for (const kept of redo.verification.kept) {
      const verdict = judgeSentence(question, kept.text, review);
      if (verdict === 'wrong') {
        score.wrongKept++;
        score.wrongList.push(`${row.id}: ${kept.text}`);
      }
      if (verdict === 'offtopic' || verdict === 'junk') score.noiseKept++;
      if (verdict === 'unreviewed') score.unreviewed.push({ id: row.id, text: kept.text, ids: kept.ids, model: result.model });
    }
  }
  return score;
}

function pct(a, b) {
  return `${Math.round((100 * a) / b)}%`;
}

function seconds(ms) {
  return ms === null || ms === undefined ? 'n/a' : `${(ms / 1000).toFixed(1)} s`;
}

/** Main metrics table, one row per model. */
function mainTable(results, config, docs, review) {
  const lines = [
    '| Provider / model | Correct + verified | Wrong kept (slipped past verify) | Off-topic / junk kept | Not-in-doc refused | Right answers dropped by verify | Time to first token (median) | Tokens/sec (median) | Model load (cold / warm) | Retrieval had the answer |',
    '|---|---|---|---|---|---|---|---|---|---|',
  ];
  for (const result of results) {
    const s = scoreModel(result, config, docs, review, {});
    const ttft = median(result.rows.map((r) => r.stats.firstTokenMs));
    const tps = median(result.rows.map((r) => r.stats.tokensPerSec));
    const hits = result.rows.filter((r) => r.retrievalHit === true).length;
    const load = result.loadNote || `${seconds(result.modelLoadMs)}`;
    lines.push(`| ${result.provider} / ${result.model} | ${s.correct}/${s.answerable} (${pct(s.correct, s.answerable)}) | ${s.wrongKept}${s.unreviewed.length ? ` (+${s.unreviewed.length} unreviewed)` : ''} | ${s.noiseKept} | ${s.refusedOk}/${s.notInDoc} | ${s.rightDropped} | ${seconds(ttft)} | ${tps ? tps.toFixed(1) : 'n/a'} | ${load} | ${hits}/${s.answerable} |`);
  }
  return lines.join('\n');
}

/** Strictness sweep: what changes when minOverlap goes up or down. */
function sweepTable(results, config, docs, review) {
  const lines = ['| Model | ' + SWEEP.map((t) => `overlap ≥ ${t}`).join(' | ') + ' |', '|---|' + SWEEP.map(() => '---').join('|') + '|'];
  for (const result of results) {
    const cells = SWEEP.map((t) => {
      const s = scoreModel(result, config, docs, review, { minOverlap: t });
      return `${s.correct} ok · ${s.wrongKept} wrong · ${s.rightDropped} dropped`;
    });
    lines.push(`| ${result.model} | ${cells.join(' | ')} |`);
  }
  return lines.join('\n');
}

async function main() {
  const set = evalSet(questionsArg());
  const config = await loadConfig(set.file);
  const results = await loadResults(set.resultsDir);
  const docs = await loadDocSentences(config);
  const review = await loadReview(set.reviewFile);

  if (process.argv.includes('--unreviewed')) {
    // Everything kept at the loosest setting, so the review covers the whole sweep.
    const loosest = { minOverlap: SWEEP[0] };
    const seen = new Set();
    for (const result of results) {
      for (const item of scoreModel(result, config, docs, review, loosest).unreviewed) {
        const key = reviewKey(item.id, item.text);
        if (seen.has(key)) continue;
        seen.add(key);
        const question = config.questions.find((q) => q.id === item.id);
        const byId = docs[question.doc];
        const cited = item.ids.map((id) => `[${id}] ${byId.get(id).text}`).join(' ');
        console.log(JSON.stringify({ key, model: item.model, question: question.question, expected: question.expected, cited }));
      }
    }
    return;
  }

  const output = `## Main table (default strictness)\n\n${mainTable(results, config, docs, review)}\n\n## Strictness sweep (answerable questions: correct · wrong kept · right answers dropped)\n\n${sweepTable(results, config, docs, review)}\n`;
  await writeFile(join(set.resultsDir, 'table.md'), output);
  console.log(output);
}

main();
