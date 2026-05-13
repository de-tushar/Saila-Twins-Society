// Society Dashboard — Service Worker v3
// HTML: network-first (always fresh); static assets: cache-first; data.json: network-first

const CACHE_NAME = 'society-dash-v3';

const HTML_PAGES = [
  './index.html',
  './details.html',
  './announce.html',
  './raise.html',
  './tracker.html',
  './issues.html',
  './more.html',
  './mom.html',
  './contacts.html',
  './papers.html',
  './caretaker.html',
  './bank-stmt.html',
  './wtp.html',
  './misc-bills.html'
];

const STATIC_ASSETS = [
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js'
];

// Install: pre-cache everything
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll([...HTML_PAGES, ...STATIC_ASSETS]))
      .then(() => self.skipWaiting())   // activate immediately, don't wait for old SW to die
  );
});

// Activate: delete ALL old caches, then claim all open tabs instantly
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())  // take control of already-open pages
  );
});

// Fetch strategy:
//   data.json      → network-first  (always try live data, fall back to cache if offline)
//   HTML pages     → network-first  (always get latest UI, fall back to cache if offline)
//   static assets  → cache-first    (icons, chart.js — these rarely change)
self.addEventListener('fetch', event => {
  const url = event.request.url;
  const isHtml   = HTML_PAGES.some(p => url.endsWith(p.replace('./', '/'))) || url.endsWith('/');
  const isData   = url.includes('data.json');
  const isStatic = STATIC_ASSETS.some(p => url.includes(p.replace('./', '')));

  if (isData || isHtml) {
    // Network-first: try server, cache on success, fall back to cache if offline
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
  } else {
    // Cache-first for static assets
    event.respondWith(
      caches.match(event.request)
        .then(cached => cached || fetch(event.request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        }))
    );
  }
});
