/* You vs You - offline shell.
   Caches the app files so it opens with no signal at the gym.
   /api/* is never cached, so your data is always live.
   BUMP CACHE ON EVERY DEPLOY or installed phones keep the old version. */

const CACHE = 'yvy-v3.1.0';
const SHELL = [
  './',
  'index.html',
  'fonts.css',
  'styles.css',
  'program-data.js',
  'ppl-data.js',
  'circuits-data.js',
  'exercise-meta.js',
  'app-circuits.js',
  'app-extras.js',
  'app.js',
  'icon.svg',
  'icon-180.png',
  'manifest.json',

  // Movement art for the guided routines. ~650 KB in all, cached so the
  // routines are fully illustrated at a gym with no signal.
  'images/core/adductor-rock-back.png',
  'images/core/bicycle-crunch.png',
  'images/core/bird-dog.png',
  'images/core/breathing.png',
  'images/core/copenhagen-hold.png',
  'images/core/dead-bug.png',
  'images/core/forearm-plank.png',
  'images/core/glute-bridge-hold.png',
  'images/core/glute-bridge-reps.png',
  'images/core/high-plank-shift.png',
  'images/core/hip-90-90.png',
  'images/core/hip-flexor-march.png',
  'images/core/hollow-hold.png',
  'images/core/leg-lowers.png',
  'images/core/mountain-climber.png',
  'images/core/plank-shoulder-tap.png',
  'images/core/russian-twist.png',
  'images/core/side-plank.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      // addAll fails the whole install if any one file 404s, so each is added
      // on its own and a missing optional file never breaks the install.
      .then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
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
