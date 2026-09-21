/**
 * Drawing Pad (Kanji Practice Canvas) for KanjiWidgets
 *
 * Provides a <canvas>-based drawing surface for practising kanji strokes.
 * Features: grid overlay, reference-stroke tracing, stroke-order validation,
 * and snap-to-stroke scoring — all powered by KanjiVG path data that the
 * app already fetches via KanjiLearningApp.fetchStrokeOrderSvg().
 *
 * Depends on: StorageManager (storage-manager.js)
 */
class DrawingPad {
    // ==========================================
    // CONSTANTS
    // ==========================================
    static CANVAS_SIZE = 300;
    static RESAMPLE_POINTS = 64;
    static SNAP_THRESHOLD = 0.25; // normalised; lower = stricter
    static STROKE_WIDTH = 4;
    static REF_OPACITY = 0.18;
    static GRID_COLOR = 'rgba(150,150,150,0.25)';
    // Fallback accent used when --primary-color can't be resolved.
    static FALLBACK_INK = '#6200ee';
    // Semantic colours for stroke feedback (order / accuracy).
    static COLOR_OUT_OF_ORDER = '#e67e22';
    static COLOR_MEDIOCRE = '#f39c12';
    static COLOR_POOR = '#e74c3c';

    // ==========================================
    // CONSTRUCTOR
    // ==========================================
    constructor() {
        this.currentKanji = null;
        this.strokes = []; // completed strokes: [{points, color, correct}]
        this.currentStroke = []; // in-progress points
        this.isDrawing = false;
        this.referencePaths = []; // parsed KanjiVG path 'd' strings
        this.referenceImg = null; // HTMLImageElement of the reference SVG
        this.gridVisible = false;
        this.referenceVisible = true;
        this.feedbackMessage = '';
        this.feedbackTimeout = null;
        this.svgViewBox = { x: 0, y: 0, w: 109, h: 109 }; // KanjiVG default

        this._loadSettings();

        // DOM references (set in init)
        this.modal = null;
        this.canvas = null;
        this.ctx = null;
        this.gridBtn = null;
        this.refBtn = null;
        this.clearBtn = null;
        this.undoBtn = null;
        this.feedbackEl = null;
        this.titleEl = null;
        this.scoreEl = null;
    }

    // ==========================================
    // SETTINGS PERSISTENCE
    // ==========================================
    _loadSettings() {
        const settings = StorageManager.getItem(StorageManager.keys.SETTINGS, {});
        this.gridVisible = settings.drawingPadGrid !== undefined ? settings.drawingPadGrid : false;
        this.referenceVisible =
            settings.drawingPadRef !== undefined ? settings.drawingPadRef : true;
        this.strokeWidth =
            settings.drawingPadStrokeWidth !== undefined ? settings.drawingPadStrokeWidth : 4;
    }

    _saveSettings() {
        const settings = StorageManager.getItem(StorageManager.keys.SETTINGS, {});
        settings.drawingPadGrid = this.gridVisible;
        settings.drawingPadRef = this.referenceVisible;
        settings.drawingPadStrokeWidth = this.strokeWidth;
        StorageManager.setItem(StorageManager.keys.SETTINGS, settings);
    }

    // ==========================================
    // INITIALISATION (called once after DOM ready)
    // ==========================================
    /**
     * Initialise the pad against a specific DOM scope.
     *
     * The inline practice controls (rendered inside the widget card) and the
     * standalone modal both contain a toolbar. Passing `root` lets us resolve
     * the correct set of controls and avoids the duplicate-ID trap where
     * getElementById() would always return the first match in the document.
     *
     * @param {Element|Document} [root] Element to query controls within.
     */
    init(root = document) {
        this.root = root || document;
        this._queryElements();

        if (!this.canvas || !this.ctx) {
            console.warn('DrawingPad: canvas element not found.');
            return;
        }

        if (!this.canvas.width || this.canvas.width === 0) {
            this.canvas.width = DrawingPad.CANVAS_SIZE;
        }
        if (!this.canvas.height || this.canvas.height === 0) {
            this.canvas.height = DrawingPad.CANVAS_SIZE;
        }

        // Bind listeners to whatever controls this scope resolved. The pad
        // tracks which nodes are already wired (_canvasBound / _boundControls),
        // so repeated init() calls (e.g. every Animate <-> Practice switch, or
        // re-rendered inline markup) bind only the new nodes and never stack
        // duplicate handlers on the ones already listening.
        this._bindEvents();
        this._syncButtons();
        this._repaint();
    }

