# Account, sign-in and cloud-save roadmap

This checklist tracks the agreed priorities. Checked items mean implemented and covered by automated tests, **not that live Google production behavior has been independently verified**. The app connects to Drive using browser OAuth. Persistent Firebase app sign-in is implemented with the owner’s public project configuration; Google sign-in has been confirmed working by the owner; Firestore verification is pending. App login does not renew Drive permissions. Firestore progress sync is implemented for controlled testing. Email/username + password sign-in with unique usernames is now implemented and needs the owner to enable the Email/Password provider and publish the updated rules; see [Email, username and password sign-in](username-login-setup.md).

## Current focus: Firebase Spark app sign-in

Other feature work is paused. See [the setup guide and phased plan](firebase-auth-setup.md).

- [x] Implement persistent Google app identity separately from Drive, with setup/error states and no learning-data writes on login.
- [x] Add account-menu/Profile controls, Google-photo fallback and mocked SDK regression coverage.
- [x] Owner supplied public Web config for `kanji-widgets`; added to the app.
- [x] Owner enabled Google sign-in and confirmed it works.
- [x] Owner created Firestore in Singapore. Keep the project on Spark without billing.
- [ ] Verify real sign-in, reload/browser-restart persistence, cross-tab sign-out and production/mobile behavior.
- [x] Implement bounded per-UID Firestore progress sync with first-sync consent, revision-checked transactions, paused conflicts and mandatory recovery before restore.
- [x] Move Drive controls into advanced optional backup settings. Add cloud status/actions to account, Profile and Settings.
- [x] Add owner-only rules and emulator test suite, plus mocked application tests.
- [ ] Run rule emulator tests: blocked in this sandbox by missing Java and network restrictions. Do not count these as passed.
- [ ] Owner publishes `firestore.rules`; verify real first save, two-device conflict, offline recovery and account switching using [the Firestore guide](firestore-sync-setup.md).

## Must add: reliability and trust

- [x] **Clear account and save status**
    - Guest, connected, reconnect required, offline, working, unsaved changes and cloud-review states.
    - Last successful upload from this device is distinct from the last unchanged-data check.
    - Local fingerprint checks run about every 30 seconds; status is not instantaneous and does not promise background saving.
- [ ] **Verify checkpoints against real Google Drive**: localhost diagnostic passed; production-origin and two-device acceptance remain.
    - [x] Add an opt-in diagnostic using a temporary non-learning-data file.
    - [x] Verify create/read/update/readback and attempt a stale-revision write; clean up the test file.
    - [x] Disable in-place updates for the tested account if the diagnostic fails.
    - [x] Mock-service regression tests for conditional writes and same-ID cloud changes.
    - [x] User ran the metadata-ETag diagnostic against real Drive on localhost: PASS, 2026-09-22T16:52:02.499Z.
    - [ ] Confirm the diagnostic on the deployed production origin.
    - [ ] Complete the two-device simultaneous-save/conflict acceptance test below.
- [x] **Recovery copy before restoring**
    - Save a full recovery snapshot in a separate IndexedDB store before local/cloud restore.
    - Fail closed if the recovery copy cannot be stored; do not restore anyway.
    - Undo last restore or download the recovery JSON from Settings.
    - Retain one recovery slot, exclude it from normal backups, preserve the local account-association marker on undo.
- [x] **Better conflict comparison**
    - This device vs cloud, cloud timestamp, studied/mastered totals, SRS entry count, theme, media count and differing saved sections.
    - Separate directly importable downloads for each version.
    - Explicit replace-not-merge confirmation and recovery copy before cloud restore.
- [x] **Protect manual backups from automatic cleanup**
    - Manual and legacy untyped backups are pinned by default.
    - Pin/unpin individual entries; unpin requires confirmation.
    - Retention counts only unpinned files. Pinned checkpoints are not overwritten by quick save.
    - Individual and bulk deletion explicitly warn about pinned files.
- [x] **Google account-switch protection**
    - Associate device data with the connected account; block both automatic and ordinary manual upload to a different account until explicitly chosen.
    - Offer that account's cloud copy or an explicit separate upload of the device copy.
    - Preserve data on disconnect; provide separately confirmed disconnect-and-clear-device.
    - Imported local files require an explicit account choice before subsequent upload.
