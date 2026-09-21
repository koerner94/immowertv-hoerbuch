/* Damit die App auch ohne Netz laeuft, etwa im Zug oder im Keller eines Objekts.
   Bei jeder Aenderung die Nummer hochzaehlen, sonst behaelt das Handy die alte Fassung. */
const LAGER = 'rechenwege-3';
const DATEIEN = ['./', 'index.html', 'stil.css', 'daten.js', 'app.js', 'manifest.json', 'cover.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(LAGER).then(c => c.addAll(DATEIEN)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== LAGER).map(x => caches.delete(x)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(a => {
      if (a && a.status === 200 && a.type === 'basic') {
        const kopie = a.clone();
        caches.open(LAGER).then(c => c.put(e.request, kopie));
      }
      return a;
    }).catch(() => caches.match(e.request).then(a => a || caches.match('index.html')))
  );
});
