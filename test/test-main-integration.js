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

test('default tests and CI retain the practice regression gate along with account tests', () => {
    const pkg = JSON.parse(read('package.json'));
    assert.match(pkg.scripts.test, /test\/test-cloud-sync\.js/);
    assert.match(pkg.scripts.test, /npm run test:drawing-pad/);
    assert.equal(pkg.scripts['test:drawing-pad'], 'node test/test-drawing-pad.js');
    assert.match(read('.github/workflows/lint.yml'), /npm test/);
    assert.match(read('.github/CODEOWNERS'), /\* @brodante/);
});
