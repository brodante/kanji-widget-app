/* global AppAuth, UsernamePolicy, UsernameDirectory */
// One dialog owns every sign-in method: password, username or Google. It keeps
// credentials out of app storage and only talks to AppAuth and UsernameDirectory.
class AuthDialog {
    static DEBOUNCE = 400;
    // Availability checks are cheap but Firestore reads are not free on Spark, so
    // typing cannot fire a request faster than this.
    static MIN_GAP = 700;

    static strength(value) {
        const password = String(value || '');
        const score = [
            password.length >= 8,
            password.length >= 12,
            /[a-z]/.test(password) && /[A-Z]/.test(password),
            /[0-9]/.test(password),
            /[^A-Za-z0-9]/.test(password)
        ].filter(Boolean).length;
        if (score >= 5) {
            return 'Strong';
        }
        if (score >= 4) {
            return 'Good';
        }
        if (score >= 3) {
            return 'Fair';
        }
        return 'Weak';
    }

    static maskEmail(value) {
        const address = String(value || '');
        const [name, domain] = address.split('@');
        if (!name || !domain) {
            return '';
        }
        const head = name.slice(0, 1);
        const tail = name.length > 2 ? name.slice(-1) : '';
        return `${head}${'•'.repeat(Math.max(2, Math.min(6, name.length - 2)))}${tail}@${domain}`;
    }

    constructor(deps = {}) {
        this.directory = deps.directory || (() => window.kanjiUsernames);
        this.auth = deps.auth || (() => window.kanjiAuth);
        this.dialog = document.getElementById('authDialog');
        this.tab = 'signin';
        this.usernameTimer = null;
        this.usernameToken = 0;
        this.usernameResult = null;
        this.lastUsernameCheckAt = 0;
        this.busy = false;
    }

    el(id) {
        return document.getElementById(id);
    }

    init() {
        if (!this.dialog) {
            return;
        }
        for (const button of document.querySelectorAll('[data-auth-open]')) {
            button.onclick = () => this.open(button.dataset.authOpen);
        }
        this.el('authClose')?.addEventListener('click', () => this.close());
        this.el('authDialogDone')?.addEventListener('click', () => this.close());
        this.dialog.addEventListener('cancel', (event) => {
            event.preventDefault();
            this.close();
        });
        this.dialog.addEventListener('close', () => {
            document.body.classList.remove('auth-dialog-open');
        });
        for (const tab of this.dialog.querySelectorAll('[data-auth-tab]')) {
            tab.onclick = () => this.switchTab(tab.dataset.authTab);
        }
        this.el('authSignInForm')?.addEventListener('submit', (event) => this.submitSignIn(event));
        this.el('authCreateForm')?.addEventListener('submit', (event) => this.submitCreate(event));
        this.el('authSignInForgot')?.addEventListener('click', () => this.resetPassword());
        this.el('authGoogleBtn')?.addEventListener('click', () => this.continueWithGoogle());
        for (const reveal of this.dialog.querySelectorAll('[data-auth-reveal]')) {
            reveal.onclick = () => {
                const field = this.el(reveal.dataset.authReveal);
                if (!field) {
                    return;
                }
                const hidden = field.type === 'password';
                field.type = hidden ? 'text' : 'password';
                reveal.textContent = hidden ? 'Hide' : 'Show';
                reveal.setAttribute('aria-label', `${hidden ? 'Hide' : 'Show'} password`);
            };
        }
        const username = this.el('authCreateUsername');
        if (username) {
            username.oninput = () => this.scheduleUsernameCheck();
            username.onblur = () => this.scheduleUsernameCheck(null, 'create', 0);
        }
        const password = this.el('authCreatePassword');
        if (password) {
            password.oninput = () => this.renderStrength();
        }
        const change = this.el('authUsernameChange');
        if (change) {
            change.oninput = () => this.scheduleUsernameCheck(change.value, 'change');
        }
        this.el('authVerifyEmail')?.addEventListener('click', () => this.verifyEmail());
        this.el('authAddRecoveryEmail')?.addEventListener('click', () => this.addRecoveryEmail());
        this.el('authLinkGoogle')?.addEventListener('click', () => this.linkGoogle());
        this.el('authAddPasswordForm')?.addEventListener('submit', (event) =>
            this.linkPassword(event)
        );
        this.el('authUsernameForm')?.addEventListener('submit', (event) =>
            this.saveUsername(event)
        );
        this.el('authUsernameCheck')?.addEventListener('click', () =>
            this.scheduleUsernameCheck(change?.value || '', 'change', 0)
        );
        this.el('authSignOut')?.addEventListener('click', () => this.signOut());
        window.addEventListener('kanji-auth-changed', () => this.render());
        window.addEventListener('kanji-handle-changed', () => this.render());
    }

