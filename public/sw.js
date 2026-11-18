/* s17 Labs Tools — minimal offline app shell.
   Cache-first for same-origin navigations and static assets, network fallback
   everywhere, and a brand-consistent offline page when both fail. */
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
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request)
            .then((response) => {
              const copy = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
              return response;
            })
            .catch(() => caches.match(shellUrl('offline.html'))),
      ),
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
