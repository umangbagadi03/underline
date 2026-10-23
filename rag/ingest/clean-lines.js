// Remove page headers and footers (lines that repeat on most pages).

/** Make a "shape" of a line so "Page 3 of 37" and "Page 4 of 37" look the same. */
function lineShape(text) {
  const lower = text.toLowerCase();
  const noDigits = lower.replace(/\d+/g, '#');
  return noDigits.replace(/\s+/g, ' ').trim();
}

/** Drop lines whose shape shows up on at least half of the pages. */
export function removeHeadersAndFooters(lines, pageCount) {
  if (pageCount < 3) return lines;

  // For each shape, count on how many different pages it appears.
  const pagesByShape = new Map();
  for (const line of lines) {
    const shape = lineShape(line.text);
    if (!pagesByShape.has(shape)) pagesByShape.set(shape, new Set());
    pagesByShape.get(shape).add(line.page);
  }

  const minPages = Math.max(3, Math.ceil(pageCount / 2));
  return lines.filter((line) => {
    const pages = pagesByShape.get(lineShape(line.text));
    return pages.size < minPages;
  });
}
