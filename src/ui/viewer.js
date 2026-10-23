// Show one PDF page and paint yellow boxes over the proof lines.

const MIN_SCALE = 0.6;
const MAX_SCALE = 2;

// Each render gets a number; an older render that finishes late is thrown away.
let renderCount = 0;

/** Move a PDF point onto the rendered page, using the page's transform [a, b, c, d, e, f]. */
function toScreenPoint(viewport, x, y) {
  const [a, b, c, d, e, f] = viewport.transform;
  return [a * x + c * y + e, b * x + d * y + f];
}

/** Turn a PDF box (origin bottom-left) into a screen box on the rendered page. */
function toScreenBox(viewport, box) {
  const [x1, y1] = toScreenPoint(viewport, box.x, box.y);
  const [x2, y2] = toScreenPoint(viewport, box.x + box.w, box.y + box.h);
  const left = Math.min(x1, x2);
  const top = Math.min(y1, y2);
  const width = Math.abs(x2 - x1);
  const height = Math.abs(y2 - y1);
  return { left, top, width, height };
}

/** Make one yellow highlight div. */
function makeHighlight(screenBox) {
  const div = document.createElement('div');
  div.className = 'highlight';
  div.style.left = `${screenBox.left}px`;
  div.style.top = `${screenBox.top}px`;
  div.style.width = `${screenBox.width}px`;
  div.style.height = `${screenBox.height}px`;
  return div;
}

/** Scale so the page fits the width of the container. */
function fitScale(container, page) {
  const natural = page.getViewport({ scale: 1 });
  const available = container.clientWidth - 32; // minus padding
  const scale = available / natural.width;
  return Math.min(Math.max(scale, MIN_SCALE), MAX_SCALE);
}

/**
 * Render `pageNumber` into `container` and highlight the given sentences.
 * Scrolls the first highlight into view.
 */
export async function showPage(container, pdf, pageNumber, sentences) {
  const myRender = ++renderCount;
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: fitScale(container, page) });

  const canvas = document.createElement('canvas');
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.floor(viewport.width * ratio);
  canvas.height = Math.floor(viewport.height * ratio);
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;
  const context = canvas.getContext('2d');
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  await page.render({ canvasContext: context, viewport, canvas }).promise;
  if (myRender !== renderCount) return; // a newer page was asked for meanwhile

  const wrapper = document.createElement('div');
  wrapper.className = 'page';
  wrapper.style.width = `${viewport.width}px`;
  wrapper.style.height = `${viewport.height}px`;
  wrapper.appendChild(canvas);

  const onThisPage = sentences.filter((s) => s.page === pageNumber);
  for (const sentence of onThisPage) {
    for (const box of sentence.boxes) {
      wrapper.appendChild(makeHighlight(toScreenBox(viewport, box)));
    }
  }

  container.replaceChildren(wrapper);
  const first = wrapper.querySelector('.highlight');
  if (first) first.scrollIntoView({ block: 'center', behavior: 'smooth' });
  else container.scrollTop = 0;
}
