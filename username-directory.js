/* global UsernamePolicy */
// Username ownership lives in Firestore, not in the client.
//
// Layout (owner-only client writes, security rules are the authority):
//   usernames/{lowercase-name}  { uid, display, kind, email, reservedUntil, ... }
//   users/{uid}                 { username, display, email, renamedAt, ... }
//
// A username-only account signs in with an alias address (see UsernamePolicy),
// so the client never has to look an email up to sign someone in.
class UsernameDirectory {
    static CACHE_KEY = 'kanji_username_cache_v1';
    // Local mirror of the signed-in handle for offline display only. Credentials
    // are never stored here, and the key is not part of app backups or cloud sync.
    static HANDLE_KEY = 'kanji_handle_v1';
    static AVAILABLE_TTL = 45000;
    static TAKEN_TTL = 600000;
    static CACHE_LIMIT = 60;
    static SDK_URL = 'https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js';

    static normalize(raw) {
        return window.UsernamePolicy
            ? window.UsernamePolicy.normalize(raw)
            : String(raw ?? '')
                  .normalize('NFKC')
                  .trim()
                  .toLowerCase();
    }

    static async loadSDK(url = UsernameDirectory.SDK_URL) {
        return import(url);
    }

    static readCache() {
        try {
            const value = JSON.parse(localStorage.getItem(this.CACHE_KEY) || '{}');
            return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
        } catch {
            return {};
        }
    }

    static writeCache(cache) {
        try {
            const entries = Object.entries(cache)
                .sort((a, b) => (b[1]?.at || 0) - (a[1]?.at || 0))
                .slice(0, this.CACHE_LIMIT);
            localStorage.setItem(this.CACHE_KEY, JSON.stringify(Object.fromEntries(entries)));
        } catch {
            /* Availability caching is optional; a full store must not break sign-in. */
        }
    }

    static readHandle(uid) {
        try {
            const value = JSON.parse(localStorage.getItem(this.HANDLE_KEY) || 'null');
            if (!value || value.uid !== uid || typeof value.username !== 'string') {
                return null;
            }
            return value;
        } catch {
            return null;
        }
    }

    constructor(deps = {}) {
        this.loadSDK = deps.loadSDK || (() => UsernameDirectory.loadSDK());
        this.getApp = deps.getApp || (() => window.kanjiAuth?.app);
        this.auth = deps.auth || (() => window.kanjiAuth);
        this.cache = UsernameDirectory.readCache();
        this.db = null;
        this.uid = null;
        this.handle = null;
        this.profile = null;
        this.message = '';
    }

    get user() {
        return this.auth()?.user || null;
    }

    async connect() {
        if (this.db) {
            return this.db;
        }
        const app = this.getApp();
        if (!app) {
            throw Object.assign(new Error('Sign-in is still starting.'), { code: 'app/not-ready' });
        }
        const sdk = await this.loadSDK();
        this.sdk = sdk;
        this.db = sdk.getFirestore(app);
        return this.db;
    }

    usernameRef(name) {
        return this.sdk.doc(this.db, 'usernames', UsernameDirectory.normalize(name));
    }

    profileRef(uid = this.uid) {
        return this.sdk.doc(this.db, 'users', uid);
    }

    // Real addresses are published only when they are verified; alias addresses
    // and unverified addresses stay out of the public directory.
    publicEmail(user = this.user) {
        if (!user?.email || window.AppAuth?.isAliasAccount(user)) {
            return '';
        }
        const verified =
            user.emailVerified ||
            window.AppAuth?.providers(user).includes('google.com') ||
            window.AppAuth?.providers(user).includes('github.com');
        return verified ? user.email.toLowerCase() : '';
    }

