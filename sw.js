// Offline support: network first (so updates arrive straight away), cache as fallback.
const CACHE = 'training-arc-v8';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/styles.css', 'icons/icon.svg', 'icons/icon-192.png',
  'js/app.js', 'js/store.js', 'js/engine.js', 'js/program.js', 'js/player.js', 'js/audio.js', 'js/sync.js', 'js/firebase-config.js',
  'js/data/exercises.js', 'js/data/workouts.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === location.origin;
  const fonts = url.hostname.includes('fonts.g');
  const fbLib = url.hostname === 'www.gstatic.com' && url.pathname.includes('firebasejs');
  if (!sameOrigin && !fonts && !fbLib) return; // let Firebase API calls go straight to the network
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then((r) => r || (req.mode === 'navigate' ? caches.match('index.html') : undefined))),
  );
});
