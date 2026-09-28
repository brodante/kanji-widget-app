# Website analytics

## Chosen setup

Keep the site's existing Google Analytics 4 stream, **G-Q6XNG2ETFL**, as the sole Analytics destination configured by this app. This preserves the destination used by the live site's original `index.html` tag. Firebase remains responsible for Authentication and Firestore; the app does not initialize Firebase Analytics.

The different measurement ID originally shown by Firebase's setup wizard, G-8Y9KDZXVWS, is not used by the app. Do not add it as a second tracker, substitute it for the existing ID, or delete its property/stream without reviewing that property's history and ownership. No Analytics console properties or integrations were changed by this code update.

## Behavior

- `analytics.js` initializes the existing Google tag once per document.
- Tracking runs only on HTTPS `kanji.qd.je` and the `brodante.github.io/kanji-widget-app` path.
- Localhost, Arena previews, forks and unrelated GitHub Pages sites do not load the tracker or queue Analytics events.
- Google tag loading is asynchronous and independent of authentication, learning and saving. A content blocker or unavailable Analytics service must not stop the app.
- The app does not send Firebase UIDs, account email addresses, nicknames or learning snapshots as custom Analytics fields. No new custom-event instrumentation is added.
- Standard Google Analytics collection behavior and the property's existing enhanced-measurement settings otherwise remain unchanged. This change does not implement a consent-management interface; maintain appropriate privacy disclosures and consent controls for your audience.

Do not add `getAnalytics()` or another `gtag('config', ...)` initialization without deliberately revisiting the single-stream setup. The project's Firebase API key and Analytics measurement ID serve different purposes. You do not need to enable Analytics Admin/Data APIs just to collect visits with the Google tag.

## One release check

After deploying, open the Analytics property containing web stream **G-Q6XNG2ETFL**, then open **Reports → Realtime**. Visit `https://kanji.qd.je/` in another tab with any required consent granted and no Analytics-blocking extension. Confirm a visit appears; allow a few minutes. Do not use localhost or Arena previews to test collection, because they are deliberately excluded.

If no visit appears, verify the web stream's measurement ID in **Admin → Data streams** and check whether the tag is blocked. Do not paste a second tracking snippet as a fix.

The automated tests cover allowed/excluded origins, duplicate initialization and deployment/cache wiring. They do not prove receipt by Google's Analytics servers. The agent cannot access your private Analytics reports to perform that final check.

Linking Firebase to Analytics is optional and not required for Google login, Firestore sync or these website reports. If it becomes necessary later, review Firebase's existing-gtag migration instructions first: https://firebase.google.com/docs/analytics/web/get-started#firebase-gtag
