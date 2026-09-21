/**
 * Tests for the drawing pad toolbar bug report:
 * "trace and grid buttons don't work at all anymore".
 *
 * Loads the real drawing-pad.js and the REAL widget markup extracted from
 * script.js, then simulates user taps. Guards against:
 *  - double wiring (inline onclick + addEventListener => toggles cancel out)
 *  - canvas pointer listeners not re-binding after a widget re-render
 *  - mode flips (Animate <-> Practice) wiping strokes / re-fetching the SVG
 *
 * Run: node test/test-drawing-pad.js
 */
const fs = require('fs');
const path = require('path');

let JSDOM;
try {
    JSDOM = require('jsdom').JSDOM;
} catch (e) {
    console.log('SKIPPED: jsdom is not installed. Run `npm install` first to execute this test.');
    process.exit(0);
}

const root = path.join(__dirname, '..');
const drawingPadSrc = fs.readFileSync(path.join(root, 'drawing-pad.js'), 'utf8');
const scriptSrc = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

// Pull the real stroke-order section markup out of renderWidget()'s template
// literal, so the tests exercise exactly what the app renders.
const sectionMatch = scriptSrc.match(
    /<div class="stroke-order-section">[\s\S]*?(?=<div class="widget-actions">)/
);
if (!sectionMatch) {
    console.error('FATAL: could not extract stroke-order-section from script.js');
    process.exit(1);
}
const SECTION_HTML = sectionMatch[0];

function makeDom() {
    // 'dangerously' so any inline onclick="" attributes in the real markup
    // would compile and fire, exactly like a real browser.
    const dom = new JSDOM(
        `<!DOCTYPE html><html><body>
<div id="kanjiWidget">${SECTION_HTML}</div>
</body></html>`,
        { runScripts: 'dangerously', pretendToBeVisual: true }
    );
    const { window } = dom;

    // Minimal StorageManager shim mirroring storage-manager.js.
    window.StorageManager = {
        keys: { SETTINGS: 'kw_settings' },
        store: {},
        getItem(k, def) {
            return k in this.store ? this.store[k] : def;
        },
        setItem(k, v) {
            this.store[k] = v;
        }
    };

    // jsdom has no canvas implementation; stub a 2D context good enough for
    // logic tests (the pad guards every ctx call).
    const noop = () => {};
    const fakeCtx = new Proxy({ canvas: null }, { get: (t, p) => (p in t ? t[p] : noop) });
    window.HTMLCanvasElement.prototype.getContext = function () {
        fakeCtx.canvas = this;
        return fakeCtx;
    };

    window.eval(drawingPadSrc);
    return dom;
}

let pass = 0;
let fail = 0;
function check(name, cond, detail) {
    if (cond) {
        pass++;
        console.log(`  PASS  ${name}`);
    } else {
        fail++;
        console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
    }
}

// Mirrors showStrokeOrderMode('practice'): ONE pad instance persisted across
// re-renders (the app keeps it on this.drawingPadInstance), re-init()ed
// against the freshly resolved stroke-order section scope.
function enterPracticeMode(window) {
    if (!window.app) {
        window.app = {};
    }
    if (!window.app.drawingPadInstance) {
        window.app.drawingPadInstance = new window.DrawingPad();
    }
    const pad = window.app.drawingPadInstance;
    const scope =
        window.document
            .getElementById('drawingPadInlineControls')
            ?.closest('.stroke-order-section') || window.document;
    pad.init(scope);
    return pad;
}

