// Order App service worker. Keep the old cache prefix for existing installations.
// Network-first for the page; cache fallback keeps it working offline.
// Bump VERSION to force every client to re-download the precache list.
var VERSION = '1.10.0';
var C = 'saeedi-orders-' + VERSION;
var FILES = ['./', './index.html', './i18n.js', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png', './apple-touch-icon.png', './fonts/noto-naskh-arabic.woff2', './fonts/noto-nastaliq-urdu.woff2'];
self.addEventListener('install', function (e) {
  // Cache each file on its own so one missing asset cannot abort the whole
  // precache and leave the app permanently unable to start offline.
  e.waitUntil(caches.open(C).then(function (c) {
    return Promise.all(FILES.map(function (f) { return c.add(f).catch(function () {}); }));
  }));
  self.skipWaiting();
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (k) { return Promise.all(k.filter(function (n) { return n.indexOf('saeedi-orders-') === 0 && n !== C; }).map(function (n) { return caches.delete(n); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  // The page and its dictionary go to the network first. Serving a new page with a
  // stale dictionary would briefly show raw message keys, so i18n.js is treated as
  // critical; everything else is cheap to defer and uses stale-while-revalidate.
  var networkFirst = req.mode === 'navigate'
    || (url.origin === location.origin && (/\/(index\.html)?$/.test(url.pathname) || /\/i18n\.js$/.test(url.pathname)));
  if (networkFirst) {
    e.respondWith(fetch(req).then(function (res) {
      var target = /\/i18n\.js$/.test(url.pathname) ? req : './index.html';
      if (res.ok) { var cp = res.clone(); caches.open(C).then(function (c) { c.put(target, cp); }); }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (r) { return r || caches.match('./index.html'); });
    }));
    return;
  }
  // Stale-while-revalidate: serve the cached copy at once for speed and offline
  // use, but refresh it in the background so new translations, icons and fonts
  // reach returning visitors without waiting for a manual VERSION bump.
  e.respondWith(caches.match(req).then(function (r) {
    var network = fetch(req).then(function (res) {
      if (res.ok && (url.origin === location.origin || /fonts\.(googleapis|gstatic)\.com/.test(url.host))) { var cp = res.clone(); caches.open(C).then(function (c) { c.put(req, cp); }); }
      return res;
    }).catch(function () {
      if (r) return r; // offline: fall back to the cached copy when we have one
      throw new Error('Offline and not cached: ' + req.url);
    });
    return r || network;
  }));
});
