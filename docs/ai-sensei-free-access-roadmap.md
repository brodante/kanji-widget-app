# AI Sensei: free access and rate-limit fallback

**Status:** Client implementation and automated checks complete; owner Firebase setup and live-browser validation remain pending.  
**Last reviewed:** 2026-09-29

This document tracks the no-key default, the free-tier quota response, and the production steps needed to enable the built-in service. The approved scope is deliberately no-backend: keep the project on Firebase Spark, do not link Cloud Billing, and do not add Cloud Functions, Cloud Run, a trial, or a paywall.

## Goal and boundaries

- A new or unconfigured learner can use the built-in AI Sensei without supplying an API key or choosing a model.
- Keep Gemini, OpenAI, Claude, OpenRouter, and Ollama available as optional BYOK/local providers. Existing configured provider, key, and model are preserved.
- When Firebase AI Logic reports a rate/quota limit, explain it politely and offer Settings (for BYOK), an explicit retry after setup, and `spsc.mizu@gmail.com`.
- BYOK bypasses the app's shared Firebase quota for that request; it is **not unlimited**. A provider may impose its own limits or charges.
- Preserve offline/local learning and rule-based diagnostics. No usage counter in browser storage is represented as an enforceable limit.
- No Gemini Developer API key or other provider secret is shipped in the app.

## Implemented in this branch

- `firebase` is the new default provider. It uses Firebase AI Logic's Google AI backend and the fixed model `gemini-3.8-flash`; learners do not choose a model or enter a key for it.
- On the first AI-settings read after page load, saved key-requiring provider settings with an empty key migrate to Firebase. This migration runs once per page session, so a learner can deliberately select a BYOK provider and enter a key without being switched back mid-form. Configured BYOK settings remain selected with their existing key and model. The existing legacy Gemini-model migration is retained. AI response caches are not cleared.
- Firebase Web/App Check SDK modules are loaded lazily. When the owner supplies a reCAPTCHA Enterprise site key, App Check is initialized before Firebase Auth services and shared with AI Logic. Local learning/auth startup is not blocked by an App Check initialization error.
- Only rate/quota errors from the built-in provider receive the `ai/free-tier-quota-exceeded` code. Setup, App Check, network, model, and ordinary provider errors remain distinct.
- Ask Sensei, diagnostics, and kanji-drawer mnemonic/etymology flows show the quota choices. Diagnostics retain the local fallback. Chat and connection-test errors are rendered as text rather than interpolated HTML.
- Settings explain the key-free provider, optional BYOK risks, and that credentials stay in local storage and go directly to the selected provider. The AI modal discloses that relevant questions/kanji/study details are sent to the selected provider and that Google's free-tier prompts may be used to improve its products.
- Changed assets use `ai-free-v1`; the service-worker cache is `kanji-widgets-v25`.

## How the shared quota works

Firebase AI Logic calls the Gemini Developer API through the Firebase project. Quotas and capacity are shared at the project/service level; they are not a named learner's daily allowance. Firebase documents a configurable per-user request rate (currently 100 requests/minute by default), but that setting is shared across users and does not create an individual daily entitlement. A browser-only counter would be bypassable and is intentionally not used as a security or cost control.

The app responds to actual built-in-provider rate/quota errors. A 429 may mean a project quota/rate limit or temporarily exhausted model capacity; the UI says the free limit is reached “for now” and keeps the local diagnostic available. Firebase quota/model eligibility and free-tier terms can change. BYOK removes the app's shared Firebase quota for those requests, but the selected provider may rate-limit usage or charge the learner.

## Owner setup required before production AI is ready

The reCAPTCHA Enterprise site key in `firebase-config.js` is currently empty. **The built-in Firebase AI provider is not production-ready until the steps below are completed and tested.** The normal settings remain usable for BYOK while this work is pending.

### 1. Confirm the project and cost boundary

1. Use the existing Firebase project `kanji-widgets` and its registered Web app; the public Web configuration is already in `firebase-config.js`.
2. Keep the project on **Spark** and verify that no Cloud Billing account is linked. Do not accept trial credits or enable a paid fallback.
3. In Firebase Console, enable/configure **Firebase AI Logic** with the **Gemini Developer API** backend. Do not switch to Vertex AI or a feature that requires billing. Confirm that `gemini-3.8-flash` is available to this project on its current plan before release.
4. Review Firebase AI Logic quotas and monitoring. Do not raise limits in a way that requires billing. If the free allowance or model availability is insufficient, leave the built-in provider unavailable and ask the owner before changing scope.

