// Underline app: connects the library, the chat, the AI engine and the proof viewer.

import '@fontsource-variable/inter';
import '@fontsource-variable/fraunces';
import './app.css';
import { byId } from './dom.js';
import { fillIcons } from './icons.js';
import { renderLibrary } from './library-view.js';
import { renderMessages, renderWelcome } from './chat-view.js';
import { startEngineCard, currentAsk, warmUp } from './engine-control.js';
import { setupProofView, setProofDocument, clearProof, showProof } from './proof-view.js';
import { setupDrop } from './drop.js';
import { setupTheme } from './theme.js';
import { registerServiceWorker } from './register-sw.js';
import { useLocalAssets } from '../../rag/retrieval/local-assets.js';
import { loadEmbedder } from '../../rag/retrieval/embed.js';
import { openPdf } from '../ui/load-pdf-browser.js';
import { indexPdf, addEmbeddings, answerQuestion } from '../../rag/pipeline.js';
import { fileId, saveDocument, saveVectors, updateDocument, listDocuments, loadDocument, deleteDocument } from '../store/documents.js';

// The open document: { id, name, pdf, index, history }
let current = null;
let embedderPromise = null;
let embedQueue = Promise.resolve(); // meaning-search jobs run one at a time

function setDocStatus(text) {
  byId('doc-status').textContent = text;
}

function setAskEnabled(enabled) {
  byId('question').disabled = !enabled;
  byId('ask').disabled = !enabled;
}

/** Load the small search model once (WebGPU if possible). */
function getEmbedder() {
  if (!embedderPromise) {
    const device = navigator.gpu ? 'webgpu' : 'wasm';
    embedderPromise = loadEmbedder(device);
  }
  return embedderPromise;
}

// ---------- Library ----------

async function refreshLibrary() {
  const docs = await listDocuments();
  const handlers = { open: openSaved, remove: removeDocument };
  renderLibrary(byId('library'), docs, current ? current.id : null, handlers);
  return docs;
}

// ---------- Chat ----------

function viewHelpers() {
  const pageOf = (id) => {
    const sentence = current.index.sentenceById.get(id);
    return sentence ? sentence.page : null;
  };
  const onCite = (ids) => {
    const sentences = ids.map((id) => current.index.sentenceById.get(id)).filter(Boolean);
    showProof(sentences);
  };
  return { pageOf, onCite };
}

function renderChat() {
  const messages = byId('messages');
  if (!current || current.history.length === 0) {
    renderWelcome(messages, current && current.name, (text) => ask(text), () => byId('file-input').click());
    return;
  }
  renderMessages(messages, current.history, viewHelpers());
}

/** What we keep of an answer (small enough to save with the document). */
function toMessage(question, result, modelName) {
  if (result.mode === 'search-only') {
    const chunks = result.chunks.map((c) => ({ text: c.text, sentenceIds: c.sentenceIds }));
    return { question, mode: 'search-only', chunks };
  }
  const closest = result.chunks.slice(0, 3).map((c) => ({ text: c.text, sentenceIds: c.sentenceIds }));
  return { question, mode: 'answer', verification: result.verification, rawAnswer: result.rawAnswer, stats: result.stats, modelName, closest };
}

async function ask(question) {
  if (!current || !question.trim()) return;
  const doc = current;
  const pending = { question, pending: true, streamed: '' };
  doc.history.push(pending);
  renderChat();
  setAskEnabled(false);

  const { ask: askModel, modelName } = currentAsk();
  const onToken = (piece) => {
    pending.streamed += piece;
    if (doc === current) renderChat();
  };
  let message;
  try {
    const embedder = doc.index.vectors ? await getEmbedder() : null;
    const result = await answerQuestion(doc.index, question, embedder, askModel, onToken);
    message = toMessage(question, result, modelName);
  } catch (error) {
    message = { question, error: error.message };
  }
  doc.history[doc.history.indexOf(pending)] = message;
  await updateDocument(doc.id, { history: doc.history });
  if (doc === current) {
    renderChat();
    setAskEnabled(true);
    byId('question').focus();
  }
  // Show the proof of the first checked sentence right away.
  const first = message.verification && message.verification.kept[0];
  if (doc === current && first && message.verification.status === 'answered') viewHelpers().onCite(first.ids);
}

