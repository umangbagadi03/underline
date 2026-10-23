// Grading helpers: does an answer contain the expected facts?

import { wordsToDigits } from '../src/verify/numbers.js';

/** Make text easy to compare: lowercase, number words -> digits, "5,000" -> "5000", "5 lakh" -> "500000". */
export function normalizeForMatch(text) {
  let result = wordsToDigits(text.toLowerCase());
  result = result.replace(/(\d),(?=\d)/g, '$1');
  result = result.replace(/(\d+(?:\.\d+)?)\s*(lakhs?|lacs?)\b/g, (_, n) => String(Math.round(parseFloat(n) * 100000)));
  result = result.replace(/[‘’]/g, "'");
  return result.replace(/\s+/g, ' ');
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** True if `option` appears in the text as a whole token start ("5%" does not match inside "25%"). */
function containsOption(normalText, option) {
  const target = normalizeForMatch(option);
  const startsWithWordChar = /^[a-z0-9]/.test(target);
  // Not inside a longer number or word ("5%" must not match "25%" or "2.5%").
  const prefix = startsWithWordChar ? '(?<![a-z0-9])(?<!\\d\\.)' : '';
  const pattern = new RegExp(prefix + escapeRegex(target));
  return pattern.test(normalText);
}

/** Every group in `must` needs at least one option present. */
export function meetsMust(text, must) {
  const normalText = normalizeForMatch(text);
  return must.every((group) => group.some((option) => containsOption(normalText, option)));
}

/**
 * Grade one result.
 * - correct: answerable, verified answer has the expected facts
 * - rawCorrect: the model's raw answer (before verify) had the expected facts and did not say NOT FOUND
 * - refused: the app tells the user "not found" (status "not-found", or "related" =
 *   "not found, but here are related lines")
 */
export function gradeResult(question, result) {
  const v = result.verification;
  const keptText = v.kept.map((k) => k.text).join(' ');
  const refused = v.status !== 'answered';
  if (!question.answerable) {
    return { correct: refused, rawCorrect: v.modelSaidNotFound, refused };
  }
  const correct = !refused && meetsMust(keptText, question.must);
  const rawCorrect = !v.modelSaidNotFound && meetsMust(result.rawAnswer, question.must);
  return { correct, rawCorrect, refused };
}
