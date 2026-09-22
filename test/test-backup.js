const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

function setup() {
    const storage = {};
    Object.defineProperties(storage, {
        getItem: { value: (k) => storage[k] ?? null },
        setItem: {
            value: (k, v) => {
                storage[k] = String(v);
            }
        },
        removeItem: {
            value: (k) => {
                delete storage[k];
            }
        }
    });
    const context = vm.createContext({
        window: { addEventListener() {} },
        localStorage: storage,
        Blob,
        fetch,
        URL,
        URLSearchParams,
        crypto: require('node:crypto').webcrypto,
        Date,
        TextEncoder,
        console,
        setTimeout,
        clearTimeout
    });
    vm.runInContext(fs.readFileSync(require.resolve('../backup-manager.js'), 'utf8'), context);
    const Manager = context.window.BackupManager;
    Manager.media = async () => ({});
    Manager.recoveryStore = async () => {};
    return { Manager, storage, context };
}

test('full snapshot includes app state, excludes backups, credentials and unrelated origin storage', async () => {
    const { Manager, storage } = setup();
    storage.kanjiSettings = JSON.stringify({ kanjiFont: 'serif', apiKey: 'SECRET' });
    storage.kanji_ai_settings = JSON.stringify({ provider: 'openai', apiKey: 'SECRET' });
    storage.theme = 'custom';
    storage['customTheme:slot1:settings'] = '{"blur":5}';
    storage.autoBackup_1 = 'recursive';
    storage.kanji_drive_backup = '{"clientId":"public"}';
    storage.unrelated = 'private';
    const data = await Manager.snapshot();
    assert.equal(data.storage.theme, 'custom');
    assert.equal(JSON.parse(data.storage.kanjiSettings).kanjiFont, 'serif');
    assert.equal(JSON.parse(data.storage.kanji_ai_settings).apiKey, '');
    assert.equal(data.storage.autoBackup_1, undefined);
    assert.equal(data.storage.kanji_drive_backup, undefined);
    assert.equal(data.storage.unrelated, undefined);
    assert.equal(JSON.stringify(data).includes('SECRET'), false);
    Manager.validate(data);
});

test('validation rejects unknown versions, keys, invalid progress and non-media payloads', () => {
    const { Manager } = setup();
    const base = { app: 'kanji-widgets', version: 3, storage: {}, media: {} };
    assert.throws(() => Manager.validate({ ...base, version: 99 }));
    assert.throws(() => Manager.validate({ ...base, storage: { unrelated: 'bad' } }));
    assert.throws(() => Manager.validate({ ...base, storage: { kanji_progress: '{}' } }));
    assert.throws(() => Manager.validate({ ...base, storage: { kanjiSettings: 'null' } }));
    assert.throws(() =>
        Manager.validate({ ...base, media: { slot1: 'https://evil.example/payload' } })
    );
    assert.throws(() =>
        Manager.validate({ ...base, media: { slot1: 'data:text/html;base64,AAAA' } })
    );
    Manager.validate({ ...base, media: { slot1: 'data:image/png;base64,AAAA' } });
});

test('restore replaces app state but preserves local secrets and connection settings', async () => {
    const { Manager, storage } = setup();
    storage.theme = 'old';
    storage.lastDarkTheme = 'old';
    storage.kanji_ai_settings = '{"apiKey":"local-secret","provider":"openai"}';
    storage.kanji_drive_backup = '{"frequency":"daily"}';
    await Manager.restore({
        app: 'kanji-widgets',
        version: 3,
        storage: {
            theme: 'new',
            kanji_ai_settings: '{"apiKey":"untrusted-secret","provider":"gemini"}'
        },
        media: {}
    });
    assert.equal(storage.theme, 'new');
    assert.equal(storage.lastDarkTheme, undefined);
    assert.equal(JSON.parse(storage.kanji_ai_settings).apiKey, 'local-secret');
    assert.equal(JSON.parse(storage.kanji_ai_settings).provider, 'gemini');
    assert.equal(storage.kanji_drive_backup, '{"frequency":"daily"}');
});

