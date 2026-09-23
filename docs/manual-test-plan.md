# Manual test plan: accounts, sign-out and deletion

Only what a browser can verify is in here. The automated suite (`npm test`, 192 tests)
already covers the logic, the edge cases and the exact strings; this plan checks the real
thing in a real browser, which no test in this repo can do.

Report every failure with: **step number, browser and version, the exact on-screen text,
the console output, and a screenshot**. Never paste passwords, tokens or account emails.

## Before you start

- Serve locally: `npm start` → <http://localhost:5000>.
- Kill stale service-worker copies: DevTools (F12) → **Application** → **Service
  Workers** → tick **Update on reload**, then reload once. The worker is network-first
  for documents and scripts, so a plain reload usually suffices; this removes doubt.
- Have two disposable accounts ready (A and B) and one free username each, e.g.
  `test_alpha_1` and `test_beta_2`.
- Keep the DevTools console open. "No console errors" is expected in every step below.

## Step 0 — publish the rules (blocks Step 4)

Two permissions changed: the owner may delete their own `users/{uid}` document and their
own progress document (`users/{uid}/sync/progress`). Nothing else changed: usernames are
still never deletable, listing stays denied, no new path became writable.

- **Console route**: Firebase Console → `kanji-widgets` → Firestore Database → **Rules**
  → paste the whole of [`firestore.rules`](../firestore.rules) → **Publish**.
- **CLI route**: `firebase deploy --only firestore:rules` (needs `firebase login`;
  `firebase.json` already points at the file).

Until these are published, Step 4 fails closed with an honest error instead of
half-deleting. You can see that path deliberately with a disposable account: the username
is released first, then the record deletion is refused, and the app says so. After that
run, the username is on hold for 30 days, so use a throwaway for it.

## Step 1 — preflight

- The app loads, no console errors, a widget still works: open one, grade a card, see the
  next one.
- DevTools → **Sources** → `app-auth.js` → search `SIGN_OUT_CONFIRM`. If it is not there,
  the browser is still running a cached copy and nothing below can pass.

## Step 2 — favicon

- `git status` shows `favicon.gif` tracked. If it is untracked: `git add favicon.gif &&
git commit -m "Add favicon"`.
- Reload → your icon is in the tab. DevTools → **Network** → `/favicon.gif` returns
  **200**, not 404.
- Chrome/Edge/Firefox animate it; Safari and iOS show the first frame only (expected).
- After this branch reaches the site: the same check on <https://kanji.qd.je>. The deploy
  workflow copies the file when it exists.

## Step 3 — sign-out identity cleanup

**3.1 — cancel changes nothing.** Sign in as A, upload a profile photo, set a nickname.
Click **Sign out of app** → **Cancel** in the prompt. Expect: still signed in, photo,
nickname and username all intact. Expected prompt text:

> Sign out of the app? … Removed from this device: your uploaded photo and its crop, your
> nickname and your username. Kept: kanji progress, reviews, streaks, themes and local
> backups. … Drive keeps its own Disconnect button.

**3.2 — the real sign-out.** Click again → **OK**. Expect:

- Photo replaced by the placeholder (or your Google photo, if that account has one).
- Nickname gone; the account heading is no longer your nickname.
- **Username & sign-in methods** disappears.
- Status line: "Signed out: your photo, name and username were removed from this device.
  Learning progress stays."
- Signing out from inside the dialog instead shows the longer line about the shared-device
  option in `Recovery & privacy → Disconnect & clear this device`.

**3.3 — reload.** Ctrl+Shift+R. Still no photo, no nickname, no username. **This is the
exact bug you reported**, so it matters that it holds after a reload, not just on screen.

**3.4 — another tab.** Open a second tab, then sign out in the first. The second tab must
clear as well and show a notice: "Signed out in another tab. This tab ended its session
too, and removed your photo, name and username from this device; learning progress stays."

**3.5 — the next person.** In the same browser profile (not incognito), the app must look
like a fresh install identity-wise: no photo, no name, no username. Then sign in as B and
confirm B sees only B's identity.

**3.6 — what must survive.** Progress, reviews, streaks, theme and local backups are all
still there. Check a widget and the counts in Settings.

**3.7 — Drive is separate.** Sign-out does not disconnect Drive. Go to Settings → Backups
& sync → Drive still shows connected until you press its own **Disconnect**.

**3.8 — expected, by design.** Signing back in as A shows no photo: the stored photo was
deleted, not hidden, because that is the only thing that survives a reload. A full backup
restore brings it back; re-uploading takes a moment.

## Step 4 — deleting an account

Do this on the disposable account A **after** Step 0.

