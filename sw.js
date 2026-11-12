// مؤشرات الرؤية: يعمل بدون إنترنت ويتحدث تلقائياً.
// الصفحة والبيانات: من الشبكة أولاً متجاوزاً كل ذاكرة مؤقتة، ومن النسخة المحفوظة عند انقطاع الاتصال فقط.
const VERSION = "ov-6f0883268d";
const SHELL = ["./", "index.html", "data/dataset.json", "version.json", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"];
const fresh = url => fetch(new Request(url, {cache: "no-store", credentials: "same-origin"}));

self.addEventListener("install", e => {
  // cache: "reload" حتى لا تُخزَّن نسخة قديمة من ذاكرة المتصفح
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL.map(u => new Request(u, {cache: "reload"})))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const same = url.origin === location.origin;
  const isPage = req.mode === "navigate" || (same && /\/(index\.html)?$/.test(url.pathname));
  const isData = same && /\/(data\/dataset|version)\.json$/.test(url.pathname);
  if (isPage || isData) {
    const key = isPage ? "index.html" : url.pathname.endsWith("version.json") ? "version.json" : "data/dataset.json";
    // ملاحظة: لا يجوز تمرير خيارات مع طلب من نوع navigate، لذلك نبني طلباً جديداً من العنوان
    e.respondWith(fresh(isPage ? new URL("index.html", self.registration.scope).href : req.url).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(key, copy)); }
      return res;
    }).catch(() => caches.match(key)));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
    if (res.ok || res.type === "opaque") { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
    return res;
  })));
});
