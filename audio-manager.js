class AudioManager {
    static synth = null;
    static isSupported = false;
    static audioCache = new Map();

    // Local Database Variables
    static localAudioMap = new Map();
    static currentLoadedLevel = null;
    static isPlaying = false;

    static init() {
        if ('speechSynthesis' in window) {
            this.synth = window.speechSynthesis;
            this.isSupported = true;
            if (this.synth && typeof this.synth.onvoiceschanged === 'undefined') {
                this.synth.onvoiceschanged = () => { };
            }
        } else {
            console.warn('Speech synthesis not supported in this browser');
            this.isSupported = false;
        }
    }

    /**
     * DYNAMIC LOADER: Only loads the audio paths for the currently selected level.
     * Call this when the app starts, and whenever the user changes the level.
     */
    static async loadLevelAudio(level) {
        if (this.currentLoadedLevel === level) return; // Prevent redundant loading

        try {
            // UPDATED PATH: Pointing to the new tts folder
            const response = await fetch('tts/audio_index.json');
            if (!response.ok) throw new Error('Index file missing');
            const index = await response.json();

            // 1. Clear the old level's data from memory
            this.localAudioMap.clear();

            // 2. Determine the folder prefix based on the selected level
            let folderPrefix = level; // "Hiragana" or "Katakana"
            if (level !== 'Hiragana' && level !== 'Katakana') {
                folderPrefix = `Kanji/${level}`; // e.g., "Kanji/N5"
            }

            // 3. Scan the index and ONLY load items that belong in this folder
            for (const [char, data] of Object.entries(index)) {

                // Check if this character's audio lives in the target folder
                let isMatch = false;
                if (data.character_audio && data.character_audio.startsWith(folderPrefix)) isMatch = true;
                else if (Object.values(data.examples || {})[0]?.startsWith(folderPrefix)) isMatch = true;
                else if (Object.values(data.onyomi || {})[0]?.startsWith(folderPrefix)) isMatch = true;

                // If it belongs to this level, flatten its data into the instant-lookup map
                if (isMatch) {
                    if (data.character_audio) {
                        this.localAudioMap.set(char, data.character_audio);
                    }

                    // Clean the dots/hyphens for reliable matching
                    const clean = (text) => text.replace(/\./g, '').replace(/-/g, '');

                    for (const [reading, path] of Object.entries(data.onyomi || {})) {
                        this.localAudioMap.set(clean(reading), path);
                    }
                    for (const [reading, path] of Object.entries(data.kunyomi || {})) {
                        this.localAudioMap.set(clean(reading), path);
                    }
                    for (const [word, path] of Object.entries(data.examples || {})) {
                        this.localAudioMap.set(clean(word), path);
                    }
                }
            }

            this.currentLoadedLevel = level;
            console.log(`Audio Engine: Switched to [${level}]. Loaded ${this.localAudioMap.size} local MP3 paths.`);
        } catch (error) {
            console.warn('Failed to load local audio index. Will rely on robot fallback:', error);
        }
    }

    /**
     * MAIN PLAYBACK METHOD
     */
    static async speak(text, lang = 'ja-JP') {
        if (!text) return false;

        // Clean text to match the dictionary keys
        const cleanText = text.replace(/\./g, '').replace(/-/g, '');
        const relativePath = this.localAudioMap.get(cleanText);

        if (relativePath) {
            // UPDATED PATH: Pointing to the new tts folder structure
            const fullPath = `tts/audio/${relativePath}`;
            const success = await this.playStaticAudio(fullPath);

            if (!success) {
                console.warn(`Local audio blocked or missing for: ${cleanText}. Using fallback.`);
                return await this.speakFallback(cleanText, lang);
            }
            return true;
        } else {
            console.warn(`No local audio found for: ${cleanText}. Using fallback.`);
            return await this.speakFallback(cleanText, lang);
        }
    }

    /**
     * PLAYS THE LOCAL MP3 FILE
     */
    static async playStaticAudio(audioUrl) {
        return new Promise((resolve) => {
            const cacheKey = `static_${audioUrl}`;

            if (this.audioCache.has(cacheKey)) {
                const audio = this.audioCache.get(cacheKey);
                audio.currentTime = 0;
                this.isPlaying = true;

                audio.play().then(() => resolve(true)).catch(err => {
                    if (err.name === 'NotAllowedError') resolve(true);
                    else resolve(false);
                });
                audio.onended = () => { this.isPlaying = false; };
                return;
            }

            const audio = new Audio(audioUrl);
            const timeoutId = setTimeout(() => resolve(false), 2000);

            audio.onended = () => { this.isPlaying = false; resolve(true); };
            audio.onerror = () => { clearTimeout(timeoutId); resolve(false); };

            this.isPlaying = true;
            audio.play().then(() => {
                clearTimeout(timeoutId);
                this.audioCache.set(cacheKey, audio);
            }).catch(err => {
                clearTimeout(timeoutId);
                if (err.name === 'NotAllowedError') resolve(true);
                else resolve(false);
            });
        });
    }

    /**
     * ROBOTIC FALLBACK (Web Speech API)
     */
    static async speakFallback(text, lang = 'ja-JP') {
        if (!this.isSupported || !this.synth) return false;

        try {
            this.synth.cancel();
            const voices = await this.waitForVoices();
            const utterance = new SpeechSynthesisUtterance(text);

            utterance.lang = lang;
            utterance.rate = 0.95;

            // Find best Japanese voice
            const jpVoices = voices.filter(v => v.lang.startsWith('ja'));
            const bestVoice = jpVoices.find(v => v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Siri'));
            if (bestVoice || jpVoices[0]) utterance.voice = bestVoice || jpVoices[0];

            utterance.onend = () => { this.isPlaying = false; };

            this.isPlaying = true;
            this.synth.speak(utterance);
            return true;
        } catch (error) {
            console.error('Fallback speech failed:', error);
            return false;
        }
    }

    static async waitForVoices(timeoutMs = 3000) {
        if (!this.isSupported) return [];
        let voices = this.synth.getVoices();
        if (voices.length > 0) return voices;
        return new Promise((resolve) => {
            const timeoutId = setTimeout(() => resolve(this.synth.getVoices()), timeoutMs);
            this.synth.onvoiceschanged = () => {
                clearTimeout(timeoutId);
                resolve(this.synth.getVoices());
            };
        });
    }

    static stop() {
        if (this.synth) this.synth.cancel();
        this.isPlaying = false;
    }

    // Legacy wrappers to ensure the rest of your app doesn't break
    static speakExample(word, reading) { return this.speak(reading || word); }
    static speakKanjiReading(kanji, readings) { return readings && readings.length > 0 ? this.speak(readings[0]) : false; }
    static async speakPolite(text) { return this.speak(text); }
    static hasJapaneseSupport() { return true; }
}

document.addEventListener('DOMContentLoaded', () => {
    AudioManager.init();
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = AudioManager;
}