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
        manager.sync = async () => {};
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
