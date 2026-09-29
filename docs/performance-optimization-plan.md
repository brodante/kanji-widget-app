# Performance & Accessibility Optimization Plan

Source report: <https://pagespeed.web.dev/analysis/https-kanji-qd-je/wpymnnrzry?form_factor=desktop>
(Lighthouse 13.5.0, captured 2026-09-29, Moto G Power emulation / Slow 4G.)

## Baseline

| Metric                   | Value         | Budget               |
| ------------------------ | ------------- | -------------------- |
| Performance score        | **52**        | 90+                  |
| First Contentful Paint   | **12.2 s**    | < 1.8 s              |
| Largest Contentful Paint | **14.5 s**    | < 2.5 s              |
| Total Blocking Time      | 200 ms        | < 200 ms             |
| Cumulative Layout Shift  | 0.005         | < 0.1 (already good) |
| Speed Index              | 12.2 s        | < 3.4 s              |
| Total page weight        | **2,562 KiB** | < 1,000 KiB          |
| Accessibility            | 78            | 100                  |
| Best Practices           | 96            | 100                  |
| SEO                      | 100           | 100                  |

The LCP element is the kanji character (`div.kanji-character.japanese-text`); LCP breakdown is
10 ms TTFB + **2,460 ms element render delay**, i.e. the server is fine and the delay is entirely
client-side (bytes on the wire + blocking resources).

## Root causes (ranked by measured cost)

1. **Render-blocking requests – 6,170 ms estimated savings.**
   19 synchronous app scripts (~188 KiB) + `styles.css` + 5 stylesheets
   (3 × Google Fonts CSS, 1 × Font Awesome, 1 × `earlyaccess`) all block first paint.
2. **Non-critical third-party JS on the critical path – ~1,100 KiB.**
   `three.min.js` (119 KiB) + 5 post-processing addons (11.5 KiB) sit in `<head>` for a
   _decorative_ WebGL background; reCAPTCHA Enterprise (694 KiB, 913 ms main thread) is pulled in
   by Firebase App Check at startup; GA4 `gtag/js` adds 174 KiB.
3. **Font payload – 470 KiB of woff2** for five families, four separate CSS requests, and a
   `Material Icons` family that the app never uses (0 `material-icons` references).
4. **Unminified first-party JS/CSS** – 49 KiB + 12 KiB of avoidable bytes.
5. **Service worker defeats the HTTP cache**: `fetch(request, { cache: 'no-store' })` for every
   script/style/document, so repeat visits always revalidate from the network.
6. **Short cache TTL (10 m)** on versioned assets (`?v=…`) that never change content.
7. Accessibility: 3 icon-only buttons with no accessible name, `user-scalable="no"` viewport,
   low-contrast footer text (translucent background + `opacity: 0.75`), and an `<h4>` that skips a
   heading level.

## Phases

Each phase is independently shippable and reversible, and the phases are ordered by
(impact ÷ risk).

### Phase 1 – Critical rendering path ✅ (this branch)

- [x] `defer` on every app script so none of the 188 KiB blocks the parser.
- [x] Drop `three.js` + post-processing addons from `<head>`; load them **on demand** the first
      time a WebGL theme (`nami`, `lumen`, `obake`, `ito`) is selected, warmed during idle time
      when the saved theme already needs them. Same load order as before, so the addons keep
      working.
- [x] Merge the three `css2` Google Fonts requests into one, drop the unused `Material Icons`
      family, and `preconnect` to `fonts.gstatic.com`.
- [x] Load Font Awesome and the two `earlyaccess` fonts asynchronously (`media="print"` +
      `onload`) with a `<noscript>` fallback, so icon fonts no longer block first paint.
- [x] Allow pinch zoom in the viewport meta (removes the Best Practices failure; the drawing pad
      already sets `touch-action: none`).
- [x] Guard tests for all of the above.

Expected: render-blocking ≈ 0 (only `styles.css`, which is needed for the first paint),
~1,100 KiB off the critical path, FCP/LCP in the 2–4 s range on the same throttling.

### Phase 2 – Payload reduction ✅

- [x] `tools/minify.js` (esbuild) + `npm run build:min`, wired into `.github/workflows/deploy.yml`
      so Pages serves minified assets under the **same filenames** (no HTML rewrite, no cache
      busting churn). Measured on this checkout: 777 KiB -> 410 KiB (**-47%**) across the 21
      shipped JS/CSS files.
- [ ] Trim unused CSS rules from `styles.css` (25 KiB unused) behind an audit script.
- [ ] Replace Font Awesome (228 KiB of woff2 for ~40 icons) with inline SVG.

### Phase 3 – Repeat visits, offline & caching ✅

- [x] Service worker: stale-while-revalidate for same-origin static assets, cache-first for
      audio/fonts, network-first with cached fallback for navigations, and **stop using
      `cache: 'no-store'`** so the HTTP cache works again.
- [x] `server.js`: long-lived immutable cache headers for versioned (`?v=`) assets.
- [ ] Add `Cache-Control` headers for the Firebase Hosting target if the app moves back there
      (GitHub Pages cannot set custom headers).

### Phase 4 – Defer the heavy auth/AI stack ✅

- [x] Keep Firebase App Check / reCAPTCHA (694 KiB) off the startup path:
      initialize it lazily, right before the first request that needs a token (sign-in, cloud
      sync, AI Sensei) instead of on `DOMContentLoaded`.
- [ ] Warm the Firebase SDK during idle only when a saved session exists.

### Phase 5 – Accessibility & robustness ✅ (automated items)

- [x] `aria-label` on the icon-only widget buttons (play pronunciation, Jisho, mark mastered).
- [x] Opaque footer surface + solid muted text color so contrast is measurable and passing.
- [x] Fix heading order in the AI Sensei panel and the cloud-choice grid.
- [ ] Full keyboard pass over the drawer/dialogs (focus trap + restore) and a manual screen
      reader pass — automated audits only cover part of this.

## Verification

- `npm run verify` – lint + format:check + **246 tests**, 0 failures.
- `test/test-performance-budget.js` guards the optimisations themselves (deferred scripts,
  lazy three.js, one non-blocking font request, zoomable viewport, accessible names, opaque
  footer, caching service worker, deferred Firebase). Mutation-tested: reverting any one of
  them fails the suite.
- `test/test-app-boot.js` boots the real `index.html` with the real scripts in document order
  and walks the learner journeys: render the daily kanji, walk the deck, master + undo,
  practice mode, every theme (including the four WebGL ones, with three.js loaded exactly
  once), the drawer, settings, the offline stroke-order fallback, service worker
  registration, and the account stack staying un-started until a tap.
- `npm run build:min` reproduces the deploy-time minification locally.
- Human walkthrough: `docs/regression-checklist.md` — automated gate, browser checklist, and
  a visual A/B against the previous commit via `git worktree`.
- Re-run PageSpeed Insights on the deployed URL after each phase to confirm the FCP/LCP drop.

## Notes for the next session

- The remaining wins are the two unchecked Phase 2 items (unused CSS, Font Awesome -> SVG).
  Both are large but mechanical, and both are already isolated from the boot path.
- `dist/` is generated at deploy time and is git-ignored; `tools/minify.js` is the source of
  truth for which files get minified, so keep it in step with `deploy.yml`.
