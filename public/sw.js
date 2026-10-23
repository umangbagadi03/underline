// Service worker: keeps a copy of the app's own files so Underline opens with no internet.
// Only files from this app are cached. Requests to the local AI engine are never touched.

const CACHE = 'underline-v1';
const START_FILES = ['/', '/index.html', '/icon.svg', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(START_FILES)));
  self.skipWaiting();
});

// Remove caches from older versions.
self.addEventListener('activate', (event) => {
  const cleanup = caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))));
  event.waitUntil(cleanup);
  self.clients.claim();
});

/** Page loads: try the network first (to get updates), fall back to the saved copy. */
async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request)) || cache.match('/index.html');
  }
}

/** Other files (scripts, models): use the saved copy, else download and save it. */
async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const saved = await cache.match(request);
  if (saved) return saved;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const sameApp = url.origin === self.location.origin;
  if (event.request.method !== 'GET' || !sameApp) return;
  const isPage = event.request.mode === 'navigate';
  event.respondWith(isPage ? networkFirst(event.request) : cacheFirst(event.request));
});
