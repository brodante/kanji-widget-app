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
// Register this matching key with the Web app and allow only the real app domains.
// Never put a reCAPTCHA secret key or an App Check debug token in this browser config.
window.KANJI_APP_CHECK_CONFIG = {
    recaptchaEnterpriseSiteKey: '6LcvWdQtAAAAANd_LWYI2R5QWWzblzENzbC4Yrlh'
};