    /**
     * Resolve every element the pad interacts with inside the current scope.
     * Both the inline and modal control sets are supported: inline controls
     * use an "Inline" infix while the modal keeps the original ids.
     */
    _queryElements() {
        this.modal = this._resolveInScope('drawingPadModal');
        this.canvas = this._resolveInScope('drawingPadCanvas');
        this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
        this.gridBtn = this._resolveControl('drawingPadGridBtn', 'drawingPadInlineGridBtn');
        this.refBtn = this._resolveControl('drawingPadRefBtn', 'drawingPadInlineRefBtn');
        this.clearBtn = this._resolveControl('drawingPadClearBtn', 'drawingPadInlineClearBtn');
        this.undoBtn = this._resolveControl('drawingPadUndoBtn', 'drawingPadInlineUndoBtn');
        this.widthSlider = this._resolveControl(
            'drawingPadWidthSlider',
            'drawingPadInlineWidthSlider'
        );
        this.widthValEl = this._resolveControl('drawingPadWidthVal', 'drawingPadInlineWidthVal');
        this.feedbackEl = this._resolveControl('drawingPadFeedback', 'drawingPadInlineFeedback');
        this.titleEl = this._resolveInScope('drawingPadTitle');
        this.scoreEl = this._resolveControl('drawingPadScore', 'drawingPadInlineScore');
    }

    /**
     * Resolve a control id inside the current scope, preferring the
     * scope-local match.
     *
     * The inline practice panel and the modal both render toolbars, and the
     * inline ids carry an "Inline" infix. Blindly trying the modal id first
     * (via document.getElementById) returned the hidden modal element even
     * when the visible inline control was in scope — which silently sent
     * feedback text and `.active` toggles to the wrong element.
     *
     * @param {string} id Element id to look up.
     * @returns {Element|null}
     */
    _resolveInScope(id) {
        const scope = this.root || document;
        if (scope && scope !== document && scope.querySelector) {
            const local = scope.querySelector(`#${id}`);
            if (local) {
                return local;
            }
        }
        return document.getElementById(id);
    }

    /**
     * Resolve one of two id variants (modal id vs inline id), always
     * preferring whichever variant actually exists inside the current scope.
     *
     * Both variants must be checked against the scope *before* falling back
     * to the document, otherwise the `||` chain short-circuits on the hidden
     * modal element and the visible inline control never gets resolved.
     *
     * @param {string} modalId Id used by the standalone modal markup.
     * @param {string} inlineId Id used by the inline practice markup.
     * @returns {Element|null}
     */
    _resolveControl(modalId, inlineId) {
        const scope = this.root || document;
        if (scope && scope !== document && scope.querySelector) {
            const local = scope.querySelector(`#${modalId}`) || scope.querySelector(`#${inlineId}`);
            if (local) {
                return local;
            }
        }
        return document.getElementById(modalId) || document.getElementById(inlineId);
    }

