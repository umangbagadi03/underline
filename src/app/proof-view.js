// The right column: one PDF page with the proof lines highlighted, plus page buttons.

import { byId } from './dom.js';
import { showPage } from '../ui/viewer.js';

let pdf = null;
let page = 1;
let highlighted = []; // sentences to highlight

function updateLabel() {
  byId('page-label').textContent = pdf ? `${page} / ${pdf.numPages}` : '';
  byId('prev-page').disabled = !pdf || page <= 1;
  byId('next-page').disabled = !pdf || page >= pdf.numPages;
}

async function draw() {
  updateLabel();
  if (!pdf) return;
  await showPage(byId('viewer'), pdf, page, highlighted);
}

function goTo(newPage) {
  if (!pdf) return;
  page = Math.min(Math.max(newPage, 1), pdf.numPages);
  draw();
}

/** Show a newly opened document (first page, no highlights). */
export function setProofDocument(newPdf) {
  pdf = newPdf;
  page = 1;
  highlighted = [];
  byId('proof-title').textContent = 'Document';
  draw();
}

/** Clear the viewer (no document). */
export function clearProof() {
  pdf = null;
  highlighted = [];
  byId('viewer').replaceChildren();
  byId('proof-title').textContent = 'Proof';
  updateLabel();
}

/** Jump to the page of these sentences and highlight them. */
export function showProof(sentences) {
  if (!pdf || sentences.length === 0) return;
  highlighted = sentences;
  page = sentences[0].page;
  byId('proof-title').textContent = 'Proof';
  byId('proof').classList.add('open'); // on small screens the viewer slides in
  draw();
}

/** Wire up the page buttons. */
export function setupProofView() {
  byId('prev-page').addEventListener('click', () => goTo(page - 1));
  byId('next-page').addEventListener('click', () => goTo(page + 1));
  byId('close-proof').addEventListener('click', () => byId('proof').classList.remove('open'));
  updateLabel();
}
