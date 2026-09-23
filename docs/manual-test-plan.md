# Manual test plan: accounts, sign-out, deletion and first sign-in

Only what a browser can verify is in here. The automated suite (`npm test`, 198 tests)
already covers the logic, the edge cases and the exact strings; this plan checks the real
thing in a real browser, which no test in this repo can do.

Report every failure with: **step number, browser and version, the exact on-screen text,
the console output, and a screenshot**. Never paste passwords, tokens or account emails.

## Before you start

- Serve locally: `npm start` → <http://localhost:5000>.
- Kill stale service-worker copies: DevTools (F12) → **Application** → **Service
  Workers** → tick **Update on reload**, then reload once.
- Have two disposable accounts ready (A and B) and one free username each, e.g.
  `test_alpha_1` and `test_beta_2`.
- Keep the DevTools console open. "No console errors" is expected in every step below.

## Step 0 — publish the rules (blocks Steps 4 and 5)

The rules changed twice since you last published: the owner may delete their own
`users/{uid}` and their own progress document, and the account record now accepts the two
nullable deletion fields (`deletionRequestedAt`, `deletionScheduledFor`). Usernames are
still never deletable, listing stays denied, no new path became writable.

- **Console route**: Firebase Console → `kanji-widgets` → Firestore Database → **Rules**
  → paste the whole of [`firestore.rules`](../firestore.rules) → **Publish**.
- **CLI route**: `firebase deploy --only firestore:rules` (needs `firebase login`;
  `firebase.json` already points at the file).

Without this, scheduling a deletion is refused and the app reports that nothing changed —
which is the honest failure, not a bug.

## Step 1 — preflight

- The app loads, no console errors, a widget still works: open one, grade a card, see the
  next one.
- DevTools → **Sources** → `app-auth.js` → search `SCHEDULE_CONFIRM`. If it is not there,
  the browser is still running a cached copy and nothing below can pass.

## Step 2 — favicon

- `git status` shows `favicon.gif` tracked. If it is untracked: `git add favicon.gif &&
git commit -m "Add favicon"`.
- Reload → your icon is in the tab. DevTools → **Network** → `/favicon.gif` returns
  **200**, not 404.
- Chrome/Edge/Firefox animate it; Safari and iOS show the first frame only (expected).
- After this branch reaches the site: the same check on <https://kanji.qd.je>.

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

## Step 4 — deleting an account (7-day schedule)

Do this on the disposable account A **after** Step 0. You should see **Delete account** in
three places: the sign-in dialog (account pane), the profile page, and Settings → Danger
Zone. All three open the same card.

**4.1 — the three entry points.** Check each one opens the dialog's account pane with the
delete card visible. When signed out, the buttons and the status line must be hidden.

**4.2 — dismissing changes nothing.** Click **Delete account** → **Cancel** in the prompt.
Expect "Nothing was removed and nothing was scheduled." and everything intact.

**4.3 — wrong password.** Try again with a deliberately wrong password. Expect "That
password did not match, so nothing was deleted." Still signed in, photo and username
intact, no Firestore write.

**4.4 — schedule it.** Right password → **OK**. Expected prompt:

> Delete this account? … It is scheduled for permanent deletion in 7 days, on <date>.
> Until then you can cancel it by signing in and pressing Cancel deletion. … Deleted then:
> the sign-in itself, the account record, the cloud copy of your progress, and your
> username (claimable again after the usual 30 days). Kept: the kanji progress, reviews,
> themes and backups stored on this device.

Then the status says the account is **scheduled**, and:

- The email note matches reality: unverified real address → "A confirmation link was
  emailed to …"; already-confirmed address → "No new email was sent: … is already
  confirmed."; username-only account → "no mailbox".
- You stay signed in: nothing is deleted yet, and the account still works.
- **Cancel deletion** appears in all three places, and the profile page and Danger Zone
  both show the date with the days left.
- Firestore → `users/{uid}` now has `deletionRequestedAt` and `deletionScheduledFor`
  about 7 days apart, and nothing else about the account changed.

**4.5 — cancel it.** Press **Cancel deletion** (confirm the prompt). Expect the two fields
to read `null` in Firestore, the status line to fall back to the normal text, and everything
to keep working. The username is still yours.

**4.6 — back on, then deadline.** Schedule again, then in Firestore edit
`deletionScheduledFor` to a time in the past. Reload the app and sign in as A. Expect a
notice that the scheduled 7 days passed and the account was deleted now, and:
`users/{uid}` and `users/{uid}/sync/progress` gone, `usernames/<name>` now
`kind: "reserved"` with `uid: ""` and a future `reservedUntil`, and your local progress
untouched.

