// Guard the combined app: live practice features must coexist with account/sync work.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

test('live practice toolbar coexists with cloud/account UI without duplicate IDs', () => {
    const markup = read('script.js').match(
        /<div class="stroke-order-section">[\s\S]*?(?=<div class="widget-actions">)/
    )[0];
    const dom = new JSDOM(read('index.html'));
    try {
        const doc = dom.window.document;
        doc.getElementById('kanjiWidget').innerHTML = markup;
        const ids = [...doc.querySelectorAll('[id]')].map((node) => node.id);
        assert.equal(
            new Set(ids).size,
            ids.length,
            'duplicate IDs make controls target the wrong element'
        );
        for (const name of ['Grid', 'Ref', 'Snap', 'Guide', 'Undo', 'Redo', 'Clear']) {
            const button = doc.getElementById(`drawingPadInline${name}Btn`);
            assert.ok(button, name);
            assert.equal(button.hasAttribute('onclick'), false, 'DrawingPad owns event wiring');
        }
        assert.equal(doc.getElementById('drawingPadModal'), null);
        assert.equal(doc.querySelectorAll('#drawingPadCanvas').length, 1);
        assert.ok(doc.getElementById('drawingPadInlineGuide'));
        assert.ok(
            doc.getElementById('drawingPadInlineClearBtn').classList.contains('danger-action')
        );
        for (const id of ['accountPanel', 'profilePage', 'cloudSettings']) {
            assert.ok(doc.getElementById(id).querySelector('[data-cloud-action=save]'));
        }
        assert.ok(doc.querySelector('[data-app-sign-in]'));
        assert.ok(doc.getElementById('profilePageRemovePhoto'));
    } finally {
        dom.window.close();
    }
});

test('practice mode persistence, feedback and safe backups remain integrated', () => {
    const script = read('script.js');
    assert.match(script, /strokeOrderMode: 'animate'/);
    assert.match(script, /this\.settings\.strokeOrderMode = mode/);
    assert.match(script, /if \(this\.settings\.strokeOrderMode === 'practice'\)/);
    assert.match(script, /showWarning\(message\)/);
    assert.match(script, /BackupManager\.normalizeImport/);
    assert.match(script, /await BackupManager\.restore\(data\)/);
    assert.doesNotMatch(script, /onclick="app\.(toggleDrawingPad|undoDrawingPad|clearDrawingPad)/);
});

test('all live Recent theme styles and guide styles coexist with warning and danger styles', () => {
    const css = read('styles.css');
    assert.match(
        css,
        /\.recent-section \{[^}]*background-color:[^}]*padding:[^}]*border-radius:[^}]*box-shadow:/
    );
    for (const theme of ['midnight', 'nami', 'lumen', 'obake', 'ito']) {
        assert.ok(css.includes(`[data-theme='${theme}'] .recent-section {`), theme);
    }
    for (const selector of [
        '.drawing-pad-guide',
        '.guide-stroke-next',
        '.drawing-pad-btn:disabled',
        '.attention-notice--error',
        'button.danger-action'
    ]) {
        assert.ok(css.includes(selector), selector);
    }
});

test('offline precache and static deployment include both practice and account bundles', () => {
    const html = read('index.html');
    const worker = read('sw.js');
    const deploy = read('.github/workflows/deploy.yml');
    for (const file of [
        'drawing-pad.js',
        'script.js',
        'ui-feedback.js',
        'backup-manager.js',
        'profile-page.js',
        'firebase-config.js',
        'app-auth.js',
        'cloud-sync.js'
    ]) {
        const versioned = `${file}?v=practice-merge-v1`;
        assert.ok(html.includes(versioned), `HTML: ${versioned}`);
        assert.ok(worker.includes(`'/${versioned}'`), `precache: ${versioned}`);
        assert.ok(deploy.includes(`cp ${file} deploy/`), `deploy: ${file}`);
        assert.ok(fs.existsSync(path.join(root, file)));
    }
    assert.ok(worker.includes("'/drawing-pad.js'"));
    assert.ok(deploy.includes('cp CNAME deploy/'));
    assert.equal(read('CNAME').trim(), 'kanji.qd.je');
});

