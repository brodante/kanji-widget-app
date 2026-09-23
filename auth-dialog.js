/* global AppAuth, UsernamePolicy, UsernameDirectory */
// One dialog owns every sign-in method: password, username or Google. It keeps
// credentials out of app storage and only talks to AppAuth and UsernameDirectory.
class AuthDialog {
    static DEBOUNCE = 400;
    // Availability checks are cheap but Firestore reads are not free on Spark, so
    // typing cannot fire a request faster than this.
    static MIN_GAP = 700;

    // Length tiers carry most of the weight so a long passphrase scores well even
    // without symbols; variety adds the rest.
    static levels = [
        {
            key: 'none',
            label: 'Not set',
            detail: 'Use at least 8 characters. A passphrase of 12 or more is stronger.'
        },
        {
            key: 'weak',
            label: 'Weak',
            detail: 'Too easy to guess. Add length, or mix letters, numbers and symbols.'
        },
        {
            key: 'fair',
            label: 'Fair',
            detail: 'Better. A few more characters or a symbol would help.'
        },
        { key: 'good', label: 'Good', detail: 'A solid password. Keep it unique to this site.' },
        {
            key: 'strong',
            label: 'Strong',
            detail: 'Excellent. Store it in a password manager, not in a note.'
        }
    ];

