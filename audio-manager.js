class AudioManager {
    static synth = null;
    static isSupported = false;

    static init() {
        if ('speechSynthesis' in window) {
            this.synth = window.speechSynthesis;
            this.isSupported = true;
        } else {
            console.warn('Speech synthesis not supported in this browser');
            this.isSupported = false;
        }
    }

    static speak(text, lang = 'ja-JP') {
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
            utterance.rate = 0.8; // Slightly slower for learning
            utterance.pitch = 1.0;
            utterance.volume = 0.8;

            // Try to use Japanese voice if available
            const voices = this.synth.getVoices();
            const japaneseVoice = voices.find(voice => 
                voice.lang === 'ja-JP' || voice.lang.startsWith('ja')
            );

            if (japaneseVoice) {
                utterance.voice = japaneseVoice;
            }

            // Error handling
            utterance.onerror = (event) => {
                console.error('Speech synthesis error:', event.error);
            };

            utterance.onend = () => {
                console.log('Speech synthesis completed');
            };

            // Speak
            this.synth.speak(utterance);
            return true;

        } catch (error) {
            console.error('Error in speech synthesis:', error);
            return false;
        }
    }

    static stop() {
        if (this.synth) {
            this.synth.cancel();
        }
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

    static speakExample(word, reading) {
        if (reading) {
            return this.speak(reading);
        } else if (word) {
            return this.speak(word);
        }
        return false;
    }

    // Polite pronunciation with context
    static speakPolite(text) {
        // Add slight pause and more formal tone
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'ja-JP';
        utterance.rate = 0.7; // Slower
        utterance.pitch = 0.9; // Slightly lower pitch
        utterance.volume = 0.8;

        if (this.synth) {
            this.synth.speak(utterance);
            return true;
        }
        return false;
    }

    // Batch pronunciation for multiple items
    static async speakSequence(items, delay = 1000) {
        if (!this.isSupported || !items || items.length === 0) {
            return false;
        }

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            
            if (typeof item === 'string') {
                this.speak(item);
            } else if (item.text) {
                this.speak(item.text, item.lang || 'ja-JP');
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
        if (!this.isSupported) return false;
        
        const voices = this.synth.getVoices();
        return voices.some(voice => 
            voice.lang === 'ja-JP' || voice.lang.startsWith('ja')
        );
    }
}

// Initialize when script loads
document.addEventListener('DOMContentLoaded', () => {
    AudioManager.init();
    
    // Wait for voices to load
    AudioManager.waitForVoices().then(voices => {
        const japaneseVoices = voices.filter(voice => 
            voice.lang === 'ja-JP' || voice.lang.startsWith('ja')
        );
        
        if (japaneseVoices.length > 0) {
            console.log('Japanese TTS voices available:', japaneseVoices.length);
        } else {
            console.warn('No Japanese TTS voices found. Pronunciation may not work correctly.');
        }
    });
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AudioManager;
}
