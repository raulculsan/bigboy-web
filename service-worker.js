// The app used to live at the root with its own service worker. The root is now
// the club's website and the app lives in /app/: retire the old worker and its caches.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) await caches.delete(key);
    await self.registration.unregister();
    for (const client of await self.clients.matchAll({type: 'window'})) client.navigate(client.url);
  })());
});