    async available(raw) {
        const policy = window.UsernamePolicy;
        if (!policy?.validate) {
            return {
                username: UsernameDirectory.normalize(raw),
                display: String(raw ?? ''),
                available: null,
                reason: 'error',
                message:
                    'Username checks are unavailable. Your username is verified when you create the account.',
                suggestions: []
            };
        }
        const checked = policy.validate(raw);
        const username = checked.username;
        if (!checked.ok) {
            return {
                username,
                display: checked.display,
                available: false,
                reason: checked.reason,
                message: checked.message,
                suggestions: []
            };
        }
        const mine =
            this.handle?.username === username &&
            (!this.uid || !this.handle?.uid || this.handle.uid === this.uid);
        if (mine) {
            return {
                username,
                display: checked.display,
                available: true,
                reason: 'yours',
                message: 'That is your current username.',
                suggestions: []
            };
        }
        const cached = this.cache[username];
        if (
            cached &&
            Date.now() - cached.at <
                (cached.available ? UsernameDirectory.AVAILABLE_TTL : UsernameDirectory.TAKEN_TTL)
        ) {
            // Only a stored "it is mine" belongs to an identity. "free" and "released"
            // describe the name itself, so they hold for anyone on this device.
            const currentUid = this.uid || this.user?.uid || null;
            const yours = cached.reason === 'yours';
            const mine = yours && Boolean(currentUid) && cached.uid === currentUid;
            if (yours && currentUid && !mine) {
                // Claimed by a different account on this device: never report it free.
                return {
                    username,
                    display: checked.display,
                    available: false,
                    reason: 'taken',
                    message: `“${checked.display}” belongs to another account. Please choose another.`,
                    suggestions: UsernamePolicy.suggestions(username, [username])
                };
            }
            if (!yours || mine) {
                const free = mine || cached.available;
                return {
                    username,
                    display: checked.display,
                    available: free,
                    reason: mine ? 'yours' : free ? 'cached' : cached.reason || 'taken',
                    message: mine
                        ? 'That is your current username.'
                        : free
                          ? cached.reason === 'released'
                              ? `“${checked.display}” was released by its previous owner and can be claimed.`
                              : `“${checked.display}” looks free. It is confirmed when you create the account.`
                          : cached.reason === 'reserved'
                            ? `“${checked.display}” is reserved. Please choose another.`
                            : `“${checked.display}” is already taken.`,
                    suggestions: free ? [] : UsernamePolicy.suggestions(username, [username])
                };
            }
            // Signed out, with a stored answer from a session that is gone: verify it
            // again rather than trust a claim nobody can make right now.
        }
        if (!navigator.onLine) {
            return {
                username,
                display: checked.display,
                available: null,
                reason: 'offline',
                message:
                    'You are offline, so availability cannot be checked. It is verified when you create the account.',
                suggestions: []
            };
        }
        try {
            await this.connect();
            const snapshot = await this.sdk.getDocFromServer(this.usernameRef(username));
            if (!snapshot.exists()) {
                this.remember(username, true, 'free');
                return {
                    username,
                    display: checked.display,
                    available: true,
                    reason: 'free',
                    message: `“${checked.display}” is available.`,
                    suggestions: []
                };
            }
            const data = snapshot.data() || {};
            if (data.uid && data.uid === (this.uid || this.user?.uid)) {
                this.remember(username, true, 'yours', data.uid);
                return {
                    username,
                    display: checked.display,
                    available: true,
                    reason: 'yours',
                    message: 'That username is already yours on this account.',
                    suggestions: []
                };
            }
            const released = data.kind === 'reserved' && UsernameDirectory.expired(data);
            if (released) {
                this.remember(username, true, 'released', '');
                return {
                    username,
                    display: checked.display,
                    available: true,
                    reason: 'released',
                    message: `“${checked.display}” was released by its previous owner and can be claimed.`,
                    suggestions: []
                };
            }
            const reserved = data.kind === 'reserved';
            this.remember(username, false, reserved ? 'reserved' : 'taken');
            return {
                username,
                display: checked.display,
                available: false,
                reason: reserved ? 'reserved' : 'taken',
                message: reserved
                    ? `“${checked.display}” was recently used and is still reserved.`
                    : `“${checked.display}” is already taken.`,
                suggestions: UsernamePolicy.suggestions(username, [username])
            };
        } catch (error) {
            const unavailable = error?.code === 'permission-denied' || error?.code === 'offline';
            return {
                username,
                display: checked.display,
                available: null,
                reason: unavailable ? 'blocked' : 'error',
                message:
                    error?.code === 'permission-denied'
                        ? 'Availability checking needs the updated security rules. Your username is still verified when you create the account.'
                        : 'Availability could not be checked right now. It is verified when you create the account.',
                suggestions: []
            };
        }
    }

    // Public directory lookup: only the address its owner chose to publish after
    // verifying it. Returns '' when the account keeps no mailbox on file.
    async directoryEmail(raw) {
        try {
            await this.connect();
            const snapshot = await this.sdk.getDocFromServer(this.usernameRef(raw));
            const data = snapshot.exists() ? snapshot.data() || {} : {};
            return typeof data.email === 'string' ? data.email : '';
        } catch {
            return '';
        }
    }

    static expired(data) {
        const value = data?.reservedUntil;
        const millis =
            typeof value?.toMillis === 'function'
                ? value.toMillis()
                : typeof value?.seconds === 'number'
                  ? value.seconds * 1000
                  : typeof value === 'number'
                    ? value
                    : 0;
        return Boolean(millis) && millis <= Date.now();
    }