**4.1 — cancel.** Account pane → **Delete account** → **Cancel**. Expect "Deletion
cancelled. Nothing was removed." and everything still intact.

**4.2 — wrong password.** Try again with a deliberately wrong password. Expect "That
password did not match, so nothing was deleted." Nothing changes: still signed in, photo
and username intact, no Firestore writes.

**4.3 — delete.** Right password → **OK**. Expect the confirm text below, then success:

> Delete this account permanently? … Deleted: the sign-in itself, the account record, the
> cloud copy of your progress, and your username (it becomes claimable again after the
> usual 30 days). Kept: the kanji progress, reviews, themes and backups stored on this
> device. … This cannot be undone.

Then: "Account deleted. …", the dialog flips to the signed-out state, and the device is
cleaned exactly like Step 3.

**4.4 — Firestore console check.** Firestore → Data:

- `users/{uid}` — **gone**.
- `users/{uid}/sync/progress` — **gone**.
- `usernames/<name>` — **still there**, with `kind: "reserved"`, `uid: ""`, `releasedAt`
  set and `reservedUntil` about 30 days ahead.

**4.5 — the account really is gone.** Signing in with the old email and password fails.
The username cannot be claimed by you or anyone else until the reservation lapses.

**4.6 — the device keeps its data.** Progress is still there, and `Disconnect & clear this
device` remains the only action that removes local study data.

**4.7 — Google-only account (optional).** With an account that has no password, the delete
panel shows no password field and deletion asks for the Google popup instead.

**4.8 — partial failure.** Covered by automated tests; skip live, or use the pre-publish
state from Step 0 if you want to see the message. It should read "The account was not
deleted: … Already finished: username released. The sign-in still exists, so you can
retry."

## Step 5 — username availability is truthful

**5.1** As A, with the name claimed: check your own name → "That is your current username."

**5.2 — the cross-account case (your original bug).** Sign out, sign in as B, account pane,
type A's username, press **Check**. Expect:

> "test_alpha_1" belongs to another account. Please choose another.

It must **not** say the name looks free. Then reload and check again: still not free.

**5.3** In the create-account flow, claim a name that is already taken. Expect "already
taken by another account. Try another." — not "was taken a moment ago".

**5.4** A fresh unused name → "looks free. It is confirmed when you create the account."

**5.5** A reserved name (after any rename, or after a deletion) → "is reserved. Please
choose another."

**5.6 — released name (optional, consumes the name).** Firestore → `usernames/<name>` →
edit `reservedUntil` to a time in the past → in the app, check that name. Expect "was
released by its previous owner and can be claimed", and claiming it as B succeeds. Before
the edit it must have been refused.

## Step 6 — profile photo and crop (human only)

- Upload a **tall** photo, a **wide** photo and an **animated GIF**. Each opens the crop
  dialog.
- Drag, wheel, pinch, arrow keys, slider, reset. You cannot drag the photo away from the
  frame; no empty space ever appears inside it.
- Save → the header, the account panel and the profile hero all show the same square crop.
- The **GIF still animates** after saving (the bytes are never re-encoded).
- **Adjust crop** re-opens the dialog on the stored photo without re-uploading.
- **Remove photo** returns to the Google photo / default icon, and the crop record goes
  with it.
- Check one dark theme and one light theme for contrast, and a phone-width window for the
  bottom-sheet layout.

## Step 7 — the bigger live acceptance (separate session)

These need two devices and real data; export first. This mirrors items 1-9 of the live
acceptance list in [the roadmap](account-sync-roadmap.md#live-must-have-acceptance-checklist),
which stays the authoritative version:

- Settings → Backup & Data → **Test Drive checkpoint safety** → PASS on localhost, then a
  temporary file in Drive trash.
- Two devices: checkpoint on A, restore on B, edit both, quick save both → a conflict or
  two preserved copies, never a falsely reported overwrite.
- Offline: no false success, learning still available.
- Account switching A → B with autosave on: nothing uploads until you explicitly choose.
- After merge and deploy: repeat the Drive diagnostic on the production origin and the
  two-device test there.

## Already covered by `npm test` (no need to re-test by hand)

Availability cache ownership and the released-name semantics, sign-out cleanup in every
route (button, cancel, cross-tab, failed request), deletion (success, wrong password,
cancelled, partial failure, Google popup), cloud-document deletion, the disclosure
markup, rule cases for the new permissions, crop maths and clamping, and the integration
guards for assets, IDs and the service worker. The Firestore rule cases need Java and
were **not** run here: `npm run test:rules` on a machine with Java is the only way to
execute them.
