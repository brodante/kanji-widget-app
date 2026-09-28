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
    window.eval(fs.readFileSync(require.resolve('../ui-feedback.js'), 'utf8'));
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

test('profile editing validates and persists the fields the page owns', async () => {
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
        assert.equal(
            doc.getElementById('profileNickname'),
            null,
            'the compact menu keeps no second display-name field'
        );
        doc.getElementById('profilePageNickname').value = 'x'.repeat(41);
        doc.getElementById('profilePageForm').dispatchEvent(
            new window.Event('submit', { cancelable: true })
        );
        assert.match(doc.getElementById('profilePageFeedback').textContent, /40 characters/);
    } finally {
        dom.window.close();
    }
});

test('the avatar pencils open the photo picker from the hero and from the popup', async () => {
    const { dom, window, dialog } = await setup();
    try {
        const doc = window.document;
        let opened = 0;
        doc.getElementById('profilePagePhotoFile').click = () => opened++;
        doc.getElementById('openProfilePage').click();
        assert.equal(dialog.open, true);
        doc.getElementById('profilePageAvatarEdit').click();
        assert.equal(opened, 1, 'the hero avatar is the picker');

        doc.getElementById('profilePageBack').click();
        assert.equal(dialog.open, false);
        doc.getElementById('accountBtn').click();
        doc.getElementById('accountAvatarEdit').click();
        assert.equal(dialog.open, true, 'the popup avatar opens the profile page');
        assert.equal(doc.activeElement.id, 'profilePagePhoto');
        assert.equal(
            window.location.hash,
            '#profile',
            'the profile page stays addressable after hopping from the popup'
        );
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
        window.document.getElementById('driveBackup').scrollIntoView = () => {};
        window.document.getElementById('profilePageReview').click();
        assert.equal(window.document.getElementById('driveBackup').open, true);
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
            /login-v1/
        );
        assert.match(
            window.document.getElementById('driveDiagnosticBuild').textContent,
            /metadata-etag-v1/
        );
        assert.match(
            window.document.getElementById('driveDiagnosticResult').textContent,
            /Older saved result/
        );
        assert.equal(window.BackupManager.BUILD, 'login-v1');
    } finally {
        dom.window.close();
    }
});

