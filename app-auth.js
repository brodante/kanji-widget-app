// Persistent app identity is separate from the short-lived Drive access token.
// Firebase owns session storage and renewal. Never copy credentials into app backups.
class AppAuth {
    static configured(config) {
        return ['apiKey', 'authDomain', 'projectId', 'appId'].every(
            (key) => typeof config?.[key] === 'string' && config[key].trim()
        );
    }

    static async loadSDK() {
        const [app, auth] = await Promise.all([
            import('https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js'),
            import('https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js')
        ]);
        return { ...app, ...auth };
    }

    constructor(config = window.KANJI_FIREBASE_CONFIG, loadSDK = AppAuth.loadSDK) {
        this.config = config;
        this.loadSDK = loadSDK;
        this.user = null;
        this.ready = false;
        this.busy = false;
        this.message = '';
    }

    static errorMessage(error) {
        const messages = {
            'auth/popup-blocked': 'Allow popups for this site, then try signing in again.',
            'auth/popup-closed-by-user': 'Sign-in cancelled. You can keep learning locally.',
            'auth/cancelled-popup-request': 'Another sign-in window is already open.',
            'auth/unauthorized-domain':
                'This site is not authorized for Firebase login yet. The site owner needs to add its hostname in Firebase Authentication.',
            'auth/operation-not-allowed':
                'Google sign-in needs to be enabled in Firebase Authentication.',
            'auth/network-request-failed':
                'Could not reach Google sign-in. Check your connection and try again.',
            'auth/web-storage-unsupported':
                'Persistent login needs browser storage. Allow site storage or use a regular browser window.',
            'auth/invalid-api-key': 'Firebase configuration needs attention from the site owner.',
            'auth/too-many-requests': 'Too many sign-in attempts. Please wait and try again.'
        };
        return (
            messages[error?.code] ||
            'Sign-in is unavailable right now. Please try again. Local learning still works.'
        );
    }

    init() {
        document.querySelectorAll('[data-app-sign-in]').forEach((button) => {
            button.onclick = () => this.signIn();
        });
        document.querySelectorAll('[data-app-sign-out]').forEach((button) => {
            button.onclick = () => this.signOut();
        });
        document.querySelectorAll('[data-app-auth-retry]').forEach((button) => {
            button.onclick = () => this.start();
        });
        return this.start();
    }

    async start() {
        if (this.busy || this.ready) {
            return;
        }
        if (!AppAuth.configured(this.config)) {
            this.message =
                'App sign-in is not set up yet. Local learning and Drive backups still work.';
            this.render();
            return;
        }
        this.busy = true;
        this.message = 'Checking your saved sign-in…';
        this.render();
        try {
            this.sdk = await this.loadSDK();
            const app =
                this.sdk.getApps().find((item) => item.name === 'kanji-auth') ||
                this.sdk.initializeApp(this.config, 'kanji-auth');
            this.auth = this.sdk.getAuth(app);
            await this.sdk.setPersistence(this.auth, this.sdk.browserLocalPersistence);
            // Wait for restored identity before enabling account actions.
            await new Promise((resolve, reject) => {
                this.unsubscribe?.();
                this.unsubscribe = this.sdk.onAuthStateChanged(
                    this.auth,
                    (user) => {
                        this.user = user;
                        window.dispatchEvent(new Event('kanji-auth-changed'));
                        this.message = '';
                        this.render();
                        resolve();
                    },
                    reject
                );
            });
            this.ready = true;
        } catch (error) {
            this.unsubscribe?.();
            this.message = AppAuth.errorMessage(error);
        } finally {
            this.busy = false;
            this.render();
        }
    }

    async signIn() {
        if (!this.ready || this.busy) {
            return;
        }
        this.busy = true;
        this.message = 'Complete sign-in in the Google window.';
        this.render();
        try {
            const provider = new this.sdk.GoogleAuthProvider();
            provider.setCustomParameters({ prompt: 'select_account' });
            // No Drive scope. Open directly in this click, after SDK/persistence setup.
            await this.sdk.signInWithPopup(this.auth, provider);
            this.message = '';
        } catch (error) {
            this.message = AppAuth.errorMessage(error);
        } finally {
            this.busy = false;
            this.render();
        }
    }

    async signOut() {
        if (!this.ready || this.busy) {
            return false;
        }
        this.busy = true;
        this.render();
        try {
            await this.sdk.signOut(this.auth);
            this.user = null;
            this.message =
                'Signed out of the app. Local data is kept. Drive has its own Disconnect button.';
            return true;
        } catch (error) {
            this.message = AppAuth.errorMessage(error);
            window.KanjiFeedback?.show(this.message, { title: 'Could not sign out' });
            return false;
        } finally {
            this.busy = false;
            this.render();
        }
    }

    render() {
        const status =
            this.message ||
            (this.user
                ? `App signed in: ${this.user.email || this.user.displayName || 'Google account'}. See Cloud progress below for save status.`
                : 'Sign in to stay connected to the app across reloads. Cloud saving starts only after you review your progress.');
        document.querySelectorAll('[data-app-auth-status]').forEach((element) => {
            element.textContent = status;
        });
        document.querySelectorAll('[data-app-sign-in]').forEach((button) => {
            button.hidden = Boolean(this.user);
            button.disabled = !this.ready || this.busy;
        });
        document.querySelectorAll('[data-app-sign-out]').forEach((button) => {
            button.hidden = !this.user;
            button.disabled = !this.ready || this.busy;
        });
        document.querySelectorAll('[data-app-auth-retry]').forEach((button) => {
            button.hidden = this.ready || this.busy || !AppAuth.configured(this.config);
        });
        window.driveBackup?.renderAccount?.();
        window.kanjiProfilePage?.refresh();
    }
}
window.AppAuth = AppAuth;
window.addEventListener('DOMContentLoaded', () => {
    window.kanjiAuth = new AppAuth();
    window.kanjiAuth.init();
});
