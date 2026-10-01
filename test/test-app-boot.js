// Full-app boot check: the real index.html, the real scripts, the real order.
//
// This is the "did the optimisation break anything?" test. The unit suites cover the
// modules in isolation; this one boots the whole app the way a browser does (deferred
// scripts in document order, then DOMContentLoaded) and walks the journeys a learner
// actually performs: render the daily kanji, walk the deck, master/unmaster, switch
// themes (including the four lazily loaded WebGL ones), open the drawer and settings,
// enter practice mode, and tap an account control.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { indexedDB } = require('fake-indexeddb');
const root = path.join(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

// Exactly the scripts index.html loads, in document order. `defer` is what keeps this
// order while letting the browser download them in parallel.
const APP_SCRIPTS = [
    'storage-manager.js',
    'srs-engine.js',
    'ai-manager.js',
    'ai-tutor-modal.js',
    'audio-manager.js',
    'kanji-data.js',
    'drawing-pad.js',
    'ui-feedback.js',
    'backup-config.js',
    'backup-manager.js',
    'profile-page.js',
    'avatar-crop.js',
    'firebase-config.js',
    'username-policy.js',
    'app-auth.js',
    'username-directory.js',
    'auth-dialog.js',
    'cloud-sync.js',
    'script.js'
];

// jsdom cannot implement these; the app is written to survive their absence.
const IGNORED_JS_ERRORS = [/Not implemented/i, /speech synthesis/i, /getContext/i];

const settle = (window, ms = 250) => new Promise((resolve) => window.setTimeout(resolve, ms));

async function bootApp(options = {}) {
    const { theme, signedInTheme, returning, beforeScripts } = options;
    const errors = [];
    const virtualConsole = new VirtualConsole();
    virtualConsole.on('jsdomError', (error) => {
        const message = error?.message || String(error);
        if (!IGNORED_JS_ERRORS.some((pattern) => pattern.test(message))) {
            errors.push(message);
        }
    });

    const dom = new JSDOM(read('index.html'), {
        url: 'https://kanji.qd.je/',
        runScripts: 'outside-only',
        pretendToBeVisual: true,
        virtualConsole
    });
    const { window } = dom;
    const { document } = window;

    window.indexedDB = indexedDB;
    // jsdom implements neither canvas nor media. The pad guards every ctx call, and the
    // audio engine chains .then() off play(), so both need a minimal stand-in.
    const noop = () => {};
    window.HTMLMediaElement.prototype.play = () => Promise.resolve();
    window.HTMLMediaElement.prototype.pause = noop;
    window.HTMLMediaElement.prototype.load = noop;
    window.HTMLElement.prototype.scrollIntoView = noop;
    // jsdom has no canvas: the pad guards every ctx call, so a no-op proxy is enough.
    const fakeCtx = new Proxy(
        { canvas: null },
        {
            get: (target, prop) => (prop in target ? target[prop] : noop)
        }
    );
    window.HTMLCanvasElement.prototype.getContext = function () {
        fakeCtx.canvas = this;
        return fakeCtx;
    };

    // Local data only, never the network: same-origin files come from the checkout and
    // everything else (KanjiVG, Firebase) fails the way an offline learner would see.
    window.fetch = (input) => {
        const local = String(input)
            .replace(/^https?:\/\/[^/]+/, '')
            .split('?')[0];
        const file = path.join(root, local);
        if (fs.existsSync(file) && fs.statSync(file).isFile()) {
            const body = fs.readFileSync(file, 'utf8');
            return Promise.resolve({
                ok: true,
                status: 200,
                text: () => Promise.resolve(body),
                json: () => Promise.resolve(JSON.parse(body))
            });
        }
        return Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve('') });
    };

    // The app registers the worker only when navigator.serviceWorker exists while the
    // load event fires, so the stub has to be in place before the scripts are evaluated.
    const serviceWorkerRegistrations = [];
    Object.defineProperty(window.navigator, 'serviceWorker', {
        configurable: true,
        value: {
            register: (url) => {
                serviceWorkerRegistrations.push(url);
                return Promise.resolve({});
            }
        }
    });

    if (theme) {
        window.localStorage.setItem('theme', theme);
    }
    if (signedInTheme) {
        window.localStorage.setItem('lastDarkTheme', signedInTheme);
    }
    if (returning) {
        // Simulate the head gate script: this harness never executes inline
        // scripts, so a returning visitor has to be marked by hand before the
        // app scripts run.
        document.documentElement.setAttribute('data-returning', '');
    }
    if (beforeScripts) {
        beforeScripts(window, document);
    }

    await new Promise((resolve) => window.addEventListener('load', resolve, { once: true }));
    // One eval: jsdom's outside-only eval does not share global lexical bindings between
    // calls, and a browser runs all deferred scripts in one global scope anyway.
    window.eval(APP_SCRIPTS.map(read).join('\n;\n'));
    document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true }));
    await settle(window);

    return { dom, window, document, errors, serviceWorkerRegistrations };
}