test('username login assets are versioned, precached and deployed together', () => {
    const html = read('index.html');
    const worker = read('sw.js');
    const deploy = read('.github/workflows/deploy.yml');
    for (const file of ['username-policy.js', 'username-directory.js', 'auth-dialog.js']) {
        const versioned = `${file}?v=login-v1`;
        assert.ok(html.includes(versioned), `HTML: ${versioned}`);
        assert.ok(worker.includes(`'/${versioned}'`), `precache: ${versioned}`);
        assert.ok(deploy.includes(`cp ${file} deploy/`), `deploy: ${file}`);
    }
    assert.match(worker, /kanji-widgets-v19/, 'the offline cache version must be bumped');
    assert.ok(html.indexOf('username-policy.js') < html.indexOf('app-auth.js'));
    assert.ok(html.indexOf('app-auth.js') < html.indexOf('username-directory.js'));
    assert.ok(html.indexOf('username-directory.js') < html.indexOf('auth-dialog.js'));
});

test('one sign-in dialog carries password, username and Google entry points', () => {
    const dom = new JSDOM(read('index.html'));
    try {
        const doc = dom.window.document;
        const dialog = doc.getElementById('authDialog');
        assert.ok(dialog, 'the sign-in dialog must exist');
        for (const pane of ['signin', 'create', 'account']) {
            assert.ok(dialog.querySelector(`[data-auth-pane=${pane}]`), `pane: ${pane}`);
        }
        for (const tab of ['signin', 'create']) {
            assert.ok(dialog.querySelector(`[data-auth-tab=${tab}]`), `tab: ${tab}`);
        }
        for (const id of [
            'authSignInIdentifier',
            'authSignInPassword',
            'authCreateEmail',
            'authCreateUsername',
            'authUsernameStatus',
            'authUsernameSuggestions',
            'authCreatePassword',
            'authCreatePasswordConfirm',
            'authCreateConsent',
            'authUsernameChange',
            'authUsernameChangeStatus',
            'authSaveUsername',
            'authAddPasswordEmail',
            'authRecoveryEmail',
            'authGoogleBtn'
        ]) {
            assert.ok(dialog.querySelector(`#${id}`), id);
        }
        const ids = [...doc.querySelectorAll('[id]')].map((node) => node.id);
        assert.equal(new Set(ids).size, ids.length, 'duplicate IDs break dialog controls');
        const buttons = [...doc.querySelectorAll('[data-app-sign-in]')];
        assert.equal(buttons.length, 2, 'account panel and profile page both offer sign-in');
        for (const button of buttons) {
            assert.match(button.textContent, /Sign in or create account/);
            assert.equal(button.classList.contains('danger-action'), false);
            assert.equal(button.hasAttribute('onclick'), false, 'app-auth owns event wiring');
        }
        assert.ok(doc.querySelector('[data-username-control]'));
        assert.ok(doc.querySelector('[data-app-auth-identities]'));
    } finally {
        dom.window.close();
    }
});

test('no credential, password or username handle reaches backups or cloud sync', () => {
    const cloudKeys = read('cloud-sync.js');
    const backupKeys = read('backup-manager.js');
    const rules = read('firestore.rules');
    assert.equal(/kanji_handle_v1/.test(cloudKeys), false, 'the handle mirror stays local');
    assert.equal(
        /kanji_handle_v1/.test(backupKeys),
        false,
        'the handle mirror stays out of backups'
    );
    assert.equal(/password/i.test(cloudKeys.match(/static keys = \[[\s\S]*?\];/)[0]), false);
    assert.equal(/password/i.test(backupKeys.match(/static keys = \[[\s\S]*?\];/)[0]), false);
    assert.match(rules, /match \/usernames\/\{name\} \{/);
    assert.match(rules, /allow get: if true;/);
    assert.match(rules, /allow list: if false;/);
    assert.match(rules, /match \/users\/\{uid\}\/sync\/progress \{/);
    assert.match(rules, /request\.resource\.data\.payload\.size\(\) <= 350000/);
});

test('default tests and CI retain the practice regression gate along with account tests', () => {
    const pkg = JSON.parse(read('package.json'));
    assert.match(pkg.scripts.test, /test\/test-cloud-sync\.js/);
    assert.match(pkg.scripts.test, /npm run test:drawing-pad/);
    assert.equal(pkg.scripts['test:drawing-pad'], 'node test/test-drawing-pad.js');
    assert.match(read('.github/workflows/lint.yml'), /npm test/);
    assert.match(read('.github/CODEOWNERS'), /\* @brodante/);
});
