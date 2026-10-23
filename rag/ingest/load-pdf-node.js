// Open a PDF in Node (used by the API server, the CLI, the eval and the tests; the browser has its own loader).
import { readFile } from 'node:fs/promises';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

/** Open a PDF from its bytes. */
export async function loadPdfFromBytes(bytes) {
  const data = new Uint8Array(bytes); // pdf.js takes ownership of this copy
  const task = getDocument({ data, verbosity: 0 });
  return task.promise;
}

/** Open a PDF file from disk. */
export async function loadPdfFromFile(path) {
  return loadPdfFromBytes(await readFile(path));
}
