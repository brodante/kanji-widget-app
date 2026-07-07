/**
 * Kanji Alive API Setup Helper
 * Load this script to easily configure your API key
 * 
 * Usage in browser console:
 * setupKanjiAudio()
 */

function setupKanjiAudio() {
    console.clear();
    console.log('%c🎌 Kanji Widget - Audio Setup', 'font-size: 18px; font-weight: bold; color: #6200EE;');
    console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #999;');
    
    console.log('\n📝 Current Status:');
    
    if (AudioManager && AudioManager.kanjiAliveApiKey) {
        console.log('%c✓ Kanji Alive API Key: SET', 'color: green; font-weight: bold;');
        console.log('   Quality: Professional studio audio ⭐⭐⭐⭐⭐');
    } else {
        console.log('%c✗ Kanji Alive API Key: NOT SET', 'color: orange; font-weight: bold;');
        console.log('   Quality: Google TTS (still very good) ⭐⭐⭐⭐');
    }
    
    console.log('\n📚 To Enable Professional Audio (Optional):');
    console.log('%c1. Get a free API key at: https://rapidapi.com/KanjiAlive/api/learn-to-read-and-write-japanese-kanji', 'color: #0066cc;');
    console.log('%c2. Subscribe (free tier available)', 'color: #0066cc;');
    console.log('%c3. Copy your API key and run:', 'color: #0066cc;');
    console.log('%cAudioManager.setApiKey("your-api-key-here")', 'background: #f0f0f0; padding: 8px; border-radius: 4px; font-family: monospace; color: #333;');
    
    console.log('\n✨ Or paste this and run:');
    console.log('%cconst apiKey = prompt("Enter your Kanji Alive API key:"); AudioManager.setApiKey(apiKey);', 'background: #f0f0f0; padding: 8px; border-radius: 4px; font-family: monospace; color: #333;');
    
    console.log('\n🔍 Testing Functions:');
    console.log('%caudioQualityTest()', 'background: #f0f0f0; padding: 4px 8px; border-radius: 3px; font-family: monospace; color: #333;');
    console.log('   Test audio playback with each method\n');
}

async function audioQualityTest() {
    console.log('%c🎵 Audio Quality Test', 'font-size: 14px; font-weight: bold; color: #6200EE;');
    console.log('Testing pronunciation of: こんにちは (Konnichiwa)');
    console.log('');
    
    // Test 1: Web Speech API
    console.log('1️⃣  Web Speech API (Fallback)...');
    AudioManager.speakFallback('こんにちは', 'ja-JP');
    await new Promise(r => setTimeout(r, 2500));
    
    // Test 2: Google TTS
    console.log('2️⃣  Google Translate TTS (Primary)...');
    await AudioManager.speakWithGoogle('こんにちは', 'ja');
    await new Promise(r => setTimeout(r, 2500));
    
    // Test 3: Kanji Alive (if available)
    if (AudioManager.kanjiAliveApiKey) {
        console.log('3️⃣  Kanji Alive API (Premium)...');
        const result = await AudioManager.speakKanjiWithAPI('日', 'onyomi');
        if (result) {
            console.log('%c✓ Kanji Alive audio works!', 'color: green;');
        }
    } else {
        console.log('%c❌ Kanji Alive API not configured (run setupKanjiAudio() to enable)', 'color: orange;');
    }
}

// Auto-run on load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupKanjiAudio);
} else {
    setupKanjiAudio();
}