- [x] **Actionable connection errors**
    - Offline/network, expired access, denied permission, quota/full storage, service failures and stale revisions have targeted instructions.
    - Origin-mismatch guidance is shown in Settings; Google's separate popup error cannot always be intercepted by this app.
    - Local learning remains available; failures never claim a successful upload.
- [x] **Privacy and data controls**
    - In-app explanation of local/cloud data, exclusions and lack of app encryption.
    - Full learning-data export, cloud-backup deletion, local-data deletion and Google revocation link are separate actions.
    - Bulk cloud deletion disables automatic saves, including on partial failure, and reports partial completion.

## Should add: everyday usability

The account popover now shows essential controls first, with a collapsed Save options &
help section, and it keeps only the two progress decisions (**Save this device**, **Use
cloud progress**) in the open. The device-versus-cloud comparison card and the counts line
are the profile page's job, so the popup does not lead with two progress summaries. It is wider on desktop and a compact bottom sheet on
phones. Scrollbars remain available when needed (expanded controls, conflicts, or small
screens), using a thin theme-matched treatment rather than hiding accessible scrolling.

- [x] Editable display name/nickname, stored with the profile and included in backups (not globally unique). Usernames are the unique, claimable identifier; nicknames stay free-form and local to the profile.
- [x] Dedicated profile page: avatar, nickname, learning start date, stats and save controls.
- [x] Guided first-connection onboarding: local/cloud explanation and first checkpoint vs restore.
- [x] Debounced autosave after meaningful changes, grouped writes and exponential backoff (15-second quiet window, 5-second observation, retries from 15 seconds up to 5 minutes; respects server Retry-After).
- [x] Backup previews and editable labels such as “Before N4 reset”; app/backup version details.
- [x] Device labels such as Phone/Laptop on saves (not a secure session-management system).
- [x] Explicit version handling and compatibility tests for the app’s known v1, v2 and v3 exports. Legacy imports are normalized to v3 and use the same recovery/restore path. Data absent from partial legacy exports is preserved.
    - [x] Newer-version warning blocks both restore and automatic checkpoint creation instead of treating an unknown version as corruption.
    - [x] Invalid legacy inputs are rejected before mutation; imported credentials are excluded, existing device keys are preserved, and recovery failures stop imports.

## Could add: requires an account service

The frontend can remain on GitHub Pages; these features require a managed authentication/database service or secure backend. Evaluate current Firebase/Supabase capabilities and pricing before selecting one. Do not build custom password storage as a shortcut.

- [x] Persistent app accounts across reloads; separate from expiring Google Drive authorization.
- [ ] GitHub sign-in as an alternative provider, paired with app-managed storage or separately connected Drive.
- [x] Secure account linking with explicit verified linking, never email-only automatic merging (Google ↔ password on one account).
- [x] Unique usernames with reservation, rename rules, uniqueness checks and abuse protections (30-day rename cooldown, 30-day reservation of the previous name, reserved-word list, live availability checks).
- [ ] Structured cross-device database sync with defined review/reset/deletion conflict rules.
- [x] Account recovery for real mailboxes (password reset + verification). Username-only accounts are told there is no mailbox and can add a recovery email.
- [x] Provider unlinking that preserves a login method: **Sign-in methods** in the account pane. Google goes only while a password remains, the password goes only while Google remains and after the current password is typed, and the last method is never removable. No rules change; the account record is re-published on the auth event, and Drive access is untouched.
- [ ] **Out of scope on Spark: session list, "sign out everywhere" and per-device revocation.** Revoking refresh tokens needs the Admin SDK or Cloud Functions, which need billing, so the app's honest scope is ending this device's session (including a sign-out announced by another tab). Revisit only if the project ever moves off Spark.

## Optional: nice extras

- [ ] Named save slots for separate learning journeys.
- [ ] Selective progress/settings/theme import and export.
- [ ] Encrypted export files, including lost-password/recovery warnings.
- [ ] Optional public profiles and shareable milestones.
- [ ] Passkeys supported by the selected account service.
- [ ] Email magic-link sign-in.
- [ ] Backup health reminders and storage-usage estimates.

## Manual verification

[The manual test plan](manual-test-plan.md) lists the browser checks step by step,
starting with publishing the updated rules, and says what is already covered by the
automated suite. Keep it in step with the features it describes.

