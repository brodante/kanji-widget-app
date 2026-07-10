class AudioManager {
    static synth = null;
    static isSupported = false;
    static audioCache = new Map();
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
            console.warn('Speech synthesis not supported');
            this.isSupported = false;
        }
    }

    static async loadLevelAudio(level, kanjiPool = []) {
        // Prevent reloading if we already have the data
        if (this.currentLoadedLevel === level && this.localAudioMap.size > 0) return;

        this.localAudioMap.clear();

        if (kanjiPool && kanjiPool.length > 0) {
            const clean = (text) => text.replace(/\./g, '').replace(/-/g, '');

            for (const kanji of kanjiPool) {
                // 1. Base Character (Specifically for Hiragana/Katakana)
                if (kanji.character_audio) {
                    this.localAudioMap.set(clean(kanji.character), kanji.character_audio);
                }

                // 2. Onyomi & Kunyomi Readings
                if (kanji.audio) {
                    for (const [reading, path] of Object.entries(kanji.audio.onyomi || {})) {
                        this.localAudioMap.set(clean(reading), path);
                    }
                    for (const [reading, path] of Object.entries(kanji.audio.kunyomi || {})) {
                        this.localAudioMap.set(clean(reading), path);
                    }
                }

                // 3. Example Words (Key must be the word itself)
                if (kanji.examples) {
                    for (const ex of kanji.examples) {
                        if (ex.audio) {
                            this.localAudioMap.set(clean(ex.word), ex.audio);
                        }
                    }
                }
            }
            console.log(`Audio Engine: Switched to [${level}]. Loaded ${this.localAudioMap.size} embedded MP3 paths.`);
        } else {
            console.warn("Audio Engine: kanjiPool was empty or not provided!");
        }

        this.currentLoadedLevel = level;
    }

    static async speak(text, lang = 'ja-JP') {
        if (!text) return false;

        const cleanText = text.replace(/\./g, '').replace(/-/g, '');
        const relativePath = this.localAudioMap.get(cleanText);

        if (relativePath) {
            // Uses the professional assets/ folder structure
            const fullPath = `assets/audio/${relativePath}`;
            const success = await this.playStaticAudio(fullPath);

            if (!success) {
                console.warn(`Local audio failed for: ${cleanText}. Using fallback.`);
                return await this.speakFallback(cleanText, lang);
            }
            return true;
        } else {
            console.warn(`No local audio found for: ${cleanText}. Using fallback.`);
            return await this.speakFallback(cleanText, lang);
        }
    }

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

    static async speakFallback(text, lang = 'ja-JP') {
        if (!this.isSupported || !this.synth) return false;
        try {
            this.synth.cancel();
            const voices = await this.waitForVoices();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = lang;
            utterance.rate = 0.95;

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

    static setApiKey(key) { }
}

document.addEventListener('DOMContentLoaded', () => {
    AudioManager.init();
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = AudioManager;
}