// Open a PDF file in Node (used by the eval and tests, not by the browser).
import { readFile } from 'node:fs/promises';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

export async function loadPdfFromFile(path) {
  const bytes = await readFile(path);
  const data = new Uint8Array(bytes);
  const task = getDocument({ data, verbosity: 0 });
  return task.promise;
}
