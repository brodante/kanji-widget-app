const CACHE_NAME = 'kanji-widgets-v34';
const urlsToCache = [
    '/',
    '/index.html',
    '/analytics.js?v=analytics-v1',
    '/styles.css',
    '/styles.css?v=custom-footer-glass-v1',
    '/script.js',
    '/script.js?v=ai-floating-v1',
    '/drawing-pad.js',
    '/drawing-pad.js?v=practice-merge-v1',
    '/backup-config.js',
    '/ui-feedback.js?v=practice-merge-v1',
    '/firebase-config.js?v=ai-free-v3',
    '/username-policy.js?v=login-v1',
    '/app-auth.js?v=ai-free-v1',
    '/username-directory.js?v=login-v1',
    '/auth-dialog.js?v=login-v1',
    '/cloud-sync.js?v=practice-merge-v1',
    '/backup-manager.js',
    '/backup-manager.js?v=practice-merge-v1',
    '/profile-page.js?v=practice-merge-v1',
    '/avatar-crop.js?v=avatar-v1',
    '/kanji-data.js',
    '/audio-manager.js',
    '/storage-manager.js',
    '/srs-engine.js',
    '/ai-manager.js?v=ai-model-lite-v1',
    '/ai-tutor-modal.js?v=ai-free-v3'
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

// Stroke-order references come from these CDNs and are safe to keep for offline use.
const CROSS_ORIGIN_CACHE_HOSTS = ['raw.githubusercontent.com', 'cdn.jsdelivr.net'];

// Reads a response into the cache without ever rejecting the caller.
const cachePut = (request, response) => {
    if (!response || (response.status !== 200 && response.type !== 'opaque')) {
        return Promise.resolve();
    }
    return caches
        .open(CACHE_NAME)
        .then((cache) => cache.put(request, response))
        .catch(() => {});
};

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') {
        return;
    }

    const { request } = event;
    const url = new URL(request.url);
    const isFirstParty = url.origin === self.location.origin;

    // KanjiVG stroke-order data: cache first, refresh in the background, so the
    // drawing pad keeps working offline like it did before.
    if (!isFirstParty && CROSS_ORIGIN_CACHE_HOSTS.includes(url.hostname)) {
        event.respondWith(
            caches.match(request).then((hit) => {
                const network = fetch(request)
                    .then((response) => {
                        void cachePut(request, response);
                        return response;
                    })
                    .catch(() => hit);
                return hit || network;
            })
        );
        return;
    }

    // Other cross-origin requests (Firebase, Google, analytics) are left alone.
    if (!isFirstParty) {
        return;
    }

    // Navigations: fresh shell when online, last known shell when offline.
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    void cachePut(request, response);
                    return response;
                })
                .catch(() =>
                    caches.match(request).then((hit) => hit || caches.match('/index.html'))
                )
        );
        return;
    }

    const destination = request.destination;

    // Audio, images and fonts are content-addressed by path: cache first so a
    // repeat visit never waits on the network for them.
    if (destination === 'audio' || destination === 'image' || destination === 'font') {
        event.respondWith(
            caches.match(request).then(
                (hit) =>
                    hit ||
                    fetch(request).then((response) => {
                        void cachePut(request, response);
                        return response;
                    })
            )
        );
        return;
    }

    // Scripts and styles: answer from cache immediately, refresh in the background.
    // The previous handler used cache: 'no-store', which also disabled the browser's
    // HTTP cache, so every repeat visit re-validated every asset.
    if (destination === 'script' || destination === 'style') {
        event.respondWith(
            caches.match(request).then((hit) => {
                const network = fetch(request)
                    .then((response) => {
                        void cachePut(request, response);
                        return response;
                    })
                    .catch(() => hit);
                return hit || network;
            })
        );
        return;
    }

    // Everything else (documents, manifests, JSON data): try the network first and
    // fall back to the cached copy.
    event.respondWith(
        fetch(request)
            .then((response) => {
                void cachePut(request, response);
                return response;
            })
            .catch(() => caches.match(request))
    );
});