test('restore rolls local state back when IndexedDB write fails', async () => {
    const { Manager, storage } = setup();
    storage.theme = 'old';
    let writes = 0;
    Manager.media = async (write) => {
        if (write && ++writes === 1) {
            throw new Error('quota');
        }
        return {};
    };
    await assert.rejects(
        () =>
            Manager.restore({
                app: 'kanji-widgets',
                version: 3,
                storage: { theme: 'new' },
                media: {}
            }),
        /quota/
    );
    assert.equal(storage.theme, 'old');
    assert.equal(writes, 2);
});

test('schedule honors local time, frequency, off and overdue catch-up', () => {
    const { Manager } = setup();
    const at = (d, h = 19) => new Date(2026, 8, d, h).getTime();
    assert.equal(Manager.due({ frequency: 'never' }, at(22)), false);
    assert.equal(Manager.due({ frequency: 'daily', time: '19:00' }, at(22, 18)), false);
    assert.equal(Manager.due({ frequency: 'daily', time: '19:00' }, at(22)), true);
    assert.equal(
        Manager.due({ frequency: 'weekly', lastBackup: at(15), time: '19:00' }, at(21)),
        false
    );
    assert.equal(
        Manager.due({ frequency: 'weekly', lastBackup: at(15), time: '19:00' }, at(22)),
        true
    );
    assert.equal(Manager.due({ frequency: 'daily', lastBackup: at(15) }, at(22)), true);
    assert.equal(Manager.due({ frequency: 'monthly', lastBackup: at(15) }, at(22)), false);
});

test('Drive refuses expired access before issuing a request and clears revoked access', async () => {
    const { Manager, context } = setup();
    const manager = new Manager();
    let requests = 0;
    context.fetch = async () => {
        requests++;
        return { status: 401, ok: false };
    };
    await assert.rejects(() => manager.api('/files'), /Connect with Google/);
    assert.equal(requests, 0);
    manager.token = 'memory-only';
    manager.expires = Date.now() + 60000;
    await assert.rejects(() => manager.api('/files'), /expired/);
    assert.equal(manager.token, null);
});

test('Drive upload uses multipart/related and does not record success on failure', async () => {
    const { Manager } = setup();
    const manager = new Manager();
    manager.ensureFolder = async () => 'folder-id';
    manager.list = async () => {};
    manager.status = () => {};
    let uploaded;
    manager.api = async (path, options) => {
        uploaded = { path, options };
        throw new Error('offline');
    };
    await assert.rejects(() => manager.backup(), /offline/);
    assert.equal(manager.config.lastBackup, undefined);
    assert.match(uploaded.options.headers['Content-Type'], /^multipart\/related; boundary=/);
    assert.match(await uploaded.options.body.text(), /folder-id/);
    manager.api = async () => ({ id: 'backup' });
    await manager.backup();
    assert.ok(manager.config.lastBackup);
});

test('Drive history paginates all app-owned files', async () => {
    const { Manager } = setup();
    const manager = new Manager();
    let pages = 0;
    manager.api = async (path) => {
        pages++;
        if (pages === 1) {
            return { files: [{ id: '1' }], nextPageToken: 'next' };
        }
        assert.match(path, /pageToken=next/);
        return { files: [{ id: '2' }] };
    };
    assert.equal((await manager.find('trashed = false')).length, 2);
});

function syncSetup() {
    const env = setup();
    const manager = new env.Manager();
    manager.showComparison = () => {};
    manager.token = 'in-memory';
    manager.expires = Date.now() + 60000;
    manager.user = { emailAddress: 'learner@example.com' };
    manager.list = async () => {};
    manager.status = (text) => {
        manager.message = text;
    };
    env.context.document = { getElementById: () => ({ setAttribute() {} }) };
    return { ...env, manager };
}

