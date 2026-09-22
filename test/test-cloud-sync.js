const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');

async function setup() {
    const dom = new JSDOM(fs.readFileSync(require.resolve('../index.html'), 'utf8'), {
        url: 'https://kanji.qd.je',
        runScripts: 'outside-only'
    });
    const { window } = dom;
    await new Promise((resolve) => window.addEventListener('load', resolve, { once: true }));
    window.TextEncoder = TextEncoder;
    window.eval(fs.readFileSync(require.resolve('../ui-feedback.js'), 'utf8'));
    window.eval(fs.readFileSync(require.resolve('../backup-manager.js'), 'utf8'));
    window.eval(fs.readFileSync(require.resolve('../cloud-sync.js'), 'utf8'));
    window.confirm = () => true;
    window.kanjiAuth = { user: { uid: 'alice', email: 'alice@example.com' } };
    const cloud = new window.CloudSync();
    const db = new Map();
    const calls = { reads: 0, writes: 0, recovery: 0 };
    const snapshot = (key) => ({ exists: () => db.has(key), data: () => db.get(key) });
    cloud.connect = async () => cloud.uid;
    cloud.sdk = {
        getDocFromServer: async (key) => {
            calls.reads++;
            return snapshot(key);
        },
        runTransaction: async (_db, callback) =>
            callback({
                get: async (key) => snapshot(key),
                set: (key, value) => {
                    calls.writes++;
                    db.set(key, value);
                }
            }),
        serverTimestamp: () => 'server-time'
    };
    window.BackupManager.createRecovery = async () => {
        calls.recovery++;
    };
    window.localStorage.setItem(
        'kanji_progress',
        JSON.stringify({ studied: ['日'], mastered: [], skipped: [] })
    );
    await cloud.accountChanged();
    return { dom, window, cloud, db, calls };
}

function record(window, revision = 1) {
    return { version: 1, revision, payload: window.CloudSync.payload(), updatedAt: 'server-time' };
}

test('first login only reads; explicit consent is required before associating local progress', async () => {
    const { dom, window, cloud, calls } = await setup();
    try {
        assert.equal(cloud.remote, null);
        assert.equal(cloud.enabled, false);
        await cloud.save();
        assert.equal(calls.writes, 0);
        window.confirm = () => false;
        await cloud.save(true);
        assert.equal(calls.writes, 0);
        window.confirm = () => true;
        await cloud.save(true);
        assert.equal(calls.writes, 1);
        assert.equal(calls.recovery, 1);
        assert.equal(cloud.enabled, true);
        assert.equal(cloud.metadata().uid, 'alice');
    } finally {
        dom.window.close();
    }
});

test('unchanged data causes no transactions; changes create a revision-checked save', async () => {
    const { dom, window, cloud, calls, db } = await setup();
    try {
        await cloud.save(true);
        await cloud.save();
        assert.equal(calls.writes, 1);
        window.localStorage.setItem('kanji_profile', '{"nickname":"Learner"}');
        await cloud.save();
        assert.equal(calls.writes, 2);
        assert.equal(db.get('alice').revision, 2);
    } finally {
        dom.window.close();
    }
});

test('newer cloud revision blocks stale-device writes without changing either copy', async () => {
    const { dom, window, cloud, calls, db } = await setup();
    try {
        await cloud.save(true);
        db.set('alice', record(window, 2));
        window.localStorage.setItem('kanji_profile', '{"nickname":"Local"}');
        await cloud.save();
        assert.equal(calls.writes, 1);
        assert.equal(cloud.enabled, false);
        assert.match(cloud.message, /Another device/);
        assert.equal(window.localStorage.getItem('kanji_profile'), '{"nickname":"Local"}');
        await cloud.check();
        assert.equal(cloud.remote.revision, 2);
        assert.equal(cloud.enabled, false);
    } finally {
        dom.window.close();
    }
});

