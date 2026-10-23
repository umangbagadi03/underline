// Tables with drawn borders: find each cell from the border lines,
// so the text of one cell is read together and not mixed with the cell next to it.
// Without this, a row like
//   | Reimbursement of hospitalization, | Claim must be filed within 15 days |
//   | day care and pre hospitalization  | from the date of discharge from the |
// is read line by line: "... within 15 days day care and pre hospitalization from the date ...".

// pdf.js drawing operator numbers (the same in every pdf.js build; a test checks them).
export const OPS = {
  save: 10,
  restore: 11,
  transform: 12,
  endPath: 28,
  paintFormXObjectBegin: 74,
  paintFormXObjectEnd: 75,
  constructPath: 91,
};

// pdf.js path steps inside constructPath.
const MOVE_TO = 0;
const LINE_TO = 1;
const CURVE_TO = 2;
const QUAD_TO = 3;
const CLOSE = 4;

const FLAT = 1; // a border line is at most this thick (PDF units)
const MIN_SEGMENT = 3; // shorter lines are dots or letter parts, not borders
const NEAR = 2; // how close counts as "the same line" or "touching"
const MAX_CELL_LINES = 8; // a bigger box is a framed page or column, not a table cell

/** Multiply two pdf transforms [a, b, c, d, e, f]. */
function multiply(m, n) {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

function apply(m, x, y) {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** Sort one straight segment into horizontal or vertical borders (others are ignored). */
function addSegment(borders, [x0, y0], [x1, y1]) {
  const flatY = Math.abs(y1 - y0) <= FLAT && Math.abs(x1 - x0) >= MIN_SEGMENT;
  const flatX = Math.abs(x1 - x0) <= FLAT && Math.abs(y1 - y0) >= MIN_SEGMENT;
  if (flatY) borders.horizontal.push({ y: (y0 + y1) / 2, from: Math.min(x0, x1), to: Math.max(x0, x1) });
  if (flatX) borders.vertical.push({ x: (x0 + x1) / 2, from: Math.min(y0, y1), to: Math.max(y0, y1) });
}

/** Add the straight segments of one drawn path (already in pdf.js step format). */
function addPath(borders, data, matrix) {
  let current = null;
  let start = null;
  for (let i = 0; i < data.length; ) {
    const step = data[i++];
    if (step === MOVE_TO || step === LINE_TO) {
      const point = apply(matrix, data[i++], data[i++]);
      if (step === LINE_TO && current) addSegment(borders, current, point);
      if (step === MOVE_TO) start = point;
      current = point;
    } else if (step === CURVE_TO) {
      current = apply(matrix, data[i + 4], data[i + 5]);
      i += 6;
    } else if (step === QUAD_TO) {
      current = apply(matrix, data[i + 2], data[i + 3]);
      i += 4;
    } else if (step === CLOSE) {
      if (current && start) addSegment(borders, current, start);
      current = start;
    } else {
      return; // unknown step: stop reading this path
    }
  }
}

/**
 * All straight horizontal and vertical lines drawn on a page, in the same
 * coordinates as the text. Returns { horizontal: [{ y, from, to }], vertical: [{ x, from, to }] }.
 */
export function drawnBorders(operatorList) {
  const borders = { horizontal: [], vertical: [] };
  const stack = [];
  let matrix = [1, 0, 0, 1, 0, 0];
  const { fnArray, argsArray } = operatorList;
  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    const args = argsArray[i];
    if (fn === OPS.save) stack.push(matrix);
    else if (fn === OPS.restore) matrix = stack.pop() || matrix;
    else if (fn === OPS.transform) matrix = multiply(matrix, args);
    else if (fn === OPS.paintFormXObjectBegin) {
      stack.push(matrix);
      if (args && args[0]) matrix = multiply(matrix, args[0]);
    } else if (fn === OPS.paintFormXObjectEnd) matrix = stack.pop() || matrix;
    else if (fn === OPS.constructPath) {
      const [paint, [data]] = args;
      if (paint !== OPS.endPath && data) addPath(borders, data, matrix); // endPath = a clip, not drawn
    }
  }
  return borders;
}

/** The box made by the nearest borders around a point, or null if it is not closed on all 4 sides. */
function boxAround(borders, piece) {
  const x = piece.x + piece.w / 2;
  const y = piece.y + piece.h * 0.3;
  const coversY = (line) => line.from - NEAR <= y && y <= line.to + NEAR;
  const coversX = (line) => line.from - NEAR <= x && x <= line.to + NEAR;
  const lefts = borders.vertical.filter((v) => v.x <= piece.x + NEAR && coversY(v)).map((v) => v.x);
  const rights = borders.vertical.filter((v) => v.x >= piece.x + piece.w - NEAR && coversY(v)).map((v) => v.x);
  const tops = borders.horizontal.filter((h) => h.y > y && coversX(h)).map((h) => h.y);
  const bottoms = borders.horizontal.filter((h) => h.y < y && coversX(h)).map((h) => h.y);
  if (!lefts.length || !rights.length || !tops.length || !bottoms.length) return null;
  const box = { left: Math.max(...lefts), right: Math.min(...rights), top: Math.min(...tops), bottom: Math.max(...bottoms) };
  return isClosed(borders, box) ? box : null;
}

/** How much of [from, to] the lines cover, from 0 to 1 (lines may overlap or have gaps). */
function coveredShare(lines, from, to) {
  const parts = lines.map((l) => [Math.max(l.from, from), Math.min(l.to, to)]).filter(([a, b]) => b > a);
  parts.sort((a, b) => a[0] - b[0]);
  let covered = 0;
  let reach = from;
  for (const [a, b] of parts) {
    if (b > reach) covered += b - Math.max(a, reach);
    reach = Math.max(reach, b);
  }
  return covered / Math.max(1, to - from);
}

/** Is the box really drawn all round? (Tiny strokes of a logo can look like borders nearby.) */
function isClosed(borders, box) {
  const at = (lines, key, value) => lines.filter((l) => Math.abs(l[key] - value) <= NEAR);
  const sideOk = (lines, from, to) => coveredShare(lines, from + NEAR, to - NEAR) >= 0.9;
  return (
    sideOk(at(borders.vertical, 'x', box.left), box.bottom, box.top) &&
    sideOk(at(borders.vertical, 'x', box.right), box.bottom, box.top) &&
    sideOk(at(borders.horizontal, 'y', box.top), box.left, box.right) &&
    sideOk(at(borders.horizontal, 'y', box.bottom), box.left, box.right)
  );
}

const keyOf = (box) => [box.left, box.right, box.top, box.bottom].map(Math.round).join(',');

/** Join the text of one cell: its lines top to bottom, words left to right. */
function cellText(pieces) {
  const sorted = [...pieces].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  for (const piece of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - piece.y) <= 2.5) last.pieces.push(piece);
    else lines.push({ y: piece.y, pieces: [piece] });
  }
  const texts = lines.map((line) => line.pieces.sort((a, b) => a.x - b.x).map((p) => p.text.trim()).join(' '));
  // A word broken over two lines ("pre-" + "hospitalisation") is joined back without a space.
  const joined = texts.reduce((all, line) => (/[a-z]-$/i.test(all) && /^[a-z]/.test(line) ? all + line : `${all} ${line}`));
  return { text: joined.replace(/\s+/g, ' ').trim(), lineCount: lines.length };
}