    remember(username, available, reason, uid = this.uid) {
        // The owner is stored with the answer: "available because it is mine" is not
        // availability for a different account.
        this.cache[username] = { available, reason, uid: uid || '', at: Date.now() };
        UsernameDirectory.writeCache(this.cache);
    }

    // Drops answers that belong to another identity. Called on sign-out and whenever
    // the signed-in account changes, so a name claimed by one account can never look
    // free to the next one on this device.
    purgeOwnedCache(uid = this.uid) {
        let changed = false;
        for (const [name, entry] of Object.entries(this.cache)) {
            // "yours" is the only identity-bound answer: "free" and "released" stay
            // true whoever asks, and "reserved"/"taken" are not tied to a person.
            if (entry?.reason === 'yours' && entry.uid !== uid) {
                delete this.cache[name];
                changed = true;
            }
        }
        if (changed) {
            UsernameDirectory.writeCache(this.cache);
        }
        return changed;
    }

    writeHandle(value) {
        this.handle = value;
        try {
            if (value) {
                localStorage.setItem(UsernameDirectory.HANDLE_KEY, JSON.stringify(value));
            } else {
                localStorage.removeItem(UsernameDirectory.HANDLE_KEY);
            }
        } catch {
            /* Display-only mirror; never block sign-in on storage limits. */
        }
        window.dispatchEvent(new Event('kanji-handle-changed'));
    }

    // Claims a username for the signed-in account. The security rules decide, so a
    // stale availability result can only end in "just taken", never in a duplicate.
    async reserve(raw, { email = '' } = {}) {
        const user = this.user;
        if (!user) {
            return { ok: false, reason: 'signed-out', message: 'Sign in first.' };
        }
        const checked = window.UsernamePolicy.validate(raw);
        if (!checked.ok) {
            return { ok: false, reason: checked.reason, message: checked.message };
        }
        try {
            await this.connect();
            this.uid = user.uid;
            const ref = this.usernameRef(checked.username);
            const lookup = await this.sdk.getDocFromServer(ref);
            if (lookup.exists()) {
                const data = lookup.data() || {};
                const mine = data.uid && data.uid === user.uid;
                if (!mine && !(data.kind === 'reserved' && UsernameDirectory.expired(data))) {
                    const reason = data.kind === 'reserved' ? 'reserved' : 'taken';
                    this.remember(checked.username, false, reason);
                    return {
                        ok: false,
                        reason,
                        message:
                            reason === 'reserved'
                                ? `“${checked.display}” was just reserved by someone else. Try another.`
                                : `“${checked.display}” is already taken by another account. Try another.`,
                        suggestions: window.UsernamePolicy.suggestions(checked.username, [
                            checked.username
                        ])
                    };
                }
            }
            await this.sdk.setDoc(ref, {
                uid: user.uid,
                display: checked.display,
                kind: 'user',
                email: email || this.publicEmail(user),
                createdAt: this.sdk.serverTimestamp(),
                updatedAt: this.sdk.serverTimestamp()
            });
            await this.publishProfile(checked);
            this.remember(checked.username, true, 'yours', user.uid);
            this.writeHandle({
                uid: user.uid,
                username: checked.username,
                display: checked.display
            });
            return { ok: true, username: checked.username, display: checked.display };
        } catch (error) {
            const denied = error?.code === 'permission-denied';
            return {
                ok: false,
                reason: denied ? 'taken' : 'error',
                message: denied
                    ? `“${checked.display}” could not be claimed. It may have just been taken, or the security rules need publishing.`
                    : 'The username could not be saved right now. Your account exists; try again shortly.',
                suggestions: window.UsernamePolicy.suggestions(checked.username, [checked.username])
            };
        }
    }

    async publishProfile(checked, extra = {}) {
        await this.sdk.setDoc(
            this.profileRef(),
            {
                uid: this.uid,
                username: checked.username,
                display: checked.display,
                email: this.publicEmail(),
                updatedAt: this.sdk.serverTimestamp(),
                ...extra
            },
            { merge: true }
        );
        this.profile = { ...(this.profile || {}), ...extra, ...checked };
    }

    // Keeps the public directory in step when a real address becomes verified.
    async publishEmail() {
        const user = this.user;
        // Only publish when this account already has a server-side record, so a
        // restored local mirror cannot create a half-written account document.
        if (!user || !this.handle?.username || this.profile?.username !== this.handle.username) {
            return { ok: false, skipped: true };
        }
        const email = this.publicEmail(user);
        if (!email || this.profile?.email === email) {
            return { ok: true, skipped: true };
        }
        try {
            await this.connect();
            this.uid = user.uid;
            await this.sdk.setDoc(
                this.profileRef(),
                { email, updatedAt: this.sdk.serverTimestamp() },
                { merge: true }
            );
            this.profile = { ...(this.profile || {}), email };
            return { ok: true, email };
        } catch {
            return { ok: false };
        }
    }