test('the app boots from the real index.html with every deferred script', async () => {
    const { dom, window, document, errors } = await bootApp();
    try {
        // The HTML is the source of truth: nothing may be missing from that list.
        const declared = [...read('index.html').matchAll(/<script defer src="([^"?]+)/g)].map(
            (match) => match[1]
        );
        assert.deepEqual(declared, ['analytics.js', ...APP_SCRIPTS]);

        assert.ok(window.app, 'the app object must be created on DOMContentLoaded');
        assert.equal(
            window.app.constructor.name,
            'KanjiLearningApp',
            'window.app must be a KanjiLearningApp'
        );
        assert.equal(typeof window.app.renderKanji, 'function');

        // The daily kanji is on screen.
        const character = document.querySelector('#kanjiWidget .kanji-character');
        assert.ok(character, 'the kanji character must render');
        assert.match(
            character.textContent.trim(),
            /^[\u3040-\u30ff\u4e00-\u9faf]$/,
            'it must be a single kana or kanji'
        );
        assert.match(
            document.querySelector('#kanjiWidget .kanji-meaning').textContent.trim(),
            /\S/,
            'the meaning must render'
        );

        // The journey grid, progress line and streak badge all rendered.
        assert.ok(document.getElementById('kanjiJourney').children.length > 10, 'journey tiles');
        assert.match(document.getElementById('progressStats').textContent, /mastered/i);
        assert.ok(document.getElementById('streakBadge'), 'streak badge');

        assert.deepEqual(errors, [], `boot must not raise: ${errors.join(' | ')}`);
    } finally {
        dom.window.close();
    }
});

test('the widget buttons are wired and carry accessible names', async () => {
    const { dom, document } = await bootApp();
    try {
        const widget = document.getElementById('kanjiWidget');
        for (const selector of [
            '.action-btn',
            '.drawer-action-btn',
            '.ai-action-btn',
            '.jisho-btn',
            '.master-action-btn'
        ]) {
            const button = widget.querySelector(selector);
            assert.ok(button, `${selector} must render`);
            assert.match(button.getAttribute('aria-label') || '', /\S/, `${selector} needs a name`);
            assert.match(button.getAttribute('onclick') || '', /\S/, `${selector} needs a handler`);
        }
        // The generated heading stays in order for screen readers.
        assert.equal(widget.querySelector('h4'), null, 'no h4 may skip a level in the widget');
    } finally {
        dom.window.close();
    }
});

