// The code checker: the heart of Underline.
// The model proposes an answer with [S#] tags. This file decides which sentences we trust.
// Rules for each answer sentence:
//   1. It must cite at least one [S#].
//   2. Every cited [S#] must be one we gave the model.
//   3. Every number (amount, %, days, date) must appear in the cited text.
//   4. Month names must appear in the cited text.
//   5. Most key words must appear in the cited text (or the headings above it).
//   6. If it says "not", the cited text (or its headings) must have a "no / not / excluded" type word.
//   7. A sentence starting with "This / It / They…" must stay on the same topic:
//      cite the same proof as the sentence before it, or its proof must contain
//      at least a third of that sentence's key words.
//   8. Every number must sit near the question's subject in its proof (see anchor.js).
//   9. "X is covered" is dropped if its proof is an exclusion (see coverage.js).
// A sentence like "The document does not mention X" or "no limit is stated" is a refusal, not a claim.
// If the model says "not found" but some sentences still pass, the status is "related".
// Sentences that fail are dropped. If none pass, the answer is "not found".

import { splitAnswer } from './citations.js';
import { extractNumbers, numberFound } from './numbers.js';
import { keywords, keywordFound, hasNegativeWord, saysNot } from './words.js';
import { numbersAnchored } from './anchor.js';
import { claimsCoverOfExclusion } from './coverage.js';

export const DEFAULT_OPTIONS = {
  minOverlap: 0.5, // share of the answer's key words that must be in the cited text
  minFacts: 2, // a sentence needs at least this many key words + numbers to be worth keeping
  minPronounLink: 1 / 3, // share of the previous sentence's key words a "This/It…" sentence's proof must have
  minAnchors: 1, // how many of the question's subject words must be near each number in the proof
  question: '', // the user's question (needed for number anchoring)
};

// Words that do not show a topic link ("15 days" in both sentences proves nothing).
const NOT_TOPIC = new Set(keywords('within day days month months year years week weeks hour hours'));

// Words that point back to the sentence before: "This…", "It…", "If you fail to do so…".
const POINTS_BACK = /^(this|that|it|its|these|those|they|their|such)\b|\b(?:do|doing) so\b/i;

