class StorageManager {
    static keys = {
        PROGRESS: 'kanji_progress',
        RECENT: 'kanji_recent',
        SETTINGS: 'kanji_settings',
        CACHE: 'kanji_cache'
    };

    static init() {
        // Initialize storage with default values if not exists
        if (!this.getProgress()) {
            this.resetProgress();
        }
        
        if (!this.getRecent()) {
            this.setItem(this.keys.RECENT, []);
        }
    }

    // Generic storage methods
    static setItem(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (error) {
            console.error('Error saving to localStorage:', error);
            return false;
        }
    }

    static getItem(key, defaultValue = null) {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch (error) {
            console.error('Error reading from localStorage:', error);
            return defaultValue;
        }
    }

    static removeItem(key) {
        try {
            localStorage.removeItem(key);
            return true;
        } catch (error) {
            console.error('Error removing from localStorage:', error);
            return false;
        }
    }

    // Progress management
    static getProgress() {
        return this.getItem(this.keys.PROGRESS, {
            mastered: [],
            studied: [],
            skipped: [],
            currentLevel: 'N5',
            startDate: Date.now(),
            lastStudied: null,
            streak: 0,
            totalTime: 0
        });
    }

    static saveProgress(progress) {
        return this.setItem(this.keys.PROGRESS, progress);
    }

    static markAsMastered(character) {
        const progress = this.getProgress();
        
        // Add to mastered if not already there
        if (!progress.mastered.includes(character)) {
            progress.mastered.push(character);
        }
        
        // Add to studied if not already there
        if (!progress.studied.includes(character)) {
            progress.studied.push(character);
        }
        
        // Update last studied
        progress.lastStudied = Date.now();
        
        // Update streak (simplified - just increment for now)
        const today = new Date().toDateString();
        const lastStudiedDate = progress.lastStudied ? 
            new Date(progress.lastStudied).toDateString() : null;
        
        if (lastStudiedDate !== today) {
            progress.streak += 1;
        }
        
        return this.saveProgress(progress);
    }

    static markAsStudied(character) {
        const progress = this.getProgress();
        
        if (!progress.studied.includes(character)) {
            progress.studied.push(character);
        }
        
        progress.lastStudied = Date.now();
        return this.saveProgress(progress);
    }

    static skipKanji(character) {
        const progress = this.getProgress();
        
        if (!progress.skipped.includes(character)) {
            progress.skipped.push(character);
        }
        
        return this.saveProgress(progress);
    }

    static isMastered(character) {
        const progress = this.getProgress();
        return progress.mastered.includes(character);
    }

    static isStudied(character) {
        const progress = this.getProgress();
        return progress.studied.includes(character);
    }

    static resetProgress() {
        const defaultProgress = {
            mastered: [],
            studied: [],
            skipped: [],
            currentLevel: 'N5',
            startDate: Date.now(),
            lastStudied: null,
            streak: 0,
            totalTime: 0
        };
        
        return this.saveProgress(defaultProgress);
    }

    // Recent kanji management
    static getRecent(maxItems = 10) {
        const recent = this.getItem(this.keys.RECENT, []);
        return recent.slice(0, maxItems);
    }

    static addToRecent(kanjiData) {
        let recent = this.getItem(this.keys.RECENT, []);
        
        // Remove if already exists
        recent = recent.filter(item => item.character !== kanjiData.character);
        
        // Add to beginning
        recent.unshift({
            ...kanjiData,
            timestamp: Date.now()
        });
        
        // Keep only last 20 items
        recent = recent.slice(0, 20);
        
        return this.setItem(this.keys.RECENT, recent);
    }

    static clearRecent() {
        return this.setItem(this.keys.RECENT, []);
    }

    // Settings management
    static getSettings() {
        return this.getItem(this.keys.SETTINGS, {
            jlptLevel: 'N5',
            autoPlay: false,
            showFurigana: true,
            theme: 'light',
            widgetSize: 'medium',
            dailyGoal: 10,
            reminderTime: '19:00',
            enableNotifications: false,
            kanjiFont: 'Noto Sans JP',
            fontSize: 'medium',
            defaultAudio: 'kunyomi',
            localBackupFreq: 'daily',
            onlineBackupFreq: 'never'
        });
    }

