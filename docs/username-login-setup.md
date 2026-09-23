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

| Code                                               | Meaning                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `auth/requests-from-referer-<origin>-are-blocked`  | The project's **browser API key** has HTTP referrer restrictions that do not include this origin. First open the **kanji-widgets** project (the Drive backup project holds no Firebase keys): Google Cloud → APIs & Services → Credentials → the key named `Browser key (auto created by Firebase)` → Application restrictions → Website restrictions (HTTP referrers) → add `http://localhost:5000/*`, `http://localhost/*`, `https://kanji.qd.je/*` and any preview host, then wait a few minutes. This is a separate setting from the Google OAuth client's Authorized JavaScript origins and from Firebase's Authorized domains. |
| `auth/requests-to-this-api-...-are-blocked`        | The browser API key's **API restrictions** exclude Identity Toolkit. On the same Credentials page, allow Identity Toolkit API, Token Service API and Cloud Firestore API, or set API restrictions to “Don’t restrict key”.                                                                                                                                                                                                                                                                                                                                                                                                           |
| `auth/configuration-not-found`                     | The sign-in method is not enabled on the project, or the browser API key cannot reach Identity Toolkit. Enable Email/Password and Google under Authentication → Sign-in method.                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `auth/internal-error`                              | The request was refused before it reached the provider. Usually HTTP referrer restrictions on the browser API key (Google Cloud → Credentials → Website restrictions) that do not list this origin, for example `http://localhost:5000/*`.                                                                                                                                                                                                                                                                                                                                                                                           |
| `auth/unauthorized-domain`                         | The hostname is missing from Authentication → Settings → Authorized domains. Add the hostname only, with no scheme or port.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `auth/api-key-not-valid`                           | The Web API key in `firebase-config.js` is wrong, deleted or restricted away from this origin.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `auth/operation-not-allowed`                       | The selected provider is disabled.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `auth/operation-not-supported-in-this-environment` | An embedded preview or restricted browser blocked the popup or storage. Open the site in a normal tab.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

Only the Cloud project that holds the Firebase app has the browser key. The Drive
backup OAuth client usually lives in a different project, so editing that project's
credentials has no effect on sign-in. Switch the project picker to `kanji-widgets`
first: `https://console.cloud.google.com/apis/credentials?project=kanji-widgets`.

Adding `localhost` to Google Cloud **Authorized JavaScript origins** only covers the
Google popup. Password sign-in additionally needs the provider enabled and the origin
authorised in Firebase, and both flows need the browser API key to allow the origin.

## Profile photos

Uploading a photo opens a crop dialog before anything is saved:

- The preview is a real square frame, so what you see is what appears in the header,
  the account panel and the profile hero.
- Drag to move, wheel or pinch to zoom, arrow keys to nudge, `+`/`-` or the slider for
  zoom, `r` to reset. Panning is clamped to the photo, so a crop can never show empty
  space.
- The crop is stored as a small record (`kanji_avatar_crop` in localStorage: centre
  point, zoom and aspect ratio) and applied with CSS transforms. The image bytes are
  never re-encoded, which keeps animated GIFs animating and keeps the original file in
  full backups.
- `Adjust crop` (account panel and profile page) re-opens the dialog on the stored
  photo without re-uploading it. Removing the photo removes the crop with it.
- Full backups carry the crop record so a restore looks identical. Firestore progress
  sync deliberately does not: it never carried media.

## Signing out

Signing out ends the Firebase session and takes the visible identity with it: the
uploaded photo (blob and crop record), the nickname, the username mirror and the
remembered availability answers. That matters on a shared device, where a leftover
photo next to "local account" reads as someone else still being signed in.

- The prompt names what goes and what stays before anything is removed; dismissing it
  changes nothing. Each sign-out button also carries the same one-line disclosure.
- The cleanup runs for every route out of the session, not just the button: a sign-out
  announced by another open tab (Firebase syncs sessions per browser profile) clears
  this tab too, and says so in the status line.
- Deleting the stored photo is deliberate: it is the only way a reload can't resurrect
  it, because the photo is loaded from browser storage without checking an account on
  start-up. Export a full backup first if the photo matters, or upload it again after
  signing back in.

What signing out deliberately keeps: kanji progress, review history, streaks, themes
and local backups. Removing an account must never look like it destroyed study data,
and signing in never silently claims local data either. Drive keeps its own separate
`Disconnect` action, so a sign-out does not revoke Drive access; remote (Google/Drive)
photos stay hidden until the next sign-in so the panel can't show a face that does not
belong to a signed-in account. On a shared device, `Recovery & privacy → Disconnect &
clear this device` is the separate, explicitly confirmed action that also removes local
study data.

Signing out of every device at once is not possible on the Spark plan: revoking refresh
tokens needs the Admin SDK or Cloud Functions, which require billing. The honest scope
is ending this device's session.

## Deleting an account

**Delete account** is offered in three places that all lead to the same flow, so the account
is never something you have to hunt for: the sign-in dialog's account pane, the profile
page, and Settings → Danger Zone.

Asking to delete **schedules** it, it does not delete anything on the spot:

