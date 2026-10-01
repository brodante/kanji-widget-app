#!/usr/bin/env node
/**
 * Builds the self-hosted Font Awesome subset the app actually uses.
 *
 * The site used to load the full Font Awesome 6.0.0 bundle from cdnjs:
 * 16 KiB of CSS plus 125 KiB of solid glyphs and 103 KiB of brand glyphs,
 * where the brand font was downloaded for a single GitHub icon. This script
 * scans the shipped files for the fa-* classes the app really uses, keeps
 * only those rules from the official CSS, and subsets the two woff2 files
 * down to exactly those glyphs. Same font, same version, same rendering,
 * roughly 95% fewer bytes, and no third-party origin on the load path.
 *
 * Usage:
 *   npm i --no-save @fortawesome/fontawesome-free@6.0.0 subset-font
 *   node tools/build-fa-subset.js node_modules/@fortawesome/fontawesome-free
 *
 * Output (committed to the repo, no build needed at deploy time):
 *   assets/fonts/fa/css/fontawesome-subset.css
 *   assets/fonts/fa/webfonts/fa-solid-900-subset.woff2
 *   assets/fonts/fa/webfonts/fa-brands-400-subset.woff2
 *   assets/fonts/fa/LICENSE.txt
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const faRoot = path.resolve(
    process.argv[2] || path.join(root, 'node_modules/@fortawesome/fontawesome-free')
);

// Files scanned for fa-* class usage. Tests and tooling do not ship, so they
// are not scanned: an icon that only exists in a test must not widen the font.
const SCAN_FILES = ['index.html'].concat(
    fs
        .readdirSync(root)
        .filter((f) => f.endsWith('.js') && !['server.js', 'firebase-config.js'].includes(f))
);

// The GitHub icon is the only brands glyph in the whole app.
const BRAND_ICONS = ['fa-github'];

// Core selectors that must survive the trim no matter which icons are used:
// the base class, the style family classes and the spin animation.
const KEEP_SELECTORS = new Set([
    '.fa',
    '.fa-classic',
    '.fa-spin',
    '.fas',
    '.fa-solid',
    '.fab',
    '.fa-brands'
]);
const KEEP_AT_RULES = new Set(['fa-spin']); // @keyframes names

const collectUsedClasses = () => {
    const used = new Set();
    for (const file of SCAN_FILES) {
        // Strip ?v= cache-buster values first: they contain fa-looking tokens
        // (like ?v=fa-subset-...) that are not icon classes.
        const text = fs.readFileSync(path.join(root, file), 'utf8').replace(/\?v=[^"')\s]*/g, '');
        for (const match of text.matchAll(/(?<![-\w])fa-[a-z0-9]+(?:-[a-z0-9]+)*\b/g)) {
            used.add(match[0]);
        }
    }
    // fa-spin is an animation modifier, not a glyph; keep it for the CSS but
    // it has no content rule, which the coverage check below tolerates.
    return used;
};

// Splits a plain (non-minified) CSS file into top-level rule texts. Good
// enough for Font Awesome's generated CSS: comments, simple @ rules and
// selector lists, no nesting beyond one @ block level.
const parseRules = (css) => {
    const rules = [];
    let depth = 0;
    let start = -1;
    const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
    for (let i = 0; i < withoutComments.length; i++) {
        const ch = withoutComments[i];
        if (ch === '{') {
            if (depth === 0) {
                start = i;
            }
            depth++;
        } else if (ch === '}') {
            depth--;
            if (depth === 0 && start >= 0) {
                // Walk back to the end of the previous rule for the selector text.
                const prevEnd = rules.length ? rules[rules.length - 1].end : 0;
                const prelude = withoutComments.slice(prevEnd, start).trim();
                rules.push({
                    prelude,
                    text: withoutComments.slice(prevEnd, i + 1).trim(),
                    end: i + 1
                });
            }
        }
    }
    return rules;
};

const selectorsOf = (prelude) =>
    prelude
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