test('learning journeys still work: deck, mastery, undo, practice mode', async () => {
    const { dom, window, document } = await bootApp();
    try {
        const app = window.app;
        const first = app.currentKanji.character;

        // Walking the deck moves to a different kanji.
        app.navigateDeck('next');
        assert.notEqual(app.currentKanji.character, first, 'next must advance the deck');
        app.navigateDeck('prev');
        assert.equal(app.currentKanji.character, first, 'prev must come back');

        // Mastery persists to storage, updates the progress line and offers an undo.
        await app.markAsMastered();
        const stored = JSON.parse(window.localStorage.getItem('kanji_progress') || '{}');
        assert.ok(stored.mastered.includes(first), 'mastery must be stored');
        assert.match(document.getElementById('progressStats').textContent, /1 mastered/);
        assert.match(document.getElementById('toast').innerHTML, /Undo/i, 'the toast offers undo');

        // Re-rendering the same kanji now shows the undo badge on it.
        app.renderKanji();
        assert.ok(
            document.querySelector('#kanjiWidget .unmark-badge'),
            'a mastered kanji offers the undo badge'
        );

        // Undo clears it again.
        await app.undoMaster();
        const afterUndo = JSON.parse(window.localStorage.getItem('kanji_progress') || '{}');
        assert.equal(afterUndo.mastered.includes(first), false, 'undo must clear mastery');
        app.renderKanji();
        assert.equal(document.querySelector('#kanjiWidget .unmark-badge'), null);

        // Practice mode flips the card, shows the pad toolbar and creates ONE pad
        // instance that survives the trip back to Animate.
        app.showStrokeOrderMode('practice');
        await settle(window);
        assert.ok(document.getElementById('drawingPadCanvas'), 'practice mode renders the pad');
        assert.ok(document.getElementById('drawingPadInlineGridBtn'), 'the pad toolbar renders');
        assert.equal(
            document.getElementById('strokeOrderFlipCard').classList.contains('flipped'),
            true,
            'the card flips to the practice side'
        );
        assert.equal(
            document.getElementById('drawingPadInlineControls').style.display,
            'flex',
            'the pad toolbar is visible'
        );
        const pad = app.drawingPadInstance;
        assert.ok(pad, 'exactly one pad instance is created');

        app.showStrokeOrderMode('animate');
        assert.equal(
            document.getElementById('strokeOrderFlipCard').classList.contains('flipped'),
            false,
            'animate mode flips the card back'
        );
        assert.equal(
            document.getElementById('drawingPadInlineControls').style.display,
            'none',
            'animate mode hides the pad toolbar'
        );
        assert.equal(app.drawingPadInstance, pad, 'the pad instance is reused, not rebuilt');
    } finally {
        dom.window.close();
    }
});

test('every theme still applies, and each WebGL theme loads only the three.js parts it needs', async () => {
    const { dom, window, document } = await bootApp();
    try {
        const injected = () =>
            [
                ...document.querySelectorAll(
                    'head script[src*="three"], head script[src*="jsdelivr"]'
                )
            ].map((script) => script.src);
        const addons = () => document.querySelectorAll('head script[src*="jsdelivr"]').length;

        // The HTML ships no three.js at all: it is fetched on demand.
        assert.equal(read('index.html').includes('three.min.js'), false);
        // The default theme (nami) needs only the three.js core, so the idle warm-up has
        // queued just that one script - not the post-processing chain it never uses.
        assert.equal(injected().length, 1, 'nami warm-up queues the three.js core, once');
        assert.equal(addons(), 0, 'no post-processing addons for a core-only theme');
        assert.equal(
            document.documentElement.getAttribute('data-theme'),
            'nami',
            'the default theme applies'
        );

        for (const theme of ['paper', 'candy', 'yotsuba', 'sunrise', 'nord', 'midnight']) {
            window.app.setTheme(theme);
            assert.equal(document.documentElement.getAttribute('data-theme'), theme);
            assert.equal(injected().length, 1, `${theme} must not fetch three.js`);
        }

        // Custom themes read from storage and must not throw.
        window.app.setTheme('custom-1');
        assert.equal(document.documentElement.getAttribute('data-theme'), 'custom-1');

        for (const theme of ['lumen', 'obake', 'ito', 'nami']) {
            window.app.setTheme(theme);
            await settle(window, 50);
            assert.equal(document.documentElement.getAttribute('data-theme'), theme);
            // The core is still downloading (the harness has no network), so nothing else
            // is queued yet. Each of these themes needs no script of its own beyond that:
            // lumen the core, obake the core plus addons (proven by the loader test
            // below), ito nothing at all (its module bundles its own three.js).
            assert.equal(injected().length, 1, `${theme} must not re-fetch the three.js core`);
        }

        assert.equal(window.localStorage.getItem('theme'), 'nami', 'the theme choice persists');
    } finally {
        dom.window.close();
    }
});

