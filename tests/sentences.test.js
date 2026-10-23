import { describe, it, expect } from 'vitest';
import { splitText } from '../rag/ingest/split-text.js';
import { buildSentences } from '../rag/ingest/sentences.js';
import { removeHeadersAndFooters } from '../rag/ingest/clean-lines.js';

// A fake line, like read-pdf.js returns. Each character is 5 units wide.
function line(page, text, y) {
  return { page, text, x: 50, y, w: text.length * 5, h: 10 };
}

describe('splitText', () => {
  it('splits plain sentences', () => {
    expect(splitText('The rent is due. It is paid monthly.')).toEqual([
      'The rent is due.',
      'It is paid monthly.',
    ]);
  });

  it('keeps "Rs." amounts inside the sentence', () => {
    expect(splitText('Pay Rs. 5,000 now. Then wait.')).toEqual(['Pay Rs. 5,000 now.', 'Then wait.']);
  });

  it('does not split decimals', () => {
    expect(splitText('Up to 1.5 lac is covered. Done.')).toEqual(['Up to 1.5 lac is covered.', 'Done.']);
  });

  it('does not split after a list number like "3.1."', () => {
    expect(splitText('3.1. Accident means a sudden event.')).toEqual(['3.1. Accident means a sudden event.']);
  });

  it('does not split after e.g. or i.e.', () => {
    expect(splitText('Items, e.g. Books, are fine. Next one.')).toEqual([
      'Items, e.g. Books, are fine.',
      'Next one.',
    ]);
  });

  it('treats a new line as a hard break', () => {
    expect(splitText('Heading\nBody text here.')).toEqual(['Heading', 'Body text here.']);
  });

  it('splits very long sentences at semicolons', () => {
    const part = 'word '.repeat(40).trim();
    const pieces = splitText(`${part}; ${part}; ${part}.`);
    expect(pieces.length).toBe(3);
  });
});

describe('buildSentences', () => {
  it('numbers sentences across pages and keeps the page', () => {
    const lines = [line(1, 'First one. Second one.', 700), line(2, 'Third one.', 700)];
    const sentences = buildSentences(lines);
    expect(sentences.map((s) => s.id)).toEqual(['S1', 'S2', 'S3']);
    expect(sentences.map((s) => s.page)).toEqual([1, 1, 2]);
  });

  it('joins a sentence that wraps over two lines and gives two boxes', () => {
    const lines = [line(1, 'The waiting period is', 700), line(1, 'thirty days.', 688)];
    const [s] = buildSentences(lines);
    expect(s.text).toBe('The waiting period is thirty days.');
    expect(s.boxes.length).toBe(2);
  });

  it('gives a partial box when a line holds two sentences', () => {
    const lines = [line(1, 'Aaaa bb. Cccc dd.', 700)];
    const [first, second] = buildSentences(lines);
    expect(first.boxes[0].x).toBe(50);
    expect(second.boxes[0].x).toBeGreaterThan(50);
    expect(first.boxes[0].w + second.boxes[0].w).toBeLessThanOrEqual(17 * 5);
  });

  it('joins words broken with a hyphen at the end of a line', () => {
    const lines = [line(1, 'needs hospital-', 700), line(1, 'isation for a day.', 688)];
    const [s] = buildSentences(lines);
    expect(s.text).toBe('needs hospitalisation for a day.');
  });

  it('starts a new sentence at a list item', () => {
    const lines = [
      line(1, 'The following are covered:', 700),
      line(1, 'a) Room rent up to 2% of sum insured', 688),
      line(1, 'b) ICU charges up to 5%', 676),
    ];
    const texts = buildSentences(lines).map((s) => s.text);
    expect(texts).toEqual([
      'The following are covered:',
      'a) Room rent up to 2% of sum insured',
      'b) ICU charges up to 5%',
    ]);
  });

  it('links each list item to the sentence that starts its list', () => {
    const lines = [
      line(1, 'i. 24 Months waiting period', 700),
      line(1, '1. Tonsillectomy', 688),
      line(1, '2. Hernia of all types', 676),
      line(1, 'This is normal text again.', 664),
    ];
    const sentences = buildSentences(lines);
    expect(sentences.map((s) => s.leadId)).toEqual([null, 'S1', 'S1', null]);
  });

  it('keeps a short heading separate from the paragraph below it', () => {
    const lines = [line(1, '4.3. Cataract Treatment', 700), line(1, 'The Company shall pay.', 688)];
    const texts = buildSentences(lines).map((s) => s.text);
    expect(texts).toEqual(['4.3. Cataract Treatment', 'The Company shall pay.']);
  });
});

describe('removeHeadersAndFooters', () => {
  it('drops a line that repeats on most pages (page numbers ignored)', () => {
    const lines = [];
    for (let p = 1; p <= 4; p++) {
      lines.push(line(p, `Body text of page ${p} is unique ${'x'.repeat(p)}.`, 700));
      lines.push(line(p, `Policy Wording Page ${p} of 4`, 40));
    }
    const kept = removeHeadersAndFooters(lines, 4);
    expect(kept.length).toBe(4);
    expect(kept.every((l) => l.text.startsWith('Body'))).toBe(true);
  });
});
