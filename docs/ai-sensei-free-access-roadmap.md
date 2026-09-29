# AI Sensei: free access and rate-limit fallback

**Status:** Client implementation and automated checks complete; the owner has confirmed a localhost live AI smoke test and reports the Web app is registered in App Check. Production origin/key validation and live deployment remain pending.
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
- Opening Ask Sensei from a kanji card now opens the Ask tab and focuses the composer without submitting a default prompt. Only a learner's explicit message or selected quick-prompt button makes a chat request; the current kanji is shown as context and accompanies a message they choose to send.
- The floating AI Sensei control is an icon-only circular, draggable assistive button. AI Settings includes a default-on, persisted “Show floating AI Sensei button” toggle; turning it off hides only this shortcut and leaves other AI Sensei entry points enabled. After five seconds without interaction, the button docks with about 55% of its width off the nearest screen edge; hover and keyboard focus restore the full button, and drag/touch wakes it.
- Free Firebase chat applies a five-second per-tab pacing cooldown after each chat attempt (success or failure). A rate-limit response starts an escalating backoff (5, 10, 20 seconds, up to two minutes); the composer, send button, quick prompts, and chat retry are locked while a countdown is shown. BYOK is not subject to this app-side cooldown.
- Settings explain the key-free provider, optional BYOK risks, and that credentials stay in local storage and go directly to the selected provider. The AI modal discloses that relevant questions/kanji/study details are sent to the selected provider and that Google's free-tier prompts may be used to improve its products.
- The AI modal remains `ai-free-v3`; the main script and stylesheet use `ai-floating-v1` for the floating-shortcut settings and dock behavior. The unchanged Firebase config remains `ai-free-v2`. The service-worker cache is `kanji-widgets-v30`.

## How the shared quota works

Firebase AI Logic calls the Gemini Developer API through the Firebase project. Quotas and capacity are shared at the project/service level; they are not a named learner's daily allowance. Firebase documents a configurable per-user request rate (currently 100 requests/minute by default), but that setting is shared across users and does not create an individual daily entitlement. A browser-only counter would be bypassable and is intentionally not used as a security or cost control.

The app responds to actual built-in-provider rate/quota errors. A 429 may mean a project quota/rate limit or temporarily exhausted model capacity; the UI says the free limit is reached “for now” and keeps the local diagnostic available. Free Firebase chat now adds a short, best-effort pacing cooldown after every chat attempt and an escalating pause after repeated 429s. This is a per-tab UI guard—not a Firebase quota setting—and can be bypassed by another tab, device, or page reload; shared project/provider quotas still apply. Firebase quota/model eligibility and free-tier terms can change. BYOK removes the app's shared Firebase quota for those requests, but the selected provider may rate-limit usage or charge the learner.

## Owner setup required before production AI is ready

The owner has supplied a public reCAPTCHA Enterprise site key, now configured in `firebase-config.js`, and reports the Web app is **Registered** in App Check. Confirm that the registered provider uses this same key and allows the production hostname. **The built-in Firebase AI provider is not production-ready until a non-debug live-origin test passes.** The normal settings remain usable for BYOK while this work is pending.

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

On **AI Services → AI Logic → All apps**, an **Unregistered** App Check status means the Web app has not been registered with a production App Check attestation provider. Enabling `firebaseappcheck.googleapis.com` alone does not register the app. For a localhost-only pre-production test, Firebase AI Logic supports the debug provider; the exact generated debug token must be allowlisted under **Security → App Check → Apps → Manage debug tokens**. A debug-token test does not prove that production reCAPTCHA is registered. Production requires registering the Web app with reCAPTCHA Enterprise. Guided AI Logic setup may automatically enforce baseline App Check, so check the **APIs** tab rather than assuming enforcement is off; do not disable baseline enforcement just to make local testing work.

### 3. Register Web App Check with reCAPTCHA Enterprise

1. In the correct Google Cloud project, open **Fraud Defense / reCAPTCHA Enterprise** and create a **Web, score-based** site key. If prompted, enable the reCAPTCHA Enterprise API. Do not select a checkbox challenge.
2. Restrict that key to the real app domains (for example, `kanji.qd.je` and `brodante.github.io` if GitHub Pages is in active use). Never add `localhost` to a production key; use a separate development/debug setup if needed, and never ship a debug token.
3. In Firebase Console → **Security → App Check → Apps**, register the existing Web app with that provider and the matching site key. Keep the default one-hour token TTL unless there is a concrete reason to change it; shorter TTLs create assessments more often.
4. Copy the **public site key** into `window.KANJI_APP_CHECK_CONFIG.recaptchaEnterpriseSiteKey` in `firebase-config.js`. This is not a secret. Do not put a secret key or service-account credential in the browser.
5. Before publishing, remove any local `FIREBASE_APPCHECK_DEBUG_TOKEN` flag; deploy only the public site key. The owner reports the production Web app is **Registered**; verify it uses this key, allows the production domain, and initializes App Check before Firebase Auth.
6. The owner currently reports **Basic: Enforced** and **Replay: Monitoring** for Firebase AI Logic. Keep baseline protection enforced. Monitoring is non-blocking; do not enforce Replay until the client is upgraded to a supported Web SDK and configured to request limited-use tokens. Monitor App Check metrics for valid production traffic.

Firebase App Check's reCAPTCHA Enterprise assessments have a no-cost quota, with charges possible above that quota according to Google's current pricing. Keep Spark/no billing, monitor the assessment quota, and do not link billing to avoid an interruption. If the free quota is exhausted or setup requires billing, stop and ask the owner; the safe fallback is BYOK/local functionality, not a paid upgrade. Firebase requires App Check enforcement for Firebase AI Logic starting **2026-11-02**.

