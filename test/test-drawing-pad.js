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
 * Also covers the newer features: redo, snap-to-stroke, and the side-by-side
 * guide panel.
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

// jsdom does not implement SVGPathElement.getTotalLength/getPointAtLength.
// Stub the sampler with a deterministic linear interpolation along the
// "M x1 y1 L x2 y2" paths used in the mock SVGs below (test-side only).
function stubPathSampling(pad) {
    pad._sampleSvgPath = (d, n) => {
        const nums = (d.match(/-?[\d.]+/g) || []).map(Number);
        const x1 = nums[0];
        const y1 = nums[1];
        const x2 = nums[nums.length - 2];
        const y2 = nums[nums.length - 1];
        const pts = [];
        for (let i = 0; i < n; i++) {
            const t = n === 1 ? 0 : i / (n - 1);
            pts.push({ x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t });
        }
        return pts;
    };
}

// Commit a stroke through the real pointer-up code path.
function commitStroke(pad, window, points) {
    pad.isDrawing = true;
    pad.currentStroke = points.map((p) => ({ ...p }));
    pad._onPointerUp(new window.Event('pointerup'));
}

async function main() {
    console.log('\n== Guard: no double wiring in the real markup ==');
    {
        check(
            'script.js toolbar markup has no inline onclick for pad controls',
            !/onclick="app\.(toggleDrawingPad|undoDrawingPad|redoDrawingPad|clearDrawingPad|setDrawingPad)/.test(
                scriptSrc
            ),
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
                ],
                ink: true,
                color: null,
                correct: true,
                score: 0.9,
                snapRefIndex: null
            },
            {
                points: [
                    { x: 3, y: 3 },
                    { x: 4, y: 4 }
                ],
                ink: true,
                color: null,
                correct: true,
                score: 0.9,
                snapRefIndex: null
            }
        ];
        pad._syncButtons(); // real commits re-sync button states; mirror that

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

    console.log('\n== Scenario 7: Redo restores undone strokes ==');
    {
        const dom = makeDom();
        const { window } = dom;
        const doc = window.document;
        const pad = enterPracticeMode(window);
        check(
            'undo disabled with empty canvas',
            doc.getElementById('drawingPadInlineUndoBtn').disabled === true
        );
        check(
            'redo disabled with empty history',
            doc.getElementById('drawingPadInlineRedoBtn').disabled === true
        );

        const mk = (n) => ({
            points: [
                { x: n, y: n },
                { x: n + 1, y: n + 1 }
            ],
            ink: true,
            color: null,
            correct: true,
            score: 0.9,
            snapRefIndex: null
        });
        pad.strokes = [mk(1), mk(2)];
        pad._syncButtons(); // real commits re-sync button states; mirror that

        doc.getElementById('drawingPadInlineUndoBtn').click();
        check(
            'undo -> redo enabled, one stroke left',
            pad.strokes.length === 1 &&
                pad.redoStack.length === 1 &&
                !doc.getElementById('drawingPadInlineRedoBtn').disabled
        );

        doc.getElementById('drawingPadInlineRedoBtn').click();
        check(
            'redo restores the stroke',
            pad.strokes.length === 2 &&
                pad.redoStack.length === 0 &&
                doc.getElementById('drawingPadInlineRedoBtn').disabled
        );

        doc.getElementById('drawingPadInlineUndoBtn').click();
        doc.getElementById('drawingPadInlineUndoBtn').click();
        check(
            'double undo empties canvas, history holds 2',
            pad.strokes.length === 0 &&
                pad.redoStack.length === 2 &&
                doc.getElementById('drawingPadInlineUndoBtn').disabled
        );

        // Drawing a new stroke must invalidate the redo history.
        commitStroke(pad, window, [
            { x: 1, y: 1 },
            { x: 2, y: 2 }
        ]);
        check(
            'new stroke clears the redo history',
            pad.strokes.length === 1 &&
                pad.redoStack.length === 0 &&
                doc.getElementById('drawingPadInlineRedoBtn').disabled
        );
    }

    console.log('\n== Scenario 8: Snap-to-stroke rendering ==');
    {
        const dom = makeDom();
        const { window } = dom;
        const doc = window.document;
        window.app = {
            fetchStrokeOrderSvg: async () =>
                '<svg viewBox="0 0 109 109"><path d="M 10 10 L 50 50"/></svg>'
        };
        const pad = enterPracticeMode(window);
        pad._svgToImage = async () => ({ ok: true });
        stubPathSampling(pad);
        await pad.setKanji('語');

        // Draw a diagonal resembling the reference stroke.
        commitStroke(pad, window, [
            { x: 30, y: 30 },
            { x: 150, y: 150 },
            { x: 270, y: 270 }
        ]);
        check('stroke committed', pad.strokes.length === 1);
        const stroke = pad.strokes[0];
        check(
            'matched stroke records a snap target',
            stroke.snapRefIndex === 0 && stroke.score > 0.2,
            `score=${stroke.score}, snapRefIndex=${stroke.snapRefIndex}`
        );

        check('snap off -> raw points rendered', pad._getRenderPoints(stroke) === stroke.points);

        doc.getElementById('drawingPadInlineSnapBtn').click();
        check(
            'snap toggle activates',
            pad.snapEnabled === true &&
                doc.getElementById('drawingPadInlineSnapBtn').classList.contains('active')
        );

        const snapped = pad._getRenderPoints(stroke);
        check(
            'snap on -> points pulled towards the reference shape',
            snapped !== stroke.points &&
                snapped.length === window.DrawingPad.RESAMPLE_POINTS &&
                stroke.points.length !== snapped.length,
            'render points unchanged after enabling snap'
        );
        // The reference diagonal maps to canvas coords (10..50)*300/109; the
        // snapped midpoint must sit strictly between the raw and ideal midpoints.
        const rawMid = stroke.points[1];
        const snappedMid = snapped[1];
        const idealMid = { x: 30 * (300 / 109), y: 30 * (300 / 109) };
        const distRaw = Math.hypot(rawMid.x - idealMid.x, rawMid.y - idealMid.y);
        const distSnapped = Math.hypot(snappedMid.x - idealMid.x, snappedMid.y - idealMid.y);
        check(
            'snapped stroke is closer to the ideal shape than the raw one',
            distSnapped < distRaw,
            `distSnapped=${distSnapped.toFixed(2)} >= distRaw=${distRaw.toFixed(2)}`
        );

        doc.getElementById('drawingPadInlineSnapBtn').click();
        check(
            'snap toggle deactivates and renders raw again',
            pad.snapEnabled === false && pad._getRenderPoints(stroke) === stroke.points
        );
    }

    console.log('\n== Scenario 9: Guide panel (side-by-side reference) ==');
    {
        const dom = makeDom();
        const { window } = dom;
        const doc = window.document;
        window.app = {
            fetchStrokeOrderSvg: async () =>
                '<svg viewBox="0 0 109 109"><path d="M 10 10 L 50 50"/><path d="M 20 10 L 20 50"/></svg>'
        };
        const pad = enterPracticeMode(window);
        pad._svgToImage = async () => ({ ok: true });
        stubPathSampling(pad);
        await pad.setKanji('水');

        const back = doc.getElementById('strokeOrderBack');
        const guide = doc.getElementById('drawingPadInlineGuide');
        check(
            'guide off by default (pad centred)',
            !back.classList.contains('guide-on') && guide.innerHTML === ''
        );

        doc.getElementById('drawingPadInlineGuideBtn').click();
        check(
            'guide on shifts layout (guide-on class)',
            back.classList.contains('guide-on') && pad.guideVisible === true
        );
        check('guide shows the reference SVG', !!guide.querySelector('svg'));
        const paths = Array.from(guide.querySelectorAll('path'));
        check(
            'first stroke marked as next before drawing',
            paths[0].classList.contains('guide-stroke-next') &&
                !paths[0].classList.contains('guide-stroke-done')
        );

        commitStroke(pad, window, [
            { x: 30, y: 30 },
            { x: 150, y: 150 },
            { x: 270, y: 270 }
        ]);
        check(
            'after stroke 1: done on first, next on second',
            paths[0].classList.contains('guide-stroke-done') &&
                paths[1].classList.contains('guide-stroke-next')
        );

        doc.getElementById('drawingPadInlineUndoBtn').click();
        check(
            'undo moves the guide highlight back',
            !paths[0].classList.contains('guide-stroke-done') &&
                paths[0].classList.contains('guide-stroke-next') &&
                !paths[1].classList.contains('guide-stroke-next')
        );

        doc.getElementById('drawingPadInlineGuideBtn').click();
        check(
            'guide off restores centred pad',
            !back.classList.contains('guide-on') && pad.guideVisible === false
        );

        // Guide without KanjiVG data falls back to the plain character.
        window.app.fetchStrokeOrderSvg = async () => null;
        await pad.setKanji('字');
        doc.getElementById('drawingPadInlineGuideBtn').click();
        check('guide falls back to the raw character', guide.textContent.includes('字'));
    }

    console.log('\n== Scenario 10: snap & guide settings persist ==');
    {
        const dom = makeDom();
        const { window } = dom;
        const doc = window.document;
        enterPracticeMode(window);

        doc.getElementById('drawingPadInlineSnapBtn').click();
        doc.getElementById('drawingPadInlineGuideBtn').click();
        const stored = window.StorageManager.getItem('kw_settings', {});
        check(
            'toggles saved to settings',
            stored.drawingPadSnap === true && stored.drawingPadGuide === true
        );

        const fresh = new window.DrawingPad();
        check(
            'new pad instance restores toggles',
            fresh.snapEnabled === true && fresh.guideVisible === true
        );
    }

    console.log(`\n${pass} passed, ${fail} failed\n`);
    process.exit(fail ? 1 : 0);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