test('fingerprints ignore creation times and storage insertion order', async () => {
    const { Manager } = setup();
    const a = { createdAt: 'first', storage: { theme: 'nami', dailyStreak: '2' }, media: {} };
    const b = { createdAt: 'second', storage: { dailyStreak: '2', theme: 'nami' }, media: {} };
    assert.equal(await Manager.fingerprint(a), await Manager.fingerprint(b));
    b.storage.theme = 'candy';
    assert.notEqual(await Manager.fingerprint(a), await Manager.fingerprint(b));
});

test('sync pauses uploads when another device has different cloud data', async () => {
    const { Manager, storage, manager } = syncSetup();
    storage.theme = 'local-theme';
    const local = await Manager.snapshot();
    await manager.remember('old-copy', local);
    manager.files = [{ id: 'other-device-copy', createdTime: new Date().toISOString() }];
    manager.api = async () => ({
        data: { ...local, storage: { theme: 'cloud-theme' } },
        etag: '"v1"'
    });
    manager.backup = async () => assert.fail('must not upload over unseen cloud changes');
    await manager.sync();
    assert.equal(manager.pendingCloud.id, 'other-device-copy');
    assert.equal(storage.theme, 'local-theme');
    assert.match(manager.message, /paused/);
});

test('unchanged sync adopts identical cloud copy without duplicate upload', async () => {
    const { Manager, storage, manager } = syncSetup();
    storage.theme = 'same';
    manager.files = [{ id: 'cloud-copy' }];
    manager.api = async () => ({ data: await Manager.snapshot(), etag: '"v1"' });
    manager.backup = async () => assert.fail('must not duplicate identical data');
    await manager.sync();
    assert.equal(manager.config.syncStates[manager.user.emailAddress].id, 'cloud-copy');
    assert.equal(manager.pendingCloud, null);
});

test('changed local data uploads when the known cloud copy has not changed', async () => {
    const { Manager, storage, manager } = syncSetup();
    storage.theme = 'old';
    const cloud = await Manager.snapshot();
    await manager.remember('known-copy', cloud);
    manager.api = async () => ({ data: cloud, etag: '"v1"' });
    manager.files = [{ id: 'known-copy' }];
    storage.theme = 'new';
    let uploads = 0;
    manager.backup = async () => {
        uploads++;
    };
    await manager.sync();
    assert.equal(uploads, 1);
});

test('sync baselines are separated by Google account and require authorization', async () => {
    const { Manager, manager } = syncSetup();
    await manager.remember('account-one-copy', await Manager.snapshot());
    manager.user = { emailAddress: 'second@example.com' };
    assert.equal(manager.config.syncStates[manager.user.emailAddress], undefined);
    manager.token = null;
    await assert.rejects(() => manager.sync(), /Connect with Google/);
});

async function checkpointSetup() {
    const env = syncSetup();
    env.storage.theme = 'old';
    const cloud = await env.Manager.snapshot();
    await env.manager.remember('checkpoint', cloud);
    env.manager.files = [
        {
            id: 'checkpoint',
            modifiedTime: new Date().toISOString(),
            appProperties: { backupKind: 'checkpoint' }
        }
    ];
    env.manager.api = async () => ({ data: cloud, etag: '"v1"' });
    return { ...env, cloud };
}

test('quick save updates the known checkpoint instead of creating another file', async () => {
    const { manager, storage } = await checkpointSetup();
    storage.theme = 'new';
    let options;
    manager.backup = async (value) => {
        options = value;
    };
    await manager.sync();
    assert.equal(options.target.id, 'checkpoint');
    assert.equal(options.etag, '"v1"');
    assert.equal(options.checkpoint, true);
});

test('scheduled save with unchanged data skips upload too', async () => {
    const { manager } = await checkpointSetup();
    manager.backup = async () => assert.fail('unchanged checkpoint must not upload');
    await manager.sync(true);
    assert.match(manager.message, /no changes/);
});

