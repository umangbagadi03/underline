// Open a PDF in the browser with pdf.js. All pdf.js files are served by this app (see scripts/setup-assets.js).

import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = workerUrl;

const PDFJS_DATA = {
  standardFontDataUrl: '/pdfjs/standard_fonts/',
  cMapUrl: '/pdfjs/cmaps/',
  cMapPacked: true,
  wasmUrl: '/pdfjs/wasm/',
};

/**
 * Open PDF bytes (ArrayBuffer).
 * pdf.js takes over the bytes it gets, so we give it a copy and the caller keeps the original.
 */
export async function openPdf(bytes) {
  const data = new Uint8Array(bytes.slice(0));
  const task = getDocument({ data, ...PDFJS_DATA });
  return task.promise;
}

/** Open a PDF from a URL (used by the eval page). */
export async function openPdfUrl(url) {
  const response = await fetch(url);
  const bytes = await response.arrayBuffer();
  return openPdf(bytes);
}
