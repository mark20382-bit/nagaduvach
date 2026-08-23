/* Service worker: робить додаток доступним офлайн.
   Стратегія:
   - власні файли (HTML, manifest, іконки) — cache-first, з фоновим оновленням
   - шрифти Google — кешуються після першого онлайн-завантаження
   - усе інше — мережа, з відкатом на кеш
*/

const VERSION = 'v1';
const CORE_CACHE = 'nagaduvach-core-' + VERSION;
const RUNTIME_CACHE = 'nagaduvach-runtime-' + VERSION;

const CORE_ASSETS = [
  './',
  './index.html',
  './borgy.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CORE_CACHE)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names
          .filter((n) => n !== CORE_CACHE && n !== RUNTIME_CACHE)
          .map((n) => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Навігація (відкриття сторінки): спершу кеш, потім мережа
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match(req)
        .then((cached) => cached || fetch(req).catch(() => caches.match('./index.html')))
    );
    return;
  }

  // Власні файли
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            if (res && res.status === 200) {
              const copy = res.clone();
              caches.open(CORE_CACHE).then((c) => c.put(req, copy));
            }
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // Шрифти Google — кешуємо після першого завантаження
  if (url.hostname.endsWith('googleapis.com') || url.hostname.endsWith('gstatic.com')) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req)
          .then((res) => {
            if (res && (res.status === 200 || res.type === 'opaque')) {
              const copy = res.clone();
              caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy));
            }
            return res;
          })
          .catch(() => cached);
      })
    );
    return;
  }

  // Решта: мережа з відкатом на кеш
  event.respondWith(
    fetch(req).catch(() => caches.match(req))
  );
});
