self.addEventListener('install', (e) => {
  self.skipWaiting();
});
self.addEventListener('fetch', (e) => {
  // Let the network handle API calls, cache static assets if we wanted to
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
