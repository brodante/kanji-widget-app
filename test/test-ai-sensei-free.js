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
    window.eval(fs.readFileSync(require.resolve('../ai-tutor-modal.js'), 'utf8'));

    const app = {
        currentKanji: { character: '日', meanings: ['sun', 'day'], strokes: 4 },
        currentKanjiPool: [],
        settings: { jlptLevel: 'N5' },
        openedSettings: 0,
        closedSensei: 0,
        closedDrawer: 0,
        closeAISenseiModal() {
            this.closedSensei++;
        },
        closeKanjiDrawer() {
            this.closedDrawer++;
        },
        openSettings() {
            this.openedSettings++;
        }
    };
    window.AISenseiModule.applyTo(app);
    return { dom, window, app };
}

test('Settings default to keyless Firebase AI and keep existing BYOK models visible', async () => {
    const { dom, window } = await setup();
    let settings = {
        provider: 'gemini',
        apiKey: 'learner-key',
        model: 'gemini-3.6-flash',
        persona: 'encouraging'
    };
    window.StorageManager = { getAISettings: () => settings };
    window.AIManager = {
        PROVIDER_DEFAULTS: {
            firebase: {
                requiresKey: false,
                fixedModel: true,
                models: ['gemini-3.8-flash']
            },
            gemini: {
                requiresKey: true,
                models: ['gemini-3.1-flash-lite', 'gemini-3.1-pro-preview'],
                keyUrl: 'https://aistudio.google.com/api-keys'
            }
        }
    };

    try {
        const script = fs.readFileSync(require.resolve('../script.js'), 'utf8');
        window.eval(
            `${script}\nwindow.__syncAISettingsUI = KanjiLearningApp.prototype.syncAISettingsUI;`
        );
        window.__syncAISettingsUI.call({});
        const doc = window.document;
        assert.equal(doc.getElementById('aiProvider').value, 'gemini');
        assert.equal(doc.getElementById('aiApiKeyGroup').style.display, 'block');
        assert.equal(doc.getElementById('aiApiKey').value, 'learner-key');
        assert.equal(doc.getElementById('aiModel').value, 'gemini-3.6-flash');

        settings = {
            provider: 'firebase',
            apiKey: '',
            model: 'gemini-3.8-flash',
            persona: 'encouraging'
        };
        window.__syncAISettingsUI.call({});
        assert.equal(doc.getElementById('aiProvider').value, 'firebase');
        assert.equal(doc.getElementById('aiApiKeyGroup').style.display, 'none');
        assert.equal(doc.getElementById('aiModelGroup').style.display, 'none');
        assert.equal(doc.getElementById('aiFixedModelNote').hidden, false);
        assert.equal(doc.getElementById('aiModel').disabled, true);
        assert.equal(doc.getElementById('aiModel').value, 'gemini-3.8-flash');
    } finally {
        dom.window.close();
    }
});

test('free-tier quota in Ask Sensei offers BYOK and a privacy-safe developer contact', async () => {
    const { dom, window, app } = await setup();
    let configuredOwnKey = false;
    let requests = 0;
    window.AIManager = {
        isFreeTierLimitError: (error) => error?.code === 'ai/free-tier-quota-exceeded',
        askSenseiQuestion: async (question, kanji) => {
            requests++;
            assert.equal(question, 'What does 日 mean?');
            assert.equal(kanji.character, '日');
            if (!configuredOwnKey) {
                const error = new Error('shared quota');
                error.code = 'ai/free-tier-quota-exceeded';
                throw error;
            }
            return '日 can mean sun or day.';
        }
    };

    try {
        window.document.getElementById('aiSenseiModal').classList.add('show');
        window.document.getElementById('kanjiDrawer').classList.add('open');
        await app.askAISensei('What does 日 mean?');
        const chatLog = window.document.getElementById('aiChatLog');
        const notice = chatLog.querySelector('.ai-limit-notice');
        assert.ok(notice);
        assert.equal(notice.getAttribute('role'), 'group');
        assert.equal(notice.querySelector('[role="status"]').getAttribute('aria-live'), 'polite');
        assert.match(notice.textContent, /free AI Sensei limit/i);
        assert.match(notice.textContent, /provider may have its own limits or charges/i);

        const contact = notice.querySelector('a[href^="mailto:"]');
        assert.ok(contact);
        assert.match(contact.href, /^mailto:spsc\.mizu@gmail\.com\?subject=/);
        assert.equal(contact.href.includes('What%20does'), false);
        assert.equal(
            notice.querySelector('.ai-limit-notice__email').textContent,
            'spsc.mizu@gmail.com'
        );

        notice.querySelector('button').click();
        assert.equal(app.openedSettings, 1);
        assert.equal(
            window.document.getElementById('aiSenseiModal').classList.contains('show'),
            false
        );
        assert.equal(
            window.document.getElementById('kanjiDrawer').classList.contains('open'),
            false
        );

        configuredOwnKey = true;
        const retryButton = chatLog.querySelector('.ai-limit-notice__actions button:nth-child(2)');
        retryButton.click();
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(requests, 2);
        assert.match(chatLog.textContent, /日 can mean sun or day/);
        assert.equal(chatLog.querySelector('.ai-limit-notice'), null);
    } finally {
        dom.window.close();
    }
});