test('obake pulls the post-processing addons exactly once, after the core loads', async () => {
    const { dom, window, document } = await bootApp();
    try {
        const coreScript = () =>
            [...document.querySelectorAll('head script')].find((script) =>
                script.src.includes('three.min.js')
            );
        const addons = () =>
            [...document.querySelectorAll('head script[src*="jsdelivr"]')].map((s) => s.src);

        assert.ok(coreScript(), 'the idle warm-up queued the three.js core');
        assert.equal(addons().length, 0, 'the addons wait for the core');

        // Settle the core the way a real browser would: its load event fires.
        coreScript().dispatchEvent(new window.Event('load'));
        await settle(window, 50);
        assert.equal(addons().length, 0, 'a loaded core alone triggers no addons');

        // Obake asks for the full chain: the six addons are queued once, in order, on top
        // of the already-loaded core. (The promise itself only settles when the addon
        // scripts finish loading, which the harness's no-network scripts never do - the
        // injection is what this test checks.)
        window.ensurePostProcessing();
        await settle(window, 50);
        assert.deepEqual(
            addons(),
            [
                'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/postprocessing/EffectComposer.js',
                'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/postprocessing/RenderPass.js',
                'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/postprocessing/ShaderPass.js',
                'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/shaders/CopyShader.js',
                'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/shaders/LuminosityHighPassShader.js',
                'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/postprocessing/UnrealBloomPass.js'
            ],
            'six addons, original order, once'
        );
        assert.equal(
            document.querySelectorAll('head script[src*="three.min.js"]').length,
            1,
            'the core is never fetched twice'
        );
    } finally {
        dom.window.close();
    }
});

test('local auto backups are data-only and survive a full localStorage', async () => {
    const { dom, window } = await bootApp();
    try {
        const ls = window.localStorage;
        // Seed two older auto backups, the way repeated sessions leave them
        // (timestamps older than now, so string sorting matches age order).
        ls.setItem('autoBackup_1000000000000', '{"app":"kanji-widgets","version":3}');
        ls.setItem('autoBackup_1100000000000', '{"app":"kanji-widgets","version":3}');

        // Simulate a full localStorage: the first auto-backup write throws the
        // exact error real browsers raise, everything after it succeeds.
        const proto = Object.getPrototypeOf(ls);
        const originalSet = proto.setItem;
        let quotaTripped = false;
        proto.setItem = function (key, value) {
            if (!quotaTripped && String(key).startsWith('autoBackup_')) {
                quotaTripped = true;
                const error = new Error(`Setting the value of '${key}' exceeded the quota.`);
                error.name = 'QuotaExceededError';
                throw error;
            }
            return originalSet.call(this, key, value);
        };

        await window.app.autoCreateBackup();

        const keys = Object.keys(ls)
            .filter((key) => key.startsWith('autoBackup_'))
            .sort();
        assert.ok(keys.length >= 2, 'a new backup was written after freeing space');
        assert.notEqual(keys[0], 'autoBackup_1000000000000', 'the oldest backup made room');
        assert.ok(ls.getItem('lastLocalBackup'), 'the backup timestamp is recorded');

        // The stored backup is data-only: theme images and the avatar live in
        // IndexedDB and must not be duplicated here as base64.
        const backup = JSON.parse(ls.getItem(keys[keys.length - 1]));
        assert.deepEqual(backup.media, {}, 'auto backups do not duplicate the IndexedDB media');
        assert.ok(backup.storage, 'the user data is still in the backup');
    } finally {
        dom.window.close();
    }
});

