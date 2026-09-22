const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const { indexedDB } = require('fake-indexeddb');

async function setupUI() {
    const dom = new JSDOM(fs.readFileSync(require.resolve('../index.html'), 'utf8'), {
        url: 'https://kanji.qd.je',
        runScripts: 'outside-only'
    });
    const { window } = dom;
    await new Promise((resolve) => window.addEventListener('load', resolve, { once: true }));
    window.eval(fs.readFileSync(require.resolve('../backup-config.js'), 'utf8'));
    window.eval(fs.readFileSync(require.resolve('../backup-manager.js'), 'utf8'));
    let oauth;
    let revoked = false;
    window.google = {
        accounts: {
            oauth2: {
                initTokenClient: (options) => {
                    oauth = options;
                    return { requestAccessToken() {} };
                },
                hasGrantedAllScopes: () => true,
                revoke: () => {
                    revoked = true;
                }
            }
        }
    };
    window.driveBackup = new window.BackupManager();
    window.driveBackup.init();
    return { dom, window, manager: window.driveBackup, oauth: () => oauth, revoked: () => revoked };
}

test('header guest menu opens, exposes Google action and closes accessibly', async () => {
    const { dom, window } = await setupUI();
    try {
        const doc = window.document;
        assert.equal(doc.getElementById('accountHeading').textContent, 'Guest user');
        doc.getElementById('accountBtn').click();
        assert.equal(doc.getElementById('accountPanel').hidden, false);
        assert.equal(doc.getElementById('accountBtn').getAttribute('aria-expanded'), 'true');
        assert.equal(doc.activeElement.id, 'accountClose');
        assert.match(doc.getElementById('accountConnect').textContent, /Connect with Google/);
        assert.equal(doc.getElementById('avatarReset'), null);
        assert.match(doc.getElementById('accountSync').textContent, /Quick save/);
        doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
        assert.equal(doc.getElementById('accountPanel').hidden, true);
        assert.equal(doc.activeElement.id, 'accountBtn');
        doc.getElementById('accountBtn').click();
        doc.body.click();
        assert.equal(doc.getElementById('accountPanel').hidden, true);
    } finally {
        dom.window.close();
    }
});

test('mocked Google authorization updates account identity and disconnect returns to guest', async () => {
    const { dom, window, manager, oauth, revoked } = await setupUI();
    try {
        manager.api = async () => ({
            user: { emailAddress: 'learner@example.com', displayName: 'Learner' }
        });
        manager.sync = async (_scheduled, checkOnly) => {
            assert.equal(checkOnly, true);
        };
        window.document.getElementById('accountConnect').click();
        assert.match(oauth().client_id, /98852004824/);
        oauth().callback({ access_token: 'mock-token', expires_in: 3600 });
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(window.document.getElementById('accountHeading').textContent, 'Learner');
        assert.equal(
            window.document.getElementById('accountIdentity').textContent,
            'learner@example.com'
        );
        assert.equal(window.document.getElementById('accountDisconnect').hidden, false);
        assert.equal(window.localStorage.getItem('access_token'), null);
        window.document.getElementById('accountDisconnect').click();
        assert.equal(revoked(), true);
        assert.equal(manager.token, null);
        assert.equal(window.document.getElementById('accountHeading').textContent, 'Guest user');
    } finally {
        dom.window.close();
    }
});

test('consent denial and popup failure remain guest and show feedback in account panel', async () => {
    const { dom, window, oauth } = await setupUI();
    try {
        window.document.getElementById('accountConnect').click();
        oauth().callback({ error: 'access_denied' });
        assert.match(window.document.getElementById('accountStatus').textContent, /not granted/);
        assert.equal(window.document.getElementById('accountHeading').textContent, 'Guest user');
        window.document.getElementById('accountConnect').click();
        oauth().error_callback();
        assert.match(window.document.getElementById('accountStatus').textContent, /blocked/);
    } finally {
        dom.window.close();
    }
});

