// مؤشرات الرؤية: يعمل بدون إنترنت ويتحدث تلقائياً.
// الصفحة والبيانات: من الشبكة أولاً (أحدث نسخة دائماً)، ومن النسخة المحفوظة عند انقطاع الاتصال.
const VERSION = "ov-d1ffabe5d1";
const SHELL = ["./", "index.html", "data/dataset.json", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const isPage = req.mode === "navigate" || (url.origin === location.origin && /\/(index\.html)?$/.test(url.pathname));
  const isData = url.origin === location.origin && url.pathname.endsWith("/data/dataset.json");
  if (isPage || isData) {
    const key = isPage ? "index.html" : "data/dataset.json";
    e.respondWith(fetch(req, {cache: "no-cache"}).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(key, copy)); }
      return res;
    }).catch(() => caches.match(key)));
    return;
  }
  // الخطوط والأيقونات ومكتبة Excel: من النسخة المحفوظة أولاً
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
    if (res.ok || res.type === "opaque") { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
    return res;
  })));
});
