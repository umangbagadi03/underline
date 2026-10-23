import { describe, it, expect } from 'vitest';
import { readPageLines } from '../src/pdf/read-pdf.js';

// A fake pdf.js document with one page made of { text, x, y, w } pieces.
function fakePdf(pieces, view = [0, 0, 600, 842]) {
  const items = pieces.map((p) => ({ str: p.text, transform: [9, 0, 0, 9, p.x, p.y], width: p.w, height: 9 }));
  const noDrawing = { fnArray: [], argsArray: [] };
  const page = { view, getTextContent: async () => ({ items }), getOperatorList: async () => noDrawing };
  return { numPages: 1, getPage: async () => page };
}

describe('readPageLines', () => {
  it('moves a clause number out of the middle of a table cell', async () => {
    const pdf = fakePdf([
      { text: 'Health check-up up to Rs. 3,500 for every claim', x: 100, y: 500, w: 300 },
      { text: '2(L)', x: 540, y: 496, w: 12 },
      { text: 'free year', x: 100, y: 491, w: 50 },
    ]);
    const lines = await readPageLines(pdf, 1);
    expect(lines.map((l) => l.text)).toEqual(['Health check-up up to Rs. 3,500 for every claim', 'free year', '2(L)']);
  });

  it('reads a page that starts at x = 600 with two columns, left column first', async () => {
    const pieces = [];
    for (let i = 0; i < 12; i++) {
      pieces.push({ text: `Left rule line number ${i} with some words`, x: 640, y: 800 - i * 11, w: 240 });
      pieces.push({ text: `Right rule line number ${i} with some words`, x: 910, y: 805 - i * 10.5, w: 240 });
    }
    // A full-width box below the columns.
    pieces.push({ text: 'Schedule: items let with the premises and any additional terms', x: 640, y: 600, w: 500 });
    pieces.push({ text: 'This section lists any additional items and terms to this agreement', x: 640, y: 580, w: 280 });
    pieces.push({ text: 'The terms listed cannot take away any of the rights and duties', x: 921, y: 580, w: 240 });
    pieces.push({ text: 'Both the LANDLORD and TENANT should sign and date any attachments', x: 640, y: 569, w: 520 });
    const lines = await readPageLines(fakePdf(pieces, [609, 0, 1190, 842]), 1);
    const texts = lines.map((l) => l.text);
    expect(texts.indexOf('Left rule line number 11 with some words')).toBeLessThan(texts.indexOf('Right rule line number 0 with some words'));
  });
});