test('the drawer, the AI mixin and the settings dialog still open', async () => {
    const { dom, window, document } = await bootApp();
    try {
        const app = window.app;
        // ai-tutor-modal.js mixes its methods into the app instance at boot.
        assert.equal(typeof app.openKanjiDrawer, 'function', 'the drawer mixin must be applied');
        assert.equal(typeof app.openAISenseiForCurrentKanji, 'function');

        app.openKanjiDrawer('mnemonic');
        await settle(window);
        const drawer = document.getElementById('kanjiDrawer');
        assert.equal(drawer.hasAttribute('open') || drawer.classList.contains('open'), true);
        assert.match(drawer.textContent, /\S/, 'the drawer has content');
        app.switchKanjiDrawerTab('etymology');
        app.closeKanjiDrawer();

        app.openSettings();
        const settings = document.getElementById('settingsModal');
        assert.equal(settings.classList.contains('show'), true, 'settings must open');
        assert.equal(document.getElementById('jlptLevel').value, app.settings.jlptLevel);
        app.closeSettings();
        assert.equal(settings.classList.contains('show'), false, 'settings must close');

        // The AI Sensei entry point must be present and reachable from the widget.
        assert.ok(document.getElementById('aiSenseiFab'), 'the floating AI button exists');
    } finally {
        dom.window.close();
    }
});

test('audio failures and offline data never break the app', async () => {
    const { dom, window } = await bootApp();
    try {
        // jsdom has no media stack: playback must fail quietly, not throw.
        assert.doesNotThrow(() => window.app.playPronunciation(), 'audio must degrade gracefully');
        await settle(window);
        // The stroke-order fetch falls back to the plain character when offline.
        const svg = await window.app.fetchStrokeOrderSvg('\u96e8');
        assert.equal(svg, null, 'offline stroke order returns null instead of throwing');
    } finally {
        dom.window.close();
    }
});

test('the service worker is still registered and is valid JavaScript', async () => {
    const { dom, window, serviceWorkerRegistrations } = await bootApp();
    try {
        // The app binds registration to window load, which already fired: dispatch again.
        window.dispatchEvent(new window.Event('load'));
        assert.deepEqual(
            serviceWorkerRegistrations,
            ['/sw.js'],
            'the offline shell must still be registered'
        );

        // The worker itself must parse (a syntax error would silently kill offline mode).
        assert.doesNotThrow(() => new Function(read('sw.js')), 'sw.js must be valid JavaScript');
    } finally {
        dom.window.close();
    }
});

test('the Firebase stack waits for the first interaction, then starts on a tap', async () => {
    const { dom, window, document } = await bootApp();
    try {
        const auth = window.kanjiAuth;
        assert.ok(auth, 'the account stack must exist');
        assert.equal(auth.ready, false, 'it must not finish signing in during boot');
        assert.equal(auth.sdk, undefined, 'the Firebase SDK must not be loaded at boot');
        assert.equal(typeof auth.readyPromise?.then, 'function', 'readyPromise must be exposed');

        // A tap (the first interaction) starts it immediately.
        const button = document.querySelector('[data-app-sign-in]');
        assert.ok(button, 'the sign-in control must exist');
        button.dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
        await settle(window);
        assert.equal(
            typeof button.onclick,
            'function',
            'init() must have wired the control after the tap'
        );
    } finally {
        dom.window.close();
    }
});

test('a saved WebGL theme boots the same way as the default', async () => {
    const { dom, window, document, errors } = await bootApp({ theme: 'lumen' });
    try {
        assert.equal(document.documentElement.getAttribute('data-theme'), 'lumen');
        assert.ok(window.app, 'the app boots with a saved WebGL theme');
        assert.deepEqual(errors, [], `boot must not raise: ${errors.join(' | ')}`);
    } finally {
        dom.window.close();
    }
});

