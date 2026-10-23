// Read the [S12] tags in a model answer and split the answer into sentences.

import { splitText } from '../ingest/split-text.js';

// [S12] or [S12, S13] or [S12; 13] or (S12)
const CITATION = /\[\s*S?\d+(?:\s*[,;&]\s*S?\d+)*\s*\]|\(\s*S\d+(?:\s*[,;&]\s*S?\d+)*\s*\)/gi;

/** Get the sentence IDs from one citation tag: "[S12, 13]" -> ["S12", "S13"]. */
function idsFromTag(tag) {
  const numbers = tag.match(/\d+/g) || [];
  return numbers.map((n) => `S${Number(n)}`);
}

/** All IDs cited in the text, in order, without repeats. */
export function citedIds(text) {
  const tags = text.match(CITATION) || [];
  const ids = tags.flatMap(idsFromTag);
  return [...new Set(ids)];
}

/** The text with citation tags removed. */
export function withoutCitations(text) {
  const removed = text.replace(CITATION, ' ');
  return removed.replace(/\s+([.,;:!?])/g, '$1').replace(/\s+/g, ' ').trim();
}

/** Remove markdown bits small models like to add (bold, bullets, headings). */
function cleanMarkdown(text) {
  const noBold = text.replace(/\*\*|__|`/g, '');
  const noBullets = noBold.replace(/^\s*([-*•]|\d+\.)\s+/gm, '');
  return noBullets.replace(/^#+\s*/gm, '');
}

/** True if the sentence is only citation tags, like "[S5]". */
function isOnlyCitations(text) {
  return withoutCitations(text).replace(/[.,;:\s]/g, '') === '';
}

/**
 * Split a model answer into sentences with their cited IDs.
 * A tag written after the full stop ("... 2%. [S5]") belongs to the sentence before it.
 * Returns [{ text, claim, ids }] where `claim` is the text without tags.
 */
export function splitAnswer(answer) {
  const cleaned = cleanMarkdown(answer);
  // Move a tag that starts a sentence back before the full stop: "2%. [S5] Next" -> "2% [S5]. Next"
  const moved = cleaned.replace(/([.!?])\s*((?:\[[^\]]*\]\s*)+)/g, ' $2$1 ');
  const pieces = splitText(moved);
  const parts = [];
  for (const piece of pieces) {
    if (isOnlyCitations(piece) && parts.length) {
      const last = parts[parts.length - 1];
      last.ids = [...new Set([...last.ids, ...citedIds(piece)])];
      continue;
    }
    parts.push({ text: piece.trim(), claim: withoutCitations(piece), ids: citedIds(piece) });
  }
  return parts.filter((p) => p.claim || p.ids.length);
}