// ---------- Opening documents ----------

/** Add meaning search to one document, then save it. Keyword search works meanwhile. */
async function runEmbeddings(doc) {
  try {
    const embedder = await getEmbedder();
    const onProgress = (done, total) => {
      if (doc === current) setDocStatus(`${doc.index.pageCount} pages · improving search ${Math.round((100 * done) / total)}%`);
    };
    await addEmbeddings(doc.index, embedder, onProgress);
    await saveVectors(doc.id, doc.index.vectors);
    if (doc === current) setDocStatus(`${doc.index.pageCount} pages · ready`);
  } catch (error) {
    console.warn('Meaning search failed, keyword search still works:', error);
    if (doc === current) setDocStatus(`${doc.index.pageCount} pages · ready (keyword search)`);
  }
}

/** Jobs run one at a time, so several new PDFs don't overload the computer. */
function queueEmbeddings(doc) {
  embedQueue = embedQueue.then(() => runEmbeddings(doc));
}

/** Make a document the open one. */
function showDocument(doc) {
  current = doc;
  byId('doc-title').textContent = doc.name;
  setDocStatus(`${doc.index.pageCount} pages · ${doc.index.vectors ? 'ready' : 'improving search…'}`);
  setProofDocument(doc.pdf);
  setAskEnabled(true);
  renderChat();
  refreshLibrary();
  byId('sidebar').classList.remove('open');
  if (!doc.index.vectors) queueEmbeddings(doc);
}

/** Open a saved document. */
async function openSaved(id) {
  const saved = await loadDocument(id);
  if (!saved) return;
  const pdf = await openPdf(saved.bytes);
  showDocument({ id, name: saved.name, pdf, index: saved.index, history: saved.history });
}

/** Add a new PDF (or open it if it was added before). */
async function addFile(file) {
  const isPdf = file && (file.type === 'application/pdf' || /\.pdf$/i.test(file.name));
  if (!isPdf) {
    alert('Please choose a PDF file.');
    return;
  }
  const bytes = await file.arrayBuffer();
  const id = await fileId(bytes);
  const docs = await listDocuments();
  if (docs.some((d) => d.id === id)) {
    await openSaved(id);
    return;
  }
  byId('doc-title').textContent = file.name;
  setDocStatus('Reading…');
  setAskEnabled(false);
  try {
    const pdf = await openPdf(bytes);
    const index = await indexPdf(pdf);
    if (index.sentences.length === 0) {
      setDocStatus('');
      alert('This PDF has no text we can read (it may be a scan). Scanned PDFs are not supported yet.');
      return;
    }
    await saveDocument(id, file.name, bytes, index);
    showDocument({ id, name: file.name, pdf, index, history: [] });
  } catch (error) {
    setDocStatus('');
    alert(`Could not open this PDF: ${error.message}`);
  }
}

async function removeDocument(id, name) {
  if (!confirm(`Delete "${name}" from this computer?`)) return;
  await deleteDocument(id);
  if (current && current.id === id) {
    current = null;
    byId('doc-title').textContent = 'No document open';
    setDocStatus('');
    setAskEnabled(false);
    clearProof();
    renderChat();
  }
  refreshLibrary();
}

// ---------- Start ----------

async function start() {
  useLocalAssets();
  fillIcons();
  setupTheme(byId('theme'));
  setupProofView();
  setupDrop({ onFile: addFile, button: byId('add-pdf'), input: byId('file-input'), overlay: byId('drop-overlay') });
  byId('composer').addEventListener('submit', (event) => {
    event.preventDefault();
    const input = byId('question');
    const question = input.value;
    input.value = '';
    ask(question);
  });
  byId('question').addEventListener('focus', warmUp);
  byId('open-sidebar').addEventListener('click', () => byId('sidebar').classList.toggle('open'));
  renderChat();
  registerServiceWorker();
  startEngineCard(byId('engine'));

  // Reopen the most recent document.
  const docs = await refreshLibrary();
  if (docs.length) await openSaved(docs[0].id);
}

start();
