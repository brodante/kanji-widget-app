const CACHE_NAME = 'kanji-widgets-v17';
const urlsToCache = [
    '/',
    '/index.html',
    '/styles.css',
    '/styles.css?v=practice-merge-v1',
    '/script.js',
    '/script.js?v=practice-merge-v1',
    '/drawing-pad.js',
    '/drawing-pad.js?v=practice-merge-v1',
    '/backup-config.js',
    '/ui-feedback.js?v=practice-merge-v1',
    '/firebase-config.js?v=practice-merge-v1',
    '/app-auth.js?v=practice-merge-v1',
    '/cloud-sync.js?v=practice-merge-v1',
    '/backup-manager.js',
    '/backup-manager.js?v=practice-merge-v1',
    '/profile-page.js?v=practice-merge-v1',
    '/kanji-data.js',
    '/audio-manager.js',
    '/storage-manager.js',
    '/srs-engine.js',
    '/ai-manager.js',
    '/ai-tutor-modal.js'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches
            .open(CACHE_NAME)
            .then((cache) => {
                console.log('Opened cache');
                return cache.addAll(urlsToCache);
            })
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) =>
                Promise.all(
                    keys
                        .filter((key) => key.startsWith('kanji-widgets-') && key !== CACHE_NAME)
                        .map((key) => caches.delete(key))
                )
            )
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') {
        return;
    }

    const { request } = event;
    const url = new URL(request.url);
    const shouldCache =
        request.destination === 'script' ||
        request.destination === 'style' ||
        request.destination === 'document' ||
        request.mode === 'navigate';

    if (
        shouldCache &&
        (url.origin === self.location.origin ||
            url.hostname === 'raw.githubusercontent.com' ||
            url.hostname === 'cdn.jsdelivr.net')
    ) {
        event.respondWith(
            fetch(request, { cache: 'no-store' })
                .then((response) => {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
                    return response;
                })
                .catch(() => caches.match(request))
        );
        return;
    }

    event.respondWith(fetch(request));
});
