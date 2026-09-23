// Username rules live in one place so the sign-in dialog, the account directory
// and the tests cannot drift apart. Rules always re-check the same shape, but the
// reservation document in Firestore is the only authority on who owns a name.
class UsernamePolicy {
    // Username-only accounts get a private alias address under a domain the site
    // owner controls. Firebase never sends mail to it; it only gives the Auth
    // service an address-shaped identifier so username sign-in needs no lookup.
    static ALIAS_DOMAIN = 'users.kanji.qd.je';
    static MIN = 3;
    static MAX = 20;
    static RENAME_COOLDOWN_DAYS = 30;
    static RESERVATION_DAYS = 30;
    static FIELD = 'username';
    // Names that would let an account look official, or that collide with routes.
    static reserved = [
        'admin',
        'administrator',
        'root',
        'support',
        'help',
        'moderator',
        'mod',
        'staff',
        'official',
        'system',
        'security',
        'api',
        'www',
        'mail',
        'email',
        'guest',
        'user',
        'users',
        'me',
        'you',
        'null',
        'undefined',
        'anonymous',
        'kanji',
        'kanjiwidgets',
        'kanjiwidget',
        'qd',
        'd4nte',
        'brodante'
    ];

    static normalize(raw) {
        return String(raw ?? '')
            .normalize('NFKC')
            .trim()
            .toLowerCase();
    }

    static display(raw) {
        return String(raw ?? '')
            .normalize('NFKC')
            .trim();
    }

    static get pattern() {
        return /^[a-z][a-z0-9_]*$/;
    }

    static isReserved(name) {
        return this.reserved.includes(this.normalize(name));
    }

    // Returns { ok: true, username, display } or { ok: false, reason, message }.
    // reason is one of: empty, short, long, format, start, underscore, reserved.
    static validate(raw) {
        const display = this.display(raw);
        const username = this.normalize(raw);
        const fail = (reason, message) => ({ ok: false, reason, message, username, display });
        if (!username) {
            return fail('empty', 'Choose a username.');
        }
        if (username.length < this.MIN) {
            return fail('short', `Use at least ${this.MIN} characters.`);
        }
        if (username.length > this.MAX) {
            return fail('long', `Use no more than ${this.MAX} characters.`);
        }
        if (!this.pattern.test(username)) {
            if (/^[\d_]/.test(username)) {
                return fail(
                    'start',
                    'Start with a letter. Letters, numbers and underscores follow.'
                );
            }
            return fail('format', 'Use lowercase letters, numbers and underscores only.');
        }
        if (/__/.test(username)) {
            return fail('underscore', 'Use single underscores, never two in a row.');
        }
        if (username.endsWith('_')) {
            return fail('underscore', 'Underscores cannot come at the end.');
        }
        if (this.isReserved(username)) {
            return fail('reserved', `“${display}” is reserved. Please choose another.`);
        }
        return { ok: true, username, display };
    }

    static aliasEmail(raw) {
        const username = this.normalize(raw);
        return username ? `${username}@${this.ALIAS_DOMAIN}` : '';
    }

    static isAliasEmail(value) {
        const address = String(value ?? '')
            .normalize('NFKC')
            .trim()
            .toLowerCase();
        return address.endsWith(`@${this.ALIAS_DOMAIN}`);
    }

    static looksLikeEmail(value) {
        return String(value ?? '').includes('@');
    }

    static clamp(raw) {
        return this.normalize(raw)
            .replace(/[^a-z0-9_]/g, '')
            .slice(0, this.MAX);
    }

    // Deterministic, polite alternatives. `taken` is a list of normalised names that
    // are already known to be unavailable; the next check still verifies live.
    static suggestions(raw, taken = []) {
        const blocked = new Set((taken || []).map((name) => this.normalize(name)));
        const base = this.clamp(raw).replace(/^[^a-z]+/, '') || 'learner';
        const year = new Date().getFullYear();
        const candidates = [
            `${base}${year}`,
            `${base}_jp`,
            `${base}_${year}`,
            `kanji_${base}`,
            `${base}_sensei`,
            `${base}${Math.floor(100 + Math.random() * 900)}`
        ].map((candidate) => candidate.replace(/_{2,}/g, '_').replace(/^_|_$/g, ''));
        const seen = new Set();
        const out = [];
        for (const candidate of candidates) {
            const short = candidate.slice(0, this.MAX).replace(/_$/, '');
            const check = this.validate(short);
            if (!check.ok || seen.has(check.username) || blocked.has(check.username)) {
                continue;
            }
            if (check.username === this.normalize(raw)) {
                continue;
            }
            seen.add(check.username);
            out.push(check.display);
        }
        return out.slice(0, 3);
    }
}
window.UsernamePolicy = UsernamePolicy;