    // Reads the signed-in account's handle. Runs on every auth change, including
    // restored sessions, and never writes learning data.
    async sync() {
        const user = this.user;
        const previous = this.uid;
        this.uid = user?.uid || null;
        if (previous && previous !== this.uid) {
            // A different account (or a sign-out) must not inherit this device's answers.
            this.purgeOwnedCache(this.uid);
        }
        if (!user) {
            this.profile = null;
            this.purgeOwnedCache(null);
            this.writeHandle(null);
            return null;
        }
        this.writeHandle(UsernameDirectory.readHandle(user.uid));
        try {
            await this.connect();
            const snapshot = await this.sdk.getDocFromServer(this.profileRef(user.uid));
            const data = snapshot.exists() ? snapshot.data() || {} : {};
            this.profile = data;
            if (typeof data.username === 'string' && data.username) {
                this.cache[data.username] = {
                    available: true,
                    reason: 'yours',
                    uid: user.uid,
                    at: Date.now()
                };
                UsernameDirectory.writeCache(this.cache);
                this.writeHandle({
                    uid: user.uid,
                    username: data.username,
                    display: typeof data.display === 'string' ? data.display : data.username
                });
            } else if (this.handle?.uid !== user.uid) {
                // Only clear the mirror when it does not belong to this account, so a
                // sync that started before a fresh claim cannot erase it.
                this.writeHandle(null);
            }
            await this.publishEmail();
            return this.handle;
        } catch {
            // Offline or rules not published: the cached mirror stays visible.
            return this.handle;
        }
    }

    renameDaysLeft() {
        const renamedAt = this.profile?.renamedAt;
        const millis =
            typeof renamedAt?.toMillis === 'function'
                ? renamedAt.toMillis()
                : typeof renamedAt?.seconds === 'number'
                  ? renamedAt.seconds * 1000
                  : typeof renamedAt === 'number'
                    ? renamedAt
                    : 0;
        if (!millis) {
            return 0;
        }
        const wait = window.UsernamePolicy.RENAME_COOLDOWN_DAYS * 86400000;
        const left = millis + wait - Date.now();
        return left > 0 ? Math.ceil(left / 86400000) : 0;
    }

    async rename(raw) {
        const user = this.user;
        if (!user) {
            return { ok: false, message: 'Sign in first.' };
        }
        const checked = window.UsernamePolicy.validate(raw);
        if (!checked.ok) {
            return { ok: false, reason: checked.reason, message: checked.message };
        }
        if (!this.handle?.username) {
            return this.reserve(checked.username);
        }
        if (this.handle.username === checked.username) {
            return { ok: false, message: 'That is already your username.' };
        }
        const daysLeft = this.renameDaysLeft();
        if (daysLeft > 0) {
            return {
                ok: false,
                reason: 'cooldown',
                message: `Usernames can be changed once every ${window.UsernamePolicy.RENAME_COOLDOWN_DAYS} days. Try again in ${daysLeft} day${daysLeft === 1 ? '' : 's'}.`
            };
        }
        try {
            await this.connect();
            this.uid = user.uid;
            const next = this.usernameRef(checked.username);
            const lookup = await this.sdk.getDocFromServer(next);
            if (lookup.exists()) {
                const data = lookup.data() || {};
                if (!(data.kind === 'reserved' && UsernameDirectory.expired(data))) {
                    const reason = data.kind === 'reserved' ? 'reserved' : 'taken';
                    return {
                        ok: false,
                        reason,
                        message: `“${checked.display}” is not available. Try another.`,
                        suggestions: window.UsernamePolicy.suggestions(checked.username, [
                            checked.username
                        ])
                    };
                }
            }
            const previous = this.handle;
            await this.sdk.setDoc(next, {
                uid: user.uid,
                display: checked.display,
                kind: 'user',
                email: this.publicEmail(user),
                createdAt: this.sdk.serverTimestamp(),
                updatedAt: this.sdk.serverTimestamp()
            });
            await this.publishProfile(checked, {
                renamedAt: this.sdk.serverTimestamp(),
                email: this.publicEmail(user)
            });
            // The previous name stays reserved for a while so it cannot be sniped.
            await this.sdk.setDoc(
                this.usernameRef(previous.username),
                {
                    uid: '',
                    display: previous.display || previous.username,
                    kind: 'reserved',
                    email: '',
                    releasedAt: this.sdk.serverTimestamp(),
                    reservedUntil: this.sdk.Timestamp.fromMillis(
                        Date.now() + window.UsernamePolicy.RESERVATION_DAYS * 24 * 60 * 60 * 1000
                    )
                },
                { merge: true }
            );
            this.remember(checked.username, true, 'yours', user.uid);
            this.remember(previous.username, false, 'reserved', user.uid);
            this.writeHandle({
                uid: user.uid,
                username: checked.username,
                display: checked.display
            });
            return {
                ok: true,
                username: checked.username,
                display: checked.display,
                previous: previous.username
            };
        } catch (error) {
            const denied = error?.code === 'permission-denied';
            return {
                ok: false,
                reason: denied ? 'taken' : 'error',
                message: denied
                    ? `“${checked.display}” could not be claimed. Try another name.`
                    : 'The username change did not complete. Try again shortly.'
            };
        }
    }