## Test this branch locally

In this checked-out workspace, run `npm ci`, `npm test`, `npm run lint`, `npm run format:check`, and `npm start` directly. To reproduce in a separate clone, first ensure the latest feature-branch commit is pushed, then run:

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

Open `http://localhost:5000`. The UI, keyless Settings, local learning and mocked tests can be checked immediately. The public site key is now present in the branch config; a real localhost AI call also needs the local debug flag and a registered debug token. The push only updates the branch; it does not deploy the site.

For a localhost live-AI smoke test with the Firebase AI Logic API enabled:

1. Do not add `localhost` to the production reCAPTCHA Enterprise key. In your local, uncommitted `firebase-config.js` only, set the public site key and set `window.FIREBASE_APPCHECK_DEBUG_TOKEN = true` before App Check initializes. The app's public config needs a non-empty site key even though the local debug provider is used.
2. Run `npm start`, open DevTools, and copy the debug token printed by the Firebase SDK. The `true` value is only the switch; the SDK prints a separate token.
3. In Firebase Console → **Security → App Check → Apps**, open the Web app's menu → **Manage debug tokens** and register the exact token for that app.
4. Reload `http://localhost:5000`, choose the built-in provider, and send a small test prompt. If the Firebase API key has HTTP-referrer restrictions, use a dev-only key/project that allows localhost rather than broadening the production key.
5. Treat the debug token as a credential: never commit or share it. If exposed, delete it in Firebase Console and register a fresh token for further local tests. Remove the local debug flag before any production build.

The owner confirmed that this localhost debug-token flow returned a real AI Sensei response. That validates the local debug path, not production reCAPTCHA or a live deployment. A dedicated Spark development Firebase project is safer for debug tokens and test traffic because it isolates the production AI quota. If using the existing project for a brief smoke test, keep requests minimal; they share that project's model quota. For production-origin validation, use the registered production reCAPTCHA key with debug mode off.

## Staging and publishing

The GitHub Pages workflow deploys pushes to `main` and also supports manual `workflow_dispatch`. The Arena branch is not live automatically. Manually dispatching the workflow against this branch deploys to the same GitHub Pages site, so treat that as a production release, not a staging preview. No separate staging deployment is currently configured. A staging test needs a separate Pages site/origin (ideally with a separate Spark Firebase project to isolate shared AI quota). After production App Check/configuration checks pass, publish through the normal review/merge to `main`; the Pages workflow deploys `main`. Do not open a PR or dispatch a deployment without explicit owner authorization.

### 4. Live validation checklist

Automated tests mock the SDK; they do not contact Firebase or a model. Before describing the default AI service as ready, verify in a real production-like browser:

- [ ] Built-in provider sends a real request with no learner API key/model selection.
- [ ] App Check initializes and returns valid tokens on every supported production origin.
- [ ] Firebase AI Logic monitoring shows the expected project, request counts, model and error rates.
- [ ] Simulated/controlled 429 shows the quota notice; App Check/setup/network errors do not.
- [ ] Free AI composer, send button, quick prompts, and chat retry stay locked during the five-second pacing cooldown and escalating 429 backoff; the countdown is accessible.
- [ ] “Use my own API key” reaches AI Settings; after choosing a provider and adding a key, retry is explicit and uses only that selection.
- [ ] The contact link addresses `spsc.mizu@gmail.com` and includes no prompt, profile, Firebase UID, or key.
- [ ] Ask Sensei, diagnostics, mnemonic and etymology behavior are checked; local diagnostics and other non-AI learning still work offline.
- [ ] Project remains on Spark with no Cloud Billing account, Cloud Functions, Cloud Run, trial, or paywall.

## Progress and automated verification

- [x] Implement the key-free Firebase provider, BYOK-preserving settings migration, Settings guidance, and provider privacy notice.
- [x] Add quota-specific choices across Ask Sensei, diagnostics, and drawer mnemonic/etymology flows; keep non-quota errors distinct and safe.
- [x] Pace Free Firebase chat with an accessible five-second cooldown and escalating 429 backoff; leave BYOK chat unthrottled.
- [x] Add the persisted, default-on floating AI Sensei visibility toggle without disabling other AI entry points; dock the shortcut about 55% offscreen while idle and restore it on hover/focus.
- [x] Add App Check initialization before Auth when the owner configures the public site key, with tests for success, ordering, and failure isolation.
- [x] Add/update mocked tests for storage defaults/migration, BYOK preservation, key-free dispatch, quota classification, UI choices, asset cache/deploy versions, and existing regressions.
- [x] Owner supplied the public reCAPTCHA Enterprise site key; it is configured in the browser config (no debug token or debug flag is committed).
- [x] Owner confirmed a real localhost AI Sensei response using a registered App Check debug token; the shared project quota was used for that request.
- [x] Owner reports Firebase AI Logic App Check is Basic/Enforced with Replay/Monitoring.
- [x] Owner reports the production Web app is registered in Firebase App Check.
- [ ] Verify the registered provider matches the configured public site key and production host; check API-key restrictions.
- [ ] Validate App Check metrics and the real model on a live, non-debug origin; keep Spark with no billing attached.
- [ ] Complete the real-browser acceptance checklist above before calling the built-in provider production-ready.

Verification run after the last code change:

- `npm ci` — succeeded; 338 packages installed and zero vulnerabilities reported.
- `npm test` — passed; 22 SRS/AI checks, 227 Node test cases, and 64 drawing-pad checks (0 failures).
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
