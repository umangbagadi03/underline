// Underline REST API: the RAG engine as a local backend service.
// Listens on 127.0.0.1 only, so nothing outside this computer can reach it.
//
//   GET    /health                    engine status and default model
//   POST   /documents                 body = PDF bytes (header X-Filename optional) -> index it
//   GET    /documents                 list indexed documents
//   POST   /documents/:id/ask         { "question": "...", "model"?: "...", "searchOnly"?: true }
//   DELETE /documents/:id             forget a document
//
// Run: npm run serve   (PORT and UNDERLINE_MODEL / UNDERLINE_LLM_URL can be set in the environment)

import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { addDocument, listDocuments, hasDocument, removeDocument, ask, getEmbedder, DEFAULTS } from './engine.js';
import { listLocalModels } from '../rag/generation/providers/local-server.js';

const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT) || 8787;
const MAX_PDF_BYTES = 50 * 1024 * 1024;

function send(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
}

/** Read the whole request body, refusing anything over `limit` bytes. */
async function readBody(request, limit) {
  const parts = [];
  let size = 0;
  for await (const part of request) {
    size += part.length;
    if (size > limit) throw Object.assign(new Error('File too large (max 50 MB)'), { status: 413 });
    parts.push(part);
  }
  return Buffer.concat(parts);
}

async function health() {
  const models = await listLocalModels(DEFAULTS.llmUrl);
  return {
    ok: true,
    llm: { url: DEFAULTS.llmUrl, running: Boolean(models), model: DEFAULTS.model, modelInstalled: Boolean(models && models.includes(DEFAULTS.model)) },
    meaningSearch: Boolean(await getEmbedder()),
    documents: listDocuments().length,
  };
}

async function postDocument(request) {
  const bytes = await readBody(request, MAX_PDF_BYTES);
  if (bytes.subarray(0, 5).toString() !== '%PDF-') throw Object.assign(new Error('The body must be a PDF file'), { status: 400 });
  return addDocument(bytes, request.headers['x-filename'] || 'document.pdf');
}

async function postAsk(request, id) {
  const body = JSON.parse((await readBody(request, 64 * 1024)).toString() || '{}');
  const question = String(body.question || '').trim();
  if (!question) throw Object.assign(new Error('Send { "question": "..." }'), { status: 400 });
  return ask(id, question, { model: body.model, searchOnly: Boolean(body.searchOnly) });
}

/** Route one request. Returns [status, body]. */
async function route(request) {
  const { method } = request;
  const path = new URL(request.url, `http://${HOST}`).pathname;
  const match = path.match(/^\/documents\/([a-f0-9]+)(\/ask)?$/);

  if (method === 'GET' && path === '/health') return [200, await health()];
  if (method === 'GET' && path === '/documents') return [200, listDocuments()];
  if (method === 'POST' && path === '/documents') return [201, await postDocument(request)];
  if (match && !hasDocument(match[1])) return [404, { error: 'No document with this id' }];
  if (match && method === 'POST' && match[2]) return [200, await postAsk(request, match[1])];
  if (match && method === 'DELETE' && !match[2]) return [200, { deleted: removeDocument(match[1]) }];
  return [404, { error: 'Not found' }];
}

/** Make the server (not started yet). */
export function makeServer() {
  return createServer(async (request, response) => {
    try {
      const [status, body] = await route(request);
      send(response, status, body);
    } catch (error) {
      send(response, error.status || 500, { error: error.message });
    }
  });
}

// Started directly (not imported by a test): listen.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  makeServer().listen(PORT, HOST, () => console.log(`Underline API on http://${HOST}:${PORT}`));
}
