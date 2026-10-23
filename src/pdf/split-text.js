// Split a block of text into sentences.
// A "\n" in the text is always a sentence break (used for headings and list items).

// Words that end with "." but do not end a sentence.
const ABBREVIATIONS = new Set([
  'rs', 'no', 'nos', 'dr', 'mr', 'mrs', 'ms', 'viz', 'etc', 'co', 'ltd', 'pvt', 'st',
  'vs', 'art', 'cl', 'sr', 'jr', 'approx', 'max', 'min', 'incl', 'govt', 'dept',
  'e.g', 'i.e', 'p.a', 'u.s', 'inr', 'fig', 'sec', 'para', 'ref',
]);

// Long sentences (more words than this) are cut at ";".
const LONG_SENTENCE_WORDS = 60;

// A sentence that is only a list marker, like "3.1." or "a)" or "iv.".
const LIST_MARKER_ONLY = /^\s*\(?([ivxlcdm]+|[a-z]|\d+(\.\d+)*)[.)]\s*$/i;

/** The word just before position `end` (lowercase, without the dot). */
function wordBefore(text, end) {
  const before = text.slice(0, end);
  const match = before.match(/([A-Za-z.]+)$/);
  return match ? match[1].toLowerCase().replace(/\.$/, '') : '';
}

/** Is the "." at position `dot` really the end of a sentence? */
function isSentenceEnd(text, dot, start) {
  if (text[dot] !== '.') return true; // "!" and "?" always end a sentence
  const word = wordBefore(text, dot);
  if (ABBREVIATIONS.has(word)) return false;
  // A single letter like "a." or "J." is a list marker or an initial.
  if (word.length === 1) return false;
  const sentenceSoFar = text.slice(start, dot + 1);
  if (LIST_MARKER_ONLY.test(sentenceSoFar)) return false;
  return true;
}

/** Find [start, end] ranges of sentences inside one piece of text (no "\n" inside). */
function rangesInBlock(text, offset) {
  const ranges = [];
  // A sentence ends at . ! ? (maybe followed by a quote or bracket), then space, then a capital, digit, bracket or quote.
  const endPattern = /[.!?]["')\]]?(?=\s+["'(\[]?[A-Z0-9])/g;
  let start = 0;
  for (const match of text.matchAll(endPattern)) {
    const dot = match.index;
    if (!isSentenceEnd(text, dot, start)) continue;
    const end = dot + match[0].length;
    ranges.push([offset + start, offset + end]);
    start = end;
  }
  ranges.push([offset + start, offset + text.length]);
  return ranges;
}

/** Cut a long range at ";" so no piece is too long. */
function cutLongRange(text, range) {
  const [start, end] = range;
  const piece = text.slice(start, end);
  const wordCount = piece.split(/\s+/).length;
  if (wordCount <= LONG_SENTENCE_WORDS) return [range];

  const result = [];
  let pieceStart = start;
  for (let i = start; i < end; i++) {
    if (text[i] !== ';') continue;
    const words = text.slice(pieceStart, i + 1).split(/\s+/).length;
    if (words >= 15) {
      result.push([pieceStart, i + 1]);
      pieceStart = i + 1;
    }
  }
  result.push([pieceStart, end]);
  return result;
}

/** Move a range inward so it does not start or end with spaces. */
function trimRange(text, range) {
  let [start, end] = range;
  while (start < end && /\s/.test(text[start])) start++;
  while (end > start && /\s/.test(text[end - 1])) end--;
  return [start, end];
}

/**
 * Split text into sentence ranges: [[start, end], ...] (end is exclusive).
 * Ranges point into the original text, so callers can map them back to positions.
 */
export function splitTextRanges(text) {
  const ranges = [];
  let blockStart = 0;
  const blocks = text.split('\n');
  for (const block of blocks) {
    const blockRanges = rangesInBlock(block, blockStart);
    for (const range of blockRanges) {
      for (const piece of cutLongRange(text, range)) {
        const trimmed = trimRange(text, piece);
        if (trimmed[1] > trimmed[0]) ranges.push(trimmed);
      }
    }
    blockStart += block.length + 1; // +1 for the "\n"
  }
  return ranges;
}

/** Split text into sentence strings. */
export function splitText(text) {
  const ranges = splitTextRanges(text);
  return ranges.map(([start, end]) => text.slice(start, end));
}
