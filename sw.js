/* Service worker – offlinestöd för Mängdkollen */
const VERSION = 'atgang-v28';
const SHELL = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'data.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'favicon.ico',
  'icons/mangdkollen-32.png',
  'icons/mangdkollen-touch-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'img/profil.jpg',
  'img/profil.svg'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Nätet först så att uppdaterade värden och filer alltid slår igenom; cachen används offline.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  // no-cache: fråga alltid servern (webbläsarens HTTP-cache får inte servera gamla filer)
  const net = req.mode === 'navigate' ? fetch(req) : fetch(req, { cache: 'no-cache' });
  e.respondWith(
    net
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req, { ignoreSearch: true }).then((r) => r || (req.mode === 'navigate' ? caches.match('index.html') : Response.error()))
      )
  );
});
