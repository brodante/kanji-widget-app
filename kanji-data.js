class KanjiData {
    static cache = new Map();

    /**
     * DYNAMIC FETCHER: Loads the requested JLPT level directly from the local database folder.
     */
    static async getKanjiByLevel(level) {
        const cacheKey = `level_${level}`;

        // Return from memory if already loaded to ensure instant rendering
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        try {
            // Fetch the specific level JSON file from your new database folder
            const response = await fetch(`database/${level}.json`);
            if (!response.ok) throw new Error(`Missing ${level}.json file in database folder.`);

            const data = await response.json();
            const kanjiPool = data[level] || [];

            // Save to memory so we never fetch the same file twice
            this.cache.set(cacheKey, kanjiPool);
            return kanjiPool;

        } catch (error) {
            console.error(`Failed to load data for ${level}:`, error);
            return [];
        }
    }

    /**
     * Legacy Hydration Fallback.
     * script.js previously used to fetch missing details from KanjiAPI.
     * Because new offline database files (N4.json, etc.) are 100% complete, 
     * this will no longer be triggered, but we keep the function here returning null 
     * so your existing script.js does not throw an undefined error.
     */
    static async fetchKanjiDetails(character) {
        return null;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = KanjiData;
}