1. **Confirm it is you.** Password accounts re-enter the password; Google-only accounts get
   the Google popup. A failed check removes nothing.
2. **A 7-day deadline** is written to the account record (`users/{uid}`:
   `deletionRequestedAt`, `deletionScheduledFor`), so every device shows the same date.
3. **A confirmation email** is sent when the account has a real, unconfirmed address. See
   the limits below; the app says exactly which of these applied rather than promising an
   email it did not send.
4. Until the deadline the account works normally and the pending state is shown in all
   three places, with **Cancel deletion** one click away. Cancelling clears both fields and
   changes nothing else.
5. **At the deadline the deletion completes** the next time the account touches the app:
   the username becomes a reservation (as with a rename, so it cannot be sniped), the
   account record and the cloud copy of the progress are deleted, the sign-in is deleted,
   and the usual sign-out identity cleanup runs.

**Delete now instead** stays available for anyone who wants it gone immediately, with the
older confirmation that spells out that it cannot be undone.

Kept on purpose in both paths: kanji progress, reviews, streaks, themes and local backups
on this device. `Disconnect & clear this device` remains the separate action for local
study data.

### What the confirmation email can and cannot be on Spark

Firebase can only send its own templates, and only Cloud Functions (which need billing) can
send arbitrary mail. So:

- A real, unconfirmed address gets the standard **verification link**. It proves control of
  the mailbox, and its continue URL returns the learner to the app.
- An address that is **already confirmed** gets no email, and the app says so: sending
  another verification link would either do nothing or confuse the reader.
- A **username-only account has no mailbox at all**, and is told that instead.

A custom "your account will be deleted on <date>, click here to cancel" message needs a
mail service the owner controls (an external provider or a small serverless endpoint), or a
move off the free plan. Nothing in the app pretends otherwise.

### Why the deadline is enforced by the app, not a server

There is no server timer on Spark. The schedule is stored on the account record, which is
the honest place for it: it is visible to every device and to the app on the next sign-in,
and an overdue schedule completes immediately at that point. Until the account is used
again the sign-in still exists, which is the one thing a client-only design cannot avoid.

### Rules

The account record's allowed keys gained `deletionRequestedAt` and `deletionScheduledFor`.
Both must be absent, null, or a matching pair of timestamps where the deadline is later than
the request; anything else is rejected. **Publish the updated `firestore.rules`** before
testing this: without it, scheduling is refused and the app reports that nothing was
changed.

## First sign-in on a device

What happens straight after signing in depends on what the device already has, and it never
replaces progress without an answer:

- **A device with no learning progress** loads the cloud copy on its own and says what it
  loaded ("Cloud progress loaded on this fresh device: 42 kanji studied, 18 mastered, 96
  reviews · last studied 12 September 2026"). There is nothing local to lose, so there is
  nothing to ask about.
- **A device that already has progress** gets both copies side by side, in plain numbers:
  kanji studied, mastered, reviews, cards due now, and the date of the last session, plus
  when the cloud copy was saved. Nothing is replaced until a choice is made, and every
  replacement saves a local recovery copy first.
- The two answers are **Load cloud progress** (replaces this device's, after the recovery
  copy) and **Keep this device's progress** (replaces the cloud copy, also after a recovery
  copy). **Decide later** hides the comparison and keeps both copies exactly as they are.

The comparison also appears when **Check cloud** is pressed in that state, and the same two
gists are repeated in the confirmation text of each action, so the numbers are never a
surprise. Uploaded media, API keys and AI credentials are excluded from cloud progress and
stay on the device either way.

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

### When the key page warns about "active usage"

Google shows _Warning: Potential breakage due to active usage_ when the key being
restricted is also used by **other** products. In this project that warning can list
Google Maps backends (`geocoding-backend`, `places-backend`, `directions-backend`, …).

KanjiWidgets uses no Maps services: its Google traffic is Firebase Authentication
(`identitytoolkit.googleapis.com`, `securetoken.googleapis.com`), Cloud Firestore and
Firebase Installations, all of which send a browser `Referer` and therefore keep working
under a website restriction. So the warning describes a different consumer of the key,
which is either:

- another app of the owner that copied this public key, or
- a third party that scraped the key from the public site, which is exactly the abuse
  application restrictions exist to stop.

Guidance:

1. Continue with the restriction. Type `UPDATE` in the confirmation field and save.
2. On the same page, also set **API restrictions → Restrict key** to Identity Toolkit
   API, Token Service API, Cloud Firestore API and Firebase Installations API. That is
   what actually removes unrelated API traffic; a website restriction alone does not.
3. Any app that needs Maps should get its own key (Create credentials → API key,
   restricted to the Maps APIs and its own referrers), because server-side Maps calls
   have no referrer and would fail under a website restriction.
4. Confirm the Firebase project still has no billing account linked, so an abused public
   key cannot incur charges.

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
- [ ] Upload a very tall photo and a very wide photo: both must appear as filled
      squares, an animated GIF must keep animating after cropping, and `Adjust crop`
      must reopen with the previous crop.
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
