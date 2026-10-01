#!/usr/bin/env node
/**
 * Builds the self-hosted Klee One webfont bundle.
 *
 * Klee One is the app's default kanji font and paints the LCP character, so
 * its stylesheet used to be the biggest render-blocking request on the page:
 * the combined Google Fonts css2 response is 323 KiB (eleven weights across
 * five families, each with ~120 CJK unicode-range subsets) and cost 3.8 s on
 * a slow mobile connection. Self-hosting splits that up:
 *
 *   - Klee One 400 + 600 ship from the same origin, in one small blocking
 *     stylesheet, with no round trip to fonts.googleapis.com and no
 *     cross-origin hop to fonts.gstatic.com. The service worker can cache it,
 *     so the default font now also works offline.
 *   - The four remaining families (Noto Sans JP, Noto Serif JP, Zen Antique,
 *     Zen Maru Gothic) stay on Google's CDN and load asynchronously; they are
 *     only needed by the font picker and by learners who switched fonts.
 *
 * The files come from @fontsource/klee-one, which mirrors Google's subset
 * split and unicode-range tables exactly (same OFL font, same rendering).
 *
 * Usage:
 *   npm i --no-save @fontsource/klee-one@5.3.0
 *   node tools/build-fonts.js [path/to/@fontsource/klee-one]
 *
 * Output (committed to the repo, no build needed at deploy time):
 *   assets/fonts/klee-one.css          (minified, both weights)
 *   assets/fonts/klee-one/*.woff2      (all unicode-range subsets)
 *   assets/fonts/klee-one/LICENSE
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const pkgRoot = path.resolve(
    process.argv[2] || path.join(root, 'node_modules/@fontsource/klee-one')
);

const WEIGHTS = [400, 600];
const OUT_DIR = path.join(root, 'assets/fonts/klee-one');
const OUT_CSS = path.join(root, 'assets/fonts/klee-one.css');

const main = async () => {
    let esbuild;
    try {
        esbuild = require('esbuild');
    } catch (error) {
        console.error('esbuild is required: run `npm install` before building.');
        process.exit(1);
    }
    if (!fs.existsSync(pkgRoot)) {
        console.error(
            `@fontsource/klee-one not found at ${pkgRoot}\n` +
                'Run: npm i --no-save @fontsource/klee-one@5.3.0'
        );
        process.exit(1);
    }

    fs.rmSync(OUT_DIR, { recursive: true, force: true });
    fs.mkdirSync(OUT_DIR, { recursive: true });

    let css = '';
    let files = 0;
    let bytes = 0;
    for (const weight of WEIGHTS) {
        const weightCss = fs.readFileSync(path.join(pkgRoot, `${weight}.css`), 'utf8');
        // Rewrite ./files/klee-one-...-normal.woff2 to klee-one/... and drop the
        // woff fallback: every browser this app supports (PWA, WebGL, modules)
        // reads woff2, same as what Google's css2 serves modern browsers.
        css += weightCss.replace(
            /src:\s*url\(\.\/files\/([^)]+)\)\s*format\('woff2'\),\s*url\([^)]*\)\s*format\('woff'\);/g,
            (match, woff2Name) => `src: url(klee-one/${woff2Name}) format('woff2');`
        );
        for (const match of weightCss.matchAll(/url\(\.\/files\/([^)]+\.woff2)\)/g)) {
            const name = match[1];
            const src = path.join(pkgRoot, 'files', name);
            fs.copyFileSync(src, path.join(OUT_DIR, name));
            files += 1;
            bytes += fs.statSync(src).size;
        }
    }

    if (!css.includes('src: url(klee-one/')) {
        console.error('URL rewrite failed: fontsource changed its src format. Inspect 400.css.');
        process.exit(1);
    }
    if (css.includes('./files/')) {
        console.error('some src URLs were not rewritten; aborting.');
        process.exit(1);
    }

    const header = `/* Klee One 400 + 600, self-hosted for KanjiWidgets.
 * Built by tools/build-fonts.js from @fontsource/klee-one@5.3.0, which mirrors
 * the google/fonts release (SIL Open Font License 1.1, see klee-one/LICENSE).
 * Same subset split and unicode-range tables as the Google Fonts css2 API, so
 * browsers download only the small slices they actually render.
 * Do not edit by hand; rerun the builder. */
`;

    const minified = await esbuild.transform(header + css, {
        loader: 'css',
        minify: true,
        legalComments: 'none'
    });
    fs.writeFileSync(OUT_CSS, minified.code);
    fs.copyFileSync(path.join(pkgRoot, 'LICENSE'), path.join(OUT_DIR, 'LICENSE'));

    console.log(
        `copied ${files} woff2 subsets (${(bytes / 1e6).toFixed(1)} MB) into assets/fonts/klee-one/`
    );
    console.log(`klee-one.css: ${minified.code.length} bytes minified`);

    // Report which subset files cover the characters of the default first
    // screen, so the preload list in index.html can be derived from data
    // instead of guesswork: あ (LCP), the hiragana block, 雨 (first example).
    const probe = { あ: 0x3042, ア: 0x30a2, 雨: 0x96e8, A: 0x0041 };
    for (const weight of WEIGHTS) {
        const weightCss = fs.readFileSync(path.join(pkgRoot, `${weight}.css`), 'utf8');
        for (const [label, codePoint] of Object.entries(probe)) {
            const hits = [];
            for (const block of weightCss.matchAll(
                /url\(\.\/files\/([^)]+\.woff2)\)[\s\S]*?unicode-range:([^;]+);/g
            )) {
                const inRange = block[2]
                    .split(',')
                    .map((r) => r.trim().replace(/^U\+/i, ''))
                    .some((r) => {
                        const [lo, hi] = r.split('-').map((x) => parseInt(x, 16));
                        return codePoint >= lo && codePoint <= (hi === undefined ? lo : hi);
                    });
                if (inRange) {
                    hits.push(block[1]);
                }
            }
            console.log(
                `weight ${weight}: ${label} U+${codePoint.toString(16)} -> ${hits.join(', ') || 'NOT FOUND'}`
            );
        }
    }
};

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
