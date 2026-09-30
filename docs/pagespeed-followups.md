# PageSpeed follow-ups (lab runs, mobile)

Analysis of the four saved mobile lab runs (Moto G Power, Slow 4G, Lighthouse 13.5.0),
what the "optimization (#71)" round actually moved, and what is left.

| Run                                                                                            | When (EDT)   | Code on the wire | Perf | a11y | BP  | FCP    | LCP    | TBT       | CLS       | SI     | TTI    |
| ---------------------------------------------------------------------------------------------- | ------------ | ---------------- | ---- | ---- | --- | ------ | ------ | --------- | --------- | ------ | ------ |
| [baseline](https://pagespeed.web.dev/analysis/https-kanji-qd-je/wpymnnrzry?form_factor=mobile) | Sep 29 15:15 | `ea168b24`       | 52   | 78   | 96  | 12.2 s | 14.5 s | 200 ms    | 0.005     | 12.2 s | 16.2 s |
| [run 2](https://pagespeed.web.dev/analysis/https-kanji-qd-je/qiuszc1vlt?form_factor=mobile)    | Sep 29 16:58 | `d5663053`       | 27   | 98   | 96  | 4.4 s  | 8.9 s  | 5,930 ms  | **0.007** | 15.5 s | 34.9 s |
| [run 3](https://pagespeed.web.dev/analysis/https-kanji-qd-je/78166fa4oy?form_factor=mobile)    | Sep 29 17:59 | `d5663053`       | 10   | 100  | 96  | 5.9 s  | 8.6 s  | 26,140 ms | 0.313     | 16.9 s | 45.0 s |
| [run 4](https://pagespeed.web.dev/analysis/https-kanji-qd-je/u672w337h4?form_factor=mobile)    | Sep 30 09:48 | `eea218d2`       | 11   | 100  | 96  | 5.9 s  | 9.6 s  | 3,484 ms  | 0.313     | 12.5 s | 32.7 s |

Three things jump out of the table:

- **The same code produced CLS 0.007 (run 2) and 0.313 (runs 3–4).** Whether the
  Klee One woff2 files arrive before or after the first paint is a timing lottery;
  the swap is real in every case, it just lands inside or outside the measured
  window. A blocking font stylesheet removes the lottery entirely.
- **a11y 98 → 100 between runs 2 and 3**: the `<h2>Examples</h2>` heading fix
  (`aaa05d35`) landed in between - the timeline lines up with the commits.
- **TBT varies 3.5 s → 26 s between runs** of the same code (PSI's emulated CPU
  power read 542, 924 and 897 in the three runs). The behaviour is stable, the
  magnitude is not - which is exactly what a per-frame cost inside a variable
  lab environment does.

## What the optimization round actually changed (baseline → now)

Measured wins (do not revert):

- **FCP 12.2 s → 4.4–5.9 s, LCP 14.5 s → 8.6–9.6 s.** Thirteen render-blocking
  requests (188 KiB of classic app scripts, 131 KiB of three.js in `<head>`, five
  stylesheets) replaced by one blocking stylesheet + deferred parallel scripts.
- **a11y 78 → 100.** Icon-only buttons got `aria-label`s, the generated "Examples"
  heading is `<h2>`, footer contrast fixed.
- **Payload:** three.js + addons moved off the critical path (fetched on demand,
  warmed while idle), fonts combined into one css2 request.

Measured regressions (this document):

1. **TBT 200 ms → 3.5–26 s (TTI 16 s → 33–45 s).** See "Main thread" below.
2. **CLS 0.005 → 0.313.** The Klee One stylesheet went non-blocking
   (`media="print"` + `onload`), so first paint now uses the fallback font and the
   woff2 swap reflows the page afterwards. In the baseline the font CSS was
   render-blocking, the font was in cache _before_ the (very late) first paint, and
   there was no swap. Lighthouse attributes 0.306 of the 0.313 to the "Learning
   Progress" `.progress-section` element + the Klee One woff2 files.

## Main thread: what the trace data says

Per-run "Minimize main-thread work" and per-URL CPU attribution:

|                                        | baseline | run 3 (26 s TBT)   | run 4 (3.5 s TBT) |
| -------------------------------------- | -------- | ------------------ | ----------------- |
| Total main-thread work                 | 4.7 s    | ~40 s              | 28.5 s            |
| `script.js` total CPU                  | 3.1 s    | 38.6 s             | 25.7 s            |
| `script.js` script _evaluation_        | 126 ms   | 117 ms             | 235 ms            |
| "Other" (rAF/timers/runtime)           | 3.0 s    | ~36 s              | 25.6 s            |
| Long tasks from `script.js` after ~6 s | **none** | 213–395 ms, 6→44 s | 70–102 ms, 6→30 s |
| reCAPTCHA long tasks                   | 471 ms   | ~1 s               | 565 ms            |

Key facts:

- The cost is **runtime** (requestAnimationFrame callbacks and timers), not
  parse/eval: `script.js` evaluation is 117–235 ms in every run.
- The only continuous per-frame JS in the app is the **Nami WebGL render loop**:
  `window.namiRenderLoop` → `renderer.render(scene, camera)` every rAF. The default
  theme is `nami` (both baseline and current: `localStorage.getItem('theme') ||
'nami'`), so the loop runs for the whole trace. In the headless lab environment
  WebGL is software-rendered (SwiftShader, in-process) and the per-frame cost is
  attributed to the caller's frames in `script.js` — consistent with 25–39 s of
  "script.js CPU" that is not evaluation.
- **The WebGL scene, renderer setup and canvas CSS are byte-identical between
  baseline and current** (diffed `script.js`, `styles.css` at `ea168b24` vs HEAD).
  The environment difference: in the baseline the first paint happened at 12.2 s
  (everything was render-blocking), in the current run at 5.9 s. Whatever the exact
  compositor interaction, the measured fact stands: with the early first paint the
  Nami loop produces 70–400 ms main-thread tasks for the whole trace, and the
  baseline trace has zero long tasks from `script.js` after 6 s.
- **CSS animations are not the TBT driver** (the suspected "20+ infinite
  animations animating box-shadow/color"): the trace's Style & Layout total is
  246 ms and Rendering 121 ms. The infinite animations in `styles.css` are almost
  all transform/opacity (compositor-friendly). The "non-composited animations"
  audit flags 8 _transitions_ (body background on theme change, `.kanji-widget
{ transition: all }`, the FAB idle fade, the streak badge) — one-shot 0.2–0.3 s
  effects that together cost < 1 s, not a sustained load. Fixing them is cosmetic
  for the score; the loop is the problem.

## Best Practices 96: the console errors

Both errors in the "browser errors were logged" audit come from the App Check
bootstrap firing at ~5 s of idle inside the lab trace:

- `content-firebaseappcheck.googleapis.com/.../exchangeRecaptchaEnterpriseToken`
  → **403 (Forbidden)** — the reCAPTCHA Enterprise site key does not list
  `kanji.qd.je` as an allowed domain.
- `www.google.com/recaptcha/enterprise/anchor?...` → `requestStorageAccess:
Permission denied.`

The lab runs never interact, so deferring the bootstrap to first interaction keeps
both out of the trace. For **real users** the 403 remains until the console side is
fixed (owner action):

1. [reCAPTCHA Enterprise console](https://console.cloud.google.com/recaptcha-enterprise)
   → the key behind `6LedqNUtAAAA…` (see `firebase-config.js` →
   `KANJI_APP_CHECK_CONFIG`) → add `kanji.qd.je` to the allowed domains.
2. Firebase console → App Check → confirm the Web app registration uses
   reCAPTCHA (v3/Enterprise) and the key above is the one attached to the app.

Until then, App Check token exchanges will 403 for interacting users as well
(AI Sensei still works today; verify again after the console change).

## Changes in this round

1. **CLS fix — main font stylesheet blocks first paint** (`index.html`).
   The combined css2 link lost `media="print" onload="this.media='all'"`. It was
   already preloaded, so the download starts at t=0 and finishes long before the
   current 5.9 s first paint: first paint then finds the `@font-face` rules and the
   woff2 files in flight (or cached), paints Klee One directly and never swaps.
   The earlyaccess faces (Hannari/Kokoro) and Font Awesome stay async.
   Test updated: `blockingStyles` in `test/test-performance-budget.js`.

2. **reCAPTCHA/Firebase start on first interaction, not a 5 s idle timer**
   (`app-auth.js`). `readyPromise` now resolves from the first document-level
   `pointerdown` or `keydown` (capture, once). AI Sensei already awaits
   `readyPromise`, so it simply waits for the stack; sign-in, cloud sync and Drive
   are interaction-driven anyway. Accepted trade-off: a returning signed-in
   user's photo/name appear after the first tap or keypress instead of a few
   seconds after reload. Removes ~800 KiB of third-party JS, ~1 s of main-thread
   work and the two console errors from every passive load. Tests updated:
   `test/test-performance-budget.js`, `test/test-app-boot.js`.

3. **Deploy wire verification** (`.github/workflows/deploy.yml`). The minify byte
   guard only inspects `deploy/`; the live site once kept serving unminified
   branch files while every step stayed green. A new post-deploy step polls
   `https://kanji.qd.je` for up to 4 minutes and fails the run unless
   `script.js`/`styles.css` are served below the minified byte thresholds.

## Open decision: the TBT root cause needs a product call

The Nami loop only becomes cheap if it is **not the continuous background work of a
passive load**. Two feature-safe shapes (both keep every one of the four WebGL
themes working exactly as today when selected):

- **A — default theme back to `candy` for new visitors.** One string
  (`applyTheme()`: `|| 'candy'`). The code comments and the light/dark toggle both
  treat candy as the default light theme; the `nami` default looks incidental.
  Existing users (any saved theme) are untouched. The lab's fresh profile never
  loads three.js at all.
- **B — keep the `nami` default, animate on first interaction.** The canvas
  renders one static frame immediately and the rAF loop starts on the first tap /
  keypress (theme switching still boots the loop instantly). A passive viewer sees
  a still wave until they touch the page.

Recommendation: **A** — smallest change, restores the measured baseline TBT
(200 ms) exactly, and no existing user changes anything.

## Optional follow-ups (not done, no feature cost)

- `preload` `database/Hiragana.json` (4 KiB, the default level, on the FCP/LCP
  critical path today) — ~1 s for new visitors on Slow 4G.
- Preload the specific Klee One woff2 subsets used by the LCP character if a future
  run shows the font still racing the first paint (URLs are version-pinned, so this
  is fragile and only worth it with data).
- The "unused CSS 338 KiB" audit is mostly the per-subset CJK `@font-face` tables in
  the Google Fonts CSS and the third-party bundles (gtag, FA) — nothing to remove
  without losing a font family or analytics.
- "Unused JavaScript 584 KiB" is gtag (174 KiB), reCAPTCHA (now interaction-gated),
  three.js (now on-demand) and Firebase — each is a working feature, so no action.

## Verification

- `npm run verify` — lint + format + 246 tests green after every change.
- After merge, re-run the mobile lab analysis and check, in order:
    1. `script.js`/`styles.css` byte sizes on the wire (minified) — the deploy now
       fails if this is not true.
    2. CLS ≈ 0 and no Klee One woff2 entries in "layout shift culprits".
    3. TBT and "script.js total CPU" after the default-theme decision is applied.
    4. Best Practices console errors (expect none on a passive lab run; the 403 for
       interacting users needs the console registration above).