test('app entry points and offline cache use the same versioned profile assets', () => {
    const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');
    const worker = fs.readFileSync(require.resolve('../sw.js'), 'utf8');
    for (const asset of [
        'backup-manager.js?v=practice-merge-v1',
        'profile-page.js?v=practice-merge-v1',
        'styles.css?v=practice-merge-v1',
        'ui-feedback.js?v=practice-merge-v1'
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

test('the profile save buttons keep Google’s mark and re-render their labels', async () => {
    const { dom, window, manager, page } = await setup();
    try {
        page.open();
        const doc = window.document;
        for (const id of ['profilePageConnect', 'profilePageQuickSave']) {
            assert.ok(doc.getElementById(id), id);
        }
        const button = doc.getElementById('profilePageConnect');
        assert.ok(
            button.querySelector('svg.google-icon'),
            'the Google mark is on the connect button'
        );
        assert.equal(button.classList.contains('google-btn'), true);
        assert.match(button.textContent, /Connect with Google Drive/);
        assert.equal(
            doc.getElementById('profilePageQuickSave').querySelector('svg.google-icon'),
            null,
            'Quick save is not a Google action and stays plain'
        );

        // Connecting swaps the label without losing the mark.
        manager.token = 'token';
        manager.expires = Date.now() + 60000;
        manager.user = { displayName: 'Learner', emailAddress: 'learner@example.com' };
        page.refresh();
        assert.match(button.textContent, /Switch Drive account/);
        assert.ok(button.querySelector('svg.google-icon'));
    } finally {
        dom.window.close();
    }
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

test('cancelling the file chooser keeps the profile page open', async () => {
    const { dom, window, page, dialog } = await setup();
    try {
        page.open();
        assert.equal(dialog.open, true);
        // A real file input dispatches a bubbling "cancel" when the picker is dismissed
        // (Chrome does this without any file being chosen). That event used to travel up
        // to the dialog's own Escape handler and close the whole page.
        const input = window.document.getElementById('profilePagePhotoFile');
        input.dispatchEvent(new window.Event('cancel', { bubbles: true }));
        assert.equal(
            dialog.open,
            true,
            'the learner stays on the profile page after cancelling the file chooser'
        );
        assert.equal(window.location.hash, '#profile');

        // The dialog's own Escape cancel still closes the page.
        dialog.dispatchEvent(new window.Event('cancel', { bubbles: false, cancelable: true }));
        assert.equal(dialog.open, false);
    } finally {
        dom.window.close();
    }
});

test('oversized profile photo raises a persistent alert inside the open profile dialog', async () => {
    const { dom, window, page, dialog, manager } = await setup();
    try {
        page.open();
        const input = window.document.getElementById('profilePagePhotoFile');
        Object.defineProperty(input, 'files', {
            value: [{ type: 'image/png', size: 2 * 1024 * 1024 }]
        });
        await input.onchange();
        const notice = dialog.querySelector('.attention-notice');
        assert.equal(notice.getAttribute('role'), 'alert');
        assert.match(notice.textContent, /smaller than 2 MB/);
        assert.equal(manager.avatarBusy, false);
        assert.equal(window.document.getElementById('profilePagePhoto').disabled, false);
        assert.match(window.document.getElementById('profilePageFeedback').textContent, /2 MB/);
    } finally {
        dom.window.close();
    }
});

test('remove DP confirms removal, updates fallback and deletes only the avatar slot', async () => {
    const { dom, window, manager } = await setup();
    try {
        manager.avatarURL = 'blob:custom';
        window.kanjiAuth = { user: { photoURL: 'https://example.com/google.png' } };
        manager.renderAvatar();
        const button = window.document.getElementById('profilePageRemovePhoto');
        assert.equal(button.hidden, false);
        assert.equal(button.title, 'Remove DP');
        let writes = 0;
        window.BackupManager.media = async (data, slots) => {
            writes++;
            assert.equal(Object.keys(data).length, 0);
            assert.equal(slots.join(','), 'avatar');
        };
        window.URL.revokeObjectURL = () => {};
        window.confirm = () => false;
        await button.onclick();
        assert.equal(writes, 0);
        assert.equal(manager.avatarURL, 'blob:custom');
        window.confirm = () => true;
        await button.onclick();
        assert.equal(writes, 1);
        assert.equal(manager.avatarURL, '');
        assert.equal(button.hidden, true);
        assert.equal(
            window.document.getElementById('accountAvatar').dataset.source,
            'https://example.com/google.png'
        );
    } finally {
        dom.window.close();
    }
});

test('removing a photo can be undone with the same bytes and crop, until the page is left', async () => {
    const { dom, window, manager } = await setup();
    try {
        window.eval(fs.readFileSync(require.resolve('../avatar-crop.js'), 'utf8'));
        window.URL.createObjectURL = () => 'blob:created';
        window.URL.revokeObjectURL = () => {};
        window.BackupManager.decodeAvatar = async () => ({ naturalWidth: 120, naturalHeight: 90 });
        const writes = [];
        window.BackupManager.media = async (data, slots) => {
            writes.push([Object.keys(data).join(','), slots.join(',')]);
        };
        const blob = new window.Blob(['photo-bytes'], { type: 'image/png' });
        const crop = { x: 0.3, y: 0.4, zoom: 1.7, ratio: 1.5 };
        await manager.setAvatar(blob, crop);
        assert.equal(manager.avatarURL, 'blob:created');
        assert.equal(manager.avatarUndo, null, 'an upload has nothing to undo');

        window.confirm = () => true;
        await window.document.getElementById('profilePageRemovePhoto').onclick();
        assert.equal(manager.avatarURL, '', 'the photo is gone from the UI');
        assert.ok(manager.avatarUndo, 'the removed bytes are held in memory for the undo');
        assert.equal(manager.avatarUndo.blob, blob, 'the exact bytes, not a re-encode');
        const undo = window.document.getElementById('profilePageUndoRemovePhoto');
        assert.equal(undo.hidden, false, 'undo is offered right after the removal');
        assert.match(
            window.document.getElementById('profilePageFeedback').textContent,
            /Undo puts the same photo back/
        );

        await undo.onclick();
        assert.equal(manager.avatarURL, 'blob:created', 'the same photo comes back');
        assert.deepEqual(writes.at(-1), ['avatar', 'avatar'], 'and goes back into its own slot');
        assert.equal(manager.avatarBlob, blob);
        const restoredCrop = window.AvatarCrop.read();
        for (const [key, value] of Object.entries(crop)) {
            assert.equal(
                restoredCrop[key],
                value,
                `crop.${key} comes back, so nothing is re-placed`
            );
        }
        assert.equal(manager.avatarUndo, null, 'the undo is spent');
        assert.equal(undo.hidden, true);
    } finally {
        dom.window.close();
    }
});

test('a later upload or a sign-out ends the photo undo for good', async () => {
    const { dom, window, manager } = await setup();
    try {
        window.eval(fs.readFileSync(require.resolve('../avatar-crop.js'), 'utf8'));
        window.URL.createObjectURL = () => 'blob:created';
        window.URL.revokeObjectURL = () => {};
        window.BackupManager.decodeAvatar = async () => ({ naturalWidth: 120, naturalHeight: 90 });
        window.BackupManager.media = async () => {};
        const first = new window.Blob(['first'], { type: 'image/png' });
        const second = new window.Blob(['second'], { type: 'image/png' });
        const crop = { x: 0.5, y: 0.5, zoom: 1, ratio: 1 };
        const undo = window.document.getElementById('profilePageUndoRemovePhoto');
        window.confirm = () => true;

        await manager.setAvatar(first, crop);
        await window.document.getElementById('profilePageRemovePhoto').onclick();
        assert.ok(manager.avatarUndo);
        await manager.setAvatar(second, crop);
        assert.equal(manager.avatarUndo, null, 'a different photo supersedes the undo');
        assert.equal(undo.hidden, true);

        await window.document.getElementById('profilePageRemovePhoto').onclick();
        assert.ok(manager.avatarUndo);
        await manager.clearSignedOutIdentity();
        assert.equal(
            manager.avatarUndo,
            null,
            'signing out must not leave the removed bytes recoverable'
        );
        assert.equal(undo.hidden, true);
        assert.equal(manager.avatarURL, '');
    } finally {
        dom.window.close();
    }
});

test('failed photo removal retains custom photo and shows an actionable alert', async () => {
    const { dom, window, manager, page, dialog } = await setup();
    try {
        page.open();
        manager.avatarURL = 'blob:custom';
        manager.renderAvatar();
        window.confirm = () => true;
        window.BackupManager.media = async () => {
            throw new Error('Photo storage unavailable');
        };
        await window.document.getElementById('profilePageRemovePhoto').onclick();
        assert.equal(manager.avatarURL, 'blob:custom');
        assert.match(
            dialog.querySelector('.attention-notice').textContent,
            /Photo storage unavailable/
        );
        assert.equal(window.document.getElementById('profilePageRemovePhoto').disabled, false);
    } finally {
        dom.window.close();
    }
});

test('danger actions are red-themed while sign-in is unchanged; alerts use text not HTML', async () => {
    const { dom, window } = await setup();
    try {
        const doc = window.document;
        for (const button of doc.querySelectorAll(
            '[data-app-sign-out], #resetProgress, #clearLocalAccount, #deleteCloudBackups, #profilePageRemovePhoto'
        )) {
            assert.equal(button.classList.contains('danger-action'), true);
        }
        for (const button of doc.querySelectorAll('[data-app-sign-in]')) {
            assert.equal(button.classList.contains('danger-action'), false);
        }
        const notice = window.KanjiFeedback.show('<img src=x onerror=alert(1)>');
        assert.equal(notice.querySelector('img'), null);
        assert.ok(notice.textContent.includes('<img'));
        const css = fs.readFileSync(require.resolve('../styles.css'), 'utf8');
        assert.ok(css.includes('prefers-reduced-motion: reduce'));
        assert.ok(css.includes('.attention-notice--error'));
    } finally {
        dom.window.close();
    }
});
