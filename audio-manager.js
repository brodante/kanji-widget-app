class AudioManager {
    static synth = null;
    static isSupported = false;
    static audioCache = new Map();
    static isPlaying = false;
    static kanjiAliveApiKey = null;
    static kanjiDataCache = new Map();
    
    // Set your Kanji Alive API key here or via localStorage
    // Get one free at: https://rapidapi.com/KanjiAlive/api/learn-to-read-and-write-japanese-kanji
    static setApiKey(key) {
        this.kanjiAliveApiKey = key;
        if (key) {
            localStorage.setItem('kanjiAliveApiKey', key);
        }
    }
    // NEW: Fetch Premium Mnemonics and Human Audio from KanjiAlive
    static async fetchKanjiAliveData(character) {
        if (!this.kanjiAliveApiKey) return null;

        const cacheKey = `ka_${character}`;
        if (this.kanjiDataCache.has(cacheKey)) {
            return this.kanjiDataCache.get(cacheKey);
        }

        try {
            const response = await fetch(`https://kanjialive-api.p.rapidapi.com/api/public/kanji/${encodeURIComponent(character)}`, {
                method: 'GET',
                headers: {
                    'x-rapidapi-host': 'kanjialive-api.p.rapidapi.com',
                    'x-rapidapi-key': this.kanjiAliveApiKey
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.kanjiDataCache.set(cacheKey, data);
                return data;
            }
            return null;
        } catch (e) {
            console.warn('KanjiAlive Premium Fetch Error:', e);
            return null;
        }
    }

    static init() {
        if ('speechSynthesis' in window) {
            this.synth = window.speechSynthesis;
            this.isSupported = true;
            if (this.synth && typeof this.synth.onvoiceschanged === 'undefined') {
                this.synth.onvoiceschanged = () => {};
            }
        } else {
            console.warn('Speech synthesis not supported in this browser');
            this.isSupported = false;
        }
        
        // Load API key from localStorage if available
        const savedKey = localStorage.getItem('kanjiAliveApiKey');
        if (savedKey) {
            this.kanjiAliveApiKey = savedKey;
        }
    }

    // Fetch kanji data from Kanji Alive API
    static async fetchKanjiData(kanji) {
        const cacheKey = `kanji_${kanji}`;
        
        // Check cache first
        if (this.kanjiDataCache.has(cacheKey)) {
            return this.kanjiDataCache.get(cacheKey);
        }

        if (!this.kanjiAliveApiKey) {
            console.log('Kanji Alive API key not set. Using fallback audio methods.');
            return null;
        }

        try {
            const response = await fetch(`https://kanjialive-api.p.rapidapi.com/api/public/kanji/${kanji}`, {
                method: 'GET',
                headers: {
                    'x-rapidapi-key': this.kanjiAliveApiKey,
                    'x-rapidapi-host': 'kanjialive-api.p.rapidapi.com'
                }
            });

            if (!response.ok) throw new Error('Kanji not found');
            
            const data = await response.json();
            this.kanjiDataCache.set(cacheKey, data);
            return data;

        } catch (error) {
            console.warn(`Failed to fetch kanji data for ${kanji}:`, error);
            return null;
        }
    }

    // Play audio from Kanji Alive API (highest quality)
    static async playKanjiAliveAudio(audioUrl) {
        try {
            const cacheKey = `audio_${audioUrl}`;

            if (this.audioCache.has(cacheKey)) {
                const audio = this.audioCache.get(cacheKey);
                audio.currentTime = 0;
                this.isPlaying = true;
                await audio.play();
                return new Promise((resolve) => {
                    audio.onended = () => { this.isPlaying = false; resolve(true); };
                    audio.onerror = () => { resolve(false); };
                });
            }

            // FIREFOX FIX: Do not fetch as a blob first. Assigning the URL directly and 
            // playing it immediately preserves the "user gesture" security token.
            const audio = new Audio(audioUrl);
            this.audioCache.set(cacheKey, audio);

            return new Promise((resolve) => {
                // Safety timeout increased to 5s for slower connections
                const timeoutId = setTimeout(() => {
                    resolve(false);
                }, 5000);

                audio.onended = () => {
                    clearTimeout(timeoutId);
                    this.isPlaying = false;
                    resolve(true);
                };

                audio.onerror = (err) => {
                    clearTimeout(timeoutId);
                    console.warn('KanjiAlive audio network error:', err);
                    resolve(false);
                };

                this.isPlaying = true;

                // FIREFOX FIX: Play immediately!
                // FIREFOX FIX: Play immediately!
                audio.play().catch(playError => {
                    clearTimeout(timeoutId);

                    // NEW: Intercept Autoplay Policy Blocks
                    if (playError.name === 'NotAllowedError') {
                        console.warn('Browser blocked autoplay on refresh. Click anywhere to enable audio.');
                        resolve(true); // Fake success so it DOES NOT trigger the robotic fallback
                    } else {
                        console.warn('KanjiAlive playback intercepted:', playError);
                        resolve(false);
                    }
                });
            });

        } catch (error) {
            console.warn('Kanji Alive audio playback failed:', error);
            return false;
        }
    }

    static async speakWithGoogle(text, lang = 'ja') {
        try {
            const encodedText = encodeURIComponent(text);
            const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodedText}&tl=${lang}&client=gtx`;

            return new Promise((resolve) => {
                const audio = new Audio(url);

                // FIREFOX FIX: Increased timeout to 4 seconds. 2s was too fast and was 
                // causing the fallback to fire prematurely on slower connections.
                const timeoutId = setTimeout(() => {
                    console.warn('Google TTS timeout');
                    resolve(false);
                }, 4000);

                audio.onended = () => {
                    clearTimeout(timeoutId);
                    this.isPlaying = false;
                    resolve(true);
                };

                audio.onerror = (err) => {
                    clearTimeout(timeoutId);
                    console.warn('Direct media stream block:', err);
                    resolve(false);
                };

                this.isPlaying = true;

                // FIREFOX FIX: Do not wait for oncanplaythrough. Play immediately!
                audio.play().catch(playError => {
                    clearTimeout(timeoutId);

                    // NEW: Intercept Autoplay Policy Blocks
                    if (playError.name === 'NotAllowedError') {
                        console.warn('Browser blocked autoplay on refresh. Click anywhere to enable audio.');
                        resolve(true); // Fake success so it DOES NOT trigger the robotic fallback
                    } else {
                        console.warn('Playback intercepted by browser:', playError);
                        resolve(false);
                    }
                });
            });

        } catch (error) {
            console.warn('Google TTS failed, falling back to Web Speech API:', error);
            return this.speakFallback(text);
        }
    }

    static async waitForVoices(timeoutMs = 3000) {
        if (!this.isSupported || !this.synth) return [];

        const voices = this.synth.getVoices();
        if (voices.length > 0) return voices;

        return new Promise((resolve) => {
            const timeoutId = window.setTimeout(() => {
                this.synth.onvoiceschanged = null;
                resolve(this.synth.getVoices());
            }, timeoutMs);

            this.synth.onvoiceschanged = () => {
                window.clearTimeout(timeoutId);
                this.synth.onvoiceschanged = null;
                resolve(this.synth.getVoices());
            };
        });
    }

    static selectPreferredVoice(voices, lang = 'ja-JP') {
        if (!voices || voices.length === 0) return null;

        const japaneseVoices = voices.filter(voice => {
            const name = (voice.lang || '').toLowerCase();
            return name === 'ja-jp' || name.startsWith('ja');
        });

        // 1. Forcefully hunt down Premium Cloud Voices (Chrome's Google Voice or Edge's Natural Voice)
        let bestVoice = japaneseVoices.find(v => v.name === 'Google 日本語' || v.name.includes('Google') || v.name.includes('Online (Natural)'));

        // 2. Try Apple's premium Mac/iOS voices if on Apple devices
        if (!bestVoice) bestVoice = japaneseVoices.find(v => v.name.includes('Siri') || v.name.includes('Kyoko') || v.name.includes('Otoya'));

        // 3. Fallback to standard local voices
        return bestVoice || japaneseVoices[0] || voices[0] || null;
    }

    // Fallback to Web Speech API with proper Japanese voice selection
    static async speakFallback(text, lang = 'ja-JP') {
        if (!this.isSupported || !this.synth) {
            console.warn('Speech synthesis not available');
            return false;
        }

        try {
            this.synth.cancel();
            if (typeof this.synth.resume === 'function') {
                try { this.synth.resume(); } catch (resumeError) {
                    console.debug('Speech synthesis resume warning:', resumeError);
                }
            }

            const voices = await this.waitForVoices(3500);
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = lang;
            utterance.rate = 0.95;
            utterance.pitch = 1.0;
            utterance.volume = 1.0;

            const preferredVoice = this.selectPreferredVoice(voices, lang);
            if (preferredVoice) {
                utterance.voice = preferredVoice;
            }

            utterance.onerror = (event) => {
                console.error('Speech synthesis error:', event.error);
            };

            utterance.onend = () => {
                this.isPlaying = false;
            };

            this.isPlaying = true;
            this.synth.speak(utterance);
            return true;

        } catch (error) {
            console.error('Error in speech synthesis:', error);
            return false;
        }
    }

    static async speak(text, lang = 'ja-JP') {
        if (!text) return false;

        // Clean up dictionary boundary dots so the word flows naturally (e.g., まな.ぶ -> まなぶ)
        const cleanText = text.replace(/\./g, '');

        // Primary Tier: Force the premium Google Translate voice engine
        if (lang.startsWith('ja')) {
            const success = await this.speakWithGoogle(cleanText, 'ja');
            if (success) return true;
        }

        // Emergency Fallback: If network audio fails/blocks, drop back to local system speech
        return this.speakFallback(cleanText, lang);
    }

    // Enhanced method: Speak kanji reading with Kanji Alive API support
    static async speakKanjiWithAPI(kanjiCharacter, readingType = 'onyomi') {
        try {
            const kanjiData = await this.fetchKanjiData(kanjiCharacter);
            
            if (kanjiData && kanjiData.examples && kanjiData.examples.length > 0) {
                // Use first example's audio for better quality
                const example = kanjiData.examples[0];
                if (example.audio && example.audio.mp3) {
                    const success = await this.playKanjiAliveAudio(example.audio.mp3);
                    if (success) return true;
                }
            }
            
            // Fallback: Use reading text with Google TTS
            if (kanjiData && kanjiData.kanji) {
                const reading = readingType === 'kunyomi' 
                    ? kanjiData.kanji.kunyomi?.hiragana 
                    : kanjiData.kanji.onyomi?.katakana;
                
                if (reading) {
                    return await this.speakWithGoogle(reading, 'ja');
                }
            }
            
            return false;
        } catch (error) {
            console.warn('Kanji with API speak failed:', error);
            return false;
        }
    }

    static stop() {
        if (this.synth) {
            this.synth.cancel();
        }
        this.isPlaying = false;
    }

    static getAvailableVoices() {
        if (!this.isSupported) return [];
        
        return this.synth.getVoices().filter(voice => 
            voice.lang === 'ja-JP' || voice.lang.startsWith('ja')
        );
    }

    static async waitForVoices() {
        return new Promise((resolve) => {
            if (!this.isSupported) {
                resolve([]);
                return;
            }

            const voices = this.synth.getVoices();
            if (voices.length > 0) {
                resolve(voices);
                return;
            }

            // Wait for voices to load
            this.synth.onvoiceschanged = () => {
                resolve(this.synth.getVoices());
            };

            // Timeout after 5 seconds
            setTimeout(() => {
                resolve(this.synth.getVoices());
            }, 5000);
        });
    }

    static testPronunciation() {
        const testText = 'こんにちは'; // "Hello" in Japanese
        return this.speak(testText);
    }

    static speakKanjiReading(kanji, readings) {
        if (!readings || readings.length === 0) {
            console.warn('No readings provided for kanji:', kanji);
            return false;
        }

        // Use the first reading
        const reading = readings[0];
        return this.speak(reading);
    }

    // Enhanced: Get kanji readings from Kanji Alive API
    static async getKanjiReadingsFromAPI(kanjiCharacter) {
        try {
            const kanjiData = await this.fetchKanjiData(kanjiCharacter);
            
            if (!kanjiData || !kanjiData.kanji) return null;
            
            return {
                onyomi: kanjiData.kanji.onyomi?.hiragana || '',
                kunyomi: kanjiData.kanji.kunyomi?.hiragana || '',
                meaning: kanjiData.kanji.meaning?.english || '',
                examples: kanjiData.examples || []
            };
        } catch (error) {
            console.warn('Failed to get kanji readings from API:', error);
            return null;
        }
    }

    static speakExample(word, reading) {
        if (reading) {
            return this.speak(reading);
        } else if (word) {
            return this.speak(word);
        }
        return false;
    }

    // Polite pronunciation with context
    static async speakPolite(text) {
        return this.speak(text);
    }

    // Batch pronunciation for multiple items
    static async speakSequence(items, delay = 1000) {
        if (!items || items.length === 0) {
            return false;
        }

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            
            if (typeof item === 'string') {
                await this.speak(item);
            } else if (item.text) {
                await this.speak(item.text, item.lang || 'ja-JP');
            }

            // Wait between items
            if (i < items.length - 1) {
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        return true;
    }

    // Check if browser supports Japanese TTS
    static hasJapaneseSupport() {
        return true; // Google TTS always supports Japanese
    }
}

// Initialize when script loads
document.addEventListener('DOMContentLoaded', () => {
    AudioManager.init();
    
    // Log TTS initialization
    console.log('Japanese TTS initialized');
    console.log('Audio Priority: Kanji Alive API → Google Translate → Web Speech API');
    
    if (AudioManager.kanjiAliveApiKey) {
        console.log('✓ Kanji Alive API key detected - professional audio enabled');
    } else {
        console.log('ℹ Kanji Alive API key not set - using Google Translate and Web Speech fallbacks');
        console.log('To enable professional audio, set API key: AudioManager.setApiKey("your-key")');
    }
    
    // Wait for voices to load (for fallback)
    AudioManager.waitForVoices().then(voices => {
        const japaneseVoices = voices.filter(voice => 
            voice.lang === 'ja-JP' || voice.lang.startsWith('ja')
        );
        
        console.log('Available Japanese voices:', japaneseVoices.length);
    });
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AudioManager;
}
