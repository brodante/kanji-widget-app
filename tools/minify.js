#!/usr/bin/env node
/**
 * Minifies the first-party assets that ship to GitHub Pages.
 *
 * Usage: node tools/minify.js [outputDir]
 *
 * PageSpeed reported ~49 KiB of unminified JavaScript and ~12 KiB of unminified CSS.
 * This writes minified copies under the SAME filenames into `outputDir`, so index.html,
 * the service worker precache list and the `?v=` cache busters stay untouched - only the
 * bytes on the wire change. Nothing in the repository is modified.
 *
 * The app has no build step on purpose (static files, no framework), so this runs as a
 * deploy-time step in .github/workflows/deploy.yml and is never committed.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

// Everything deploy.yml copies that is first-party JS or CSS.
const ASSETS = [
    'analytics.js',
    'ai-manager.js',
    'ai-tutor-modal.js',
    'app-auth.js',
    'audio-manager.js',
    'auth-dialog.js',
    'avatar-crop.js',
    'backup-config.js',
    'backup-manager.js',
    'cloud-sync.js',
    'drawing-pad.js',
    'firebase-config.js',
    'kanji-data.js',
    'profile-page.js',
    'script.js',
    'srs-engine.js',
    'storage-manager.js',
    'styles.css',
    'ui-feedback.js',
    'username-directory.js',
    'username-policy.js'
];

// index.html is handled separately: html-minifier-terser with deliberately
// conservative settings. Whitespace inside <pre>/<textarea> is preserved by
// the minifier, inline scripts and styles are left alone (minifyJS is off),
// and only comments plus inter-tag whitespace are removed. The repo source
// keeps its comments; only the deployed copy is minified.
const minifyHtml = async (outDir) => {
    let htmlMinifier;
    try {
        htmlMinifier = require('html-minifier-terser');
    } catch (error) {
        console.error(
            'html-minifier-terser is required: run `npm install` (it is a devDependency) ' +
                'before building.'
        );
        process.exit(1);
    }

    // The deploy workflow copies the source index.html into outDir first, so
    // prefer that copy; for a local `npm run build:min` fall back to the repo
    // file and write the result into outDir like every other asset.
    const outPath = path.join(outDir, 'index.html');
    const sourcePath = fs.existsSync(outPath) ? outPath : path.join(root, 'index.html');
    const input = fs.readFileSync(sourcePath, 'utf8');
    const output = await htmlMinifier.minify(input, {
        collapseWhitespace: true,
        removeComments: true,
        collapseBooleanAttributes: true,
        minifyCSS: true,
        minifyJS: false,
        removeTagWhitespace: false
    });

    // Cheap sanity gate: the minified document must keep every element id and
    // the same number of script/link tags, or we refuse to ship it. Ids are
    // collected from the comment-free source: commented-out markup (like the
    // old widget size selector) is removed on purpose.
    const liveInput = input.replace(/<!--[\s\S]*?-->/g, '');
    const ids = [...liveInput.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    for (const id of ids) {
        if (!output.includes(`id=${id}`) && !output.includes(`id="${id}"`)) {
            console.error(`index.html minification lost element id="${id}"`);
            process.exit(1);
        }
    }
    for (const tag of ['<script', '<link', '<textarea']) {
        const countIn = (liveInput.match(new RegExp(tag, 'g')) || []).length;
        const countOut = (output.match(new RegExp(tag, 'g')) || []).length;
        if (countIn !== countOut) {
            console.error(`index.html minification changed the ${tag} count`);
            process.exit(1);
        }
    }

    fs.writeFileSync(outPath, output);
    const saved = Math.round((1 - Buffer.byteLength(output) / Buffer.byteLength(input)) * 100);
    console.log(
        `index.html: ${Buffer.byteLength(input)} -> ${Buffer.byteLength(output)} bytes (-${saved}%)`
    );
    return [Buffer.byteLength(input), Buffer.byteLength(output)];
};

const main = async () => {
    const outDir = path.resolve(process.argv[2] || path.join(root, 'dist'));
    fs.mkdirSync(outDir, { recursive: true });

    let esbuild;
    try {
        esbuild = require('esbuild');
    } catch (error) {
        console.error(
            'esbuild is required: run `npm install` (it is a devDependency) before building.'
        );
        process.exit(1);
    }

    let before = 0;
    let after = 0;

    for (const asset of ASSETS) {
        const source = path.join(root, asset);
        if (!fs.existsSync(source)) {
            console.error(`missing asset: ${asset}`);
            process.exit(1);
        }
        const input = fs.readFileSync(source);
        const result = await esbuild.transform(input.toString('utf8'), {
            loader: asset.endsWith('.css') ? 'css' : 'js',
            minify: true,
            legalComments: 'none',
            target: ['chrome100', 'firefox100', 'safari15']
        });
        fs.writeFileSync(path.join(outDir, asset), result.code);
        const outputBytes = Buffer.byteLength(result.code, 'utf8');
        before += input.byteLength;
        after += outputBytes;
        const saved = Math.round((1 - outputBytes / input.byteLength) * 100);
        console.log(`${asset}: ${input.byteLength} -> ${outputBytes} bytes (-${saved}%)`);
    }

    const [htmlBefore, htmlAfter] = await minifyHtml(outDir);
    before += htmlBefore;
    after += htmlAfter;

    console.log(
        `\nminified ${ASSETS.length} assets + index.html into ${outDir}: ${before} -> ${after} bytes ` +
            `(-${Math.round((1 - after / before) * 100)}%)`
    );
};

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
