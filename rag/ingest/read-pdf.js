// Read a PDF and return its text as lines, with where each line sits on the page.
// Works with any loaded pdf.js document (browser or Node).
// Pages with columns are read column by column (see columns.js).
// Tables with drawn borders are read cell by cell (see table-cells.js).

import { findGutter, looksLikeTable, splitByGutter } from './columns.js';
import { drawnBorders, mergeTableCells } from './table-cells.js';

// Two text pieces belong to the same line if their baselines are this close (PDF units).
const SAME_LINE_GAP = 2.5;

// A page is split into at most 4 columns (2 splits deep).
const MAX_SPLIT_DEPTH = 2;

// An empty strip across the page at least this many line heights tall separates two blocks.
const BLOCK_GAP_LINES = 1.5;

// A side label is a clause number in a table column, like "2(L)", "3.1" or "2(A,B,C)".
const SIDE_LABEL = /^\d[\d.]*\s*(?:\([A-Za-z0-9, ]+\))?$/;

/**
 * Turn one pdf.js text item into a simple piece: text + box.
 * PDF boxes start at the bottom-left of the page.
 */
function itemToPiece(item) {
  const t = item.transform; // [scaleX, skewX, skewY, scaleY, x, y]
  const fontHeight = Math.hypot(t[2], t[3]) || item.height || 10;
  return {
    text: item.str,
    x: t[4],
    y: t[5],
    w: item.width,
    h: fontHeight,
  };
}

/** Group pieces that share a baseline into lines, top of page first. */
function groupIntoLines(pieces) {
  const sorted = [...pieces].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  for (const piece of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - piece.y) <= SAME_LINE_GAP) {
      last.pieces.push(piece);
    } else {
      lines.push({ y: piece.y, pieces: [piece] });
    }
  }
  return lines;
}

/** Join the pieces of one line into text + one box around them. */
function finishLine(line, pageNumber) {
  const pieces = line.pieces.sort((a, b) => a.x - b.x);
  let text = '';
  let prevEnd = null;
  for (const p of pieces) {
    // Add a space when there is a visible gap and no space already.
    const gap = prevEnd === null ? 0 : p.x - prevEnd;
    const apart = gap > p.h * 0.15 || p.cell; // table cells always get a space between them
    const needsSpace = text && apart && !text.endsWith(' ') && !p.text.startsWith(' ');
    text += (needsSpace ? ' ' : '') + p.text;
    prevEnd = p.x + p.w;
  }
  const left = Math.min(...pieces.map((p) => p.x));
  const right = Math.max(...pieces.map((p) => p.x + p.w));
  const height = Math.max(...pieces.map((p) => p.h));
  return {
    page: pageNumber,
    text: text.replace(/\s+/g, ' ').trim(),
    x: left,
    y: line.y - height * 0.2, // a little below the baseline for letters like "g"
    w: right - left,
    h: height * 1.1,
  };
}

function leftOf(line) {
  return Math.min(...line.pieces.map((p) => p.x));
}

function rightOf(line) {
  return Math.max(...line.pieces.map((p) => p.x + p.w));
}

function lineText(line) {
  return line.pieces.map((p) => p.text).join('').trim();
}

/**
 * Is `line` a short side label sitting between two lines of one table cell?
 * Example: "...for every claim" / "2(L)" / "free year", where "2(L)" is in the
 * next column, centred between the cell's two lines.
 */
function isSideLabel(above, line, below) {
  if (!above || !below || !SIDE_LABEL.test(lineText(line))) return false;
  const lineHeight = Math.max(...line.pieces.map((p) => p.h));
  const tight = above.y - line.y <= lineHeight && line.y - below.y <= lineHeight;
  const toTheRight = leftOf(line) > rightOf(above) && leftOf(line) > rightOf(below);
  return tight && toTheRight;
}

/** Move side labels after the cell line below them, so they don't cut a sentence in two. */
function moveSideLabels(lines) {
  for (let i = 1; i < lines.length - 1; i++) {
    if (isSideLabel(lines[i - 1], lines[i], lines[i + 1])) {
      [lines[i], lines[i + 1]] = [lines[i + 1], lines[i]];
    }
  }
  return lines;
}

