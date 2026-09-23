// Persistent app identity is separate from the short-lived Drive access token.
// Firebase owns session storage and renewal. Never copy credentials into app backups.
class AppAuth {
    // Must match UsernamePolicy.ALIAS_DOMAIN; the test suite asserts that.
    static ALIAS_DOMAIN = 'users.kanji.qd.je';

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
        this.app = null;
        this.lastRefreshAt = 0;
    }

    static errorMessage(error) {
        const messages = {
            'auth/popup-blocked': 'Allow popups for this site, then try signing in again.',
            'auth/popup-closed-by-user': 'Sign-in cancelled. You can keep learning locally.',
            'auth/cancelled-popup-request': 'Another sign-in window is already open.',
            'auth/unauthorized-domain':
                'This site is not authorized for Firebase login yet. The site owner needs to add its hostname in Firebase Authentication.',
            'auth/operation-not-allowed':
                'That sign-in method is not enabled for this project yet. Use another method, or ask the site owner to enable it.',
            'auth/network-request-failed':
                'Could not reach the sign-in service. Check your connection and try again.',
            'auth/web-storage-unsupported':
                'Persistent login needs browser storage. Allow site storage or use a regular browser window.',
            'auth/invalid-api-key': 'Firebase configuration needs attention from the site owner.',
            'auth/too-many-requests':
                'Too many attempts. Please wait a few minutes, then try again.',
            'auth/weak-password': 'Use a stronger password: at least 8 characters.',
            'auth/missing-password': 'Enter your password.',
            'auth/invalid-email': 'That email address does not look valid.',
            'auth/missing-email': 'Enter your email address or username.',
            'auth/email-already-in-use':
                'An account already uses that email. Sign in instead, or reset its password.',
            'auth/email-change-needs-verification':
                'Check that inbox and confirm the link before signing in with the new email.',
            'auth/user-disabled': 'This account has been disabled. Contact the site owner.',
            'auth/user-not-found':
                'No account uses those details. Check them, or create an account.',
            'auth/wrong-password': 'Email, username or password is incorrect. You can reset it.',
            'auth/invalid-credential':
                'Email, username or password is incorrect. Check your details, or reset your password.',
            'auth/invalid-login-credentials':
                'Email, username or password is incorrect. Check your details, or reset your password.',
            'auth/multi-factor-auth-required':
                'This account needs a second sign-in step, which this build does not support yet.',
            'auth/requires-recent-login':
                'For your safety, sign in again before changing sign-in details.',
            'auth/credential-already-in-use':
                'That sign-in method already belongs to another account.',
            'auth/provider-already-linked': 'That sign-in method is already on this account.',
            'auth/account-exists-with-different-credential':
                'That email already has an account with another sign-in method. Sign in that way first, then link this one.',
            'auth/configuration-not-found':
                'Sign-in is not configured for this project yet. Firefox/Chrome: the site owner must enable Email/Password and Google under Authentication → Sign-in method.',
            'auth/internal-error':
                'The sign-in service refused the request. Check that this origin is allowed on the project’s browser API key (Google Cloud → Credentials → Website restrictions), then try again.',
            'auth/api-key-not-valid':
                'The Firebase Web API key is missing or not valid for this site.',
            'auth/api-key-not-valid.-please-pass-a-valid-api-key.':
                'The Firebase Web API key is missing or not valid for this site.',
            'auth/invalid-app-credential':
                'This browser refused the sign-in request. Clear the site’s cookies or try a private window.',
            'auth/operation-not-supported-in-this-environment':
                'This browser cannot complete the sign-in window. Open the site in a regular tab, not an embedded preview.',
            'auth/quota-exceeded': 'The sign-in service hit its daily limit. Try again later.',
            'auth/user-token-expired': 'Your session expired. Sign in again to continue.'
        };
        const code = error?.code || '';
        if (messages[code]) {
            return messages[code];
        }
        // These codes embed the origin or method, so they need a pattern, not a key.
        if (/^auth\/requests-from-referer/.test(code)) {
            const origin = window.location?.origin || 'this website';
            return `This website is blocked for sign-in. Add ${origin}/* to Google Cloud → APIs & Services → Credentials → the browser API key → Website restrictions (HTTP referrers). Changes can take a few minutes to apply.`;
        }
        if (/^auth\/requests-to-this-api/.test(code)) {
            return 'The browser API key blocks the sign-in API. In Google Cloud → Credentials → the browser API key → API restrictions, allow Identity Toolkit API, Token Service API and Cloud Firestore API, or choose “Don’t restrict key”.';
        }
        if (error) {
            // Keep the raw code visible: it is the fastest way to identify a
            // project-side setup problem, and the SDK's own text is too technical.
            console.warn('KanjiWidgets sign-in error:', code || '(no code)', error.message || '');
        }
        return `Sign-in is unavailable right now${code ? ` (${code})` : ''}. Please try again. Local learning still works.`;
    }

    static aliasEmail(value) {
        if (window.UsernamePolicy?.aliasEmail) {
            return window.UsernamePolicy.aliasEmail(value);
        }
        const username = String(value ?? '')
            .normalize('NFKC')
            .trim()
            .toLowerCase();
        return username ? `${username}@${AppAuth.ALIAS_DOMAIN}` : '';
    }

    // Firebase password sign-in needs an email address. A username is turned into
    // its private alias address; nothing is looked up on the client.
    static normalizeIdentifier(value) {
        const raw = String(value ?? '')
            .normalize('NFKC')
            .trim();
        if (!raw) {
            return '';
        }
        if (raw.includes('@')) {
            return raw.toLowerCase();
        }
        return AppAuth.aliasEmail(raw) || `${raw.toLowerCase()}@${AppAuth.ALIAS_DOMAIN}`;
    }

    static isAliasAddress(value) {
        return String(value ?? '')
            .toLowerCase()
            .endsWith(`@${AppAuth.ALIAS_DOMAIN}`);
    }

    static isAliasAccount(user) {
        return Boolean(user?.email) && AppAuth.isAliasAddress(user.email);
    }

    // Panel controls that depend on the account's methods. One implementation so the
    // account panel, profile page and dialog can never disagree.
    static renderAccountControls(user, { ready = true, busy = false } = {}) {
        const needsVerification = Boolean(
            user && !AppAuth.isAliasAccount(user) && !user.emailVerified
        );
        for (const button of document.querySelectorAll('[data-auth-verify]')) {
            button.hidden = !needsVerification;
            button.disabled = !ready || busy;
        }
        document.querySelectorAll('[data-username-control]').forEach((button) => {
            button.hidden = !user;
        });
    }

    static providers(user) {
        return (user?.providerData || []).map((entry) => entry.providerId);
    }

    static hasPassword(user) {
        return user?.providerData?.some((entry) => entry.providerId === 'password') || false;
    }

    init() {
        document.querySelectorAll('[data-app-sign-in]').forEach((button) => {
            button.onclick = () => {
                if (window.kanjiAuthDialog?.open) {
                    window.kanjiAuthDialog.open('signin');
                    return;
                }
                this.signIn();
            };
        });
        document.querySelectorAll('[data-app-sign-out]').forEach((button) => {
            button.onclick = () => this.signOut();
        });
        document.querySelectorAll('[data-app-auth-retry]').forEach((button) => {
            button.onclick = () => this.start();
        });
        // Returning from the inbox is the usual moment a confirmation lands.
        window.addEventListener('focus', () => {
            if (this.user && !this.user.emailVerified && !AppAuth.isAliasAccount(this.user)) {
                this.refreshUser();
            }
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
            this.app = app;
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

    // Google popup sign-in. Password users are handled in signInWithEmail.
    async signIn() {
        if (!this.ready || this.busy) {
            return { ok: false, message: '' };
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
            return { ok: true };
        } catch (error) {
            this.message = AppAuth.errorMessage(error);
            return { ok: false, message: this.message, code: error?.code };
        } finally {
            this.busy = false;
            this.render();
        }
    }

    // Accepts an email address or a username. Usernames become private alias addresses.
    async signInWithEmail(identifier, password) {
        const locked = this.guard();
        if (locked) {
            return locked;
        }
        const email = AppAuth.normalizeIdentifier(identifier);
        if (!email || !password) {
            const message = 'Enter your email or username and your password.';
            return { ok: false, message, code: 'app/missing-fields' };
        }
        this.busy = true;
        this.message = 'Signing in…';
        this.render();
        try {
            await this.sdk.signInWithEmailAndPassword(this.auth, email, password);
            this.message = '';
            return { ok: true, email };
        } catch (error) {
            const message = AppAuth.errorMessage(error);
            this.message = message;
            return { ok: false, message, code: error?.code, email };
        } finally {
            this.busy = false;
            this.render();
        }
    }

    // Creates the Firebase account only. Username reservation and the account
    // directory document are written by UsernameDirectory after this succeeds.
    async createAccount({ email, password, displayName } = {}) {
        const locked = this.guard();
        if (locked) {
            return locked;
        }
        const address = String(email ?? '')
            .normalize('NFKC')
            .trim()
            .toLowerCase();
        if (!address || !password) {
            return {
                ok: false,
                message: 'Enter an email address and a password.',
                code: 'app/missing-fields'
            };
        }
        if (password.length < 8) {
            return {
                ok: false,
                message: 'Use a stronger password: at least 8 characters.',
                code: 'auth/weak-password'
            };
        }
        this.busy = true;
        this.message = 'Creating your account…';
        this.render();
        try {
            const credential = await this.sdk.createUserWithEmailAndPassword(
                this.auth,
                address,
                password
            );
            const name = String(displayName ?? '')
                .normalize('NFKC')
                .trim()
                .slice(0, 40);
            if (name && this.sdk.updateProfile) {
                try {
                    await this.sdk.updateProfile(credential.user, { displayName: name });
                } catch {
                    // A display-name failure must not fail account creation.
                }
            }
            let verificationSent = false;
            if (this.sdk.sendEmailVerification) {
                try {
                    await this.sdk.sendEmailVerification(credential.user);
                    verificationSent = true;
                } catch (error) {
                    // The account exists either way; the confirmation can be resent.
                    console.warn(
                        'KanjiWidgets verification email:',
                        error?.code || error?.message || ''
                    );
                }
            }
            this.message = '';
            return { ok: true, user: credential.user, email: address, verificationSent };
        } catch (error) {
            const message = AppAuth.errorMessage(error);
            this.message = message;
            return { ok: false, message, code: error?.code };
        } finally {
            this.busy = false;
            this.render();
        }
    }

    async sendPasswordReset(identifier) {
        if (!this.ready || this.busy) {
            return { ok: false, message: this.message || 'Sign-in is not ready yet.' };
        }
        const email = AppAuth.normalizeIdentifier(identifier);
        if (!email || AppAuth.isAliasAddress(email)) {
            return {
                ok: false,
                code: 'app/no-email',
                message:
                    'That account has no mailbox on file. Sign in with its password, then add a recovery email in Profile.'
            };
        }
        this.busy = true;
        this.message = 'Sending a password reset link…';
        this.render();
        try {
            await this.sdk.sendPasswordResetEmail(this.auth, email);
            this.message = `Password reset link sent to ${email}. Check the inbox and spam folder.`;
            return { ok: true, email, message: this.message };
        } catch (error) {
            const message = AppAuth.errorMessage(error);
            this.message = message;
            return { ok: false, message, code: error?.code };
        } finally {
            this.busy = false;
            this.render();
        }
    }

    async sendVerificationEmail() {
        if (!this.ready || this.busy || !this.user) {
            return { ok: false, message: 'Sign in first.' };
        }
        if (AppAuth.isAliasAccount(this.user)) {
            return {
                ok: false,
                code: 'app/no-email',
                message:
                    'This account has no mailbox yet. Add a recovery email first, then verify it.'
            };
        }
        this.busy = true;
        this.render();
        try {
            await this.sdk.sendEmailVerification(this.user);
            return { ok: true, message: `Verification link sent to ${this.user.email}.` };
        } catch (error) {
            const message = AppAuth.errorMessage(error);
            this.message = message;
            return { ok: false, message, code: error?.code };
        } finally {
            this.busy = false;
            this.render();
        }
    }

    // Linking keeps one account: it never merges two separate accounts by email.
    async linkGoogle() {
        if (!this.ready || this.busy || !this.user) {
            return { ok: false, message: 'Sign in first.' };
        }
        this.busy = true;
        this.message = 'Complete Google linking in the popup window.';
        this.render();
        try {
            const provider = new this.sdk.GoogleAuthProvider();
            provider.setCustomParameters({ prompt: 'select_account' });
            await this.sdk.linkWithPopup(this.user, provider);
            this.message = 'Google is now linked to this account.';
            return { ok: true, message: this.message };
        } catch (error) {
            const message = AppAuth.errorMessage(error);
            this.message = message;
            return { ok: false, message, code: error?.code };
        } finally {
            this.busy = false;
            this.render();
        }
    }

    async linkPassword(email, password) {
        if (!this.ready || this.busy || !this.user) {
            return { ok: false, message: 'Sign in first.' };
        }
        const address = String(email ?? '')
            .normalize('NFKC')
            .trim()
            .toLowerCase();
        if (!address || !password || password.length < 8) {
            return {
                ok: false,
                message: 'Enter an email address and a password of at least 8 characters.',
                code: 'app/missing-fields'
            };
        }
        this.busy = true;
        this.message = 'Adding a password to this account…';
        this.render();
        try {
            const credential = this.sdk.EmailAuthProvider.credential(address, password);
            await this.sdk.linkWithCredential(this.user, credential);
            this.message = 'Password added. You can sign in with it as well as Google.';
            return { ok: true, email: address, message: this.message };
        } catch (error) {
            const message = AppAuth.errorMessage(error);
            this.message = message;
            return { ok: false, message, code: error?.code };
        } finally {
            this.busy = false;
            this.render();
        }
    }

    // Gives an alias (username-only) account a real mailbox for password recovery.
    async addRecoveryEmail(email) {
        if (!this.ready || this.busy || !this.user) {
            return { ok: false, message: 'Sign in first.' };
        }
        const address = String(email ?? '')
            .normalize('NFKC')
            .trim()
            .toLowerCase();
        if (!address || !address.includes('@')) {
            return {
                ok: false,
                message: 'Enter a valid email address.',
                code: 'auth/invalid-email'
            };
        }
        this.busy = true;
        this.message = 'Sending a confirmation link…';
        this.render();
        try {
            if (this.sdk.verifyBeforeUpdateEmail) {
                await this.sdk.verifyBeforeUpdateEmail(this.user, address);
            } else {
                await this.sdk.updateEmail(this.user, address);
            }
            this.message = `Confirm the link sent to ${address}. Until then, keep signing in with your username.`;
            return { ok: true, email: address, message: this.message };
        } catch (error) {
            const message = AppAuth.errorMessage(error);
            this.message = message;
            return { ok: false, message, code: error?.code };
        } finally {
            this.busy = false;
            this.render();
        }
    }

    // The confirmation happens in the user's mailbox, so the app has to re-read the
    // account to notice it. Called on focus while unconfirmed, and on demand.
    async refreshUser({ notify = false } = {}) {
        if (!this.ready || !this.user || this.busy || !this.sdk?.reload) {
            return { ok: false };
        }
        if (Date.now() - this.lastRefreshAt < 5000) {
            return { ok: false, throttled: true };
        }
        this.lastRefreshAt = Date.now();
        try {
            await this.sdk.reload(this.user);
            this.render();
            window.dispatchEvent(new Event('kanji-auth-changed'));
            const verified = Boolean(this.user.emailVerified) || AppAuth.isAliasAccount(this.user);
            if (notify) {
                window.KanjiFeedback?.show(
                    verified
                        ? 'Email confirmed. Password recovery can now use that address.'
                        : 'Not confirmed yet. Open the link in your inbox, then check again.'
                );
            }
            return { ok: true, verified };
        } catch (error) {
            const message = AppAuth.errorMessage(error);
            this.message = message;
            this.render();
            return { ok: false, message, code: error?.code };
        }
    }

    guard() {
        if (!this.ready || this.busy) {
            return {
                ok: false,
                code: 'app/not-ready',
                message: this.message || 'Sign-in is still starting. Try again in a moment.'
            };
        }
        return null;
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
        const verified = Boolean(
            this.user && (this.user.emailVerified || AppAuth.isAliasAccount(this.user))
        );
        const evidence = this.user
            ? [
                  AppAuth.isAliasAccount(this.user) ? 'Username account' : this.user.email,
                  AppAuth.hasPassword(this.user) ? 'password' : '',
                  AppAuth.providers(this.user).includes('google.com') ? 'Google' : '',
                  verified ? 'email confirmed' : 'email not confirmed'
              ]
            : [];
        document.querySelectorAll('[data-app-auth-identities]').forEach((element) => {
            element.textContent = evidence.filter(Boolean).join(' · ');
        });
        AppAuth.renderAccountControls(this.user, { ready: this.ready, busy: this.busy });
        window.driveBackup?.renderAccount?.();
        window.kanjiProfilePage?.refresh();
    }
}
window.AppAuth = AppAuth;
window.addEventListener('DOMContentLoaded', () => {
    window.kanjiAuth = new AppAuth();
    window.kanjiAuth.init();
});
