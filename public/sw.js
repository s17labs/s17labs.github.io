/* s17 Labs Tools — minimal offline app shell.
   Network-first for same-origin navigations, cache-first for static assets,
   and an offline page when a navigation cannot be loaded. */
const CACHE_NAME = 's17labs-shell-v1';

// Relative to the registration scope so this also behaves at a subpath.
const SHELL = [
  '',
  'tools/',
  'offline.html',
  'favicon.ico',
  'fonts/aldrich-latin.woff2',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/apple-touch-icon.png',
];

const scope = self.registration.scope;
const shellUrl = (path) => new URL(path, scope).href;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL.map(shellUrl)))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  // Never touch third-party requests (Icon Maker's emoji CDN, etc.).
  if (new URL(request.url).origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        let response;
        try {
          response = await fetch(request, { cache: 'no-cache' });
        } catch {
          return (await caches.match(request)) || caches.match(shellUrl('offline.html'));
        }
        if (response.ok) {
          const copy = response.clone();
          try {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(request, copy);
          } catch {
            // Cache failures should not prevent an online page from loading.
          }
        }
        return response;
      })(),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
