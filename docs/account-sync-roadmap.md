# Account, sign-in and cloud-save roadmap

This checklist tracks the agreed priorities. Checked items mean implemented and covered by automated tests, **not that live Google production behavior has been independently verified**. The app currently connects to Drive using browser OAuth. It does not have a permanent app-account database, password sign-up, or backend sessions.

## Must add: reliability and trust

- [x] **Clear account and save status**
    - Guest, connected, reconnect required, offline, working, unsaved changes and cloud-review states.
    - Last successful upload from this device is distinct from the last unchanged-data check.
    - Local fingerprint checks run about every 30 seconds; status is not instantaneous and does not promise background saving.
- [ ] **Verify checkpoints against real Google Drive**: live acceptance still pending.
    - [x] Add an opt-in diagnostic using a temporary non-learning-data file.
    - [x] Verify create/read/update/readback and attempt a stale-revision write; clean up the test file.
    - [x] Disable in-place updates for the tested account if the diagnostic fails.
    - [x] Mock-service regression tests for conditional writes and same-ID cloud changes.
    - [ ] Run the diagnostic on the deployed authorized origin with a real account.
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

The account popover now shows essential controls first, with collapsed Profile & device
and Save options & help sections. It is wider on desktop and a compact bottom sheet on
phones. Scrollbars remain available when needed (expanded controls, conflicts, or small
screens), using a thin theme-matched treatment rather than hiding accessible scrolling.

- [x] Editable display name/nickname, stored with the profile and included in backups (not globally unique).
- [x] Dedicated profile page: avatar, nickname, learning start date, stats and save controls.
- [x] Guided first-connection onboarding: local/cloud explanation and first checkpoint vs restore.
- [x] Debounced autosave after meaningful changes, grouped writes and exponential backoff (15-second quiet window, 5-second observation, retries from 15 seconds up to 5 minutes; respects server Retry-After).
- [x] Backup previews and editable labels such as “Before N4 reset”; app/backup version details.
- [x] Device labels such as Phone/Laptop on saves (not a secure session-management system).
- [ ] Explicit migration framework and full older-backup compatibility tests.
    - [x] Newer-version warning blocks both restore and automatic checkpoint creation instead of treating an unknown version as corruption.

## Could add: requires an account service

The frontend can remain on GitHub Pages; these features require a managed authentication/database service or secure backend. Evaluate current Firebase/Supabase capabilities and pricing before selecting one. Do not build custom password storage as a shortcut.

- [ ] Persistent app accounts across reloads; separate from expiring Google Drive authorization.
- [ ] GitHub sign-in as an alternative provider, paired with app-managed storage or separately connected Drive.
- [ ] Secure Google/GitHub account linking with explicit verified linking, never email-only automatic merging.
- [ ] Unique usernames with reservation, rename rules, uniqueness checks and abuse protections.
- [ ] Structured cross-device database sync with defined review/reset/deletion conflict rules.
- [ ] Account recovery, session list/revocation and safe provider unlinking that preserves a login method.

## Optional: nice extras

- [ ] Named save slots for separate learning journeys.
- [ ] Selective progress/settings/theme import and export.
- [ ] Encrypted export files, including lost-password/recovery warnings.
- [ ] Optional public profiles and shareable milestones.
- [ ] Passkeys supported by the selected account service.
- [ ] Email magic-link sign-in.
- [ ] Backup health reminders and storage-usage estimates.

## Current implementation notes

- The reported missing-header diagnostic was addressed without removing the overwrite guard. Most operations still use Drive v3; guarded checkpoint reads/updates use the v2 metadata `etag` and v2 conditional update endpoint. Same OAuth client, project and `drive.file` scope; no client secret or additional setup.
- First connection presents a choice between creating a first checkpoint, reviewing an existing cloud save, or keeping local data only. Automatic saving pauses until the choice is made; the preference is tracked per account on this device.
- History offers Preview and Label. Previews load validated progress/theme/version details without restoring; restore confirmations also include totals. Labels are limited to 24 characters, stored as metadata, and do not change snapshot contents or pin state.
- Save order uses the content-save timestamp; label and pin edits preserve it. Legacy files are given a saved timestamp when their metadata is first edited.
- Autosave batches observed app data/media changes, never opens consent popups, and still pauses offline, while hidden, during conflicts, and during account switching. Changed data is saved after 15 seconds without another observed change; cloud checks remain roughly once per minute when idle. Normal failure retries back off; explicit user actions can retry immediately.
- Dedicated profile page is implemented as an in-app `#profile` view, keeping Google access in memory. It includes avatar, nickname/device editing, recorded learning start date, progress/review stats, save controls and conflict/recovery navigation.
- Remaining Should work: a complete migration framework. Backend account features remain in Could.

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
- Updated metadata-ETag diagnostic: **pending a build-identified user rerun**. The repeated report used the older diagnostic wording, so it does not establish whether the current metadata test was running. The `profile-v1` build shows its runtime version and timestamps every fresh test; older saved results are not replayed as fresh errors. It reads `etag` from v2 file metadata, checks stability across the content read, and uses v2 conditional updates. Guarded overwrites require a PASS for this protocol and account; old test approvals do not count.
- Real two-device acceptance: **pending**.
- Automated regression suite: run `npm test`; service responses and browser DOM are simulated, with fake IndexedDB transaction tests.

## Profile-page acceptance checklist

- [x] Local/Google/custom nickname and avatar rendering, shared profile-edit validation, progress/review counts, and save actions have automated DOM/data tests.
- [x] Build marker, old diagnostic-history labelling, versioned asset references and deployment inclusion have automated coverage.
- [ ] Check the profile page on a phone and desktop in a real browser: native dialog focus, Escape/Back, photo/GIF upload, theme contrast, and responsive layout.
- [ ] Run the live Drive diagnostic while **Loaded app: profile-v1** is visible. A fresh result must start with `profile-v1 / metadata-etag-v1` and include its run timestamp.

Em dashes were removed from the authored site text and maintained source/docs. User
nicknames, imported data and generated third-party content are not rewritten.
