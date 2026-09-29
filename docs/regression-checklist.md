# Regression checklist — "is everything still the same?"

Companion to `docs/performance-optimization-plan.md`. The optimisation work changed how
assets are loaded, when the account stack starts, and a handful of colours/headings. This
is how to prove nothing else moved.

Three levels, in order of effort:

1. **Automated gate** (~1 min) — catches the mechanical breakage.
2. **Boot walkthrough** (~5 min) — the real app in a browser, journey by journey.
3. **Visual A/B** (~10 min) — old commit vs new commit, side by side, for anything the
   tests cannot see.

---

## 0. Get the code

```bash
git fetch origin
git checkout arena/01a0eec4-kanji-widget-app
git pull
npm install          # first time only
```

Then, to compare against the pre-optimisation build, keep a second copy of the old commit:

```bash
git worktree add ../kanji-before d223a21   # the commit before the optimisation
cd ../kanji-before && npm install && npm start -- --port 5001
```

(If `--port` is ignored, `PORT=5001 npm start`.)

## 1. Automated gate

```bash
npm run verify       # lint + format:check + the full test suite
npm run build:min    # optional: reproduce the deploy-time minification into dist/
```

Expected: **all green, 246 tests, 0 failures.** What each suite is protecting:

| Suite                                                                                                                                                          | What it would catch                                                                                                                                                                                        |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test/test-app-boot.js`                                                                                                                                        | the app failing to boot, a widget not rendering, a theme not applying, the drawing pad breaking, the drawer/settings not opening, the service worker not registering, the account stack loading too early  |
| `test/test-performance-budget.js`                                                                                                                              | a script losing `defer`, three.js creeping back into `<head>`, a second font request, zoom being disabled again, a button losing its accessible name, the service worker going back to `cache: 'no-store'` |
| `test/test-drawing-pad.js`                                                                                                                                     | stroke-order snapping, undo/redo, guide panel                                                                                                                                                              |
| `test/test-backup.js`, `test-account-ui.js`, `test-app-auth.js`, `test-cloud-sync.js`, `test-username-login.js`, `test-profile-page.js`, `test-avatar-crop.js` | backups, sign-in, sync, profile                                                                                                                                                                            |
| `test/test-analytics.js`                                                                                                                                       | exactly one GA4 tag, and none on dev hosts                                                                                                                                                                 |

These guards were mutation-tested: removing a `defer`, deleting an `aria-label`, moving
three.js back into `<head>`, or restoring the eager Firebase bootstrap each fail the suite.

## 2. Boot walkthrough (`npm start`, then open http://localhost:5000)

### First paint

- [ ] The kanji of the day, its meaning, readings and examples appear.
- [ ] Text is readable immediately; Japanese faces settle in a moment later (fonts load
      without blocking now — a brief fallback-then-swap is expected, not a blank page).
- [ ] Icons (Font Awesome) may appear a beat after the text. Same reason.
- [ ] DevTools Console shows **no red errors**.

### Learning

- [ ] Next/previous moves through the deck and wraps around.
- [ ] The speaker button plays audio (or falls back to speech synthesis).
- [ ] "Mark as mastered" updates the progress line, shows the toast with **Undo**, and Undo
      reverses it.
- [ ] The journey grid, streak badge and "Recently studied" all populate.
- [ ] Search finds a kanji by character, romaji or meaning.
- [ ] Reset progress asks for confirmation and clears everything.

### Stroke order / drawing pad

- [ ] Animate plays the stroke-order animation.
- [ ] Practice mode flips the card and shows the pad: Grid, Trace, Undo, Redo, Clear and the
      thickness slider all work, and drawing a stroke scores it.
- [ ] Switching back to Animate hides the toolbar; switching again reuses the same pad.

### Drawer, AI Sensei, settings

- [ ] The mnemonic/etymology drawer opens, switches tabs and closes.
- [ ] The AI Sensei button opens the hub; the free model answers a question.
- [ ] Settings opens, changing the JLPT level / font / size applies immediately and persists
      across a reload.

### Themes (the riskiest area)

- [ ] Every theme in the picker applies, including the four WebGL ones: **nami, lumen,
      obake, ito** — the animated background renders and animates.
- [ ] Switching away from a WebGL theme stops its animation (no runaway GPU).
- [ ] A custom theme with an image/video background and custom CSS still works.
- [ ] The chosen theme survives a reload.

### Account, sync, offline

- [ ] The account panel opens; sign-in with username/password and with Google both work.
- [ ] Cloud save/load round-trips progress.
- [ ] Google Drive backup export/import works.
- [ ] Reload once, then **go offline** and reload: the app still opens and the last kanji is
      usable (service worker shell). Stroke-order SVGs already viewed still render.
- [ ] A second reload while online is served from cache and updates in the background
      (Network tab: assets served from the service worker, not the network).

### Accessibility spot-checks

- [ ] Tab through the widget: every icon-only button announces a name
      (Play pronunciation / Mnemonic and etymology / Ask AI Sensei / Search on Jisho /
      Mark as mastered).
- [ ] Pinch-zoom works on mobile (viewport zoom is enabled again).
- [ ] The footer text is clearly readable in both a light and a dark theme.
- [ ] Headings read in order (no jump from a section title straight to a sub-heading).

## 3. Visual A/B against the old build

With `../kanji-before` running on :5001 and the new build on :5000:

```bash
# optional, one-off: screenshot both with Playwright
npx --yes playwright@latest screenshot --viewport-size=412x900 http://localhost:5001 before.png
npx --yes playwright@latest screenshot --viewport-size=412x900 http://localhost:5000 after.png
```

Compare, in this order: default theme, one light theme (candy), one dark theme (nami),
practice mode, the drawer, and the footer. Deliberate differences: the footer surface is now
opaque (it used to be a translucent wash that was unreadable on dark themes), link colours in
candy/sunrise/yotsuba are slightly darker, and fonts/icon fonts arrive a moment later.

## 4. Performance check (the point of the exercise)

1. Push the branch and let GitHub Pages deploy (`main` only — for a branch, run the build
   locally: `node tools/minify.js deploy` and serve `deploy/`).
2. Run PageSpeed Insights on the URL, mobile **and** desktop.
3. Compare against the baseline: Performance 52, FCP 12.2 s, LCP 14.5 s, 2,562 KiB.
4. In DevTools, confirm on a cold load: no request to `cdnjs.cloudflare.com` for three.js
   until a WebGL theme is active, and no `gstatic.com/recaptcha` request until you tap an
   account control (or a few seconds of idle).

## 5. If something is wrong

```bash
git revert 6079b95        # the optimisation commit, if it must come out wholesale
# or
git checkout d223a21 -- index.html script.js app-auth.js sw.js styles.css server.js
```

The work is one commit, so a revert is clean. Please also note the failing checklist item in
`docs/performance-optimization-plan.md` so the next attempt keeps it green.
