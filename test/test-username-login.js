// Email/username + password sign-in, unique usernames and account recovery.
// Firebase and Firestore are mocked; no real project is contacted.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const config = {
    apiKey: 'public-key',
    authDomain: 'test.firebaseapp.com',
    projectId: 'test',
    appId: 'app'
};

async function setupDom() {
    const dom = new JSDOM(read('index.html'), {
        url: 'https://kanji.qd.je',
        runScripts: 'outside-only'
    });
    const { window } = dom;
    await new Promise((resolve) => window.addEventListener('load', resolve, { once: true }));
    window.eval(read('username-policy.js'));
    window.eval(read('username-directory.js'));
    // jsdom has no confirm(): the sign-out prompt is answered by each test.
    window.confirm = () => true;
    return { dom, window };
}

// Minimal Firestore double with the surface the app uses. A non-merge write to an
// existing document is denied, which is exactly how the security rules behave.
function fakeFirestore(seed = new Map()) {
    const store = new Map(seed);
    const calls = { reads: 0, writes: 0, denied: 0 };
    const key = (ref) => ref.path;
    const snapshot = (ref) => ({
        exists: () => store.has(key(ref)),
        data: () => store.get(key(ref))
    });
    const sdk = {
        getFirestore: () => ({ name: 'firestore' }),
        doc: (_db, ...segments) => ({ path: segments.join('/') }),
        getDocFromServer: async (ref) => {
            calls.reads++;
            return snapshot(ref);
        },
        setDoc: async (ref, value, options = {}) => {
            calls.writes++;
            const existing = store.get(key(ref));
            if (existing && !options.merge) {
                calls.denied++;
                throw Object.assign(new Error('permission-denied'), {
                    code: 'permission-denied'
                });
            }
            store.set(key(ref), { ...(options.merge ? existing : {}), ...value });
        },
        serverTimestamp: () => 'server-time',
        Timestamp: {
            fromMillis: (millis) => ({
                toMillis: () => millis,
                seconds: Math.floor(millis / 1000)
            })
        }
    };
    return { sdk, store, calls, key };
}

function fakeAuthSdk({ user = null, error = null, calls = [] } = {}) {
    let notify = () => {};
    const sdk = {
        getApps: () => [],
        initializeApp: () => ({ name: 'kanji-auth' }),
        getAuth: () => ({ name: 'auth' }),
        browserLocalPersistence: 'LOCAL',
        setPersistence: async (_auth, value) => calls.push(['persistence', value]),
        onAuthStateChanged: (_auth, callback) => {
            notify = callback;
            queueMicrotask(() => callback(user));
            return () => calls.push(['unsubscribe']);
        },
        GoogleAuthProvider: class {
            setCustomParameters(value) {
                calls.push(['google-params', value]);
            }
        },
        signInWithPopup: async () => {
            calls.push(['google-popup']);
            if (error) {
                throw error;
            }
            notify({ uid: 'google-uid', email: 'learner@example.com' });
        },
        signInWithEmailAndPassword: async (_auth, email, password) => {
            calls.push(['password-sign-in', email, password]);
            if (error) {
                throw error;
            }
            notify(user || { uid: 'password-uid', email });
            return { user: { uid: 'password-uid', email } };
        },
        createUserWithEmailAndPassword: async (_auth, email, password) => {
            calls.push(['create', email, password]);
            if (error) {
                throw error;
            }
            const created = {
                uid: 'new-uid',
                email,
                emailVerified: false,
                providerData: [{ providerId: 'password' }]
            };
            notify(created);
            return { user: created };
        },
        updateProfile: async (_user, profile) => calls.push(['profile', profile.displayName]),
        sendPasswordResetEmail: async (_auth, email) => {
            calls.push(['reset', email]);
            if (error) {
                throw error;
            }
        },
        sendEmailVerification: async (target) => {
            calls.push(['verify-email', target.email]);
            if (error) {
                throw error;
            }
        },
        EmailAuthProvider: {
            credential: (email, password) => ({ providerId: 'password', email, password })
        },
        linkWithCredential: async (_target, credential) => {
            calls.push(['link-credential', credential.email]);
            if (error) {
                throw error;
            }
        },
        linkWithPopup: async () => {
            calls.push(['link-popup']);
            if (error) {
                throw error;
            }
        },
        verifyBeforeUpdateEmail: async (_target, email) => {
            calls.push(['verify-before-email', email]);
            if (error) {
                throw error;
            }
        },
        reload: async (target) => {
            calls.push(['reload']);
            // The real SDK refreshes the same user object, so a confirmed address
            // becomes visible without a new sign-in.
            target.emailVerified = true;
        },
        signOut: async () => {
            calls.push(['sign-out']);
            // The real SDK rejects when the network call fails, and the local
            // session stays as it was.
            if (error) {
                throw error;
            }
            notify(null);
        }
    };
    // Stands in for the SDK announcing an auth change from another tab.
    sdk.announce = (next) => notify(next);
    return sdk;
}

const passwordAccount = {
    uid: 'password-uid',
    email: 'learner@example.com',
    emailVerified: false,
    providerData: [{ providerId: 'password' }]
};
const googleAccount = {
    uid: 'google-uid',
    email: 'learner@googlemail.com',
    emailVerified: true,
    providerData: [{ providerId: 'google.com' }]
};
const aliasAccount = {
    uid: 'alias-uid',
    email: 'dante_kanji@users.kanji.qd.je',
    emailVerified: false,
    providerData: [{ providerId: 'password' }]
};

function makeDirectory(
    window,
    { sdk, store, calls, uid = 'password-uid', user = passwordAccount }
) {
    let current = user;
    const directory = new window.UsernameDirectory({
        loadSDK: async () => sdk,
        getApp: () => ({ name: 'kanji-auth' }),
        auth: () => ({ user: current, ready: true })
    });
    directory.uid = uid;
    directory.setUser = (next) => {
        current = next;
    };
    directory.store = store;
    directory.calls = calls;
    return directory;
}

// ---------------------------------------------------------------- policy

test('username policy normalises, validates and blocks reserved names', async () => {
    const { dom, window } = await setupDom();
    try {
        const policy = window.UsernamePolicy;
        assert.equal(policy.normalize('  Dante_Kanji '), 'dante_kanji');
        assert.equal(policy.normalize('ＤＡＮＴＥ'), 'dante');
        assert.equal(policy.validate('dante_kanji').ok, true);
        assert.equal(policy.validate('ab').reason, 'short');
        assert.equal(policy.validate('a'.repeat(21)).reason, 'long');
        assert.equal(policy.validate('dante kanji').reason, 'format');
        assert.equal(policy.validate('dante!').reason, 'format');
        assert.equal(policy.validate('1dante').reason, 'start');
        assert.equal(policy.validate('_dante').reason, 'start');
        assert.equal(policy.validate('dante__kanji').reason, 'underscore');
        assert.equal(policy.validate('dante_').reason, 'underscore');
        assert.equal(policy.validate('admin').reason, 'reserved');
        assert.equal(policy.validate('').reason, 'empty');
        assert.match(policy.validate('admin').message, /reserved/);
        const suggestions = policy.suggestions('admin');
        assert.equal(suggestions.length, 3);
        for (const suggestion of suggestions) {
            assert.equal(policy.validate(suggestion).ok, true, suggestion);
        }
        assert.ok(
            policy.suggestions('dante_kanji').every((name) => name !== 'dante_kanji'),
            'suggestions must differ from the rejected name'
        );
    } finally {
        dom.window.close();
    }
});

test('username alias addresses stay consistent between the policy and AppAuth', async () => {
    const { dom, window } = await setupDom();
    try {
        window.eval(read('app-auth.js'));
        const policy = window.UsernamePolicy;
        assert.equal(window.AppAuth.ALIAS_DOMAIN, policy.ALIAS_DOMAIN);
        for (const name of ['dante_kanji', 'New_Name', ' Admin ']) {
            assert.equal(window.AppAuth.aliasEmail(name), policy.aliasEmail(name), name);
        }
        assert.equal(
            window.AppAuth.normalizeIdentifier('Dante_Kanji'),
            'dante_kanji@users.kanji.qd.je'
        );
        assert.equal(
            window.AppAuth.normalizeIdentifier(' Learner@Example.com '),
            'learner@example.com'
        );
        assert.equal(window.AppAuth.normalizeIdentifier(''), '');
        assert.equal(window.AppAuth.isAliasAddress('dante@users.kanji.qd.je'), true);
        assert.equal(window.AppAuth.isAliasAddress('dante@example.com'), false);
        assert.equal(window.AppAuth.isAliasAccount(aliasAccount), true);
        assert.equal(window.AppAuth.isAliasAccount(googleAccount), false);
        assert.equal(window.AppAuth.hasPassword(googleAccount), false);
        assert.equal(window.AppAuth.hasPassword(passwordAccount), true);
    } finally {
        dom.window.close();
    }
});

