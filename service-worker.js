const CACHE_NAME = 'my-app-cache-v1';
const urlsToCache = [
  'index.html',
  'style.css',
  'script.js',
  'icon-192.png',
  'icon-512.png'
  'offline.html'
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

// Fetch files: respond from cache first, then network
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      // Return cached page if available
      if (response) {
        return response;
      }
      // If not cached, try network
      return fetch(event.request).catch(() => {
        // If network fails, return offline page
        return caches.match('offline.html');
      });
    })
  );
});
