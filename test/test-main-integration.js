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
    // Fresh browsers start on the practice board; returning users get their
    // last-open tab back from saved settings.
    assert.match(script, /strokeOrderMode: 'practice'/);
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
        // The selector may sit anywhere inside a grouped rule (e.g. the
        // frosted-glass list), so match it followed by ',' or '{', not the
        // last-selector '{' shape only.
        assert.ok(
            new RegExp(`\\[data-theme='${theme}'\\] \\.recent-section\\s*[,{]`).test(css),
            theme
        );
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
    const assets = [
        ['drawing-pad.js', 'practice-merge-v1'],
        ['ui-feedback.js', 'practice-merge-v1'],
        ['backup-manager.js', 'practice-merge-v1'],
        ['profile-page.js', 'practice-merge-v1'],
        ['cloud-sync.js', 'practice-merge-v1'],
        ['styles.css', 'custom-footer-glass-v1'],
        ['script.js', 'ai-floating-v1'],
        ['firebase-config.js', 'ai-free-v3'],
        ['app-auth.js', 'ai-free-v1'],
        ['ai-manager.js', 'ai-model-lite-v1'],
        ['ai-tutor-modal.js', 'ai-free-v3']
    ];
    for (const [file, version] of assets) {
        const versioned = `${file}?v=${version}`;
        assert.ok(html.includes(versioned), `HTML: ${versioned}`);
        assert.ok(worker.includes(`'/${versioned}'`), `precache: ${versioned}`);
        assert.ok(deploy.includes(`cp ${file} deploy/`), `deploy: ${file}`);
        assert.ok(fs.existsSync(path.join(root, file)));
    }
    // The bare '/drawing-pad.js' twin is gone on purpose: the page only ever
    // requests the ?v= URL, so the unversioned entry was downloaded at every
    // install and never matched a single fetch.
    assert.ok(!worker.includes("'/drawing-pad.js'"), 'no bare duplicate in the precache');
    assert.ok(deploy.includes('cp CNAME deploy/'));
    assert.equal(read('CNAME').trim(), 'kanji.qd.je');
});

test('the favicon link points at a root favicon.gif and the deploy ships it if present', () => {
    const html = read('index.html');
    const deploy = read('.github/workflows/deploy.yml');
    assert.match(
        html,
        /<link rel="icon" type="image\/gif" href="favicon\.gif" \/>/,
        'the browser tab icon must be declared in the head'
    );
    // The icon sits next to index.html so the relative href resolves on every host.
    assert.equal(read('CNAME').trim(), 'kanji.qd.je');
    assert.ok(
        deploy.includes('[ -f "favicon.gif" ]') && deploy.includes('cp favicon.gif deploy/'),
        'deploy must copy favicon.gif without failing when the file is not committed yet'
    );
    // Precache only ships files that exist: cache.addAll fails the whole install on a 404.
    assert.ok(
        !read('sw.js').includes("'/favicon.gif'"),
        'the optional favicon must not be precached'
    );
});

