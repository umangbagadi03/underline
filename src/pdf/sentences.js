// Turn PDF lines into numbered sentences [S1], [S2], ...
// Each sentence remembers its page and the boxes (one per line) to highlight.

import { splitTextRanges } from './split-text.js';

// A line that starts like a list item: "a)", "(ii)", "3.1.", "4.1.1.Other", "I.", "•", "-".
export const LIST_START = /^(\(?[ivxlcdm]+[.)]\s|\(?[a-z][.)]\s?|\(?\d+[.)]\s|\d+(\.\d+)+\.?|[A-Z][.)]\s|[•▪●\-–*]\s?)/i;

// Short lines without ending punctuation are probably headings or table rows.
const HEADING_MAX_WORDS = 8;

/** Should there be a hard break between these two lines? */
function needsBreak(line, nextLine) {
  if (LIST_START.test(nextLine.text)) return true;
  const words = line.text.split(' ').length;
  const endsWithPunctuation = /[.,;:!?]$/.test(line.text);
  const nextStartsUpper = /^[A-Z0-9"“(]/.test(nextLine.text);
  if (words <= HEADING_MAX_WORDS && !endsWithPunctuation && nextStartsUpper) return true;
  return false;
}

/**
 * Join the lines of one page into one string.
 * Remembers where each line starts and ends inside that string.
 */
function joinPageLines(lines) {
  let text = '';
  const spans = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const next = lines[i + 1];
    let lineText = line.text;
    let separator = ' ';
    if (next) {
      const brokenWord = lineText.endsWith('-') && /^[a-z]/.test(next.text);
      if (brokenWord) {
        lineText = lineText.slice(0, -1); // "hospital-" + "isation" -> "hospitalisation"
        separator = '';
      } else if (needsBreak(line, next)) {
        separator = '\n';
      }
    }
    spans.push({ line, start: text.length, end: text.length + lineText.length });
    text += lineText + (next ? separator : '');
  }
  return { text, spans };
}

/** The part of a line's box covered by characters [start, end) of the page text. */
function partialBox(span, start, end) {
  const from = Math.max(start, span.start);
  const to = Math.min(end, span.end);
  if (to <= from) return null;
  const length = span.end - span.start;
  const line = span.line;
  const left = (from - span.start) / length;
  const right = (to - span.start) / length;
  return { x: line.x + left * line.w, y: line.y, w: (right - left) * line.w, h: line.h };
}

// The first item of a list: "1.", "a)", "i.", "(i)", "A.", "I."
const FIRST_LIST_ITEM = /^\(?(1|a|i|A|I)[.)]\s/;

/**
 * Give each list item the ID of the sentence that introduces its list (its "lead").
 * Example: "i. 24 Months waiting period" is the lead of "12. Hernia of all types".
 * The search uses this so a list item is never shown without its heading.
 */
function addListLeads(sentences) {
  let lead = null;
  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    const next = sentences[i + 1];
    const isListItem = LIST_START.test(sentence.text);
    if (!isListItem) lead = null; // a normal sentence ends the list
    sentence.leadId = isListItem && lead ? lead : null;
    if (next && FIRST_LIST_ITEM.test(next.text)) lead = sentence.id; // a new list starts after this one
  }
}

/** A short line with no full stop, like "F.4. Ending Tenancy" or "Periodic Tenancy". */
function isShortHeading(sentence) {
  const words = sentence.text.split(' ').length;
  return words <= 10 && !/[.;,:]$/.test(sentence.text);
}

/**
 * A big section title, like "7 EXCLUSIONS" (all capitals),
 * or "6. EXCLUSIONS (Refer to the policy wordings)" (starts with a capital word after its number).
 */
function isCapsHeading(sentence) {
  const letters = sentence.text.replace(/[^A-Za-z]/g, '');
  if (letters.length >= 4 && letters === letters.toUpperCase()) return true;
  const words = sentence.text.split(' ').length;
  const startsWithCapsWord = /^(?:\d+\.?|[IVX]+\.)\s*[A-Z]{4,}\b/.test(sentence.text);
  return words <= 20 && startsWithCapsWord;
}

/**
 * Give each sentence "context": the headings above it (and its list lead).
 * verify.js uses context only for word checks, never for numbers.
 */
function addContext(sentences) {
  let capsHeading = null;
  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    const ids = [];
    if (sentence.leadId) ids.push(sentence.leadId);
    // Up to 2 short headings right above this sentence.
    for (let back = 1; back <= 2 && i - back >= 0; back++) {
      const previous = sentences[i - back];
      if (!isShortHeading(previous)) break;
      ids.push(previous.id);
    }
    if (capsHeading) ids.push(capsHeading.id);
    sentence.contextIds = [...new Set(ids)];
    if (isCapsHeading(sentence)) capsHeading = sentence;
  }
}

/** Group lines by page number, keeping their order. */
function linesByPage(lines) {
  const pages = new Map();
  for (const line of lines) {
    if (!pages.has(line.page)) pages.set(line.page, []);
    pages.get(line.page).push(line);
  }
  return pages;
}

/**
 * Build numbered sentences from PDF lines.
 * Returns [{ id: 'S1', num: 1, page, text, boxes: [{x, y, w, h}], leadId, contextIds }, ...]
 */
export function buildSentences(lines) {
  const sentences = [];
  const pages = linesByPage(lines);
  for (const [page, pageLines] of pages) {
    const { text, spans } = joinPageLines(pageLines);
    const ranges = splitTextRanges(text);
    for (const [start, end] of ranges) {
      const boxes = spans.map((span) => partialBox(span, start, end)).filter(Boolean);
      const num = sentences.length + 1;
      const sentenceText = text.slice(start, end).replace(/\s+/g, ' ');
      sentences.push({ id: `S${num}`, num, page, text: sentenceText, boxes });
    }
  }
  addListLeads(sentences);
  addContext(sentences);
  return sentences;
}