/**
 * Drop lines that run through words: a real cell border never does.
 * (Strokes of a big logo or watermark behind the text often do.)
 */
function bordersBesideText(borders, pieces) {
  const throughX = (v) =>
    pieces.some((p) => p.x + NEAR < v.x && v.x < p.x + p.w - NEAR && v.from < p.y + p.h * 0.7 && v.to > p.y + p.h * 0.1);
  const throughY = (h) =>
    pieces.some((p) => p.y + p.h * 0.1 < h.y && h.y < p.y + p.h * 0.7 && h.from < p.x + p.w - NEAR && h.to > p.x + NEAR);
  return { horizontal: borders.horizontal.filter((h) => !throughY(h)), vertical: borders.vertical.filter((v) => !throughX(v)) };
}

/** The smallest found cell that holds the middle of a piece, or null. */
function cellContaining(cells, piece) {
  const x = piece.x + piece.w / 2;
  const y = piece.y + piece.h * 0.3;
  const holds = (c) => c.box.left < x && x < c.box.right && c.box.bottom < y && y < c.box.top;
  const area = (c) => (c.box.right - c.box.left) * (c.box.top - c.box.bottom);
  const homes = cells.filter(holds).sort((a, b) => area(a) - area(b));
  return homes[0] || null;
}

const rowKey = (box) => `${Math.round(box.top)},${Math.round(box.bottom)}`;

/**
 * The rows (by rowKey) that belong to a real table: a row with at least 2 cells,
 * whose column borders line up with another such row. One row alone is more likely
 * a ruled box around two text columns than a table.
 */
function rowsOfRealTables(cells) {
  const rows = new Map();
  for (const cell of cells) {
    const key = rowKey(cell.box);
    if (!rows.has(key)) rows.set(key, []);
    rows.get(key).push(cell.box.left, cell.box.right);
  }
  const candidates = [...rows].filter(([, edges]) => edges.length >= 4); // at least 2 cells
  const sharedEdges = (a, b) => a.filter((x) => b.some((y) => Math.abs(x - y) <= NEAR)).length;
  const real = new Set();
  for (const [key, edges] of candidates) {
    const linedUp = candidates.some(([other, otherEdges]) => other !== key && sharedEdges(edges, otherEdges) >= 3);
    if (linedUp) real.add(key);
  }
  return real;
}

/**
 * Replace the pieces inside table cells with one piece per cell.
 * Only real tables count (see rowsOfRealTables).
 * Each cell piece covers its whole cell, so cells of one row end up on one line.
 */
export function mergeTableCells(pieces, allBorders) {
  const borders = bordersBesideText(allBorders, pieces);
  if (!borders.horizontal.length || !borders.vertical.length) return pieces;
  const cells = new Map();
  const loose = [];
  for (const piece of pieces) {
    const box = boxAround(borders, piece);
    if (!box) {
      loose.push(piece);
      continue;
    }
    const key = keyOf(box);
    if (!cells.has(key)) cells.set(key, { box, pieces: [] });
    cells.get(key).pieces.push(piece);
  }

  // A word whose own search hit a stray stroke still belongs to the cell it sits in.
  const stillLoose = [];
  for (const piece of loose) {
    const home = cellContaining([...cells.values()], piece);
    if (home) home.pieces.push(piece);
    else stillLoose.push(piece);
  }

  const tableRows = rowsOfRealTables([...cells.values()]);
  const merged = [...stillLoose];
  for (const cell of cells.values()) {
    const { text, lineCount } = cellText(cell.pieces);
    const inTable = tableRows.has(rowKey(cell.box)) && lineCount <= MAX_CELL_LINES;
    if (!inTable) {
      merged.push(...cell.pieces);
      continue;
    }
    const { left, right, top, bottom } = cell.box;
    const height = (top - bottom) / 1.1; // a line box is drawn 1.1 x height tall, from 0.2 x height below y
    merged.push({ text, x: left + 1, y: bottom + height * 0.2, w: right - left - 2, h: height, cell: true });
  }
  return merged;
}
