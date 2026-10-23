// Column pages: find the empty strip down the middle (the "gutter"),
// so we can read the left column first, then the right column.
// The same search runs again inside each side, so 3- and 4-column pages work too.
// Without this, a line from the left column and a line from the right column
// at the same height get glued together into nonsense.

const BINS = 100; // the page width is split into 100 thin strips
const MIDDLE = [30, 70]; // the gutter must be in the middle part of the page
const MIN_GUTTER_BINS = 1; // at least 1% of the page width must be (nearly) empty
const MIN_CHARS_PER_ROW = 20; // real text columns have long lines; table cells ("Covered") are short
const MIN_BLOCK_CHARS_PER_ROW = 35; // stricter inside a block, where tables are common

/** Which strips (bins) of the area [left, left + width] a piece of text covers. */
function binsOf(piece, left, width) {
  const from = Math.max(0, Math.floor(((piece.x - left) / width) * BINS));
  const to = Math.min(BINS - 1, Math.floor(((piece.x + piece.w - left) / width) * BINS));
  return [from, to];
}

/** How many pieces cover each strip. */
function coverage(pieces, left, width) {
  const counts = new Array(BINS).fill(0);
  for (const piece of pieces) {
    const [from, to] = binsOf(piece, left, width);
    for (let b = from; b <= to; b++) counts[b]++;
  }
  return counts;
}

/** The longest run of nearly empty strips in the middle of the page: { start, end } or null. */
function emptiestRun(counts, allowed) {
  let best = null;
  let start = null;
  for (let b = MIDDLE[0]; b <= MIDDLE[1] + 1; b++) {
    const empty = b <= MIDDLE[1] && counts[b] <= allowed;
    if (empty && start === null) start = b;
    if (!empty && start !== null) {
      if (!best || b - start > best.end - best.start) best = { start, end: b };
      start = null;
    }
  }
  return best;
}

function charCount(pieces) {
  return pieces.reduce((sum, p) => sum + p.text.length, 0);
}

/** Number of different text rows (baselines) in a set of pieces. */
function rowCount(pieces) {
  const rows = new Set(pieces.map((p) => Math.round(p.y / 3)));
  return rows.size;
}

/** Average number of characters in one text row. */
function charsPerRow(pieces) {
  return charCount(pieces) / Math.max(1, rowCount(pieces));
}

/** How many pieces a cut at x would slice through. */
function crossings(pieces, x) {
  return pieces.filter((p) => p.x < x - 1 && p.x + p.w > x + 1).length;
}

/**
 * The exact x for the cut inside the empty strip [from, to]: the spot that slices
 * the fewest pieces (the strips are coarse, so their middle can clip a clause number).
 */
function bestCut(pieces, from, to) {
  const middle = (from + to) / 2;
  const edges = pieces.flatMap((p) => [p.x - 1, p.x + p.w + 1]).filter((x) => x > from && x < to);
  let best = middle;
  for (const x of edges) {
    const fewer = crossings(pieces, x) < crossings(pieces, best);
    const asGoodButCloser = crossings(pieces, x) === crossings(pieces, best) && Math.abs(x - middle) < Math.abs(best - middle);
    if (fewer || asGoodButCloser) best = x;
  }
  return best;
}

/**
 * Find the gutter of a two-column area. Returns its x position, or null for normal text.
 * The area runs from x = left to x = right (the whole page by default: 0 to page width).
 * A few pieces may cross the gutter (a title across both columns), so we allow a little.
 */
export function findGutter(pieces, right, left = 0) {
  const width = right - left;
  if (pieces.length < 20 || !(width > 0)) return null;
  const counts = coverage(pieces, left, width);
  const allowed = Math.max(1, Math.round(pieces.length * 0.04));
  const run = emptiestRun(counts, allowed);
  if (!run || run.end - run.start < MIN_GUTTER_BINS) return null;

  const runLeft = left + (run.start / BINS) * width;
  const runRight = left + (run.end / BINS) * width;
  const gutter = bestCut(pieces, runLeft, runRight);
  const leftSide = pieces.filter((p) => p.x + p.w <= gutter);
  const rightSide = pieces.filter((p) => p.x >= gutter);
  const total = charCount(pieces);
  // Both sides need real text over many rows, not just a margin note or a short table.
  const bothHaveText = charCount(leftSide) >= total * 0.25 && charCount(rightSide) >= total * 0.25;
  const bothHaveRows = rowCount(leftSide) >= 8 && rowCount(rightSide) >= 8;
  const bothAreProse = charsPerRow(leftSide) >= MIN_CHARS_PER_ROW && charsPerRow(rightSide) >= MIN_CHARS_PER_ROW;
  return bothHaveText && bothHaveRows && bothAreProse ? gutter : null;
}

/**
 * Inside a block, could these "two columns" really be a table (a name and its limit)?
 * Table cells hold short lines, or share their rows with the other side.
 * Real text columns have long lines and their own line spacing.
 */
export function looksLikeTable(pieces, gutter) {
  const leftSide = pieces.filter((p) => p.x + p.w <= gutter);
  const rightSide = pieces.filter((p) => p.x >= gutter);
  const shortLines = charsPerRow(leftSide) < MIN_BLOCK_CHARS_PER_ROW || charsPerRow(rightSide) < MIN_BLOCK_CHARS_PER_ROW;
  const rightRows = [...new Set(rightSide.map((p) => Math.round(p.y)))];
  const shared = rightRows.filter((y) => leftSide.some((p) => Math.abs(p.y - y) <= 1.5));
  return shortLines || shared.length >= rightRows.length * 0.4;
}

/** Split pieces into left column, right column, and pieces that span both. */
export function splitByGutter(pieces, gutter) {
  const left = [];
  const right = [];
  const spanning = [];
  for (const piece of pieces) {
    if (piece.x + piece.w <= gutter + 1) left.push(piece);
    else if (piece.x >= gutter - 1) right.push(piece);
    else spanning.push(piece);
  }
  return { left, right, spanning };
}