test('the account panel, profile page and cloud settings render without duplicate ids', async () => {
    const { dom, window, document } = await bootApp();
    try {
        const ids = [...document.querySelectorAll('[id]')].map((node) => node.id);
        const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
        assert.deepEqual(duplicates, [], 'duplicate ids break every control on the page');

        for (const id of [
            'accountPanel',
            'profilePage',
            'cloudSettings',
            'kanjiDrawer',
            'authDialog'
        ]) {
            assert.ok(document.getElementById(id), `${id} must exist`);
        }
        // The profile page and the account panel both offer sign-in.
        assert.equal(document.querySelectorAll('[data-app-sign-in]').length, 2);
        assert.ok(window.kanjiProfilePage, 'the profile page module booted');
    } finally {
        dom.window.close();
    }
});

// ---------------------------------------------------------------------------
// Prerender: index.html ships the first-visit screen as static markup so the
// LCP character paints without waiting on the scripts. These tests keep the
// static copy honest: it must be structurally identical to what the app
// renders for a fresh visitor, it must never flash a spinner at that visitor,
// and the two inline head scripts (gate + font refinement) must behave.
// ---------------------------------------------------------------------------

// The stroke-order container and the pad guide are filled asynchronously
// (KanjiVG fetch, guide render), and the canvas is a leaf jsdom cannot draw
// on, so the comparison skips their runtime contents and checks only that
// the skeleton around them matches.
const PRERENDER_SKIP_IDS = new Set(['strokeOrderContainer', 'drawingPadInlineGuide']);

const snapshotTree = (node) => {
    if (node.nodeType === 3) {
        const text = node.textContent.replace(/\s+/g, ' ').trim();
        return text ? { text } : null;
    }
    if (node.nodeType !== 1) {
        return null;
    }
    const attrs = {};
    for (const attr of node.attributes) {
        let value = attr.value;
        if (attr.name === 'class') {
            // prerender-static only exists in the static copy; the renderer
            // never emits it.
            value = value
                .split(/\s+/)
                .filter((token) => token && token !== 'prerender-static')
                .sort()
                .join(' ');
        } else if (attr.name === 'style') {
            value = value.replace(/\s+/g, ' ').replace(/;$/, '').trim();
        } else if (attr.name === 'onclick') {
            // Prettier formats the JS inside event-handler attributes, so the
            // static copy can carry line breaks the template never emits.
            // Normalize whitespace and punctuation spacing on both sides.
            value = value
                .replace(/\s+/g, ' ')
                .replace(/\s*([(),])\s*/g, '$1')
                .trim();
        } else if (attr.name === 'disabled') {
            value = '';
        }
        if (value === '' && attr.name === 'class') {
            continue;
        }
        attrs[attr.name] = value;
    }
    const snapshot = { el: node.tagName, attrs };
    if (PRERENDER_SKIP_IDS.has(node.id)) {
        snapshot.runtimeContent = true;
        return snapshot;
    }
    if (node.tagName !== 'CANVAS') {
        snapshot.children = [...node.childNodes].map(snapshotTree).filter(Boolean);
    }
    return snapshot;
};

const widgetChildren = (rootNode) =>
    [...rootNode.children]
        .filter((child) => !child.classList.contains('widget-loading'))
        .map(snapshotTree);

// Pull the inline head script containing `marker` out of index.html. A lazy
// regex from the first <script> would happily span across markup into the
// next script, so slice from the nearest boundaries around the marker.
const inlineScript = (html, marker) => {
    const at = html.indexOf(marker);
    assert.ok(at !== -1, `no inline script contains ${marker}`);
    const start = html.lastIndexOf('<script>', at) + '<script>'.length;
    const end = html.indexOf('</script>', at);
    assert.ok(start > 0 && end > at, 'the marker must sit inside a script tag');
    return html.slice(start, end);
};