## Account deletion

- [x] Offered in the sign-in dialog, the profile page and Settings → Danger Zone, all
      leading to the same flow.
- [x] **Scheduled, not instant**: a re-authenticated request writes a 7-day deadline to the
      account record, every device shows the same date, and **Cancel deletion** is one click
      away until then. **Delete now instead** keeps the immediate path.
- [x] Completion: username released as a reservation, account record and cloud progress
      deleted, sign-in deleted, then the sign-out identity cleanup. Local learning data and
      local backups are kept in both paths.
- [x] Confirmation email where Firebase can send one (real, unconfirmed address); accounts
      that cannot be emailed are told exactly why instead of being promised a message.
      A custom "deleted on <date>" email needs an owner-controlled mail service.
- [x] Deadline enforcement is client-side on the next use of the account, because Spark has
      no server timer. Documented rather than hidden.
- [x] Partial failures name the completed steps, keep the sign-in so a retry is possible,
      and never report success.
- [x] Rules: the owner may delete their own `users/{uid}` and their own progress document,
      and the account record accepts the two nullable deletion fields. Usernames stay
      non-deletable. **The owner must publish the updated `firestore.rules`.**
- [ ] Verify the live flow on a disposable account after publishing the rules, including a
      real confirmation email, a cancel, and a deadline that has passed.

## First sign-in on a new device

- [x] A device with no learning progress loads the cloud copy automatically and reports the
      gist it loaded.
- [x] A device with progress gets both copies side by side (kanji studied, mastered,
      reviews, due now, last session, cloud save date) and an explicit choice; nothing is
      replaced before that, and a recovery copy is saved first.
- [x] `Decide later` keeps both copies untouched.

## Sign-out identity cleanup

Signing out removes what identifies the previous account on this device: the uploaded
photo blob and its crop record, the nickname, the username mirror and the cached
availability answers. Learning progress, reviews, streaks, themes and local backups are
kept, because removing an account must never look like study data was destroyed. The
prompt and the one-line disclosure next to every sign-out button say this before it
happens, and the cleanup also runs when another tab announces the sign-out. Remote
Google/Drive photos stay hidden until the next signed-in session.

On a shared device the identity cleanup is not enough on its own: the next person can still
read the previous learner's progress, reviews and streak in the same browser profile. Each
sign-out button therefore also carries an unticked **Shared device: also erase the study
data stored here** box. Ticking it adds a second prompt that names everything deleted on
this device (progress, reviews, streak, settings and themes, photo and background, local
API keys, backups, recovery copy) and everything spared (the cloud copy, Google Drive). The
session ends first and the wipe second, so an autosave can never push empty progress into
the cloud copy; cancelling only the second prompt still signs out and keeps the data. The
wipe is the same code path as `Disconnect & clear this device`, which stays available in
Recovery & privacy.

## Profile photo cropping

Uploaded photos are cropped into a square before they are stored (`avatar-crop.js`,
`kanji_avatar_crop`). The crop is metadata applied with CSS, so GIFs keep animating and
original bytes stay in full backups. Add it to the manual list: upload a tall photo, a
wide photo and an animated GIF, adjust each crop, and confirm the header, account panel
and profile hero all match.

The two avatars that can change the photo — the profile hero avatar and the account
popup's avatar — cover themselves with a translucent white layer and a pencil on hover or
keyboard focus (a small corner pencil when there is no hover, so the photo is never
permanently washed out). The profile hero opens the file picker; the popup avatar opens the
profile page with the photo control focused. The small header icon carries no photo
affordance: it only opens the popup. The account popup itself keeps no upload, crop or
display-name controls, so it does not scroll for a few lines of form at phone widths.

Cancelling the file chooser is a first-class case: a file input dispatches its own bubbling
`cancel` event when the picker is dismissed, so both dialogs ignore any `cancel` whose
target is not the dialog itself. Without that guard the event reached the profile page's
Escape handler and closed the page, dropping the learner on the main screen.

`Remove photo` keeps an immediate, in-memory undo: the removed bytes and crop come back in
one click, and nothing is written to storage, so a reload, another upload, a sign-out or a
different account ends the undo for good. On a shared device the bytes must not stay
recoverable after the session that owned them.

## Current implementation notes

