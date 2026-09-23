# Set up free, persistent Google sign-in

## What is ready

KanjiWidgets now has a separate app sign-in using Firebase Authentication. The owner has supplied the public Web configuration for `kanji-widgets`, and it is now wired into the app. The owner has confirmed Google sign-in works. Firestore has now been created in Singapore; continue with [the Firestore setup guide](firestore-sync-setup.md).

- Firebase restores the app session after reloads and browser restarts on the same origin.
- The account menu and Profile page show the app identity and Google photo. An uploaded custom photo still takes priority.
- Signing in alone does not associate a new account with this device’s learning data. Previously approved cloud sync can resume; first sync asks which data to keep.
- Drive still has its own Connect and Disconnect controls and short-lived permission.
- Signing out of the app keeps local data and does not disconnect Drive. On a shared device, tick **Shared device: also erase the study data stored here** before signing out (it asks again and names everything it deletes), and disconnect Drive too. Local progress is otherwise shared by everyone using that browser profile, not isolated by Firebase account.
- Local learning and existing backups still work when Firebase is unconfigured or unavailable.
- Session credentials are managed by the Firebase SDK and excluded from app backups. There is no frontend client secret, service-account key or manual refresh-token handling.

This is ongoing free-plan setup, not a promise that a vendor's pricing will never change. Sessions can end if browser data is cleared, access is revoked, or browser policies prevent persistence. Each hostname has a separate session. First sign-in needs internet and a popup-capable browser.

## Plan and current status

### Phase 1: persistent identity

- [x] Separate app authentication from Drive permissions.
- [x] Use Firebase LOCAL persistence and wait for the restored session before allowing sign-in.
- [x] Show clear setup, popup, network and storage errors with retry support.
- [x] Preserve local learning, uploaded avatars and the existing Drive workflow.
- [x] Add automated tests and static-deployment/cache entries.
- [x] Owner supplied public Web config; added to `firebase-config.js`.
- [x] Owner completed Google sign-in setup and reported working login. Keep Spark without billing.
- [ ] Verify real Google sign-in, reload/restart persistence and sign-out on localhost and production.

### Phase 2: cloud progress

Implemented for controlled testing. The default database is in Singapore. Publishing security rules, emulator execution and live acceptance are still pending. Follow [the Firestore setup guide](firestore-sync-setup.md). Authentication alone is not cloud progress sync.

0. Username ownership and account records are implemented (`usernames/{name}`, `users/{uid}`) with published-shape rules and mocked tests. Live verification is pending.
1. Design per-user Firestore documents for progress, SRS and ordinary preferences, with explicit consent before associating existing guest data with an account.
2. Add owner-only security rules based on `request.auth.uid`, validate document shape and size, and test rules with the emulator before publishing.
3. Add debounced saves and quota-aware reads, conflict checks, account-switch guards and recovery before restore. Never silently replace local progress on login.
4. Keep media and full backups in the current local/Drive system. Never store API keys, Drive tokens or Firebase sessions in Firestore.
5. Verify two-device changes and offline/reconnect behavior before enabling automatic saves.

Other TODO features remain paused. Do not enable Firebase Storage or billing.

## Your setup steps

### 1. Create a Firebase project

1. Open <https://console.firebase.google.com/> using your Google account.
2. Choose **Create a project** (or **Add project**), and name it something like `KanjiWidgets`.
3. Skip Google Analytics and optional integrations for now. They are not needed for login.
4. Confirm the project is on **Spark (no-cost)**.
5. **Do not link a Cloud Billing account, upgrade to Blaze, or activate trial credits.** If any step asks for billing, stop. Authentication with Google does not need it.

A separate project is fine. You do not need to replace your existing Drive OAuth client or change `backup-config.js`.

### 2. Register a Web app

1. In Project overview, click the Web icon **`</>`** (or Project settings → General → Your apps → Add app → Web).
2. Name it `KanjiWidgets web`.
3. Do not enable Firebase Hosting. Your existing static hosting stays in place.
4. Register the app.
5. Firebase shows a `firebaseConfig` object. Copy that object only. If the console offers npm or script instructions, either can show the same config; there is no need to install or paste the surrounding code.

The Web config contains public identifiers such as:

```js
const firebaseConfig = {
    apiKey: 'your-public-web-api-key',
    authDomain: 'your-project.firebaseapp.com',
    projectId: 'your-project',
    appId: 'your-web-app-id'
};
```

You can send me that public config and I will place the required fields in `firebase-config.js`. Other public fields such as `messagingSenderId` are fine, but are not needed by this implementation. For another deployment, replace the four values in that file yourself, keeping `window.KANJI_FIREBASE_CONFIG = ...`.

