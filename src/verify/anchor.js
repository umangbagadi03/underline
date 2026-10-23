// Number anchoring: a number in the answer must belong to the thing the question asks about.
// Example of what this catches:
//   Question: "How many days to file a claim?"   Answer: "Within 15 days [S639]."
//   S639: "The policyholder may cancel this policy by giving 15 days' notice."
//   "15 days" is in S639, but it is about cancelling, not about claims, so the sentence is dropped.

import { extractNumbers, wordsToDigits } from './numbers.js';
import { keywords, keywordFound } from './words.js';

// Words around the number that count as "near". We look further back than ahead,
// because the subject usually starts the line: "Room Rent, Boarding … up to 2% … max Rs.5000/-".
const WORDS_BEFORE = 30;
const WORDS_AFTER = 15;

// Question words that say nothing about the subject.
const GENERIC = new Set(keywords(`
  day days month months year years week weeks hour hours period time much many long
  maximum minimum limit amount number total get give take paid pay payable allow allowed
  cover covered policy document insured sum per each every one first need can within
`));

/** The subject words of a text, e.g. "pre-existing", "disease", "waiting" (no "days", "maximum"…). */
export function anchorWords(text) {
  const words = keywords(text || '');
  return words.filter((w) => !GENERIC.has(w));
}

/** Same word root: equal, one starts with the other, or the first 5 letters match ("respond" ~ "response"). */
function sameRoot(a, b) {
  if (a === b) return true;
  if (a.length < 5 || b.length < 5) return false;
  return a.startsWith(b) || b.startsWith(a) || a.slice(0, 5) === b.slice(0, 5);
}

function rootFound(word, words) {
  return keywordFound(word, words) || words.some((w) => sameRoot(word, w));
}

/** The words of a sentence, each with the number it starts (or null). */
function wordsWithNumbers(text) {
  const tokens = wordsToDigits(text).split(/\s+/);
  const words = tokens.filter((t) => /[a-z0-9]/i.test(t)); // "/" and "–" are not words
  return words.map((word, i) => {
    if (!/\d/.test(word)) return { word, value: null };
    const [value] = extractNumbers(`${word} ${words[i + 1] || ''}`); // "5 lakh" spans two words
    return { word, value: value === undefined ? null : value };
  });
}

/** Text windows around each place where one of `values` appears in the sentence. */
function windowsAroundNumber(sentence, values) {
  const words = wordsWithNumbers(sentence);
  const windows = [];
  words.forEach((item, i) => {
    if (item.value === null || !values.includes(item.value)) return;
    const near = words.slice(Math.max(0, i - WORDS_BEFORE), i + WORDS_AFTER + 1);
    windows.push(near.map((w) => w.word).join(' '));
  });
  return windows;
}

/**
 * Is the number "about" the question's subject?
 * Yes if at least `minAnchors` subject words are near the number in the proof itself,
 * or if ALL subject words are in the headings above the proof
 * (e.g. heading "3.6 HEALTH CHECK-UP" above "payment shall be restricted to Rs. 5,000").
 * The cited sentences are joined, because one table row is often split over two lines.
 * Returns null if the number was not found as a word (then we cannot tell).
 */
function numberIsAboutSubject(number, anchors, entries, minAnchors) {
  const values = [number, number * 12, number / 12]; // "2 years" may be written "24 months"
  const proofText = entries.map((e) => e.text).join(' ');
  const windows = windowsAroundNumber(proofText, values);
  if (windows.length === 0) return null;
  for (const window of windows) {
    const nearWords = keywords(window);
    const found = anchors.filter((a) => rootFound(a, nearWords)).length;
    if (found >= minAnchors) return true;
  }
  const headingWords = keywords(entries.map((e) => e.context).join(' '));
  return anchors.every((a) => rootFound(a, headingWords));
}

/**
 * Does every number in the claim sit near the question's subject in the proof?
 * `entries` are the cited sentences: [{ text, context }].
 * `passageTexts` are the sentences we showed the model: a question word that is not in them
 * cannot be a subject word (people ask in their own words).
 * Returns true when fine, or when we cannot tell.
 */
export function numbersAnchored(claim, question, entries, passageTexts, minAnchors) {
  const shown = keywords(passageTexts.join(' '));
  const anchors = anchorWords(question).filter((w) => rootFound(w, shown));
  if (anchors.length === 0) return true;
  for (const number of extractNumbers(claim)) {
    const ok = numberIsAboutSubject(number, anchors, entries, minAnchors);
    if (ok === false) return false;
  }
  return true;
}
