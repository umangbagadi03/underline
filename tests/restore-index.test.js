import { describe, it, expect } from 'vitest';
import { buildSentences } from '../rag/ingest/sentences.js';
import { buildIndex, restoreIndex, retrieve } from '../rag/retrieval/retrieve.js';

function line(page, text, y) {
  return { page, text, x: 50, y, w: text.length * 5, h: 10 };
}

describe('restoreIndex', () => {
  it('a saved and restored index finds the same passages as a new one', async () => {
    const lines = [
      line(1, 'The deposit is two months of rent.', 700),
      line(1, 'Pets are not allowed in the flat.', 688),
      line(2, 'The tenant must give one month of notice.', 700),
    ];
    const sentences = buildSentences(lines);
    const fresh = buildIndex(sentences);
    // Saving to IndexedDB keeps only plain data, like JSON does.
    const saved = JSON.parse(JSON.stringify({ sentences: fresh.sentences, chunks: fresh.chunks }));
    const restored = restoreIndex(saved.sentences, saved.chunks, null);
    const a = await retrieve(fresh, 'How much notice must the tenant give?', null);
    const b = await retrieve(restored, 'How much notice must the tenant give?', null);
    expect(b.chunkIds).toEqual(a.chunkIds);
    expect(b.sentences.map((s) => s.id)).toContain('S3');
  });
});
