const CACHE_NAME = 'kanji-widgets-v3';
const urlsToCache = [
    '/',
    '/index.html',
    '/styles.css',
    '/script.js',
    '/kanji-data.js',
    '/audio-manager.js',
    '/storage-manager.js'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Opened cache');
                return cache.addAll(urlsToCache);
            })
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => Promise.all(
            keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
        )).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;

    const { request } = event;
    const url = new URL(request.url);
    const shouldCache = request.destination === 'script' || request.destination === 'style' || request.destination === 'document' || request.mode === 'navigate';

    if (shouldCache && (url.origin === self.location.origin || url.hostname === 'raw.githubusercontent.com' || url.hostname === 'cdn.jsdelivr.net')) {
        event.respondWith(
            fetch(request, { cache: 'no-store' })
                .then(response => {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
                    return response;
                })
                .catch(() => caches.match(request))
        );
        return;
    }

    event.respondWith(fetch(request));
});