const codepointsOf = (ruleText) => {
    const points = [];
    for (const match of ruleText.matchAll(/content:\s*["']\\([0-9a-fA-F]{4,6})["']/g)) {
        points.push(parseInt(match[1], 16));
    }
    return points;
};

const main = async () => {
    let subsetFont;
    try {
        subsetFont = require('subset-font');
    } catch (error) {
        console.error('subset-font is required: npm i --no-save subset-font');
        process.exit(1);
    }

    if (!fs.existsSync(faRoot)) {
        console.error(
            `Font Awesome source not found at ${faRoot}\n` +
                'Run: npm i --no-save @fortawesome/fontawesome-free@6.0.0'
        );
        process.exit(1);
    }

    const used = collectUsedClasses();
    console.log(`scan found ${used.size} distinct fa-* tokens in shipped files`);

    const baseCss = fs.readFileSync(path.join(faRoot, 'css/fontawesome.css'), 'utf8');
    // In Font Awesome 6 the brand icon content rules (.fa-github:before and
    // friends) live in brands.css, not in fontawesome.css, and the .fas/.fab
    // family bindings live in solid.css/brands.css. All three are needed.
    const brandsCss = fs.readFileSync(path.join(faRoot, 'css/brands.css'), 'utf8');
    const solidCss = fs.readFileSync(path.join(faRoot, 'css/solid.css'), 'utf8');

    const kept = [];
    const solidPoints = new Set();
    const brandPoints = new Set();
    const classesWithGlyph = new Set();

    // Rules from solid.css/brands.css minus their @font-face blocks: this
    // script emits its own @font-face with the subset files instead.
    const keepFromStyleFile = (css, isBrandFile) => {
        for (const rule of parseRules(css)) {
            if (rule.prelude.startsWith('@font-face')) {
                continue;
            }
            const selectors = selectorsOf(rule.prelude);
            if (
                selectors.some(
                    (sel) => KEEP_SELECTORS.has(sel) || sel === ':root' || sel === ':host'
                )
            ) {
                kept.push(rule.text);
                continue;
            }
            const iconSelectors = selectors.filter((sel) => /^\.fa-[a-z0-9-]+::?before$/.test(sel));
            const hits = iconSelectors.filter((sel) =>
                used.has(sel.slice(1).replace(/::?before$/, ''))
            );
            if (hits.length > 0) {
                kept.push(rule.text);
                for (const sel of iconSelectors) {
                    classesWithGlyph.add(sel.slice(1).replace(/::?before$/, ''));
                }
                for (const point of codepointsOf(rule.text)) {
                    (isBrandFile ? brandPoints : solidPoints).add(point);
                }
            }
        }
    };

    for (const rule of parseRules(baseCss)) {
        const selectors = selectorsOf(rule.prelude);
        const isAt = rule.prelude.startsWith('@');
        let keep = false;

        if (isAt) {
            const nameMatch = rule.prelude.match(/@keyframes\s+([-\w]+)/);
            if (nameMatch && KEEP_AT_RULES.has(nameMatch[1])) {
                keep = true;
            }
        } else if (selectors.some((sel) => KEEP_SELECTORS.has(sel))) {
            keep = true;
        } else {
            // Icon rules look like `.fa-cog:before` or `.fa-cog::before`, and
            // aliases group several selectors into one rule.
            const iconSelectors = selectors.filter((sel) => /^\.fa-[a-z0-9-]+::?before$/.test(sel));
            const hits = iconSelectors.filter((sel) => {
                const cls = sel.slice(1).replace(/::?before$/, '');
                return used.has(cls);
            });
            if (hits.length > 0) {
                keep = true;
                for (const sel of iconSelectors) {
                    classesWithGlyph.add(sel.slice(1).replace(/::?before$/, ''));
                }
                for (const point of codepointsOf(rule.text)) {
                    // Brands icons live in the brands font; everything else is solid.
                    const cls = hits[0].slice(1).replace(/::?before$/, '');
                    if (BRAND_ICONS.includes(cls)) {
                        brandPoints.add(point);
                    } else {
                        solidPoints.add(point);
                    }
                }
            }
        }
        if (keep) {
            kept.push(rule.text);
        }
    }

    keepFromStyleFile(solidCss, false);
    keepFromStyleFile(brandsCss, true);

    // Coverage check: every scanned class must either have a glyph rule in
    // Font Awesome 6.0.0 or be a known non-glyph token. Anything else means
    // someone added an icon this subset does not contain yet.
    const nonGlyph = new Set(['fa-spin', 'fa-pulse', 'fa-fw', 'fa-border']);
    const missing = [...used].filter(
        (cls) => !classesWithGlyph.has(cls) && !KEEP_SELECTORS.has(cls) && !nonGlyph.has(cls)
    );
    // Classes Font Awesome 6.0.0 itself does not define render nothing today
    // and keep rendering nothing after the subset, so they are warnings only.
    const isDefined = (cls) =>
        baseCss.includes(`.${cls}:before`) || brandsCss.includes(`.${cls}:before`);
    const definesNothing = missing.filter((cls) => !isDefined(cls));
    const trueMissing = missing.filter((cls) => isDefined(cls));
    if (trueMissing.length > 0) {
        console.error(`ERROR: used icons missing from the kept rules: ${trueMissing.join(', ')}`);
        process.exit(1);
    }
    if (definesNothing.length > 0) {
        console.warn(
            `note: these classes have no glyph in Font Awesome 6.0.0 and render empty today, ` +
                `unchanged by the subset: ${definesNothing.join(', ')}`
        );
    }

    const solidFont = await subsetFont(
        fs.readFileSync(path.join(faRoot, 'webfonts/fa-solid-900.woff2')),
        String.fromCodePoint(...solidPoints),
        { targetFormat: 'woff2' }
    );
    const brandFont = await subsetFont(
        fs.readFileSync(path.join(faRoot, 'webfonts/fa-brands-400.woff2')),
        String.fromCodePoint(...brandPoints),
        { targetFormat: 'woff2' }
    );

    const outDir = path.join(root, 'assets/fonts/fa');
    fs.mkdirSync(path.join(outDir, 'css'), { recursive: true });
    fs.mkdirSync(path.join(outDir, 'webfonts'), { recursive: true });

    const header = `/* Font Awesome Free 6.0.0 subset for KanjiWidgets.
 * Built by tools/build-fa-subset.js from @fortawesome/fontawesome-free@6.0.0.
 * Contains only the ${classesWithGlyph.size} icons and ${solidPoints.size} solid / ${brandPoints.size} brand
 * glyphs this app uses. License: see assets/fonts/fa/LICENSE.txt (icons CC BY 4.0,
 * fonts SIL OFL 1.1, CSS MIT). Do not edit by hand; rerun the builder. */\n`;

    const fontFaces = `@font-face {
  font-family: 'Font Awesome 6 Free';
  font-style: normal;
  font-weight: 900;
  font-display: block;
  src: url('../webfonts/fa-solid-900-subset.woff2') format('woff2');
}
@font-face {
  font-family: 'Font Awesome 6 Brands';
  font-style: normal;
  font-weight: 400;
  font-display: block;
  src: url('../webfonts/fa-brands-400-subset.woff2') format('woff2');
}
`;

    const cssOut = `${header}${fontFaces}${kept.join('\n')}\n`;
    fs.writeFileSync(path.join(outDir, 'css/fontawesome-subset.css'), cssOut);
    fs.writeFileSync(path.join(outDir, 'webfonts/fa-solid-900-subset.woff2'), solidFont);
    fs.writeFileSync(path.join(outDir, 'webfonts/fa-brands-400-subset.woff2'), brandFont);
    fs.copyFileSync(path.join(faRoot, 'LICENSE.txt'), path.join(outDir, 'LICENSE.txt'));

    console.log(
        `solid subset: ${solidFont.length} bytes (${solidPoints.size} glyphs), ` +
            `brands subset: ${brandFont.length} bytes (${brandPoints.size} glyphs)`
    );
    console.log(`css: ${cssOut.length} bytes, ${kept.length} rules kept`);
    console.log(`written to ${path.relative(root, outDir)}/`);
};

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
