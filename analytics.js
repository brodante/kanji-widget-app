// One Analytics destination: preserve the site's existing GA4 reporting stream.
// Firebase is used for Authentication and Firestore, not a second Analytics tracker.
(() => {
    const measurementId = 'G-Q6XNG2ETFL';
    const production =
        location.protocol === 'https:' &&
        (location.hostname === 'kanji.qd.je' ||
            (location.hostname === 'brodante.github.io' &&
                (location.pathname === '/kanji-widget-app' ||
                    location.pathname.startsWith('/kanji-widget-app/'))));

    // Do not count localhost, Arena previews, forks or unrelated GitHub Pages sites.
    if (!production || document.getElementById('kanjiAnalyticsTag')) {
        return;
    }

    const script = document.createElement('script');
    script.id = 'kanjiAnalyticsTag';
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
    window.dataLayer = window.dataLayer || [];
    window.gtag =
        window.gtag ||
        function () {
            window.dataLayer.push(arguments);
        };
    window.gtag('js', new Date());
    window.gtag('config', measurementId);
    // A blocked/unavailable analytics tag must never block learning or sign-in.
    document.head.appendChild(script);
})();