test('connecting is read-only even with unsaved local changes or no cloud file', async () => {
    const { manager, storage } = await checkpointSetup();
    storage.theme = 'changed';
    manager.backup = async () => assert.fail('connection must not create a backup');
    await manager.sync(false, true);
    assert.match(manager.message, /unsaved changes/);
    manager.files = [];
    await manager.sync(false, true);
    assert.match(manager.message, /No cloud save/);
});

test('same checkpoint ID changed by another device triggers review rather than overwrite', async () => {
    const { manager, cloud } = await checkpointSetup();
    cloud.storage.theme = 'changed-elsewhere';
    manager.backup = async () => assert.fail('must not overwrite a new cloud revision');
    await manager.sync();
    assert.equal(manager.pendingCloud.id, 'checkpoint');
});

test('missing progress or media preserves old checkpoint by creating a separate one', async () => {
    const { manager, cloud, Manager, storage } = await checkpointSetup();
    cloud.media.avatar = 'data:image/gif;base64,R0lGODlh';
    await manager.remember('checkpoint', cloud);
    storage.theme = 'changed';
    let options;
    manager.backup = async (value) => {
        options = value;
    };
    await manager.sync();
    assert.equal(options.target, null);
    const old = {
        storage: {
            kanji_progress: JSON.stringify({ mastered: ['日'], studied: ['日'], skipped: [] })
        },
        media: {}
    };
    const next = {
        storage: { kanji_progress: JSON.stringify({ mastered: [], studied: [], skipped: [] }) },
        media: {}
    };
    assert.equal(Manager.losesData(old, next), true);
});

test('manual backups, invalid cloud files and missing revision tokens are never overwritten', async () => {
    for (const mode of ['manual', 'invalid', 'no-etag']) {
        const { manager, storage, cloud } = await checkpointSetup();
        storage.theme = 'changed';
        if (mode === 'manual') {
            manager.files[0].appProperties.backupKind = 'manual';
        }
        if (mode === 'invalid') {
            manager.api = async () => ({ data: { invalid: true }, etag: '"v1"' });
        }
        if (mode === 'no-etag') {
            manager.api = async () => ({ data: cloud, etag: null });
        }
        let options;
        manager.backup = async (value) => {
            options = value;
        };
        await manager.sync();
        assert.ok(!options.target, mode);
        assert.equal(options.checkpoint, true);
    }
});

test('checkpoint upload uses PATCH with If-Match and does not change folder parents', async () => {
    const { manager, cloud } = await checkpointSetup();
    manager.ensureFolder = async () => 'folder';
    let request;
    manager.api = async (path, options) => {
        request = { path, options };
        return { id: 'checkpoint' };
    };
    await manager.backup({
        data: cloud,
        checkpoint: true,
        target: { id: 'checkpoint' },
        etag: '"v1"'
    });
    assert.match(request.path, /files\/checkpoint\?uploadType/);
    assert.equal(request.options.method, 'PATCH');
    assert.equal(request.options.headers['If-Match'], '"v1"');
    assert.equal((await request.options.body.text()).includes('"parents"'), false);
});

test('Drive revision conflict stops write and explains how to retry', async () => {
    const { manager, context } = syncSetup();
    context.fetch = async () => ({ status: 412, ok: false });
    await assert.rejects(
        () => manager.api('/files/test', { method: 'PATCH' }),
        /Nothing was overwritten/
    );
});

test('recovery failure stops a restore before mutating progress or media', async () => {
    const { Manager, storage } = setup();
    storage.theme = 'original';
    Manager.recoveryStore = async () => {
        throw new Error('QuotaExceeded');
    };
    await assert.rejects(
        () =>
            Manager.restore({
                app: 'kanji-widgets',
                version: 3,
                storage: { theme: 'replacement' },
                media: {}
            }),
        /Restore stopped/
    );
    assert.equal(storage.theme, 'original');
});

