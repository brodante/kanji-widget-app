# Firestore progress sync: setup and verification

## Current status

The owner created the default Standard Firestore database in Singapore. That location is fine; there is no region setting to change in the browser code. Keep the Firebase project on Spark with no Cloud Billing account attached.

Implemented in this change:

- Google app sign-in opens access to a private progress document. No Drive permission is needed.
- First sync and account changes require an explicit choice before uploading this browser's data.
- Progress, recent kanji, SRS reviews, nickname and ordinary learning settings are included. Uploaded avatars, backgrounds, theme media and AI-specific settings stay local. API key/token/password fields are scrubbed from settings.
- After consent, changed data is coalesced into automatic saves at 30-second intervals while the page is visible, online and open. Unchanged data is not rewritten. Closing immediately can leave recent changes only on that device; use Save this device before switching devices.
- Each write checks the current server revision in a transaction. An older device cannot silently overwrite a newer save.
- Cloud changes are checked at startup, on reconnect, on focus after at least a minute, and every five minutes during active sync. New cloud revisions require review, not an automatic local overwrite.
- Restoring uses the existing recovery/rollback path and retains local media and AI data. Recovery failure blocks replacement.
- Pause autosave stops automatic saving on this browser. Local imports/restores invalidate sync approval. A cloud-copy download is a partial progress export and can be imported using the existing Import Backup control.
- Drive is under **Settings → Advanced: optional Google Drive backups**. It remains useful for full media backups. Enabling Firestore sync disables existing automatic Drive schedules on this device; explicit Drive backups still work.

This is ready for configuration and controlled testing, not a claim of verified production sync. The owner reports initial Firestore sync testing works. The detailed two-device, offline/reconnect and security-rule acceptance checks remain to be verified. App tests use a mock Firestore adapter. Emulator rule tests are included, but this sandbox could not run them because Java is unavailable and its Java download attempt was blocked.

## Next owner step: publish the rules

1. Open Firebase Console → **kanji-widgets → Build → Firestore Database**.
2. Select the **(default)** database and open the **Rules** tab.
3. Open [`firestore.rules`](../firestore.rules) from this repository.
4. Replace the entire editor contents with that file. Do not combine it with any `allow read, write: if true` rule.
5. Click **Publish**. If the console shows a syntax error, stop and send its exact text rather than relaxing the rules.

No collections need to be created manually. The first approved save creates:

```text
users/{Firebase Authentication UID}/sync/progress
```

The same rules file also covers the account layer added with email/username login:

```text
usernames/{lowercase username}   ownership, reservations and the published verified email
users/{Firebase Authentication UID}   account record (username mirror, rename timestamp)
```

`usernames/*` documents are readable one at a time and can never be listed; ownership
is decided by the first successful write. See
[Email, username and password sign-in](username-login-setup.md).

The app uses the UID, not an email address, to identify the owner. Each document contains `version`, `revision`, `payload` and a server-generated `updatedAt`. Rules allow only the signed-in owner to get/create/update that exact document, enforce the envelope and revision progression, and reject listing, deletion and all other paths. The payload is serialized JSON with client-side schema checks and a 350 KB client limit; rules validate its type/length but do not parse its internal JSON.

Do not enable test mode, public access, Firebase Storage, Cloud Functions or Blaze billing.

## Test with your own account first

Use the updated app, not an older deployed version. Changes on an Arena branch do not automatically publish to production; the Pages workflow deploys `main`.

1. Export a full local backup first using Settings → Create Local Backup.
2. Sign in with Google on the device containing the progress you want to keep.
3. Open the account menu. Under **Cloud progress**, choose **Check cloud**.
4. If this is the first save, choose **Save this device** and confirm the displayed account.
5. Check that it reports a successful save. In Firestore's Data tab, the UID's progress document should now exist.
6. Study one kanji, leave the app visible for at least 30 seconds, then check that the save status/revision updates. Reload the same device and confirm it resumes without asking for Drive permission.
7. Open another device or browser profile, sign in with the same Google account, and choose **Check cloud**. Choose **Use cloud progress**, not Save this device, to bring your existing progress to the new device.
8. Confirm that progress/reviews appear after the reload. Uploaded photos/backgrounds are deliberately not part of this transfer.

If access is denied, check that the rules were published in the same project and default database shown in `firebase-config.js`. Do not fix it by making the database public.

## Acceptance checklist before relying on it

- [ ] Signed-out and different-UID access is denied by rules tests.
- [ ] Owner create/read/update works and invalid/stale revision writes are rejected.
- [ ] First sign-in does not upload until consent; cancellation leaves cloud empty.
- [ ] Same-device reload resumes existing approved sync.
- [ ] Second device restores progress while retaining its own media and credentials.
- [ ] Both devices edit at once: one saves, the stale device pauses for review without overwriting it.
- [ ] Download both the local full backup and cloud partial copy before intentionally replacing a conflict.
- [ ] Go offline, learn, then reconnect. Local changes remain intact; if the cloud also changed, review is required.
- [ ] Sign out or switch accounts during a pending operation. No data is written to the newly selected account without consent.
- [ ] Pause autosave, import a backup and clear local data behaviors are checked.
- [ ] Verify desktop/mobile and the production origin after deployment.

Local progress is still shared by people using the same browser profile. Signing out does not erase it. Use separate browser profiles on shared devices; switching Google accounts is not a local privacy boundary.

## Automated testing

```bash
npm install
npm test
npm run lint
```

Security-rule tests require Node supported by Firebase CLI, **Java 21+** on PATH and internet access for the emulator download:

```bash
npm run test:rules
```

That command runs against the local emulator using **demo-kanji-widget**, never the live project. It tests anonymous and cross-user denial, owner access, revision checks, envelope validation, oversize rejection and denial of listing/deletion/other paths. Do not treat an unexecuted emulator suite as a passing security test.

## Cost and operational limits

This code does not link billing or create paid services. On Spark, quotas can still stop cloud availability. Local learning remains available; retry after the quota resets. Each changed automatic save normally reads one document and writes one document; transaction retries can add reads. Idle checks also consume reads, so this is quota-aware, not unlimited free usage. The design uses a single bounded document rather than continuous collection listeners or media uploads.

An oversized payload blocks sync with an export instruction; it does not discard local progress. There is no automatic background saving when the app is closed and no guaranteed merge of simultaneous edits. Choose which copy to keep explicitly.

The owner may also schedule a deletion: `users/{uid}` accepts two nullable fields,
`deletionRequestedAt` and `deletionScheduledFor`, which must be either absent/null or a
matching pair of timestamps where the deadline is later than the request. Nothing else about
the account record changed. **Publish the file again** after pulling this change, or
scheduling a deletion is refused (the app reports that nothing was changed).

The signed-in owner can delete their own progress document, but only through **Delete account** in
the sign-in dialog, which removes the whole account (sign-in, `users/{uid}` record, cloud progress
and the username) in one confirmed flow. There is no separate delete button for cloud progress, so
a stray click cannot drop the cloud copy while the account still exists: deleting the device's data
still leaves cloud data alone. The same rules change is what makes account deletion possible, so
account deletion fails closed with an honest error until the updated `firestore.rules` is published.

### What Check cloud does

Check cloud reads the current server copy, not an upload or restore. It shows a checking state and then a timestamped result: up to date, local changes waiting to save, no cloud save yet, or review needed. A manual check also shows a dismissible notice. It does not change local progress. Background checks use the inline status only, without interrupting learning.