    open(tab = 'signin', options = {}) {
        if (!this.dialog) {
            return;
        }
        const auth = this.auth();
        if (auth?.user) {
            this.tab = 'account';
            this.render();
            if (options.focusUsername !== false) {
                this.el('authUsernameChange')?.focus?.();
            }
        } else {
            this.switchTab(tab === 'account' ? 'signin' : tab);
        }
        if (!this.dialog.open) {
            this.dialog.showModal();
        }
        document.body.classList.add('auth-dialog-open');
        this.render();
        if (document.activeElement === document.body) {
            this.el(this.tab === 'create' ? 'authCreateEmail' : 'authSignInIdentifier')?.focus();
        }
    }

    close() {
        if (!this.dialog) {
            return;
        }
        if (this.dialog.open) {
            this.dialog.close();
        }
        document.body.classList.remove('auth-dialog-open');
        this.setFeedback('info', '');
        this.el('authSignInPassword').value = '';
    }

    switchTab(tab) {
        if (tab !== 'signin' && tab !== 'create') {
            return;
        }
        this.tab = tab;
        this.setFeedback('info', '');
        this.render();
        this.el(tab === 'create' ? 'authCreateEmail' : 'authSignInIdentifier')?.focus();
    }

    setFeedback(kind, message) {
        const node = this.el('authFeedback');
        if (!node) {
            return;
        }
        node.textContent = message || '';
        node.classList.toggle('auth-feedback--error', kind === 'error');
        node.classList.toggle('auth-feedback--success', kind === 'success');
        node.hidden = !message;
    }

    setBusy(busy, note = '') {
        this.busy = busy;
        for (const button of [
            this.el('authSignInSubmit'),
            this.el('authCreateSubmit'),
            this.el('authGoogleBtn'),
            this.el('authSignInForgot')
        ]) {
            if (button) {
                button.disabled = busy;
                button.setAttribute('aria-busy', String(busy));
            }
        }
        if (note) {
            this.setFeedback('info', note);
        }
    }

    get ready() {
        return Boolean(this.auth()?.ready) && !this.busy;
    }

    // ---------------------------------------------------------------- sign in

    async submitSignIn(event) {
        event.preventDefault();
        const auth = this.auth();
        if (!auth?.ready) {
            this.setFeedback('error', 'Sign-in is still starting. Wait a moment, then try again.');
            return;
        }
        const identifier = this.el('authSignInIdentifier').value.trim();
        const password = this.el('authSignInPassword').value;
        if (!identifier || !password) {
            this.setFeedback('error', 'Enter your email or username and your password.');
            return;
        }
        this.setBusy(true, 'Signing in…');
        const result = await auth.signInWithEmail(identifier, password);
        this.setBusy(false);
        if (result.ok) {
            this.setFeedback('success', `Signed in as ${result.email}.`);
            this.el('authSignInPassword').value = '';
            const directory = this.directory();
            if (directory) {
                await directory.sync();
                window.KanjiFeedback?.show(
                    directory.handle?.username
                        ? `Signed in as @${directory.handle.username}. Cloud saving still asks before it uploads.`
                        : 'Signed in. Local progress is unchanged; Cloud progress still asks what to keep.',
                    { kind: 'info' }
                );
            }
            this.render();
            return;
        }
        this.setFeedback('error', await this.explainSignInFailure(identifier, result));
    }