test('recovery captures old state, restores it on undo, and keeps its account owner', async () => {
    const { Manager, storage } = setup();
    storage.theme = 'original';
    storage.kanji_drive_backup = JSON.stringify({ dataOwner: 'original@example.com' });
    let recovery;
    Manager.recoveryStore = async (action, value) => {
        if (action === 'put') {
            recovery = value;
        }
        return recovery;
    };
    await Manager.restore({
        app: 'kanji-widgets',
        version: 3,
        storage: { theme: 'replacement' },
        media: {}
    });
    assert.equal(storage.theme, 'replacement');
    assert.equal(recovery.storage.theme, 'original');
    assert.equal(await Manager.undoRestore(), 'original@example.com');
    assert.equal(storage.theme, 'original');
    assert.equal(recovery.storage.theme, 'original');
});

test('unchanged cloud checks do not falsify last successful upload time', async () => {
    const { manager } = await checkpointSetup();
    manager.config.lastBackup = 123456;
    await manager.sync();
    assert.equal(manager.config.lastBackup, 123456);
    assert.ok(manager.config.lastChecked > 123456);
});

test('account switch blocks both automatic and direct uploads until an explicit choice', async () => {
    const { manager } = await checkpointSetup();
    manager.config.dataOwner = 'other@example.com';
    manager.files = [];
    manager.ensureFolder = async () => assert.fail('must not upload to a different account');
    await assert.rejects(() => manager.backup(), /Account changed/);
    await manager.sync();
    assert.match(manager.message, /uploads are blocked/);
});

test('manual and legacy backups default to pinned, but explicit unpin enables cleanup', () => {
    const { Manager } = setup();
    assert.equal(Manager.isPinned({}), true);
    assert.equal(Manager.isPinned({ appProperties: { backupKind: 'manual' } }), true);
    assert.equal(Manager.isPinned({ appProperties: { backupKind: 'checkpoint' } }), false);
    assert.equal(
        Manager.isPinned({ appProperties: { backupKind: 'checkpoint', pinned: 'true' } }),
        true
    );
    assert.equal(
        Manager.isPinned({ appProperties: { backupKind: 'manual', pinned: 'false' } }),
        false
    );
});

test('retention excludes pinned backups, including legacy snapshots', async () => {
    const { manager, cloud } = await checkpointSetup();
    manager.config.keep = '5';
    manager.ensureFolder = async () => 'folder';
    manager.files = [
        { id: 'manual', appProperties: { backupKind: 'manual' } },
        { id: 'legacy' },
        ...Array.from({ length: 7 }, (_, i) => ({
            id: `checkpoint${i}`,
            appProperties: { backupKind: 'checkpoint' }
        }))
    ];
    const trashed = [];
    manager.api = async (path, options) => {
        if (options.body === '{"trashed":true}') {
            trashed.push(path);
        }
        return { id: 'new' };
    };
    await manager.backup({ data: cloud });
    assert.deepEqual(trashed, ['/files/checkpoint5', '/files/checkpoint6']);
});

test('a pinned checkpoint is never overwritten by quick save', async () => {
    const { manager, storage } = await checkpointSetup();
    manager.files[0].appProperties.pinned = 'true';
    storage.theme = 'changed';
    manager.backup = async (options) => {
        assert.equal(options.target, null);
    };
    await manager.sync();
});

test('known failed Drive safety diagnostic disables in-place updates for that account', async () => {
    const { manager, storage } = await checkpointSetup();
    manager.config.diagnosticAccount = manager.user.emailAddress;
    manager.config.checkpointVerified = false;
    storage.theme = 'changed';
    manager.backup = async (options) => {
        assert.equal(options.target, null);
    };
    await manager.sync();
});

test('connection error guidance distinguishes full storage, quota limits and permission denial', () => {
    const { Manager } = setup();
    assert.match(Manager.driveError(403, 'storageQuotaExceeded'), /Drive is full/);
    assert.match(Manager.driveError(429, ''), /rate-limiting/);
    assert.match(Manager.driveError(403, ''), /test-user/);
    assert.match(Manager.driveError(503, ''), /temporarily unavailable/);
});
