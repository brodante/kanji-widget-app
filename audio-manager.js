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

    static init() {
        if ('speechSynthesis' in window) {
            this.synth = window.speechSynthesis;
            this.isSupported = true;
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
                audio.onended = () => { this.isPlaying = false; };
                return true;
            }

            const response = await fetch(audioUrl);
            if (!response.ok) throw new Error('Failed to fetch audio');

            const blob = await response.blob();
            const audioObjectUrl = URL.createObjectURL(blob);
            const audio = new Audio(audioObjectUrl);
            
            this.audioCache.set(cacheKey, audio);

            this.isPlaying = true;
            await audio.play();
            audio.onended = () => { this.isPlaying = false; };
            return true;

        } catch (error) {
            console.warn('Kanji Alive audio playback failed:', error);
            return false;
        }
    }

    // Use Google Translate TTS endpoint as fallback
    static async speakWithGoogle(text, lang = 'ja') {
        try {
            const cacheKey = `${text}_${lang}`;
            
            // Check cache first
            if (this.audioCache.has(cacheKey)) {
                const audio = this.audioCache.get(cacheKey);
                audio.currentTime = 0;
                this.isPlaying = true;
                await audio.play();
                audio.onended = () => { this.isPlaying = false; };
                return true;
            }

            // Use Google Translate TTS API
            const encodedText = encodeURIComponent(text);
            const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodedText}&tl=${lang}&client=tw-ob`;

            const response = await fetch(url);
            if (!response.ok) throw new Error('Failed to fetch audio');

            const blob = await response.blob();
            const audioUrl = URL.createObjectURL(blob);
            const audio = new Audio(audioUrl);
            
            this.audioCache.set(cacheKey, audio);

            this.isPlaying = true;
            await audio.play();
            audio.onended = () => { this.isPlaying = false; };

            return true;

        } catch (error) {
            console.warn('Google TTS failed, falling back to Web Speech API:', error);
            return this.speakFallback(text);
        }
    }

    // Fallback to Web Speech API with proper Japanese voice selection
    static speakFallback(text, lang = 'ja-JP') {
        if (!this.isSupported || !this.synth) {
            console.warn('Speech synthesis not available');
            return false;
        }

        try {
            // Cancel any ongoing speech
            this.synth.cancel();

            // Create utterance
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = lang;
            utterance.rate = 0.85;
            utterance.pitch = 1.0;
            utterance.volume = 1.0;

            // Get all voices and prefer Japanese
            const voices = this.synth.getVoices();
            
            // Try multiple strategies to find Japanese voice
            let selectedVoice = null;
            
            // Strategy 1: Exact lang match
            selectedVoice = voices.find(v => v.lang === 'ja-JP' && v.name.includes('Google'));
            
            // Strategy 2: Any Japanese voice
            if (!selectedVoice) {
                selectedVoice = voices.find(v => v.lang === 'ja-JP');
            }
            
            // Strategy 3: Japanese lang prefix
            if (!selectedVoice) {
                selectedVoice = voices.find(v => v.lang.startsWith('ja'));
            }

            if (selectedVoice) {
                utterance.voice = selectedVoice;
                console.log('Using voice:', selectedVoice.name, selectedVoice.lang);
            }

            utterance.onerror = (event) => {
                console.error('Speech synthesis error:', event.error);
            };

            utterance.onend = () => {
                console.log('Speech synthesis completed');
            };

            this.synth.speak(utterance);
            return true;

        } catch (error) {
            console.error('Error in speech synthesis:', error);
            return false;
        }
    }

    static speak(text, lang = 'ja-JP') {
        // Try with Google TTS as primary (since Kanji Alive needs API key)
        return this.speakWithGoogle(text, 'ja');
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
