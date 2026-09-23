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
- Email confirmation: creating an account sends a Firebase verification link
  automatically, and the account pane can resend it or re-check after the link is
  opened. The app re-reads the account when the window regains focus, so no new
  sign-in is needed. Unconfirmed accounts keep learning and keep cloud saving; they
  simply cannot receive a password reset.
- Password resets for real mailboxes. Username-only accounts are told the truth: no
  mailbox is on file, so there is nothing to email. A recovery email can be added
  from Profile while signed in.
- Passwords, verification links and reset tokens are handled by the Firebase SDK.
  They are never written to localStorage, a backup file or cloud sync.
- A four-step strength meter (red, orange, yellow, green) and level wording appear while
  a password is typed. Length carries most of the score, so a long passphrase is not
  punished for having no symbols; anything under 8 characters is always "Weak".

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

## When sign-in fails

Firebase reports a terse code and the app maps the common ones to a plain sentence. If a
failure is not mapped, the message keeps the raw code in brackets, for example
`Sign-in is unavailable right now (auth/configuration-not-found). ...`, and the raw code
and SDK text are also written to the browser console as
`KanjiWidgets sign-in error: ...`. Use that code to identify the setup step:

| Code                                               | Meaning                                                                                                                                                                                                                                                                                                                                                                                                                             |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth/requests-from-referer-<origin>-are-blocked`  | The project's **browser API key** has HTTP referrer restrictions that do not include this origin. Google Cloud → APIs & Services → Credentials → the browser API key → Website restrictions → add `http://localhost:5000/*`, `https://kanji.qd.je/*` and any preview host, then wait a few minutes. This is a separate setting from the Google OAuth client's Authorized JavaScript origins and from Firebase's Authorized domains. |
| `auth/requests-to-this-api-...-are-blocked`        | The browser API key's **API restrictions** exclude Identity Toolkit. On the same Credentials page, allow Identity Toolkit API, Token Service API and Cloud Firestore API, or set API restrictions to “Don’t restrict key”.                                                                                                                                                                                                          |
| `auth/configuration-not-found`                     | The sign-in method is not enabled on the project, or the browser API key cannot reach Identity Toolkit. Enable Email/Password and Google under Authentication → Sign-in method.                                                                                                                                                                                                                                                     |
| `auth/internal-error`                              | The request was refused before it reached the provider. Usually HTTP referrer restrictions on the browser API key (Google Cloud → Credentials → Website restrictions) that do not list this origin, for example `http://localhost:5000/*`.                                                                                                                                                                                          |
| `auth/unauthorized-domain`                         | The hostname is missing from Authentication → Settings → Authorized domains. Add the hostname only, with no scheme or port.                                                                                                                                                                                                                                                                                                         |
| `auth/api-key-not-valid`                           | The Web API key in `firebase-config.js` is wrong, deleted or restricted away from this origin.                                                                                                                                                                                                                                                                                                                                      |
| `auth/operation-not-allowed`                       | The selected provider is disabled.                                                                                                                                                                                                                                                                                                                                                                                                  |
| `auth/operation-not-supported-in-this-environment` | An embedded preview or restricted browser blocked the popup or storage. Open the site in a normal tab.                                                                                                                                                                                                                                                                                                                              |

Adding `localhost` to Google Cloud **Authorized JavaScript origins** only covers the
Google popup. Password sign-in additionally needs the provider enabled and the origin
authorised in Firebase, and both flows need the browser API key to allow the origin.

## Email verification

- The link is sent by Firebase Authentication from `noreply@<project>.firebaseapp.com`
  the moment an account is created. Nothing has to be configured for it to work, but
  the sender name, subject and action URL can be edited in Authentication → Templates.
- Confirmation is deliberately **soft**: an unconfirmed account can study, keep local
  progress and sync to Firestore. Only password reset needs a confirmed mailbox.
- While the address is unconfirmed the account pane shows `Send confirmation link` and
  `I confirmed it, refresh`; both also appear in the account menu and on the Profile
  page. Returning to the window after opening the link refreshes the status
  automatically, throttled to once every five seconds.
- Username-only accounts have no mailbox, so nothing is sent and the account pane
  offers `Add a recovery email` instead. That address is confirmed with
  `verifyBeforeUpdateEmail` before it becomes usable, and only a confirmed address is
  written to the public `usernames` directory document.

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
- [ ] Create an account with a real email; confirm the link arrives on its own, that the
      app keeps working before it is confirmed, and that the badge flips to
      `email confirmed` once the link is opened and the window is focused again.
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
- The strength meter is guidance only. Firebase enforces its own minimum; there is no
  server-side length policy to enforce, and no CAPTCHA. Firebase rate-limits sign-in and reset
  attempts; App Check is a later option.
- Deleting an account is still a manual owner action in the Firebase Console. The app
  never deletes accounts.
- `signInWithEmailAndPassword` triggers the same Cloud Functions-less flow as before:
  no learning data is read or written by signing in.