- The reported missing-header diagnostic was addressed without removing the overwrite guard. Most operations still use Drive v3; guarded checkpoint reads/updates use the v2 metadata `etag` and v2 conditional update endpoint. Same OAuth client, project and `drive.file` scope; no client secret or additional setup.
- First connection presents a choice between creating a first checkpoint, reviewing an existing cloud save, or keeping local data only. Automatic saving pauses until the choice is made; the preference is tracked per account on this device.
- History offers Preview and Label. Previews load validated progress/theme/version details without restoring; restore confirmations also include totals. Labels are limited to 24 characters, stored as metadata, and do not change snapshot contents or pin state.
- Save order uses the content-save timestamp; label and pin edits preserve it. Legacy files are given a saved timestamp when their metadata is first edited.
- Autosave batches observed app data/media changes, never opens consent popups, and still pauses offline, while hidden, during conflicts, and during account switching. Changed data is saved after 15 seconds without another observed change; cloud checks remain roughly once per minute when idle. Normal failure retries back off; explicit user actions can retry immediately.
- Dedicated profile page is implemented as an in-app `#profile` view, keeping Google access in memory. It includes avatar, nickname/device editing, recorded learning start date, progress/review stats, save controls and conflict/recovery navigation.
- Account labels never expose the private alias address a username account signs in with, and an account without a Google provider is never labelled as a Google account: with no display name, the heading shows `@username` and the line under it says the account keeps no mailbox.
- The profile page owns the display name and every photo action; the account popup only shows them. Account creation therefore asks for email, username and password, takes the display name from the stored profile, and needs no consent tick-box: an auth change never writes progress, and the first save still shows both copies and asks which to keep.
- All listed Should items are implemented for the existing app and its known backup formats. No new backend or optional account features are being added in this pass. Future backup schema changes will need their own migration step and tests.
- Settings now has an always-visible My profile entry and shortcuts for Learning, Appearance, Audio, AI Sensei, Backups & sync, and Recovery & privacy. Shortcuts scroll/focus existing sections rather than duplicating their controls.

## Live must-have acceptance checklist

Use disposable/test progress and export your real data before testing. Update both devices first.

1. Deploy this branch through the normal Pages process. Confirm your exact HTTPS origin is authorized in Google Console.
2. Connect Google → Settings → Backup & Data → **Recovery, privacy & connection help** → **Test Drive checkpoint safety**. Expect PASS, then confirm the temporary diagnostic file is in Drive trash. A failed test should clearly report why; don't mark live verification done on a failure.
3. Create a checkpoint from device A. Restore it on B, reconnect, and change progress on A. Quick save A; quick save B must identify the changed cloud contents even if the file ID stayed the same.
4. Edit both devices. Confirm comparison totals and that local data is not silently replaced. Download both copies, then choose one. Repeat saving nearly simultaneously; verify conflicts or separate preserved copies, never a falsely reported safe overwrite.
5. Restore an older backup, change some data, then **Undo last restore**. Confirm progress, settings and uploaded media return to the pre-restore state. Undo intentionally discards post-restore edits. Simulate full/unavailable browser storage and confirm restore stops before mutation.
6. Pin a manual snapshot, set retention to five, create more than five unpinned checkpoints; verify the pinned file survives and only excess unpinned files are trashed.
7. Switch from Google account A to B with autosync enabled. Confirm no local learning data is uploaded until explicitly choosing B's cloud data or saving this device's copy.
8. On a disposable account/browser profile, test disconnect, export, cloud deletion (including a pinned file), and disconnect-and-clear-device separately. Confirm unrelated Drive files and browser storage are untouched. Revoke access in Google Account settings and verify reconnect instructions.
9. Reconnect/check an unchanged save: **last successful upload** must not advance. Test offline and expired access: no false success, local learning still available.

Record live results here (date, browser/device, pass/fail and relevant error text). Never record credentials or access tokens.

- Previous header-based Drive diagnostic: **user ran it and reported NOT VERIFIED: no usable revision token/readback**. This is not a successful live verification.
- Updated metadata-ETag diagnostic: **PASS, user-reported**, on `http://localhost:5000`, build `profile-v1` (later reported as `login-v1` after the username-login release), protocol `metadata-etag-v1`, at `2026-09-22T16:52:02.499Z`. Create, read, update and stale-revision rejection succeeded on a real Google account. No account email or credentials are recorded here.
- Real two-device acceptance: **pending**.
- Automated regression suite: run `npm test`; service responses and browser DOM are simulated, with fake IndexedDB transaction tests.