// ---------------------------------------------------------------- AppAuth

test('username sign-in resolves to the private alias and never stores credentials', async () => {
    const { dom, window } = await setupDom();
    try {
        window.eval(read('app-auth.js'));
        const calls = [];
        const auth = new window.AppAuth(config, async () =>
            fakeAuthSdk({ user: passwordAccount, calls })
        );
        await auth.init();
        const result = await auth.signInWithEmail('dante_kanji', 'correct horse');
        assert.equal(result.ok, true);
        assert.deepEqual(calls.find(([name]) => name === 'password-sign-in').slice(0, 2), [
            'password-sign-in',
            'dante_kanji@users.kanji.qd.je'
        ]);
        assert.equal(window.localStorage.length, 0, 'credentials must never be persisted here');
    } finally {
        dom.window.close();
    }
});

test('email sign-in failures map to safe, actionable messages', async () => {
    const { dom, window } = await setupDom();
    try {
        window.eval(read('app-auth.js'));
        for (const [code, pattern] of [
            ['auth/invalid-credential', /incorrect/i],
            ['auth/too-many-requests', /wait/i],
            ['auth/user-disabled', /disabled/i],
            ['auth/network-request-failed', /connection/i]
        ]) {
            const calls = [];
            const auth = new window.AppAuth(config, async () =>
                fakeAuthSdk({ error: { code }, calls })
            );
            await auth.init();
            const result = await auth.signInWithEmail('learner@example.com', 'nope');
            assert.equal(result.ok, false, code);
            assert.match(result.message, pattern, code);
            assert.notEqual(result.message, '');
        }
        const calls = [];
        const auth = new window.AppAuth(config, async () => fakeAuthSdk({ calls }));
        await auth.init();
        const missing = await auth.signInWithEmail('', '');
        assert.equal(missing.code, 'app/missing-fields');
        assert.equal(
            calls.some(([name]) => name === 'password-sign-in'),
            false
        );
    } finally {
        dom.window.close();
    }
});

test('account creation validates locally before calling Firebase', async () => {
    const { dom, window } = await setupDom();
    try {
        window.eval(read('app-auth.js'));
        const calls = [];
        const auth = new window.AppAuth(config, async () => fakeAuthSdk({ calls }));
        await auth.init();
        const short = await auth.createAccount({ email: 'learner@example.com', password: 'short' });
        assert.equal(short.code, 'auth/weak-password');
        assert.equal(
            calls.some(([name]) => name === 'create'),
            false
        );
        const created = await auth.createAccount({
            email: 'Learner@Example.com',
            password: 'long enough password',
            displayName: 'Learner'
        });
        assert.equal(created.ok, true);
        const record = calls.find(([name]) => name === 'create');
        assert.equal(record[1], 'learner@example.com', 'addresses are normalised');
        assert.ok(calls.some(([name, value]) => name === 'profile' && value === 'Learner'));
        assert.equal(window.localStorage.length, 0);

        const duplicate = new window.AppAuth(config, async () =>
            fakeAuthSdk({ error: { code: 'auth/email-already-in-use' }, calls: [] })
        );
        await duplicate.init();
        const taken = await duplicate.createAccount({
            email: 'learner@example.com',
            password: 'long enough password'
        });
        assert.equal(taken.ok, false);
        assert.match(taken.message, /already uses that email/i);
    } finally {
        dom.window.close();
    }
});

test('password recovery is honest about username accounts and works for real mailboxes', async () => {
    const { dom, window } = await setupDom();
    try {
        window.eval(read('app-auth.js'));
        const calls = [];
        const auth = new window.AppAuth(config, async () => fakeAuthSdk({ calls }));
        await auth.init();
        const refused = await auth.sendPasswordReset('dante_kanji');
        assert.equal(refused.ok, false);
        assert.equal(refused.code, 'app/no-email');
        assert.match(refused.message, /no mailbox/i);
        assert.equal(
            calls.some(([name]) => name === 'reset'),
            false
        );

        const sent = await auth.sendPasswordReset('Learner@Example.com');
        assert.equal(sent.ok, true);
        assert.deepEqual(
            calls.find(([name]) => name === 'reset'),
            ['reset', 'learner@example.com']
        );
    } finally {
        dom.window.close();
    }
});

test('linking adds methods to one account and never merges by email', async () => {
    const { dom, window } = await setupDom();
    try {
        window.eval(read('app-auth.js'));
        const calls = [];
        const auth = new window.AppAuth(config, async () => fakeAuthSdk({ calls }));
        await auth.init();
        const noUser = await auth.linkPassword('learner@example.com', 'password123');
        assert.equal(noUser.ok, false);
        assert.equal(
            calls.some(([name]) => name === 'link-credential'),
            false,
            'a signed-out visitor cannot link anything'
        );

        window.kanjiAuth = auth;
        auth.user = googleAccount;
        const linked = await auth.linkPassword('learner@example.com', 'password123');
        assert.equal(linked.ok, true);
        assert.deepEqual(
            calls.find(([name]) => name === 'link-credential'),
            ['link-credential', 'learner@example.com']
        );
        const wrong = await auth.linkPassword('learner@example.com', 'short');
        assert.equal(wrong.code, 'app/missing-fields');

        auth.user = passwordAccount;
        assert.equal((await auth.linkGoogle()).ok, true);
        assert.ok(calls.some(([name]) => name === 'link-popup'));

        window.localStorage.clear();
        auth.user = aliasAccount;
        const recovery = await auth.addRecoveryEmail('Learner@Example.com');
        assert.equal(recovery.ok, true);
        assert.deepEqual(
            calls.find(([name]) => name === 'verify-before-email'),
            ['verify-before-email', 'learner@example.com']
        );
        assert.equal(window.localStorage.length, 0);
    } finally {
        dom.window.close();
    }
});

test('verification is refused for alias accounts and offered for real mailboxes', async () => {
    const { dom, window } = await setupDom();
    try {
        window.eval(read('app-auth.js'));
        const calls = [];
        const auth = new window.AppAuth(config, async () => fakeAuthSdk({ calls }));
        await auth.init();
        window.kanjiAuth = auth;
        auth.user = aliasAccount;
        const refused = await auth.sendVerificationEmail();
        assert.equal(refused.code, 'app/no-email');
        auth.user = googleAccount;
        auth.message = '';
        const alreadyVerified = await auth.sendVerificationEmail();
        assert.equal(alreadyVerified.ok, true);
        assert.ok(calls.some(([name]) => name === 'verify-email'));
    } finally {
        dom.window.close();
    }
});

// --------------------------------------------------- sign-out and identity

test('an availability answer that belongs to another account is never shown as free', async () => {
    const { dom, window } = await setupDom();
    try {
        const { sdk, store, calls } = fakeFirestore();
        const first = makeDirectory(window, { sdk, store, calls, user: passwordAccount });
        await first.reserve('dante_kanji', { email: 'learner@example.com' });
        assert.equal(first.cache.dante_kanji.reason, 'yours');
        assert.equal(first.cache.dante_kanji.uid, 'password-uid');

        // A second account on the same device: the stored "mine" must not leak.
        const second = makeDirectory(window, {
            sdk,
            store,
            calls,
            uid: 'second-uid',
            user: { uid: 'second-uid', email: 'second@example.com' }
        });
        const check = await second.available('dante_kanji');
        assert.equal(check.available, false, 'another account must not be told the name is free');
        assert.equal(check.reason, 'taken');
        assert.match(check.message, /another account/i);
        assert.ok(check.suggestions.length > 0);

        // The owner still sees their own name as usable.
        const own = await first.available('dante_kanji');
        assert.equal(own.available, true);
        assert.equal(own.reason, 'yours');
    } finally {
        dom.window.close();
    }
});

