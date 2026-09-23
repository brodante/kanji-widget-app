# Email, username and password sign-in: setup and limits

## What is ready

KanjiWidgets now signs people in with a private password or with Google, in one dialog
opened from the account menu and the Profile page.

- Email + password sign-in and account creation through Firebase Authentication.
- Unique usernames with live availability feedback, suggestions and a reservation
  document that is the only authority on ownership.
- Username sign-in: the identifier is turned into a private alias address, so the
  browser never has to look an email up to sign someone in.
- Google linking on an existing account, and `Add a password` for Google accounts.
  Emails are never merged automatically: linking writes to the one account the user
  is already signed into.
- Password resets for real mailboxes. Username-only accounts are told the truth: no
  mailbox is on file, so there is nothing to email. A recovery email can be added
  from Profile while signed in.
- Passwords, verification links and reset tokens are handled by the Firebase SDK.
  They are never written to localStorage, a backup file or cloud sync.

Firestore layout (all client writes are checked by `firestore.rules`):

```text
usernames/{lowercase-username}   uid, display, kind('user'|'reserved'), email,
                                 createdAt, updatedAt, reservedUntil, releasedAt
users/{uid}                      uid, username, display, email, renamedAt
users/{uid}/sync/progress        version, revision, payload, updatedAt (unchanged)
```

Rules facts worth remembering:

- `usernames/*` documents are readable one at a time by anyone (that is what makes
  an availability check possible) and can never be listed. The directory cannot be
  harvested, and a name cannot be taken by writing over someone else's document.
- The first writer owns a name; a rename turns the old name into a 30-day
  reservation (`kind: 'reserved'`, `uid: ''`) that anyone may claim once
  `reservedUntil` has passed.
- `users/{uid}` documents are owner-only and cannot be deleted by a client.
- The existing progress-sync rules are unchanged.

## Owner setup steps

1. **Firebase Console → Authentication → Sign-in method**.
    - Enable **Email/Password**. Leave **Email link (passwordless sign-in)** disabled.
    - Leave Google enabled.
2. **Firestore Database → Rules**: replace the editor contents with the repository's
   [`firestore.rules`](../firestore.rules) and publish. Do not combine it with
   `allow read, write: if true`.
3. Keep the project on **Spark** without billing. No Cloud Functions, no Storage, no
   custom backend is used by this feature.
4. No new authorized domains are needed: sign-in still runs on the existing
   hostnames (`localhost`, `kanji.qd.je`, and any preview host you test on).

The alias domain for username-only accounts is `users.kanji.qd.je`. It is a private,
non-deliverable address shape that only Firebase Authentication ever sees. Never
configure it as a real mailbox, and never add a catch-all that forwards it.

## What the automated tests cover

`npm test` runs `test/test-username-login.js` along with the existing suites. It
checks username normalisation, validation and suggestions, alias consistency between
`UsernamePolicy` and `AppAuth`, password sign-in and creation, honest reset handling,
linking, verification, availability caching and throttling, reservation and rename
behaviour including the cooldown, handle mirroring, the dialog's panes and validation,
and the guarantee that no credential reaches backups or cloud sync.

## What still needs a human

These cannot be verified in a sandbox and must be checked on a real project:

- [ ] Enable the Email/Password provider and publish the updated rules.
- [ ] Create an account with a real email; confirm the verification link arrives and
      the app keeps working before it is confirmed.
- [ ] Reload and restart the browser: the session must persist on the same hostname.
- [ ] Sign in with a username and its password on a second device or browser profile.
- [ ] Try a username that is already taken; the dialog must say so before submission
      and again if it is taken at the last moment.
- [ ] Rename a username, then confirm the previous name is reserved and cannot be
      claimed by another account until the reservation lapses.
- [ ] Confirm a Google account can add a password and then sign in with it, and that
      an email account can link Google.
- [ ] Reset a password for an email account; confirm a username-only account is told
      there is no mailbox.
- [ ] Confirm local progress is untouched by every one of these actions, and that
      cloud saving still asks before it uploads.
- [ ] `npm run test:rules` with the Firestore emulator (needs Java 21+). The username
      rules tests in `test/test-firestore-rules.js` were written for this change but
      have not been executed in the authoring sandbox.

## Known limits

- Client-side availability checks are user experience only. Ownership is enforced by
  security rules, so a stale check can only end in "taken a moment ago", never in a
  duplicate name.
- The reservation length is declared by the client. Rules require a future
  `reservedUntil` but cannot compute "exactly 30 days"; the app always writes 30 days.
- Anonymous directory reads mean a username's existence is discoverable by anyone who
  guesses it. `list` is denied, so it cannot be enumerated in bulk.
  Owners who do not want their email discoverable simply keep a username-only
  account: the published address is written only after it is verified and is removed
  when the account switches to an alias.
- There is no server, so there is no server-side password-length policy beyond
  Firebase's own minimum, and no CAPTCHA. Firebase rate-limits sign-in and reset
  attempts; App Check is a later option.
- Deleting an account is still a manual owner action in the Firebase Console. The app
  never deletes accounts.
- `signInWithEmailAndPassword` triggers the same Cloud Functions-less flow as before:
  no learning data is read or written by signing in.
