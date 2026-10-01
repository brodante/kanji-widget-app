# Optimization Plan - Round 3 (October 2026)

Source reports (Lighthouse 13.5.0, captured Oct 1 2026 08:05 EDT, browser location Asia):

- Mobile: <https://pagespeed.web.dev/analysis/https-kanji-qd-je/1brjxbz6jt?form_factor=mobile>
- Desktop: <https://pagespeed.web.dev/analysis/https-kanji-qd-je/1brjxbz6jt?form_factor=desktop>
- Deployed commit: `ddcd24f6` (identical to this branch's base - repo == live site, verified).

## Where we stand

|                             | Mobile       | Desktop      | Previous mobile (run 4, Sep 30) |
| --------------------------- | ------------ | ------------ | ------------------------------- |
| **Performance**             | **42**       | **68**       | 11                              |
| Accessibility               | 100          | 100          | 100                             |
| Best Practices              | 100          | 100          | 96                              |
| SEO                         | 100          | 100          | 100                             |
| First Contentful Paint      | **6.3 s**    | 1.3 s        | 5.9 s                           |
| Largest Contentful          | **8.5 s**    | 1.8 s        | 9.6 s                           |
| Total Blocking Time         | 80 ms ✅     | 250 ms       | 3,484 ms                        |
| **Cumulative Layout Shift** | **0.367** ❌ | **0.174** ❌ | 0.313                           |
| Speed Index                 | 6.3 s        | 2.2 s        | 12.5 s                          |

The last round worked: TBT collapsed (26 s -> 80 ms mobile), Best Practices hit 100
(console errors gone), payloads are minified on the wire (verified: 792 KB -> 414 KB via
`tools/minify.js`, first-party first-visit transfer ≈ 142 KB brotli).

Two problems remain, and they are now the _only_ things holding the score down:

1. **CLS 0.367 mobile / 0.174 desktop** (worst metric on both).
2. **Mobile FCP/LCP 6.3/8.5 s**, dominated by one render-blocking request:
   the combined Google Fonts `css2` stylesheet - **322.9 KiB on the wire, 3,850 ms**.

## Root-cause analysis (evidence from the report + code)

### CLS: it is the widget growing after first paint, not (only) the fonts

- Report culprits: `.progress-section` = 0.361 (mobile), `.recent-section` = 0.171
  (desktop). Those sections sit **below** `#kanjiWidget` in `index.html`.
- On load, `#kanjiWidget` contains a small spinner (`.widget-loading`, widget
  `min-height: 300px`). After the 19 deferred scripts execute and
  `database/Hiragana.json` (40 KB) is fetched, `renderKanji()` replaces it with the
  full large widget (character + readings + examples + stroke-order flip card +
  practice controls ≈ 800–900 px on mobile). Everything below jumps down.
- This also explains the old "CLS lottery" (0.007 vs 0.313 between runs 2–4 of the
  same code): whether the growth lands before or after first paint is timing luck.
  The Klee One woff2 files flagged in the culprit table are secondary contributors
  (fallback -> Klee One swap resizes text inside the widget).
- The previous round's fix (make the font stylesheet render-blocking) guaranteed the
  `@font-face` rules exist at paint, but it can't prevent the swap shift, and it made
  FCP _wait_ on a 323 KiB file - which is exactly why FCP is now 6.3 s.

### FCP/LCP: one huge blocking stylesheet + a late-starting data fetch

- Render-blocking (mobile): `css2` fonts CSS **322.9 KiB / 3,850 ms** +
  `styles.css` 21 KiB / 380 ms. Critical-path latency otherwise fine (TTFB 10–11 ms).
- The css2 request carries **11 weights × ~120 CJK unicode-range subsets**:
  Klee One 400;600, Noto Sans JP 300;400;500;700, Noto Serif JP 400;700,
  Zen Antique, Zen Maru Gothic 400;700. Above the fold, the page actually renders
  **Klee One only** (LCP `div.kanji-character`, `.japanese-text` via
  `--japanese-font`, default `kanjiFont: 'Klee One'`). Noto Sans JP appears only as
  (a) the second fallback behind Klee One, (b) stroke-order SVG numbers
  (`font-weight: 500 !important`), (c) an opt-in kanji font. Noto Serif JP /
  Zen Antique / Zen Maru Gothic are only used by the settings font picker and
  opt-in fonts - none of it needs to block first paint.
- LCP breakdown (mobile): TTFB 10 ms + **element render delay 1,680 ms** - the あ
  can't paint until JS runs and `Hiragana.json` arrives; that fetch only starts after
  all deferred scripts download+execute (~6 s on Slow 4G). No `preload` for it.
- Third parties on the load path: gtag **175 KiB** (+166 ms long task mobile,
  157/121 ms desktop), Font Awesome **344 KiB** (16 KiB CSS + 125 KiB solid woff2 +
  **103 KiB brands woff2 for the single `fa-github` icon**; 14.5 KiB of the CSS is
  flagged unused), three.js 119 KiB (on-demand for the nami default - working as
  designed).
- "Use efficient cache lifetimes" (116 KiB, 10-min TTL) is a GitHub Pages platform
  limit - headers cannot be changed there; the service worker already covers repeat
  visits. Not actionable; stays as a known lab artifact.

### Smaller findings from the code/deploy audit (not all score-visible)

- `assets/icons/clover-end.png` is **2500×2338 (599 KB)** displayed at ~58 px
  (yotsuba progress-bar end cap); `clover-point.png` is 1200×1200 (167 KB) shown at
  ~28–40 px. `clover-badge.png` (111 KB) is referenced nowhere.
- Theme-picker "Dante's Top Themes" thumbnails use the **full-size assets as
  `background-image`** - opening the custom-theme editor on desktop downloads
  `assets/dev-themes/君の名前は.gif` (**5.5 MB**) just to draw a ~150 px tile.
- `og:url`/`og:image` point at `brodante.github.io/kanji-widget-app/preview.png`:
  wrong domain (CNAME is `kanji.qd.je`), wrong case (`preview.PNG`), and the file is
  never copied into the Pages deploy -> **social/Discord embed cards are broken**.
- Deploy artifact ships files never requested at runtime:
  `database/complete_kanji_db.json` (1.8 MB), `database/vocab.json` (130 KB),
  `database/sort-json.py`, `README.md`, `firestore.rules` (verified: the app only
  fetches `database/{level}.json`; `'all'` merges N5–N1 in code). `docs/` must stay
  (the app links `docs/google-drive-backup.md`).
- `index.html` (152 KB) is the one shipped text asset **not** minified at deploy
  (~18 KB brotli on the wire; comments+whitespace ≈ 35% of it).
- `sw.js` precache list contains duplicates: `/` **and** `/index.html`; bare
  `/styles.css` **and** `/styles.css?v=…`; same for `script.js`, `drawing-pad.js`,
  `ui-feedback.js`, `backup-manager.js`. `cache.addAll` downloads both variants at
  install (~50 KB wasted) and stores two copies.
- First paint fetches the same KanjiVG SVG **twice** (`loadStrokeOrder()` and
  `DrawingPad.setKanji()` both call `fetchStrokeOrderSvg()`); HTTP cache absorbs the
  second request but the parse/sanitize/DOM work runs twice.
- Default-theme mismatch: `themeToggle` falls back to `'candy'`
  (`localStorage.getItem('theme') || 'candy'`) while `applyTheme` falls back to
  `'nami'`. For a first-time visitor (nothing saved, actual theme = nami) the toggle
  computes "current = candy -> switch to dark -> nami", i.e. a no-op click.
- `assets/fonts/Hannari-Regular.ttf` + `Kokoro-Regular.ttf` (160 KB total) are served
  as TTF, not woff2 (~45% larger than needed; async picker fonts, OFL-licensed).
- 23 desktop / 8 mobile elements flagged "non-composited animations" - all the
  one-shot `color`/`background-color`/`border-*-color`/`box-shadow` transitions
  (incl. `.kanji-widget { transition: all 0.3s }`). Confirmed cosmetic for the score
  (previous trace analysis), but `transition: all` is genuinely sloppy: it animates
  layout properties too.

## The plan

Ordered by (score impact ÷ risk). Each phase is independently shippable and
reversible. "Visual delta: none" means pixel-identical after load on all themes.

### Phase A - Kill the CLS + unblock FCP/LCP (the score movers)

**A1. Pre-render the default widget state in `index.html` (CLS −0.36/−0.17, LCP −≈5 s mobile)**
Replace the spinner inside `#kanjiWidget` with the static markup `renderKanji()`
produces for the default state (large widget, あ + meanings/readings/examples for あ,
stroke-order section with the Practice tab active, action buttons), plus a static
gojuon `#kanjiJourney` grid and the "0 mastered | 46 total (Hiragana level)" line.
Hydration rules in `loadCurrentKanji()`/`renderKanjiJourney()`:

- An inline `<head>` script (< 1 KB, runs before paint) reads the saved settings from
  `localStorage`; if level ≠ Hiragana **or** progress exists **or** `kanjiFont` ≠
  Klee One, it clears the static markup back to the current spinner state - returning
  users see exactly today's behavior.
- Fresh/default visitors (the PSI lab case and most first visits) get the correct
  first screen **in the first paint**: no growth shift, and the LCP あ is in the
  initial HTML instead of arriving after JSON+JS.
- When data loads, `renderKanji()` overwrites with identical content (no visible
  change); stroke order/drawing pad initialize as today.
- Risk: medium (touch `index.html`, `script.js` boot path, and the boot tests).
  The static あ markup must stay byte-consistent with `renderKanji()` output -
  add a test that renders and diffs against the static HTML.
- Simpler fallback if you want zero JS risk: keep the spinner but reserve space -
  `.kanji-widget.large-widget { min-height: ~780px }` while loading, and min-heights
  for `.journey-grid`/`.recent-grid`. Kills ~80% of the shift, does nothing for LCP.

**A2. Split the Google Fonts request; only Klee One blocks paint (FCP −≈3 s mobile)**

- Blocking stylesheet: `family=Klee+One:wght@400;600&display=swap` (~2 weights
  instead of 11 -> roughly 323 KiB -> ~60 KiB transfer).
- Everything else (Noto Sans JP 300;400;500;700, Noto Serif JP, Zen Antique,
  Zen Maru Gothic) moves to the existing async pattern (`media="print"` +
  `onload`, like `display-fonts.css`) - they serve the settings picker and opt-in
  fonts, none of which exist at first paint.
- Refinement (optional, keeps non-default font users perfect): the same inline
  script from A1 can promote the saved `kanjiFont` family into the blocking request
  when it isn't Klee One.
- Visual delta: none for default users; users who picked Noto Sans JP as kanji font
  see it arrive a beat later on a cold cache (it's a fallback-position font today
  anyway). Stroke-order SVG numbers briefly use the fallback sans before Noto 500
  lands - inside an SVG, no layout shift.
- Update `test-performance-budget.js` font assertions in the same commit.

**A3. Vendor (self-host) the blocking font CSS + preload the kana subsets (FCP/LCP −0.5–1 s, kills the font-swap lottery)**

- Save the css2 response for the blocking set locally (`assets/fonts/klee-one.css`,
  woff2 URLs stay on `fonts.gstatic.com`), minified -> removes the
  `fonts.googleapis.com` round-trip (731 ms mobile) and the 33 KiB "Minify CSS"
  finding, and pins the subset URLs so preloads stay valid.
- `<link rel="preload" as="font" crossorigin>` for the Klee One woff2 files that
  cover hiragana/Latin at 400+600 (the report shows subsets `.119`, `.114`, `.116`,
  `.98` + base; exact list derived from the vendored CSS unicode-ranges, ~4 files,
  ~100 KB - they are needed for LCP either way, preloading just removes the
  CSS->font serial hop and the swap shift).
- Caveat to record in the file header: css2 responses are UA-dependent; the vendored
  copy targets modern browsers (woff2 + unicode-range). The app is already
  woff2/WebGL/PWA-only, so this loses no supported browser. Keep the
  `fonts.gstatic.com` preconnect; drop the `fonts.googleapis.com` one.

**A4. Preload `database/Hiragana.json` (LCP render delay 1,680 ms -> ~0)**

- `<link rel="preload" as="fetch" href="database/Hiragana.json" crossorigin>` in
  `<head>`. The fetch currently starts after ~19 scripts execute; preload starts it
  at t≈0.8 s in parallel. `KanjiData.getKanjiByLevel` keeps working unchanged
  (preload populates the HTTP cache; add the file to the SW precache too).
- Only pays off for the default level (the common case + the lab case); for saved
  non-default levels it's a wasted 3 KB brotli - acceptable, or do it from the A1
  inline script for the saved level only (better; same mechanism, dynamic href).

**Expected after Phase A:** mobile CLS ≈ 0.00–0.02, FCP ≈ 2–3 s, LCP ≈ 2.5–3.5 s
(score ~75–90); desktop CLS ≈ 0, FCP ≈ 0.9–1.1 s (score ~90+).

### Phase B - Third-party payload (no visual change)

**B1. Font Awesome: subset + self-host (−344 KiB, removes a preconnect and both `font-display` findings)**

- Only 58 solid glyphs + `fa-github` are used (audited across HTML/JS).
- Replace `fab fa-github` with an inline SVG (1 occurrence) -> the 103 KiB brands
  woff2 never downloads.
- Build a subset `fa-solid-900.woff2` (58 glyphs ≈ 6–10 KiB) + trimmed CSS with the
  same class names (`.fas.fa-*` keep working - zero markup churn), self-hosted under
  `assets/fonts/`; keep loading it async as today. Tooling: `subset-font` (npm,
  harfbuzz-wasm) wired into `tools/`, output committed; source font from
  `@fortawesome/fontawesome-free` (npm, same 6.0.0 glyphs -> identical rendering).
- Guard: test that every `fa-*` class used in the repo exists in the subset CSS.

**B2. Defer gtag until first interaction/idle (−175 KiB on the load path, −2 long tasks desktop)**

- In `analytics.js`, load `gtag/js` on the first `pointerdown`/`keydown` or
  `requestIdleCallback` (whichever first), keeping the `dataLayer` stub so nothing
  throws. **Judgment call - flag:** pure bounces shorter than the idle window may
  not report; engaged sessions all still do. If you'd rather keep 100% of pageviews,
  skip B2 - it's worth ~10–15 desktop TBT points and mobile bandwidth, not more.

**B3. Resize the oversized yotsuba PNGs (−750 KB whenever that theme is active)**

- `clover-end.png` 2500×2338 -> 256×240 (rendered at ≤58 px, DPR-2 covered),
  `clover-point.png` 1200×1200 -> 256×256, keep `clover-mid.png` (360×360, fine).
  Lanczos resize + PNG optimization via ImageMagick; verify with a pixel-diff of the
  element at rendered size (target: no perceptible difference; these are smooth
  clover illustrations, not fine text).
- Delete `clover-badge.png` (unreferenced) or move it out of the deployed `assets/`.

**B4. Theme-picker thumbnails (−5.7 MB per custom-theme-editor open on desktop)**

- Generate ~320 px thumbnails (`君の名前は.thumb.jpg` = first frame, `水原.thumb.jpg`)
  and extend the manifests from `["file"]` to `[{"file", "thumb"}]` (keep accepting
  plain strings for compatibility). `renderDevFavorites` uses `thumb` for the tile
  background; selecting a preset still applies the full file. Tiles are ~150 px -
  visually identical at that size.
- Optional (needs ffmpeg, judgment call): re-encode the 5.5 MB GIF as a looping
  `webm`/`mp4` (~1–2 MB, hardware-decoded; the manifest system already supports
  video). Changes the picker tile to the video-badge style - slight visual delta in
  the editor only, background itself identical. Default: don't, unless the GIF's
  weight bothers you.

**B5. Convert `Hannari/Kokoro` TTF -> woff2 (−90 KB on picker-font loads, lossless glyphs)**

- `wawoff2` (npm) or `fonttools`; update `display-fonts.css` `src:` + `format()`.
  OFL permits embedding; rendering identical (same outlines).

### Phase C - Hygiene, correctness, deploy weight (small score effect, real quality wins)

**C1. Fix social embeds (SEO/sharing, currently broken).** Optimize `preview.PNG`
(367 KB -> ~120–180 KB lossless/near-lossless), deploy it as `preview.png`, point
`og:url`/`og:image` at `https://kanji.qd.je/`, add `twitter:card` tags. Zero runtime
cost (crawlers only).

**C2. Slim the Pages artifact.** Stop copying `database/complete_kanji_db.json`,
`database/vocab.json`, `database/sort-json.py`, `README.md`, `firestore.rules` into
`deploy/` (keep `docs/` - the app links it). −2 MB per deploy, nothing user-facing
changes. (The 112 MB `assets/audio` stays: it's the offline audio library, fetched
per character and SW-cached - working as designed.)

**C3. De-duplicate the SW precache + bump `CACHE_NAME`.** List exactly the URLs the
page requests (`?v=` variants only, `/index.html` once). −~50 KB at install, removes
stale twin copies. While in there: add `database/Hiragana.json`, the vendored font
CSS and the FA subset files to the precache.

**C4. Share one in-flight KanjiVG promise.** `fetchStrokeOrderSvg()` memoizes the
in-flight promise per character; `loadStrokeOrder()` and `DrawingPad.setKanji()`
consume the same one. Saves a duplicate parse/sanitize + the 16 ms forced reflow the
desktop report attributes to `drawing-pad.js`.

**C5. Fix the default-theme mismatch.** `themeToggle`: `|| 'candy'` -> `|| 'nami'`
(match `applyTheme`). First-time visitors' dark/light toggle starts working
immediately instead of no-op-ing. (Behavior fix - only affects users with no saved
theme.)

**C6. Scope `.kanji-widget { transition: all 0.3s }`** to the properties it actually
animates (`background-color, box-shadow, border-color, transform`). Identical visuals
(theme-switch fade preserved), stops animating layout properties, chips at the
"non-composited animations" list. Same pass: leave the deliberate one-shot
`color`/`background-color` transitions elsewhere alone - they're the app's feel.

**C7. Minify `index.html` at deploy time.** Add `html-minifier-terser` (conservative:
collapse whitespace, strip comments) to `tools/minify.js` for the deploy copy only -
repo source keeps its comments. 152 KB -> ~95 KB raw, ~3–4 KB brotli saved per hit.
Guard with the existing deploy byte-check pattern.

### Explicitly not doing (evaluated, rejected)

- **Unused-CSS stripping of `styles.css`** (14.6 KiB est. savings): the "unused"
  rules are theme-scoped and modal-scoped - unused only until a theme switch or a
  dialog opens. Coverage-based trimming needs a real browser farm to be safe; the
  win is ~1–2 KB brotli. Bad ratio.
- **Inlining `styles.css` into HTML** (saves the 380 ms mobile CSS round-trip):
  viable, but it grows every HTML response by ~20 KB brotli, entangles cache
  busting, and Phase A already removes the _other_ blocking request. Revisit only if
  a post-A run still shows styles.css blocking meaningfully.
- **Touching the nami WebGL default / three.js loading** - fixed last round
  (TBT 80 ms mobile proves it); product decision stands.
- **Cache-TTL headers** - GitHub Pages can't set them; SW already covers repeats.
- **Firebase lazy-loading** - already interaction-gated and correct.

## Verification plan (per phase, before merge)

1. `npm run verify` (lint + prettier + full test suite - baseline confirmed green on
   `ddcd24f6` in this sandbox: all suites + 68 drawing-pad scenarios pass).
2. Update the guard tests in the same commit: `test-performance-budget.js` (font
   links, blocking-stylesheet assertions, new preload/inline-script guards),
   `test-app-boot.js` (static-widget hydration: fresh visitor keeps the pre-rendered
   あ; returning visitor with saved level/progress falls back to the spinner path).
3. New static-vs-rendered diff test: `renderKanji()` output for あ equals the
   pre-rendered markup (prevents drift between A1's HTML and the JS template).
4. Byte-level checks in-sandbox: brotli/gzip measurements per changed asset;
   ImageMagick pixel-diff of resized PNGs/thumbnails at rendered size.
5. Local A/B per `docs/regression-checklist.md` (`git worktree` of `main` vs branch,
   `node server.js` on two ports, walk the manual checklist - themes, font picker,
   practice pad, drawer, sign-in).
6. After deploy: re-run PSI mobile+desktop and confirm, in order:
   css2 blocking entry gone / ≤ ~60 KiB, CLS culprits table empty (or < 0.05),
   LCP render-delay ≈ 0, `fa-brands`/`fa-solid` full fonts absent from the network
   list, gtag absent on passive load (if B2 accepted), deploy workflow's live byte
   guard still green.

## Expected outcome

|             | Mobile now | Mobile target | Desktop now | Desktop target |
| ----------- | ---------- | ------------- | ----------- | -------------- |
| Performance | 42         | **80–92**     | 68          | **90–97**      |
| FCP         | 6.3 s      | 2–3 s         | 1.3 s       | ~0.9 s         |
| LCP         | 8.5 s      | 2.5–3.5 s     | 1.8 s       | ~1.2 s         |
| CLS         | 0.367      | ≤ 0.02        | 0.174       | ≤ 0.01         |
| TBT         | 80 ms      | ~80 ms        | 250 ms      | ~100 ms (B2)   |

Residual mobile FCP/LCP floor: the lab runs from Asia against GitHub Pages' CDN with
150 ms RTT + Slow 4G; ~1.5–2.5 s is the physical floor for HTML + blocking CSS +
LCP font. Real-user (CrUX) numbers will be much better once traffic accumulates.
