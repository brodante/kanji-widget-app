// Boots the actual deploy artifact: runs tools/minify.js the way the deploy
// workflow does, then loads the minified index.html plus the minified scripts
// in jsdom and checks the app still renders the daily kanji. The byte guards
// in deploy.yml only prove the files got smaller; this proves they still work
// (an esbuild or html-minifier edge case would show up here, not in production).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { JSDOM, VirtualConsole } = require('jsdom');
const { indexedDB } = require('fake-indexeddb');

const root = path.join(__dirname, '..');

// Same list and order as test-app-boot.js: the deferred scripts in document order.
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

const IGNORED_JS_ERRORS = [/Not implemented/i, /speech synthesis/i, /getContext/i];

test('the minified deploy artifact boots and renders the daily kanji', async (t) => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kanji-build-'));
    t.after(() => fs.rmSync(outDir, { recursive: true, force: true }));

    execFileSync(process.execPath, [path.join(root, 'tools/minify.js'), outDir], {
        cwd: root,
        stdio: 'pipe'
    });
    // The artifact serves the level data next to the scripts, like the deploy does.
    fs.mkdirSync(path.join(outDir, 'database'), { recursive: true });
    fs.copyFileSync(
        path.join(root, 'database/Hiragana.json'),
        path.join(outDir, 'database/Hiragana.json')
    );

    const readOut = (name) => fs.readFileSync(path.join(outDir, name), 'utf8');

    // HTML got minified: smaller, comments gone, structure intact.
    const sourceHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const minHtml = readOut('index.html');
    assert.ok(
        minHtml.length < sourceHtml.length * 0.75,
        'minified index.html must be clearly smaller than the source'
    );
    assert.equal(minHtml.includes('<!--'), false, 'comments are stripped');
    assert.ok(minHtml.includes('id="kanjiWidget"'), 'the widget survives minification');
    assert.ok(minHtml.includes('<textarea'), 'textarea content is not collapsed away');

    const errors = [];
    const virtualConsole = new VirtualConsole();
    virtualConsole.on('jsdomError', (error) => {
        const message = error?.message || String(error);
        if (!IGNORED_JS_ERRORS.some((pattern) => pattern.test(message))) {
            errors.push(message);
        }
    });

    const dom = new JSDOM(minHtml, {
        url: 'https://kanji.qd.je/',
        runScripts: 'outside-only',
        pretendToBeVisual: true,
        virtualConsole
    });
    const { window } = dom;
    const { document } = window;

    window.indexedDB = indexedDB;
    const noop = () => {};
    window.HTMLMediaElement.prototype.play = () => Promise.resolve();
    window.HTMLMediaElement.prototype.pause = noop;
    window.HTMLMediaElement.prototype.load = noop;
    window.HTMLElement.prototype.scrollIntoView = noop;
    const fakeCtx = new Proxy({ canvas: null }, { get: (t, p) => (p in t ? t[p] : noop) });
    window.HTMLCanvasElement.prototype.getContext = function () {
        fakeCtx.canvas = this;
        return fakeCtx;
    };
    window.fetch = (input) => {
        const local = String(input)
            .replace(/^https?:\/\/[^/]+/, '')
            .split('?')[0];
        const file = path.join(outDir, local);
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
    Object.defineProperty(window.navigator, 'serviceWorker', {
        configurable: true,
        value: { register: () => Promise.resolve({}) }
    });

    await new Promise((resolve) => window.addEventListener('load', resolve, { once: true }));
    window.eval(APP_SCRIPTS.map(readOut).join('\n;\n'));
    document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true }));
    await new Promise((resolve) => window.setTimeout(resolve, 400));

    assert.deepEqual(errors, [], 'the minified bundle must boot without errors');
    const character = document.querySelector('#kanjiWidget .kanji-character');
    assert.ok(character, 'the widget rendered');
    assert.equal(character.textContent.trim(), 'あ', 'fresh visitors start on あ');
    assert.equal(
        document.getElementById('progressStats').textContent.trim(),
        '0 mastered | 46 total (Hiragana level)'
    );
    window.close();
});
