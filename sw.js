const CACHE = 'new-student-local-v02-4';
const SHELL = [
  './', './index.html', './styles.css', './db.js', './zip.js', './docx-engine.js', './app.js',
  './manifest.webmanifest', './icon.svg', './data/programs-1.json', './data/programs-2.json', './data/programs-3.json', './data/programs-4.json', './data/programs-5.json', './data/nationalities-1.json', './data/nationalities-2.json', './data/nationalities-3.json', './data/nationalities-4.json'
];
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(fetch(event.request).then((response) => {
    const copy = response.clone();
    caches.open(CACHE).then((cache) => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html'))));
});
