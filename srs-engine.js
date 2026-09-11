/**
 * Spaced Repetition System (SRS) Engine for KanjiWidgets
 * Implements an enhanced SM-2 algorithm tailored for Kanji & Kana acquisition.
 */
class SRSEngine {
    static DEFAULT_EASE_FACTOR = 2.5;
    static MIN_EASE_FACTOR = 1.3;

    // Standard Lookalike Kanji Matrix for confusion analysis
    static LOOKALIKE_PAIRS = [
        { pair: ['日', '目'], reason: 'Extra horizontal stroke in eye (目) vs sun (日)' },
        {
            pair: ['土', '士'],
            reason: 'Bottom stroke length: Earth (土) longer bottom vs Samurai (士) longer top'
        },
        {
            pair: ['末', '未'],
            reason: 'Top stroke length: End (末) longer top vs Not yet (未) longer second'
        },
        {
            pair: ['待', '持'],
            reason: 'Radical distinction: Person walking (彳 - 待) vs Hand (扌 - 持)'
        },
        { pair: ['木', '本', '休'], reason: 'Radical derivation from tree (木)' },
        { pair: ['買', '貝'], reason: 'Net radical (罒) atop shell (貝) means to buy (買)' },
        {
            pair: ['千', '干'],
            reason: 'Slanted top tick in thousand (千) vs flat top in shield/dry (干)'
        },
        {
            pair: ['右', '左'],
            reason: 'Stroke order difference and radical: mouth (口) in right vs work (工) in left'
        },
        {
            pair: ['天', '夫'],
            reason: 'Top stroke penetrates top in husband (夫) vs flat top in heaven (天)'
        },
        {
            pair: ['人', '入'],
            reason: 'Left stroke overlaps in person (人) vs right stroke overlaps in enter (入)'
        },
        {
            pair: ['牛', '午'],
            reason: 'Top vertical stroke penetrates top line in cow (牛) vs noon (午)'
        },
        {
            pair: ['白', '百'],
            reason: 'Top horizontal stroke transforms white (白) into hundred (百)'
        },
        { pair: ['石', '右'], reason: 'Top overhang in stone (石) vs right (右)' },
        {
            pair: ['大', '犬', '太'],
            reason: 'Dot position differences: dog (犬) top-right vs fat (太) bottom-center'
        }
    ];

    /**
     * Creates a default SRS card template.
     */
    static createCard(character, level = 'N5') {
        const now = Date.now();
        return {
            character: character,
            level: level,
            repetition: 0,
            interval: 0, // In days
            easeFactor: this.DEFAULT_EASE_FACTOR,
            lastReviewed: null,
            dueDate: now,
            lapses: 0,
            totalReviews: 0,
            correctReviews: 0,
            history: [],
            weaknessType: null // 'visual', 'reading', 'meaning'
        };
    }

    /**
     * Retrieves an SRS card for a specific character from StorageManager.
     */
    static getCard(character, level = 'N5') {
        const srsData = StorageManager.getItem(StorageManager.keys.SRS_DATA, {});
        if (!srsData[character]) {
            return this.createCard(character, level);
        }
        return srsData[character];
    }

    /**
     * Saves an SRS card.
     */
    static saveCard(card) {
        const srsData = StorageManager.getItem(StorageManager.keys.SRS_DATA, {});
        srsData[card.character] = card;
        return StorageManager.setItem(StorageManager.keys.SRS_DATA, srsData);
    }

    /**
     * Returns all saved SRS cards as a key-value dictionary.
     */
    static getAllCards() {
        return StorageManager.getItem(StorageManager.keys.SRS_DATA, {});
    }