    // ==========================================
    // EVENT BINDING
    // ==========================================
    _bindEvents() {
        // Pointer events for unified mouse / touch / pen input.
        // Guard against re-binding the same canvas (e.g. across init calls).
        if (this.canvas && !this._canvasBound) {
            this.canvas.addEventListener('pointerdown', (e) => this._onPointerDown(e));
            this.canvas.addEventListener('pointermove', (e) => this._onPointerMove(e));
            this.canvas.addEventListener('pointerup', (e) => this._onPointerUp(e));
            this.canvas.addEventListener('pointerleave', (e) => this._onPointerUp(e));
            // Prevent default touch scroll / zoom while drawing
            this.canvas.addEventListener('touchstart', (e) => e.preventDefault(), {
                passive: false
            });
            this._canvasBound = true;
        }

        // Toolbar. Each control is bound at most once (tracked in _boundControls)
        // so repeated init() calls — which re-resolve controls against a new
        // scope — pick up newly rendered inline buttons without stacking
        // duplicate listeners on the ones that are already wired.
        this._boundControls = this._boundControls || new WeakSet();
        const bind = (el, handler) => {
            if (!el || this._boundControls.has(el)) {
                return;
            }
            el.addEventListener('click', handler);
            this._boundControls.add(el);
        };

        bind(this.clearBtn, () => this.clearStrokes());
        bind(this.undoBtn, () => this.undoStroke());
        bind(this.gridBtn, () => this.toggleGrid());
        bind(this.refBtn, () => this.toggleReference());

        const closeBtn = document.getElementById('closeDrawingPad');
        bind(closeBtn, () => this.close());

        if (this.modal && !this._modalBound) {
            this.modal.addEventListener('click', (e) => {
                if (e.target === this.modal) {
                    this.close();
                }
            });
            this._modalBound = true;
        }
    }

    // ==========================================
    // OPEN / CLOSE MODAL
    // ==========================================
    open(kanji) {
        if (!this.modal) {
            return;
        }
        this.modal.classList.add('show');

        if (kanji) {
            this.setKanji(kanji);
        } else {
            this._repaint();
        }
    }

    close() {
        if (!this.modal) {
            return;
        }
        this.modal.classList.remove('show');
    }

    // ==========================================
    // SET KANJI  (loads reference from KanjiVG)
    // ==========================================
    async setKanji(character) {
        this.currentKanji = character;
        this.strokes = [];
        this.currentStroke = [];
        this.feedbackMessage = '';
        this.referencePaths = [];
        this.referenceImg = null;

        if (this.titleEl) {
            this.titleEl.textContent = character;
        }
        if (this.scoreEl) {
            this.scoreEl.textContent = '';
        }
        if (this.feedbackEl) {
            this.feedbackEl.textContent = '';
            this.feedbackEl.className = 'drawing-pad-feedback';
        }

        // Fetch SVG via the existing app method
        let svgMarkup = null;
        if (window.app && typeof window.app.fetchStrokeOrderSvg === 'function') {
            svgMarkup = await window.app.fetchStrokeOrderSvg(character);
        }

        if (svgMarkup) {
            this._parseReferenceSvg(svgMarkup);
            this.referenceImg = await this._svgToImage(svgMarkup);
        }

        this._repaint();
    }

