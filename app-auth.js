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

    // What the learner sees for the signed-in account. The alias address used for
    // username sign-in is an implementation detail, and an account without a Google
    // provider must never be labelled as a Google account.
    static accountLabel(user, handle = window.kanjiUsernames?.handle) {
        if (!user) {
            return '';
        }
        const username = handle && (!handle?.uid || handle.uid === user.uid) ? handle.username : '';
        const name = typeof user.displayName === 'string' ? user.displayName.trim() : '';
        if (name) {
            return name;
        }
        if (username) {
            return `@${username}`;
        }
        if (AppAuth.isAliasAccount(user)) {
            return 'Username account';
        }
        return user.email || 'Signed-in account';
    }

    // The line under that label: the address the account really has, or an honest note
    // that a username-only account keeps no mailbox.
    static accountDetail(user, handle = window.kanjiUsernames?.handle) {
        if (!user) {
            return '';
        }
        if (AppAuth.isAliasAccount(user)) {
            const username =
                handle && (!handle?.uid || handle.uid === user.uid) ? handle.username : '';
            return username
                ? `@${username} · no mailbox on file`
                : 'Username sign-in · no mailbox on file';
        }
        return user.email || 'Signed in to KanjiWidgets';
    }

    // Shown before the session ends, so nobody loses a photo they meant to keep.
    static SIGN_OUT_CONFIRM =
        'Sign out of the app?\n\nRemoved from this device: your uploaded photo and its crop, ' +
        'your nickname and your username.\nKept: kanji progress, reviews, streaks, themes and ' +
        'local backups.\n\nDrive keeps its own Disconnect button.';

    // An event the user did not start, so it explains itself instead of just happening.
    static SIGNED_OUT_ELSEWHERE_MESSAGE =
        'Signed out in another tab. This tab ended its session too, and removed your photo, name and username from this device; learning progress stays.';

    static SIGNED_OUT_MESSAGE =
        'Signed out of the app. Your photo, name and username were removed from this device; learning progress stays. On a shared device, Recovery & privacy → Disconnect & clear this device also removes local study data. Drive has its own Disconnect button.';

    // The visible identity goes with the session: the uploaded photo and its crop, the
    // nickname, the username mirror and the remembered availability answers. Learning
    // progress, reviews, streaks, themes and local backups are deliberately kept.
    async afterSignOut() {
        try {
            await window.driveBackup?.clearSignedOutIdentity?.();
        } catch {
            /* the session has already ended; identity cleanup is best effort */
        }
        window.kanjiUsernames?.forgetIdentity?.();
    }

    // Deletion is the one action that cannot be undone, so it states everything it
    // touches, including what it deliberately leaves alone.
    static DELETE_CONFIRM =
        'Delete this account permanently?\n\n' +
        'Deleted: the sign-in itself, the account record, the cloud copy of your progress, ' +
        'and your username (it becomes claimable again after the usual 30 days).\n' +
        'Kept: the kanji progress, reviews, themes and backups stored on this device.\n\n' +
        'This cannot be undone. Export a backup first if you want the cloud copy.';

    static DELETE_LABEL = 'Delete account';

    // Scheduling asks twice: the confirm explains the deadline, then the password (or the
    // Google popup) proves it is the owner asking. Nothing is removed until the deadline.
    static SCHEDULE_CONFIRM =
        'Delete this account?\n\n' +
        'It is scheduled for permanent deletion in 7 days, on %DATE%. Until then you can ' +
        'cancel it by signing in and pressing Cancel deletion.\n\n' +
        'Deleted then: the sign-in itself, the account record, the cloud copy of your ' +
        'progress, and your username (claimable again after the usual 30 days).\n' +
        'Kept: the kanji progress, reviews, themes and backups stored on this device.';

    static DELETION_GRACE_DAYS = 7;

    static scheduleConfirmText(when) {
        return AppAuth.SCHEDULE_CONFIRM.replace('%DATE%', AppAuth.describeDeadline(when));
    }

    static deletionDeadline(from = Date.now()) {
        return from + AppAuth.DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000;
    }

    static describeDeadline(millis) {
        return new Date(millis).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    scheduleMessage(when) {
        return `Account deletion scheduled for ${AppAuth.describeDeadline(when)}. Until then you can cancel it from this dialog, the profile page or the Danger Zone. Nothing is removed yet; learning data on this device is never deleted.`;
    }

    // The only emails Firebase can send on the free plan are its own templates, so the
    // confirmation is the standard verification link (which also proves the mailbox).
    // Addresses that are already confirmed, and username-only accounts, get no email and
    // are told exactly why instead of being promised one.
    async sendDeletionNotice() {
        const user = this.user;
        if (!user?.email || AppAuth.isAliasAccount(user)) {
            return {
                sent: false,
                note: 'No confirmation email was sent: this is a username-only account with no mailbox. Cancel any time from this dialog.'
            };
        }
        if (user.emailVerified) {
            return {
                sent: false,
                note: `No new email was sent: ${user.email} is already confirmed. Cancel any time from this dialog.`
            };
        }
        try {
            await this.sdk.sendEmailVerification(user, {
                url: `${location.origin}/?account=deletion`
            });
            return {
                sent: true,
                note: `A confirmation link was emailed to ${user.email}. It confirms the mailbox; the link also returns you here, where you can cancel.`
            };
        } catch (error) {
            return {
                sent: false,
                note: `The confirmation email could not be sent (${AppAuth.errorMessage(error)}). The schedule still stands; cancel from this dialog.`
            };
        }
    }

    async scheduleAccountDeletion({ password = '', confirm: ask = true } = {}) {
        if (!this.ready || this.busy || !this.user) {
            return { ok: false, message: 'Sign in first, then delete the account.' };
        }
        const when = AppAuth.deletionDeadline();
        if (ask && !window.confirm(AppAuth.scheduleConfirmText(when))) {
            this.message = '';
            return { ok: false, cancelled: true, message: '' };
        }
        const identity = await this.reauthenticate({ password });
        if (!identity.ok) {
            return identity;
        }
        this.busy = true;
        this.render();
        try {
            const directory = window.kanjiUsernames;
            if (!directory?.requestDeletion) {
                throw new Error('The account record is unavailable right now.');
            }
            await directory.requestDeletion(when);
            const notice = await this.sendDeletionNotice();
            this.message = `${this.scheduleMessage(when)} ${notice.note}`;
            return { ok: true, message: this.message, scheduledFor: when, emailed: notice.sent };
        } catch (error) {
            const message = `The deletion could not be scheduled: ${AppAuth.errorMessage(error)} Nothing was removed.`;
            window.KanjiFeedback?.show(message, { title: 'Not scheduled' });
            return { ok: false, message };
        } finally {
            this.busy = false;
            this.render();
        }
    }

    async cancelAccountDeletion() {
        if (!this.ready || this.busy || !this.user) {
            return { ok: false, message: 'Sign in first.' };
        }
        if (
            !window.confirm(
                'Cancel the scheduled deletion? The account, its cloud progress and the username stay as they are.'
            )
        ) {
            return { ok: false, cancelled: true, message: '' };
        }
        this.busy = true;
        this.render();
        try {
            await window.kanjiUsernames?.cancelDeletion?.();
            this.message = 'Scheduled deletion cancelled. The account and its cloud copy stay.';
            return { ok: true, message: this.message };
        } catch (error) {
            const message = `The scheduled deletion could not be cancelled: ${AppAuth.errorMessage(error)}`;
            window.KanjiFeedback?.show(message, { title: 'Still scheduled' });
            return { ok: false, message };
        } finally {
            this.busy = false;
            this.render();
        }
    }

    // Nobody runs a server timer on the free plan, so the deadline is honoured the next
    // time the account touches the app: overdue means delete now.
    async enforceScheduledDeletion() {
        const directory = window.kanjiUsernames;
        const due = directory?.deletionScheduledFor?.();
        if (!due || due > Date.now()) {
            return { due: due || null, deleted: false };
        }
        const result = await this.deleteAccount({ confirm: false, reauth: false });
        return { due, deleted: Boolean(result?.ok), message: result?.message };
    }

    // Deleting a Firebase user needs a recent sign-in, so the password (or the Google
    // popup) is collected right before the request. Nothing is stored or cached here.
    async reauthenticate({ password = '' } = {}) {
        const user = this.user;
        if (!user) {
            return { ok: false, message: 'Sign in first.' };
        }
        const hasPassword = AppAuth.hasPassword(user);
        try {
            if (hasPassword && typeof this.sdk.reauthenticateWithCredential === 'function') {
                if (!password) {
                    return { ok: false, message: 'Enter your password to confirm deletion.' };
                }
                const credential = this.sdk.EmailAuthProvider.credential(user.email, password);
                await this.sdk.reauthenticateWithCredential(user, credential);
                return { ok: true };
            }
            if (typeof this.sdk.reauthenticateWithPopup === 'function') {
                await this.sdk.reauthenticateWithPopup(user, new this.sdk.GoogleAuthProvider());
                return { ok: true };
            }
            return {
                ok: false,
                message: 'Sign out and back in, then try deleting the account again.'
            };
        } catch (error) {
            const wrong =
                error?.code === 'auth/wrong-password' || error?.code === 'auth/invalid-credential';
            return {
                ok: false,
                message: wrong
                    ? 'That password did not match, so nothing was deleted.'
                    : `Could not confirm it was you: ${AppAuth.errorMessage(error)}`
            };
        }
    }

    // Order matters. The username release and the account records need the session that
    // is about to disappear, and the sign-in itself is deleted last. A failure part way
    // through says exactly what did and did not happen; nothing claims success early.
    async deleteAccount({ password = '', confirm: ask = true, reauth = true } = {}) {
        if (!this.ready || this.busy || !this.user) {
            return { ok: false, message: 'Sign in first, then delete the account.' };
        }
        if (ask && !window.confirm(AppAuth.DELETE_CONFIRM)) {
            this.message = '';
            return { ok: false, cancelled: true, message: '' };
        }
        if (reauth) {
            const identity = await this.reauthenticate({ password });
            if (!identity.ok) {
                return identity;
            }
        }
        this.busy = true;
        this.render();
        const done = [];
        try {
            const directory = window.kanjiUsernames;
            if (directory?.handle?.username) {
                await directory.releaseForDeletion();
                done.push('username released');
            }
            await directory?.deleteAccountRecord?.();
            await window.kanjiCloud?.deleteAccountData?.();
            await this.sdk.deleteUser(this.user);
            done.push('sign-in deleted');
            this.user = null;
            // Same cleanup as a sign-out: the deleted account must not leave a face or a
            // name on the device.
            await this.afterSignOut();
            this.message =
                'Account deleted. The sign-in, account record, cloud progress and username are gone; learning data on this device is untouched.';
            return { ok: true, message: this.message, steps: done };
        } catch (error) {
            const partial = done.length
                ? ` Already finished: ${done.join(', ')}. The sign-in still exists, so you can retry.`
                : '';
            const message =
                error?.code === 'auth/requires-recent-login'
                    ? `The account was not deleted: confirm it is you by signing out and back in, then retry.${partial}`
                    : `The account was not deleted: ${AppAuth.errorMessage(error)}${partial}`;
            window.KanjiFeedback?.show(message, { title: 'Account not deleted' });
            return { ok: false, message };
        } finally {
            this.busy = false;
            this.render();
        }
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
            'auth/no-more-sign-in-methods':
                'That is the only way to sign in to this account, so it was kept. Add another method first.',
            'auth/no-such-provider': 'That sign-in method is not on this account.',
            'auth/unverified-email':
                'Confirm this email address first, then change how you sign in.',
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
            const project = window.KANJI_FIREBASE_CONFIG?.projectId || 'the Firebase project';
            return `This website is blocked for sign-in. In Google Cloud, open project “${project}” → APIs & Services → Credentials → the key named “Browser key (auto created by Firebase)” → Application restrictions → Website restrictions (HTTP referrers), and add ${origin}/*. Changes can take a few minutes to apply.`;
        }
        if (/^auth\/requests-to-this-api/.test(code)) {
            const project = window.KANJI_FIREBASE_CONFIG?.projectId || 'the Firebase project';
            return `The browser API key blocks the sign-in API. In Google Cloud project “${project}” → Credentials → the browser key → API restrictions, allow Identity Toolkit API, Token Service API and Cloud Firestore API, or choose “Don’t restrict key”.`;
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

    // One place draws the deletion state, so the dialog, the profile page and the Danger
    // Zone can never disagree about whether a deletion is pending.
    static renderDeletionState(user, { busy = false } = {}) {
        const due = user ? window.kanjiUsernames?.deletionScheduledFor?.() || null : null;
        const pending = Boolean(due);
        const left = pending
            ? Math.max(0, Math.ceil((due - Date.now()) / (24 * 60 * 60 * 1000)))
            : 0;
        const status = pending
            ? `Deletion scheduled for ${AppAuth.describeDeadline(due)} (${left} day${
                  left === 1 ? '' : 's'
              } left). The sign-in, the account record, the cloud progress and the username go then; learning data on this device stays.`
            : user
              ? 'Asking to delete the account schedules it 7 days later, so a mistake can be undone. Local learning data is never deleted with it.'
              : '';
        document.querySelectorAll('[data-delete-account-open]').forEach((button) => {
            button.hidden = !user;
            button.disabled = Boolean(busy);
        });
        document.querySelectorAll('[data-cancel-deletion]').forEach((button) => {
            button.hidden = !pending;
            button.disabled = Boolean(busy);
        });
        document.querySelectorAll('[data-account-deletion-status]').forEach((node) => {
            node.textContent = status;
        });
        const line = document.getElementById('authDeletionPending');
        if (line) {
            line.textContent = status;
            line.hidden = !pending;
        }
        const cancel = document.getElementById('authCancelDeletion');
        if (cancel) {
            cancel.hidden = !pending;
            cancel.disabled = Boolean(busy);
        }
        const now = document.getElementById('authDeleteNow');
        if (now) {
            now.hidden = !user;
            now.disabled = Boolean(busy);
        }
        const ask = document.getElementById('authDeleteAccount');
        if (ask) {
            ask.disabled = Boolean(busy);
            ask.textContent = pending ? 'Change deletion' : 'Delete account';
        }
    }

    static providers(user) {
        return (user?.providerData || []).map((entry) => entry.providerId);
    }

    static hasPassword(user) {
        return user?.providerData?.some((entry) => entry.providerId === 'password') || false;
    }

    // A sign-in method can only be removed while another one stays, so nobody can lock
    // themselves out. Returns the reason, so the dialog can explain instead of offering
    // a button that would be refused.
    static removalCheck(user, providerId) {
        const providers = AppAuth.providers(user);
        if (!providerId || !providers.includes(providerId)) {
            return {
                ok: false,
                reason: 'not-linked',
                message: 'That sign-in method is not on this account.'
            };
        }
        if (providers.length <= 1) {
            return {
                ok: false,
                reason: 'last-method',
                message:
                    providerId === 'password'
                        ? 'Your password is the only way into this account, so it cannot be removed. Link Google first.'
                        : 'Google is the only way into this account, so it cannot be unlinked. Add a password first.'
            };
        }
        return { ok: true, reason: '', message: '' };
    }

    // Removing a method touches the sign-in only: learning data, local backups, cloud
    // progress and Drive access are all untouched, and the directory republishes the
    // identity on the auth event.
    async unlinkProvider(providerId, { password = '' } = {}) {
        if (!this.ready || this.busy || !this.user) {
            return { ok: false, message: 'Sign in first.' };
        }
        const check = AppAuth.removalCheck(this.user, providerId);
        if (!check.ok) {
            this.message = check.message;
            this.render();
            return { ok: false, message: check.message, code: `app/${check.reason}` };
        }
        const google = providerId === 'google.com';
        if (!google && !String(password ?? '')) {
            return {
                ok: false,
                message: 'Enter your current password to remove it.',
                code: 'app/missing-fields'
            };
        }
        this.busy = true;
        this.message = google ? 'Unlinking Google from this account…' : 'Removing the password…';
        this.render();
        try {
            if (!google) {
                // Prove ownership first: an unattended session must not be enough to
                // strip the password off the account.
                const credential = this.sdk.EmailAuthProvider.credential(this.user.email, password);
                await this.sdk.reauthenticateWithCredential(this.user, credential);
            }
            await this.sdk.unlink(this.user, providerId);
            this.message = google
                ? 'Google is no longer linked. Sign in with your email or username and your password. Drive backups keep their own connection.'
                : 'Password removed. Sign in with Google from now on; you can add a password again at any time.';
            window.dispatchEvent(new Event('kanji-auth-changed'));
            return { ok: true, providerId, message: this.message };
        } catch (error) {
            const wrong =
                error?.code === 'auth/wrong-password' || error?.code === 'auth/invalid-credential';
            const message = wrong
                ? 'That password did not match, so nothing was removed.'
                : AppAuth.errorMessage(error);
            this.message = message;
            return { ok: false, message, code: error?.code };
        } finally {
            this.busy = false;
            this.render();
        }
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
        document.querySelectorAll('[data-cancel-deletion]').forEach((button) => {
            button.onclick = () => this.cancelAccountDeletion();
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
                        const hadUser = Boolean(this.user);
                        this.user = user;
                        if (hadUser && !user) {
                            // Signed out here or in another tab (the SDK syncs sessions
                            // across tabs): the visible identity must go with it.
                            void this.afterSignOut();
                            this.message = this.signingOut
                                ? AppAuth.SIGNED_OUT_MESSAGE
                                : AppAuth.SIGNED_OUT_ELSEWHERE_MESSAGE;
                            if (!this.signingOut) {
                                window.KanjiFeedback?.show(this.message, {
                                    kind: 'info',
                                    title: 'Signed out'
                                });
                            }
                        } else {
                            this.message = '';
                        }
                        window.dispatchEvent(new Event('kanji-auth-changed'));
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
            this.signingOut = false;
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

    async signOut(options = {}) {
        if (!this.ready || this.busy) {
            return false;
        }
        this.message = '';
        if (options.confirm !== false && !window.confirm(AppAuth.SIGN_OUT_CONFIRM)) {
            // Cancelled: nothing was signed out and nothing was removed.
            this.render();
            return false;
        }
        this.busy = true;
        this.signingOut = true;
        this.render();
        try {
            await this.sdk.signOut(this.auth);
            this.user = null;
            await this.afterSignOut();
            this.message = AppAuth.SIGNED_OUT_MESSAGE;
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
                ? `App signed in: ${AppAuth.accountLabel(this.user)}. See Cloud progress below for save status.`
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
        // The disclosure is shown exactly while the sign-out button is.
        document.querySelectorAll('[data-sign-out-note]').forEach((note) => {
            note.hidden = !this.user;
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
        AppAuth.renderDeletionState(this.user, { busy: this.busy });
        window.driveBackup?.renderAccount?.();
        window.kanjiProfilePage?.refresh();
    }
}
window.AppAuth = AppAuth;
window.addEventListener('DOMContentLoaded', () => {
    window.kanjiAuth = new AppAuth();
    window.kanjiAuth.init();
});