## Profile-page acceptance checklist

- [x] Local/Google/custom nickname and avatar rendering, shared profile-edit validation, progress/review counts, and save actions have automated DOM/data tests.
- [x] Build marker, old diagnostic-history labelling, versioned asset references and deployment inclusion have automated coverage.
- [ ] Check the profile page on a phone and desktop in a real browser: native dialog focus, Escape/Back, photo/GIF upload, theme contrast, and responsive layout.
- [x] User supplied a successful build-identified Drive diagnostic from localhost. Production-origin confirmation remains in the live acceptance list above.

Em dashes were removed from the authored site text and maintained source/docs. User
nicknames, imported data and generated third-party content are not rewritten.

## Feedback and action clarity

- [x] Check cloud shows a checking state, explicit up-to-date/unsaved/no-save/review result and a check timestamp. Manual checks show a dismissible notice; background checks stay quiet.
- [x] Sign-out, delete/reset and replacement actions use a vermilion wave pattern without changing sign-in styling.
- [x] Photo validation and manual operation failures have persistent accessible alerts with a subtle card shake (disabled for reduced-motion users).
- [x] Profile has a compact Remove DP control, available only for an uploaded photo. Confirmation removes only the local avatar and falls back to the Google photo/default icon; existing backups are unchanged.
- [x] Owner reports Firestore sync working during initial testing. The detailed two-device/security-rule acceptance checklist remains separate and is not inferred from that report.

## Live-main integration

- [x] Merge GitHub `main` at `2d3c6ba` into this branch, preserving the new Firebase, Drive, profile and feedback work.
- [x] Restore Snap, Guide, Redo, reference matching, animated correction, thickness easing and Japanese practice feedback.
- [x] Restore single-owner event wiring, new-canvas listener binding, same-kanji stroke preservation, async reference guards and remembered Practice mode.
- [x] Restore Recent-card styling across Midnight, Nami, Lumen, Obake and Ito.
- [x] Restore drawing-pad precaching, CODEOWNERS, CNAME and practice regression tests. Copy CNAME into the deployment artifact as well.
- [x] Run main's practice suite as part of `npm test` and CI, alongside the account/sync tests. CI uses Node 22 for main's JSDOM version.
- [x] Add integration guards for both sets of controls, unique DOM IDs, theme styles, cache/deploy assets and CI coverage.
- [ ] User browser acceptance of the combined Practice/account experience. Real Firebase/Drive acceptance and rule-emulator verification remain separate from these automated tests.

No PR is opened by this integration. The live site is not deployed from this working branch.

## Email/username login release

Implemented in the login-management work; see [the setup and limits guide](username-login-setup.md).

- One `#authDialog` carries Sign in, Create account and account management panes. Both
  existing sign-in entry points open it instead of jumping straight to a Google popup.
- Password accounts sign in with an email or their unique username. Username-only
  accounts use a private alias address (`users.kanji.qd.je`), so no email lookup is
  needed on the client and no mailbox is stored anywhere.
- `username-policy.js` holds every rule (3–20 characters, lowercase `a–z 0–9 _`,
  single underscores, reserved words, suggestions). `username-directory.js` talks to
  Firestore: availability reads, reservations, renames, the published verified email
  and the local handle mirror (`kanji_handle_v1`, never backed up or synced).
- `firestore.rules` adds `usernames/{name}` (public single-document reads, no listing,
  create-only claim, release/claim-after-expiry updates) and `users/{uid}` account
  records. Progress-sync rules are untouched.
- The offline cache is `kanji-widgets-v19`, the diagnostic build marker is
  `login-v1`, and the deploy workflow copies the three new scripts.
- `test/test-username-login.js` covers the policy, AppAuth, the directory and the
  dialog; `test/test-main-integration.js` guards the wiring. Username rule tests were
  added to `test/test-firestore-rules.js` but not executed here (no Java), so
  `npm run test:rules` still needs a real run.
- Owner actions pending: enable the Email/Password provider with email link off,
  publish the updated rules, and walk the manual checklist in the setup guide.