**Do not send a service-account JSON, private key, OAuth client secret, password or access token.** A Firebase Web config is not an Admin SDK/service-account configuration. Its API key identifies the project; it does not replace database security rules.

Keep the supplied `authDomain` ending in `.firebaseapp.com`. Do not replace it with `kanji.qd.je`: GitHub Pages does not serve Firebase's authentication helper endpoints. This implementation uses popup sign-in rather than a redirect-based flow.

### 3. Enable Google sign-in

1. Open **Build → Authentication → Get started**.
2. Open **Sign-in method** (sometimes called Sign-in providers).
3. Select **Google** and enable it.
4. Choose your project support email and a public-facing project name if requested.
5. Save.

Do not enable phone authentication, Identity Platform upgrades or email-link sign-in. Email link (passwordless) stays off: username/password accounts are created in the app and confirmed with a normal verification link.

### 3b. Enable Email/Password sign-in

The app's sign-in dialog also offers email/username + password accounts, so the
**Email/Password** provider must be enabled:

1. Open **Build → Authentication → Sign-in method**.
2. Select **Email/Password**, enable it, and leave **Email link (passwordless sign-in)**
   off.
3. Save.

Usernames are stored in Firestore, not in the provider: see
[Email, username and password sign-in](username-login-setup.md) for the collection
layout, the alias address shape used by username-only accounts, and the rules that
decide ownership.

Do not manually add Drive scopes to the Firebase provider.

### 4. Authorize your site domains

In **Authentication → Settings → Authorized domains**, add:

- `kanji.qd.je` for the live app.
- `localhost` for local development. New projects may not include it automatically.
- Any other hostname on which you intentionally test, such as your actual GitHub Pages hostname or the exact Arena preview hostname.

Enter hostnames only, without `https://`, ports or paths. Leave Firebase's existing default domains in place. The custom site domain belongs in this list, not in the config's `authDomain` field.

For an Arena preview, open the preview in a separate browser tab before signing in. Embedded previews and in-app browsers can interfere with popups/storage. If it reports an unauthorized domain, add the exact preview hostname, not a wildcard. Remove temporary preview domains when no longer needed.

### 5. Send the config, then verify together

Once you have completed steps 1–4, send me the public `firebaseConfig` object. I can wire it in and check the build. Production testing requires publishing the updated site: the current GitHub Pages workflow automatically deploys on `main`, not this work branch. Changes saved here do not by themselves mean production is updated.

We should verify:

- [ ] Account menu → **Sign in with Google** opens Google and returns the correct identity.
- [ ] Reloading and closing/reopening the browser preserves app login on the same hostname.
- [ ] A second tab updates when signing in/out in the first tab.
- [ ] **Sign out of app** ends the app session without deleting progress.
- [ ] Drive connection and reconnection work independently; the page never claims Firebase login renews Drive access.
- [ ] Uploaded avatar wins over the Google photo.
- [ ] Cancelling or blocking a popup gives a useful error and permits retry.
- [ ] Offline learning still works; new sign-in is not required for local learning.
- [ ] Test another Google account. App identity changes, but local data is not claimed to be that account's cloud data.

Automated tests mock the Firebase SDK. Real Google OAuth and browser-restart persistence cannot be verified until your project is configured. Mobile Safari, popup blockers, restrictive storage modes and the production origin need real-browser testing too.

## Troubleshooting

- **Sign-in not set up:** fill all four config fields and publish `firebase-config.js` alongside the app. Reload without clearing site data.
- **Unauthorized domain:** add the current page hostname in Firebase Authentication's authorized domains.
- **Provider not enabled:** enable Google under Authentication → Sign-in method.
- **Popup blocked:** open the app in a regular browser tab, allow popups for this site and click again.
- **Connection unavailable:** check internet/content blockers and use Retry connection. The SDK loads from `www.gstatic.com`; local learning does not depend on it loading successfully.
- **Storage unavailable:** allow site storage or use a normal browser profile. The app deliberately does not fall back to a short-lived session while claiming persistent login.
- **Signed in, but Drive asks to reconnect:** expected. These are different permissions.
- **Another device has no progress:** use Cloud progress → Check cloud → Use cloud progress after the first device has saved. First-sync consent and published rules are required; see the Firestore guide.

## Cost boundaries

Stay on Spark with no Cloud Billing account linked. Do not add Firebase Storage, Cloud Functions or Cloud Run for this phase. No paid services or automatic billing fallback are configured by this code. Free quotas and abuse protections still apply; availability is not unlimited.

Official references:

- <https://firebase.google.com/pricing>
- <https://firebase.google.com/docs/projects/billing/firebase-pricing-plans>
- <https://firebase.google.com/docs/auth/web/google-signin>
- <https://firebase.google.com/docs/auth/web/auth-state-persistence>
- <https://firebase.google.com/docs/projects/api-keys>
