// Offline cache: the app works with no internet after the first open
var C = 'saeedi-orders-v2';
var FILES = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
self.addEventListener('install', function (e) { e.waitUntil(caches.open(C).then(function (c) { return c.addAll(FILES); })); self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (k) { return Promise.all(k.filter(function (n) { return n !== C; }).map(function (n) { return caches.delete(n); })); }));
  self.clients.claim();
});
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request).then(function (r) {
    return r || fetch(e.request).then(function (res) {
      if (res.ok && /fonts\.(googleapis|gstatic)\.com/.test(e.request.url)) { var cp = res.clone(); caches.open(C).then(function (c) { c.put(e.request, cp); }); }
      return res;
    });
  }));
});
