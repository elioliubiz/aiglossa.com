const CACHE = "aiglossa-skin-es-v3";
const ASSETS = ["/es/skin/", "/assets/skin.css?v=20261101-3", "/assets/skin.js?v=20261101-3", "/assets/wallet.js?v=20261101-3"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(()=>{})); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE && k.indexOf("aiglossa-skin-") === 0).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener("fetch", e => { if (e.request.method !== "GET") return; e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request).then(r => r || caches.match("/es/skin/")))); });
