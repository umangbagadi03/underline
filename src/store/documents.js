// Save and load documents (the PDF + its search index + chat history) on this device.

import { putRecord, getRecord, getAllRecords, deleteRecord } from './db.js';
import { restoreIndex } from '../search/retrieve.js';

/** A short fingerprint of the file, so the same PDF is only stored once. */
export async function fileId(bytes) {
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  const hex = [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0'));
  return hex.join('').slice(0, 24);
}

/** Save a document. `index.vectors` may still be null (meaning search not done yet). */
export async function saveDocument(id, name, bytes, index, history = []) {
  const vectors = index.vectors ? index.vectors.map((v) => Float32Array.from(v)) : null;
  const record = {
    id,
    name,
    bytes,
    addedAt: Date.now(),
    pageCount: index.pageCount,
    sentences: index.sentences,
    chunks: index.chunks,
    vectors,
    history,
  };
  await putRecord(record);
}

/** Update only the parts that change later (vectors, chat history). */
export async function updateDocument(id, changes) {
  const record = await getRecord(id);
  if (!record) return;
  await putRecord({ ...record, ...changes });
}

/** Save the meaning-search vectors once they are ready. */
export async function saveVectors(id, vectors) {
  const compact = vectors.map((v) => Float32Array.from(v));
  await updateDocument(id, { vectors: compact });
}

/** List saved documents (newest first), without the heavy parts. */
export async function listDocuments() {
  const records = await getAllRecords();
  const list = records.map((r) => ({ id: r.id, name: r.name, pageCount: r.pageCount, addedAt: r.addedAt }));
  return list.sort((a, b) => b.addedAt - a.addedAt);
}

/** Load a saved document. Returns { id, name, bytes, index, history } or null. */
export async function loadDocument(id) {
  const record = await getRecord(id);
  if (!record) return null;
  const index = restoreIndex(record.sentences, record.chunks, record.vectors);
  index.pageCount = record.pageCount;
  return { id, name: record.name, bytes: record.bytes, index, history: record.history || [] };
}

export function deleteDocument(id) {
  return deleteRecord(id);
}
