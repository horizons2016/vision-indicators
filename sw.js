// مؤشرات الرؤية: يعمل بدون إنترنت ويتحدث تلقائياً.
// الصفحة والبيانات: من الشبكة أولاً متجاوزاً كل ذاكرة مؤقتة، ومن النسخة المحفوظة عند انقطاع الاتصال فقط.
const VERSION = "ov-835cae40fd";
const SHELL = ["./", "index.html", "reports.html", "reports/builder.js", "lib/pptxgen.bundle.js", "data/dataset.json", "version.json", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"];
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
  const isReports = same && /\/reports\.html$/.test(url.pathname);
  const isPage = !isReports && (req.mode === "navigate" || (same && /\/(index\.html)?$/.test(url.pathname)));
  const isData = same && (/\/(data\/dataset|version)\.json$/.test(url.pathname) || /\/reports\/builder\.js$/.test(url.pathname));
  if (isPage || isData || isReports) {
    const key = isReports ? "reports.html" : isPage ? "index.html" : url.pathname.endsWith("version.json") ? "version.json" : url.pathname.endsWith("builder.js") ? "reports/builder.js" : "data/dataset.json";
    // ملاحظة: لا يجوز تمرير خيارات مع طلب من نوع navigate، لذلك نبني طلباً جديداً من العنوان
    e.respondWith(fresh(isPage || isReports ? new URL(key, self.registration.scope).href : req.url).then(res => {
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
