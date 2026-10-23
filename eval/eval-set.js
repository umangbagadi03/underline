// Which test set are we running? Default: eval/questions.json (the "main" set).
// Another set, e.g. eval/questions-holdout.json, keeps its own results and review files:
//   results -> eval/results/holdout/   review -> eval/review-holdout.json

import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** Read "--questions <file>" from the command line (or null). */
export function questionsArg() {
  const args = process.argv.slice(2);
  const at = args.indexOf('--questions');
  return at >= 0 ? args[at + 1] : null;
}

/** Paths for one test set. */
export function evalSet(questionsFile) {
  const file = questionsFile ? resolve(questionsFile) : join(here, 'questions.json');
  const name = basename(file, '.json').replace(/^questions-?/, '') || 'main';
  const isMain = name === 'main';
  return {
    file,
    name,
    resultsDir: isMain ? join(here, 'results') : join(here, 'results', name),
    reviewFile: isMain ? join(here, 'review.json') : join(here, `review-${name}.json`),
  };
}