### 2. Check the Firebase browser API key restrictions

Firebase's Web API key is a public project identifier, not a Gemini secret. The existing key may have an API allowlist from Auth/Firestore setup. In Google Cloud Console → **APIs & Services → Credentials**, open the browser key used by `firebase-config.js` and verify:

- **Firebase AI Logic API** (`firebasevertexai.googleapis.com`) and **Firebase App Check API** (`firebaseappcheck.googleapis.com`) are in the API restrictions allowlist.
- Keep only the other Firebase APIs required by the existing app (Auth/Firestore and related configured services).
- If using HTTP-referrer application restrictions, include the actual production origins, such as `https://kanji.qd.je/*` and the GitHub Pages origin if that deployment is intentionally supported. Keep restrictions narrow and do not remove existing Auth/Firestore requirements.
- Do **not** paste a Gemini Developer API key into the app or add it to the Firebase config. Firebase AI Logic uses the Firebase project configuration and App Check, not a learner-facing Gemini key.

Allow a few minutes for API-key restriction changes to take effect. A 403 mentioning `firebasevertexai.googleapis.com` commonly indicates this API is missing from the key allowlist.

### What “Unregistered” means on the Firebase AI Logic page

On **AI Services → AI Logic → All apps**, an **Unregistered** App Check status means AI Logic is enabled but the Web app has not yet been registered with an App Check attestation provider. Enabling `firebaseappcheck.googleapis.com` alone does not register the app. Register the app using the steps below; do not enable enforcement until the client is configured and valid tokens have been tested.

### 3. Register Web App Check with reCAPTCHA Enterprise

1. In the correct Google Cloud project, open **Fraud Defense / reCAPTCHA Enterprise** and create a **Web, score-based** site key. If prompted, enable the reCAPTCHA Enterprise API. Do not select a checkbox challenge.
2. Restrict that key to the real app domains (for example, `kanji.qd.je` and `brodante.github.io` if GitHub Pages is in active use). Never add `localhost` to a production key; use a separate development/debug setup if needed, and never ship a debug token.
3. In Firebase Console → **Security → App Check → Apps**, register the existing Web app with that provider and the matching site key. Keep the default one-hour token TTL unless there is a concrete reason to change it; shorter TTLs create assessments more often.
4. Copy the **public site key** into `window.KANJI_APP_CHECK_CONFIG.recaptchaEnterpriseSiteKey` in `firebase-config.js`. This is not a secret. Do not put a secret key or service-account credential in the browser.
5. Deploy the updated app and confirm App Check initializes before Firebase Auth, then verify AI Logic requests carry valid App Check tokens.
6. Monitor App Check metrics before enforcing it for Firebase AI Logic. Once real traffic is verified, enable enforcement for **Firebase AI Logic only**. Avoid changing Auth/Firestore enforcement as part of this task.

Firebase App Check's reCAPTCHA Enterprise assessments have a no-cost quota, with charges possible above that quota according to Google's current pricing. Keep Spark/no billing, monitor the assessment quota, and do not link billing to avoid an interruption. If the free quota is exhausted or setup requires billing, stop and ask the owner; the safe fallback is BYOK/local functionality, not a paid upgrade. Firebase requires App Check enforcement for Firebase AI Logic starting **2026-11-02**.

## Test the pushed branch locally

Clone the branch without opening a PR:

```sh
git clone --single-branch --branch arena/01a0e9de-kanji-widget-app \
  https://github.com/brodante/kanji-widget-app.git
cd kanji-widget-app
npm ci
npm test
npm run lint
npm run format:check
npm start
```

Open `http://localhost:5000`. The UI, keyless Settings, local learning and mocked tests can be checked immediately. **The built-in live AI call will not work yet while `recaptchaEnterpriseSiteKey` is empty.** The push only updates the branch; it does not deploy the site.

