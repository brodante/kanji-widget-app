const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const read = (name) => fs.readFileSync(require.resolve(`../${name}`), 'utf8');
const source = read('analytics.js');

for (const url of [
    'https://kanji.qd.je/',
    'https://kanji.qd.je/#profile',
    'https://brodante.github.io/kanji-widget-app/',
    'https://brodante.github.io/kanji-widget-app'
]) {
    test(`one existing GA4 destination on ${url}`, () => {
        const dom = new JSDOM('<!doctype html><head></head><body></body>', {
            url,
            runScripts: 'outside-only'
        });
        try {
            dom.window.eval(source);
            dom.window.eval(source);
            const tags = dom.window.document.querySelectorAll('script');
            assert.equal(tags.length, 1);
            assert.equal(tags[0].src, 'https://www.googletagmanager.com/gtag/js?id=G-Q6XNG2ETFL');
            assert.equal(tags[0].async, true);
            assert.equal(dom.window.dataLayer.length, 2);
            assert.equal(dom.window.dataLayer[1][0], 'config');
            assert.equal(dom.window.dataLayer[1][1], 'G-Q6XNG2ETFL');
            tags[0].dispatchEvent(new dom.window.Event('error'));
            assert.ok(dom.window.document.body, 'analytics loading is independent of app startup');
        } finally {
            dom.window.close();
        }
    });
}

for (const url of [
    'http://localhost:5000/',
    'http://127.0.0.1:5000/',
    'https://5000-preview.e2b.app/',
    'https://someone.github.io/kanji-widget-app/',
    'https://brodante.github.io/another-project/',
    'https://brodante.github.io/kanji-widget-app-fork/',
    'https://kanji.qd.je.example.com/'
]) {
    test(`no analytics on development, previews or other sites: ${url}`, () => {
        const dom = new JSDOM('<!doctype html><head></head>', { url, runScripts: 'outside-only' });
        try {
            dom.window.eval(source);
            assert.equal(dom.window.document.querySelector('script'), null);
            assert.equal(dom.window.dataLayer, undefined);
        } finally {
            dom.window.close();
        }
    });
}

test('HTML, offline cache and Pages deployment load the single analytics bootstrap', () => {
    const html = read('index.html');
    assert.equal((html.match(/analytics\.js\?v=analytics-v1/g) || []).length, 1);
    assert.equal(html.includes("gtag('config'"), false);
    assert.equal(html.includes('googletagmanager.com/gtag/js'), false);
    assert.ok(read('sw.js').includes("'/analytics.js?v=analytics-v1'"));
    assert.ok(read('.github/workflows/deploy.yml').includes('cp analytics.js deploy/'));
    assert.equal(read('app-auth.js').includes('getAnalytics'), false);
    assert.equal(read('firebase-config.js').includes('measurementId:'), false);
});