async function main() {
    console.log('\n== Guard: no double wiring in the real markup ==');
    {
        check(
            'script.js toolbar markup has no inline onclick for pad controls',
            !/onclick="app\.(toggleDrawingPad|undoDrawingPad|clearDrawingPad)/.test(scriptSrc),
            'inline onclick would fire alongside DrawingPad listeners (double toggle)'
        );
        check(
            'script.js slider markup has no inline oninput for pad controls',
            !/oninput="app\.setDrawingPadStrokeWidth/.test(scriptSrc)
        );
        check(
            'index.html has no leftover pad modal / duplicate pad ids',
            !/drawingPadModal|closeDrawingPad|id="drawingPadCanvas"/.test(indexHtml),
            'index.html still contains removed-modal ids'
        );
        check(
            'index.html has no inline pad onclick handlers',
            !/onclick="app\.(toggleDrawingPad|undoDrawingPad|clearDrawingPad|openDrawingPad|closeDrawingPad)/.test(
                indexHtml
            )
        );
    }

    console.log('\n== Scenario 1: user taps Grid / Trace once ==');
    {
        const dom = makeDom();
        const { window } = dom;
        const pad = enterPracticeMode(window);

        const gridBefore = pad.gridVisible;
        window.document.getElementById('drawingPadInlineGridBtn').click();
        check(
            'one tap on Grid toggles grid ON',
            pad.gridVisible === !gridBefore,
            `gridVisible stayed ${pad.gridVisible} (double-fired handler cancelled out)`
        );
        check(
            'grid button shows active state',
            window.document
                .getElementById('drawingPadInlineGridBtn')
                .classList.contains('active') === pad.gridVisible
        );

        const refBefore = pad.referenceVisible;
        window.document.getElementById('drawingPadInlineRefBtn').click();
        check(
            'one tap on Trace toggles reference OFF',
            pad.referenceVisible === !refBefore,
            `referenceVisible stayed ${pad.referenceVisible} (double-fired handler cancelled out)`
        );

        // Tap again — toggles must keep working (state + button class).
        window.document.getElementById('drawingPadInlineGridBtn').click();
        check('second tap on Grid toggles back OFF', pad.gridVisible === gridBefore);
    }

    console.log('\n== Scenario 2: one tap on Undo removes exactly one stroke ==');
    {
        const dom = makeDom();
        const { window } = dom;
        const pad = enterPracticeMode(window);
        pad.strokes = [
            {
                points: [
                    { x: 1, y: 1 },
                    { x: 2, y: 2 }
                ]
            },
            {
                points: [
                    { x: 3, y: 3 },
                    { x: 4, y: 4 }
                ]
            }
        ];

        window.document.getElementById('drawingPadInlineUndoBtn').click();
        check(
            'undo removes exactly one stroke',
            pad.strokes.length === 1,
            `strokes.length = ${pad.strokes.length} (one tap removed ${2 - pad.strokes.length})`
        );

        window.document.getElementById('drawingPadInlineClearBtn').click();
        check('clear empties the canvas', pad.strokes.length === 0);
    }

    console.log('\n== Scenario 3: widget re-renders, user re-enters Practice ==');
    {
        const dom = makeDom();
        const { window } = dom;
        const doc = window.document;
        const pad = enterPracticeMode(window);
        const oldCanvas = doc.getElementById('kanjiWidget').querySelector('canvas');

        // Simulate renderWidget(): innerHTML is rebuilt wholesale on kanji change.
        doc.getElementById('kanjiWidget').innerHTML = SECTION_HTML;
        const newCanvas = doc.getElementById('kanjiWidget').querySelector('canvas');
        check('re-render produced a fresh canvas node', oldCanvas !== newCanvas);

        // User taps Practice again -> showStrokeOrderMode('practice') -> init()
        enterPracticeMode(window);
        check('pad now targets the new canvas', pad.canvas === newCanvas);

        newCanvas.dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
        check(
            'pointer listeners attached to the new canvas (drawing works after re-render)',
            pad.isDrawing === true,
            'pointerdown on the new canvas was ignored — canvas never re-bound'
        );
    }

    console.log('\n== Scenario 4: thickness slider ==');
    {
        const dom = makeDom();
        const { window } = dom;
        const pad = enterPracticeMode(window);

        const slider = window.document.getElementById('drawingPadInlineWidthSlider');
        slider.value = '7';
        slider.dispatchEvent(new window.Event('input', { bubbles: true }));
        check(
            'slider input updates stroke width',
            pad.strokeWidth === 7,
            `strokeWidth = ${pad.strokeWidth}`
        );
    }

    console.log('\n== Scenario 5: Animate <-> Practice flip keeps strokes, no refetch ==');
    {
        const dom = makeDom();
        const { window } = dom;
        let fetchCount = 0;
        window.app = {
            fetchStrokeOrderSvg: async () => {
                fetchCount++;
                return '<svg viewBox="0 0 109 109"><path d="M 10,10 L 50,50"/></svg>';
            }
        };
        const pad = enterPracticeMode(window);
        // jsdom cannot decode blob-URL images; bypass just the image decode.
        pad._svgToImage = async () => ({ ok: true });

        await pad.setKanji('語');
        check('reference parsed on first load', pad.referencePaths.length === 1);

        pad.strokes = [
            {
                points: [
                    { x: 1, y: 1 },
                    { x: 2, y: 2 }
                ],
                ink: true
            }
        ];
        await pad.setKanji('語'); // same kanji: Animate -> Practice flip
        check(
            'same-kanji re-entry keeps drawn strokes',
            pad.strokes.length === 1,
            'strokes were wiped on a mode flip'
        );
        check(
            'same-kanji re-entry does not re-fetch the SVG',
            fetchCount === 1,
            `fetchStrokeOrderSvg called ${fetchCount}x`
        );

        await pad.setKanji('水'); // different kanji
        check('kanji change wipes strokes', pad.strokes.length === 0);
        check('kanji change re-fetches the SVG', fetchCount === 2);
    }

    console.log('\n== Scenario 6: slow fetch for old kanji must not clobber the new one ==');
    {
        const dom = makeDom();
        const { window } = dom;
        const delays = { 語: 80, 水: 5 }; // 語 resolves LAST although requested first
        window.app = {
            fetchStrokeOrderSvg: async (ch) => {
                await new Promise((r) => setTimeout(r, delays[ch]));
                return `<svg viewBox="0 0 109 109"><path d="M ${delays[ch]},10 L 50,50"/></svg>`;
            }
        };
        const pad = enterPracticeMode(window);
        pad._svgToImage = async () => ({ ok: true });

        const p1 = pad.setKanji('語'); // slow
        const p2 = pad.setKanji('水'); // fast, requested second
        await Promise.all([p1, p2]);
        // 語's path was authored as "M 80,10...", 水's as "M 5,10...". If the
        // late 語 response is not discarded, it clobbers 水's reference.
        check(
            'pad keeps the reference of the most recent kanji',
            pad.currentKanji === '水' && /^M 5,/.test(pad.referencePaths[0]),
            `currentKanji = ${pad.currentKanji}, referencePaths[0] = ${pad.referencePaths[0]}`
        );
    }

    console.log(`\n${pass} passed, ${fail} failed\n`);
    process.exit(fail ? 1 : 0);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
