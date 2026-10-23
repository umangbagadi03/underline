// Register the service worker (only in the built app), so Underline opens even with no internet.

export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js').catch((error) => {
    console.warn('Offline mode not available:', error);
  });
}
