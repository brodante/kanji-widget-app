// Guards the performance work in docs/performance-optimization-plan.md.
// PageSpeed reported FCP 12.2 s / LCP 14.5 s because ~188 KiB of app scripts, 131 KiB of
// three.js and five stylesheets all blocked the first paint. These checks keep that
// regression from coming back silently.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

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

test('every app script is deferred so none of them blocks the parser', () => {
    const html = read('index.html');
    for (const script of APP_SCRIPTS) {
        const match = html.match(new RegExp(`<script[^>]*src="[^"]*${script}[^"]*"[^>]*>`));
        assert.ok(match, `${script} must be referenced from index.html`);
        assert.match(match[0], /\sdefer(\s|>)/, `${script} must be deferred`);
    }
    // The classic (non-deferred) <script src> count in <head> must stay at the analytics one.
    const head = html.slice(0, html.indexOf('</head>'));
    const blocking = [...head.matchAll(/<script(?![^>]*\bdefer\b)[^>]*src=/g)];
    assert.equal(blocking.length, 0, 'no script in <head> may block rendering');
});

test('three.js and its addons are no longer render-blocking head scripts', () => {
    const html = read('index.html');
    const script = read('script.js');

    for (const url of ['three.min.js', 'EffectComposer.js', 'UnrealBloomPass.js']) {
        assert.equal(html.includes(url), false, `${url} must not be a <script> in the HTML`);
        assert.ok(script.includes(url), `${url} is still loaded, just on demand`);
    }

    // The lazy loader keeps the original order so the addons can extend THREE.
    const loader = script.slice(script.indexOf('const THREE_CDN_SCRIPTS'), script.indexOf('];'));
    const order = [...loader.matchAll(/'(https:\/\/[^']+)'/g)].map((match) => match[1]);
    assert.deepEqual(order, [
        'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
        'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/postprocessing/EffectComposer.js',
        'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/postprocessing/RenderPass.js',
        'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/postprocessing/ShaderPass.js',
        'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/shaders/CopyShader.js',
        'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/shaders/LuminosityHighPassShader.js',
        'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/postprocessing/UnrealBloomPass.js'
    ]);

    // WebGL themes boot through the loader, never by calling THREE directly.
    assert.match(
        script,
        /if \(WEBGL_THEMES\.includes\(themeName\)\) \{\s*startWebGLTheme\(themeName\);/
    );
    assert.doesNotMatch(script, /if \(themeName === 'nami'\) \{\s*initNamiWave\(\);/);

    // Each theme waits only on the three.js parts it uses: obake on the post-processing
    // chain, ito on nothing (its module bundles its own three.js), the rest on the core.
    assert.match(
        script,
        /themeName === 'obake'[\s\S]{0,80}ensurePostProcessing\(\)[\s\S]{0,120}themeName === 'ito'[\s\S]{0,80}Promise\.resolve\(\)[\s\S]{0,80}ensureThreeCore\(\);/
    );
    // The addons chain off the core, so they can never run before it.
    assert.match(
        script,
        /ensureThreeCore\(\)\s*\.then\(\(\) => injectScriptsInOrder\(THREE_POST_PROCESSING_SCRIPTS\)\)/
    );
});

test('fonts ship in one request: main faces block first paint, extras stay async', () => {
    const html = read('index.html');
    const fontLinks = [
        ...html.matchAll(/<link[^>]*href="(https:\/\/fonts\.googleapis\.com[^"]*)"[^>]*>/g)
    ].map((match) => match[1]);

    assert.equal(fontLinks.length >= 3, true, 'combined CSS plus the two earlyaccess faces');
    const combined = [...new Set(fontLinks.filter((href) => href.includes('css2')))];
    assert.equal(combined.length, 1, 'one css2 request instead of three');
    for (const family of ['Klee+One', 'Noto+Sans+JP', 'Zen+Antique', 'Zen+Maru+Gothic']) {
        assert.ok(combined[0].includes(family), family);
    }
    assert.equal(combined[0].includes('Material+Icons'), false, 'Material Icons is never used');
    assert.ok(combined[0].includes('display=swap'), 'font-display: swap avoids invisible text');
    // The preload and the stylesheet must be the same URL, or the preload is wasted.
    assert.ok(
        html.includes(
            `<link\n            rel="preload"\n            as="style"\n            href="${combined[0]}"\n        />`
        )
    );

    // <noscript> fallbacks are inert in every JS-enabled browser, so they never block.
    const head = html
        .slice(0, html.indexOf('</head>'))
        .replace(/<noscript>[\s\S]*?<\/noscript>/g, '');
    const blockingStyles = [...head.matchAll(/<link[^>]*rel="stylesheet"[^>]*>/g)]
        .map((match) => match[0])
        .filter((tag) => !tag.includes('media="print"'));
    // The main faces block first paint on purpose: the preload has already started the
    // download, so first paint finds Klee One ready instead of swapping it in over the
    // fallback font after the fact. That swap moved the progress line by 0.31 CLS.
    assert.deepEqual(blockingStyles, [
        `<link\n            href="${combined[0]}"\n            rel="stylesheet"\n        />`,
        '<link rel="stylesheet" href="styles.css?v=ai-floating-v1" />'
    ]);
    // Async stylesheets must have a no-JS fallback.
    assert.ok(html.includes('<noscript>'));
    // The font CDN is preconnected, which the report flagged as missing.
    assert.match(
        head,
        /<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin \/>/
    );
});

test('the viewport keeps pinch zoom enabled', () => {
    const html = read('index.html');
    const viewport = html.match(/<meta\s+name="viewport"\s+content="([^"]*)"/)[1];
    assert.equal(viewport.includes('user-scalable=no'), false);
    assert.equal(viewport.includes('maximum-scale'), false);
    assert.ok(viewport.includes('width=device-width'));
});

