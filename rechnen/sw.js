/* Selbstabbau. Diese Fassung ersetzt den alten Offline-Speicher der umgezogenen App:
   Sie loescht alle Lager, meldet sich selbst ab und laedt offene Fenster neu, damit
   die Bruecken-Seite erscheint. Danach gibt es hier keinen Arbeiter mehr. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) await caches.delete(k);
    await self.registration.unregister();
    for (const c of await self.clients.matchAll({ type: 'window' })) {
      try { c.navigate(c.url); } catch (err) {}
    }
  })());
});