    // Sign-out: nothing about the previous account should look available to the next one.
    forgetIdentity() {
        for (const [name, entry] of Object.entries(this.cache)) {
            if (entry?.reason === 'yours') {
                delete this.cache[name];
            }
        }
        UsernameDirectory.writeCache(this.cache);
        this.handle = null;
        this.profile = null;
        try {
            localStorage.removeItem(UsernameDirectory.HANDLE_KEY);
        } catch {
            /* nothing to remove */
        }
    }

    // Scheduled deletion: the request lives in the account record, so every device sees
    // the same deadline and the same chance to cancel it. Nothing is removed until the
    // deadline passes or the owner asks for it immediately.
    static DELETION_GRACE_DAYS = 7;

    deletionScheduledFor(profile = this.profile) {
        const value = profile?.deletionScheduledFor;
        if (!value) {
            return null;
        }
        const millis = typeof value.toMillis === 'function' ? value.toMillis() : Number(value);
        return Number.isFinite(millis) ? millis : null;
    }

    async requestDeletion(when) {
        if (!this.user) {
            return false;
        }
        await this.connect();
        await this.sdk.setDoc(
            this.profileRef(this.user.uid),
            {
                deletionRequestedAt: this.sdk.serverTimestamp(),
                deletionScheduledFor: this.sdk.Timestamp.fromMillis(when),
                updatedAt: this.sdk.serverTimestamp()
            },
            { merge: true }
        );
        this.profile = {
            ...(this.profile || {}),
            deletionScheduledFor: this.sdk.Timestamp.fromMillis(when)
        };
        return true;
    }

    async cancelDeletion() {
        if (!this.user) {
            return false;
        }
        await this.connect();
        await this.sdk.setDoc(
            this.profileRef(this.user.uid),
            {
                deletionRequestedAt: null,
                deletionScheduledFor: null,
                updatedAt: this.sdk.serverTimestamp()
            },
            { merge: true }
        );
        this.profile = { ...(this.profile || {}), deletionScheduledFor: null };
        return true;
    }

    // Account deletion: the name becomes a reservation for the usual window, exactly
    // like a rename, so nobody can grab it the moment the account disappears. The
    // rules allow only the owner to do this, so it has to run while the session is
    // still valid, before the sign-in itself is deleted. The reservation is not tied
    // to anyone: after RESERVATION_DAYS the name is claimable by whoever asks first.
    async releaseForDeletion() {
        const user = this.user;
        const username = this.handle?.username;
        if (!user || !username) {
            return false;
        }
        await this.connect();
        await this.sdk.setDoc(
            this.usernameRef(username),
            {
                uid: '',
                display: this.handle.display || username,
                kind: 'reserved',
                email: '',
                releasedAt: this.sdk.serverTimestamp(),
                reservedUntil: this.sdk.Timestamp.fromMillis(
                    Date.now() + window.UsernamePolicy.RESERVATION_DAYS * 24 * 60 * 60 * 1000
                )
            },
            { merge: true }
        );
        this.remember(username, false, 'reserved', '');
        return true;
    }

    // The account record is the account's own document; nothing else reads it.
    async deleteAccountRecord() {
        if (!this.user) {
            return false;
        }
        await this.connect();
        await this.sdk.deleteDoc(this.profileRef(this.user.uid));
        return true;
    }

    releaseReservation(username) {
        // Only used by tests and by the app when a reservation lapsed; the rules
        // refuse anything else, so there is no user-facing control for it.
        const name = UsernameDirectory.normalize(username);
        if (this.cache[name]) {
            delete this.cache[name];
            UsernameDirectory.writeCache(this.cache);
        }
    }
}
window.UsernameDirectory = UsernameDirectory;
