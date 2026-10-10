const CACHE = "ver-en-mi-v1";
const FILES = ["./", "./index.html", "./manifest.json", "./icon.svg"];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)));
  self.skipWaiting();
});
self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
});
self.addEventListener("fetch", event => {
  if (event.request.method === "GET") {
    event.respondWith(
      caches.match(event.request).then(cached =>
        cached || fetch(event.request).catch(() => caches.match("./index.html"))
      )
    );
  }
});
