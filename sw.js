/* ============================================================
   Delivery Search — Service Worker
   Strategy:
   - App shell (HTML/CSS/JS/manifest/icons): cache-first
   - Supabase API: network-only, with empty [] fallback
   ============================================================ */

const VERSION = 'v1.0.1';
const SHELL_CACHE = `delivery-shell-${VERSION}`;
const RUNTIME_CACHE = `delivery-runtime-${VERSION}`;

const SHELL_ASSETS = [
  './',
  './index.html',
  './search.html',
  './manifest.json',
  './icon-72.png',
  './icon-96.png',
  './icon-128.png',
  './icon-144.png',
  './icon-152.png',
  './icon-192.PNG',
  './icon-384.png',
  './icon-512.PNG',
  './icon-192-maskable.png',
  './icon-512-maskable.png'
];

/* ---------- Install ---------- */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
      .catch(err => console.warn('SW install failed:', err))
  );
});

/* ---------- Activate ---------- */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== SHELL_CACHE && k !== RUNTIME_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

/* ---------- Fetch ---------- */
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // Skip non-GET
  if (req.method !== 'GET') return;

  // 1) Supabase API → network only (app handles offline via localStorage)
  if (url.hostname.includes('supabase.co')) {
    event.respondWith(
      fetch(req).catch(() =>
        new Response('[]', {
          headers: { 'Content-Type': 'application/json' }
        })
      )
    );
    return;
  }

  // 2) Same-origin navigation → serve cached shell
  //    Try the exact page first, fall back to index.html
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match(req).then(cached => {
        if (cached) return cached;
        // If the exact page isn't cached, fall back to index.html
        return caches.match('./index.html').then(fallback => fallback || fetch(req));
      })
    );
    return;
  }

  // 3) Same-origin static assets → cache-first, then network + cache
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then(cached => {
        if (cached) return cached;

        return fetch(req).then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(RUNTIME_CACHE).then(c => c.put(req, clone));
          }
          return res;
        }).catch(() =>
          // Fallback to shell for failed assets
          caches.match('./index.html')
        );
      })
    );
  }
});

/* ---------- Message (allow manual update) ---------- */
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});