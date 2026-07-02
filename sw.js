const CACHE_NAME = 'vhb-seating-v6';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './index2.html',
    './core.js',
    './data.json',
    './manifest.json',
    './assets/js/tailwindcss.js',
    './assets/img/bg1.jpg',
    './assets/img/bg2.jpg',
    './assets/css/manrope.css',
    './assets/css/material-symbols.css',
    './assets/fonts/manrope-1.woff2',
    './assets/fonts/manrope-2.woff2',
    './assets/fonts/manrope-3.woff2',
    './assets/fonts/manrope-4.woff2',
    './assets/fonts/manrope-5.woff2',
    './assets/fonts/manrope-6.woff2',
    './assets/fonts/material-symbols-1.woff2'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Opened cache');
                // Don't fail the whole install if some external assets fail to cache
                return Promise.allSettled(
                    ASSETS_TO_CACHE.map(url => cache.add(url).catch(err => console.warn('Cache add failed for', url, err)))
                );
            })
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    // Only cache GET requests
    if (event.request.method !== 'GET') return;

    // For data.json, we want Network First, fallback to cache
    if (event.request.url.includes('data.json')) {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    // Cache the new data.json
                    const clonedRes = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clonedRes));
                    return response;
                })
                .catch(() => {
                    return caches.match(event.request);
                })
        );
        return;
    }

    // For other assets: Cache First, fallback to network
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                if (response) {
                    return response;
                }
                return fetch(event.request).then(
                    (response) => {
                        // Check if we received a valid response
                        if(!response || response.status !== 200 || response.type !== 'basic') {
                            return response;
                        }
                        const responseToCache = response.clone();
                        caches.open(CACHE_NAME)
                            .then((cache) => {
                                cache.put(event.request, responseToCache);
                            });
                        return response;
                    }
                );
            }).catch(() => {
                // Return offline fallback if network fails
                console.log("Fetch failed and no cache found for", event.request.url);
            })
    );
});
