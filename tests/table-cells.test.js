import { describe, it, expect } from 'vitest';
import { OPS as PDFJS_OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { OPS, drawnBorders, mergeTableCells } from '../src/pdf/table-cells.js';

// A pdf.js operator list that draws the given rectangles (x, y, w, h) as outlines.
function drawRects(rects) {
  const data = rects.flatMap(([x, y, w, h]) => [0, x, y, 1, x + w, y, 1, x + w, y + h, 1, x, y + h, 4]);
  return { fnArray: [OPS.constructPath], argsArray: [[20, [data], null]] };
}

// A 2-column, 3-row table: rows 20 units tall, columns at x 100-200 and 200-300.
const GRID = [0, 1, 2].flatMap((row) => [
  [100, 500 - row * 20, 100, 20],
  [200, 500 - row * 20, 100, 20],
]);

describe('table cells', () => {
  it('uses the same operator numbers as pdf.js', () => {
    for (const [name, value] of Object.entries(OPS)) expect(PDFJS_OPS[name]).toBe(value);
  });

  it('finds the border lines of drawn rectangles', () => {
    const borders = drawnBorders(drawRects(GRID));
    expect(borders.horizontal.length).toBeGreaterThan(0);
    expect(borders.vertical.length).toBeGreaterThan(0);
  });

  it('reads a wrapped cell as one piece, so cells are not mixed line by line', () => {
    const borders = drawnBorders(drawRects(GRID));
    const pieces = [
      { text: 'Reimbursement of', x: 105, y: 510, w: 80, h: 6 },
      { text: 'hospitalization', x: 105, y: 503, w: 80, h: 6 },
      { text: 'Within 15 days', x: 205, y: 510, w: 80, h: 6 },
      { text: 'of discharge', x: 205, y: 503, w: 80, h: 6 },
      { text: 'Post', x: 105, y: 490, w: 30, h: 6 },
      { text: 'Within 30 days', x: 205, y: 490, w: 80, h: 6 },
    ];
    const merged = mergeTableCells(pieces, borders);
    const texts = merged.map((p) => p.text);
    expect(texts).toContain('Reimbursement of hospitalization');
    expect(texts).toContain('Within 15 days of discharge');
  });

  it('leaves text alone inside a single ruled box (not a table)', () => {
    const borders = drawnBorders(drawRects([[100, 400, 400, 100]]));
    const pieces = [
      { text: 'A note in a box', x: 110, y: 480, w: 100, h: 6 },
      { text: 'second line', x: 110, y: 470, w: 100, h: 6 },
    ];
    expect(mergeTableCells(pieces, borders)).toEqual(pieces);
  });
});
