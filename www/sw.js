// Order App service worker. Keep the old cache prefix for existing installations.
// Network-first for the page; cache fallback keeps it working offline.
var VERSION = '1.7.0';
var C = 'saeedi-orders-' + VERSION;
var FILES = ['./', './index.html', './i18n.js', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png', './apple-touch-icon.png', './fonts/noto-naskh-arabic.woff2', './fonts/noto-nastaliq-urdu.woff2'];
self.addEventListener('install', function (e) { e.waitUntil(caches.open(C).then(function (c) { return c.addAll(FILES); })); self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (k) { return Promise.all(k.filter(function (n) { return n.indexOf('saeedi-orders-') === 0 && n !== C; }).map(function (n) { return caches.delete(n); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (req.mode === 'navigate' || (url.origin === location.origin && /\/(index\.html)?$/.test(url.pathname))) {
    e.respondWith(fetch(req).then(function (res) {
      var cp = res.clone(); caches.open(C).then(function (c) { c.put('./index.html', cp); });
      return res;
    }).catch(function () { return caches.match('./index.html'); }));
    return;
  }
  e.respondWith(caches.match(req).then(function (r) {
    return r || fetch(req).then(function (res) {
      if (res.ok && (url.origin === location.origin || /fonts\.(googleapis|gstatic)\.com/.test(url.host))) { var cp = res.clone(); caches.open(C).then(function (c) { c.put(req, cp); }); }
      return res;
    });
  }));
});
