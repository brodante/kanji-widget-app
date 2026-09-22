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
    window.eval(fs.readFileSync(require.resolve('../backup-manager.js'), 'utf8'));
    window.eval(fs.readFileSync(require.resolve('../profile-page.js'), 'utf8'));
    const manager = new window.BackupManager();
    manager.loadIdentity = async () => {};
    window.driveBackup = manager;
    manager.init();
    const dialog = window.document.getElementById('profilePage');
    // jsdom has no native top-layer implementation. Real-browser layout remains a manual check.
    dialog.showModal = () => dialog.setAttribute('open', '');
    dialog.close = () => {
        dialog.removeAttribute('open');
        dialog.dispatchEvent(new window.Event('close'));
    };
    const page = new window.ProfilePage(manager);
    window.kanjiProfilePage = page;
    page.init();
    return { dom, window, manager, page, dialog };
}

test('dedicated profile page opens and closes without losing Google authorization', async () => {
    const { dom, window, manager, dialog } = await setup();
    try {
        manager.token = 'in-memory';
        manager.expires = Date.now() + 60000;
        manager.user = { displayName: 'Mizu', emailAddress: 'mizu@example.com' };
        window.document.getElementById('openProfilePage').click();
        assert.equal(dialog.open, true);
        assert.equal(window.location.hash, '#profile');
        assert.equal(window.document.getElementById('profilePageTitle').textContent, 'Mizu');
        assert.equal(window.document.activeElement.id, 'profilePageBack');
        window.document.getElementById('profilePageBack').click();
        assert.equal(dialog.open, false);
        assert.equal(window.location.hash, '');
        assert.equal(manager.token, 'in-memory');
        assert.equal(window.document.activeElement.id, 'accountBtn');
    } finally {
        dom.window.close();
    }
});

test('profile statistics use stored progress and review records, not invented dates', async () => {
    const { dom, window, page } = await setup();
    try {
        page.open();
        assert.match(
            window.document.getElementById('profileLearningSince').textContent,
            /not been recorded/
        );
        const startDate = Date.UTC(2025, 0, 1);
        window.localStorage.setItem(
            'kanji_progress',
            JSON.stringify({
                studied: ['日', '月', '日'],
                mastered: ['日'],
                startDate,
                lastStudied: startDate
            })
        );
        window.localStorage.setItem(
            'kanji_srs_data',
            JSON.stringify({
                日: { totalReviews: 7, dueDate: 1 },
                月: { totalReviews: 2, dueDate: Date.now() + 86400000 }
            })
        );
        page.refresh();
        assert.equal(window.document.getElementById('profileStudied').textContent, '2');
        assert.equal(window.document.getElementById('profileMastered').textContent, '1');
        assert.equal(window.document.getElementById('profileReviewTotal').textContent, '9');
        assert.equal(window.document.getElementById('profileReviewDue').textContent, '1');
        assert.match(window.document.getElementById('profileLearningSince').textContent, /2025/);
        window.localStorage.setItem('kanji_progress', 'bad JSON');
        assert.doesNotThrow(() => page.refresh());
    } finally {
        dom.window.close();
    }
});

test('profile editing shares validation and persistence with the compact menu', async () => {
    const { dom, window, page } = await setup();
    try {
        page.open();
        const doc = window.document;
        doc.getElementById('profilePageNickname').value = 'Mizu <b>hello</b>';
        doc.getElementById('profilePageDevice').value = 'Phone';
        doc.getElementById('profilePageForm').dispatchEvent(
            new window.Event('submit', { cancelable: true })
        );
        assert.equal(
            JSON.parse(window.localStorage.getItem('kanji_profile')).nickname,
            'Mizu <b>hello</b>'
        );
        assert.equal(doc.getElementById('profilePageTitle').querySelector('b'), null);
        assert.equal(doc.getElementById('profileNickname').value, 'Mizu <b>hello</b>');
        doc.getElementById('profilePageNickname').value = 'x'.repeat(41);
        doc.getElementById('profilePageForm').dispatchEvent(
            new window.Event('submit', { cancelable: true })
        );
        assert.match(doc.getElementById('profilePageFeedback').textContent, /40 characters/);
    } finally {
        dom.window.close();
    }
});

test('profile saves reuse existing cloud operations and expose conflicts', async () => {
    const { dom, window, manager, page } = await setup();
    try {
        page.open();
        let saves = 0,
            backups = 0;
        manager.run = async (fn) => fn();
        manager.sync = async () => {
            saves++;
        };
        manager.backup = async () => {
            backups++;
        };
        window.document.getElementById('profilePageQuickSave').click();
        window.document.getElementById('profilePageNewBackup').click();
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(saves, 1);
        assert.equal(backups, 1);
        manager.pendingCloud = { id: 'new-cloud-copy' };
        page.refresh();
        assert.equal(window.document.getElementById('profilePageReview').hidden, false);
        window.document.getElementById('profilePageReview').click();
        assert.equal(window.document.getElementById('accountPanel').hidden, false);
    } finally {
        dom.window.close();
    }
});

test('diagnostic history is labelled as saved and current build is visible before running', async () => {
    const { dom, window, manager } = await setup();
    try {
        manager.config.diagnosticResult = 'NOT VERIFIED: a previous result';
        manager.initSafety();
        assert.match(
            window.document.getElementById('driveDiagnosticBuild').textContent,
            /profile-v1/
        );
        assert.match(
            window.document.getElementById('driveDiagnosticBuild').textContent,
            /metadata-etag-v1/
        );
        assert.match(
            window.document.getElementById('driveDiagnosticResult').textContent,
            /Older saved result/
        );
        assert.equal(window.BackupManager.BUILD, 'profile-v1');
    } finally {
        dom.window.close();
    }
});

test('app entry points and offline cache use the same versioned profile assets', () => {
    const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');
    const worker = fs.readFileSync(require.resolve('../sw.js'), 'utf8');
    for (const asset of [
        'backup-manager.js?v=auth-v1',
        'profile-page.js?v=auth-v1',
        'styles.css?v=auth-v1'
    ]) {
        assert.ok(html.includes(asset), asset);
        assert.ok(worker.includes(asset), asset);
    }
    assert.ok(
        fs
            .readFileSync(require.resolve('../.github/workflows/deploy.yml'), 'utf8')
            .includes('cp profile-page.js deploy/')
    );
});

test('settings shortcuts open profile and navigate to all existing sections', async () => {
    const { dom, window, dialog } = await setup();
    try {
        const doc = window.document;
        const modal = doc.getElementById('settingsModal');
        modal.classList.add('show');
        doc.getElementById('closeSettings').onclick = () => modal.classList.remove('show');
        doc.getElementById('settingsOpenProfile').click();
        assert.equal(dialog.open, true);
        assert.equal(modal.classList.contains('show'), false);
        doc.getElementById('profilePageBack').click();
        for (const button of doc.querySelectorAll('[data-settings-target]')) {
            const target = doc.getElementById(button.dataset.settingsTarget);
            assert.ok(target, button.dataset.settingsTarget);
            let scrolled = false;
            target.scrollIntoView = () => {
                scrolled = true;
            };
            button.click();
            assert.ok(scrolled);
            assert.equal(doc.activeElement, target);
        }
        assert.equal(doc.getElementById('backupSafety').open, true);
    } finally {
        dom.window.close();
    }
});