test('diagnostic quota fallback stays visible and offers an explicit retry', async () => {
    const { dom, window, app } = await setup();
    let attempts = 0;
    window.StorageManager = {
        getProgress: () => ({ mastered: ['日'], studied: ['日'], streak: 2 })
    };
    window.SRSEngine = {
        getRetentionStats: () => ({ retentionRate: 80, dueCount: 1, matureCount: 0 }),
        getWeakCards: () => []
    };
    window.AIManager = {
        analyzeStudyProfile: async () => {
            attempts++;
            return attempts === 1
                ? {
                      aiGenerated: false,
                      advice: 'Review 日 once more today.',
                      note: 'Local analysis is available.',
                      limitReached: true
                  }
                : { aiGenerated: true, commentary: 'A short personalized plan.' };
        }
    };

    try {
        await app.runAIDiagnosticAnalysis();
        const content = window.document.getElementById('aiDiagnosticContent');
        assert.match(content.textContent, /Review 日 once more today/);
        assert.ok(content.querySelector('.ai-limit-notice'));

        content.querySelector('.ai-limit-notice__actions button:nth-child(2)').click();
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(attempts, 2);
        assert.match(content.textContent, /A short personalized plan/);
        assert.equal(content.querySelector('.ai-limit-notice'), null);
    } finally {
        dom.window.close();
    }
});

test('kanji drawer mnemonic and etymology quota failures show the same safe options', async () => {
    const { dom, window, app } = await setup();
    const limitError = () => {
        const error = new Error('shared quota');
        error.code = 'ai/free-tier-quota-exceeded';
        return error;
    };
    window.StorageManager = {
        getAISettings: () => ({ provider: 'firebase', apiKey: '' }),
        getAICacheItem: () => null
    };
    window.AIManager = {
        isProviderConfigured: () => true,
        isFreeTierLimitError: (error) => error?.code === 'ai/free-tier-quota-exceeded',
        generateMnemonic: async () => {
            throw limitError();
        },
        explainEtymology: async () => {
            throw limitError();
        }
    };

    try {
        await app.loadDrawerMnemonic();
        const mnemonic = window.document.getElementById('drawerMnemonicContent');
        assert.ok(mnemonic.querySelector('.ai-limit-notice'));
        assert.ok(mnemonic.querySelector('a[href^="mailto:spsc.mizu@gmail.com"]'));

        app._drawerMnemonicInFlight = null;
        await app.loadDrawerEtymology();
        const etymology = window.document.getElementById('drawerEtymologyContent');
        assert.ok(etymology.querySelector('.ai-limit-notice'));
        assert.ok(etymology.querySelector('button'));
    } finally {
        dom.window.close();
    }
});

test('ordinary provider errors do not masquerade as a free-tier limit or render HTML', async () => {
    const { dom, window, app } = await setup();
    window.AIManager = {
        isFreeTierLimitError: (error) => error?.code === 'ai/free-tier-quota-exceeded',
        askSenseiQuestion: async () => {
            throw new Error('<img src=x onerror=alert(1)> connection failed');
        }
    };

    try {
        await app.askAISensei('Help me read 休');
        const output = window.document.querySelector('#aiChatLog .ai-request-error');
        assert.ok(output);
        assert.match(output.textContent, /<img src=x onerror=alert\(1\)> connection failed/);
        assert.equal(output.querySelector('img'), null);
        assert.equal(window.document.querySelector('.ai-limit-notice'), null);
    } finally {
        dom.window.close();
    }
});
