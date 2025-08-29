const CACHE_NAME = 'my-app-cache-v1';
const urlsToCache = [
  'index.html',
  'style.css',
  'script.js',
  'icon-192.png',
  'icon-512.png'
  // no need for offline.html anymore
];

// Install Service Worker and cache files
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

// Activate Service Worker and clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(name => {
          if (name !== CACHE_NAME) {
            return caches.delete(name);
          }
        })
      );
    })
  );
});

// Fetch: cache-first for app shell, network-first for others
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      // If cached, return it
      if (response) {
        return response;
      }
      // Else try network, fallback to app shell
      return fetch(event.request).catch(() => {
        return caches.match('index.html');
      });
    })
  );
});
