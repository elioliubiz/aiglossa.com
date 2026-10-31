const CACHE = "aiglossa-skin-ar-v13";
const ASSETS = ["/ar/skin/", "/assets/skin.css?v=20261101-13", "/assets/skin.js?v=20261101-13", "/assets/wallet.js?v=20261101-13"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(()=>{})); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE && k.indexOf("aiglossa-skin-") === 0).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener("fetch", e => { if (e.request.method !== "GET") return; e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request).then(r => r || caches.match("/ar/skin/")))); });