test('reloaded owner can resume but a second account cannot inherit autosave consent', async () => {
    const { dom, window, cloud, calls } = await setup();
    try {
        await cloud.save(true);
        cloud.enabled = false;
        await cloud.check();
        assert.equal(cloud.enabled, true);
        window.kanjiAuth.user = { uid: 'bob' };
        await cloud.accountChanged();
        assert.equal(cloud.enabled, false);
        assert.match(cloud.message, /Different account/);
        await cloud.save();
        assert.equal(calls.writes, 1);
        window.kanjiAuth.user = null;
        await cloud.accountChanged();
        assert.equal(cloud.uid, null);
        assert.equal(cloud.remote, undefined);
        assert.ok(window.localStorage.getItem('kanji_progress'));
    } finally {
        dom.window.close();
    }
});

test('account change during an in-flight write prevents committing another account’s data', async () => {
    const { dom, window, cloud, calls } = await setup();
    try {
        cloud.sdk.runTransaction = async (_db, callback) => {
            await callback({
                get: async () => {
                    window.kanjiAuth.user = null;
                    await cloud.accountChanged();
                    return { exists: () => false };
                },
                set: () => {
                    calls.writes++;
                }
            });
        };
        await cloud.save(true);
        assert.equal(calls.writes, 0);
        assert.equal(cloud.metadata(), null);
    } finally {
        dom.window.close();
    }
});

test('recovery failure and missing rules fail closed; local progress remains intact', async () => {
    const { dom, window, cloud, calls } = await setup();
    try {
        window.BackupManager.createRecovery = async () => {
            throw new Error('Storage full');
        };
        await cloud.save(true);
        assert.equal(calls.writes, 0);
        assert.match(cloud.message, /Storage full/);
        cloud.sdk.getDocFromServer = async () => {
            throw { code: 'permission-denied' };
        };
        await cloud.check();
        assert.match(cloud.message, /publish the Firestore security rules/);
        assert.ok(window.localStorage.getItem('kanji_progress'));
    } finally {
        dom.window.close();
    }
});

test('pause and imported-data invalidation stop automatic writes', async () => {
    const { dom, window, cloud, calls } = await setup();
    try {
        await cloud.save(true);
        window.localStorage.removeItem(window.CloudSync.KEY);
        await cloud.save();
        assert.equal(cloud.enabled, false);
        assert.equal(calls.writes, 1);
        await cloud.check();
        assert.equal(cloud.enabled, false);
        cloud.pause();
        await cloud.check();
        assert.equal(cloud.enabled, false);
    } finally {
        dom.window.close();
    }
});

test('payload excludes credentials, AI data and media; rejects unknown, malformed and oversized data', async () => {
    const { dom, window } = await setup();
    try {
        window.localStorage.setItem(
            'kanjiSettings',
            '{"apiKey":"private-key","nested":{"token":"secret"},"sound":true}'
        );
        window.localStorage.setItem('kanji_ai_settings', '{"apiKey":"ai-secret"}');
        window.localStorage.setItem('firebase:authUser:test', 'firebase-secret');
        window.localStorage.setItem('kanji_drive_backup', '{"token":"drive-secret"}');
        const payload = window.CloudSync.payload();
        for (const secret of [
            'private-key',
            'secret',
            'firebase-secret',
            'drive-secret',
            'ai-secret'
        ]) {
            assert.equal(payload.includes(secret), false);
        }
        assert.throws(() => window.CloudSync.validatePayload('{}'));
        assert.throws(() => window.CloudSync.validatePayload('x'.repeat(350001)));
        const parsed = JSON.parse(payload);
        parsed.kanji_srs_data = '[]';
        assert.throws(() => window.CloudSync.validatePayload(JSON.stringify(parsed)));
        parsed.kanji_srs_data = '{}';
        parsed.unknown = 'x';
        assert.throws(() => window.CloudSync.validatePayload(JSON.stringify(parsed)));
    } finally {
        dom.window.close();
    }
});