test('signing out forgets the previous identity so the next account starts clean', async () => {
    const { dom, window } = await setupDom();
    try {
        const { sdk, store, calls } = fakeFirestore();
        const directory = makeDirectory(window, { sdk, store, calls });
        await directory.reserve('dante_kanji', { email: 'learner@example.com' });
        assert.equal(directory.handle.username, 'dante_kanji');
        assert.ok(window.localStorage.getItem(window.UsernameDirectory.HANDLE_KEY));

        directory.setUser(null);
        await directory.sync();
        assert.equal(directory.handle, null, 'no username mirror after sign-out');
        assert.equal(window.localStorage.getItem(window.UsernameDirectory.HANDLE_KEY), null);
        assert.equal(
            directory.cache.dante_kanji,
            undefined,
            'the owned answer is dropped, so it cannot look free to the next account'
        );

        const stranger = makeDirectory(window, {
            sdk,
            store,
            calls,
            uid: 'other-uid',
            user: { uid: 'other-uid', email: 'other@example.com' }
        });
        const check = await stranger.available('dante_kanji');
        assert.equal(check.available, false, 'the name stays taken for everyone else');

        // An unrelated account's free answer is left alone.
        stranger.remember('some_other_name', true, 'free');
        assert.ok(stranger.cache.some_other_name);
    } finally {
        dom.window.close();
    }
});

test('sign-out clears the photo, nickname and username but keeps learning progress', async () => {
    const { dom, window } = await setupDom();
    try {
        window.eval(read('ui-feedback.js'));
        window.eval(read('backup-manager.js'));
        window.eval(read('avatar-crop.js'));
        window.eval(read('app-auth.js'));

        const doc = window.document;
        const removed = [];
        window.URL.createObjectURL = () => 'blob:photo';
        window.URL.revokeObjectURL = (url) => removed.push(url);
        window.BackupManager.media = async (write, slots) => {
            if (write) {
                removed.push(`media:${slots.join(',')}:${Object.keys(write).length}`);
            }
            return {};
        };
        window.localStorage.setItem(
            'kanji_progress',
            JSON.stringify({ studied: ['日'], mastered: [], skipped: [] })
        );
        window.localStorage.setItem('kanji_profile', JSON.stringify({ nickname: 'Dante' }));
        window.AvatarCrop.write({ x: 0.2, y: 0.5, zoom: 2, ratio: 1.5 });
        const manager = new window.BackupManager();
        window.driveBackup = manager;
        manager.avatarURL = 'blob:photo';
        doc.getElementById('profileNickname').value = 'Dante';

        const calls = [];
        const auth = new window.AppAuth(config, async () => fakeAuthSdk({ calls }));
        await auth.init();
        auth.user = passwordAccount;
        if (!window.kanjiUsernames) {
            window.kanjiUsernames = new window.UsernameDirectory();
        }
        window.kanjiUsernames.handle = { uid: 'password-uid', username: 'dante_kanji' };
        window.localStorage.setItem(
            window.UsernameDirectory.HANDLE_KEY,
            JSON.stringify({ uid: 'password-uid', username: 'dante_kanji' })
        );

        assert.equal(await auth.signOut(), true);
        assert.equal(manager.avatarURL, '', 'the uploaded photo is no longer shown');
        assert.equal(window.AvatarCrop.read(), null, 'the crop record is gone');
        assert.deepEqual(
            JSON.parse(window.localStorage.getItem('kanji_profile')),
            {},
            'the nickname is gone'
        );
        assert.equal(doc.getElementById('profileNickname').value, '');
        assert.equal(window.kanjiUsernames.handle, null);
        assert.equal(window.localStorage.getItem(window.UsernameDirectory.HANDLE_KEY), null);
        assert.equal(
            window.localStorage.getItem('kanji_progress'),
            '{"studied":["日"],"mastered":[],"skipped":[]}',
            'learning progress must survive sign-out'
        );
        assert.ok(
            removed.includes('media:avatar:0'),
            'the stored photo blob is deleted, not just hidden'
        );
        const avatarImg = doc.getElementById('accountAvatar');
        assert.ok(!avatarImg.getAttribute('src'), 'no photo is rendered after sign-out');
        assert.equal(avatarImg.dataset.source, '', 'the rendered source is empty');
        assert.ok(avatarImg.hidden, 'the placeholder, not a face, is shown');
        assert.equal(doc.querySelector('#accountAvatar + *')?.hidden, false);
        assert.match(
            doc.getElementById('profileStatus').textContent,
            /photo, name and username were removed/i
        );
        assert.match(auth.message, /photo, name and username were removed/i);
        assert.match(auth.message, /Drive has its own Disconnect/, 'Drive guidance is kept');
    } finally {
        dom.window.close();
    }
});

test('a sign-out announced by another tab still clears this tab', async () => {
    const { dom, window } = await setupDom();
    try {
        window.eval(read('ui-feedback.js'));
        window.eval(read('backup-manager.js'));
        window.eval(read('avatar-crop.js'));
        window.eval(read('app-auth.js'));
        window.BackupManager.media = async () => ({});
        window.URL.revokeObjectURL = () => {};
        const manager = new window.BackupManager();
        window.driveBackup = manager;
        manager.avatarURL = 'blob:photo';
        window.AvatarCrop.write({ x: 0.5, y: 0.5, zoom: 1, ratio: 1 });
        window.localStorage.setItem('kanji_profile', JSON.stringify({ nickname: 'Dante' }));

        const sdk = fakeAuthSdk({ user: passwordAccount });
        const auth = new window.AppAuth(config, async () => sdk);
        await auth.init();
        auth.user = passwordAccount;
        if (!window.kanjiUsernames) {
            window.kanjiUsernames = new window.UsernameDirectory();
        }
        window.kanjiUsernames.handle = { uid: 'password-uid', username: 'dante_kanji' };

        // Another tab signs out; the SDK announces it here.
        sdk.announce(null);
        await new Promise((resolve) => setTimeout(resolve, 0));

        assert.equal(manager.avatarURL, '', 'the photo goes even without a local sign-out');
        assert.equal(window.AvatarCrop.read(), null);
        assert.deepEqual(JSON.parse(window.localStorage.getItem('kanji_profile')), {});
        assert.equal(window.kanjiUsernames.handle, null);
        assert.match(auth.message, /another tab/i);
        assert.match(auth.message, /learning progress stays/i);
        for (const note of window.document.querySelectorAll('[data-sign-out-note]')) {
            assert.equal(note.hidden, true, 'the disclosure is hidden once nobody is signed in');
        }
    } finally {
        dom.window.close();
    }
});

test('dismissing the sign-out confirmation removes nothing', async () => {
    const { dom, window } = await setupDom();
    try {
        window.eval(read('ui-feedback.js'));
        window.eval(read('backup-manager.js'));
        window.eval(read('avatar-crop.js'));
        window.eval(read('app-auth.js'));
        const removed = [];
        window.BackupManager.media = async (write, slots) => {
            removed.push(['media', slots.join(',')]);
            return {};
        };
        const manager = new window.BackupManager();
        window.driveBackup = manager;
        manager.avatarURL = 'blob:photo';
        window.AvatarCrop.write({ x: 0.5, y: 0.5, zoom: 1, ratio: 1 });
        window.localStorage.setItem('kanji_profile', JSON.stringify({ nickname: 'Dante' }));

        let asked = '';
        window.confirm = (text) => {
            asked = text;
            return false;
        };
        const sdk = fakeAuthSdk({ user: passwordAccount });
        const auth = new window.AppAuth(config, async () => sdk);
        await auth.init();
        auth.user = passwordAccount;

        assert.equal(await auth.signOut(), false, 'a dismissed prompt is not a sign-out');
        assert.match(asked, /photo/i, 'the prompt names what is removed');
        assert.match(asked, /progress.*kept|Kept: kanji progress/i, 'and what is kept');
        assert.equal(auth.user, passwordAccount, 'the session is untouched');
        assert.equal(manager.avatarURL, 'blob:photo');
        assert.ok(window.AvatarCrop.read());
        assert.equal(JSON.parse(window.localStorage.getItem('kanji_profile')).nickname, 'Dante');
        assert.deepEqual(removed, [], 'nothing is deleted when the prompt is dismissed');
    } finally {
        dom.window.close();
    }
});