    static saveSettings(settings) {
        return this.setItem(this.keys.SETTINGS, settings);
    }

    static updateSetting(key, value) {
        const settings = this.getSettings();
        settings[key] = value;
        return this.saveSettings(settings);
    }

    // Cache management for offline support
    static cacheKanjiData(level, data) {
        const cache = this.getItem(this.keys.CACHE, {});
        cache[level] = {
            data: data,
            timestamp: Date.now(),
            version: 1
        };
        return this.setItem(this.keys.CACHE, cache);
    }

    static getCachedKanjiData(level) {
        const cache = this.getItem(this.keys.CACHE, {});
        const levelCache = cache[level];
        
        if (!levelCache) return null;
        
        // Check if cache is older than 7 days
        const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
        if (Date.now() - levelCache.timestamp > maxAge) {
            // Cache expired
            delete cache[level];
            this.setItem(this.keys.CACHE, cache);
            return null;
        }
        
        return levelCache.data;
    }

    static clearCache() {
        return this.setItem(this.keys.CACHE, {});
    }

    // Statistics and analytics
    static getStats() {
        const progress = this.getProgress();
        const recent = this.getRecent();
        
        return {
            totalMastered: progress.mastered.length,
            totalStudied: progress.studied.length,
            currentStreak: progress.streak,
            daysActive: this.getDaysActive(),
            averagePerDay: this.getAveragePerDay(),
            recentActivity: recent.length,
            studyStartDate: new Date(progress.startDate),
            lastStudyDate: progress.lastStudied ? new Date(progress.lastStudied) : null
        };
    }

    static getDaysActive() {
        const progress = this.getProgress();
        const startDate = new Date(progress.startDate);
        const now = new Date();
        const diffTime = Math.abs(now - startDate);
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    static getAveragePerDay() {
        const stats = this.getStats();
        const daysActive = stats.daysActive;
        return daysActive > 0 ? Math.round(stats.totalStudied / daysActive * 10) / 10 : 0;
    }

    // Export/Import functionality
    static exportData() {
        const data = {
            progress: this.getProgress(),
            recent: this.getRecent(50), // Export more recent items
            settings: this.getSettings(),
            exportDate: Date.now(),
            version: 1
        };
        
        return JSON.stringify(data, null, 2);
    }

    static importData(jsonData) {
        try {
            const data = JSON.parse(jsonData);
            
            if (!data.version || !data.progress) {
                throw new Error('Invalid data format');
            }
            
            // Import progress
            if (data.progress) {
                this.saveProgress(data.progress);
            }
            
            // Import recent
            if (data.recent) {
                this.setItem(this.keys.RECENT, data.recent);
            }
            
            // Import settings
            if (data.settings) {
                this.saveSettings(data.settings);
            }
            
            return true;
            
        } catch (error) {
            console.error('Error importing data:', error);
            return false;
        }
    }

    // Storage cleanup
    static cleanup() {
        // Clean old cache entries
        const cache = this.getItem(this.keys.CACHE, {});
        const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
        
        Object.keys(cache).forEach(key => {
            if (Date.now() - cache[key].timestamp > maxAge) {
                delete cache[key];
            }
        });
        
        this.setItem(this.keys.CACHE, cache);
        
        // Limit recent items
        const recent = this.getRecent(20);
        this.setItem(this.keys.RECENT, recent);
    }

    // Check storage quota
    static getStorageInfo() {
        if ('storage' in navigator && 'estimate' in navigator.storage) {
            return navigator.storage.estimate();
        }
        
        // Fallback: estimate localStorage usage
        let total = 0;
        for (let key in localStorage) {
            if (localStorage.hasOwnProperty(key)) {
                total += localStorage[key].length + key.length;
            }
        }
        
        return Promise.resolve({
            usage: total,
            quota: 5 * 1024 * 1024 // 5MB typical localStorage limit
        });
    }
}

// Initialize storage when script loads
document.addEventListener('DOMContentLoaded', () => {
    StorageManager.init();
    
    // Cleanup old data periodically
    StorageManager.cleanup();
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = StorageManager;
}
