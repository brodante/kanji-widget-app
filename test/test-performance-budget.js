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

test('fonts: self-hosted Klee One blocks, the other Google faces stay async', () => {
    const html = read('index.html');
    const head = html
        .slice(0, html.indexOf('</head>'))
        .replace(/<noscript>[\s\S]*?<\/noscript>/g, '');

    // The blocking stylesheets: the self-hosted Klee One CSS (the only family
    // the first screen needs) and the app's own styles.css. The combined css2
    // request they replace carried five families (~323 KiB) and blocked first
    // paint for ~3.9 s on mobile.
    const blockingStyles = [...head.matchAll(/<link[^>]*rel="stylesheet"[^>]*>/g)]
        .map((match) => match[0])
        .filter((tag) => !tag.includes('media="print"'));
    assert.equal(
        blockingStyles.length,
        2,
        `expected exactly two blocking stylesheets, got: ${blockingStyles.join(' | ')}`
    );
    assert.ok(
        blockingStyles[0].includes('assets/fonts/klee-one.css?v=klee-one-v1'),
        'Klee One CSS is local and blocking'
    );
    assert.equal(
        blockingStyles[1],
        '<link rel="stylesheet" href="styles.css?v=custom-footer-glass-v1" />'
    );

    // Klee One must never be requested from Google again; the async css2 keeps
    // exactly the four families the theme picker and the stroke-guide numbers use.
    const css2Links = [
        ...new Set(
            [...html.matchAll(/href="(https:\/\/fonts\.googleapis\.com\/css2[^"]*)"/g)].map(
                (match) => match[1]
            )
        )
    ];
    assert.equal(css2Links.length, 1, 'one css2 URL (async link + noscript twin)');
    const remote = css2Links[0];
    assert.equal(remote.includes('Klee+One'), false, 'Klee One is self-hosted now');
    for (const family of ['Noto+Sans+JP', 'Noto+Serif+JP', 'Zen+Antique', 'Zen+Maru+Gothic']) {
        assert.ok(remote.includes(family), family);
    }
    // Yu Gothic is a device font only; it must never load from the CDN.
    assert.equal(remote.includes('Yu+Gothic'), false, 'Yu Gothic is a system font');
    assert.equal(remote.includes('Material+Icons'), false, 'Material Icons is never used');
    assert.ok(remote.includes('display=swap'), 'font-display: swap avoids invisible text');
    // The remote link loads async, with a no-JS fallback.
    assert.match(
        head,
        /<link[^>]*id="remoteFontsLink"[^>]*media="print"[^>]*onload="this\.media = 'all'"/
    );
    assert.ok(html.includes('<noscript>'));
    // Preconnects stay: the async css2 and its woff2 files still use both origins.
    assert.match(head, /<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com" \/>/);
    assert.match(
        head,
        /<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin \/>/
    );

    // The generated CSS is fully local, carries both weights the app uses
    // (.kanji-character asks for 300, which matches 400 upward; bold kanji use
    // 600) and keeps fontsource's font-display: swap.
    const kleeCss = read('assets/fonts/klee-one.css');
    assert.equal(kleeCss.includes('https://'), false, 'no remote references');
    const faces = kleeCss.split('@font-face').slice(1);
    assert.ok(faces.length > 200, 'the full unicode-range subset list ships');
    for (const face of faces) {
        assert.ok(face.includes('font-family:Klee One'), 'family name');
        assert.ok(face.includes('font-display:swap'), 'swap on every face');
        assert.match(face, /font-weight:(400|600)/);
        const urls = [...face.matchAll(/url\(([^)]*)\)/g)].map((match) => match[1]);
        assert.ok(urls.length > 0, 'every face has a src');
        for (const url of urls) {
            assert.ok(url.startsWith('klee-one/'), `src must be local: ${url}`);
        }
    }

    // The preloads are the subsets whose unicode-range covers あ (U+3042), the
    // LCP character, for both weights. If fontsource ever renumbers its
    // subsets, this fails loudly instead of preloading the wrong file.
    for (const weight of [400, 600]) {
        const file = `klee-one-119-${weight}-normal.woff2`;
        assert.ok(
            head.includes(`href="assets/fonts/klee-one/${file}"`),
            `${file} is referenced in the head`
        );
        const preload = head.match(
            new RegExp(`<link[^>]*rel="preload"[^>]*href="assets/fonts/klee-one/${file}"[^>]*>`)
        );
        assert.ok(preload, `${file} is preloaded`);
        assert.ok(preload[0].includes('as="font"'), `${file}: as=font`);
        assert.ok(preload[0].includes('type="font/woff2"'), `${file}: woff2 type`);
        assert.ok(preload[0].includes('crossorigin'), `${file}: CORS-mode preload`);
        const buffer = fs.readFileSync(path.join(root, 'assets/fonts/klee-one', file));
        assert.equal(buffer.toString('ascii', 0, 4), 'wOF2', `${file} is a real woff2`);
        const face = faces.find((candidate) => candidate.includes(file));
        assert.ok(face, `${file} has an @font-face rule`);
        const range = face.match(/unicode-range:([^;}]*)/)[1];
        const covers = range.split(',').some((token) => {
            const parts = token.trim().replace(/^U\+/, '').split('-');
            const start = Number.parseInt(parts[0], 16);
            const end = parts.length > 1 ? Number.parseInt(parts[1], 16) : start;
            return start <= 0x3042 && 0x3042 <= end;
        });
        assert.ok(covers, `subset 119 (${weight}) must cover U+3042 あ`);
    }

    // The picker is a curated 3x2 (five fonts + a "More fonts" tile) that
    // expands to every available font.
    const gridStart = html.indexOf('id="fontPreviewGrid"');
    const gridHtml = html.slice(gridStart, html.indexOf('</select>', gridStart));
    assert.equal(
        (gridHtml.match(/class="font-option/g) || []).length,
        11,
        'eleven font tiles in the expandable grid'
    );
    assert.equal(
        (gridHtml.match(/font-option-extra/g) || []).length,
        6,
        'six extra tiles hidden until the 3x2 grid expands'
    );
    assert.ok(
        gridHtml.includes('id="fontMoreBtn"') &&
            gridHtml.includes('class="font-more"') &&
            gridHtml.includes('role="button"'),
        'the faded More-fonts tile expands the grid'
    );

    // The theme-picker display faces (Hannari, Kokoro) are self-hosted. Google's
    // Early Access endpoint served them without CORS headers, so the browser
    // blocked every request and the faces never rendered; both are also gone from
    // the css2 API. They ship as OFL-licensed TTFs next to the other assets.
    assert.equal(html.includes('earlyaccess'), false, 'no more Early Access endpoints');
    assert.ok(
        html.includes(
            `<link\n            id="displayFontsLink"\n            media="print"\n            onload="this.media = 'all'"\n            href="assets/fonts/display-fonts.css?v=display-fonts-v1"\n            rel="stylesheet"\n        />`
        ),
        'the display faces stay async (after first paint)'
    );
    const displayCss = read('assets/fonts/display-fonts.css');
    assert.ok(displayCss.includes("font-family: 'Hannari'"), 'Hannari @font-face present');
    assert.ok(displayCss.includes("font-family: 'Kokoro'"), 'Kokoro @font-face present');
    for (const file of ['Hannari-Regular.ttf', 'Kokoro-Regular.ttf']) {
        const buffer = fs.readFileSync(path.join(root, 'assets/fonts', file));
        assert.equal(buffer.length > 10000, true, `${file} ships with the app`);
        assert.equal(buffer.readUInt32BE(0), 0x00010000, `${file} is a valid TrueType font`);
    }
    // woff2 carries the same outlines at roughly half the weight and is what
    // browsers pick; the TTF src stays as a fallback during the transition
    // window where an SW-cached copy of this CSS may still reference it.
    for (const name of ['Hannari-Regular', 'Kokoro-Regular']) {
        const woff2 = fs.readFileSync(path.join(root, `assets/fonts/${name}.woff2`));
        const ttf = fs.readFileSync(path.join(root, `assets/fonts/${name}.ttf`));
        assert.equal(woff2.toString('ascii', 0, 4), 'wOF2', `${name}.woff2 signature`);
        assert.ok(woff2.length < ttf.length * 0.7, `${name}.woff2 must be clearly smaller`);
        const face = displayCss.slice(displayCss.indexOf(name));
        assert.ok(
            face.indexOf(`${name}.woff2`) < face.indexOf(`${name}.ttf`),
            `${name}: woff2 must come first in the src list`
        );
    }
});

