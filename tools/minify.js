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

    console.log(
        `\nminified ${ASSETS.length} assets into ${outDir}: ${before} -> ${after} bytes ` +
            `(-${Math.round((1 - after / before) * 100)}%)`
    );
};

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