    /**
     * Processes an active recall review using the SM-2 algorithm.
     * @param {string} character - The kanji character
     * @param {number} grade - User rating: 1 (Again), 2 (Hard), 3 (Good), 4 (Easy)
     * @param {Object} options - Optional metadata { level, weaknessType, timeSpentMs }
     */
    static recordReview(character, grade, options = {}) {
        const card = this.getCard(character, options.level || 'N5');
        const now = Date.now();
        const oneDayMs = 24 * 60 * 60 * 1000;

        card.totalReviews += 1;
        card.lastReviewed = now;
        if (options.level) {
            card.level = options.level;
        }
        if (options.weaknessType) {
            card.weaknessType = options.weaknessType;
        }

        // Clamp grade to 1..4
        const clampedGrade = Math.max(1, Math.min(4, Math.round(grade)));

        if (clampedGrade >= 3) {
            // Success
            card.correctReviews += 1;
            if (card.repetition === 0) {
                card.interval = 1;
            } else if (card.repetition === 1) {
                card.interval = clampedGrade === 4 ? 6 : 3;
            } else {
                const modifier = clampedGrade === 4 ? 1.3 : 1.0;
                card.interval = Math.max(1, Math.round(card.interval * card.easeFactor * modifier));
            }
            card.repetition += 1;
        } else {
            // Failure (Again / Hard)
            card.repetition = 0;
            card.interval = clampedGrade === 2 ? 1 : 0.5; // Review again in 12h or 1 day
            card.lapses += 1;
        }

        // Adjust Ease Factor (SM-2 standard formula adjusted for 1-4 scale)
        // Mapping: 1 -> 0, 2 -> 2, 3 -> 4, 4 -> 5
        const sm2Score =
            clampedGrade === 1 ? 0 : clampedGrade === 2 ? 2 : clampedGrade === 3 ? 4 : 5;
        const efDelta = 0.1 - (5 - sm2Score) * (0.08 + (5 - sm2Score) * 0.02);
        card.easeFactor = Math.max(
            this.MIN_EASE_FACTOR,
            Number((card.easeFactor + efDelta).toFixed(3))
        );

        // Compute next due date
        card.dueDate = now + Math.round(card.interval * oneDayMs);

        // Keep last 10 review history entries
        card.history.unshift({
            timestamp: now,
            grade: clampedGrade,
            interval: card.interval,
            easeFactor: card.easeFactor
        });
        if (card.history.length > 10) {
            card.history.pop();
        }

        this.saveCard(card);

        // Synchronize with legacy mastered list for backward compatibility
        const progress = StorageManager.getProgress();
        if (clampedGrade >= 3 && card.repetition >= 2) {
            if (!progress.mastered.includes(character)) {
                progress.mastered.push(character);
            }
        } else if (clampedGrade === 1) {
            // If failed, remove from mastered back into active review
            progress.mastered = progress.mastered.filter((c) => c !== character);
        }
        if (!progress.studied.includes(character)) {
            progress.studied.push(character);
        }
        StorageManager.saveProgress(progress);

        return card;
    }

    /**
     * Gets all cards due for review.
     */
    static getDueCards(level = null) {
        const allCards = this.getAllCards();
        const now = Date.now();
        const dueList = [];

        Object.values(allCards).forEach((card) => {
            if (level && level !== 'all' && card.level !== level) {
                return;
            }
            if (card.dueDate && card.dueDate <= now) {
                dueList.push(card);
            }
        });

        // Sort by most overdue first
        return dueList.sort((a, b) => a.dueDate - b.dueDate);
    }

    /**
     * Retrieves high-risk / weak cards (high lapses or low ease factor).
     */
    static getWeakCards(level = null, limit = 10) {
        const allCards = this.getAllCards();
        const weakList = [];

        Object.values(allCards).forEach((card) => {
            if (level && level !== 'all' && card.level !== level) {
                return;
            }
            if (
                card.lapses > 0 ||
                card.easeFactor < 2.2 ||
                (card.totalReviews > 0 && card.correctReviews / card.totalReviews < 0.75)
            ) {
                weakList.push(card);
            }
        });

        // Sort by weakness severity (most lapses, then lowest ease factor)
        weakList.sort((a, b) => {
            if (b.lapses !== a.lapses) {
                return b.lapses - a.lapses;
            }
            return a.easeFactor - b.easeFactor;
        });

        return weakList.slice(0, limit);
    }