For a localhost live-AI smoke test after Firebase AI Logic and App Check are registered:

1. Do not add `localhost` to the production reCAPTCHA Enterprise key. In your local, uncommitted `firebase-config.js` only, set the public site key and set `window.FIREBASE_APPCHECK_DEBUG_TOKEN = true` before App Check initializes.
2. Run `npm start`, open DevTools, and copy the debug token printed by the Firebase SDK.
3. In Firebase Console → **Security → App Check → Apps**, open the Web app's menu → **Manage debug tokens** and register that token.
4. Reload `http://localhost:5000`, choose the built-in provider, and send a small test prompt. If the Firebase API key has HTTP-referrer restrictions, use a dev-only key/project that allows localhost rather than broadening the production key.
5. Treat the debug token as a credential: never commit or share it. Remove the local debug flag and delete the token from Firebase Console when testing is done. Never enable debug mode in a production build.

A dedicated Spark development Firebase project is the safer place for debug tokens and test traffic because it isolates the production AI quota. If using the existing production project for a brief smoke test, keep requests minimal; they share that project's model quota. For actual production-host validation, use the production reCAPTCHA key on a registered, allowed origin without the debug provider.

### 4. Live validation checklist

Automated tests mock the SDK; they do not contact Firebase or a model. Before describing the default AI service as ready, verify in a real production-like browser:

- [ ] Built-in provider sends a real request with no learner API key/model selection.
- [ ] App Check initializes and returns valid tokens on every supported production origin.
- [ ] Firebase AI Logic monitoring shows the expected project, request counts, model and error rates.
- [ ] Simulated/controlled 429 shows the quota notice; App Check/setup/network errors do not.
- [ ] “Use my own API key” reaches AI Settings; after choosing a provider and adding a key, retry is explicit and uses only that selection.
- [ ] The contact link addresses `spsc.mizu@gmail.com` and includes no prompt, profile, Firebase UID, or key.
- [ ] Ask Sensei, diagnostics, mnemonic and etymology behavior are checked; local diagnostics and other non-AI learning still work offline.
- [ ] Project remains on Spark with no Cloud Billing account, Cloud Functions, Cloud Run, trial, or paywall.

## Progress and automated verification

- [x] Implement the key-free Firebase provider, BYOK-preserving settings migration, Settings guidance, and provider privacy notice.
- [x] Add quota-specific choices across Ask Sensei, diagnostics, and drawer mnemonic/etymology flows; keep non-quota errors distinct and safe.
- [x] Add App Check initialization before Auth when the owner configures the public site key, with tests for success, ordering, and failure isolation.
- [x] Add/update mocked tests for storage defaults/migration, BYOK preservation, key-free dispatch, quota classification, UI choices, asset cache/deploy versions, and existing regressions.
- [ ] Owner configures Firebase AI Logic and the reCAPTCHA Enterprise site key; validate the live model and production origins.
- [ ] Verify App Check assessment usage stays within the no-cost quota on Spark, then enable enforcement for Firebase AI Logic.
- [ ] Complete the real-browser acceptance checklist above before calling the built-in provider production-ready.

Verification run after the last code change:

- `npm ci` — succeeded; 338 packages installed and zero vulnerabilities reported.
- `npm test` — passed; 221 tests, 0 failures.
- `npm run lint` — passed.
- `npm run format:check` — passed.
- `git diff --check` — passed.

These automated checks use mocked Firebase behavior. They do not replace the owner-side Firebase Console work, App Check cost/quota monitoring, or live acceptance above.

## References

- [Firebase AI Logic Web quickstart](https://firebase.google.com/docs/ai-logic/get-started)
- [Firebase AI Logic pricing](https://firebase.google.com/docs/ai-logic/pricing)
- [Firebase AI Logic quotas](https://firebase.google.com/docs/ai-logic/quotas)
- [Firebase AI Logic production checklist](https://firebase.google.com/docs/ai-logic/production-checklist)
- [Firebase AI Logic API-key error troubleshooting](https://firebase.google.com/docs/ai-logic/error-codes)
- [Firebase App Check with reCAPTCHA Enterprise for Web](https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider)
- [Gemini API pricing and data-use terms](https://ai.google.dev/gemini-api/docs/pricing)