test('a cancelled or failed sign-out leaves the local identity alone', async () => {
    const { dom, window } = await setupDom();
    try {
        window.eval(read('ui-feedback.js'));
        window.eval(read('backup-manager.js'));
        window.eval(read('avatar-crop.js'));
        window.eval(read('app-auth.js'));
        window.BackupManager.media = async () => ({});
        window.URL.revokeObjectURL = () => {};
        const manager = new window.BackupManager();
        window.driveBackup = manager;
        manager.avatarURL = 'blob:photo';
        window.AvatarCrop.write({ x: 0.5, y: 0.5, zoom: 1, ratio: 1 });
        window.localStorage.setItem('kanji_profile', JSON.stringify({ nickname: 'Dante' }));

        const auth = new window.AppAuth(config, async () =>
            fakeAuthSdk({ error: { code: 'auth/network-request-failed' } })
        );
        await auth.init();
        auth.user = passwordAccount;
        assert.equal(await auth.signOut(), false);
        assert.equal(manager.avatarURL, 'blob:photo');
        assert.ok(window.AvatarCrop.read());
        assert.equal(JSON.parse(window.localStorage.getItem('kanji_profile')).nickname, 'Dante');
    } finally {
        dom.window.close();
    }
});

// -------------------------------------------------------- username registry

test('availability checks normalise, cache and explain taken or reserved names', async () => {
    const { dom, window } = await setupDom();
    try {
        const reservedUntil = window.UsernamePolicy.RESERVATION_DAYS * 86400000;
        const { sdk, store, calls } = fakeFirestore();
        const directory = makeDirectory(window, { sdk, store, calls });
        const free = await directory.available('Dante_Kanji');
        assert.equal(free.available, true);
        assert.equal(free.username, 'dante_kanji');
        assert.equal(calls.reads, 1);
        const second = await directory.available('dante_kanji');
        assert.equal(second.available, true);
        assert.equal(calls.reads, 1, 'a cached answer must not spend another read');

        store.set('usernames/taken_name', {
            uid: 'other-uid',
            kind: 'user',
            display: 'taken_name'
        });
        const taken = await directory.available('taken_name');
        assert.equal(taken.available, false);
        assert.equal(taken.reason, 'taken');
        assert.match(taken.message, /already taken/i);
        assert.equal(taken.suggestions.length, 3);

        store.set('usernames/still_mine', {
            uid: 'password-uid',
            kind: 'user',
            display: 'still_mine'
        });
        const mine = await directory.available('still_mine');
        assert.equal(mine.available, true);
        assert.equal(mine.reason, 'yours');

        store.set('usernames/on_hold', {
            uid: '',
            kind: 'reserved',
            display: 'on_hold',
            reservedUntil: { toMillis: () => Date.now() + reservedUntil }
        });
        const held = await directory.available('on_hold');
        assert.equal(held.available, false);
        assert.equal(held.reason, 'reserved');

        store.set('usernames/lapsed', {
            uid: '',
            kind: 'reserved',
            display: 'lapsed',
            reservedUntil: { toMillis: () => Date.now() - 1000 }
        });
        const released = await directory.available('lapsed');
        assert.equal(released.available, true);
        assert.equal(released.reason, 'released');
        // A released name belongs to nobody, so re-reading the cached answer must not
        // turn into "that is your current username".
        const readsBefore = calls.reads;
        const releasedAgain = await directory.available('lapsed');
        assert.equal(releasedAgain.available, true);
        assert.equal(releasedAgain.reason, 'cached');
        assert.match(releasedAgain.message, /released by its previous owner/i);
        assert.equal(calls.reads, readsBefore, 'a fresh release answer is served from cache');
        const otherAccount = makeDirectory(window, {
            sdk,
            store,
            calls,
            uid: 'other-uid',
            user: { uid: 'other-uid', email: 'other@example.com' }
        });
        const forOther = await otherAccount.available('lapsed');
        assert.equal(forOther.available, true, 'a released name is free for anyone');
        assert.equal(forOther.reason, 'cached');
        assert.doesNotMatch(forOther.message, /current username/i);
        assert.equal(calls.reads, readsBefore, 'and it is not re-fetched per account');

        const invalid = await directory.available('no');
        assert.equal(invalid.available, false);
        assert.equal(invalid.reason, 'short');
        assert.equal(calls.reads, 5, 'invalid names are never sent to the server');

        Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
        const offline = await directory.available('brand_new_name');
        assert.equal(offline.available, null);
        assert.equal(offline.reason, 'offline');
        assert.match(offline.message, /offline/i);
    } finally {
        dom.window.close();
    }
});

test('availability failures never block account creation', async () => {
    const { dom, window } = await setupDom();
    try {
        const { sdk, store, calls } = fakeFirestore();
        sdk.getDocFromServer = async () => {
            throw Object.assign(new Error('denied'), { code: 'permission-denied' });
        };
        const directory = makeDirectory(window, { sdk, store, calls });
        const blocked = await directory.available('dante_kanji');
        assert.equal(blocked.available, null);
        assert.equal(blocked.reason, 'blocked');
        assert.match(blocked.message, /security rules|verified when you create/i);
    } finally {
        dom.window.close();
    }
});

test('claiming a username writes the reservation and the account record', async () => {
    const { dom, window } = await setupDom();
    try {
        const { sdk, store, calls } = fakeFirestore();
        const directory = makeDirectory(window, { sdk, store, calls, user: passwordAccount });
        const claimed = await directory.reserve('Dante_Kanji', { email: 'learner@example.com' });
        assert.equal(claimed.ok, true);
        assert.equal(claimed.username, 'dante_kanji');
        const reservation = store.get('usernames/dante_kanji');
        assert.equal(reservation.uid, 'password-uid');
        assert.equal(reservation.kind, 'user');
        assert.equal(reservation.display, 'Dante_Kanji');
        assert.equal(store.get('users/password-uid').username, 'dante_kanji');
        assert.equal(directory.handle.username, 'dante_kanji');
        assert.equal(
            JSON.parse(window.localStorage.getItem(window.UsernameDirectory.HANDLE_KEY)).username,
            'dante_kanji'
        );

        const before = calls.writes;
        for (const bad of ['admin', 'ab', 'bad name']) {
            const refused = await directory.reserve(bad);
            assert.equal(refused.ok, false, bad);
        }
        assert.equal(calls.writes, before, 'invalid names never reach the database');

        const rival = makeDirectory(window, {
            sdk,
            store,
            calls,
            uid: 'other-uid',
            user: { uid: 'other-uid', email: 'rival@example.com' }
        });
        const clash = await rival.reserve('dante_kanji');
        assert.equal(clash.ok, false);
        assert.equal(clash.reason, 'taken');
        assert.match(clash.message, /taken/i);
        assert.equal(store.get('usernames/dante_kanji').uid, 'password-uid');
        assert.equal(store.has('users/other-uid'), false);
    } finally {
        dom.window.close();
    }
});

test('renaming respects the cooldown and reserves the previous name', async () => {
    const { dom, window } = await setupDom();
    try {
        const now = Date.now();
        const { sdk, store, calls } = fakeFirestore();
        const directory = makeDirectory(window, { sdk, store, calls });
        store.set('usernames/dante_kanji', {
            uid: 'password-uid',
            kind: 'user',
            display: 'dante_kanji'
        });
        store.set('users/password-uid', {
            uid: 'password-uid',
            username: 'dante_kanji',
            display: 'dante_kanji',
            renamedAt: { toMillis: () => now - 86400000 }
        });
        directory.writeHandle({ uid: 'password-uid', username: 'dante_kanji' });
        directory.profile = store.get('users/password-uid');
        assert.equal(directory.renameDaysLeft(), 29);
        const blocked = await directory.rename('dante_sensei');
        assert.equal(blocked.ok, false);
        assert.equal(blocked.reason, 'cooldown');
        assert.match(blocked.message, /once every 30 days/i);
        assert.equal(calls.writes, 0, 'nothing is written while the cooldown holds');

        store.set('users/password-uid', {
            uid: 'password-uid',
            username: 'dante_kanji',
            display: 'dante_kanji',
            renamedAt: { toMillis: () => now - 31 * 86400000 }
        });
        directory.profile = store.get('users/password-uid');
        assert.equal(directory.renameDaysLeft(), 0);
        const moved = await directory.rename('dante_sensei');
        assert.equal(moved.ok, true);
        assert.equal(moved.previous, 'dante_kanji');
        assert.equal(store.get('users/password-uid').username, 'dante_sensei');
        const released = store.get('usernames/dante_kanji');
        assert.equal(released.kind, 'reserved');
        assert.equal(released.uid, '');
        assert.ok(
            Math.abs(
                released.reservedUntil.toMillis() -
                    (now + window.UsernamePolicy.RESERVATION_DAYS * 86400000)
            ) < 5000,
            'the previous name is reserved for 30 days'
        );
        assert.equal(store.get('usernames/dante_sensei').uid, 'password-uid');

        const blockedName = await directory.rename('dante_sensei');
        assert.equal(blockedName.ok, false);
        assert.match(blockedName.message, /already your username/i);

        const taken = await directory.rename('ab');
        assert.equal(taken.ok, false);
        assert.equal(taken.reason, 'short');
    } finally {
        dom.window.close();
    }
});