test('cloud review and backup settings are reachable from account panel', async () => {
    const { dom, window, manager } = await setupUI();
    try {
        manager.pendingCloud = { id: 'cloud' };
        manager.renderAccount();
        assert.equal(window.document.getElementById('syncConflict').hidden, false);
        let opened = false;
        let scrolled = false;
        window.document.getElementById('settingsBtn').onclick = () => {
            opened = true;
        };
        window.document.getElementById('driveBackup').scrollIntoView = () => {
            scrolled = true;
        };
        window.document.getElementById('accountSettings').click();
        assert.ok(opened && scrolled);
    } finally {
        dom.window.close();
    }
});

test('theme media transaction reads and replaces the three slots', async () => {
    const { dom, window } = await setupUI();
    try {
        window.openCustomThemeDB = () =>
            new Promise((resolve, reject) => {
                const request = indexedDB.open('account-ui-test-themes', 1);
                request.onupgradeneeded = () => request.result.createObjectStore('images');
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        const blob = new Blob(['theme-image-bytes'], { type: 'image/png' });
        await window.BackupManager.media({ slot1: blob });
        const saved = await window.BackupManager.media();
        assert.equal(await saved.slot1.text(), 'theme-image-bytes');
        await window.BackupManager.media({});
        assert.equal(Object.keys(await window.BackupManager.media()).length, 0);
    } finally {
        dom.window.close();
    }
});

test('avatar uses Google photo by default, custom photo takes priority, failure shows neutral icon', async () => {
    const { dom, window, manager } = await setupUI();
    try {
        manager.token = 'test';
        manager.expires = Date.now() + 60000;
        manager.user = {
            emailAddress: 'learner@example.com',
            photoLink: 'https://lh3.googleusercontent.com/photo'
        };
        manager.renderAccount();
        const image = window.document.getElementById('accountAvatar');
        assert.equal(image.src, manager.user.photoLink);
        image.onload();
        assert.equal(image.hidden, false);
        assert.equal(image.nextElementSibling.hidden, true);
        manager.avatarURL = 'blob:custom-photo';
        manager.renderAvatar();
        assert.equal(image.src, 'blob:custom-photo');
        image.onerror();
        assert.equal(image.hidden, true);
        assert.equal(image.nextElementSibling.hidden, false);
        manager.avatarURL = '';
        manager.token = null;
        manager.renderAccount();
        assert.equal(image.hasAttribute('src'), false);
    } finally {
        dom.window.close();
    }
});

test('avatar rejects non-images, empty files and images at or above 2 MiB', async () => {
    const { dom, window } = await setupUI();
    try {
        const validate = window.BackupManager.validateAvatar;
        assert.throws(() => validate({ type: 'text/html', size: 30 }), /image/);
        assert.throws(() => validate({ type: 'image/png', size: 0 }), /smaller/);
        assert.throws(() => validate({ type: 'image/gif', size: 2 * 1024 * 1024 }), /smaller/);
        validate({ type: 'image/gif', size: 2 * 1024 * 1024 - 1 });
        validate({ type: 'image/svg+xml', size: 100 });
    } finally {
        dom.window.close();
    }
});

test('avatar saves original GIF bytes without modifying themes; reset clears custom photo', async () => {
    const { dom, window, manager } = await setupUI();
    try {
        const writes = [];
        window.BackupManager.media = async (data, slots) => {
            writes.push({ data, slots });
            return {};
        };
        window.URL.createObjectURL = () => 'blob:gif';
        const revoked = [];
        window.URL.revokeObjectURL = (url) => revoked.push(url);
        window.Image = class {
            set src(_value) {
                this.onload();
            }
        };
        const gif = new window.File(['GIF89a-original-frames'], 'photo.gif', { type: 'image/gif' });
        await manager.setAvatar(gif);
        assert.equal(writes[0].data.avatar, gif);
        assert.equal(writes[0].slots.join(','), 'avatar');
        assert.equal(manager.avatarURL, 'blob:gif');
        await manager.setAvatar(null);
        assert.equal(Object.keys(writes[1].data).length, 0);
        assert.equal(manager.avatarURL, '');
        assert.deepEqual(revoked, ['blob:gif']);
    } finally {
        dom.window.close();
    }
});

test('backup format accepts image avatars but rejects video avatars and oversize data', async () => {
    const { dom, window } = await setupUI();
    try {
        const data = {
            app: 'kanji-widgets',
            version: 3,
            storage: {},
            media: { avatar: 'data:image/gif;base64,R0lGODlh' }
        };
        window.BackupManager.validate(data);
        data.media.avatar = 'data:video/mp4;base64,AAAA';
        assert.throws(() => window.BackupManager.validate(data), /Profile photo/);
        data.media.avatar = `data:image/png;base64,${'A'.repeat(2796204)}`;
        assert.throws(() => window.BackupManager.validate(data), /under 2 MB/);
    } finally {
        dom.window.close();
    }
});

test('conflict comparison renders summaries safely and exposes restorable downloads', async () => {
    const { dom, window, manager } = await setupUI();
    try {
        const local = {
            storage: {
                theme: '<script>unsafe</script>',
                kanji_progress: '{"mastered":["日"],"studied":["日","月"]}'
            },
            media: {}
        };
        const cloud = { storage: { theme: 'nami' }, media: { avatar: 'image' } };
        manager.showComparison(local, cloud, { modifiedTime: new Date().toISOString() });
        const panel = window.document.getElementById('saveComparison');
        assert.match(panel.textContent, /Studied: 2/);
        assert.match(panel.textContent, /Mastered: 1/);
        assert.match(panel.textContent, /Cloud/);
        assert.equal(panel.querySelector('script'), null);
        assert.ok(window.document.getElementById('downloadCloudConflict'));
    } finally {
        dom.window.close();
    }
});

test('recovery IndexedDB persists and deletes isolated snapshots', async () => {
    const { dom, window } = await setupUI();
    try {
        window.indexedDB = indexedDB;
        await window.BackupManager.recoveryStore('put', { version: 3, note: 'before restore' });
        assert.equal((await window.BackupManager.recoveryStore('get')).note, 'before restore');
        await window.BackupManager.recoveryStore('delete');
        assert.equal(await window.BackupManager.recoveryStore('get'), undefined);
    } finally {
        dom.window.close();
    }
});

test('save health distinguishes guest, reconnect, pending changes and real upload timestamp', async () => {
    const { dom, window, manager } = await setupUI();
    try {
        const health = window.document.getElementById('saveHealth');
        manager.renderSaveStatus();
        assert.match(health.textContent, /Guest/);
        manager.config.dataOwner = 'learner@example.com';
        manager.renderSaveStatus();
        assert.match(health.textContent, /Reconnect required/);
        manager.token = 'test';
        manager.expires = Date.now() + 60000;
        manager.user = { emailAddress: 'learner@example.com' };
        manager.localDirty = true;
        manager.renderSaveStatus();
        assert.match(health.textContent, /Unsaved cloud changes/);
        assert.match(health.textContent, /None from this device/);
    } finally {
        dom.window.close();
    }
});

test('Drive safety diagnostic verifies readback, stale revision rejection and cleanup using mock service', async () => {
    const { dom, window, manager } = await setupUI();
    try {
        window.confirm = () => true;
        manager.ensureFolder = async () => 'folder';
        manager.user = { emailAddress: 'learner@example.com' };
        let value = 0,
            revision = 0,
            cleaned = false;
        manager.api = async (path, options = {}) => {
            if (path.startsWith('/files?')) {
                return { id: 'diagnostic' };
            }
            if (path.includes('alt=media')) {
                return { data: { diagnostic: value }, etag: `revision${revision}` };
            }
            if (path.startsWith('/upload/')) {
                if (
                    options.headers['If-Match'] &&
                    options.headers['If-Match'] !== `revision${revision}`
                ) {
                    const error = new Error('stale');
                    error.status = 412;
                    throw error;
                }
                value = JSON.parse(options.body).diagnostic;
                revision++;
                return { id: 'diagnostic' };
            }
            assert.equal(options.body, '{"trashed":true}');
            cleaned = true;
            return {};
        };
        await manager.diagnoseDrive();
        assert.equal(manager.config.checkpointVerified, true);
        assert.equal(value, 2);
        assert.equal(cleaned, true);
        assert.match(window.document.getElementById('driveDiagnosticResult').textContent, /PASS/);
    } finally {
        dom.window.close();
    }
});

test('bulk cloud deletion confirms pinned files, pauses autosaves and never clears local data', async () => {
    const { dom, window, manager } = await setupUI();
    try {
        manager.list = async () => {};
        manager.files = [{ id: 'pinned', appProperties: { pinned: 'true' } }, { id: 'checkpoint' }];
        manager.config.autoSync = true;
        manager.config.frequency = 'daily';
        window.localStorage.setItem('theme', 'keep-local');
        window.confirm = (text) => {
            assert.match(text, /INCLUDING PINNED/);
            return true;
        };
        const deleted = [];
        manager.api = async (path, options) => {
            assert.equal(manager.config.autoSync, false);
            assert.equal(options.body, '{"trashed":true}');
            deleted.push(path);
            return {};
        };
        await manager.deleteCloudBackups();
        assert.deepEqual(deleted, ['/files/pinned', '/files/checkpoint']);
        assert.equal(window.localStorage.getItem('theme'), 'keep-local');
        assert.equal(manager.config.frequency, 'never');
    } finally {
        dom.window.close();
    }
});

test('partial cloud deletion reports progress and keeps autosaves paused', async () => {
    const { dom, window, manager } = await setupUI();
    try {
        window.confirm = () => true;
        manager.list = async () => {};
        manager.files = [{ id: 'one' }, { id: 'two' }];
        manager.config.autoSync = true;
        let calls = 0;
        manager.api = async () => {
            if (++calls === 2) {
                throw new Error('offline');
            }
            return {};
        };
        await assert.rejects(() => manager.deleteCloudBackups(), /1 backups moved to trash/);
        assert.equal(manager.config.autoSync, false);
    } finally {
        dom.window.close();
    }
});

test('cancelling local data deletion leaves local data and authorization unchanged', async () => {
    const { dom, window, manager } = await setupUI();
    try {
        window.confirm = () => false;
        manager.token = 'memory-token';
        window.localStorage.setItem('theme', 'keep-local');
        await manager.clearLocalData();
        assert.equal(window.localStorage.getItem('theme'), 'keep-local');
        assert.equal(manager.token, 'memory-token');
    } finally {
        dom.window.close();
    }
});

test('failed diagnostic preserves learning files and attempts temporary-file cleanup', async () => {
    const { dom, window, manager } = await setupUI();
    try {
        window.confirm = () => true;
        manager.ensureFolder = async () => 'folder';
        manager.user = { emailAddress: 'learner@example.com' };
        let cleanup = false;
        manager.api = async (path, options = {}) => {
            if (path.startsWith('/files?')) {
                return { id: 'diagnostic-only' };
            }
            assert.match(path, /diagnostic-only/);
            if (path.includes('alt=media')) {
                return { data: { diagnostic: 1 }, etag: null };
            }
            if (options.body === '{"trashed":true}') {
                cleanup = true;
            }
            return {};
        };
        await manager.diagnoseDrive();
        assert.equal(cleanup, true);
        assert.equal(manager.config.checkpointVerified, false);
        assert.match(
            window.document.getElementById('driveDiagnosticResult').textContent,
            /NOT VERIFIED/
        );
    } finally {
        dom.window.close();
    }
});
