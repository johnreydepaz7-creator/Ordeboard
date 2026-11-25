// The production build supplies the cache name and the static file list.
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(cacheName);
    await cache.addAll(shell.map(path => new Request(path, { cache: 'reload', credentials: 'omit' })));
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith('ob-shell-') && name !== cacheName) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (request.mode === 'navigate' && (url.pathname === '/' || url.pathname === '/index.html')) {
    event.respondWith((async () => {
      // Serve HTML and its matching hashed assets from the same installed release.
      // The browser checks the worker for updates independently on navigation.
      const cache = await caches.open(cacheName);
      return (await cache.match('/index.html')) ?? fetch(request);
    })());
  } else if (shell.includes(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(cacheName);
      return (await cache.match(request)) ?? fetch(request);
    })());
  }
});