test('AI Sensei assistive button is icon-only, accessible and docks after idle', () => {
    const dom = new JSDOM(read('index.html'), {
        url: 'https://kanji.qd.je',
        runScripts: 'outside-only'
    });
    const { window } = dom;
    const pendingTimers = new Map();
    let nextTimerId = 1;

    try {
        const fab = window.document.getElementById('aiSenseiFab');
        assert.equal(fab.tagName, 'BUTTON');
        assert.equal(fab.getAttribute('aria-label'), 'Open AI Sensei hub');
        assert.ok(fab.querySelector('i.fa-brain'));
        assert.equal(fab.querySelector('.ai-fab-text'), null);
        const floatingAssistantToggle = window.document.getElementById(
            'aiFloatingAssistantEnabled'
        );
        // Static default is now unchecked: a brand-new visitor gets no floating
        // bubble, and syncAISettingsUI() re-checks it for returning users on open.
        assert.equal(floatingAssistantToggle.checked, false);
        assert.match(
            window.document
                .getElementById('aiFloatingAssistantHelp')
                .textContent.replace(/\s+/g, ' '),
            /AI Sensei remains available from other in-app entry points/
        );

        let floatingAssistantEnabled = true;
        window.StorageManager = {
            getAISettings: () => ({ enableFloatingAssistant: floatingAssistantEnabled }),
            // This test simulates a returning visitor with the bubble enabled, so the
            // effective-value getter returns the stored preference.
            getEnableFloatingAssistant: () => floatingAssistantEnabled,
            updateAISetting: (key, value) => {
                assert.equal(key, 'enableFloatingAssistant');
                floatingAssistantEnabled = value;
            }
        };

        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 400 });
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: 700 });
        Object.defineProperty(fab, 'offsetWidth', { configurable: true, value: 60 });
        Object.defineProperty(fab, 'offsetHeight', { configurable: true, value: 60 });
        window.setTimeout = (callback, delay) => {
            const id = nextTimerId++;
            pendingTimers.set(id, { callback, delay });
            return id;
        };
        window.clearTimeout = (id) => pendingTimers.delete(id);
        window.eval(
            `${read('script.js')}\nwindow.__initAISenseiFab = KanjiLearningApp.prototype.initDraggableFab;\nwindow.__setFloatingAISenseiEnabled = KanjiLearningApp.prototype.setFloatingAISenseiEnabled;`
        );

        const app = {};
        window.__initAISenseiFab.call(app, fab);
        assert.equal(fab.dataset.dockEdge, 'left');
        assert.equal(pendingTimers.size, 1);
        const [{ callback, delay }] = [...pendingTimers.values()];
        assert.equal(delay, 5000);
        pendingTimers.clear();
        callback();
        assert.equal(fab.classList.contains('is-idle'), true);

        fab.dispatchEvent(new window.Event('mouseenter'));
        assert.equal(fab.classList.contains('is-idle'), false);
        assert.equal(pendingTimers.size, 0);
        app.resetAISenseiFabIdleTimer();
        assert.equal(pendingTimers.size, 1);

        const css = read('styles.css');
        assert.match(
            css,
            /\.ai-sensei-fab\.is-idle\[data-dock-edge='left'\][^{]*\{[^}]*translate: calc\(-55% - 8px\) 0/s
        );
        assert.match(
            css,
            /\.ai-sensei-fab\.is-idle\[data-dock-edge='right'\][^{]*\{[^}]*translate: calc\(55% \+ 8px\) 0/s
        );
        assert.match(css, /\.ai-sensei-fab\[hidden\][^{]*\{[^}]*display: none !important/s);

        window.__setFloatingAISenseiEnabled.call(app, false);
        assert.equal(floatingAssistantEnabled, false);
        assert.equal(fab.hidden, true);
        assert.equal(pendingTimers.size, 0);
        assert.ok(window.document.getElementById('aiSenseiModal'));

        window.__setFloatingAISenseiEnabled.call(app, true);
        assert.equal(floatingAssistantEnabled, true);
        assert.equal(fab.hidden, false);
        assert.equal(pendingTimers.size, 1);
    } finally {
        dom.window.close();
    }
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
    assert.match(worker, /kanji-widgets-v36/, 'the offline cache version must be bumped');
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
            'authUsernameChange',
            'authUsernameChangeStatus',
            'authSaveUsername',
            'authAddPasswordEmail',
            'authRecoveryEmail',
            'authGoogleBtn'
        ]) {
            assert.ok(dialog.querySelector(`#${id}`), id);
        }
        // No display-name field and no consent tick-box: the profile owns the name, and
        // the no-silent-upload promise is enforced in code rather than promised in a form.
        assert.equal(dialog.querySelector('#authCreateName'), null);
        assert.equal(dialog.querySelector('#authCreateConsent'), null);
        const createHints = [...dialog.querySelectorAll('[data-auth-pane=create] .auth-hint')].map(
            (node) => node.textContent
        );
        assert.ok(
            createHints.some((text) => /set on your profile/.test(text)),
            'the create pane names where the display name lives'
        );
        assert.ok(
            createHints.some((text) => /never uploads progress/.test(text)),
            'the create pane keeps the no-silent-upload promise in words'
        );
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
