/* You vs You - offline shell.
   Caches the app files so it opens with no signal at the gym.
   The save endpoint (/api/state) is never cached, so data is always live.
   Bump CACHE when you deploy so phones pick up the new version. */

const CACHE = 'yvy-v2.1.0';
const SHELL = [
  './',
  'index.html',
  'fonts.css',
  'styles.css',
  'program-data.js',
  'exercise-meta.js',
  'app.js',
  'icon.svg',
  'icon-180.png',
  'manifest.json'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Never touch the data endpoint or anything cross-origin.
  if (url.pathname.startsWith('/api/') || url.origin !== self.location.origin) return;
  if (e.request.method !== 'GET') return;

  // Network first so a fresh deploy is picked up, cache as the fallback.
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match('index.html')))
  );
});
