// A tiny wrapper around IndexedDB (the browser's built-in database).
// Everything stays on this device.

const DB_NAME = 'underline';
const DB_VERSION = 1;
const STORE = 'documents';

/** Turn an IndexedDB request into a promise. */
function done(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

let opening = null;

/** Open the database once (creates it the first time). */
function openDb() {
  if (opening) return opening;
  const request = indexedDB.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
  };
  opening = done(request);
  return opening;
}

/** Run one action on the documents store. */
async function withStore(mode, action) {
  const db = await openDb();
  const transaction = db.transaction(STORE, mode);
  const store = transaction.objectStore(STORE);
  return done(action(store));
}

export function putRecord(record) {
  return withStore('readwrite', (store) => store.put(record));
}

export function getRecord(id) {
  return withStore('readonly', (store) => store.get(id));
}

export function getAllRecords() {
  return withStore('readonly', (store) => store.getAll());
}

export function deleteRecord(id) {
  return withStore('readwrite', (store) => store.delete(id));
}