**4.7 — delete now instead.** Schedule with a third disposable account, then press **Delete
now instead** and confirm the "cannot be undone" prompt. The account disappears immediately
with the same cleanup, and the old credentials stop working.

**4.8 — partial failure.** Covered by automated tests; skip live.

## Step 5 — first sign-in on a new vs. used device

This is the flow you asked for, so test both halves in separate browser profiles.

**5.1 — a clean profile.** Use a fresh browser profile (or a private window with no data).
Sign in as A. Expect the app to **load the cloud copy by itself** — no question, no button
press — and to say "Cloud progress loaded on this fresh device: <n> kanji studied, <n>
mastered, <n> reviews · last studied <date>". The widget should show the cloud progress.

**5.2 — a used device.** In your normal profile (which has local progress) sign in as the
**other** account, or restore a local backup so the device has different progress from the
cloud copy. Expect, right after sign-in:

- The **comparison card** in the account panel (and the profile page): "This device: …" and
  "Cloud copy: …", each with kanji studied, mastered, reviews, due now, and the last session
  date. The cloud side also shows when it was saved.
- The message: "This device already has progress, and so does the account. Compare the two
  below, then choose which copy to keep. Nothing is replaced until you choose."
- Three buttons: **Load cloud progress**, **Keep this device's progress**, **Decide later**.

**5.3 — nothing moves until you choose.** Click **Decide later** → the card hides, the local
progress is unchanged, and no cloud write happened (check the revision in Firestore is
unchanged).

**5.4 — load the cloud copy.** Re-open the comparison (**Check cloud**), then press **Load
cloud progress** → confirm the prompt, which repeats both gists. Expect the local progress
to match the cloud numbers, the message about what was loaded, and a recovery copy in
Settings → Recovery & privacy (**Download recovery copy** should return the pre-load state).

**5.5 — keep this device.** Repeat 5.2, then press **Keep this device's progress** → confirm
the prompt. Expect the cloud revision to increase by one, the upload to include this
device's numbers, and the card to disappear.

**5.6 — settings-only device.** A profile with a theme but no learning progress counts as
clean: it should auto-load without asking. If you disagree with that, say so — it is a
one-line change.

## Step 6 — username availability is truthful

**6.1** As A, with the name claimed: check your own name → "That is your current username."

**6.2 — the cross-account case (your original bug).** Sign out, sign in as B, account pane,
type A's username, press **Check**. Expect:

> "test_alpha_1" belongs to another account. Please choose another.

It must **not** say the name looks free. Then reload and check again: still not free.

**6.3** In the create-account flow, claim a name that is already taken. Expect "already
taken by another account. Try another." — not "was taken a moment ago".

**6.4** A fresh unused name → "looks free. It is confirmed when you create the account."

**6.5** A reserved name (after any rename, or after a deletion) → "is reserved. Please
choose another."

**6.6 — released name (optional, consumes the name).** Firestore → `usernames/<name>` →
edit `reservedUntil` to a time in the past → in the app, check that name. Expect "was
released by its previous owner and can be claimed", and claiming it as B succeeds.

## Step 7 — profile photo and crop (human only)

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

## Step 8 — the bigger live acceptance (separate session)

These need two devices and real data; export first. This mirrors items 1-9 of the live
acceptance list in [the roadmap](account-sync-roadmap.md#live-must-have-acceptance-checklist),
which stays the authoritative version:

- Settings → Backup & Data → **Test Drive checkpoint safety** → PASS on localhost, then a
  temporary file in Drive trash. This is the step that used to end in "cloud backup
  detected…" with no clear next move, so check the wording now.
- Two devices: checkpoint on A, restore on B, edit both, quick save both → a conflict or
  two preserved copies, never a falsely reported overwrite.
- Offline: no false success, learning still available.
- Account switching A → B with autosave on: nothing uploads until you explicitly choose.
- After merge and deploy: repeat the Drive diagnostic on the production origin and the
  two-device test there.

## Already covered by `npm test` (no need to re-test by hand)

Availability cache ownership and the released-name semantics, sign-out cleanup in every
route (button, cancel, cross-tab, failed request), deletion (schedule, cancel, overdue,
immediate, wrong password, partial failure, Google popup), the deletion state shown in all
three places, cloud-document deletion, first sign-in (auto-load, the comparison, Decide
later), the disclosure markup, rule cases for the permissions and the deletion fields, crop
maths and clamping, and the integration guards for assets, IDs and the service worker. The
Firestore rule cases need Java and were **not** run here: `npm run test:rules` on a machine
with Java is the only way to execute them.
