import { describe, it, expect } from 'vitest';
import { findGutter, looksLikeTable, splitByGutter } from '../rag/ingest/columns.js';

const PAGE_WIDTH = 600;

// One row of text per y, either across the page or in two columns.
function fullWidthRow(y) {
  return { text: 'A normal line of text that runs across the whole page', x: 50, y, w: 500 };
}
function twoColumnRow(y) {
  return [
    { text: 'Left column text here', x: 50, y, w: 230 },
    { text: 'Right column text here', x: 320, y, w: 230 },
  ];
}

describe('findGutter', () => {
  it('finds no gutter on a normal page', () => {
    const pieces = [];
    for (let i = 0; i < 30; i++) pieces.push(fullWidthRow(800 - i * 14));
    expect(findGutter(pieces, PAGE_WIDTH)).toBeNull();
  });

  it('finds the gutter on a two-column page, even with a title across both columns', () => {
    const pieces = [fullWidthRow(820)];
    for (let i = 0; i < 20; i++) pieces.push(...twoColumnRow(800 - i * 14));
    const gutter = findGutter(pieces, PAGE_WIDTH);
    expect(gutter).toBeGreaterThan(280);
    expect(gutter).toBeLessThan(320);
  });
});

describe('findGutter on tables', () => {
  it('does not split a table of short cells into columns', () => {
    const pieces = [];
    for (let i = 0; i < 20; i++) {
      pieces.push({ text: 'Covered', x: 50, y: 800 - i * 14, w: 230 });
      pieces.push({ text: 'Not Covered', x: 320, y: 800 - i * 14, w: 230 });
    }
    expect(findGutter(pieces, PAGE_WIDTH)).toBeNull();
  });
});

describe('looksLikeTable', () => {
  it('says yes when the right side holds short limits', () => {
    const pieces = [];
    for (let i = 0; i < 10; i++) {
      pieces.push({ text: 'Deep brain stimulation and other long names', x: 50, y: 800 - i * 27, w: 230 });
      pieces.push({ text: 'Upto 50% of Sum Insured', x: 320, y: 806 - i * 27, w: 200 });
    }
    expect(looksLikeTable(pieces, 300)).toBe(true);
  });

  it('says no for two text columns with their own line spacing', () => {
    const pieces = [];
    for (let i = 0; i < 20; i++) {
      pieces.push({ text: 'The TENANT must take reasonable care to avoid damage', x: 50, y: 800 - i * 11, w: 230 });
      pieces.push({ text: 'The LANDLORD must not demand or receive any fee or', x: 320, y: 805 - i * 10.5, w: 230 });
    }
    expect(looksLikeTable(pieces, 300)).toBe(false);
  });
});

describe('splitByGutter', () => {
  it('puts each piece in the left column, the right column, or "spanning"', () => {
    const pieces = [fullWidthRow(820), ...twoColumnRow(800)];
    const { left, right, spanning } = splitByGutter(pieces, 300);
    expect(left.length).toBe(1);
    expect(right.length).toBe(1);
    expect(spanning.length).toBe(1);
  });
});
