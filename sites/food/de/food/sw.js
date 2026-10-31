/* aiglossa food service worker — network-first; cache is only an offline fallback. */
const CACHE = "aiglossa-food-de-v27";
const V = "20261031-23";
const SHELL = ["./", "../../assets/food.css?v=" + V, "../../assets/food.js?v=" + V, "../../assets/wallet.js?v=" + V, "../../assets/food-icon-192.png?v=" + V, "../../assets/food-icon-512.png?v=" + V, "../../assets/food-sample.jpg?v=" + V];
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy));
      }
      return response;
    }).catch(() => caches.match(request).then((cached) => cached || (request.mode === "navigate" ? caches.match("./") : undefined)))
  );
});
