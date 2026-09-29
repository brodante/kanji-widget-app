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
    const { theme, signedInTheme } = options;
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

test('every theme still applies, and the WebGL ones load three.js exactly once', async () => {
    const { dom, window, document } = await bootApp();
    try {
        const injected = () =>
            [
                ...document.querySelectorAll(
                    'head script[src*="three"], head script[src*="jsdelivr"]'
                )
            ].map((script) => script.src);

        // The HTML ships no three.js at all: it is fetched on demand.
        assert.equal(read('index.html').includes('three.min.js'), false);
        // The default theme is a WebGL one, so the idle warm-up has already queued it.
        assert.equal(injected().length, 7, 'seven CDN scripts, once');
        assert.equal(
            document.documentElement.getAttribute('data-theme'),
            'nami',
            'the default theme applies'
        );

        for (const theme of ['paper', 'candy', 'yotsuba', 'sunrise', 'nord', 'midnight']) {
            window.app.setTheme(theme);
            assert.equal(document.documentElement.getAttribute('data-theme'), theme);
            assert.equal(injected().length, 7, `${theme} must not re-fetch three.js`);
        }

        // Custom themes read from storage and must not throw.
        window.app.setTheme('custom-1');
        assert.equal(document.documentElement.getAttribute('data-theme'), 'custom-1');

        for (const theme of ['lumen', 'obake', 'ito', 'nami']) {
            window.app.setTheme(theme);
            await settle(window, 50);
            assert.equal(document.documentElement.getAttribute('data-theme'), theme);
            assert.equal(injected().length, 7, `${theme} must reuse the loaded three.js`);
        }

        assert.equal(window.localStorage.getItem('theme'), 'nami', 'the theme choice persists');
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

test('the Firebase stack waits for idle or an account tap', async () => {
    const { dom, window, document } = await bootApp();
    try {
        const auth = window.kanjiAuth;
        assert.ok(auth, 'the account stack must exist');
        assert.equal(auth.ready, false, 'it must not finish signing in during boot');
        assert.equal(auth.sdk, undefined, 'the Firebase SDK must not be loaded at boot');
        assert.equal(typeof auth.readyPromise?.then, 'function', 'readyPromise must be exposed');

        // A tap on any account control starts it immediately.
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
