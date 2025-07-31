class KanjiData {
    static cache = new Map();
    static baseUrl = 'https://jisho.org/api/v1/search/words';
    
    // Fallback kanji data for different JLPT levels
    static fallbackData = {
        'N5': [
            {
                character: '人',
                meanings: ['person', 'human'],
                onyomi: ['ジン', 'ニン'],
                kunyomi: ['ひと'],
                jlpt: 'N5',
                examples: [
                    { word: '人間', reading: 'にんげん', meaning: 'human being' },
                    { word: '日本人', reading: 'にほんじん', meaning: 'Japanese person' }
                ]
            },
            {
                character: '日',
                meanings: ['day', 'sun'],
                onyomi: ['ニチ', 'ジツ'],
                kunyomi: ['ひ', 'か'],
                jlpt: 'N5',
                examples: [
                    { word: '今日', reading: 'きょう', meaning: 'today' },
                    { word: '日本', reading: 'にほん', meaning: 'Japan' }
                ]
            },
            {
                character: '本',
                meanings: ['book', 'origin', 'main'],
                onyomi: ['ホン'],
                kunyomi: ['もと'],
                jlpt: 'N5',
                examples: [
                    { word: '本', reading: 'ほん', meaning: 'book' },
                    { word: '日本', reading: 'にほん', meaning: 'Japan' }
                ]
            },
            {
                character: '学',
                meanings: ['study', 'learning', 'science'],
                onyomi: ['ガク'],
                kunyomi: ['まな'],
                jlpt: 'N5',
                examples: [
                    { word: '学校', reading: 'がっこう', meaning: 'school' },
                    { word: '学生', reading: 'がくせい', meaning: 'student' }
                ]
            },
            {
                character: '生',
                meanings: ['life', 'birth', 'genuine'],
                onyomi: ['セイ', 'ショウ'],
                kunyomi: ['い', 'う', 'なま'],
                jlpt: 'N5',
                examples: [
                    { word: '学生', reading: 'がくせい', meaning: 'student' },
                    { word: '先生', reading: 'せんせい', meaning: 'teacher' }
                ]
            },
            {
                character: '時',
                meanings: ['time', 'hour'],
                onyomi: ['ジ'],
                kunyomi: ['とき'],
                jlpt: 'N5',
                examples: [
                    { word: '時間', reading: 'じかん', meaning: 'time' },
                    { word: '何時', reading: 'なんじ', meaning: 'what time' }
                ]
            },
            {
                character: '見',
                meanings: ['see', 'look', 'watch'],
                onyomi: ['ケン'],
                kunyomi: ['み'],
                jlpt: 'N5',
                examples: [
                    { word: '見る', reading: 'みる', meaning: 'to see' },
                    { word: '意見', reading: 'いけん', meaning: 'opinion' }
                ]
            },
            {
                character: '行',
                meanings: ['go', 'conduct', 'carry out'],
                onyomi: ['コウ', 'ギョウ'],
                kunyomi: ['い', 'ゆ'],
                jlpt: 'N5',
                examples: [
                    { word: '行く', reading: 'いく', meaning: 'to go' },
                    { word: '銀行', reading: 'ぎんこう', meaning: 'bank' }
                ]
            },
            {
                character: '来',
                meanings: ['come', 'next'],
                onyomi: ['ライ'],
                kunyomi: ['く', 'き'],
                jlpt: 'N5',
                examples: [
                    { word: '来る', reading: 'くる', meaning: 'to come' },
                    { word: '来年', reading: 'らいねん', meaning: 'next year' }
                ]
            },
            {
                character: '車',
                meanings: ['car', 'vehicle', 'wheel'],
                onyomi: ['シャ'],
                kunyomi: ['くるま'],
                jlpt: 'N5',
                examples: [
                    { word: '車', reading: 'くるま', meaning: 'car' },
                    { word: '電車', reading: 'でんしゃ', meaning: 'train' }
                ]
            }
        ],
        'N4': [
            {
                character: '思',
                meanings: ['think', 'thought'],
                onyomi: ['シ'],
                kunyomi: ['おも'],
                jlpt: 'N4',
                examples: [
                    { word: '思う', reading: 'おもう', meaning: 'to think' },
                    { word: '思想', reading: 'しそう', meaning: 'thought, idea' }
                ]
            },
            {
                character: '言',
                meanings: ['say', 'word', 'speech'],
                onyomi: ['ゲン', 'ゴン'],
                kunyomi: ['い', 'こと'],
                jlpt: 'N4',
                examples: [
                    { word: '言う', reading: 'いう', meaning: 'to say' },
                    { word: '言葉', reading: 'ことば', meaning: 'word, language' }
                ]
            },
            {
                character: '考',
                meanings: ['think', 'consider'],
                onyomi: ['コウ'],
                kunyomi: ['かんが'],
                jlpt: 'N4',
                examples: [
                    { word: '考える', reading: 'かんがえる', meaning: 'to think' },
                    { word: '考え', reading: 'かんがえ', meaning: 'thought, idea' }
                ]
            }
        ],
        'N3': [
            {
                character: '理',
                meanings: ['logic', 'reason', 'truth'],
                onyomi: ['リ'],
                kunyomi: [],
                jlpt: 'N3',
                examples: [
                    { word: '理由', reading: 'りゆう', meaning: 'reason' },
                    { word: '料理', reading: 'りょうり', meaning: 'cooking' }
                ]
            }
        ],
        'N2': [
            {
                character: '議',
                meanings: ['deliberation', 'consultation', 'debate'],
                onyomi: ['ギ'],
                kunyomi: [],
                jlpt: 'N2',
                examples: [
                    { word: '会議', reading: 'かいぎ', meaning: 'meeting' },
                    { word: '議論', reading: 'ぎろん', meaning: 'discussion' }
                ]
            }
        ],
        'N1': [
            {
                character: '憲',
                meanings: ['constitution', 'law'],
                onyomi: ['ケン'],
                kunyomi: [],
                jlpt: 'N1',
                examples: [
                    { word: '憲法', reading: 'けんぽう', meaning: 'constitution' },
                    { word: '立憲', reading: 'りっけん', meaning: 'constitutional' }
                ]
            }
        ]
    };

    static async getKanjiByLevel(level = 'N5') {
        const cacheKey = `level_${level}`;
        
        // Return cached data if available
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        try {
            // First try to use fallback data
            let kanjiList = this.fallbackData[level] || this.fallbackData['N5'];
            
            // Try to enhance with Jisho API data
            const enhancedKanji = await Promise.all(
                kanjiList.map(async (kanji) => {
                    try {
                        const enhanced = await this.fetchKanjiFromJisho(kanji.character);
                        return enhanced || kanji;
                    } catch (error) {
                        console.warn(`Failed to enhance kanji ${kanji.character}:`, error);
                        return kanji;
                    }
                })
            );

            // Cache the result
            this.cache.set(cacheKey, enhancedKanji);
            return enhancedKanji;

        } catch (error) {
            console.error('Error loading kanji data:', error);
            // Return fallback data on error
            const fallback = this.fallbackData[level] || this.fallbackData['N5'];
            this.cache.set(cacheKey, fallback);
            return fallback;
        }
    }

    static async fetchKanjiFromJisho(character) {
        try {
            const response = await fetch(`${this.baseUrl}?keyword=${encodeURIComponent(character)}`);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            
            if (!data.data || data.data.length === 0) {
                return null;
            }

            // Find the entry that contains our kanji character
            const entry = data.data.find(item => 
                item.japanese.some(jp => jp.word && jp.word.includes(character))
            );

            if (!entry) {
                return null;
            }

            // Extract kanji information
            const japanese = entry.japanese[0];
            const senses = entry.senses[0];
            
            return {
                character: character,
                meanings: senses.english_definitions || [],
                onyomi: this.extractReadings(entry.japanese, 'on') || [],
                kunyomi: this.extractReadings(entry.japanese, 'kun') || [],
                examples: this.extractExamples(data.data.slice(0, 3), character),
                jlpt: this.extractJLPTLevel(entry.tags) || 'N5'
            };

        } catch (error) {
            console.error(`Error fetching kanji ${character} from Jisho:`, error);
            return null;
        }
    }

    static extractReadings(japaneseEntries, type) {
        const readings = [];
        
        japaneseEntries.forEach(entry => {
            if (entry.reading) {
                // This is a simplified approach - in reality, determining
                // on'yomi vs kun'yomi is more complex
                if (type === 'on') {
                    // On'yomi are typically in katakana or shorter
                    if (entry.reading.length <= 3 || /[ァ-ヴ]/.test(entry.reading)) {
                        readings.push(entry.reading);
                    }
                } else {
                    // Kun'yomi are typically longer or in hiragana
                    if (entry.reading.length > 3 && !/[ァ-ヴ]/.test(entry.reading)) {
                        readings.push(entry.reading);
                    }
                }
            }
        });

        return [...new Set(readings)]; // Remove duplicates
    }

    static extractExamples(entries, character) {
        const examples = [];
        
        entries.forEach(entry => {
            entry.japanese.forEach(jp => {
                if (jp.word && jp.word.includes(character) && jp.reading) {
                    const meanings = entry.senses[0]?.english_definitions || [];
                    examples.push({
                        word: jp.word,
                        reading: jp.reading,
                        meaning: meanings.slice(0, 2).join(', ')
                    });
                }
            });
        });

        return examples.slice(0, 3); // Limit to 3 examples
    }

    static extractJLPTLevel(tags) {
        if (!tags) return null;
        
        const jlptTag = tags.find(tag => tag.startsWith('jlpt-'));
        if (jlptTag) {
            return jlptTag.replace('jlpt-', '').toUpperCase();
        }
        
        return null;
    }

    static async searchKanji(query) {
        try {
            const response = await fetch(`${this.baseUrl}?keyword=${encodeURIComponent(query)}`);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            return data.data || [];

        } catch (error) {
            console.error('Error searching kanji:', error);
            return [];
        }
    }

    static getRandomKanji(level = 'N5') {
        const kanjiList = this.fallbackData[level] || this.fallbackData['N5'];
        return kanjiList[Math.floor(Math.random() * kanjiList.length)];
    }

    static getAllLevels() {
        return Object.keys(this.fallbackData);
    }

    static getKanjiCount(level = 'N5') {
        return (this.fallbackData[level] || []).length;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = KanjiData;
}