test('the account record publishes only verified addresses and never alias addresses', async () => {
    const { dom, window } = await setupDom();
    try {
        const { sdk, store, calls } = fakeFirestore();
        const unverified = makeDirectory(window, {
            sdk,
            store,
            calls,
            user: { ...passwordAccount, emailVerified: false }
        });
        assert.equal(unverified.publicEmail(), '');
        const alias = makeDirectory(window, { sdk, store, calls, user: aliasAccount });
        assert.equal(alias.publicEmail(), '');

        const verified = makeDirectory(window, {
            sdk,
            store,
            calls,
            user: { ...passwordAccount, emailVerified: true }
        });
        assert.equal(verified.publicEmail(), 'learner@example.com');

        store.set('users/password-uid', {
            uid: 'password-uid',
            username: 'dante_kanji',
            email: ''
        });
        await verified.sync();
        assert.equal(verified.handle.username, 'dante_kanji');
        assert.equal(store.get('usernames/dante_kanji'), undefined, 'no reservation was invented');
        assert.equal(store.get('users/password-uid').email, 'learner@example.com');

        // A restored local mirror without a server-side record must not attempt a
        // half-written account document that the rules would reject anyway.
        const stranded = makeDirectory(window, { sdk, store, calls });
        stranded.writeHandle({ uid: 'password-uid', username: 'dante_kanji' });
        stranded.profile = null;
        const skipped = await stranded.publishEmail();
        assert.equal(skipped.ok, false);
        assert.equal(skipped.skipped, true);

        const google = makeDirectory(window, { sdk, store, calls, user: googleAccount });
        assert.equal(google.publicEmail(), 'learner@googlemail.com');
    } finally {
        dom.window.close();
    }
});

test('signing in restores the handle mirror and signs out cleanly', async () => {
    const { dom, window } = await setupDom();
    try {
        const { sdk, store, calls } = fakeFirestore();
        const directory = makeDirectory(window, { sdk, store, calls });
        store.set('users/password-uid', {
            uid: 'password-uid',
            username: 'dante_kanji',
            display: 'Dante',
            email: ''
        });
        let events = 0;
        window.addEventListener('kanji-handle-changed', () => events++);
        const handle = await directory.sync();
        assert.equal(handle.username, 'dante_kanji');
        assert.equal(handle.display, 'Dante');
        assert.ok(events > 0);

        const seeded = new Map([
            [
                window.UsernameDirectory.HANDLE_KEY,
                JSON.stringify({ uid: 'password-uid', username: 'dante_kanji' })
            ]
        ]);
        window.localStorage.setItem(
            window.UsernameDirectory.HANDLE_KEY,
            JSON.stringify({ uid: 'password-uid', username: 'dante_kanji' })
        );
        directory.setUser(null);
        assert.equal(await directory.sync(), null);
        assert.equal(directory.handle, null);
        assert.equal(window.localStorage.getItem(window.UsernameDirectory.HANDLE_KEY), null);
        assert.ok(seeded.size === 1);
    } finally {
        dom.window.close();
    }
});

test('a sync that started before a fresh claim cannot erase the claimed handle', async () => {
    const { dom, window } = await setupDom();
    try {
        const { sdk, store, calls } = fakeFirestore();
        const directory = makeDirectory(window, { sdk, store, calls });
        store.set('users/password-uid', { uid: 'password-uid', email: '' });
        await directory.sync();
        assert.equal(directory.handle, null);
        await directory.reserve('dante_kanji', { email: 'learner@example.com' });
        await directory.sync();
        assert.equal(directory.handle.username, 'dante_kanji');
    } finally {
        dom.window.close();
    }
});

// ---------------------------------------------------------------- dialog

// Availability checks are throttled while typing; tests bypass the wait explicitly.
async function checkUsername(dialog, value) {
    clearTimeout(dialog.usernameTimer);
    dialog.lastUsernameCheckAt = 0;
    await dialog.runUsernameCheck(value);
}

async function setupDialog(overrides = {}) {
    const { dom, window } = await setupDom();
    const calls = [];
    const directoryCalls = [];
    const directory = {
        handle: overrides.handle ?? null,
        profile: overrides.profile ?? {},
        available: async (value) =>
            overrides.available
                ? overrides.available(value)
                : {
                      username: window.UsernamePolicy.normalize(value),
                      display: window.UsernamePolicy.display(value),
                      available: true,
                      reason: 'free',
                      message: `“${value}” is available.`,
                      suggestions: []
                  },
        reserve: async (value) => {
            directoryCalls.push(['reserve', value]);
            return overrides.reserve ? overrides.reserve(value) : { ok: true, username: value };
        },
        rename: async (value) => {
            directoryCalls.push(['rename', value]);
            return overrides.rename ? overrides.rename(value) : { ok: true, username: value };
        },
        renameDaysLeft: () => overrides.renameDaysLeft || 0,
        sync: async () => {
            directoryCalls.push(['sync']);
            return overrides.handle ?? null;
        },
        directoryEmail: async () => ''
    };
    const auth = {
        ready: true,
        busy: false,
        user: overrides.user ?? null,
        message: '',
        signInWithEmail: async (identifier, password) => {
            calls.push(['sign-in', identifier, password]);
            return overrides.signInResult ?? { ok: true, email: 'learner@example.com' };
        },
        createAccount: async (values) => {
            calls.push(['create', values]);
            return overrides.createResult ?? { ok: true, user: { uid: 'new-uid' } };
        },
        sendPasswordReset: async (value) => {
            calls.push(['reset', value]);
            return overrides.resetResult ?? { ok: true, message: 'sent' };
        },
        sendVerificationEmail: async () => {
            calls.push(['verify-email']);
            return { ok: true, message: 'sent' };
        },
        refreshUser: async () => {
            calls.push(['refresh-user']);
            return overrides.refreshResult ?? { ok: true, verified: true };
        },
        addRecoveryEmail: async (value) => {
            calls.push(['recovery', value]);
            return { ok: true, message: 'sent' };
        },
        linkGoogle: async () => {
            calls.push(['link-google']);
            return { ok: true, message: 'linked' };
        },
        linkPassword: async (email, password) => {
            calls.push(['link-password', email, password]);
            return { ok: true, email, message: 'added' };
        },
        signIn: async () => {
            calls.push(['google']);
            return { ok: true };
        },
        signOut: async () => {
            calls.push(['sign-out']);
            return true;
        }
    };
    window.eval(read('app-auth.js'));
    window.eval(read('auth-dialog.js'));
    const dialogElement = window.document.getElementById('authDialog');
    dialogElement.showModal = () => dialogElement.setAttribute('open', '');
    dialogElement.close = () => dialogElement.removeAttribute('open');
    window.kanjiAuth = auth;
    window.kanjiUsernames = directory;
    window.kanjiAuthDialog = new window.AuthDialog();
    window.kanjiAuthDialog.init();
    window.kanjiAuth.render = window.AppAuth.prototype.render.bind(auth);
    return { dom, window, auth, directory, calls, directoryCalls };
}