/** Turn pieces into finished lines, top of page first. */
function piecesToLines(pieces, pageNumber) {
  const grouped = moveSideLabels(groupIntoLines(pieces));
  return grouped.map((line) => finishLine(line, pageNumber));
}

/**
 * Lines of one area of a page (x from `left` to `right`), split into columns if it has them.
 * The search uses where the text really is, so a page with an empty half still works.
 */
function areaLines(pieces, left, right, pageNumber, depth, splitBlocks = true) {
  const textLeft = Math.max(left, Math.min(...pieces.map((p) => p.x)));
  const textRight = Math.min(right, Math.max(...pieces.map((p) => p.x + p.w)));
  let gutter = depth < MAX_SPLIT_DEPTH ? findGutter(pieces, textRight, textLeft) : null;
  // Inside a block, a table can look like two columns: keep its rows together.
  if (gutter !== null && !splitBlocks && looksLikeTable(pieces, gutter)) gutter = null;
  if (gutter !== null) return twoColumnLines(pieces, { left, gutter, right }, pageNumber, depth);

  // No columns over the whole area. A form page may still have a column part and a
  // full-width part, one above the other: then look for columns in each part.
  const blocks = splitBlocks && depth === 0 ? splitIntoBlocks(pieces) : [pieces];
  if (blocks.length === 1) return piecesToLines(pieces, pageNumber);
  return blocks.flatMap((block) => areaLines(block, left, right, pageNumber, depth, false));
}

/** Split pieces into blocks, top first, wherever a tall empty strip runs across the page. */
function splitIntoBlocks(pieces) {
  const rows = groupIntoLines(pieces); // top first
  const blocks = [[]];
  rows.forEach((row, i) => {
    const above = rows[i - 1];
    const lineHeight = Math.max(...row.pieces.map((p) => p.h));
    if (above && above.y - row.y > lineHeight * BLOCK_GAP_LINES) blocks.push([]);
    blocks[blocks.length - 1].push(...row.pieces);
  });
  return blocks;
}

/**
 * Lines of a two-column area in reading order.
 * Text that spans both columns (like a title) splits the area into bands;
 * inside each band we read the left column, then the right column.
 * Each column may itself have columns (a wide page with 4 columns).
 */
function twoColumnLines(pieces, area, pageNumber, depth) {
  const { left, right, spanning } = splitByGutter(pieces, area.gutter);
  const spanGroups = groupIntoLines(spanning); // top first
  const bandOf = (piece) => spanGroups.filter((g) => g.y > piece.y + 1).length;
  const bands = spanGroups.map(() => ({ left: [], right: [] }));
  bands.push({ left: [], right: [] });
  for (const piece of left) bands[bandOf(piece)].left.push(piece);
  for (const piece of right) bands[bandOf(piece)].right.push(piece);

  const lines = [];
  bands.forEach((band, i) => {
    if (i > 0) lines.push(finishLine(spanGroups[i - 1], pageNumber));
    lines.push(...areaLines(band.left, area.left, area.gutter, pageNumber, depth + 1));
    lines.push(...areaLines(band.right, area.gutter, area.right, pageNumber, depth + 1));
  });
  return lines;
}

/** Read one page and return its lines. */
export async function readPageLines(pdf, pageNumber) {
  const page = await pdf.getPage(pageNumber);
  const content = await page.getTextContent();
  const items = content.items.filter((item) => item.str && item.str.trim());
  const borders = drawnBorders(await page.getOperatorList());
  const pieces = mergeTableCells(items.map(itemToPiece), borders);
  const [pageLeft, , pageRight] = page.view; // some pages don't start at x = 0
  const lines = areaLines(pieces, pageLeft, pageRight, pageNumber, 0);
  return lines.filter((line) => line.text);
}

/** Read every page of the PDF. Returns { pageCount, lines }. */
export async function readPdfLines(pdf) {
  const lines = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const pageLines = await readPageLines(pdf, n);
    lines.push(...pageLines);
  }
  return { pageCount: pdf.numPages, lines };
}
