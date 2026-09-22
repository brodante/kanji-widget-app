const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');

const config = {
    apiKey: 'public-key',
    authDomain: 'test.firebaseapp.com',
    projectId: 'test',
    appId: 'app'
};
const user = {
    uid: 'learner-id',
    email: 'learner@example.com',
    displayName: 'Learner',
    photoURL: 'https://example.com/photo.png'
};

async function setup(options = {}) {
    const dom = new JSDOM(fs.readFileSync(require.resolve('../index.html'), 'utf8'), {
        url: 'https://kanji.qd.je',
        runScripts: 'outside-only'
    });
    const { window } = dom;
    await new Promise((resolve) => window.addEventListener('load', resolve, { once: true }));
    window.eval(fs.readFileSync(require.resolve('../app-auth.js'), 'utf8'));
    let notify;
    const calls = [];
    const sdk = {
        getApps: () => [],
        initializeApp: (value, name) => {
            calls.push(['initialize', value, name]);
            return {};
        },
        getAuth: () => ({}),
        browserLocalPersistence: 'LOCAL',
        setPersistence: async (_auth, value) => {
            calls.push(['persistence', value]);
            if (options.persistenceError) {
                throw options.persistenceError;
            }
        },
        onAuthStateChanged: (_auth, callback) => {
            notify = callback;
            queueMicrotask(() => callback(options.user || null));
            return () => calls.push(['unsubscribe']);
        },
        GoogleAuthProvider: class {
            setCustomParameters(value) {
                calls.push(['provider', value]);
            }
        },
        signInWithPopup: async () => {
            calls.push(['popup']);
            if (options.popupError) {
                throw options.popupError;
            }
            notify(user);
        },
        signOut: async () => {
            calls.push(['signOut']);
            if (options.signOutError) {
                throw options.signOutError;
            }
            notify(null);
        }
    };
    let loads = 0;
    const auth = new window.AppAuth(options.config ?? config, async () => {
        loads++;
        if (options.loadError) {
            throw new Error('unavailable');
        }
        return sdk;
    });
    window.kanjiAuth = auth;
    await auth.init();
    return { dom, window, auth, calls, notify: (value) => notify(value), loads: () => loads };
}

test('unconfigured static site does not fetch Firebase or block local learning', async () => {
    const { dom, window, auth, loads } = await setup({ config: {} });
    try {
        assert.equal(loads(), 0);
        assert.equal(auth.ready, false);
        assert.equal(window.document.querySelector('[data-app-sign-in]').disabled, true);
        assert.match(
            window.document.querySelector('[data-app-auth-status]').textContent,
            /not set up/
        );
    } finally {
        dom.window.close();
    }
});

test('restores SDK identity after selecting LOCAL persistence; no popup or progress writes', async () => {
    const { dom, window, auth, calls } = await setup({ user });
    try {
        assert.equal(auth.user, user);
        assert.equal(auth.ready, true);
        assert.equal(calls[1][1], 'LOCAL');
        assert.equal(
            calls.some(([name]) => name === 'popup'),
            false
        );
        assert.equal(window.localStorage.length, 0);
        for (const button of window.document.querySelectorAll('[data-app-sign-out]')) {
            assert.equal(button.hidden, false);
        }
        assert.match(
            window.document.querySelector('[data-app-auth-status]').textContent,
            /See Cloud progress/
        );
    } finally {
        dom.window.close();
    }
});

test('popup login and cross-tab auth updates repaint both surfaces without Drive calls', async () => {
    const { dom, window, auth, calls, notify } = await setup();
    try {
        window.driveBackup = {
            renderAccount() {},
            connect() {
                assert.fail('Drive must remain separate');
            }
        };
        await auth.signIn();
        assert.equal(auth.user, user);
        assert.ok(calls.some(([name]) => name === 'popup'));
        assert.equal(window.localStorage.length, 0);
        notify(null);
        assert.equal(auth.user, null);
        assert.equal(window.document.querySelector('[data-app-sign-in]').hidden, false);
    } finally {
        dom.window.close();
    }
});

test('app logout preserves local progress and separate Drive session', async () => {
    const { dom, window, auth } = await setup({ user });
    try {
        window.localStorage.setItem('kanji_progress', '{"studied":["日"]}');
        window.driveBackup = { token: 'drive-only', renderAccount() {} };
        assert.equal(await auth.signOut(), true);
        assert.equal(auth.user, null);
        assert.equal(window.driveBackup.token, 'drive-only');
        assert.equal(window.localStorage.getItem('kanji_progress'), '{"studied":["日"]}');
        assert.match(auth.message, /Drive has its own Disconnect/);
    } finally {
        dom.window.close();
    }
});

test('persistence failure fails closed instead of claiming a persistent login', async () => {
    const { dom, auth, calls } = await setup({
        persistenceError: { code: 'auth/web-storage-unsupported' }
    });
    try {
        assert.equal(auth.ready, false);
        await auth.signIn();
        assert.equal(
            calls.some(([name]) => name === 'popup'),
            false
        );
        assert.match(auth.message, /browser storage/);
    } finally {
        dom.window.close();
    }
});

for (const code of [
    'auth/popup-blocked',
    'auth/popup-closed-by-user',
    'auth/unauthorized-domain',
    'auth/network-request-failed'
]) {
    test(`handles ${code} and re-enables sign-in`, async () => {
        const { dom, window, auth } = await setup({ popupError: { code } });
        try {
            await auth.signIn();
            assert.equal(auth.user, null);
            assert.equal(auth.busy, false);
            assert.equal(window.document.querySelector('[data-app-sign-in]').disabled, false);
            assert.ok(auth.message.length > 20);
        } finally {
            dom.window.close();
        }
    });
}

test('SDK network failure offers a retry without an unhandled rejection', async () => {
    const { dom, window, auth } = await setup({ loadError: true });
    try {
        assert.equal(auth.ready, false);
        assert.equal(window.document.querySelector('[data-app-auth-retry]').hidden, false);
    } finally {
        dom.window.close();
    }
});

test('failed logout leaves the identity visible', async () => {
    const { dom, auth } = await setup({
        user,
        signOutError: { code: 'auth/network-request-failed' }
    });
    try {
        assert.equal(await auth.signOut(), false);
        assert.equal(auth.user, user);
    } finally {
        dom.window.close();
    }
});

test('Firebase session keys cannot enter backups; deploy and cache include auth assets', async () => {
    const { dom, window } = await setup();
    try {
        window.eval(fs.readFileSync(require.resolve('../backup-manager.js'), 'utf8'));
        assert.equal(
            window.BackupManager.allowed('firebase:authUser:public-key:kanji-auth'),
            false
        );
        const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');
        const worker = fs.readFileSync(require.resolve('../sw.js'), 'utf8');
        const deploy = fs.readFileSync(require.resolve('../.github/workflows/deploy.yml'), 'utf8');
        for (const asset of ['app-auth.js', 'firebase-config.js']) {
            assert.ok(html.includes(`${asset}?v=feedback-v1`));
            assert.ok(worker.includes(`${asset}?v=feedback-v1`));
            assert.ok(deploy.includes(`cp ${asset} deploy/`));
        }
    } finally {
        dom.window.close();
    }
});
