// Group sentences into small overlapping passages ("chunks") for searching.

const TARGET_WORDS = 70; // a chunk stops growing after this many words
const MAX_SENTENCES = 6;

function wordCount(text) {
  return text.split(/\s+/).length;
}

/** If the chunk starts in the middle of a list, put the list's heading in front. */
function addLead(group, byId) {
  const leadId = group[0].leadId;
  const leadMissing = leadId && !group.some((s) => s.id === leadId);
  return leadMissing ? [byId.get(leadId), ...group] : group;
}

/**
 * Make chunks of consecutive sentences (no overlap).
 * We tested half-overlapping chunks: same search results on the test set,
 * but twice as many chunks to embed, so indexing was twice as slow.
 * Returns [{ id: 'C0', sentenceIds: ['S1', 'S2'], text, page }]
 */
export function makeChunks(sentences) {
  const byId = new Map(sentences.map((s) => [s.id, s]));
  const chunks = [];
  let start = 0;
  while (start < sentences.length) {
    let end = start;
    let words = 0;
    while (end < sentences.length && words < TARGET_WORDS && end - start < MAX_SENTENCES) {
      words += wordCount(sentences[end].text);
      end++;
    }
    const group = sentences.slice(start, end);
    const withLead = addLead(group, byId);
    chunks.push({
      id: `C${chunks.length}`,
      sentenceIds: withLead.map((s) => s.id),
      text: withLead.map((s) => s.text).join(' '),
      page: group[0].page,
    });
    if (end >= sentences.length) break;
    start = end;
  }
  return chunks;
}