test('the sign-in dialog exposes both paths and keeps one namespace of IDs', async () => {
    const { dom, window } = await setupDialog();
    try {
        const doc = window.document;
        const ids = [...doc.querySelectorAll('[id]')].map((node) => node.id);
        assert.equal(
            new Set(ids).size,
            ids.length,
            'duplicate IDs make controls target the wrong element'
        );
        assert.ok(doc.getElementById('authDialog'));
        for (const id of [
            'authSignInIdentifier',
            'authSignInPassword',
            'authCreateEmail',
            'authCreateUsername',
            'authUsernameStatus',
            'authCreatePassword',
            'authCreatePasswordConfirm',
            'authCreateConsent',
            'authUsernameChange',
            'authAddRecoveryEmail'
        ]) {
            assert.ok(doc.getElementById(id), id);
        }
        assert.equal(doc.querySelector('[data-auth-pane=create]').hidden, true);
        doc.getElementById('authTabCreate').click();
        assert.equal(doc.querySelector('[data-auth-pane=create]').hidden, false);
        assert.equal(doc.querySelector('[data-auth-pane=signin]').hidden, true);
        assert.equal(doc.getElementById('authTabCreate').getAttribute('aria-selected'), 'true');

        for (const button of doc.querySelectorAll('[data-app-sign-in]')) {
            assert.equal(button.classList.contains('danger-action'), false);
            assert.match(button.textContent, /Sign in or create account/);
        }
        for (const button of doc.querySelectorAll('[data-app-sign-out]')) {
            assert.equal(button.classList.contains('danger-action'), true);
        }
        // Every sign-out button is paired with a line naming what goes and what stays.
        assert.equal(doc.querySelectorAll('[data-sign-out-note]').length, 2);
        for (const note of doc.querySelectorAll('[data-sign-out-note]')) {
            assert.match(note.textContent, /removes your photo, name and username/);
            assert.match(note.textContent, /Progress stays/);
        }
        assert.match(
            doc.querySelector('.auth-signout-note').textContent,
            /Kanji progress, reviews and local backups stay/
        );
        assert.ok(doc.querySelector('[data-username-control]'));
        assert.ok(doc.querySelector('[data-auth-verify]'));
    } finally {
        dom.window.close();
    }
});

test('header sign-in opens the dialog instead of jumping straight to a popup', async () => {
    const { dom, window } = await setupDialog();
    try {
        const calls = [];
        const auth = new window.AppAuth(config, async () => fakeAuthSdk({ calls }));
        window.kanjiAuth = auth;
        await auth.init();
        for (const button of window.document.querySelectorAll('[data-app-sign-in]')) {
            button.click();
            assert.equal(window.document.getElementById('authDialog').open, true);
            assert.equal(
                calls.some(([name]) => name === 'google-popup'),
                false
            );
        }
    } finally {
        dom.window.close();
    }
});

test('username typing shows taken, reserved and available states with suggestions', async () => {
    const { dom, window } = await setupDialog({
        available: async (value) => {
            const policy = window.UsernamePolicy;
            const checked = policy.validate(value);
            if (!checked.ok) {
                return { ...checked, available: false, suggestions: [] };
            }
            if (checked.username === 'dante_kanji') {
                return {
                    ...checked,
                    available: false,
                    reason: 'taken',
                    message: `“${checked.display}” is already taken.`,
                    suggestions: policy.suggestions(checked.username, [checked.username])
                };
            }
            return {
                ...checked,
                available: true,
                reason: 'free',
                message: 'Available.',
                suggestions: []
            };
        }
    });
    try {
        const doc = window.document;
        const dialog = window.kanjiAuthDialog;
        dialog.open('create');
        const input = doc.getElementById('authCreateUsername');
        input.value = 'dante_kanji';
        await checkUsername(dialog, 'dante_kanji');
        const status = doc.getElementById('authUsernameStatus');
        assert.match(status.textContent, /already taken/i);
        assert.equal(status.classList.contains('auth-username-status--taken'), true);
        assert.equal(doc.getElementById('authCreateSubmit').disabled, true);
        const suggestions = doc.querySelectorAll('#authUsernameSuggestions .auth-suggestion');
        assert.equal(suggestions.length, 3);
        suggestions[0].click();
        assert.equal(input.value, suggestions[0].textContent);

        await checkUsername(dialog, 'dante');
        assert.equal(
            doc
                .getElementById('authUsernameStatus')
                .classList.contains('auth-username-status--free'),
            true
        );
        assert.equal(doc.getElementById('authCreateSubmit').disabled, false);

        await checkUsername(dialog, 'ad');
        assert.match(doc.getElementById('authUsernameStatus').textContent, /at least 3/i);

        await checkUsername(dialog, 'admin');
        assert.match(doc.getElementById('authUsernameStatus').textContent, /reserved/i);
    } finally {
        dom.window.close();
    }
});

test('password strength levels use the length tiers and variety, not just length', async () => {
    const { dom, window } = await setupDialog();
    try {
        const strength = window.AuthDialog.strength;
        assert.equal(strength('').key, 'none');
        assert.equal(strength('short').key, 'weak');
        assert.equal(strength('password').key, 'weak', 'eight plain letters stay weak');
        assert.equal(strength('password123').key, 'weak');
        assert.equal(strength('CorrectHorse123').key, 'good');
        assert.equal(strength('CorrectHorse123!').key, 'strong');
        assert.equal(
            strength('a quiet river bends around the stones').key,
            'strong',
            'a long passphrase must not be punished for having no symbols'
        );
        assert.equal(strength('Ab1!').key, 'weak');
        for (const level of window.AuthDialog.levels) {
            assert.ok(level.label && level.detail, level.key);
        }
    } finally {
        dom.window.close();
    }
});

