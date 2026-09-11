/**
 * Comprehensive Unit Tests for SRS Engine & AI Manager
 */
const assert = require('assert');

// Mock localStorage for Node.js environment
const mockStorage = {};
global.localStorage = {
    getItem: (key) => mockStorage[key] || null,
    setItem: (key, val) => {
        mockStorage[key] = String(val);
    },
    removeItem: (key) => {
        delete mockStorage[key];
    },
    clear: () => {
        Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
    }
};

const StorageManager = require('../storage-manager');
const SRSEngine = require('../srs-engine');
const AIManager = require('../ai-manager');

// Make globals available to test modules
global.StorageManager = StorageManager;
global.SRSEngine = SRSEngine;
global.AIManager = AIManager;

async function runTests() {
    console.log('🧪 Starting KanjiWidgets SRS & AI Unit Test Suite...\n');
    let passed = 0;
    let failed = 0;

    async function test(description, fn) {
        try {
            await fn();
            console.log(`  ✅ PASS: ${description}`);
            passed++;
        } catch (err) {
            console.error(`  ❌ FAIL: ${description}`);
            console.error(`     Error: ${err.message}\n`);
            failed++;
        }
    }

    // --- SECTION 1: StorageManager Tests ---
    console.log('--- 1. Storage Manager (SRS & AI Settings) ---');

    await test('StorageManager has SRS and AI keys defined', () => {
        assert.strictEqual(StorageManager.keys.SRS_DATA, 'kanji_srs_data');
        assert.strictEqual(StorageManager.keys.AI_SETTINGS, 'kanji_ai_settings');
        assert.strictEqual(StorageManager.keys.AI_CACHE, 'kanji_ai_cache');
    });

    await test('StorageManager default AI settings are initialized properly', () => {
        const settings = StorageManager.getAISettings();
        assert.strictEqual(settings.provider, 'gemini');
        assert.strictEqual(settings.model, 'gemini-1.5-flash');
        assert.strictEqual(settings.persona, 'encouraging');
    });

    await test('StorageManager AI settings update correctly', () => {
        StorageManager.updateAISetting('provider', 'openai');
        StorageManager.updateAISetting('model', 'gpt-4o-mini');
        const settings = StorageManager.getAISettings();
        assert.strictEqual(settings.provider, 'openai');
        assert.strictEqual(settings.model, 'gpt-4o-mini');
    });

    await test('StorageManager AI Cache set and get work', () => {
        StorageManager.setAICacheItem('mnemonic_木', 'A tree with deep roots.');
        const cached = StorageManager.getAICacheItem('mnemonic_木');
        assert(cached !== null);
        assert.strictEqual(cached.data, 'A tree with deep roots.');
    });

    // --- SECTION 1B: Phase 2 Drawer Cache Tests ---
    console.log('\n--- 1B. Phase 2 Drawer Cache (Mnemonic & Etymology) ---');

    await test('Mnemonic cache key uses correct format', () => {
        const kanji = { character: '水' };
        StorageManager.setAICacheItem(`mnemonic_${kanji.character}`, 'Water flows like a river.');
        const cached = StorageManager.getAICacheItem(`mnemonic_${kanji.character}`);
        assert(cached !== null);
        assert.strictEqual(cached.data, 'Water flows like a river.');
    });

    await test('Etymology cache key uses correct format', () => {
        const kanji = { character: '火' };
        StorageManager.setAICacheItem(`etymology_${kanji.character}`, 'Ancient pictograph of flames.');
        const cached = StorageManager.getAICacheItem(`etymology_${kanji.character}`);
        assert(cached !== null);
        assert.strictEqual(cached.data, 'Ancient pictograph of flames.');
    });

    await test('Mnemonic and etymology caches are independent', () => {
        const kanji = { character: '山' };
        StorageManager.setAICacheItem(`mnemonic_${kanji.character}`, 'Three peaks touching the sky.');
        StorageManager.setAICacheItem(`etymology_${kanji.character}`, 'Pictograph of mountain peaks.');
        const mCache = StorageManager.getAICacheItem(`mnemonic_${kanji.character}`);
        const eCache = StorageManager.getAICacheItem(`etymology_${kanji.character}`);
        assert.notStrictEqual(mCache.data, eCache.data);
        assert(mCache.data.includes('peaks'));
        assert(eCache.data.includes('Pictograph'));
    });

    await test('Cache invalidation clears both mnemonic and etymology', () => {
        const kanjiChar = '日';
        StorageManager.setAICacheItem(`mnemonic_${kanjiChar}`, 'Sun mnemonic');
        StorageManager.setAICacheItem(`etymology_${kanjiChar}`, 'Sun etymology');

        // Simulate refreshKanjiDrawer cache clear
        const cache = StorageManager.getItem(StorageManager.keys.AI_CACHE, {});
        delete cache[`mnemonic_${kanjiChar}`];
        delete cache[`etymology_${kanjiChar}`];
        StorageManager.setItem(StorageManager.keys.AI_CACHE, cache);

        assert.strictEqual(StorageManager.getAICacheItem(`mnemonic_${kanjiChar}`), null);
        assert.strictEqual(StorageManager.getAICacheItem(`etymology_${kanjiChar}`), null);
    });

    await test('AIManager generateMnemonic returns cached data on second call (no API key)', async () => {
        StorageManager.updateAISetting('apiKey', '');
        StorageManager.updateAISetting('provider', 'gemini');
        // Seed the cache to simulate a prior successful call
        StorageManager.setAICacheItem('mnemonic_月', 'A crescent moon glowing at night.');
        const result = await AIManager.generateMnemonic({ character: '月', meanings: ['moon'], onyomi: ['ゲツ'], kunyomi: ['つき'] });
        assert.strictEqual(result, 'A crescent moon glowing at night.');
    });

    await test('AIManager explainEtymology returns cached data on second call (no API key)', async () => {
        StorageManager.updateAISetting('apiKey', '');
        StorageManager.updateAISetting('provider', 'gemini');
        StorageManager.setAICacheItem('etymology_月', 'Pictograph of a crescent moon.');
        const result = await AIManager.explainEtymology({ character: '月', meanings: ['moon'] });
        assert.strictEqual(result, 'Pictograph of a crescent moon.');
    });

    // --- SECTION 2: SRSEngine SM-2 Logic Tests ---
    console.log('\n--- 2. SRS Engine SM-2 Spaced Repetition Logic ---');

    await test('SRSEngine creates clean card structure', () => {
        const card = SRSEngine.createCard('日', 'N5');
        assert.strictEqual(card.character, '日');
        assert.strictEqual(card.level, 'N5');
        assert.strictEqual(card.repetition, 0);
        assert.strictEqual(card.interval, 0);
        assert.strictEqual(card.easeFactor, 2.5);
        assert.strictEqual(card.lapses, 0);
    });
    await test('SRSEngine processes Grade 3 (Good) review progression', () => {
        // First review
        let card = SRSEngine.recordReview('日', 3, { level: 'N5' });
        assert.strictEqual(card.repetition, 1);
        assert.strictEqual(card.interval, 1);
        assert.strictEqual(card.totalReviews, 1);
        assert.strictEqual(card.correctReviews, 1);

        // Second review
        card = SRSEngine.recordReview('日', 3, { level: 'N5' });
        assert.strictEqual(card.repetition, 2);
        assert.strictEqual(card.interval, 3);

        // Third review (interval should scale by easeFactor)
        card = SRSEngine.recordReview('日', 3, { level: 'N5' });
        assert.strictEqual(card.repetition, 3);
        assert(card.interval >= 7);
    });

    await test('SRSEngine processes Grade 1 (Again / Lapse) properly', () => {
        // Record a failure on '月'
        const card = SRSEngine.recordReview('月', 1, { level: 'N5' });
        assert.strictEqual(card.repetition, 0);
        assert.strictEqual(card.interval, 0.5);
        assert.strictEqual(card.lapses, 1);
        assert(card.easeFactor < 2.5); // Ease factor lowered
    });

    await test('SRSEngine computes retention stats accurately', () => {
        const stats = SRSEngine.getRetentionStats('N5');
        assert(stats.totalTracked >= 2);
        assert(typeof stats.retentionRate === 'number');
        assert(typeof stats.averageEaseFactor === 'number');
    });

    await test('SRSEngine offline rule-based diagnostics detect lookalike traps', () => {
        const pool = [
            { character: '待', meanings: ['wait'] },
            { character: '持', meanings: ['hold'] },
            { character: '日', meanings: ['sun'] },
            { character: '目', meanings: ['eye'] }
        ];
        const progress = { mastered: ['日'], studied: ['日', '待'], currentLevel: 'N5' };
        const diag = SRSEngine.generateRuleBasedDiagnostics(progress, pool);

        assert.strictEqual(diag.source, 'algorithmic');
        assert(diag.lookalikeTraps.length > 0);
        assert(diag.lookalikeTraps.some((t) => t.kanji1 === '待' && t.kanji2 === '持'));
        assert(diag.priorityStudy.length > 0);
    });

    // --- SECTION 3: AIManager Tests ---
    console.log('\n--- 3. AI Manager Architecture & Multi-Provider Specs ---');

    await test('AIManager has defaults configured for all 5 providers', () => {
        const providers = ['gemini', 'openai', 'claude', 'openrouter', 'ollama'];
        providers.forEach((p) => {
            assert(AIManager.PROVIDER_DEFAULTS[p] !== undefined, `Missing provider ${p}`);
            assert(Array.isArray(AIManager.PROVIDER_DEFAULTS[p].models));
            assert(AIManager.PROVIDER_DEFAULTS[p].models.length > 0);
        });
    });

    await test('AIManager throws expected error when API Key is missing for required providers', async () => {
        StorageManager.updateAISetting('apiKey', '');
        StorageManager.updateAISetting('provider', 'openai');

        let threw = false;
        try {
            await AIManager.callProvider('Hello', 'System');
        } catch (e) {
            threw = true;
            assert(e.message.includes('API Key is required'));
        }
        assert(threw, 'Should have thrown missing API Key error');
    });

    await test('AIManager returns algorithmic fallback for diagnostics when key is empty', async () => {
        StorageManager.updateAISetting('apiKey', '');
        StorageManager.updateAISetting('provider', 'gemini');

        const pool = [{ character: '木', meanings: ['tree'] }];
        const progress = { mastered: [], studied: [], currentLevel: 'N5' };
        const stats = SRSEngine.getRetentionStats('N5');
        const weakCards = SRSEngine.getWeakCards('N5');

        const result = await AIManager.analyzeStudyProfile(progress, stats, weakCards, pool);
        assert.strictEqual(result.aiGenerated, false);
        assert(result.note.includes('local algorithmic diagnostic'));
    });

    console.log('\n========================================');
    console.log(`Summary: ${passed} passed, ${failed} failed.`);
    console.log('========================================\n');

    if (failed > 0) {
        process.exit(1);
    }
}

runTests();