    // A failed username sign-in can say why without revealing any account details.
    async explainSignInFailure(identifier, result) {
        const directory = this.directory();
        if (!directory || UsernamePolicy.looksLikeEmail(identifier)) {
            return result.message;
        }
        if (!(result.code === 'auth/invalid-credential' || result.code === 'auth/user-not-found')) {
            return result.message;
        }
        const check = await directory.available(identifier);
        if (check.available === false && check.reason === 'reserved') {
            return 'That username was recently changed by its owner. Sign in with the new one, or use your email.';
        }
        if (check.available === true) {
            return `No account uses @${check.username} yet. Create one with the Create account tab.`;
        }
        return `${result.message} If you signed up with a username, check the spelling.`;
    }

    async resetPassword() {
        const auth = this.auth();
        if (!auth?.ready) {
            this.setFeedback('error', 'Sign-in is still starting. Wait a moment, then try again.');
            return;
        }
        const identifier = this.el('authSignInIdentifier').value.trim();
        if (!identifier) {
            this.setFeedback('error', 'Enter your email or username first, then choose reset.');
            return;
        }
        this.setBusy(true, 'Checking how to reset this password…');
        const directory = this.directory();
        const normalized = AppAuth.normalizeIdentifier(identifier);
        let target = identifier;
        if (AppAuth.isAliasAddress(normalized) && directory) {
            const check = await directory.available(identifier);
            const email = check.available ? '' : await directory.directoryEmail?.(check.username);
            if (email) {
                this.setBusy(false);
                const send = window.confirm
                    ? window.confirm(
                          `Send a password reset link to ${AuthDialog.maskEmail(email)}?`
                      )
                    : false;
                if (!send) {
                    this.setFeedback(
                        'info',
                        'Reset cancelled. That account can also sign in with its username.'
                    );
                    return;
                }
                target = email;
            } else {
                this.setBusy(false);
                this.setFeedback(
                    'error',
                    'That account has no mailbox on file yet, so there is no reset link to send. Sign in with your password, then add a recovery email in Profile.'
                );
                return;
            }
        } else {
            this.setBusy(true, 'Sending a password reset link…');
        }
        const result = await auth.sendPasswordReset(target);
        this.setBusy(false);
        this.setFeedback(result.ok ? 'success' : 'error', result.message);
    }

    async continueWithGoogle() {
        const auth = this.auth();
        if (!auth?.ready) {
            this.setFeedback('error', 'Sign-in is still starting. Wait a moment, then try again.');
            return;
        }
        this.setBusy(true, 'Complete sign-in in the Google window.');
        const result = await auth.signIn();
        this.setBusy(false);
        if (!result?.ok) {
            this.setFeedback('error', result?.message || 'Google sign-in did not complete.');
            return;
        }
        const directory = this.directory();
        const handle = directory ? await directory.sync() : null;
        if (!handle?.username) {
            this.tab = 'account';
            this.setFeedback(
                'info',
                'Signed in with Google. Choose a unique username below to finish setting up your account.'
            );
            this.render();
            this.el('authUsernameChange')?.focus?.();
            return;
        }
        this.setFeedback('success', `Signed in as @${handle.username}.`);
        this.render();
    }

    // ---------------------------------------------------------------- create

