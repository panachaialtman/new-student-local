const CACHE = 'new-student-local-v03-15';
const SHELL = [
  './', './index.html', './styles.css', './hub-reference.js', './reference-data.js', './builtin-templates.js', './ui-enhancements.js', './db.js', './zip.js', './docx-engine.js', './excel-export.js', './app.js',
  './manifest.webmanifest', './icon.svg', './templates-data/letter16_part1.txt', './templates-data/letter16_part2.txt', './templates-data/letter16_part3.txt', './templates-data/letter16_part4.txt', './templates-data/letter76_part1.txt', './templates-data/letter76_part2.txt', './templates-data/letter76_part3.txt', './templates-data/letter76_part4.txt', './templates-data/studentlist_part1.txt', './templates-data/studentlist_part2.txt', './templates-data/studentlist_part3.txt', './templates-data/exchange_part1.txt', './templates-data/exchange_part2.txt', './templates-data/exchange_part3.txt', './templates-data/exchange_part4.txt', './templates-data/exchange_part5.txt', './templates-data/non_o_part1.txt', './templates-data/non_o_part2.txt', './templates-data/non_o_part3.txt', './templates-data/non_o_part4.txt', './templates-data/non_o_part5.txt', './data/programs-1.json', './data/programs-2.json', './data/programs-3.json', './data/programs-4.json', './data/programs-5.json', './data/nationalities-1.json', './data/nationalities-2.json', './data/nationalities-3.json', './data/nationalities-4.json'
];
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  // Never intercept/copy cross-origin Hub API requests, nor serve HTML as JSON when offline.
  if (new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).then((response) => {
    const copy = response.clone();
    caches.open(CACHE).then((cache) => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html'))));
});
