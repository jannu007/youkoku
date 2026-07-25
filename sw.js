const CACHE = 'youkoku-v1';
const ASSETS = ['./', './index.html', './assets/css/style.css', './assets/js/main.js', './manifest.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  // Only manage the homepage shell itself; let each app's own service worker
  // handle requests under /apps/<name>/ (more specific scopes win regardless,
  // this keeps the cache list accurate).
  if (new URL(e.request.url).pathname.includes('/apps/')) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-store' })
      .then((res) => {
        const clone = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