test('the prerendered widget matches what the app renders for a fresh visitor', async () => {
    // Static side: parse index.html without running anything.
    const staticDom = new JSDOM(read('index.html'), { url: 'https://kanji.qd.je/' });
    const staticDoc = staticDom.window.document;
    const staticWidget = widgetChildren(staticDoc.getElementById('kanjiWidget'));
    const staticJourney = snapshotTree(staticDoc.getElementById('kanjiJourney'));
    const staticRecent = snapshotTree(staticDoc.getElementById('recentKanji'));
    const staticStats = staticDoc.getElementById('progressStats').textContent.trim();
    const staticSummary = staticDoc.getElementById('journeySummary').textContent.trim();
    staticDom.window.close();

    // Rendered side: full fresh boot, default settings, no stored progress.
    const { dom, document, errors } = await bootApp();
    try {
        assert.deepEqual(errors, [], 'a fresh boot must not throw');
        assert.deepEqual(
            widgetChildren(document.getElementById('kanjiWidget')),
            staticWidget,
            'the static widget markup drifted from renderKanji()'
        );
        assert.deepEqual(
            snapshotTree(document.getElementById('kanjiJourney')),
            staticJourney,
            'the static journey grid drifted from renderKanjiJourney()'
        );
        assert.deepEqual(
            snapshotTree(document.getElementById('recentKanji')),
            staticRecent,
            'the static recent list drifted from loadRecentKanji()'
        );
        assert.equal(document.getElementById('progressStats').textContent.trim(), staticStats);
        assert.equal(document.getElementById('journeySummary').textContent.trim(), staticSummary);
    } finally {
        dom.window.close();
    }
});

test('a fresh visitor never sees the spinner; a returning visitor sees it first', async () => {
    const watch = (record) => (window, document) => {
        const observer = new window.MutationObserver((mutations) => {
            for (const mutation of mutations) {
                for (const added of mutation.addedNodes) {
                    if (added.nodeType === 1 && added.classList.contains('widget-loading')) {
                        record.push(added.textContent);
                    }
                }
            }
        });
        observer.observe(document.getElementById('kanjiWidget'), { childList: true });
    };

    const freshSpinners = [];
    const fresh = await bootApp({ beforeScripts: watch(freshSpinners) });
    try {
        assert.deepEqual(freshSpinners, [], 'the prerender must not be replaced by a spinner');
        assert.equal(
            fresh.document.documentElement.hasAttribute('data-prerender'),
            false,
            'renderKanji() hands the document back to normal loading states'
        );
        assert.ok(fresh.document.querySelector('#kanjiWidget .kanji-character'));
    } finally {
        fresh.dom.window.close();
    }

    const returningSpinners = [];
    const returning = await bootApp({
        returning: true,
        beforeScripts: watch(returningSpinners)
    });
    try {
        assert.equal(
            returningSpinners.length > 0,
            true,
            'returning visitors keep the classic spinner while data loads'
        );
        assert.ok(returning.document.querySelector('#kanjiWidget .kanji-character'));
    } finally {
        returning.dom.window.close();
    }
});

test('the head gate marks the document for returning visitors only', () => {
    const html = read('index.html');
    const gate = inlineScript(html, 'var keys');

    const runGate = (stored) => {
        const dom = new JSDOM(html, { url: 'https://kanji.qd.je/', runScripts: 'outside-only' });
        for (const [key, value] of Object.entries(stored)) {
            dom.window.localStorage.setItem(key, value);
        }
        dom.window.eval(gate);
        const marked = dom.window.document.documentElement.hasAttribute('data-returning');
        dom.window.close();
        return marked;
    };

    assert.equal(runGate({}), false, 'a first-time visitor keeps the prerender');
    assert.equal(runGate({ kanjiSettings: '{"jlptLevel":"N5"}' }), true);
    assert.equal(runGate({ kanji_settings: '{}' }), true);
    assert.equal(runGate({ kanji_progress: '{"mastered":["雨"]}' }), true);
    assert.equal(runGate({ kanji_recent: '[]' }), true);
    // Unrelated keys (theme, streak) describe a visitor whose first screen is
    // still the default one, so the prerender stays valid for them.
    assert.equal(runGate({ theme: 'midnight', dailyStreak: '3' }), false);
});