    // ==========================================
    // REFERENCE SVG HELPERS
    // ==========================================
    _parseReferenceSvg(markup) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(markup, 'image/svg+xml');
        const svg = doc.querySelector('svg');
        if (svg) {
            const vb = svg.getAttribute('viewBox');
            if (vb) {
                const parts = vb.split(/[\s,]+/).map(Number);
                if (parts.length === 4) {
                    this.svgViewBox = { x: parts[0], y: parts[1], w: parts[2], h: parts[3] };
                }
            }
        }
        const paths = doc.querySelectorAll('path');
        this.referencePaths = [];
        paths.forEach((p) => {
            const d = p.getAttribute('d');
            if (d) {
                this.referencePaths.push(d);
            }
        });
    }

    _svgToImage(markup) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const blob = new Blob([markup], { type: 'image/svg+xml;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            img.onload = () => {
                URL.revokeObjectURL(url);
                resolve(img);
            };
            img.onerror = (err) => {
                URL.revokeObjectURL(url);
                reject(err);
            };
            img.src = url;
        });
    }

    // ==========================================
    // POINTER HANDLERS
    // ==========================================
    _getPos(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) * (this.canvas.width / rect.width),
            y: (e.clientY - rect.top) * (this.canvas.height / rect.height)
        };
    }

    _onPointerDown(e) {
        if (e.button && e.button !== 0) {
            return;
        }
        e.preventDefault();
        this.isDrawing = true;
        this.currentStroke = [this._getPos(e)];
        this._repaint();
    }

    _onPointerMove(e) {
        if (!this.isDrawing) {
            return;
        }
        e.preventDefault();
        this.currentStroke.push(this._getPos(e));
        this._repaint();
    }

    _onPointerUp(e) {
        if (!this.isDrawing) {
            return;
        }
        e.preventDefault();
        this.isDrawing = false;

        if (this.currentStroke.length < 2) {
            this.currentStroke = [];
            return;
        }

        // Determine stroke index (what stroke number the user is on)
        const idx = this.strokes.length;
        const result = this._evaluateStroke(idx, this.currentStroke);

        this.strokes.push({
            points: this.currentStroke.slice(),
            // `ink` = paint with the live theme accent at render time.
            ink: result.ink,
            color: result.color,
            correct: result.orderCorrect,
            score: result.score,
            snappedPoints: result.snappedPoints
        });

        this.currentStroke = [];
        this._showFeedback(idx, result);
        this._updateScore();
        this._repaint();
    }

    // ==========================================
    // STROKE EVALUATION  (Phase 4 + Phase 5)
    // ==========================================
    _evaluateStroke(strokeIndex, userPoints) {
        const result = {
            orderCorrect: true,
            score: 1.0,
            // `ink: true` means "paint with the live theme accent" at render
            // time. Canvas 2D cannot resolve CSS variables, so we never store
            // raw `var(--token)` strings on a stroke.
            ink: true,
            color: null,
            snappedPoints: null
        };

        if (this.referencePaths.length === 0) {
            return result;
        }

        // --- Phase 4: Stroke order ---
        // The expected stroke is referencePaths[strokeIndex].
        // We also figure out *which* reference path best matches
        // the drawn stroke so we can score it regardless.
        const bestMatch = this._findBestMatchingPath(userPoints);
        if (bestMatch.index !== strokeIndex) {
            result.orderCorrect = false;
            result.ink = false;
            result.color = DrawingPad.COLOR_OUT_OF_ORDER;
        }

        // If the user has drawn more strokes than the reference has, skip scoring
        if (strokeIndex >= this.referencePaths.length) {
            result.score = 0;
            result.ink = false;
            result.color = DrawingPad.COLOR_POOR; // red = extra stroke
            return result;
        }

        // --- Phase 5: Snap-to-stroke scoring ---
        const refD = this.referencePaths[strokeIndex];
        const refPoints = this._sampleSvgPath(refD, DrawingPad.RESAMPLE_POINTS);
        const drawnNorm = this._normalisePoints(userPoints);
        const refNorm = this._normalisePoints(refPoints);
        const dist = this._averagePointDistance(drawnNorm, refNorm);
        result.score = Math.max(0, 1.0 - dist / DrawingPad.SNAP_THRESHOLD);

        if (result.score >= 0.7) {
            // Good + correctly ordered => theme accent ink (matches the
            // stroke-order preview). Out-of-order keeps the warning colour.
            if (result.orderCorrect) {
                result.ink = true;
                result.color = null;
            } else {
                result.ink = false;
                result.color = DrawingPad.COLOR_OUT_OF_ORDER;
            }
        } else if (result.score >= 0.35) {
            result.ink = false;
            result.color = DrawingPad.COLOR_MEDIOCRE; // mediocre
        } else {
            result.ink = false;
            result.color = DrawingPad.COLOR_POOR; // poor match
        }

        // Build snapped (interpolated) points for visual feedback
        if (result.score > 0.2) {
            const t = Math.min(result.score, 1.0);
            result.snappedPoints = this._interpolatePoints(userPoints, refPoints, t);
        }

        return result;
    }

    /**
     * Find which reference path index best matches the user's drawn stroke.
     */
    _findBestMatchingPath(userPoints) {
        let best = { index: 0, dist: Infinity };
        const drawnNorm = this._normalisePoints(userPoints);

        for (let i = 0; i < this.referencePaths.length; i++) {
            const refPts = this._sampleSvgPath(this.referencePaths[i], DrawingPad.RESAMPLE_POINTS);
            const refNorm = this._normalisePoints(refPts);
            const d = this._averagePointDistance(drawnNorm, refNorm);
            if (d < best.dist) {
                best = { index: i, dist: d };
            }
        }
        return best;
    }

    // ==========================================
    // PATH GEOMETRY UTILITIES
    // ==========================================

    /**
     * Resample a set of points to exactly N equally-spaced points.
     */
    _resampleToN(points, n) {
        if (points.length === 0) {
            return [];
        }
        if (points.length === 1) {
            const out = [];
            for (let k = 0; k < n; k++) {
                out.push({ x: points[0].x, y: points[0].y });
            }
            return out;
        }

        // Compute cumulative arc-length
        let totalLen = 0;
        const segs = [0];
        for (let i = 1; i < points.length; i++) {
            const dx = points[i].x - points[i - 1].x;
            const dy = points[i].y - points[i - 1].y;
            totalLen += Math.sqrt(dx * dx + dy * dy);
            segs.push(totalLen);
        }

        if (totalLen === 0) {
            const same = [];
            for (let s = 0; s < n; s++) {
                same.push({ x: points[0].x, y: points[0].y });
            }
            return same;
        }

        const result = [];
        let segIdx = 0;
        for (let j = 0; j < n; j++) {
            const target = (j / (n - 1)) * totalLen;
            while (segIdx < segs.length - 2 && segs[segIdx + 1] < target) {
                segIdx++;
            }
            const segStart = segs[segIdx];
            const segEnd = segs[segIdx + 1] || segs[segIdx];
            const segLen = segEnd - segStart;
            const t2 = segLen > 0 ? (target - segStart) / segLen : 0;
            const p0 = points[segIdx];
            const p1 = points[Math.min(segIdx + 1, points.length - 1)];
            result.push({
                x: p0.x + (p1.x - p0.x) * t2,
                y: p0.y + (p1.y - p0.y) * t2
            });
        }
        return result;
    }

    /**
     * Normalise points into a 0..1 bounding box, then resample.
     */
    _normalisePoints(points) {
        const resampled = this._resampleToN(points, DrawingPad.RESAMPLE_POINTS);
        if (resampled.length === 0) {
            return resampled;
        }
        let minX = Infinity,
            minY = Infinity,
            maxX = -Infinity,
            maxY = -Infinity;
        resampled.forEach((p) => {
            if (p.x < minX) {
                minX = p.x;
            }
            if (p.y < minY) {
                minY = p.y;
            }
            if (p.x > maxX) {
                maxX = p.x;
            }
            if (p.y > maxY) {
                maxY = p.y;
            }
        });
        const w = maxX - minX || 1;
        const h = maxY - minY || 1;
        const scale = Math.max(w, h);
        return resampled.map((p) => ({
            x: (p.x - minX) / scale,
            y: (p.y - minY) / scale
        }));
    }

    /**
     * Average Euclidean distance between two same-length point arrays.
     */
    _averagePointDistance(a, b) {
        if (a.length === 0 || b.length === 0) {
            return 1;
        }
        const len = Math.min(a.length, b.length);
        let sum = 0;
        for (let i = 0; i < len; i++) {
            const dx = a[i].x - b[i].x;
            const dy = a[i].y - b[i].y;
            sum += Math.sqrt(dx * dx + dy * dy);
        }
        return sum / len;
    }

    /**
     * Linearly interpolate two point arrays by factor t (0=user, 1=reference).
     * Used for the snap-to-stroke visual correction effect.
     */
    _interpolatePoints(userPts, refPts, t) {
        const userResampled = this._resampleToN(userPts, DrawingPad.RESAMPLE_POINTS);
        const refResampled = this._resampleToN(refPts, DrawingPad.RESAMPLE_POINTS);
        // Map ref coords from SVG viewBox space to canvas space
        const cw = this.canvas.width;
        const ch = this.canvas.height;
        const vb = this.svgViewBox;
        const mapped = refResampled.map((p) => ({
            x: ((p.x - vb.x) / vb.w) * cw,
            y: ((p.y - vb.y) / vb.h) * ch
        }));
        return userResampled.map((p, i) => ({
            x: p.x + (mapped[i].x - p.x) * t * 0.5,
            y: p.y + (mapped[i].y - p.y) * t * 0.5
        }));
    }

    /**
     * Sample points along an SVG path 'd' attribute.
     * Uses an off-screen SVG + path element with getTotalLength / getPointAtLength.
     */
    _sampleSvgPath(d, n) {
        const ns = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(ns, 'svg');
        svg.setAttribute(
            'viewBox',
            `${this.svgViewBox.x} ${this.svgViewBox.y} ${this.svgViewBox.w} ${this.svgViewBox.h}`
        );
        const path = document.createElementNS(ns, 'path');
        path.setAttribute('d', d);
        svg.appendChild(path);
        // Must be in the DOM for measurement in some browsers
        svg.style.position = 'absolute';
        svg.style.left = '-9999px';
        svg.style.width = '0';
        svg.style.height = '0';
        document.body.appendChild(svg);

        const total = path.getTotalLength();
        const pts = [];
        for (let i = 0; i < n; i++) {
            const frac = total * (i / (n - 1));
            const pt = path.getPointAtLength(frac);
            pts.push({ x: pt.x, y: pt.y });
        }

        document.body.removeChild(svg);
        return pts;
    }

    // ==========================================
    // FEEDBACK & SCORING UI
    // ==========================================
    _showFeedback(strokeIndex, result) {
        if (!this.feedbackEl) {
            return;
        }

        clearTimeout(this.feedbackTimeout);

        const total = this.referencePaths.length;
        let msg = '';
        let cls = 'drawing-pad-feedback';

        if (strokeIndex >= total && total > 0) {
            msg = `Extra stroke! This kanji has ${total} strokes.`;
            cls += ' feedback-warn';
        } else if (!result.orderCorrect) {
            msg = `Stroke ${strokeIndex + 1}: drawn out of order`;
            cls += ' feedback-warn';
        } else if (result.score >= 0.7) {
            msg = `Stroke ${strokeIndex + 1}/${total || '?'}: Great! (${Math.round(result.score * 100)}%)`;
            cls += ' feedback-good';
        } else if (result.score >= 0.35) {
            msg = `Stroke ${strokeIndex + 1}/${total || '?'}: Close (${Math.round(result.score * 100)}%)`;
            cls += ' feedback-ok';
        } else {
            msg = `Stroke ${strokeIndex + 1}/${total || '?'}: Try again (${Math.round(result.score * 100)}%)`;
            cls += ' feedback-warn';
        }

        this.feedbackEl.textContent = msg;
        this.feedbackEl.className = cls;

        this.feedbackTimeout = setTimeout(() => {
            if (this.feedbackEl) {
                this.feedbackEl.textContent = '';
                this.feedbackEl.className = 'drawing-pad-feedback';
            }
        }, 4000);
    }

    _updateScore() {
        if (!this.scoreEl || this.referencePaths.length === 0) {
            return;
        }
        const scored = this.strokes.filter((s) => s.score !== undefined);
        if (scored.length === 0) {
            return;
        }
        const avg = scored.reduce((sum, s) => sum + s.score, 0) / scored.length;
        const orderOk = scored.every((s) => s.correct);
        this.scoreEl.textContent = `Accuracy: ${Math.round(avg * 100)}%${
            orderOk ? '' : '  ⚠ order'
        }`;

        if (scored.length === this.referencePaths.length) {
            if (avg >= 0.7 && orderOk) {
                this.scoreEl.textContent += '  ✅ Well done!';
            } else {
                this.scoreEl.textContent += '  — try again for a better score';
            }
        }
    }

    // ==========================================
    // TOOLBAR ACTIONS
    // ==========================================
    clearStrokes() {
        this.strokes = [];
        this.currentStroke = [];
        this.isDrawing = false;
        if (this.feedbackEl) {
            this.feedbackEl.textContent = '';
            this.feedbackEl.className = 'drawing-pad-feedback';
        }
        if (this.scoreEl) {
            this.scoreEl.textContent = '';
        }
        this._repaint();
    }

    undoStroke() {
        if (this.strokes.length > 0) {
            this.strokes.pop();
            this._updateScore();
            this._repaint();
        }
    }

    toggleGrid() {
        this.gridVisible = !this.gridVisible;
        this._saveSettings();
        this._syncButtons();
        this._repaint();
    }

    toggleReference() {
        this.referenceVisible = !this.referenceVisible;
        this._saveSettings();
        this._syncButtons();
        this._repaint();
    }

    setStrokeWidth(width) {
        this.strokeWidth = Math.min(10, Math.max(2, parseInt(width, 10) || 4));
        this._saveSettings();
        this._syncButtons();
        this._repaint();
    }

    _syncButtons() {
        // Re-resolve controls each sync: the inline card markup is rebuilt
        // whenever the widget re-renders (kanji change, size change, mode
        // switch), so cached nodes can become detached.
        this.gridBtn = this._resolveControl('drawingPadGridBtn', 'drawingPadInlineGridBtn');
        this.refBtn = this._resolveControl('drawingPadRefBtn', 'drawingPadInlineRefBtn');
        this.clearBtn = this._resolveControl('drawingPadClearBtn', 'drawingPadInlineClearBtn');
        this.undoBtn = this._resolveControl('drawingPadUndoBtn', 'drawingPadInlineUndoBtn');
        this.widthSlider = this._resolveControl(
            'drawingPadWidthSlider',
            'drawingPadInlineWidthSlider'
        );
        this.widthValEl = this._resolveControl('drawingPadWidthVal', 'drawingPadInlineWidthVal');

        if (this.gridBtn) {
            this.gridBtn.classList.toggle('active', this.gridVisible);
            this.gridBtn.title = this.gridVisible ? 'Hide grid' : 'Show grid';
        }
        if (this.refBtn) {
            this.refBtn.classList.toggle('active', this.referenceVisible);
            this.refBtn.title = this.referenceVisible ? 'Hide reference' : 'Show reference';
        }
        if (this.widthSlider) {
            this.widthSlider.value = this.strokeWidth;
        }
        if (this.widthValEl) {
            this.widthValEl.textContent = `${this.strokeWidth}px`;
        }
    }

    // ==========================================
    // COLOUR RESOLUTION
    // ==========================================
    /**
     * Resolve a CSS custom property to a concrete colour string.
     *
     * Canvas 2D strokeStyle/fillStyle cannot understand `var(--token)` values:
     * assigning one is silently ignored and the context keeps its previous
     * colour (which is why ink stayed black). We therefore read the computed
     * value off the document root and use that instead.
     *
     * @param {string} token CSS custom property name, e.g. '--primary-color'.
     * @returns {string} A concrete colour usable by canvas, or the fallback.
     */
    _resolveCssColor(token) {
        if (typeof window === 'undefined' || !document?.documentElement) {
            return DrawingPad.FALLBACK_INK;
        }
        const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
        return value || DrawingPad.FALLBACK_INK;
    }

    /**
     * The live ink colour: always the theme accent, matching the stroke-order
     * preview. Resolved on every paint so theme changes apply immediately.
     */
    _inkColor() {
        return this._resolveCssColor('--primary-color');
    }

    // ==========================================
    // RENDERING
    // ==========================================
    _repaint() {
        if (!this.ctx) {
            return;
        }
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        ctx.clearRect(0, 0, w, h);

        // 1. Reference image (faint)
        if (this.referenceVisible && this.referenceImg) {
            ctx.save();
            ctx.globalAlpha = DrawingPad.REF_OPACITY;
            ctx.drawImage(this.referenceImg, 0, 0, w, h);
            ctx.restore();
        }

        // 2. Grid overlay
        if (this.gridVisible) {
            this._drawGrid(ctx, w, h);
        }

        // 3. Completed strokes (use snapped points for visual correction if available)
        const ink = this._inkColor();
        this.strokes.forEach((stroke) => {
            const pts = stroke.snappedPoints || stroke.points;
            // Accent ink for good strokes; keep semantic colours for feedback.
            const color = stroke.ink ? ink : stroke.color || ink;
            this._drawStroke(ctx, pts, color, this.strokeWidth || DrawingPad.STROKE_WIDTH);
        });

        // 4. Current (in-progress) stroke — accent at reduced opacity
        if (this.currentStroke.length > 1) {
            this._drawStroke(
                ctx,
                this.currentStroke,
                this._withAlpha(ink, 0.55),
                this.strokeWidth || DrawingPad.STROKE_WIDTH
            );
        }
    }

    /**
     * Apply an alpha channel to a CSS colour for canvas use.
     * Supports #rgb, #rrggbb, rgb()/rgba(); otherwise returns the input.
     */
    _withAlpha(color, alpha) {
        if (!color) {
            return color;
        }
        const value = String(color).trim();

        if (value.startsWith('#')) {
            let r, g, b;
            if (value.length === 4) {
                r = parseInt(value[1] + value[1], 16);
                g = parseInt(value[2] + value[2], 16);
                b = parseInt(value[3] + value[3], 16);
            } else if (value.length === 7) {
                r = parseInt(value.slice(1, 3), 16);
                g = parseInt(value.slice(3, 5), 16);
                b = parseInt(value.slice(5, 7), 16);
            }
            if (r !== undefined && !Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
                return `rgba(${r}, ${g}, ${b}, ${alpha})`;
            }
        }

        const rgb = value.match(/^rgba?\(([^)]+)\)$/i);
        if (rgb) {
            const parts = rgb[1].split(',').map((p) => p.trim());
            return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`;
        }

        return value;
    }

    _drawStroke(ctx, points, color, width) {
        if (points.length < 2) {
            return;
        }
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
        ctx.restore();
    }

    _drawGrid(ctx, w, h) {
        ctx.save();
        ctx.strokeStyle = DrawingPad.GRID_COLOR;
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 4]);

        // Vertical centre
        ctx.beginPath();
        ctx.moveTo(w / 2, 0);
        ctx.lineTo(w / 2, h);
        ctx.stroke();

        // Horizontal centre
        ctx.beginPath();
        ctx.moveTo(0, h / 2);
        ctx.lineTo(w, h / 2);
        ctx.stroke();

        // Outer border
        ctx.setLineDash([]);
        ctx.strokeStyle = DrawingPad.GRID_COLOR;
        ctx.strokeRect(0.5, 0.5, w - 1, h - 1);

        ctx.restore();
    }
}

// ==========================================
// GLOBAL EXPORT
// ==========================================
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DrawingPad;
}

if (typeof window !== 'undefined') {
    window.DrawingPad = DrawingPad;
}
