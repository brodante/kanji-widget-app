// Public Firebase Web app configuration, NOT a service-account key or client secret.
// See docs/firebase-auth-setup.md. Keep this project on Spark with no billing attached.
// Authentication, Firestore progress sync, and Firebase AI Logic. No Analytics or Storage.
window.KANJI_FIREBASE_CONFIG = {
    apiKey: 'AIzaSyBcw65nsJHslu5h-pgrZVpMHudosYgIsc4',
    authDomain: 'kanji-widgets.firebaseapp.com',
    projectId: 'kanji-widgets',
    appId: '1:208902670998:web:1ca6de6035d456ac9390b7'
};

// Public reCAPTCHA Enterprise site key used by Firebase App Check for the Web app.
// Register the matching key in Firebase Console before enabling AI Logic enforcement.
// This is a public site key (not a secret); keep the value empty until the owner configures it.
window.KANJI_APP_CHECK_CONFIG = {
    recaptchaEnterpriseSiteKey: ''
};