test('offline saves and quota errors do not pretend to succeed or write', async () => {
    const { dom, window, cloud, calls } = await setup();
    try {
        Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
        await cloud.save(true);
        assert.match(cloud.message, /Offline/);
        assert.equal(calls.writes, 0);
        Object.defineProperty(window.navigator, 'onLine', { value: true });
        cloud.sdk.getDocFromServer = async () => {
            throw { code: 'resource-exhausted' };
        };
        await cloud.check();
        assert.match(cloud.message, /quota/);
    } finally {
        dom.window.close();
    }
});

test('cloud import overlays only approved fields and preserves media, AI data and credential containers', async () => {
    const { dom, window } = await setup();
    try {
        const payload = window.CloudSync.payload();
        window.BackupManager.snapshot = async () => ({
            app: 'kanji-widgets',
            version: 3,
            storage: {
                kanji_ai_settings: '{"apiKey":"local"}',
                kanjiSettings: '{"apiKey":"local"}'
            },
            media: { slot1: 'data:image/png;base64,AA==' }
        });
        const result = await window.BackupManager.normalizeImport({
            app: 'kanji-cloud-progress',
            version: 1,
            payload
        });
        assert.equal(result.media.slot1, 'data:image/png;base64,AA==');
        assert.equal(result.storage.kanji_ai_settings, '{"apiKey":"local"}');
        assert.equal(result.storage.kanjiSettings, '{}'); // restore retains this device's credential fields
        assert.ok(result.storage.kanji_progress);
        await assert.rejects(() =>
            window.BackupManager.normalizeImport({
                app: 'kanji-cloud-progress',
                version: 2,
                payload
            })
        );
    } finally {
        dom.window.close();
    }
});

test('cloud restore rechecks revisions and does not apply an outdated selection', async () => {
    const { dom, window, cloud, db } = await setup();
    try {
        db.set('alice', record(window));
        await cloud.check();
        db.set('alice', record(window, 2));
        window.BackupManager.restore = async () => assert.fail('must not restore stale data');
        await cloud.restore();
        assert.match(cloud.message, /Cloud progress changed/);
    } finally {
        dom.window.close();
    }
});

test('Drive is confined to advanced Settings while cloud controls appear in account, profile and settings', async () => {
    const { dom, window } = await setup();
    try {
        const doc = window.document;
        assert.equal(doc.getElementById('accountConnect').closest('details').id, 'driveBackup');
        assert.equal(doc.getElementById('driveBackup').open, false);
        for (const id of ['accountPanel', 'profilePage', 'cloudSettings']) {
            assert.ok(doc.getElementById(id).querySelector('[data-cloud-action=save]'));
        }
        assert.equal(doc.querySelectorAll('#accountConnect').length, 1);
        for (const file of ['../index.html', '../sw.js']) {
            assert.ok(
                fs
                    .readFileSync(require.resolve(file), 'utf8')
                    .includes('cloud-sync.js?v=practice-merge-v1')
            );
        }
    } finally {
        dom.window.close();
    }
});

test('accepted cloud restore preserves media and unrelated local sections and records its revision', async () => {
    const { dom, window, cloud, db } = await setup();
    try {
        db.set('alice', record(window));
        await cloud.check();
        const media = { slot1: 'data:image/png;base64,AA==' };
        window.BackupManager.snapshot = async () => ({
            app: 'kanji-widgets',
            version: 3,
            storage: { kanji_ai_settings: '{"apiKey":"local"}' },
            media
        });
        let restored,
            options,
            reloaded = false;
        window.BackupManager.restore = async (data, value) => {
            restored = data;
            options = value;
        };
        cloud.reload = () => {
            reloaded = true;
        };
        await cloud.restore();
        assert.equal(restored.media, media);
        assert.equal(restored.storage.kanji_ai_settings, '{"apiKey":"local"}');
        assert.equal(restored.storage.kanjiSettings, '{}');
        assert.ok(restored.storage.kanji_progress);
        assert.equal(options.cloudSync, true);
        assert.equal(options.recovery, undefined); // default mandatory recovery is not bypassed
        assert.equal(cloud.metadata().revision, 1);
        assert.equal(reloaded, true);
        assert.equal(window.document.body.inert, false);
    } finally {
        dom.window.close();
    }
});