// "may" is left out: it is usually the verb ("may be reduced").
const MONTHS = ['january', 'february', 'march', 'april', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

// Ways a model says "it's not in the document".
const NOT_FOUND_PATTERNS = [
  /not[\s_]found|could(?: not|n't) find/i,
  /not (?:mentioned|stated|specified|available|provided|included) in/i,
  /(?:does|do) not (?:explicitly )?(?:mention|say|specify|state|contain|provide|include)/i,
  /no (?:information|mention|details?) (?:about|on|regarding|of)/i,
  /\bno (?:specific |explicit |clear )?(?:\w+ )?(?:limit|amount|period|number|figure|duration|information|details?) (?:is |are )?(?:stated|specified|mentioned|given|provided)/i,
  /\b(?:is|are) not (?:explicitly |clearly )?(?:stated|specified|mentioned|listed|provided|given)\b/i,
];

/** Did the model say it could not find the answer? */
function isNotFoundText(text) {
  return NOT_FOUND_PATTERNS.some((pattern) => pattern.test(text));
}

/** Month names used in the text. */
function monthsIn(text) {
  const lower = text.toLowerCase();
  return MONTHS.filter((m) => new RegExp(`\\b${m}\\b`).test(lower));
}

/** A supplied entry is either "text" or { text, context }. */
function textOf(entry) {
  return typeof entry === 'string' ? entry : entry.text;
}
function contextOf(entry) {
  return typeof entry === 'string' ? '' : entry.context || '';
}

/** Check one answer sentence. Returns null if it passes, or a reason string if it fails. */
export function checkSentence(part, supplied, options) {
  if (part.ids.length === 0) return 'no-citation';

  const unknown = part.ids.filter((id) => !supplied.has(id));
  if (unknown.length) return 'unknown-id';

  const entries = part.ids.map((id) => supplied.get(id));
  const sourceText = entries.map(textOf).join(' ');
  const wordSource = `${sourceText} ${entries.map(contextOf).join(' ')}`;
  const claim = part.claim;

  // Numbers must match.
  const claimNumbers = extractNumbers(claim);
  const sourceNumbers = extractNumbers(sourceText);
  const missingNumber = claimNumbers.find((n) => !numberFound(n, claim, sourceNumbers));
  if (missingNumber !== undefined) return 'number-mismatch';

  // Months must match.
  const sourceMonths = monthsIn(sourceText);
  const missingMonth = monthsIn(claim).find((m) => !sourceMonths.includes(m));
  if (missingMonth) return 'number-mismatch';

  // Enough content to check?
  const claimWords = keywords(claim);
  if (claimWords.length + claimNumbers.length < options.minFacts) return 'too-vague';

  // Key word overlap.
  const sourceWords = keywords(wordSource);
  const foundCount = claimWords.filter((w) => keywordFound(w, sourceWords)).length;
  const overlap = claimWords.length ? foundCount / claimWords.length : 1;
  if (overlap < options.minOverlap) return 'low-overlap';

  // "not" in the answer needs some negative word in the source.
  if (saysNot(claim) && !hasNegativeWord(wordSource)) return 'negation-mismatch';

  // "Covered" cannot be proved by an exclusion.
  if (claimsCoverOfExclusion(claim, wordSource)) return 'exclusion-conflict';

  // Each number must be about what the question asks.
  const proofs = entries.map((e) => ({ text: textOf(e), context: contextOf(e) }));
  if (!numbersAnchored(claim, options.question, proofs, options.passageTexts, options.minAnchors)) return 'number-wrong-subject';

  return null;
}

/**
 * "This applies to all claims [S340]": does S340 talk about the same thing as the sentence before?
 * Returns true if the link looks fine.
 */
function pronounLinkOk(part, previous, supplied, options) {
  if (!previous || !POINTS_BACK.test(part.claim)) return true;
  const sharesProof = part.ids.some((id) => previous.ids.includes(id));
  if (sharesProof) return true;
  const previousWords = keywords(previous.claim).filter((w) => !NOT_TOPIC.has(w));
  if (previousWords.length === 0) return true;
  const proofText = part.ids.map((id) => textOf(supplied.get(id))).join(' ');
  const proofWords = keywords(proofText);
  const linked = previousWords.filter((w) => keywordFound(w, proofWords)).length;
  return linked / previousWords.length >= options.minPronounLink;
}

/**
 * Verify a model answer.
 * @param {string} answer - the model's raw answer
 * @param {Map<string, string|{text, context}>} supplied - only the sentences we sent the model
 * @param {object} [options] - see DEFAULT_OPTIONS
 * @returns {{ status: 'answered'|'related'|'not-found', kept: Array, dropped: Array, modelSaidNotFound: boolean }}
 */
export function verifyAnswer(answer, supplied, options = {}) {
  const settings = { ...DEFAULT_OPTIONS, ...options };
  settings.passageTexts = [...supplied.values()].map((e) => `${textOf(e)} ${contextOf(e)}`);
  const modelSaidNotFound = isNotFoundText(answer);
  const kept = [];
  const dropped = [];

  let previous = null;
  const seen = new Set(); // small models sometimes repeat a sentence word for word
  for (const part of splitAnswer(answer)) {
    const sameAsBefore = seen.has(part.claim.toLowerCase());
    seen.add(part.claim.toLowerCase());
    if (sameAsBefore) continue;
    // "The document does not mention X" is a refusal, not a claim.
    if (isNotFoundText(part.claim)) {
      dropped.push({ text: part.claim, ids: part.ids, reason: 'says-not-found' });
      continue;
    }
    let reason = checkSentence(part, supplied, settings);
    if (!reason && !pronounLinkOk(part, previous, supplied, settings)) reason = 'off-topic-link';
    if (reason) {
      dropped.push({ text: part.claim, ids: part.ids, reason });
    } else {
      kept.push({ text: part.claim, ids: part.ids });
    }
    previous = part;
  }

  let status = 'not-found';
  if (kept.length > 0) status = modelSaidNotFound ? 'related' : 'answered';
  return { status, kept, dropped, modelSaidNotFound };
}