    static strength(value) {
        const password = String(value || '');
        if (!password) {
            return AuthDialog.levels[0];
        }
        // Below the minimum length nothing else matters: it cannot be accepted anyway.
        if (password.length < 8) {
            return AuthDialog.levels[1];
        }
        const variety = [
            /[a-z]/.test(password) && /[A-Z]/.test(password),
            /[0-9]/.test(password),
            /[^A-Za-z0-9]/.test(password)
        ].filter(Boolean).length;
        let score = variety;
        for (const size of [8, 12, 16, 20]) {
            if (password.length >= size) {
                score += 1;
            }
        }
        const index = score <= 2 ? 1 : score === 3 ? 2 : score === 4 ? 3 : 4;
        return AuthDialog.levels[index];
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
        this.el('authRefreshVerification')?.addEventListener('click', () =>
            this.refreshVerification()
        );
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
        this.el('authUnlinkGoogle')?.addEventListener('click', () => this.unlinkGoogle());
        this.el('authRemovePasswordBtn')?.addEventListener('click', () => this.removePassword());
        this.el('authDeleteAccount')?.addEventListener('click', () => this.deleteAccount());
        this.el('authDeleteNow')?.addEventListener('click', () =>
            this.deleteAccount({ now: true })
        );
        this.el('authCancelDeletion')?.addEventListener('click', () => this.cancelDeletion());
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

    // A failed startup has its own explanation; do not hide it behind "still starting".
    startupMessage(auth) {
        if (auth?.message && !/^Checking your saved sign-in/.test(auth.message)) {
            return auth.message;
        }
        return 'Sign-in is still starting. Wait a moment, then try again.';
    }

    // ---------------------------------------------------------------- sign in

    async submitSignIn(event) {
        event.preventDefault();
        const auth = this.auth();
        if (!auth?.ready) {
            this.setFeedback('error', this.startupMessage(this.auth()));
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
            this.setFeedback('error', this.startupMessage(this.auth()));
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
            this.setFeedback('error', this.startupMessage(this.auth()));
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

    profileDisplayName() {
        try {
            const nickname = JSON.parse(localStorage.getItem('kanji_profile') || '{}').nickname;
            return typeof nickname === 'string' ? nickname.trim().slice(0, 40) : '';
        } catch {
            return '';
        }
    }

    async submitCreate(event) {
        event.preventDefault();
        const auth = this.auth();
        if (!auth?.ready) {
            this.setFeedback('error', this.startupMessage(this.auth()));
            return;
        }
        const email = this.el('authCreateEmail').value.trim();
        const username = this.el('authCreateUsername').value.trim();
        const password = this.el('authCreatePassword').value;
        const confirm = this.el('authCreatePasswordConfirm').value;
        // The display name lives on the profile now; reuse it instead of asking twice.
        const displayName = this.profileDisplayName();
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
        // No consent tick-box: the guarantee is kept in code (an auth change never writes
        // progress, and the first save still asks which copy to keep), so it is not a
        // promise the learner has to take on trust before signing up.
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
            created.verificationSent
                ? `Account created. You are @${policy.username}. We sent a confirmation link to ${email}; open it when convenient. Learning works before you confirm.`
                : `Account created. You are @${policy.username}. The confirmation email could not be sent just now; use Send confirmation link below.`
        );
        window.KanjiFeedback?.show(
            `Welcome, @${policy.username}. Confirm ${email} when you can. Your progress stays local until you approve sync.`,
            {
                kind: 'info'
            }
        );
    }

    async verifyEmail() {
        const auth = this.auth();
        if (!auth?.ready) {
            this.setFeedback('error', this.startupMessage(auth));
            return;
        }
        this.setBusy(true, 'Sending a confirmation link…');
        const result = await auth.sendVerificationEmail();
        this.setBusy(false);
        this.setFeedback(result.ok ? 'success' : 'error', result.message);
    }

    // The confirmation happens in the user's mailbox, so the app re-reads the account.
    async refreshVerification() {
        const auth = this.auth();
        if (!auth?.ready) {
            this.setFeedback('error', this.startupMessage(auth));
            return;
        }
        this.setBusy(true, 'Checking whether the link was opened…');
        const result = await auth.refreshUser();
        this.setBusy(false);
        if (result.throttled) {
            this.setFeedback('info', 'Checked a few seconds ago. Try again shortly.');
            return;
        }
        if (!result.ok) {
            this.setFeedback(
                'error',
                result.message || 'The confirmation status could not be checked right now.'
            );
            return;
        }
        this.setFeedback(
            result.verified ? 'success' : 'info',
            result.verified
                ? 'Email confirmed. That address can now reset a lost password.'
                : 'Still unconfirmed. Open the link in your inbox, then check again.'
        );
        this.render();
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

    setDeleteStatus(message, kind = '') {
        const node = this.el('authDeleteStatus');
        if (!node) {
            return;
        }
        node.textContent = message || '';
        node.hidden = !message;
        node.classList.toggle('auth-feedback--error', kind === 'error');
    }

    // Deleting the account cannot be undone, so it asks twice: the confirm spells out
    // what goes and what stays, then the password (or the Google popup) proves it is
    // really the owner asking.
    // The default is the 7-day schedule: it states the deadline and can be cancelled.
    // "Delete now instead" keeps the immediate path for anyone who wants it gone at once.
    async deleteAccount({ now = false } = {}) {
        const auth = this.auth();
        if (!auth?.user || this.busy) {
            return;
        }
        const password = this.el('authDeletePassword')?.value || '';
        this.setBusy(true, now ? 'Deleting the account…' : 'Scheduling the deletion…');
        const result = now
            ? await auth.deleteAccount({ password })
            : await auth.scheduleAccountDeletion({ password });
        this.setBusy(false);
        if (result.cancelled) {
            this.setDeleteStatus('Nothing was removed and nothing was scheduled.');
            this.render();
            return;
        }
        if (this.el('authDeletePassword')) {
            this.el('authDeletePassword').value = '';
        }
        this.setDeleteStatus(result.message, result.ok ? '' : 'error');
        this.setFeedback(result.ok ? 'info' : 'error', result.message);
        this.render();
    }

    async cancelDeletion() {
        const auth = this.auth();
        if (!auth?.user || this.busy) {
            return;
        }
        this.setBusy(true, 'Cancelling the scheduled deletion…');
        const result = await auth.cancelAccountDeletion();
        this.setBusy(false);
        if (result.cancelled) {
            return;
        }
        this.setDeleteStatus(result.message, result.ok ? '' : 'error');
        this.setFeedback(result.ok ? 'info' : 'error', result.message);
        this.render();
    }

    async signOut() {
        const auth = this.auth();
        if (!auth?.ready) {
            return;
        }
        this.setBusy(true);
        const done = await auth.signOut({
            wipe: Boolean(this.el('authSignOutWipe')?.checked)
        });
        this.setBusy(false);
        this.tab = 'signin';
        this.render();
        if (done) {
            this.setFeedback('info', auth.message || 'Signed out. Local progress is kept.');
        } else if (auth.message) {
            this.setFeedback('error', auth.message);
        } else {
            // The sign-out confirmation was dismissed: nothing changed.
            this.setFeedback('info', 'Sign-out cancelled. Nothing was removed from this device.');
        }
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

    // Which methods are on the account, and which of them can still be removed.
    renderMethods(auth = this.auth()) {
        const section = this.el('authMethodsSection');
        if (!section) {
            return;
        }
        const signedIn = Boolean(auth?.user);
        section.hidden = !signedIn;
        const providers = AppAuth.providers(auth?.user);
        const google = providers.includes('google.com');
        const password = AppAuth.hasPassword(auth?.user);
        const removable = google && password;
        const status = this.el('authMethodsStatus');
        if (status) {
            status.textContent = signedIn
                ? `On this account: ${[password ? 'password' : '', google ? 'Google' : '']
                      .filter(Boolean)
                      .join(' · ')}`
                : '';
        }
        const unlink = this.el('authUnlinkGoogle');
        if (unlink) {
            unlink.hidden = !removable;
            unlink.disabled = Boolean(this.busy);
        }
        const remove = this.el('authRemovePasswordSection');
        if (remove) {
            remove.hidden = !removable;
            const field = this.el('authRemovePasswordValue');
            if (field) {
                field.disabled = Boolean(this.busy);
            }
        }
        const hint = this.el('authMethodsHint');
        if (hint) {
            hint.textContent = !signedIn
                ? ''
                : removable
                  ? 'Either method can sign you in, so one of them can be removed. Google Drive backups have their own connection.'
                  : google
                    ? 'Google is the only way into this account. Add a password first; then Google can be unlinked.'
                    : 'Your password is the only way into this account. Link Google first; then the password can be removed.';
            hint.hidden = !hint.textContent;
        }
    }

    // Removing a way in is destructive, so it says what changes and what does not.
    static UNLINK_GOOGLE_CONFIRM =
        'Unlink Google from this account?\n\nYou will sign in with your email or username and ' +
        'your password. Google Drive backups keep their own connection and are not affected.';

    static REMOVE_PASSWORD_CONFIRM =
        'Remove the password from this account?\n\nYou will sign in with Google from now on. ' +
        'You can add a password again at any time.';

    async unlinkGoogle() {
        const auth = this.auth();
        if (!auth?.user || !window.confirm(AuthDialog.UNLINK_GOOGLE_CONFIRM)) {
            return;
        }
        this.setBusy(true, 'Unlinking Google…');
        const result = await auth.unlinkProvider('google.com');
        this.setBusy(false);
        this.setFeedback(result.ok ? 'success' : 'error', result.message);
        this.render();
    }

    async removePassword() {
        const auth = this.auth();
        const field = this.el('authRemovePasswordValue');
        if (!auth?.user) {
            return;
        }
        if (!field?.value) {
            this.setFeedback('error', 'Enter your current password first.');
            field?.focus();
            return;
        }
        if (!window.confirm(AuthDialog.REMOVE_PASSWORD_CONFIRM)) {
            return;
        }
        this.setBusy(true, 'Removing the password…');
        const result = await auth.unlinkProvider('password', { password: field.value });
        this.setBusy(false);
        if (result.ok) {
            field.value = '';
        }
        this.setFeedback(result.ok ? 'success' : 'error', result.message);
        this.render();
    }

    renderStrength() {
        const node = this.el('authCreatePasswordStrength');
        const meter = this.el('authCreateStrengthMeter');
        const field = this.el('authCreatePassword');
        if (!node || !field) {
            return;
        }
        const level = AuthDialog.strength(field.value);
        node.textContent = `${level.label}: ${level.detail}`;
        if (meter) {
            meter.dataset.level = level.key;
            meter.setAttribute('aria-hidden', 'true');
        }
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
        AppAuth.renderDeletionState(auth?.user, { busy: this.busy });
        const deleteSection = this.el('authDeleteSection');
        if (deleteSection) {
            const hasPassword = AppAuth.hasPassword(auth?.user);
            deleteSection.hidden = !signedIn;
            const passwordRow = this.el('authDeletePassword');
            const passwordLabel = this.el('authDeletePasswordLabel');
            const askPassword = signedIn && hasPassword;
            if (passwordRow) {
                passwordRow.hidden = !askPassword;
            }
            if (passwordLabel) {
                passwordLabel.hidden = !askPassword;
            }
            const button = this.el('authDeleteAccount');
            if (button) {
                button.disabled = this.busy;
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
        const wipeRow = this.el('authSignOutWipeRow');
        if (wipeRow) {
            wipeRow.hidden = !signedIn;
            if (!signedIn && this.el('authSignOutWipe')) {
                this.el('authSignOutWipe').checked = false;
            }
        }
        this.renderMethods(auth);
        this.renderStrength();
    }
}
window.AuthDialog = AuthDialog;
window.addEventListener('DOMContentLoaded', () => {
    window.kanjiUsernames = new UsernameDirectory();
    window.kanjiAuthDialog = new AuthDialog();
    window.kanjiAuthDialog.init();
    window.addEventListener('kanji-auth-changed', () => {
        // After the account record is read, an overdue deletion is completed here: the
        // free plan has no server timer, so the deadline is honoured on the next visit.
        window.kanjiUsernames
            .sync()
            .then(() => window.kanjiAuth?.enforceScheduledDeletion?.())
            .then((outcome) => {
                if (outcome?.deleted) {
                    window.KanjiFeedback?.show(
                        'The scheduled 7 days passed, so the account was deleted now. Learning data on this device is untouched.',
                        { kind: 'info', title: 'Account deleted' }
                    );
                }
            })
            .catch(() => {});
    });
});