test('the meter repaints its level, colour hook and text as the password is typed', async () => {
    const { dom, window } = await setupDialog();
    try {
        const doc = window.document;
        const dialog = window.kanjiAuthDialog;
        dialog.open('create');
        const field = doc.getElementById('authCreatePassword');
        const meter = doc.getElementById('authCreateStrengthMeter');
        const label = doc.getElementById('authCreatePasswordStrength');
        assert.ok(meter, 'the strength meter must be present');
        assert.equal(meter.querySelectorAll('span').length, 4, 'four colour steps');
        assert.equal(meter.dataset.level, 'none');
        assert.match(label.textContent, /Not set/);
        assert.equal(label.getAttribute('aria-live'), 'polite');

        for (const [value, level] of [
            ['password', 'weak'],
            ['password1234', 'fair'],
            ['CorrectHorse123', 'good'],
            ['CorrectHorse123!', 'strong']
        ]) {
            field.value = value;
            field.dispatchEvent(new window.Event('input'));
            assert.equal(meter.dataset.level, level, value);
            assert.match(label.textContent, new RegExp(window.AuthDialog.strength(value).label));
        }
        const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
        for (const step of ['weak', 'fair', 'good', 'strong']) {
            assert.ok(
                css.includes(`.auth-strength-meter[data-level='${step}']`),
                `meter styling for ${step}`
            );
        }
        assert.ok(css.includes('--auth-strength-weak: #d32f2f'), 'red for weak');
        assert.ok(css.includes('--auth-strength-strong: #2e7d32'), 'green for strong');
        assert.ok(css.includes('--auth-strength-strong: #6ddc7f'), 'a dark-theme variant exists');
        assert.match(
            css,
            /@media \(prefers-reduced-motion: reduce\) \{\s*\.auth-strength-meter span/,
            'the transition respects reduced motion'
        );
    } finally {
        dom.window.close();
    }
});

test('every sign-in failure reports a code, and the vague fallback keeps it visible', async () => {
    const { dom, window } = await setupDom();
    try {
        window.eval(read('app-auth.js'));
        const cases = [
            ['auth/configuration-not-found', /enable Email\/Password/i],
            ['auth/internal-error', /Website restrictions/i],
            ['auth/operation-not-supported-in-this-environment', /regular tab/i],
            ['auth/user-token-expired', /expired/i],
            ['auth/unauthorized-domain', /authorized/i]
        ];
        for (const [code, pattern] of cases) {
            assert.match(window.AppAuth.errorMessage({ code }), pattern, code);
        }
        const unknown = window.AppAuth.errorMessage({ code: 'auth/something-new' });
        assert.match(unknown, /\(auth\/something-new\)/, 'the raw code must stay visible');
        assert.match(unknown, /Local learning still works/);
        assert.ok(
            window.AppAuth.errorMessage({}).includes('Sign-in is unavailable right now'),
            'a code-less failure still says something useful'
        );
    } finally {
        dom.window.close();
    }
});

test('a failed startup is explained in the dialog instead of "still starting"', async () => {
    const { dom, window } = await setupDialog();
    try {
        const doc = window.document;
        const dialog = window.kanjiAuthDialog;
        window.kanjiAuth.ready = false;
        window.kanjiAuth.message = 'This site is not authorized for Firebase login yet.';
        dialog.open('signin');
        doc.getElementById('authSignInIdentifier').value = 'learner@example.com';
        doc.getElementById('authSignInPassword').value = 'whatever';
        doc.getElementById('authSignInForm').dispatchEvent(
            new window.Event('submit', { cancelable: true })
        );
        await new Promise((resolve) => setTimeout(resolve, 0));
        assert.match(doc.getElementById('authFeedback').textContent, /not authorized/i);
        window.kanjiAuth.message = 'Checking your saved sign-in…';
        assert.match(dialog.startupMessage(window.kanjiAuth), /still starting/i);
    } finally {
        dom.window.close();
    }
});

test('creating an account sends the confirmation link automatically', async () => {
    const { dom, window } = await setupDom();
    try {
        window.eval(read('app-auth.js'));
        const calls = [];
        const auth = new window.AppAuth(config, async () => fakeAuthSdk({ calls }));
        await auth.init();
        const created = await auth.createAccount({
            email: 'learner@example.com',
            password: 'long enough password'
        });
        assert.equal(created.ok, true);
        assert.equal(created.verificationSent, true);
        assert.deepEqual(
            calls.find(([name]) => name === 'verify-email'),
            ['verify-email', 'learner@example.com']
        );

        // A failing mail step must not undo a created account.
        const failing = new window.AppAuth(config, async () => {
            const sdk = fakeAuthSdk({ calls: [] });
            sdk.sendEmailVerification = async () => {
                throw Object.assign(new Error('quota'), { code: 'auth/too-many-requests' });
            };
            return sdk;
        });
        await failing.init();
        const partial = await failing.createAccount({
            email: 'second@example.com',
            password: 'long enough password'
        });
        assert.equal(partial.ok, true);
        assert.equal(partial.verificationSent, false);
        assert.equal(failing.user.email, 'second@example.com');
    } finally {
        dom.window.close();
    }
});

test('the app notices a confirmed address without a new sign-in', async () => {
    const { dom, window } = await setupDom();
    try {
        window.eval(read('app-auth.js'));
        const calls = [];
        const auth = new window.AppAuth(config, async () => fakeAuthSdk({ calls }));
        await auth.init();
        auth.user = { ...passwordAccount };
        assert.equal(auth.user.emailVerified, false);
        auth.render();
        const identities = window.document.querySelector('[data-app-auth-identities]');
        assert.match(identities.textContent, /email not confirmed/);
        const refreshed = await auth.refreshUser();
        assert.equal(refreshed.ok, true);
        assert.equal(refreshed.verified, true);
        assert.equal(auth.user.emailVerified, true);
        assert.ok(calls.some(([name]) => name === 'reload'));
        assert.match(identities.textContent, /email confirmed/);
        const immediate = await auth.refreshUser();
        assert.equal(immediate.throttled, true, 'focus events must not hammer the service');
    } finally {
        dom.window.close();
    }
});

test('the blocked-origin and restricted-key codes explain the exact setting', async () => {
    const { dom, window } = await setupDom();
    try {
        window.eval(read('app-auth.js'));
        const referrer = window.AppAuth.errorMessage({
            code: 'auth/requests-from-referer-http://localhost:5000-are-blocked.'
        });
        assert.match(referrer, /HTTP referrers/i);
        assert.match(referrer, /https:\/\/kanji\.qd\.je\/\*/);
        assert.match(referrer, /few minutes/i);
        const api = window.AppAuth.errorMessage({
            code: 'auth/requests-to-this-api-identitytoolkit-method-are-blocked.'
        });
        assert.match(api, /Identity Toolkit API/);
        assert.match(api, /API restrictions/i);

        // Naming the project stops the wrong-project wild goose chase.
        window.KANJI_FIREBASE_CONFIG = { projectId: 'kanji-widgets' };
        const named = window.AppAuth.errorMessage({
            code: 'auth/requests-from-referer-http://localhost:5000-are-blocked.'
        });
        assert.match(named, /kanji-widgets/);
        assert.match(named, /Browser key \(auto created by Firebase\)/);
    } finally {
        dom.window.close();
    }
});

test('creating an account validates the form, then claims the username', async () => {
    const { dom, window, calls, directoryCalls } = await setupDialog();
    try {
        const doc = window.document;
        const dialog = window.kanjiAuthDialog;
        dialog.open('create');
        doc.getElementById('authCreateEmail').value = 'not-an-email';
        doc.getElementById('authCreateUsername').value = 'dante_kanji';
        doc.getElementById('authCreatePassword').value = 'long enough password';
        doc.getElementById('authCreatePasswordConfirm').value = 'long enough password';
        doc.getElementById('authCreateForm').dispatchEvent(
            new window.Event('submit', { cancelable: true })
        );
        await new Promise((resolve) => setTimeout(resolve, 0));
        assert.match(doc.getElementById('authFeedback').textContent, /valid email/i);
        assert.equal(calls.length, 0);

        doc.getElementById('authCreateEmail').value = 'learner@example.com';
        doc.getElementById('authCreatePasswordConfirm').value = 'different password';
        doc.getElementById('authCreateForm').dispatchEvent(
            new window.Event('submit', { cancelable: true })
        );
        await new Promise((resolve) => setTimeout(resolve, 0));
        assert.match(doc.getElementById('authFeedback').textContent, /must match/i);
        assert.equal(calls.length, 0);

        doc.getElementById('authCreatePasswordConfirm').value = 'long enough password';
        doc.getElementById('authCreateConsent').checked = false;
        doc.getElementById('authCreateForm').dispatchEvent(
            new window.Event('submit', { cancelable: true })
        );
        await new Promise((resolve) => setTimeout(resolve, 0));
        assert.match(doc.getElementById('authFeedback').textContent, /not uploaded/i);
        assert.equal(calls.length, 0);

        doc.getElementById('authCreateConsent').checked = true;
        doc.getElementById('authCreateForm').dispatchEvent(
            new window.Event('submit', { cancelable: true })
        );
        await new Promise((resolve) => setTimeout(resolve, 0));
        assert.equal(calls[0][0], 'create');
        assert.equal(calls[0][1].email, 'learner@example.com');
        assert.deepEqual(directoryCalls[0], ['reserve', 'dante_kanji']);
        assert.match(doc.getElementById('authFeedback').textContent, /@dante_kanji/);
    } finally {
        dom.window.close();
    }
});

test('a username taken at the last moment keeps the account and asks for another', async () => {
    const { dom, window } = await setupDialog({
        reserve: async () => ({
            ok: false,
            reason: 'taken',
            message: '“dante_kanji” was taken a moment ago. Try another.',
            suggestions: ['dante_kanji_jp']
        })
    });
    try {
        const doc = window.document;
        const dialog = window.kanjiAuthDialog;
        dialog.open('create');
        doc.getElementById('authCreateEmail').value = 'learner@example.com';
        doc.getElementById('authCreateUsername').value = 'dante_kanji';
        doc.getElementById('authCreatePassword').value = 'long enough password';
        doc.getElementById('authCreatePasswordConfirm').value = 'long enough password';
        doc.getElementById('authCreateConsent').checked = true;
        doc.getElementById('authCreateForm').dispatchEvent(
            new window.Event('submit', { cancelable: true })
        );
        await new Promise((resolve) => setTimeout(resolve, 0));
        assert.match(doc.getElementById('authFeedback').textContent, /taken a moment ago/i);
        assert.equal(doc.querySelector('[data-auth-pane=account]').hidden, false);
        assert.equal(doc.getElementById('authUsernameChange').value, 'dante_kanji');
        assert.equal(
            doc.querySelectorAll('#authUsernameChangeStatus').length,
            1,
            'the account pane reports the failure in place'
        );
    } finally {
        dom.window.close();
    }
});

test('wrong passwords and reserved identifiers get specific help, not a vague failure', async () => {
    const { dom, window } = await setupDialog({
        signInResult: {
            ok: false,
            code: 'auth/invalid-credential',
            message:
                'Email, username or password is incorrect. Check your details, or reset your password.'
        },
        available: async (value) => ({
            username: window.UsernamePolicy.normalize(value),
            display: window.UsernamePolicy.display(value),
            available: false,
            reason: 'reserved',
            message: 'reserved',
            suggestions: []
        })
    });
    try {
        const doc = window.document;
        const dialog = window.kanjiAuthDialog;
        dialog.open('signin');
        doc.getElementById('authSignInIdentifier').value = 'dante_kanji';
        doc.getElementById('authSignInPassword').value = 'wrong';
        doc.getElementById('authSignInForm').dispatchEvent(
            new window.Event('submit', { cancelable: true })
        );
        await new Promise((resolve) => setTimeout(resolve, 0));
        assert.match(
            doc.getElementById('authFeedback').textContent,
            /recently changed by its owner/i
        );
        assert.equal(
            doc.getElementById('authFeedback').classList.contains('auth-feedback--error'),
            true
        );
    } finally {
        dom.window.close();
    }
});

test('forgot-password stays honest for username accounts without a mailbox', async () => {
    const { dom, window, calls } = await setupDialog();
    try {
        const doc = window.document;
        const dialog = window.kanjiAuthDialog;
        dialog.open('signin');
        doc.getElementById('authSignInIdentifier').value = 'dante_kanji';
        doc.getElementById('authSignInForgot').click();
        await new Promise((resolve) => setTimeout(resolve, 0));
        assert.match(doc.getElementById('authFeedback').textContent, /no mailbox on file/i);
        assert.equal(calls.length, 0, 'no reset is attempted without a mailbox');
    } finally {
        dom.window.close();
    }
});

test('the signed-in pane adapts to the methods an account actually has', async () => {
    const { dom, window } = await setupDialog({
        user: googleAccount,
        handle: { uid: 'google-uid', username: 'dante_kanji', display: 'dante_kanji' }
    });
    try {
        const doc = window.document;
        const dialog = window.kanjiAuthDialog;
        dialog.open('account');
        assert.match(doc.getElementById('authDialogTitle').textContent, /@dante_kanji/);
        assert.equal(doc.querySelector('[data-auth-pane=account]').hidden, false);
        assert.equal(doc.querySelector('[data-auth-pane=signin]').hidden, true);
        assert.equal(
            doc.getElementById('authAddPasswordSection').hidden,
            false,
            'Google accounts can add a password'
        );
        assert.equal(doc.getElementById('authLinkGoogle').hidden, true, 'Google is already linked');
        assert.equal(doc.getElementById('authRecoverySection').hidden, true);
        assert.equal(
            doc.getElementById('authVerifyEmail').hidden,
            true,
            'a Google address is already verified'
        );
        dialog.render();
        assert.equal(doc.getElementById('authAddPasswordEmail').value, 'learner@googlemail.com');
    } finally {
        dom.window.close();
    }
});

test('alias accounts are offered a recovery email and no password form', async () => {
    const { dom, window } = await setupDialog({
        user: aliasAccount,
        handle: { uid: 'alias-uid', username: 'dante_kanji', display: 'dante_kanji' }
    });
    try {
        const doc = window.document;
        window.kanjiAuthDialog.open('account');
        assert.equal(doc.getElementById('authRecoverySection').hidden, false);
        assert.equal(doc.getElementById('authAddPasswordSection').hidden, true);
        assert.equal(
            doc.getElementById('authVerifyEmail').hidden,
            true,
            'nothing to verify without a mailbox'
        );
        doc.getElementById('authRecoveryEmail').value = 'learner@example.com';
        doc.getElementById('authAddRecoveryEmail').click();
        await new Promise((resolve) => setTimeout(resolve, 0));
        assert.match(doc.getElementById('authFeedback').textContent, /sent/i);
    } finally {
        dom.window.close();
    }
});

test('changing a username surfaces the cooldown instead of silently failing', async () => {
    const { dom, window, directoryCalls } = await setupDialog({
        user: aliasAccount,
        handle: { uid: 'alias-uid', username: 'dante_kanji', display: 'dante_kanji' },
        rename: async () => ({
            ok: false,
            reason: 'cooldown',
            message: 'Usernames can be changed once every 30 days. Try again in 12 days.'
        })
    });
    try {
        const doc = window.document;
        window.kanjiAuthDialog.open('account');
        assert.match(doc.getElementById('authUsernameLabel').textContent, /Change username/);
        doc.getElementById('authUsernameChange').value = 'dante_sensei';
        doc.getElementById('authUsernameForm').dispatchEvent(
            new window.Event('submit', { cancelable: true })
        );
        await new Promise((resolve) => setTimeout(resolve, 0));
        assert.match(doc.getElementById('authFeedback').textContent, /once every 30 days/i);
        assert.deepEqual(directoryCalls.at(-1), ['rename', 'dante_sensei']);
    } finally {
        dom.window.close();
    }
});

// ------------------------------------------------------------- integration

test('credentials stay out of backups, cloud sync and the service worker cache', () => {
    const worker = read('sw.js');
    const deploy = read('.github/workflows/deploy.yml');
    const html = read('index.html');
    for (const file of ['username-policy.js', 'username-directory.js', 'auth-dialog.js']) {
        const versioned = `${file}?v=login-v1`;
        assert.ok(html.includes(versioned), `HTML: ${versioned}`);
        assert.ok(worker.includes(`'/${versioned}'`), `precache: ${versioned}`);
        assert.ok(deploy.includes(`cp ${file} deploy/`), `deploy: ${file}`);
        assert.ok(fs.existsSync(path.join(root, file)), file);
    }
    assert.match(
        worker,
        /kanji-widgets-v\d+/,
        'the offline cache must be versioned for this release'
    );
    assert.match(read('backup-manager.js'), /static BUILD = 'login-v1';/);
    const cloudKeys = read('cloud-sync.js').match(/static keys = \[[\s\S]*?\];/)[0];
    for (const forbidden of ['password', 'username', 'handle', 'credential']) {
        assert.equal(
            cloudKeys.includes(forbidden),
            false,
            `cloud sync must not carry ${forbidden}`
        );
    }
    const backupKeys = read('backup-manager.js').match(/static keys = \[[\s\S]*?\];/)[0];
    for (const forbidden of ['password', 'handle', 'auth']) {
        assert.equal(backupKeys.includes(forbidden), false, `backups must not carry ${forbidden}`);
    }
    const directory = read('username-directory.js');
    assert.match(directory, /kanji_handle_v1/);
    assert.equal(
        directory.includes('password'),
        false,
        'the username layer must never touch passwords'
    );
});

test('the username registry mirrors the published security rules', () => {
    const rules = read('firestore.rules');
    assert.match(rules, /match \/usernames\/\{name\}/);
    assert.match(rules, /allow get: if true;/);
    assert.match(rules, /allow list: if false;/);
    assert.match(rules, /allow delete: if false;/);
    assert.match(rules, /function usernameShape\(value\)/);
    assert.match(rules, /\^\[a-z\]\[a-z0-9_\]\*\$/);
    assert.match(rules, /function release\(\)/);
    assert.match(rules, /function claimReleased\(\)/);
    assert.match(rules, /reservedUntil <= request.time/);
    assert.match(rules, /match \/users\/\{uid\} \{/);
    // The existing progress rules must survive this change untouched.
    assert.match(rules, /match \/users\/\{uid\}\/sync\/progress \{/);
    assert.match(rules, /request\.resource\.data\.payload\.size\(\) <= 350000/);
    assert.match(rules, /request\.resource\.data\.revision == resource\.data\.revision \+ 1/);
});

test('the dialog and directory share one availability request per burst', async () => {
    const { dom, window } = await setupDialog();
    try {
        const dialog = window.kanjiAuthDialog;
        let checks = 0;
        window.kanjiUsernames.available = async (value) => {
            checks++;
            return {
                username: value,
                display: value,
                available: true,
                reason: 'free',
                message: 'Available.',
                suggestions: []
            };
        };
        dialog.lastUsernameCheckAt = Date.now();
        await dialog.runUsernameCheck('dante_kanji');
        assert.equal(checks, 0, 'a burst inside the minimum gap waits instead of spending a read');
        await checkUsername(dialog, 'dante_kanji');
        assert.equal(checks, 1);
        const stale = dialog.usernameToken;
        const first = checkUsername(dialog, 'dante_kanji');
        const second = checkUsername(dialog, 'dante_sensei');
        await Promise.all([first, second]);
        assert.equal(dialog.usernameToken, stale + 2);
        assert.equal(dialog.usernameResult.username, 'dante_sensei', 'the newest answer wins');
    } finally {
        dom.window.close();
    }
});
