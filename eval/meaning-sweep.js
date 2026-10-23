// For each meaning model and cut-off: how many answers stay correct, how many wrong sentences stay?
// A kept sentence is dropped when its "entailment" score is below the cut-off.
// Usage: node eval/meaning-sweep.js
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { loadConfig, loadResults, loadDocSentences, reverifyRow } from './reverify.js';
import { evalSet } from './eval-set.js';
import { meetsMust } from './grade.js';

const CUTOFFS = [0, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];

async function sweepSet(file) {
  const set = evalSet(file);
  const config = await loadConfig(set.file);
  const docs = await loadDocSentences(config);
  const review = JSON.parse(await readFile(set.reviewFile, 'utf8'));
  const results = await loadResults(set.resultsDir);
  const questions = new Map(config.questions.map((q) => [q.id, q]));
  const files = (await readdir(set.resultsDir)).filter((f) => f.startsWith('meaning-'));
  for (const f of files) for (const result of results) {
    const scores = JSON.parse(await readFile(join(set.resultsDir, f), 'utf8')).filter((s) => s.model === result.model);
    const scoreOf = new Map(scores.map((s) => [`${s.id}|${s.text}`, s.entailment]));
    const cells = CUTOFFS.map((cut) => {
      let correct = 0, answerable = 0, wrong = 0, refusedOk = 0, notInDoc = 0;
      for (const row of result.rows) {
        const q = questions.get(row.id);
        const v = reverifyRow(row, q, docs[q.doc], {}).verification;
        const kept = v.kept.filter((k) => (scoreOf.get(`${row.id}|${k.text}`) ?? 1) >= cut);
        const answered = kept.length > 0 && !v.modelSaidNotFound;
        for (const k of kept) { const e = review[`${row.id}|${k.text}`]; if (e && (e.verdict || e) === 'wrong') wrong++; }
        if (q.answerable) { answerable++; if (answered && meetsMust(kept.map((k) => k.text).join(' '), q.must)) correct++; }
        else { notInDoc++; if (!answered) refusedOk++; }
      }
      return `${correct}/${answerable} ok, ${wrong} wrong, ${refusedOk}/${notInDoc} refused`;
    });
    console.log(`\n${set.name} · answers by ${result.model.split('/').pop()} · checker ${f.replace('meaning-', '').replace('.json', '')}`);
    CUTOFFS.forEach((cut, i) => console.log(`  cut ≥ ${cut.toFixed(1)}: ${cells[i]}`));
  }
}

await sweepSet(null);
await sweepSet('eval/questions-holdout.json');