test('the font refinement promotes the saved face into the blocking slot', () => {
    const html = read('index.html');
    const refine = inlineScript(html, 'var saved');

    const runRefine = (settings) => {
        const dom = new JSDOM(html, { url: 'https://kanji.qd.je/', runScripts: 'outside-only' });
        const { window } = dom;
        if (settings !== null) {
            window.localStorage.setItem('kanjiSettings', settings);
        }
        window.eval(refine);
        const remote = window.document.getElementById('remoteFontsLink');
        const display = window.document.getElementById('displayFontsLink');
        const state = {
            remoteHref: remote.getAttribute('href'),
            remoteMedia: remote.media,
            displayMedia: display.media
        };
        window.close();
        return state;
    };

    const untouched = runRefine(null);
    assert.equal(untouched.remoteMedia, 'print', 'no saved settings: everything stays async');
    assert.equal(untouched.remoteHref.includes('family=Noto+Sans+JP'), true);
    assert.equal(untouched.remoteHref.includes('family=Klee+One'), false);

    const klee = runRefine('{"kanjiFont":"Klee One"}');
    assert.deepEqual(klee, untouched, 'the default face needs no promotion');

    const zen = runRefine('{"kanjiFont":"Zen Antique"}');
    assert.equal(zen.remoteMedia, 'all', 'the chosen face becomes render-blocking');
    assert.equal(
        zen.remoteHref,
        'https://fonts.googleapis.com/css2?family=Zen+Antique&display=swap'
    );

    const noto = runRefine('{"kanjiFont":"Noto Sans JP"}');
    assert.equal(noto.remoteMedia, 'all');
    assert.equal(
        noto.remoteHref,
        'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;700&display=swap'
    );

    const hannari = runRefine('{"kanjiFont":"Hannari"}');
    assert.equal(hannari.displayMedia, 'all', 'self-hosted display faces promote their own CSS');
    assert.deepEqual(hannari.remoteMedia, 'print');

    const device = runRefine('{"kanjiFont":"Hiragino Sans"}');
    assert.deepEqual(device, untouched, 'device fonts need no webfont at all');

    const corrupt = runRefine('{oops');
    assert.deepEqual(corrupt, untouched, 'corrupt settings fall back to the default path');
});

test('dev favorites tiles use manifest thumbs but keep full paths for applying', async () => {
    const { dom, window, document } = await bootApp();
    try {
        // Manifest entries are plain filenames or {file, thumb} objects, mixed.
        window.renderDevFavorites(
            {
                folder: 'assets/dev-themes/',
                files: ['plain.gif', { file: 'big.gif', thumb: 'big.thumb.gif' }]
            },
            'assets/dev-themes/big.gif'
        );
        const tiles = [...document.querySelectorAll('#devFavoritesGrid .dev-favorite-thumb')];
        assert.equal(tiles[0].getAttribute('data-file'), 'assets/dev-themes/plain.gif');
        assert.ok(tiles[0].getAttribute('style').includes("url('assets/dev-themes/plain.gif')"));
        assert.equal(tiles[1].getAttribute('data-file'), 'assets/dev-themes/big.gif');
        assert.ok(
            tiles[1].getAttribute('style').includes("url('assets/dev-themes/big.thumb.gif')"),
            'the tile shows the downscaled thumb'
        );
        assert.ok(
            tiles[1].classList.contains('selected'),
            'selection still keys off the full-size path'
        );

        // Videos keep the full file in <video src>; a thumb becomes the poster.
        window.renderDevFavorites(
            { folder: 'f/', files: [{ file: 'a.mp4', thumb: 'a.jpg' }] },
            null
        );
        const video = document.querySelector('#devFavoritesGrid video');
        assert.equal(video.getAttribute('src'), 'f/a.mp4');
        assert.equal(video.getAttribute('poster'), 'f/a.jpg');
    } finally {
        dom.window.close();
    }
});