test('icon-only widget buttons carry an accessible name', () => {
    const script = read('script.js');
    const buttons = [
        script.match(/<button class="action-btn" onclick="app\.playPronunciation\(\)"[^>]*>/)[0],
        script.match(/<button class="action-btn jisho-btn"[^>]*>/)[0],
        script.match(/<button class="action-btn master-action-btn"[^>]*>/)[0]
    ];
    for (const button of buttons) {
        assert.match(button, /aria-label="[^"]+"/, `missing aria-label: ${button}`);
    }
    // The widget is the first visible content after the header <h1> (the account panel,
    // settings dialog and AI modal are all closed at load, so axe skips their headings),
    // which makes h1 -> h2 the only jump axe's heading-order rule accepts.
    assert.equal(script.includes('<h4>Examples</h4>'), false);
    assert.equal(script.includes('<h3>Examples</h3>'), false);
    assert.ok(script.includes('<h2>Examples</h2>'));
});

test('the footer uses an opaque surface instead of a translucent wash', () => {
    const css = read('styles.css');
    const footerStart = css.indexOf('.footer-content {');
    const block = css.slice(footerStart, css.indexOf('\n}', footerStart));
    assert.match(block, /background-color: var\(--surface\)/);
    assert.equal(/backdrop-filter\s*:/.test(block), false, 'a per-frame blur was removed too');
    assert.equal(
        css.includes(
            '.footer-jp {\n    font-size: 0.95rem;\n    margin-top: 0.2rem;\n    opacity: 0.75;'
        ),
        false
    );
    // Themes with a pale accent get a darker text tone so links stay above 4.5:1.
    for (const theme of ['candy', 'sunrise', 'yotsuba']) {
        const start = css.indexOf(`[data-theme='${theme}'] {`);
        const body = css.slice(start, css.indexOf('\n}', start));
        assert.match(body, /--accent-text: #/, `${theme} needs a readable link accent`);
    }
    const linkRule = css.slice(
        css.indexOf('a,\na:visited {'),
        css.indexOf('}', css.indexOf('a,\na:visited {'))
    );
    assert.match(linkRule, /color: var\(--accent-text, var\(--primary-color\)\);/);
});

test('the service worker caches instead of bypassing the HTTP cache', () => {
    const worker = read('sw.js');
    assert.equal(
        /fetch\([^)]*cache:\s*'no-store'/.test(worker),
        false,
        'no-store disabled the HTTP cache'
    );
    assert.match(worker, /CACHE_NAME = 'kanji-widgets-v33'/);
    // Repeat visits are served from the cache and refreshed in the background.
    assert.match(worker, /if \(destination === 'script' \|\| destination === 'style'\)/);
    assert.match(worker, /if \(request\.mode === 'navigate'\)/);
    // Stroke-order data from the CDNs is still available offline.
    assert.ok(worker.includes("'raw.githubusercontent.com'"));
    assert.ok(worker.includes("'cdn.jsdelivr.net'"));
});

test('deploy minifies first-party assets with the same filenames', () => {
    const deploy = read('.github/workflows/deploy.yml');
    const tool = read('tools/minify.js');
    assert.match(deploy, /node tools\/minify\.js deploy/, 'the Pages build must minify');
    assert.match(tool, /minify: true/);
    for (const asset of ['script.js', 'styles.css', 'backup-manager.js']) {
        assert.ok(tool.includes(`'${asset}'`), `${asset} must be minified`);
    }
    // Same filenames: index.html and the precache list keep working untouched.
    assert.match(tool, /fs\.writeFileSync\(path\.join\(outDir, asset\), result\.code\)/);
    assert.equal(read('.gitignore').includes('dist/'), true, 'build output stays out of git');
});

test('the Firebase stack (auth SDK + reCAPTCHA) starts off the critical path', () => {
    const source = read('app-auth.js');

    // Startup must not pull ~800 KiB of third-party JS: the stack waits for the learner's
    // first tap or keypress. The old 5 s idle timer fired inside every PageSpeed trace,
    // which is how reCAPTCHA (694 KiB + the App Check exchange) got onto the critical
    // path. Every consumer is interaction-driven: sign-in taps, AI Sensei questions
    // (AIManager awaits readyPromise) and the first keypress.
    assert.match(source, /window\.kanjiAuth\.readyPromise = new Promise\(\(resolve\) => \{/);
    assert.match(
        source,
        /document\.addEventListener\('pointerdown', start, \{ once: true, capture: true \}\)/,
        'the first tap starts the stack'
    );
    assert.match(
        source,
        /document\.addEventListener\('keydown', start, \{ once: true, capture: true \}\)/,
        'the first keypress starts the stack (keyboard-only learners included)'
    );
    assert.equal(
        source.includes('requestIdleCallback'),
        false,
        'no idle timer: it fired at ~5 s, inside every lab trace'
    );
    assert.equal(
        source.includes('window.kanjiAuth.readyPromise = window.kanjiAuth.init();'),
        false,
        'init() must not run on DOMContentLoaded'
    );

    // init() stays idempotent so a tap and a keypress cannot bind the controls twice.
    assert.match(source, /init\(\) \{\s*\/\/ The bootstrap may fire this from the first tap/);
    assert.match(source, /this\.initPromise = this\.start\(\);/);

    // App Check still runs before the Firebase services, exactly as before.
    assert.match(source, /await this\.initializeAppCheckIfConfigured\(\);/);
});