test('failed restore does not enable autosave or reload', async () => {
    const { dom, window, cloud, db } = await setup();
    try {
        db.set('alice', record(window));
        await cloud.check();
        window.BackupManager.snapshot = async () => ({
            app: 'kanji-widgets',
            version: 3,
            storage: {},
            media: {}
        });
        window.BackupManager.restore = async () => {
            throw new Error('Recovery storage full');
        };
        cloud.reload = () => assert.fail('must not reload after failure');
        await cloud.restore();
        assert.equal(cloud.metadata(), null);
        assert.equal(cloud.enabled, false);
        assert.match(cloud.message, /Recovery storage full/);
        assert.equal(window.document.body.inert, false);
    } finally {
        dom.window.close();
    }
});

test('manual unchanged saves do not create needless cloud revisions', async () => {
    const { dom, cloud, calls } = await setup();
    try {
        await cloud.save(true);
        await cloud.save(true);
        assert.equal(calls.writes, 1);
        assert.equal(cloud.metadata().revision, 1);
    } finally {
        dom.window.close();
    }
});

test('manual cloud check shows pending feedback, a timestamped result and never writes', async () => {
    const { dom, window, cloud, calls } = await setup();
    try {
        let finish;
        cloud.sdk.getDocFromServer = () =>
            new Promise((resolve) => {
                finish = resolve;
            });
        const pending = cloud.check(true);
        await new Promise((resolve) => setImmediate(resolve));
        assert.match(cloud.message, /Checking cloud/);
        assert.equal(window.document.querySelector('[data-cloud-action=check]').disabled, true);
        assert.equal(
            window.document.querySelector('[data-cloud-status]').getAttribute('aria-busy'),
            'true'
        );
        finish({ exists: () => false });
        await pending;
        assert.match(cloud.message, /No cloud save yet/);
        assert.match(cloud.message, /Checked at/);
        assert.equal(calls.writes, 0);
        const notice = window.document.querySelector('.attention-notice');
        assert.match(notice.textContent, /Cloud check complete/);
        assert.equal(notice.getAttribute('role'), 'status');
        assert.equal(
            window.document.querySelector('[data-cloud-action=check]').textContent,
            'Check cloud'
        );
    } finally {
        dom.window.close();
    }
});

test('cloud check distinguishes matching data from unsaved device changes', async () => {
    const { dom, window, cloud, calls } = await setup();
    try {
        await cloud.save(true);
        await cloud.check(true);
        assert.match(cloud.message, /Up to date/);
        window.localStorage.setItem('kanji_profile', '{"nickname":"Not saved yet"}');
        await cloud.check(true);
        assert.match(cloud.message, /changes waiting to save/);
        assert.equal(calls.writes, 1);
    } finally {
        dom.window.close();
    }
});

test('manual failed check raises an alert while automatic checks do not spawn notices', async () => {
    const { dom, window, cloud } = await setup();
    try {
        cloud.sdk.getDocFromServer = async () => {
            throw { code: 'permission-denied' };
        };
        await cloud.check();
        assert.equal(window.document.querySelector('.attention-notice'), null);
        await cloud.check(true);
        const alert = window.document.querySelector('.attention-notice');
        assert.equal(alert.getAttribute('role'), 'alert');
        assert.match(alert.textContent, /security rules/);
        alert.querySelector('button').click();
        assert.equal(window.document.querySelector('.attention-notice'), null);
    } finally {
        dom.window.close();
    }
});