    async submitCreate(event) {
        event.preventDefault();
        const auth = this.auth();
        if (!auth?.ready) {
            this.setFeedback('error', 'Sign-in is still starting. Wait a moment, then try again.');
            return;
        }
        const email = this.el('authCreateEmail').value.trim();
        const username = this.el('authCreateUsername').value.trim();
        const password = this.el('authCreatePassword').value;
        const confirm = this.el('authCreatePasswordConfirm').value;
        const displayName = this.el('authCreateName').value.trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
            this.setFeedback('error', 'Enter a valid email address.');
            this.el('authCreateEmail').focus();
            return;
        }
        const policy = UsernamePolicy.validate(username);
        if (!policy.ok) {
            this.setFeedback('error', policy.message);
            this.el('authCreateUsername').focus();
            return;
        }
        if (this.usernameResult?.available === false) {
            this.setFeedback('error', this.usernameResult.message);
            this.el('authCreateUsername').focus();
            return;
        }
        if (password.length < 8) {
            this.setFeedback('error', 'Use a password of at least 8 characters.');
            this.el('authCreatePassword').focus();
            return;
        }
        if (password !== confirm) {
            this.setFeedback('error', 'Both passwords must match.');
            this.el('authCreatePasswordConfirm').focus();
            return;
        }
        if (this.el('authCreateConsent') && !this.el('authCreateConsent').checked) {
            this.setFeedback(
                'error',
                'Confirm that you understand local progress is not uploaded by signing in.'
            );
            return;
        }
        this.setBusy(true, 'Creating your account…');
        const created = await auth.createAccount({ email, password, displayName });
        if (!created.ok) {
            this.setBusy(false);
            this.setFeedback('error', created.message);
            return;
        }
        const directory = this.directory();
        const claimed = directory
            ? await directory.reserve(policy.username, { email })
            : { ok: true };
        this.setBusy(false);
        if (!claimed.ok) {
            this.tab = 'account';
            this.el('authUsernameChange').value = policy.username;
            this.setFeedback(
                'error',
                `${created.message || 'Account created.'} ${claimed.message || ''}`.trim()
            );
            this.render();
            this.renderUsername(claimed.suggestions?.length ? claimed : null, 'change');
            return;
        }
        this.tab = 'account';
        this.render();
        this.setFeedback(
            'success',
            `Account created. You are @${policy.username}. Check ${email} to confirm the address, then sign in from any device.`
        );
        window.KanjiFeedback?.show(
            `Welcome, @${policy.username}. Your progress stays local until you approve sync.`,
            {
                kind: 'info'
            }
        );
    }

    async verifyEmail() {
        const auth = this.auth();
        if (!auth?.ready) {
            return;
        }
        this.setBusy(true, 'Sending a verification link…');
        const result = await auth.sendVerificationEmail();
        this.setBusy(false);
        this.setFeedback(result.ok ? 'success' : 'error', result.message);
    }

    async addRecoveryEmail() {
        const auth = this.auth();
        const field = this.el('authRecoveryEmail');
        if (!auth?.ready || !field) {
            return;
        }
        const email = field.value.trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
            this.setFeedback('error', 'Enter a valid email address.');
            return;
        }
        this.setBusy(true, 'Sending a confirmation link…');
        const result = await auth.addRecoveryEmail(email);
        this.setBusy(false);
        this.setFeedback(result.ok ? 'success' : 'error', result.message);
    }

    async linkGoogle() {
        const auth = this.auth();
        if (!auth?.ready) {
            return;
        }
        this.setBusy(true, 'Complete Google linking in the popup window.');
        const result = await auth.linkGoogle();
        this.setBusy(false);
        this.setFeedback(result.ok ? 'success' : 'error', result.message);
    }

    async linkPassword(event) {
        event.preventDefault();
        const auth = this.auth();
        if (!auth?.ready) {
            return;
        }
        const email = this.el('authAddPasswordEmail').value.trim();
        const password = this.el('authAddPasswordValue').value;
        if (password.length < 8) {
            this.setFeedback('error', 'Use a password of at least 8 characters.');
            return;
        }
        this.setBusy(true, 'Adding a password to this account…');
        const result = await auth.linkPassword(email, password);
        this.setBusy(false);
        if (result.ok) {
            this.el('authAddPasswordValue').value = '';
            this.setFeedback(
                'success',
                `${result.message} Sign in from now on with ${result.email} and that password.`
            );
        } else {
            this.setFeedback('error', result.message);
        }
    }

    async signOut() {
        const auth = this.auth();
        if (!auth?.ready) {
            return;
        }
        this.setBusy(true);
        const done = await auth.signOut();
        this.setBusy(false);
        this.tab = 'signin';
        this.render();
        this.setFeedback(
            'info',
            done
                ? 'Signed out. Local progress is kept. Drive has its own Disconnect button.'
                : 'Sign-out did not complete.'
        );
    }

    // -------------------------------------------------------------- username

    async saveUsername(event) {
        event.preventDefault();
        const directory = this.directory();
        const field = this.el('authUsernameChange');
        if (!directory || !field) {
            return;
        }
        const value = field.value.trim();
        if (!value) {
            this.setFeedback('error', 'Choose a username first.');
            return;
        }
        this.setBusy(true, directory.handle?.username ? 'Saving…' : 'Claiming your username…');
        const result = directory.handle?.username
            ? await directory.rename(value)
            : await directory.reserve(value);
        this.setBusy(false);
        if (!result.ok) {
            this.setFeedback('error', result.message);
            this.renderUsername(result.suggestions?.length ? result : null, 'change');
            return;
        }
        field.value = '';
        this.render();
        this.setFeedback(
            'success',
            result.previous
                ? `Username changed to @${result.username}. @${result.previous} stays reserved for ${UsernamePolicy.RESERVATION_DAYS} days.`
                : `Your username is @${result.username}. Sign in with it or your email from any device.`
        );
    }

    // ------------------------------------------------------ availability UI

    scheduleUsernameCheck(value = null, mode = 'create', delay = AuthDialog.DEBOUNCE) {
        const source =
            mode === 'change' ? this.el('authUsernameChange') : this.el('authCreateUsername');
        const typed = value === null ? source?.value || '' : value;
        clearTimeout(this.usernameTimer);
        if (!typed.trim()) {
            this.renderUsername(null, mode);
            return;
        }
        this.usernameTimer = setTimeout(() => this.runUsernameCheck(typed, mode), delay);
    }

    async runUsernameCheck(value, mode = 'create') {
        const directory = this.directory();
        if (!directory) {
            return;
        }
        const since = Date.now() - this.lastUsernameCheckAt;
        if (since < AuthDialog.MIN_GAP) {
            clearTimeout(this.usernameTimer);
            this.usernameTimer = setTimeout(
                () => this.runUsernameCheck(value, mode),
                AuthDialog.MIN_GAP - since
            );
            return;
        }
        this.lastUsernameCheckAt = Date.now();
        const token = ++this.usernameToken;
        this.renderUsername({ state: 'checking', message: 'Checking availability…' }, mode);
        const result = await directory.available(value);
        if (token !== this.usernameToken) {
            return;
        }
        this.usernameResult = result;
        this.renderUsername(result, mode);
    }

    renderUsername(result, mode = 'create') {
        const status = this.el(
            mode === 'change' ? 'authUsernameChangeStatus' : 'authUsernameStatus'
        );
        if (status) {
            const state =
                result?.state ||
                (result?.available === true
                    ? 'free'
                    : result?.available === false
                      ? 'taken'
                      : 'unknown');
            status.textContent = result?.message || '';
            status.className = `auth-username-status auth-username-status--${state}`;
            status.hidden = !result?.message;
        }
        if (mode === 'change') {
            return;
        }
        const list = this.el('authUsernameSuggestions');
        if (list) {
            list.textContent = '';
            const suggestions = result?.suggestions || [];
            if (suggestions.length) {
                const label = document.createElement('span');
                label.textContent = 'Try: ';
                list.append(label);
                for (const suggestion of suggestions) {
                    const button = document.createElement('button');
                    button.type = 'button';
                    button.className = 'auth-suggestion';
                    button.textContent = suggestion;
                    button.onclick = () => {
                        this.el('authCreateUsername').value = suggestion;
                        this.scheduleUsernameCheck();
                    };
                    list.append(button);
                }
            }
            list.hidden = !suggestions.length;
        }
        const submit = this.el('authCreateSubmit');
        if (submit) {
            submit.disabled = this.busy || result?.available === false;
        }
    }

    renderStrength() {
        const node = this.el('authCreatePasswordStrength');
        if (!node) {
            return;
        }
        const value = this.el('authCreatePassword').value;
        node.textContent = value
            ? `Password strength: ${AuthDialog.strength(value)}. Twelve or more characters with a mix is best.`
            : 'Use at least 8 characters. A passphrase of 12 or more is stronger.';
    }

    render() {
        if (!this.dialog) {
            return;
        }
        const auth = this.auth();
        const signedIn = Boolean(auth?.user);
        AppAuth.renderAccountControls(auth?.user, {
            ready: Boolean(auth?.ready),
            busy: Boolean(auth?.busy)
        });
        const directory = this.directory();
        const handle = directory?.handle || null;
        const pane = signedIn ? 'account' : this.tab;
        for (const node of this.dialog.querySelectorAll('[data-auth-pane]')) {
            node.hidden = node.dataset.authPane !== pane;
        }
        for (const node of this.dialog.querySelectorAll('[data-auth-tab]')) {
            const active = !signedIn && node.dataset.authTab === pane;
            node.classList.toggle('is-active', active);
            node.setAttribute('aria-selected', String(active));
            node.hidden = signedIn;
        }
        const title = this.el('authDialogTitle');
        const intro = this.el('authDialogIntro');
        if (title && intro) {
            if (signedIn) {
                title.textContent = handle?.username
                    ? `Signed in as @${handle.username}`
                    : 'Finish your account';
                intro.textContent =
                    'Manage how you sign in, your username and your account recovery.';
            } else if (pane === 'create') {
                title.textContent = 'Create your account';
                intro.textContent =
                    'Your email and password sign you in on any device. Your username is unique and can also be used to sign in.';
            } else {
                title.textContent = 'Sign in';
                intro.textContent =
                    'Use your email or username and password, or continue with Google.';
            }
        }
        const identity = this.el('authAccountIdentity');
        if (identity) {
            identity.textContent = signedIn
                ? [
                      handle?.username ? `@${handle.username}` : '',
                      auth.user.email || '',
                      auth.user.emailVerified && !AppAuth.isAliasAccount(auth.user)
                          ? 'email confirmed'
                          : ''
                  ]
                      .filter(Boolean)
                      .join(' · ')
                : '';
        }
        const usernameForm = this.el('authUsernameForm');
        if (usernameForm) {
            const label = this.el('authUsernameLabel');
            const hint = this.el('authUsernameHint');
            const hasHandle = Boolean(handle?.username);
            if (label) {
                label.textContent = hasHandle ? 'Change username' : 'Choose your username';
            }
            if (hint) {
                const days = directory?.renameDaysLeft?.() || 0;
                hint.textContent = hasHandle
                    ? days > 0
                        ? `Usernames can change once every ${UsernamePolicy.RENAME_COOLDOWN_DAYS} days. Available again in ${days} day${days === 1 ? '' : 's'}.`
                        : `Changing keeps @${handle.username} reserved for ${UsernamePolicy.RESERVATION_DAYS} days.`
                    : 'Letters, numbers and underscores. 3 to 20 characters, starting with a letter.';
            }
            const submit = this.el('authSaveUsername');
            if (submit) {
                submit.textContent = handle?.username ? 'Change username' : 'Claim username';
                submit.disabled = this.busy;
            }
        }
        const addPassword = this.el('authAddPasswordSection');
        if (addPassword) {
            const hasPassword = AppAuth.hasPassword(auth?.user);
            addPassword.hidden = !signedIn || hasPassword;
            const field = this.el('authAddPasswordEmail');
            if (
                field &&
                signedIn &&
                !hasPassword &&
                !field.value &&
                !AppAuth.isAliasAccount(auth.user)
            ) {
                field.value = auth.user.email || '';
            }
        }
        const linkGoogle = this.el('authLinkGoogle');
        if (linkGoogle) {
            linkGoogle.hidden = !signedIn || AppAuth.providers(auth?.user).includes('google.com');
        }
        const recovery = this.el('authRecoverySection');
        if (recovery) {
            recovery.hidden = !signedIn || !AppAuth.isAliasAccount(auth?.user);
        }
        this.renderStrength();
    }
}
window.AuthDialog = AuthDialog;
window.addEventListener('DOMContentLoaded', () => {
    window.kanjiUsernames = new UsernameDirectory();
    window.kanjiAuthDialog = new AuthDialog();
    window.kanjiAuthDialog.init();
    window.addEventListener('kanji-auth-changed', () => {
        window.kanjiUsernames.sync();
    });
});