    /**
     * Computes SRS retention and learning metrics.
     */
    static getRetentionStats(level = null) {
        const allCards = Object.values(this.getAllCards());
        const filtered =
            level && level !== 'all' ? allCards.filter((c) => c.level === level) : allCards;

        const now = Date.now();
        let learningCount = 0; // interval <= 1
        let youngCount = 0; // interval between 1 and 21 days
        let matureCount = 0; // interval > 21 days
        let dueCount = 0;
        let totalReviews = 0;
        let totalCorrect = 0;
        let totalEase = 0;

        filtered.forEach((card) => {
            if (card.dueDate <= now) {
                dueCount += 1;
            }
            if (card.interval <= 1) {
                learningCount += 1;
            } else if (card.interval <= 21) {
                youngCount += 1;
            } else {
                matureCount += 1;
            }

            totalReviews += card.totalReviews;
            totalCorrect += card.correctReviews;
            totalEase += card.easeFactor;
        });

        const cardCount = filtered.length;
        const avgEase =
            cardCount > 0 ? Number((totalEase / cardCount).toFixed(2)) : this.DEFAULT_EASE_FACTOR;
        const retentionRate =
            totalReviews > 0 ? Math.round((totalCorrect / totalReviews) * 100) : 100;

        return {
            totalTracked: cardCount,
            learning: learningCount,
            young: youngCount,
            mature: matureCount,
            dueCount: dueCount,
            retentionRate: retentionRate,
            averageEaseFactor: avgEase
        };
    }

    /**
     * Generates a fully local, offline rule-based diagnostic report.
     * Works without any AI API key.
     */
    static generateRuleBasedDiagnostics(progressData, currentPool = []) {
        const srsStats = this.getRetentionStats(progressData?.currentLevel || 'N5');
        const weakCards = this.getWeakCards(progressData?.currentLevel || 'N5', 8);
        const masteredSet = new Set(progressData?.mastered || []);
        const poolCharacters = new Set(currentPool.map((k) => k.character));

        // Find potential lookalike traps present in the current pool
        const lookalikeTraps = [];
        this.LOOKALIKE_PAIRS.forEach((item) => {
            const hasFirst = poolCharacters.has(item.pair[0]);
            const hasSecond = poolCharacters.has(item.pair[1]);
            if (hasFirst || hasSecond) {
                const firstMastered = masteredSet.has(item.pair[0]);
                const secondMastered = masteredSet.has(item.pair[1]);
                lookalikeTraps.push({
                    kanji1: item.pair[0],
                    kanji2: item.pair[1],
                    reason: item.reason,
                    status:
                        firstMastered && secondMastered
                            ? 'Both Studied'
                            : firstMastered || secondMastered
                                ? 'One Studied'
                                : 'Pending'
                });
            }
        });

        // Recommended focus characters
        const priorityStudy = [];
        // Add weak cards first
        weakCards.forEach((wc) =>
            priorityStudy.push({
                character: wc.character,
                reason: `Frequent lapse (${wc.lapses} errors)`
            })
        );

        // Add next unstudied kanji if priority is under 5
        if (priorityStudy.length < 5 && currentPool.length > 0) {
            for (const item of currentPool) {
                if (
                    !masteredSet.has(item.character) &&
                    !priorityStudy.some((p) => p.character === item.character)
                ) {
                    priorityStudy.push({ character: item.character, reason: 'Next in sequence' });
                    if (priorityStudy.length >= 5) {
                        break;
                    }
                }
            }
        }

        return {
            source: 'algorithmic',
            retentionRate: srsStats.retentionRate,
            dueCount: srsStats.dueCount,
            matureCount: srsStats.matureCount,
            weakCards: weakCards.map((c) => ({
                character: c.character,
                lapses: c.lapses,
                easeFactor: c.easeFactor
            })),
            lookalikeTraps: lookalikeTraps.slice(0, 4),
            priorityStudy: priorityStudy.slice(0, 5),
            advice:
                srsStats.dueCount > 10
                    ? 'You have a backlog of reviews due! Clear your review queue first before learning new kanji to prevent memory decay.'
                    : srsStats.retentionRate < 80
                        ? 'Retention is below 80%. Consider spending extra time visualizing radicals and stroke sequences for tricky kanji.'
                        : 'Pacing looks healthy! Keep up daily consistency to maintain your retention momentum.'
        };
    }
}

// Export for module/browser environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SRSEngine;
}