test('the font refinement promotes a saved non-Klee face into the blocking slot', () => {
    const html = read('index.html');
    // The refinement is an inline head script (no src, so it never counts as a
    // blocking external script) that runs before first paint.
    const script = html.match(
        /<script>\s*\(function \(\) \{\s*try \{\s*var saved[\s\S]*?<\/script>/
    );
    assert.ok(script, 'the refinement script lives in the head');
    const body = script[0];
    // Every Google-hosted picker family maps to a single-family css2 request...
    assert.ok(body.includes("'Noto Sans JP': 'Noto+Sans+JP:wght@300;400;500;700'"));
    assert.ok(body.includes("'Noto Serif JP': 'Noto+Serif+JP:wght@400;700'"));
    assert.ok(body.includes("'Zen Antique': 'Zen+Antique'"));
    assert.ok(body.includes("'Zen Maru Gothic': 'Zen+Maru+Gothic:wght@400;700'"));
    // ...the self-hosted display faces promote display-fonts.css instead...
    assert.ok(body.includes("font === 'Hannari' || font === 'Kokoro'"));
    assert.ok(body.includes("document.getElementById('displayFontsLink').media = 'all'"));
    // ...and promotion means the link becomes blocking.
    assert.ok(body.includes("remote.media = 'all'"));
    assert.ok(body.includes("localStorage.getItem('kanjiSettings')"));
    // Device fonts (Hiragino Sans, Yu Gothic, Meiryo, MS Gothic) and the Klee
    // default intentionally map to nothing: there is no webfont to fetch.
    assert.equal(body.includes('Hiragino Sans'), false);
});

test('the prerender gate marks returning visitors before first paint', () => {
    const html = read('index.html');
    const css = read('styles.css');
    assert.match(html, /<html lang="en" data-prerender="on">/);
    // The gate runs in the head, before any stylesheet or body markup.
    const gate = html.match(/<script>\s*\(function \(\) \{\s*try \{\s*var keys[\s\S]*?<\/script>/);
    assert.ok(gate, 'the gate script lives in the head');
    assert.ok(
        html.indexOf(gate[0]) < html.indexOf('<link rel="stylesheet"'),
        'the gate must run before the first stylesheet'
    );
    for (const key of ['kanjiSettings', 'kanji_settings', 'kanji_progress', 'kanji_recent']) {
        assert.ok(gate[0].includes(`'${key}'`), `the gate checks ${key}`);
    }
    assert.ok(gate[0].includes("document.documentElement.setAttribute('data-returning', '')"));
    // The CSS side: returning visitors lose the prerender and see the spinner,
    // first-timers keep the prerender and never see a spinner flash.
    assert.ok(css.includes('html[data-returning] .prerender-static'));
    assert.ok(
        css.includes('html[data-prerender]:not([data-returning]) #kanjiWidget > .widget-loading')
    );
});

test('the prerendered first screen matches the default-level database', () => {
    const html = read('index.html');
    const db = JSON.parse(read('database/Hiragana.json'));
    const kanji = db.Hiragana;
    const first = kanji[0];
    assert.equal(first.character, 'あ');

    // The LCP character, its meanings and its readings come straight from the
    // default level's data file.
    assert.ok(
        html.includes('<div class="kanji-character japanese-text prerender-static">あ</div>')
    );
    assert.ok(
        html.includes(
            `<div class="kanji-meaning prerender-static">${first.meanings.join(', ')}</div>`
        )
    );
    // あ has no on'yomi; its single kun'yomi reading is a clickable span.
    const readings = html.slice(
        html.indexOf('<div class="kanji-readings prerender-static">'),
        html.indexOf('<div class="kanji-examples prerender-static">')
    );
    assert.equal(readings.includes("On'yomi"), false, 'あ has no on-yomi');
    assert.ok(readings.includes("Kun'yomi"));
    for (const reading of first.kunyomi) {
        assert.ok(readings.includes(`onclick="app.playSpecificReading('${reading}')"`));
    }
    // Examples mirror the template: the first three, word + reading + meaning.
    const examples = html.slice(
        html.indexOf('<div class="kanji-examples prerender-static">'),
        html.indexOf('<div class="stroke-order-section prerender-static">')
    );
    for (const example of first.examples.slice(0, 3)) {
        assert.ok(examples.includes(example.word), example.word);
        assert.ok(examples.includes(example.meaning), example.meaning);
    }
    // The practice tab is the default surface: flipped card, active Practice
    // button, visible controls, the loading line loadStrokeOrder() would show.
    assert.ok(
        html.includes('<div class="stroke-order-flip-card flipped" id="strokeOrderFlipCard">')
    );
    assert.ok(html.includes('class="stroke-order-mode-btn stroke-order-practice active"'));
    assert.equal(
        html.includes('class="stroke-order-mode-btn stroke-order-play active"'),
        false,
        'the Animate tab must not start active'
    );
    assert.match(
        html,
        /<div class="stroke-order-loading">\s*Loading stroke order…\s*<\/div>/,
        'the prerender shows the same loading line loadStrokeOrder() writes'
    );

    // Progress line and journey grid mirror a fresh visitor on Hiragana.
    assert.ok(
        html.includes(`0 mastered | ${kanji.length} total (Hiragana level)`),
        'progressStats matches the level size'
    );
    const gridStart = html.indexOf('<div id="kanjiJourney" class="journey-grid kana-layout">');
    assert.ok(gridStart !== -1, 'the journey grid is prerendered in kana layout');
    // Prettier wraps the pill buttons over several lines; compare on the
    // whitespace-normalized slice.
    const grid = html.slice(gridStart, html.indexOf('</div>', gridStart)).replace(/\s+/g, ' ');
    const pills = [
        ...grid.matchAll(/<button class="([^"]*)" data-character="([^"]+)"[^>]*>([^<]+)<\/button>/g)
    ];
    assert.equal(pills.length, kanji.length, 'one pill per character');
    assert.deepEqual(
        pills.map((match) => match[2]),
        kanji.map((k) => k.character),
        'pills in database order'
    );
    assert.ok(pills.every((match) => match[1] === 'journey-pill pending prerender-static'));
    assert.ok(
        pills.every((match) => match[3].trim() === match[2]),
        'pill text is its character'
    );
    assert.ok(html.includes('No recently studied items for Hiragana yet.'));
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

test('the footer stacks above the full-viewport WebGL theme canvases', () => {
    // Regression: the footer is a direct child of <body> (outside .app-container),
    // while the nami/lumen/obake/ito backgrounds are position:fixed; z-index:0.
    // Static content paints below those, which hid the footer in those themes.
    const css = read('styles.css');
    const footerBlock = css.slice(
        css.indexOf('.app-footer {'),
        css.indexOf('\n}', css.indexOf('.app-footer {'))
    );
    assert.match(footerBlock, /position:\s*relative/);
    assert.match(footerBlock, /z-index:\s*1/);
    // The app container must sit above the footer, or the footer (later in
    // DOM order) paints over fixed in-container elements such as the toast.
    // Full body-level order: theme canvases (0) < footer (1) < app content (2).
    const containerBlock = css.slice(
        css.indexOf('.app-container {'),
        css.indexOf('\n}', css.indexOf('.app-container {'))
    );
    assert.match(containerBlock, /z-index:\s*2/);
    // The canvases must stay behind the app content layer.
    for (const cls of [
        'nami-background',
        'lumen-background',
        'obake-background',
        'ito-background'
    ]) {
        const canvasBlock = css.slice(
            css.indexOf(`.${cls} {`),
            css.indexOf('\n}', css.indexOf(`.${cls} {`))
        );
        assert.match(canvasBlock, /position:\s*fixed/);
        assert.match(canvasBlock, /z-index:\s*0/);
    }
});

test('the footer shares the frosted-glass treatment of the sections in WebGL themes', () => {
    // The kanji/progress/journey/recent cards are translucent glass in the four
    // WebGL themes; the footer must follow them, not be an opaque block.
    const css = read('styles.css');
    for (const theme of ['nami', 'lumen', 'obake', 'ito']) {
        assert.ok(
            css.includes(`[data-theme='${theme}'] .footer-content`),
            `${theme}: footer missing from the glass selector list`
        );
        const start = css.indexOf(`[data-theme='${theme}'] .kanji-widget,`);
        const rule = css.slice(start, css.indexOf('\n}', start));
        assert.match(
            rule,
            /background-color: rgba\(\d+,\s*\d+,\s*\d+,\s*0\.\d+\) !important/,
            `${theme}: glass rule lost its translucent background`
        );
        assert.match(rule, /backdrop-filter: blur\(\d+px\)/);
        assert.match(rule, /background-image: none/);
    }
});

test('the custom theme footer matches its translucent cards', () => {
    // Dante's curated picks and uploaded backgrounds both apply as custom-1.
    // Keep the footer on the same glass panel as progress and journey, and clear
    // its base white tint so it does not look like an opaque block.
    const css = read('styles.css');
    const start = css.indexOf("[data-theme='custom-1'] .kanji-widget,");
    assert.notEqual(start, -1, 'custom theme glass rule must exist');
    const rule = css.slice(start, css.indexOf('}', start));

    assert.ok(rule.includes("[data-theme='custom-1'] .footer-content"));
    assert.ok(rule.includes('background-color: rgba(var(--custom-panel-rgb, 30, 30, 30), 0.65);'));
    assert.ok(rule.includes('background-image: none;'));
    assert.ok(rule.includes('backdrop-filter: blur(10px);'));
});

test('the service worker caches instead of bypassing the HTTP cache', () => {
    const worker = read('sw.js');
    assert.equal(
        /fetch\([^)]*cache:\s*'no-store'/.test(worker),
        false,
        'no-store disabled the HTTP cache'
    );
    assert.match(worker, /CACHE_NAME = 'kanji-widgets-v36'/);
    // Repeat visits are served from the cache and refreshed in the background.
    assert.match(worker, /if \(destination === 'script' \|\| destination === 'style'\)/);
    assert.match(worker, /if \(request\.mode === 'navigate'\)/);
    // Stroke-order data from the CDNs is still available offline.
    assert.ok(worker.includes("'raw.githubusercontent.com'"));
    assert.ok(worker.includes("'cdn.jsdelivr.net'"));

    // The precache list holds exactly the URLs the page requests, once each.
    // It used to carry bare and ?v= twins of five assets plus both '/' and
    // '/index.html', so every install downloaded ~50 KiB twice.
    const listSource = worker.slice(
        worker.indexOf('const urlsToCache = ['),
        worker.indexOf('];', worker.indexOf('const urlsToCache = ['))
    );
    const entries = [...listSource.matchAll(/'([^']+)'/g)].map((match) => match[1]);
    assert.equal(new Set(entries).size, entries.length, 'precache entries must be unique');
    assert.equal(entries.includes('/'), false, 'the navigation fallback covers /');
    for (const bare of ['/styles.css', '/script.js', '/drawing-pad.js', '/backup-manager.js']) {
        assert.equal(entries.includes(bare), false, `${bare} is only requested with its ?v=`);
    }
    // Every versioned script/style URL in index.html must be precached, or the
    // offline shell breaks the moment the network drops.
    const html = read('index.html');
    const requested = [
        ...html.matchAll(/<script[^>]*src="([^"?]+(?:\?[^"]+)?)"[^>]*>/g),
        ...html.matchAll(/<link[^>]*href="((?:styles\.css|assets\/fonts\/[^"]+\.css)[^"]*)"[^>]*>/g)
    ].map((match) => `/${match[1].replace(/^\//, '')}`);
    for (const url of new Set(requested)) {
        assert.ok(entries.includes(url), `precache is missing ${url}`);
    }
    // The default level data is precached so the first screen works offline.
    assert.ok(entries.includes('/database/Hiragana.json'));
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
    // index.html is minified as well (comments + inter-tag whitespace, about -55%),
    // behind a sanity gate that refuses to ship a document which lost ids or tags.
    assert.match(tool, /html-minifier-terser/);
    assert.match(tool, /collapseWhitespace: true/);
    assert.match(tool, /minification lost element id/);
    assert.match(deploy, /for f in script\.js styles\.css kanji-data\.js index\.html; do/);
});

test('Font Awesome ships as a self-hosted subset, not the full cdnjs bundle', () => {
    const html = read('index.html');
    // The cdnjs bundle cost 344 KiB (16 KiB CSS + 125 KiB solid + 103 KiB brands
    // woff2 for the single GitHub icon). The subset keeps every glyph the app uses.
    assert.equal(
        html.includes('cdnjs.cloudflare.com/ajax/libs/font-awesome'),
        false,
        'no Font Awesome from cdnjs'
    );
    assert.ok(
        html.includes('assets/fonts/fa/css/fontawesome-subset.css?v=fa-subset-6.0.0-v1'),
        'the subset CSS loads from the same origin'
    );
    // Still async with a no-JS fallback, exactly like the CDN link was.
    const faLink = html.match(/<link[^>]*fontawesome-subset\.css[^>]*>/)[0];
    assert.match(faLink, /media="print"/);
    assert.match(faLink, /onload="this\.media = 'all'"/);
    assert.ok(html.includes('<noscript>'));

    const css = read('assets/fonts/fa/css/fontawesome-subset.css');
    assert.match(css, /@font-face/);
    assert.ok(css.includes("font-family: 'Font Awesome 6 Free'"));
    assert.ok(css.includes("font-family: 'Font Awesome 6 Brands'"));
    assert.match(css, /@keyframes fa-spin/);

    // Every fa-* class in the shipped files must have a glyph rule in the subset,
    // or ship nothing (fa-sparkles has no glyph in Font Awesome 6.0.0 and renders
    // empty both before and after the subset).
    const knownEmpty = new Set(['fa-sparkles']);
    const shipped = ['index.html'].concat(
        fs
            .readdirSync(root)
            .filter((f) => f.endsWith('.js') && !['server.js', 'firebase-config.js'].includes(f))
    );
    const used = new Set();
    for (const file of shipped) {
        // Strip ?v= cache-buster values: they contain fa-looking tokens
        // (like ?v=fa-subset-...) that are not icon classes.
        const text = read(file).replace(/\?v=[^"')\s]*/g, '');
        for (const match of text.matchAll(/(?<![-\w])fa-[a-z0-9]+(?:-[a-z0-9]+)*\b/g)) {
            used.add(match[0]);
        }
    }
    for (const cls of used) {
        if (knownEmpty.has(cls) || ['fa-spin', 'fa-pulse', 'fa-fw', 'fa-border'].includes(cls)) {
            continue;
        }
        assert.ok(
            css.includes(`.${cls}:before`) || css.includes(`.${cls}::before`),
            `${cls} is used by the app but missing from the subset: rerun tools/build-fa-subset.js`
        );
    }

    const solid = fs.statSync(
        path.join(root, 'assets/fonts/fa/webfonts/fa-solid-900-subset.woff2')
    );
    const brands = fs.statSync(
        path.join(root, 'assets/fonts/fa/webfonts/fa-brands-400-subset.woff2')
    );
    assert.ok(solid.size < 20000, `solid subset is ${solid.size} bytes, expected under 20 KiB`);
    assert.ok(brands.size < 5000, `brands subset is ${brands.size} bytes, expected under 5 KiB`);
    // The cdnjs preconnect stays for three.js.
    assert.match(
        html,
        /<link rel="preconnect" href="https:\/\/cdnjs\.cloudflare\.com" crossorigin \/>/
    );
});

test('the default level data is preloaded so the LCP character does not wait on JS', () => {
    const html = read('index.html');
    // kanji-data.js fetches database/{level}.json, but only after every deferred
    // script has executed. The preload starts the same request at parse time.
    // as="fetch" + crossorigin must match the CORS-mode fetch() or Chrome
    // downloads the file twice.
    assert.match(
        html,
        /<link rel="preload" href="database\/Hiragana\.json" as="fetch" crossorigin \/>/
    );
});

test('the theme toggle and applyTheme agree on the default theme', () => {
    const script = read('script.js');
    // A first-time visitor has no saved theme; applyTheme shows nami. The toggle
    // used to fall back to 'candy' here, believed the visitor was in light mode
    // and "switched to dark" by selecting nami again: a no-op click.
    const fallbacks = [...script.matchAll(/localStorage\.getItem\('theme'\) \|\| '(\w+)'/g)].map(
        (match) => match[1]
    );
    assert.ok(fallbacks.length >= 2, 'both applyTheme and the toggle read the saved theme');
    for (const fallback of fallbacks) {
        assert.equal(fallback, 'nami', `theme fallback must be nami everywhere, found ${fallback}`);
    }
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

test('dev theme manifests ship downscaled thumbs next to the full wallpapers', () => {
    // The 1920x1080 GIF used to load in full (5.5 MB) just to paint a picker
    // tile. Manifests now carry {file, thumb} pairs; the tile paints the thumb
    // and applying the theme still uses the full file.
    for (const folder of ['assets/dev-themes', 'assets/dev-themes/mobile']) {
        const manifest = JSON.parse(read(`${folder}/manifest.json`));
        assert.ok(Array.isArray(manifest) && manifest.length > 0, `${folder} manifest`);
        for (const entry of manifest) {
            const file = typeof entry === 'string' ? entry : entry.file;
            const thumb = (typeof entry === 'object' && entry !== null && entry.thumb) || file;
            const fullBytes = fs.statSync(path.join(root, folder, file)).size;
            const thumbBytes = fs.statSync(path.join(root, folder, thumb)).size;
            assert.ok(file && thumbBytes > 0, `${folder}/${file} and its thumb exist`);
            assert.ok(
                thumbBytes < fullBytes / 2,
                `${folder}/${thumb} (${thumbBytes} B) must be clearly smaller than ${file} (${fullBytes} B)`
            );
        }
    }
    const desktop = JSON.parse(read('assets/dev-themes/manifest.json'));
    assert.equal(typeof desktop[0], 'object', 'the shipped manifest uses the thumb form');
    assert.ok(desktop[0].thumb.endsWith('.thumb.gif'));
    const gif = fs.readFileSync(path.join(root, 'assets/dev-themes', desktop[0].thumb));
    assert.equal(gif.toString('ascii', 0, 3), 'GIF', 'the thumb is still an animated GIF');
});

test('the Ocean theme is a light cross-section and animates on the compositor only', () => {
    const html = read('index.html');
    const css = read('styles.css');
    const script = read('script.js');

    // The old name is gone everywhere: markup, CSS, scripts and picker.
    for (const [name, body] of [
        ['index.html', html],
        ['styles.css', css],
        ['script.js', script]
    ]) {
        assert.equal(body.includes('underwater'), false, `${name} still mentions underwater`);
    }

    // Registered in the picker's Light Themes group under its own name.
    const lightGroup = html.slice(
        html.indexOf('<optgroup label="Light Themes">'),
        html.indexOf('</optgroup>')
    );
    assert.ok(lightGroup.includes('<option value="ocean">Ocean</option>'));

    // Not a WebGL theme and in no dark list: the header quick-toggle must treat
    // it as light (sun icon, remembered via lastLightTheme).
    assert.ok(script.includes("const WEBGL_THEMES = ['nami', 'lumen', 'obake', 'ito'];"));
    assert.equal(/darkThemes = \[[^\]]*'ocean'/.test(script), false);

    // Dark text on pale water keeps the light/dark Google-button classification
    // (test-account-ui reads --on-surface luminance) on the light side.
    const varsStart = css.indexOf("[data-theme='ocean'] {");
    const vars = css.slice(varsStart, css.indexOf('\n}', varsStart));
    assert.match(vars, /--on-surface: #0b3a52/);
    assert.match(vars, /--accent-text: #01579b/);
    assert.match(vars, /--primary-color: #0288d1/);

    // The scene is one fixed layer: behind the content, click-transparent,
    // screen-reader inert, and only visible under its own theme.
    assert.equal((html.match(/class="ocean-scene" aria-hidden="true"/g) || []).length, 1);
    const sceneStart = css.indexOf('.ocean-scene {');
    const scene = css.slice(sceneStart, css.indexOf('\n}', sceneStart));
    assert.match(scene, /z-index: -10/);
    assert.match(scene, /pointer-events: none/);
    assert.match(scene, /display: none/);
    assert.ok(css.includes("[data-theme='ocean'] .ocean-scene {\n    display: block;"));

    // Cross-section: air band on top with two tiled wave layers at the
    // waterline, sliding in opposite directions on one shared keyframe.
    const surfaceStart = css.indexOf('.ocean-surface {');
    const surface = css.slice(surfaceStart, css.indexOf('\n}', surfaceStart));
    assert.match(surface, /height: 13vh/, 'the air band sits above the water');
    for (const layer of ['.ocean-wave-back', '.ocean-wave-front']) {
        const start = css.indexOf(`${layer} {`);
        const rule = css.slice(start, css.indexOf('\n}', start));
        assert.match(rule, /background-size: 480px/);
        assert.match(rule, /animation-duration: \d+s/);
    }
    const waveBase = css.slice(
        css.indexOf('.ocean-wave {'),
        css.indexOf('\n}', css.indexOf('.ocean-wave {'))
    );
    assert.match(waveBase, /animation-name: ocean-wave-drift/);
    assert.match(waveBase, /background-repeat: repeat-x/);
    assert.ok(css.includes('.ocean-wave-front {') && css.includes('animation-direction: reverse'));

    // Sixteen bubbles with their own lanes, popping at the surface (-88vh from
    // their start, i.e. right where the waterline sits), not above it.
    const bubblesStart = html.indexOf('<div class="ocean-bubbles">');
    const bubbles = html.slice(bubblesStart, html.indexOf('</div>', bubblesStart));
    assert.equal((bubbles.match(/<span><\/span>/g) || []).length, 16);
    const lanes = css.match(/\.ocean-bubbles span:nth-child\(\d+\) \{/g) || [];
    assert.equal(new Set(lanes).size, 16, 'every bubble has its own lane rule');
    const bubbleKey = css.slice(
        css.indexOf('@keyframes ocean-bubble-rise'),
        css.indexOf('\n}', css.indexOf('@keyframes ocean-bubble-rise'))
    );
    assert.ok(bubbleKey.includes('-88vh'), 'bubbles stop at the waterline');

    // Three fish silhouettes with lanes, one swimming against the others.
    const fishStart = html.indexOf('<div class="ocean-fish">');
    const fish = html.slice(fishStart, html.indexOf('</div>', fishStart));
    assert.equal((fish.match(/<span><\/span>/g) || []).length, 3);
    const fishLanes = css.match(/\.ocean-fish span:nth-child\(\d+\) \{/g) || [];
    assert.equal(new Set(fishLanes).size, 3);
    assert.ok(css.includes('animation-name: ocean-swim-rtl'), 'one fish swims the other way');

    // Bigger visitors: one shark, a pod of two dolphins, one turtle. Their
    // cycles are long (a minute or more) and each keyframe parks the animal
    // off-screen for the rest of the loop, so they pass by occasionally
    // instead of patrolling.
    const lifeStart = html.indexOf('<div class="ocean-life">');
    const life = html.slice(lifeStart, html.indexOf('</div>', lifeStart));
    assert.equal((life.match(/class="ocean-shark"/g) || []).length, 1);
    assert.equal((life.match(/ocean-dolphin/g) || []).length, 3, 'two dolphins (one extra class)');
    assert.equal((life.match(/class="ocean-turtle"/g) || []).length, 1);
    for (const animal of ['.ocean-shark', '.ocean-dolphin', '.ocean-turtle', '.ocean-whale']) {
        const start = css.indexOf(`${animal} {`);
        const rule = css.slice(start, css.indexOf('\n}', start));
        const seconds = Number.parseInt(rule.match(/animation-duration: (\d+)s/)[1], 10);
        assert.ok(seconds >= 60, `${animal} should visit rarely, got a ${seconds}s cycle`);
    }
    const whaleStart = css.indexOf('.ocean-whale {');
    const whale = css.slice(whaleStart, css.indexOf('\n}', whaleStart));
    assert.match(whale, /animation-duration: 240s/, 'the whale is rarer than the shark');
    assert.match(whale, /opacity: 0\.2\d/, 'the whale stays faded, far away in the deep');
    const dolphin2 = css.slice(css.indexOf('.ocean-dolphin-2 {'));
    assert.ok(dolphin2.includes('animation-delay'), 'the second dolphin trails the first one');

    // Refraction at the waterline: a shimmer band under the surface that
    // travels exactly one tile per loop, and ripple rings that spread and
    // fade on the surface.
    assert.ok(html.includes('<div class="ocean-shimmer"></div>'));
    const shimmerStart = css.indexOf('.ocean-shimmer {');
    const shimmer = css.slice(shimmerStart, css.indexOf('\n}', shimmerStart));
    assert.match(shimmer, /animation: ocean-shimmer-drift/);
    const shimmerKf = css.slice(
        css.indexOf('@keyframes ocean-shimmer-drift'),
        css.indexOf('\n}', css.indexOf('to {', css.indexOf('@keyframes ocean-shimmer-drift')))
    );
    assert.match(shimmerKf, /translate3d\(480px, 0, 0\)/, 'shimmer loops by exactly one tile');
    const rippleStart = css.indexOf('.ocean-ripple {');
    const ripple = css.slice(rippleStart, css.indexOf('\n}', rippleStart));
    assert.match(ripple, /border-radius: 50%/);
    assert.match(ripple, /animation-name: ocean-ripple-ring/);
    const rippleKf = css.slice(
        css.indexOf('@keyframes ocean-ripple-ring'),
        css.indexOf('\n}', css.indexOf('100%', css.indexOf('@keyframes ocean-ripple-ring')))
    );
    assert.match(rippleKf, /scale\(0\.1\)/);
    assert.match(rippleKf, /opacity: 0/, 'rings fade as they spread');

    // The beams are visible: bright enough, sharp enough, and they reach
    // almost all the way down to the reef.
    const raysStart = css.indexOf('.ocean-rays {');
    const rays = css.slice(raysStart, css.indexOf('\n}', raysStart));
    assert.match(rays, /rgba\(255, 255, 255, 0\.34\)/, 'main beam layer stays bright');
    assert.match(rays, /transparent 97%/, 'beams reach down to the reef');
    assert.ok(!rays.includes('blur(14px)'), 'beams are not blurred into mush');

    // Caustic veins on the sea floor: turbulence textures, screen-blended,
    // translating by whole 240px tiles so the loops are seamless.
    assert.ok(html.includes('<div class="ocean-floor-light"></div>'));
    const floorIdx = css.indexOf('.ocean-floor-light {');
    const floorRule = css.slice(floorIdx, css.indexOf('\n}', floorIdx));
    assert.match(floorRule, /mask-image/, 'the veins fade out above the floor');
    const floorLayers = css.slice(
        css.indexOf('.ocean-floor-light::before,'),
        css.indexOf('@keyframes ocean-floor-a')
    );
    assert.match(floorLayers, /mix-blend-mode: screen/);
    assert.equal((floorLayers.match(/feTurbulence/g) || []).length, 2, 'two caustic textures');
    assert.ok(floorLayers.includes("fill='none'"), 'degrades to nothing where filters fail');
    assert.match(floorLayers, /animation-name: ocean-floor-a/);
    assert.match(floorLayers, /animation-name: ocean-floor-b/);
    for (const [kfName, dx, dy] of [
        ['ocean-floor-a', '240px', '240px'],
        ['ocean-floor-b', '-240px', '480px']
    ]) {
        const kfText = css.slice(
            css.indexOf(`@keyframes ${kfName}`),
            css.indexOf('\n}', css.indexOf('to {', css.indexOf(`@keyframes ${kfName}`)))
        );
        assert.ok(
            kfText.includes(`translate3d(${dx}, ${dy}, 0)`),
            `${kfName} must move by whole tiles to stay seamless`
        );
    }

    // Dark areas: a static abyss gradient sinking the floor, plus two huge
    // soft current blobs drifting on slow alternate sways (no blur filters,
    // the blobs are radial gradients so the movement stays cheap).
    const depthStart = css.indexOf('.ocean-depth {');
    const depthRule = css.slice(depthStart, css.indexOf('\n}', depthStart));
    assert.match(depthRule, /linear-gradient/, 'the abyss darkens the water column');
    assert.ok(!/animation/.test(depthRule), 'the abyss itself does not move');
    const blobStart = css.indexOf('.ocean-depth::before,');
    const blob = css.slice(blobStart, css.indexOf('@keyframes ocean-current-drift'));
    assert.match(blob, /animation-name: ocean-current-drift/);
    assert.ok(!blob.includes('filter:'), 'current blobs are gradient-soft, never blurred');

    // Plankton motes: eight tiny drifting specks.
    const motesStart = html.indexOf('<div class="ocean-motes">');
    const motes = html.slice(motesStart, html.indexOf('</div>', motesStart));
    assert.equal((motes.match(/<span><\/span>/g) || []).length, 8);
    const moteLanes = css.match(/\.ocean-motes span:nth-child\(\d+\) \{/g) || [];
    assert.equal(new Set(moteLanes).size, 8);

    // Jellyfish: two bells pulsing upward, the pulse folded into the rise
    // keyframe as a squash-and-stretch scale.
    const jelliesStart = html.indexOf('<div class="ocean-jellies">');
    const jellies = html.slice(jelliesStart, html.indexOf('</div>', jelliesStart));
    assert.equal((jellies.match(/<span><\/span>/g) || []).length, 2);
    const jellyStart = css.indexOf('@keyframes ocean-jelly-rise');
    const jellyKf = css.slice(jellyStart, css.indexOf('\n}', css.indexOf('100%', jellyStart)));
    assert.match(jellyKf, /scale\(1\.08, 0\.92\)/, 'jellyfish pulse as they rise');

    // Kelp: six stalks on the reef, swaying from their bases.
    const kelpStart = html.indexOf('<div class="ocean-kelp">');
    const kelp = html.slice(kelpStart, html.indexOf('</div>', kelpStart));
    assert.equal((kelp.match(/<span><\/span>/g) || []).length, 6);
    const kelpBaseStart = css.indexOf('.ocean-kelp span {');
    const kelpBase = css.slice(kelpBaseStart, css.indexOf('\n}', kelpBaseStart));
    assert.match(kelpBase, /transform-origin: bottom center/, 'kelp leans from the floor');
    const kelpLanes = css.match(/\.ocean-kelp span:nth-child\(\d+\) \{/g) || [];
    assert.equal(new Set(kelpLanes).size, 6);

    // Vignette: static framing, no animation allowed.
    const vigStart = css.indexOf('.ocean-vignette {');
    const vig = css.slice(vigStart, css.indexOf('\n}', vigStart));
    assert.match(vig, /radial-gradient/);
    assert.ok(!/animation/.test(vig), 'the vignette is one static paint');

    // The reef rests on the bottom in two silhouette layers, mirrored so the
    // same tile never reads twice, and never animates (the floor is static).
    const reefStart = css.indexOf('.ocean-reef {');
    const reef = css.slice(reefStart, css.indexOf('\n}', reefStart));
    assert.match(reef, /height: 24vh/);
    assert.match(reef, /bottom: 0/);
    const reefBefore = css.slice(css.indexOf('.ocean-reef::before {'));
    assert.ok(reefBefore.includes('transform: scaleX(-1)'), 'far reef layer is mirrored');
    assert.equal(/\.ocean-reef[^{]*\{[^}]*animation/.test(css), false, 'the reef must not move');

    // Every ocean keyframe may animate transform/opacity only: anything else
    // repaints a full-viewport layer every frame on cheap phones.
    const keyframes = [...css.matchAll(/@keyframes (ocean-[\w-]+) \{([\s\S]*?)\n\}/g)];
    assert.equal(
        keyframes.length,
        19,
        'waves, shimmer, ripples, rays, caustics, floor light, currents, bubbles, motes, jellies, kelp, swim paths and visitors'
    );
    for (const [, name, body] of keyframes) {
        const props = [...body.matchAll(/^\s+([a-z-]+)\s*:/gm)].map((match) => match[1]);
        assert.ok(props.length > 0, `${name} is empty?`);
        for (const prop of props) {
            assert.ok(
                prop === 'transform' || prop === 'opacity',
                `${name} must not animate ${prop}`
            );
        }
    }

    // Reduced motion keeps the cross-section but freezes it: bubbles rest
    // mid-water and fish hold their positions instead of swimming.
    const afterReef = css.indexOf('.ocean-reef::after {');
    const reducedStart = css.indexOf('@media (prefers-reduced-motion: reduce)', afterReef);
    assert.ok(reducedStart > afterReef, 'the ocean reduced-motion block exists');
    const reduced = css.slice(reducedStart, css.indexOf('\n}\n', reducedStart));
    assert.ok(reduced.includes("[data-theme='ocean'] .ocean-bubbles span"));
    assert.ok(reduced.includes("[data-theme='ocean'] .ocean-fish span"));
    assert.ok(reduced.includes("[data-theme='ocean'] .ocean-life span"));
    assert.ok(reduced.includes("[data-theme='ocean'] .ocean-kelp span"));
    assert.ok(reduced.includes("[data-theme='ocean'] .ocean-shimmer"));
    assert.ok(reduced.includes("[data-theme='ocean'] .ocean-ripple"));
    assert.ok(reduced.includes("[data-theme='ocean'] .ocean-floor-light::before"));
    assert.ok(reduced.includes("[data-theme='ocean'] .ocean-jellies span"));
    assert.ok(reduced.includes("[data-theme='ocean'] .ocean-motes span"));
    assert.ok(reduced.includes("[data-theme='ocean'] .ocean-depth::before"));
    assert.match(reduced, /animation: none/);
    // The visitors hold a still pose instead of vanishing mid-swim.
    assert.ok(reduced.includes('translate3d(66vw, 0, 0) scaleX(-1)'), 'shark rests in frame');
    assert.ok(reduced.includes('.ocean-turtle {'), 'turtle rests in frame');
    assert.ok(reduced.includes('.ocean-whale {'), 'whale rests in frame');
    assert.ok(reduced.includes('.ocean-jellies span:nth-child(1)'), 'jellyfish rest mid-rise');

    // The glass panels carry the footer too, so the theme reads as one body of
    // water instead of an opaque block at the bottom.
    const glassStart = css.indexOf("[data-theme='ocean'] .kanji-widget,");
    const glass = css.slice(glassStart, css.indexOf('\n}', glassStart));
    assert.ok(glass.includes("[data-theme='ocean'] .footer-content"));
    assert.match(glass, /background-color: rgba\(255, 255, 255, 0\.42\) !important/);
    assert.match(glass, /backdrop-filter: blur\(10px\)/);
    assert.match(glass, /background-image: none/);
});
