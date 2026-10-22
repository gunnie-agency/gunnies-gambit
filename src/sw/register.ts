/**
 * Installs the service worker that keeps the app working offline. Production builds only: in development it would
 * serve stale modules. It starts after the page has loaded, so its downloads never compete with the first paint.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // Offline support is an extra: without it the app works exactly as before.
    });
  });
}
