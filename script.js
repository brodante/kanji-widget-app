// ==========================================
// GLOBAL ANIMATION TRACKERS
// ==========================================
let namiAnimationId = null;

let lumenAnimationId = null;

let obakeAnimationId = null;


let itoAppInstance = null;
let itoInitialized = false;
let itoAnimationId = null;
let itoIntervalId = null;

// ==========================================
// SEARCH HELPERS (lightweight kana/romaji matching)
// ==========================================

// Katakana -> Hiragana, so onyomi (stored in katakana) and kunyomi
// (stored in hiragana) can be compared on equal footing.
function katakanaToHiragana(str) {
    return str.replace(/[\u30A1-\u30F6]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

// Small greedy romaji -> hiragana converter. Covers standard mora,
// youon (kya/sha/etc.), and sokuon (doubled consonant -> っ). Not a
// full IME — good enough for matching search queries against readings.
const ROMAJI_TO_HIRAGANA = {
    kya: 'きゃ', kyu: 'きゅ', kyo: 'きょ', sha: 'しゃ', shu: 'しゅ', sho: 'しょ',
    cha: 'ちゃ', chu: 'ちゅ', cho: 'ちょ', nya: 'にゃ', nyu: 'にゅ', nyo: 'にょ',
    hya: 'ひゃ', hyu: 'ひゅ', hyo: 'ひょ', mya: 'みゃ', myu: 'みゅ', myo: 'みょ',
    rya: 'りゃ', ryu: 'りゅ', ryo: 'りょ', gya: 'ぎゃ', gyu: 'ぎゅ', gyo: 'ぎょ',
    bya: 'びゃ', byu: 'びゅ', byo: 'びょ', pya: 'ぴゃ', pyu: 'ぴゅ', pyo: 'ぴょ',
    ja: 'じゃ', ju: 'じゅ', jo: 'じょ',
    a: 'あ', i: 'い', u: 'う', e: 'え', o: 'お',
    ka: 'か', ki: 'き', ku: 'く', ke: 'け', ko: 'こ',
    sa: 'さ', shi: 'し', su: 'す', se: 'せ', so: 'そ',
    ta: 'た', chi: 'ち', tsu: 'つ', te: 'て', to: 'と',
    na: 'な', ni: 'に', nu: 'ぬ', ne: 'ね', no: 'の',
    ha: 'は', hi: 'ひ', fu: 'ふ', he: 'へ', ho: 'ほ',
    ma: 'ま', mi: 'み', mu: 'む', me: 'め', mo: 'も',
    ya: 'や', yu: 'ゆ', yo: 'よ',
    ra: 'ら', ri: 'り', ru: 'る', re: 'れ', ro: 'ろ',
    wa: 'わ', wo: 'を', n: 'ん',
    ga: 'が', gi: 'ぎ', gu: 'ぐ', ge: 'げ', go: 'ご',
    za: 'ざ', ji: 'じ', zu: 'ず', ze: 'ぜ', zo: 'ぞ',
    da: 'だ', di: 'ぢ', du: 'づ', de: 'で', do: 'ど',
    ba: 'ば', bi: 'び', bu: 'ぶ', be: 'べ', bo: 'ぼ',
    pa: 'ぱ', pi: 'ぴ', pu: 'ぷ', pe: 'ぺ', po: 'ぽ',
};

function romajiToHiragana(input) {
    const s = input.toLowerCase();
    let result = '';
    let i = 0;
    while (i < s.length) {
        // Doubled consonant -> small tsu (sokuon), e.g. "kk" in "gakkou"
        if (i + 1 < s.length && s[i] === s[i + 1] && 'kstpgzdbcfh'.includes(s[i])) {
            result += 'っ';
            i += 1;
            continue;
        }
        let matched = false;
        for (let len = 3; len >= 1; len--) {
            const chunk = s.slice(i, i + len);
            if (ROMAJI_TO_HIRAGANA[chunk]) {
                result += ROMAJI_TO_HIRAGANA[chunk];
                i += chunk.length;
                matched = true;
                break;
            }
        }
        if (!matched) {
            // Standalone "n" not followed by a vowel/y -> ん; otherwise keep as-is
            if (s[i] === 'n' && (i + 1 >= s.length || !'aiueoy'.includes(s[i + 1]))) {
                result += 'ん';
            } else {
                result += s[i];
            }
            i += 1;
        }
    }
    return result;
}

// True if a reading (kana) matches the query directly, or via its
// katakana/hiragana-normalized form, or via a romaji conversion of the query.
function readingMatches(reading, lowerQuery, romajiHiragana) {
    const normalized = katakanaToHiragana(reading.toLowerCase());
    if (normalized.includes(lowerQuery)) return true;
    if (romajiHiragana && normalized.includes(romajiHiragana)) return true;
    return false;
}

// ==========================================
// CUSTOM THEME IMAGE STORAGE (IndexedDB)
// ==========================================
// Images can easily be several MB — localStorage's ~5-10MB *text-only*
// quota is shared with all saved progress, so storing images there risks
// corrupting unrelated data. IndexedDB has no such practical limit and
// stores binary Blobs natively (no base64 bloat).
const CUSTOM_THEME_DB_NAME = 'KanjiWidgetsCustomThemes';
const CUSTOM_THEME_STORE = 'images';

function openCustomThemeDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(CUSTOM_THEME_DB_NAME, 1);
        request.onupgradeneeded = () => {
            request.result.createObjectStore(CUSTOM_THEME_STORE);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function saveCustomThemeImage(slot, blob) {
    const db = await openCustomThemeDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(CUSTOM_THEME_STORE, 'readwrite');
        tx.objectStore(CUSTOM_THEME_STORE).put(blob, `slot${slot}`);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

async function getCustomThemeImage(slot) {
    const db = await openCustomThemeDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(CUSTOM_THEME_STORE, 'readonly');
        const req = tx.objectStore(CUSTOM_THEME_STORE).get(`slot${slot}`);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
    });
}

class KanjiLearningApp {
    constructor() {
        this.currentKanji = null;
        this.currentKanjiPool = [];
        this.currentIndex = 0;
        this.widgetSize = 'large';
        this.settings = {
            jlptLevel: 'N5',
            autoPlay: false,
            showFurigana: true,
            kanjiFont: 'Klee One',
            fontSize: 'medium',
            defaultAudio: 'kunyomi',
            localBackupFreq: 'daily',
            onlineBackupFreq: 'never',
            kanjiAliveKey: ''
        };
        
        // Cache frequently-used DOM elements once instead of re-querying repeatedly
        this.kanjiWidgetEl = document.getElementById('kanjiWidget');

        this.init();
    }

    async init() {
        this.loadSettings();
        this.renderStreak();
        this.bindEvents();
        this.bindFontGridEvents();
        this.updateLevelIcon();

        // BUG FIX: await this so the pool is loaded before we try to filter recent kanji!
        // (This now also safely loads offline MP3 paths!)
        await this.loadCurrentKanji();

        this.updateProgress();
        this.applyTheme();
        this.applyFontSettings();
        this.updateFontPreviewActive();
        this.scheduleBackups();
    }

    bindFontGridEvents() {
        const fontOptions = document.querySelectorAll('.font-option');
        fontOptions.forEach(option => {
            option.addEventListener('click', () => {
                const selectedFont = option.getAttribute('data-font');
                this.settings.kanjiFont = selectedFont;
                document.getElementById('kanjiFont').value = selectedFont;
                this.saveSettings();
                this.applyFontSettings();
                this.updateFontPreviewActive();
            });
        });
    }

    bindEvents() {
        // Widget size change
        // document.getElementById('widgetSize').addEventListener('change', (e) => {
        //     this.changeWidgetSize(e.target.value);
        // });

        
        document.getElementById('themeSelect').addEventListener('change', (e) => {
            this.setTheme(e.target.value);
        });

        // Theme toggle button (The "Quick Switcher")
        // This flips between your default light (candy) and default dark (lumen)
        document.getElementById('themeToggle').addEventListener('click', () => {
            const current = localStorage.getItem('theme') || 'candy';

            // NEW: Added 'lumen' to the end of this list!
            const darkThemes = ['dark', 'nami', 'obake', 'nord', 'midnight', 'forest', 'lumen', 'ito'];
            const isDark = darkThemes.includes(current);

            if (isDark) {
                // We were in dark mode, switch to the last used light theme (or default to candy)
                const lastLight = localStorage.getItem('lastLightTheme') || 'candy';
                this.setTheme(lastLight);
            } else {
                // We were in light mode, switch to the last used dark theme (or default to nami rn)
                const lastDark = localStorage.getItem('lastDarkTheme') || 'nami';
                this.setTheme(lastDark);
            }
        });

        // Level Switcher Dropdown
        const levelToggleBtn = document.getElementById('levelToggleBtn');
        const levelDropdown = document.getElementById('levelDropdown');

        if (levelToggleBtn && levelDropdown) {
            levelToggleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                levelDropdown.classList.toggle('show');
            });

            // Close dropdown when clicking anywhere outside
            document.addEventListener('click', (e) => {
                if (!levelToggleBtn.contains(e.target) && !levelDropdown.contains(e.target)) {
                    levelDropdown.classList.remove('show');
                }
            });

            // Handle clicking a level inside the dropdown
            document.querySelectorAll('.level-option').forEach(option => {
                option.addEventListener('click', () => {
                    const newLevel = option.getAttribute('data-level');

                    // Update settings
                    this.settings.jlptLevel = newLevel;
                    document.getElementById('jlptLevel').value = newLevel; // Sync settings modal

                    this.saveSettings();
                    this.updateLevelIcon(); // Change the button text
                    levelDropdown.classList.remove('show'); // Hide dropdown

                    this.showToast(`Switched to ${newLevel}`);

                    // Audio is now handled automatically inside this method:
                    this.loadCurrentKanji();
                });
            });
        }

        
        // Kanji/Kana Search
        const searchToggleBtn = document.getElementById('searchToggleBtn');
        const searchPanel = document.getElementById('searchPanel');
        const searchInput = document.getElementById('kanjiSearchInput');
        const searchCloseBtn = document.getElementById('searchCloseBtn');

        if (searchToggleBtn && searchPanel && searchInput && searchCloseBtn) {
            searchToggleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                searchPanel.classList.toggle('show');
                if (searchPanel.classList.contains('show')) {
                    searchInput.focus();
                }
            });

            searchCloseBtn.addEventListener('click', () => {
                searchPanel.classList.remove('show');
            });

            // Close panel when clicking anywhere outside it
            document.addEventListener('click', (e) => {
                if (!searchToggleBtn.contains(e.target) && !searchPanel.contains(e.target)) {
                    searchPanel.classList.remove('show');
                }
            });

            // Debounced live search as the user types
            let searchDebounceTimer = null;
            searchInput.addEventListener('input', (e) => {
                const query = e.target.value;
                clearTimeout(searchDebounceTimer);
                searchDebounceTimer = setTimeout(() => {
                    this.handleKanjiSearch(query);
                }, 150);
            });
        }

        // Settings modal
        document.getElementById('settingsBtn').addEventListener('click', () => {
            this.openSettings();
        });

        document.getElementById('closeSettings').addEventListener('click', () => {
            this.closeSettings();
        });

        // Close sidebar when clicking on the modal backdrop
        document.getElementById('settingsModal').addEventListener('click', (e) => {
            if (e.target.id === 'settingsModal') {
                this.closeSettings();
            }
        });
        // Custom Theme Builder
        document.getElementById('customThemeBtn').addEventListener('click', async () => {
            // Prefill the builder with whatever's already saved for Slot 1
            const settingsRaw = localStorage.getItem('customTheme:slot1:settings');
            if (settingsRaw) {
                const settings = JSON.parse(settingsRaw);
                document.getElementById('customThemeBlur').value = settings.blur;
                document.getElementById('customThemeBlurValue').textContent = `${settings.blur}px`;
                document.getElementById('customThemeAccent').value = settings.accent;
                document.getElementById('customThemeMode').value = settings.mode;

                const blob = await getCustomThemeImage(1);
                if (blob) {
                    const url = URL.createObjectURL(blob);
                    document.getElementById('customThemePreview').style.backgroundImage = `url(${url})`;
                    document.getElementById('customThemePreview').dataset.imageUrl = url;
                }
            }
            document.getElementById('autoAccentToggle').checked = false; // always starts unchecked
            document.getElementById('customThemeModal').classList.add('show');
        });

        document.getElementById('closeCustomTheme').addEventListener('click', () => {
            document.getElementById('customThemeModal').classList.remove('show');
        });

        document.getElementById('customThemeModal').addEventListener('click', (e) => {
            if (e.target.id === 'customThemeModal') {
                document.getElementById('customThemeModal').classList.remove('show');
            }
        });

        document.querySelectorAll('.theme-slot-tab.locked').forEach(tab => {
            tab.addEventListener('click', () => {
                this.showToast('This slot is coming in a future update!');
            });
        });

        // Live preview of the picked image, before saving
        document.getElementById('customThemeImageInput').addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const url = URL.createObjectURL(file);
            const previewEl = document.getElementById('customThemePreview');
            previewEl.style.backgroundImage = `url(${url})`;
            previewEl.dataset.imageUrl = url;

            if (document.getElementById('autoAccentToggle').checked) {
                const mode = document.getElementById('customThemeMode').value;
                const color = await autoPickAccentFromImage(mode);
                if (color) document.getElementById('customThemeAccent').value = color;
            }
        });

        // Auto-pick an accent color from the current image when checked
        document.getElementById('autoAccentToggle').addEventListener('change', async (e) => {
            if (!e.target.checked) return;

            const mode = document.getElementById('customThemeMode').value;
            const color = await autoPickAccentFromImage(mode);
            if (color) {
                document.getElementById('customThemeAccent').value = color;
                this.showToast('Accent color picked from your image!');
            } else {
                this.showToast('Pick an image first!');
                e.target.checked = false;
            }
        });

        // Live label for the blur slider (actual blur is applied on Save)
        document.getElementById('customThemeBlur').addEventListener('input', (e) => {
            document.getElementById('customThemeBlurValue').textContent = `${e.target.value}px`;
        });

            document.getElementById('saveCustomTheme').addEventListener('click', async () => {
            const fileInput = document.getElementById('customThemeImageInput');
            const blurPx = document.getElementById('customThemeBlur').value;
            const rawAccentHex = document.getElementById('customThemeAccent').value;
            const mode = document.getElementById('customThemeMode').value;

            const { hex: accentHex, adjusted } = sanitizeAccentColor(rawAccentHex, mode);
            document.getElementById('customThemeAccent').value = accentHex; // reflect the clamped color back in the picker

            if (fileInput.files && fileInput.files[0]) {
                await saveCustomThemeImage(1, fileInput.files[0]);
            }

            localStorage.setItem('customTheme:slot1:settings', JSON.stringify({ blur: blurPx, accent: accentHex, mode }));

            this.setTheme('custom-1');
            document.getElementById('customThemeModal').classList.remove('show');
            this.showToast(adjusted
                ? 'Theme saved! Accent color adjusted slightly for visibility.'
                : 'Custom theme saved and applied!');
        });

        // Settings changes
        document.getElementById('jlptLevel').addEventListener('change', (e) => {
            this.settings.jlptLevel = e.target.value;
            this.saveSettings();
            this.updateLevelIcon();
            this.loadCurrentKanji();
        });

        // Setup Premium Kana Buttons
        const setupKanaButton = (buttonId, levelName) => {
            const btn = document.getElementById(buttonId);
            if (btn) {
                btn.addEventListener('click', () => {
                    this.settings.jlptLevel = levelName;

                    // Sync the main dropdown just in case
                    const jlptSelect = document.getElementById('jlptLevel');
                    if (jlptSelect) jlptSelect.value = levelName;

                    this.saveSettings();
                    this.updateLevelIcon();

                    this.closeSettings();
                    this.showToast(`Switched to ${levelName} Practice!`);

                    this.loadCurrentKanji();
                });
            }
        };

        setupKanaButton('btnHiragana', 'Hiragana');
        setupKanaButton('btnKatakana', 'Katakana');

        document.getElementById('autoPlay').addEventListener('change', (e) => {
            this.settings.autoPlay = e.target.checked;
            this.saveSettings();
        });

        document.getElementById('showFurigana').addEventListener('change', (e) => {
            this.settings.showFurigana = e.target.checked;
            this.saveSettings();
            this.renderKanji();
        });

        document.getElementById('resetProgress').addEventListener('click', () => {
            this.resetProgress();
        });

        // New settings handlers
        document.getElementById('kanjiFont').addEventListener('change', (e) => {
            this.settings.kanjiFont = e.target.value;
            this.saveSettings();
            this.applyFontSettings();
            this.updateFontPreviewActive();
        });

        document.getElementById('fontSize').addEventListener('change', (e) => {
            this.settings.fontSize = e.target.value;
            this.saveSettings();
            this.applyFontSettings();
        });

        document.getElementById('defaultAudio').addEventListener('change', (e) => {
            this.settings.defaultAudio = e.target.value;
            this.saveSettings();
        });

        document.getElementById('localBackupFreq').addEventListener('change', (e) => {
            this.settings.localBackupFreq = e.target.value;
            this.saveSettings();
            this.scheduleBackups();
        });

        document.getElementById('onlineBackupFreq').addEventListener('change', (e) => {
            this.settings.onlineBackupFreq = e.target.value;
            this.saveSettings();
            this.scheduleBackups();
        });

        // Backup buttons
        document.getElementById('createBackup').addEventListener('click', () => {
            this.createLocalBackup();
        });

        document.getElementById('restoreBackup').addEventListener('click', () => {
            document.getElementById('backupFileInput').click();
        });

        document.getElementById('backupFileInput').addEventListener('change', (e) => {
            this.restoreLocalBackup(e.target.files[0]);
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Prevent shortcuts from firing if you are typing in the settings input box
            if (e.target.tagName === 'INPUT') return;

            if (e.code === 'Space' || e.key === 'Enter') {
                e.preventDefault();
                this.markAsMastered();
            } else if (e.key === 'p' || e.key === 'P') {
                e.preventDefault();
                this.playPronunciation();
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                this.navigateDeck('next');
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                this.navigateDeck('prev');
            }
        });
    }

    updateLevelIcon() {
        const btn = document.getElementById('levelToggleBtn');
        if (!btn) return;

        const levelMap = {
            'Hiragana': 'あ',
            'Katakana': 'ア',
            'N5': '漢5',
            'N4': '漢4',
            'N3': '漢3',
            'N2': '漢2',
            'N1': '漢1',
            'all': '全'
        };

        // Update the button icon text
        btn.textContent = levelMap[this.settings.jlptLevel] || '漢';

        // Update the dropdown active states
        document.querySelectorAll('.level-option').forEach(opt => {
            if (opt.getAttribute('data-level') === this.settings.jlptLevel) {
                opt.classList.add('active');
            } else {
                opt.classList.remove('active');
            }
        });
    }
    
    async loadCurrentKanji() {
        const widget = document.getElementById('kanjiWidget');
        widget.innerHTML = `<div class="widget-loading"><i class="fas fa-spinner fa-spin"></i><p>Loading Kanji...</p></div>`;

        // FIX 1: Clear the recent list UI immediately so it doesn't show old data during the loading delay
        const recentContainer = document.getElementById('recentKanji');
        if (recentContainer) {
            recentContainer.innerHTML = `<p style="text-align: center; opacity: 0.6;">Loading ${this.settings.jlptLevel}...</p>`;
        }

        try {
            const progress = StorageManager.getProgress();
            const availableKanji = await this.getKanjiPool(this.settings.jlptLevel);
            this.currentKanjiPool = availableKanji;

            // THE FIX: Pass the pool directly into the Audio Engine!
            await AudioManager.loadLevelAudio(this.settings.jlptLevel, this.currentKanjiPool);

            if (availableKanji.length === 0) {
                throw new Error('No kanji available for this level');
            }

            let nextKanji = null;
            for (let i = 0; i < availableKanji.length; i++) {
                const kanji = availableKanji[i];
                if (!progress.mastered.includes(kanji.character)) {
                    nextKanji = kanji;
                    this.currentIndex = i;
                    break;
                }
            }

            if (!nextKanji) {
                nextKanji = availableKanji[0];
                this.currentIndex = 0;
                this.showToast('Congratulations! You\'ve mastered all kanji in this level. Starting over.');
            }

            this.currentKanji = nextKanji;
            this.renderKanji();
            this.renderKanjiJourney();
            this.updateProgress();
            // FIX 2: Force the recent list to redraw using the new, filtered data pool!
            this.loadRecentKanji();

            if (this.settings.autoPlay) {
                setTimeout(() => this.playPronunciation(), 500);
            }

        } catch (error) {
            console.error('Error loading kanji:', error);
            widget.innerHTML = `<div class="widget-loading"><p>Error loading data.</p><button onclick="app.loadCurrentKanji()">Retry</button></div>`;
        }
    }
    
    refreshActivePool(updatedPool) {
        if (!updatedPool || updatedPool.length === 0) return;

        // Update the pool seamlessly in memory
        this.currentKanjiPool = updatedPool;

        // Re-render the stats and journey grid instantly without touching the current card
        this.updateProgress();
        this.renderKanjiJourney();
    }

    renderKanji() {
        if (!this.currentKanji) return;

        const widget = document.getElementById('kanjiWidget');
        let content = '';

        content += `<div class="kanji-character japanese-text">${this.currentKanji.character}</div>`;

        if (this.widgetSize === 'small') {
            content += `
                <div class="widget-actions">
                    <button class="action-btn jisho-btn" onclick="window.open('https://jisho.org/search/${encodeURIComponent(this.currentKanji.character)}%20%23kanji', '_blank')"><i class="fas fa-book-open"></i></button>
                    <button class="action-btn master-action-btn" onclick="app.markAsMastered()"><i class="fas fa-check"></i></button>
                </div>
            `;
        } else if (this.widgetSize === 'medium') {
            content += `
                <div class="kanji-meaning">${this.currentKanji.meanings.join(', ')}</div>
                <div class="widget-actions">
                    <button class="action-btn" onclick="app.playPronunciation()"><i class="fas fa-volume-up"></i></button>
                    <button class="action-btn jisho-btn" onclick="window.open('https://jisho.org/search/${encodeURIComponent(this.currentKanji.character)}%20%23kanji', '_blank')"><i class="fas fa-book-open"></i></button>
                    <button class="action-btn master-action-btn" onclick="app.markAsMastered()"><i class="fas fa-check"></i></button>
                </div>
            `;
        } else {
            const isMastered = StorageManager.getProgress().mastered.includes(this.currentKanji.character);
            content += `
                ${isMastered ? `<button class="unmark-badge" onclick="app.unmarkCurrentKanji()" title="Unmark as mastered"><i class="fas fa-times"></i></button>` : ''}
                <div class="kanji-meaning">${this.currentKanji.meanings.join(', ')}</div>                <div class="kanji-readings">
                    ${this.currentKanji.onyomi.length > 0 ? `
                        <div class="reading-group">
                            <div class="reading-label japanese-text">On'yomi</div>
                            <div class="reading-value japanese-text">
                                ${this.currentKanji.onyomi.map(reading =>
                `<span class="clickable-reading japanese-text" onclick="app.playSpecificReading('${reading}')">${reading}</span>`
            ).join(', ')}
                            </div>
                        </div>
                    ` : ''}
                    ${this.currentKanji.kunyomi.length > 0 ? `
                        <div class="reading-group">
                            <div class="reading-label japanese-text">Kun'yomi</div>
                            <div class="reading-value japanese-text">
                                ${this.currentKanji.kunyomi.map(reading =>
                `<span class="clickable-reading japanese-text" onclick="app.playSpecificReading('${reading}')">${reading}</span>`
            ).join(', ')}
                            </div>
                        </div>
                    ` : ''}
                </div>
                ${this.currentKanji.examples && this.currentKanji.examples.length > 0 ? `
                    <div class="kanji-examples">
                        <h4>Examples</h4>
                        ${this.currentKanji.examples.slice(0, 3).map(example => `
                            <div class="example-item">
                                <span class="example-word japanese-text" onclick="app.playSpecificReading('${example.word}')" title="Click to pronounce">
                                    ${example.word}
                                    ${example.reading ? `<span class="reading-hiragana japanese-text">${example.reading}</span>` : ''}
                                </span>
                                <span class="example-meaning">${example.meaning}</span>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
                <div class="stroke-order-section">
                    <div class="stroke-order-header">Stroke order</div>
                    <div class="stroke-order-toolbar">
                        <button class="stroke-order-play" onclick="app.playStrokeOrderAnimation()" type="button">Animate</button>
                    </div>
                    <div id="strokeOrderContainer" class="stroke-order-container" onclick="app.playStrokeOrderAnimation()"></div>
                </div>
                <div class="widget-actions">
                    <button class="action-btn" onclick="app.playPronunciation()"><i class="fas fa-volume-up"></i></button>
                    <button class="action-btn jisho-btn" onclick="window.open('https://jisho.org/search/${encodeURIComponent(this.currentKanji.character)}%20%23kanji', '_blank')"><i class="fas fa-book-open"></i></button>
                    <button class="action-btn master-action-btn" onclick="app.markAsMastered()"><i class="fas fa-check"></i></button>
                </div>
            `;
        }

        widget.innerHTML = content;
        if (this.widgetSize !== 'small') {
            this.loadStrokeOrder();
        }
    }

    // changeWidgetSize(size) {
    //     this.widgetSize = size;
    //     const widget = document.getElementById('kanjiWidget');
        
    //     // Remove existing size classes
    //     widget.classList.remove('small-widget', 'medium-widget', 'large-widget');
        
    //     // Add new size class
    //     widget.classList.add(`${size}-widget`);
        
    //     this.renderKanji();
    // }

    async markAsMastered() {
        if (!this.currentKanji) return;

        // Add pulse animation
        const widget = document.getElementById('kanjiWidget');
        widget.classList.add('pulse-animation');
        setTimeout(() => widget.classList.remove('pulse-animation'), 300);

        // Store this specific character in memory in case the user wants to undo it
        const masteredChar = this.currentKanji.character;
        this.lastMasteredChar = masteredChar;

        // Save progress
        StorageManager.markAsMastered(masteredChar);

        // Add to recent
        StorageManager.addToRecent({
            character: masteredChar,
            meanings: this.currentKanji.meanings,
            timestamp: Date.now()
        });

        // Trigger the upgraded HTML Toast with an Undo button
        const undoBtnHtml = `<button onclick="app.undoMaster()" style="margin-left: 15px; padding: 4px 10px; background: rgba(255,255,255,0.2); border: 1px solid white; color: white; border-radius: 4px; cursor: pointer; font-size: 0.8rem;">Undo <i class="fas fa-undo"></i></button>`;
        this.showToast(`Great! "${masteredChar}" marked as mastered! ${undoBtnHtml}`, true);

        // Update progress display
        this.updateProgress();
        this.updateStreak();
        this.renderKanjiJourney();
        this.loadRecentKanji();

        // Load next kanji: continue forward from wherever we currently are.
        // Only fall back to loadCurrentKanji() (which restarts from the
        // lowest-numbered unmastered kanji) once nothing unmastered remains ahead.
        setTimeout(() => {
            this.advanceAfterMastery();
        }, 1000);
    }

    advanceAfterMastery() {
        const progress = StorageManager.getProgress();
        const pool = this.currentKanjiPool;
        if (!pool || pool.length === 0) return;

        for (let i = 1; i < pool.length; i++) {
            const idx = (this.currentIndex + i) % pool.length;
            const candidate = pool[idx];
            if (!progress.mastered.includes(candidate.character)) {
                this.currentIndex = idx;
                this.currentKanji = candidate;
                this.renderKanji();

                if (this.settings.autoPlay) {
                    setTimeout(() => this.playPronunciation(), 300);
                }
                return;
            }
        }

        // Nothing unmastered left anywhere in the level — reuse the existing
        // "level complete" flow (congrats toast + reset to the start).
        this.loadCurrentKanji();
    }


    async handleKanjiSearch(query) {
        const resultsContainer = document.getElementById('searchResults');
        if (!resultsContainer) return;

        const trimmed = query.trim();
        if (trimmed.length === 0) {
            resultsContainer.innerHTML = '';
            return;
        }

        resultsContainer.innerHTML = `<div class="search-loading">Searching…</div>`;

                const levels = ['Hiragana', 'Katakana', 'N5', 'N4', 'N3', 'N2', 'N1'];
        const lowerQuery = trimmed.toLowerCase();
        const matches = [];
        const MAX_RESULTS = 30;

        // Only attempt romaji conversion when the query looks like plain
        // latin letters (e.g. "ima") — never run it on kanji/kana input.
        const romajiHiragana = /^[a-z]+$/i.test(trimmed) ? romajiToHiragana(lowerQuery) : null;

        for (const level of levels) {
            const pool = await KanjiData.getKanjiByLevel(level);
            for (const kanji of pool) {
                const meanings = kanji.meanings || [];
                const onyomi = kanji.onyomi || [];
                const kunyomi = kanji.kunyomi || [];
                const examples = kanji.examples || [];

                const isMatch =
                    trimmed.includes(kanji.character) ||                       // handles single AND compound queries, e.g. "今夜" matches both 今 and 夜
                    examples.some(ex => ex.word && (trimmed.includes(ex.word) || ex.word.includes(trimmed))) || // e.g. searching a compound example word
                    meanings.some(m => m.toLowerCase().includes(lowerQuery)) ||
                    onyomi.some(r => readingMatches(r, lowerQuery, romajiHiragana)) ||
                    kunyomi.some(r => readingMatches(r, lowerQuery, romajiHiragana));

                if (isMatch) {
                    matches.push({ level, kanji });
                    if (matches.length >= MAX_RESULTS) break;
                }
            }
            if (matches.length >= MAX_RESULTS) break;
        }

        // Ignore a stale response if the input has changed since this search started
        if (document.getElementById('kanjiSearchInput').value.trim() !== trimmed) return;

        if (matches.length === 0) {
            resultsContainer.innerHTML = `<div class="search-empty">No matches for "${trimmed}"</div>`;
            return;
        }

        resultsContainer.innerHTML = matches.map(({ level, kanji }) => {
            const readings = [...(kanji.onyomi || []), ...(kanji.kunyomi || [])].slice(0, 4).join('、');
            const meaning = (kanji.meanings || []).slice(0, 2).join(', ');
            return `
                <button class="search-result-item" onclick="app.jumpToSearchResult('${kanji.character}', '${level}')">
                    <span class="search-result-level">${level}</span>
                    <span class="search-result-char japanese-text">${kanji.character}</span>
                    <span class="search-result-info">
                        <span class="search-result-readings japanese-text">${readings}</span>
                        <span class="search-result-meaning">${meaning}</span>
                    </span>
                </button>
            `;
        }).join('');
    }

    async jumpToSearchResult(character, level) {
        // If the result is in a different level than what's active, switch
        // levels the same way the level-dropdown does (settings, pool, audio).
        if (level !== this.settings.jlptLevel) {
            this.settings.jlptLevel = level;
            const jlptSelect = document.getElementById('jlptLevel');
            if (jlptSelect) jlptSelect.value = level;
            this.saveSettings();
            this.updateLevelIcon();

            this.currentKanjiPool = await this.getKanjiPool(level);
            await AudioManager.loadLevelAudio(level, this.currentKanjiPool);
        }

        const idx = this.currentKanjiPool.findIndex(k => k.character === character);
        if (idx === -1) return;

        this.currentIndex = idx;
        this.currentKanji = this.currentKanjiPool[idx];

        this.renderKanji();
        this.updateProgress();
        this.renderKanjiJourney();
        this.loadRecentKanji();

        this.showToast(`Showing ${character}`);
        this.kanjiWidgetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Close and reset the search panel now that a result was picked
        document.getElementById('searchPanel')?.classList.remove('show');
        document.getElementById('kanjiSearchInput').value = '';
        document.getElementById('searchResults').innerHTML = '';
    }

    undoMaster() {
        if (!this.lastMasteredChar) return;

        // 1. Remove from Mastered array
        const progress = StorageManager.getProgress();
        progress.mastered = progress.mastered.filter(char => char !== this.lastMasteredChar);
        StorageManager.saveProgress(progress);

        // 2. Remove from Recent array
        let recent = StorageManager.getRecent();
        recent = recent.filter(item => item.character !== this.lastMasteredChar);
        localStorage.setItem(StorageManager.keys.RECENT, JSON.stringify(recent));

        // 3. UI Updates
        this.showToast(`Undo successful. "${this.lastMasteredChar}" returned to your queue.`);

        // Instantly bring it back to the main widget screen
        this.showSpecificKanji(this.lastMasteredChar);

        this.updateProgress();
        this.renderKanjiJourney();
        this.loadRecentKanji();

        // Clear the memory
        this.lastMasteredChar = null;
    }

        unmarkCurrentKanji() {
        if (!this.currentKanji) return;

        const character = this.currentKanji.character;
        const progress = StorageManager.getProgress();

        if (!progress.mastered.includes(character)) return; // nothing to unmark

        progress.mastered = progress.mastered.filter(char => char !== character);
        StorageManager.saveProgress(progress);

        this.showToast(`"${character}" unmarked — moved back to pending.`);

        this.renderKanji();       // refresh so the ✕ button hides again
        this.updateProgress();
        this.renderKanjiJourney();
    }

    playPronunciation() {
        if (!this.currentKanji) return;

        let readingToPlay = '';

        switch (this.settings.defaultAudio) {
            case 'kunyomi':
                readingToPlay = this.currentKanji.kunyomi.length > 0 ?
                    this.currentKanji.kunyomi[0] :
                    (this.currentKanji.onyomi.length > 0 ? this.currentKanji.onyomi[0] : '');
                break;
            case 'onyomi':
                readingToPlay = this.currentKanji.onyomi.length > 0 ?
                    this.currentKanji.onyomi[0] :
                    (this.currentKanji.kunyomi.length > 0 ? this.currentKanji.kunyomi[0] : '');
                break;
            case 'first':
            default:
                const allReadings = [...this.currentKanji.onyomi, ...this.currentKanji.kunyomi];
                readingToPlay = allReadings.length > 0 ? allReadings[0] : '';
                break;
        }

        if (readingToPlay) {
            // THE FIX: Unconditionally use the local Audio Engine
            AudioManager.speak(readingToPlay, 'ja-JP');

            const btn = document.querySelector('.action-btn .fa-volume-up');
            if (btn) {
                btn.classList.add('pulse-animation');
                setTimeout(() => btn.classList.remove('pulse-animation'), 300);
            }
        } else if (this.currentKanji.character) {
            // Fallback for basic Kana that only have the character itself
            AudioManager.speak(this.currentKanji.character, 'ja-JP');
        }
    }

    async playSpecificReading(reading) {
        if (reading) {
            await AudioManager.speak(reading, 'ja-JP');
            this.showToast(`Playing pronunciation: ${reading}`);
        }
    }

    navigateDeck(direction) {
        if (!this.currentKanjiPool || this.currentKanjiPool.length === 0) return;

        const progress = StorageManager.getProgress();
        let newIndex = this.currentIndex;
        let found = false;

        // Loop through the pool to find the next/prev unmastered kanji
        for (let i = 1; i < this.currentKanjiPool.length; i++) {
            // Calculate the next index, wrapping around to the start/end of the array if necessary
            let step = direction === 'next' ? i : -i;
            newIndex = (this.currentIndex + step + this.currentKanjiPool.length) % this.currentKanjiPool.length;
            
            const candidate = this.currentKanjiPool[newIndex];
            
            if (!progress.mastered.includes(candidate.character)) {
                this.currentIndex = newIndex;
                this.currentKanji = candidate;
                found = true;
                break;
            }
        }

        if (found) {
            // Add a rapid visual flash so the user feels the transition
            const widget = document.getElementById('kanjiWidget');
            widget.style.opacity = '0.5';
            setTimeout(() => widget.style.opacity = '1', 150);

            // Re-render the UI with the newly selected Kanji
            this.renderKanji();
            
            // Auto-play audio on skip if the setting is active
            if (this.settings.autoPlay) {
                // Set to 300ms so it plays much faster during rapid flashcard skipping
                setTimeout(() => this.playPronunciation(), 300); 
            }
        } else {
            this.showToast("No other unmastered Kanji left in this level!");
        }
    }

    async getKanjiPool(level = this.settings.jlptLevel) {
        if (level === 'all') {
            const levels = ['N5', 'N4', 'N3', 'N2', 'N1'];
            const pools = await Promise.all(levels.map(item => KanjiData.getKanjiByLevel(item)));
            return pools.flat();
        }

        return KanjiData.getKanjiByLevel(level);
    }

    renderKanjiJourney() {
        const container = document.getElementById('kanjiJourney');
        const summary = document.getElementById('journeySummary');
        const progressStats = document.getElementById('progressStats');
        const header = document.querySelector('.journey-section .journey-header');

        if (!container || !summary || !progressStats || !header) return;

        const progress = StorageManager.getProgress();
        //const masteredCount = progress.mastered.length;
        const pool = this.currentKanjiPool.length > 0 ? this.currentKanjiPool : [];

        const currentLevelChars = new Set(pool.map(k => k.character));
        const masteredCount = progress.mastered.filter(char => currentLevelChars.has(char)).length;

        const totalCount = pool.length;
        const levelLabel = this.settings.jlptLevel === 'all' ? 'all levels' : `${this.settings.jlptLevel} level`;

        // Toggle the special 5-row Gojuon grid layout for basic alphabets
        const isKana = this.settings.jlptLevel === 'Hiragana' || this.settings.jlptLevel === 'Katakana';
        if (isKana) {
            container.classList.add('kana-layout');
        } else {
            container.classList.remove('kana-layout');
        }
        
        // Update basic counts
        summary.textContent = `${masteredCount} mastered`;
        progressStats.textContent = `${masteredCount} mastered | ${totalCount} total (${levelLabel})`;

        // Remove old toggle buttons from header and bottom to prevent duplicates
        const oldTopBtn = document.getElementById('toggleJourneyBtn');
        if (oldTopBtn) oldTopBtn.remove();
        const oldBottomContainer = document.getElementById('journeyBottomToggleContainer');
        if (oldBottomContainer) oldBottomContainer.remove();

        if (totalCount === 0) {
            container.innerHTML = '<p class="stroke-order-empty">Loading kanji list…</p>';
            return;
        }

        const masteredSet = new Set(progress.mastered || []);

        // NEW CONFIGURATION: Bump the default compact visibility threshold limit to 100
        // Kanji Blur Limit
        const defaultLimit = 108;
        const needsTruncation = totalCount > defaultLimit;

        if (this.isJourneyExpanded === undefined) {
            this.isJourneyExpanded = false;
        }

        const visiblePool = (needsTruncation && !this.isJourneyExpanded)
            ? pool.slice(0, defaultLimit)
            : pool;

        // 1. Generate core collection of pill items
        let pillsHtml = visiblePool.map(kanji => `
            <button class="journey-pill ${masteredSet.has(kanji.character) ? 'mastered' : 'pending'}" data-character="${kanji.character}" type="button">
                ${kanji.character}
            </button>
        `).join('');

        // NEW ADDITION: If truncated, append a dedicated trailing indicator placeholder inside the grid container row loop
        if (needsTruncation && !this.isJourneyExpanded) {
            pillsHtml += `
                <div class="journey-ellipsis" title="More kanji remaining underneath">
                    <i class="fas fa-ellipsis-h"></i>
                </div>
            `;
        }

        // 2. Wrap the grid interior with the fade class style if collapsed
        if (needsTruncation && !this.isJourneyExpanded) {
            container.innerHTML = `<div class="compact-fade-wrapper">${pillsHtml}</div>`;
        } else {
            container.innerHTML = pillsHtml;
        }

        // 3. Handle Dual Action Triggers if level pool exceeds 100 records
        if (needsTruncation) {
            // Function to handle synchronized state updates
            const toggleStateAction = () => {
                this.isJourneyExpanded = !this.isJourneyExpanded;
                this.renderKanjiJourney();

                // When collapsing from the bottom button, smoothly bounce view frame back up to header block 
                if (!this.isJourneyExpanded) {
                    header.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
            };

            // BUTTON 1: Inject the top action button directly into section header
            const topBtn = document.createElement('button');
            topBtn.id = 'toggleJourneyBtn';
            topBtn.className = 'stroke-order-play';
            topBtn.type = 'button';
            topBtn.style.padding = '0.3rem 1rem';
            topBtn.style.fontSize = '0.85rem';
            topBtn.style.display = 'inline-flex';
            topBtn.style.alignItems = 'center';
            topBtn.style.gap = '0.4rem';
            topBtn.style.marginLeft = 'auto';

            topBtn.innerHTML = `
                <span>${this.isJourneyExpanded ? 'Show Less' : 'Show Remaining'}</span>
                <i class="fas ${this.isJourneyExpanded ? 'fa-chevron-up' : 'fa-chevron-down'}"></i>
            `;
            header.appendChild(topBtn);
            topBtn.addEventListener('click', toggleStateAction);

            // BUTTON 2: Inject the bottom action button right outside grid boundaries at the floor base
            const bottomDiv = document.createElement('div');
            bottomDiv.id = 'journeyBottomToggleContainer';
            bottomDiv.style.width = '100%';
            bottomDiv.style.display = 'flex';
            bottomDiv.style.justifyContent = 'center';
            bottomDiv.style.marginTop = '1.2rem';

            bottomDiv.innerHTML = `
                <button id="toggleJourneyBottomBtn" class="stroke-order-play" type="button" style="padding: 0.4rem 1.5rem; font-size: 0.85rem; display: inline-flex; align-items: center; gap: 0.4rem; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.15); border-radius: 20px; color: var(--text-color); cursor: pointer; transition: all 0.2s ease;">
                    <span>${this.isJourneyExpanded ? 'Show Less' : `Show Remaining (${totalCount - defaultLimit} more)`}</span>
                    <i class="fas ${this.isJourneyExpanded ? 'fa-chevron-up' : 'fa-chevron-down'}"></i>
                </button>
            `;
            // Insert it cleanly immediately after your journey-grid element block bounds
            container.parentNode.insertBefore(bottomDiv, container.nextSibling);

            document.getElementById('toggleJourneyBottomBtn').addEventListener('click', toggleStateAction);
        }

        // Rebind card loading events to current layout collection
        container.querySelectorAll('.journey-pill').forEach(button => {
            button.addEventListener('click', () => {
                this.showSpecificKanji(button.getAttribute('data-character'));
            });
        });
    }

    async showSpecificKanji(character) {
        if (!character) return;

        const pool = this.currentKanjiPool.length > 0 ? this.currentKanjiPool : await this.getKanjiPool(this.settings.jlptLevel);
        this.currentKanjiPool = pool;
        const foundIndex = pool.findIndex(item => item.character === character);
        const foundKanji = foundIndex !== -1 ? pool[foundIndex] : null;

        if (foundKanji) {
            // // THE FIX: Hydrate skeleton API data BEFORE rendering!
            // const isKana = this.settings.jlptLevel === 'Hiragana' || this.settings.jlptLevel === 'Katakana';
            // if (!isKana && (!foundKanji.onyomi || foundKanji.onyomi.length === 0) && (!foundKanji.kunyomi || foundKanji.kunyomi.length === 0)) {

            //     // Show temporary loading state on the widget
            //     const widget = document.getElementById('kanjiWidget');
            //     if (widget) {
            //         widget.innerHTML = `<div class="widget-loading"><i class="fas fa-spinner fa-spin"></i><p>Fetching readings for ${character}...</p></div>`;
            //     }

            //     try {
            //         const details = await KanjiData.fetchKanjiDetails(foundKanji.character);
            //         if (details) {
            //             foundKanji.meanings = details.meanings;
            //             foundKanji.onyomi = details.onyomi;
            //             foundKanji.kunyomi = details.kunyomi;
            //             foundKanji.examples = details.examples;

            //             // Save it back to the cache so we only fetch it once
            //             const cacheKey = `level_${this.settings.jlptLevel}`;
            //             if (KanjiData.cache.has(cacheKey)) {
            //                 const cachedPool = KanjiData.cache.get(cacheKey);
            //                 const index = cachedPool.findIndex(k => k.character === foundKanji.character);
            //                 if (index !== -1) cachedPool[index] = foundKanji;
            //             }
            //         }
            //     } catch (err) {
            //         console.error("Hydration failed:", err);
            //     }
            // }

            this.currentIndex = foundIndex;   // keep position tracking in sync with the tap
            this.currentKanji = foundKanji;
            this.renderKanji();
            this.showToast(`Showing ${character}`);
            document.getElementById('kanjiWidget').scrollIntoView({ behavior: 'smooth', block: 'center' });

            //Auto-play the audio if the setting is enabled
            if (this.settings.autoPlay) {
                // A slight 800ms delay makes it feel natural after the scroll animation
                setTimeout(() => this.playPronunciation(), 800);
            }
        }
    }

    async loadStrokeOrder() {
        const container = document.getElementById('strokeOrderContainer');
        if (!container || !this.currentKanji?.character) return;

        this.stopStrokeOrderAnimation();
        container.innerHTML = '<div class="stroke-order-loading">Loading stroke order…</div>';

        const svgMarkup = await this.fetchStrokeOrderSvg(this.currentKanji.character);
        if (svgMarkup) {
            container.innerHTML = svgMarkup;
            this.prepareStrokeOrderAnimation();
        } else {
            container.innerHTML = '<div class="stroke-order-empty">Stroke order preview unavailable for this kanji.</div>';
        }
    }

    async fetchStrokeOrderSvg(character) {
        const codePoint = character.codePointAt(0).toString(16).toLowerCase();
        const hex = codePoint.padStart(5, '0');
        const fileNames = [
            `${hex}.svg`,
            `${hex}-Kaisho.svg`,
            `${hex}-Jinmeiyo.svg`
        ];
        const baseUrls = [
            `https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/`,
            `https://cdn.jsdelivr.net/gh/KanjiVG/kanjivg/kanji/`
        ];

        for (const fileName of fileNames) {
            for (const baseUrl of baseUrls) {
                try {
                    const response = await fetch(`${baseUrl}${fileName}`, {
                        cache: 'force-cache'
                    });
                    if (response.ok) {
                        const text = await response.text();
                        const sanitized = this.sanitizeStrokeOrderSvg(text);
                        if (sanitized) return sanitized;
                    }
                } catch (error) {
                    console.warn(`Stroke order fetch failed for ${fileName}`, error);
                }
            }
        }

        return null;
    }

    sanitizeStrokeOrderSvg(markup) {
        if (!markup) return null;

        let cleaned = markup.replace(/^\uFEFF/, '').trim();
        cleaned = cleaned.replace(/<\?xml[^>]*\?>/gi, '').replace(/<!DOCTYPE[^>]*>/gi, '');

        const start = cleaned.indexOf('<svg');
        const end = cleaned.lastIndexOf('</svg>');
        if (start === -1 || end === -1) return null;

        cleaned = cleaned.slice(start, end + 6);
        return cleaned.replace(/<path([^>]*)>/gi, '<path$1>');
    }

    prepareStrokeOrderAnimation() {
        const container = document.getElementById('strokeOrderContainer');
        if (!container) return;

        const svg = container.querySelector('svg');
        if (!svg) return;

        svg.setAttribute('viewBox', svg.getAttribute('viewBox') || '0 0 109 109');
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        //svg.style.color = getComputedStyle(document.documentElement).getPropertyValue('--primary-color').trim() || '#6200EE';

        const paths = Array.from(svg.querySelectorAll('path'));
        paths.forEach((path) => {
            const length = path.getTotalLength ? path.getTotalLength() : 0;
            path.style.strokeDasharray = `${length}`;
            // Keep the character fully drawn and visible on initial widget load
            path.style.strokeDashoffset = '0';
            path.style.opacity = '1';
            path.style.transition = 'none';
        });
    }

    playStrokeOrderAnimation() {
        const container = document.getElementById('strokeOrderContainer');
        if (!container) return;

        const svg = container.querySelector('svg');
        if (!svg) return;

        this.stopStrokeOrderAnimation();

        const paths = Array.from(svg.querySelectorAll('path'));
        if (paths.length === 0) return;

        // Increased multiplier to make the drawing pace significantly more relaxed and legible
        const msPerUnitLength = 7.2;
        let index = 0;

        // Reset all paths to completely hidden states right before the animation sequence kicks off
        paths.forEach((path) => {
            const length = path.getTotalLength ? path.getTotalLength() : 0;
            path.style.transition = 'none';
            path.style.strokeDashoffset = `${length}`;
            path.style.opacity = '0';
        });

        const step = () => {
            if (index >= paths.length) {
                this.strokeOrderTimer = null;
                return;
            }

            const path = paths[index];
            const length = path.getTotalLength ? path.getTotalLength() : 0;

            // Make sure the stroke properties are fully reset before drawing
            path.style.transition = 'none';
            path.style.strokeDasharray = `${length}`;
            path.style.strokeDashoffset = `${length}`;
            path.style.opacity = '0';

            // CRITICAL: Force a browser layout reflow so it registers the starting hidden state
            path.getBoundingClientRect();

            // Give tiny strokes a comfortable minimum duration so they don't flash too fast
            const dynamicDuration = Math.max(250, length * msPerUnitLength);

            // Animate stroke-dashoffset linearly, and make opacity kick in instantly
            path.style.transition = `stroke-dashoffset ${dynamicDuration}ms linear, opacity 50ms ease`;
            path.style.opacity = '1';
            path.style.strokeDashoffset = '0';

            index += 1;

            // Wait for the path to finish its drawing window cleanly before moving to the next stroke
            this.strokeOrderTimer = window.setTimeout(step, dynamicDuration + 100);
        };

        // Minor layout engine kick-off execution
        svg.getBoundingClientRect();
        step();
    }
        // const duration = 220;
        // let index = 0;

        // const step = () => {
        //     if (index >= paths.length) {
        //         this.strokeOrderTimer = null;
        //         return;
        //     }

        //     const path = paths[index];
        //     const length = path.getTotalLength ? path.getTotalLength() : 0;
        //     const drawLength = length > 0 ? length * 3 : 0;
        //     path.style.transition = `stroke-dashoffset ${duration}ms linear, opacity ${duration / 2}ms ease`;
        //     path.style.opacity = '1';
        //     path.style.strokeDasharray = `${drawLength}`;
        //     path.style.strokeDashoffset = '0';
        //     path.getBoundingClientRect();
        //     index += 1;
        //     this.strokeOrderTimer = window.setTimeout(step, duration + 40);
        // };

    stopStrokeOrderAnimation() {
        if (this.strokeOrderTimer) {
            window.clearTimeout(this.strokeOrderTimer);
            this.strokeOrderTimer = null;
        }

        const container = document.getElementById('strokeOrderContainer');
        if (!container) return;

        const svg = container.querySelector('svg');
        if (!svg) return;

        Array.from(svg.querySelectorAll('path')).forEach((path) => {
            const length = path.getTotalLength ? path.getTotalLength() : 0;
            const drawLength = length > 0 ? length * 3 : 0;
            path.style.transition = 'none';
            path.style.opacity = '0';
            path.style.strokeDasharray = `${drawLength}`;
            path.style.strokeDashoffset = `${drawLength}`;
        });
    }

    updateProgress() {
        const progress = StorageManager.getProgress();

        // FIX: Create a quick lookup set of the characters currently on screen
        const currentLevelChars = new Set(this.currentKanjiPool.map(k => k.character));

        // FIX: Only count mastered items if they exist in the CURRENT level pool
        const masteredInThisLevel = progress.mastered.filter(char => currentLevelChars.has(char)).length;

        const totalCount = this.currentKanjiPool.length || 0;
        const levelLabel = this.settings.jlptLevel === 'all' ? 'all levels' : `${this.settings.jlptLevel} level`;

        const progressStats = document.getElementById('progressStats');
        if (progressStats) {
            // Update UI to use the filtered local count
            progressStats.textContent = `${masteredInThisLevel} mastered | ${totalCount} total (${levelLabel})`;
        }

        // The Math.min fail-safe you already had will now work perfectly
        const progressPercentage = totalCount > 0 ? Math.min((masteredInThisLevel / totalCount) * 100, 100) : 0;

        // Grab the fill element and set its width
        const progressFill = document.getElementById('progressFill');
        progressFill.style.width = `${progressPercentage}%`;

        // --- NEW: Generate and Update the Tooltip ---
        let tooltip = progressFill.querySelector('.progress-tooltip');
        if (!tooltip) {
            tooltip = document.createElement('span');
            tooltip.className = 'progress-tooltip';
            progressFill.appendChild(tooltip);
        }
        tooltip.textContent = `${Math.round(progressPercentage)}%`;
        // --------------------------------------------

        // The Milestone Triggers
        const progressBar = document.querySelector('.progress-bar');

        // 50% Trigger
        if (progressPercentage >= 50) {
            progressBar.classList.add('past-midpoint');
        } else {
            progressBar.classList.remove('past-midpoint');
        }

        // 100% Trigger
        if (progressPercentage === 100) {
            progressBar.classList.add('is-complete');
        } else {
            progressBar.classList.remove('is-complete');
        }
    }
    
    // Analyzes the date to see if the streak is active, broken, or needs incrementing
    updateStreak() {
        let streak = parseInt(localStorage.getItem('dailyStreak') || '0');
        let lastStudyDate = localStorage.getItem('lastStudyDate');
        const today = new Date().toDateString();

        if (lastStudyDate === today) {
            // Already studied today, just ensure the UI is updated
            this.renderStreak(streak);
            return;
        }

        if (lastStudyDate) {
            const last = new Date(lastStudyDate);
            const current = new Date(today);
            const diffTime = Math.abs(current - last);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays === 1) {
                // Consecutive day! 
                streak += 1;
                this.showToast(`🔥 Streak increased to ${streak} days! Keep it up!`);
            } else {
                // Streak broken
                streak = 1;
                this.showToast(`Streak reset. Let's build a new one!`);
            }
        } else {
            // Very first time studying
            streak = 1;
        }

        // Save progress to memory
        localStorage.setItem('dailyStreak', streak);
        localStorage.setItem('lastStudyDate', today);
        this.renderStreak(streak);
    }

    // Handles the visual UI state of the fire badge
    renderStreak(streakValue = null) {
        if (streakValue === null) {
            streakValue = parseInt(localStorage.getItem('dailyStreak') || '0');
            const lastStudyDate = localStorage.getItem('lastStudyDate');
            const today = new Date().toDateString();

            // If it's been more than 1 day, the streak is technically 0 until they study again
            if (lastStudyDate) {
                const last = new Date(lastStudyDate);
                const current = new Date(today);
                const diffTime = Math.abs(current - last);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                if (diffDays > 1) {
                    streakValue = 0;
                }
            }
        }

        const streakCount = document.getElementById('streakCount');
        const streakBadge = document.getElementById('streakBadge');

        if (streakCount) streakCount.textContent = streakValue;

        if (streakBadge) {
            if (streakValue === 0) {
                streakBadge.classList.add('inactive');
            } else {
                streakBadge.classList.remove('inactive');
            }
        }
    }

    loadRecentKanji() {
        const allRecent = StorageManager.getRecent();
        const container = document.getElementById('recentKanji');

        if (!container) return;

        // 1. Filter by current level pool to prevent cross-level bugs
        const currentLevelChars = new Set(this.currentKanjiPool.map(k => k.character));
        const filteredRecent = allRecent.filter(item => currentLevelChars.has(item.character));

        // 2. Dynamically update the section header text
        const sectionHeader = container.previousElementSibling;
        const levelName = this.settings.jlptLevel;

        if (sectionHeader) {
            if (levelName === 'Hiragana' || levelName === 'Katakana') {
                sectionHeader.textContent = `Recently Studied ${levelName}`;
            } else if (levelName === 'all') {
                sectionHeader.textContent = `Recently Studied (All Levels)`;
            } else {
                sectionHeader.textContent = `Recently Studied ${levelName} Kanji`;
            }
        }

        // 3. Render the filtered items
        if (filteredRecent.length === 0) {
            container.innerHTML = `<p style="text-align: center; opacity: 0.6;">No recently studied items for ${levelName} yet.</p>`;
            return;
        }

        container.innerHTML = filteredRecent.map(item => `
            <div class="recent-item" onclick="app.showKanjiFromRecent('${item.character}')">
                <div class="recent-kanji japanese-text">${item.character}</div>
                <div class="recent-meaning">${item.meanings.slice(0, 2).join(', ')}</div>
            </div>
        `).join('');
    }

    async showKanjiFromRecent(character) {
        try {
            // Find the kanji in our data
            const availableKanji = await KanjiData.getKanjiByLevel(this.settings.jlptLevel);
            let foundKanji = availableKanji.find(k => k.character === character);

            // If not found in current level, search in all levels
            if (!foundKanji) {
                const allLevels = ['N5', 'N4', 'N3', 'N2', 'N1'];
                for (const level of allLevels) {
                    const levelKanji = await KanjiData.getKanjiByLevel(level);
                    foundKanji = levelKanji.find(k => k.character === character);
                    if (foundKanji) break;
                }
            }

            if (foundKanji) {
                // THE FIX: Hydrate before rendering!
                // const isKana = foundKanji.jlpt === 'Hiragana' || foundKanji.jlpt === 'Katakana';
                // if (!isKana && (!foundKanji.onyomi || foundKanji.onyomi.length === 0) && (!foundKanji.kunyomi || foundKanji.kunyomi.length === 0)) {
                //     try {
                //         const details = await KanjiData.fetchKanjiDetails(foundKanji.character);
                //         if (details) {
                //             foundKanji.meanings = details.meanings;
                //             foundKanji.onyomi = details.onyomi;
                //             foundKanji.kunyomi = details.kunyomi;
                //             foundKanji.examples = details.examples;
                //         }
                //     } catch (err) {
                //         console.error("Hydration failed from recent:", err);
                //     }
                // }

                this.currentKanji = foundKanji;
                this.renderKanji();
                this.renderKanjiJourney();
                this.showToast(`Showing details for "${character}"`);

                // Scroll to widget
                document.getElementById('kanjiWidget').scrollIntoView({
                    behavior: 'smooth',
                    block: 'center'
                });

                //Auto-play the audio if the setting is enabled
                if (this.settings.autoPlay) {
                    setTimeout(() => this.playPronunciation(), 800);
                }

            } else {
                this.showToast(`Could not find details for "${character}"`);
            }
        } catch (error) {
            console.error('Error showing kanji from recent:', error);
            this.showToast(`Error loading "${character}"`);
        }
    }
    
    openSettings() {
        const modal = document.getElementById('settingsModal');
        modal.classList.add('show');
        
        // Load current settings
        document.getElementById('jlptLevel').value = this.settings.jlptLevel;
        document.getElementById('autoPlay').checked = this.settings.autoPlay;
        document.getElementById('showFurigana').checked = this.settings.showFurigana;
        document.getElementById('kanjiFont').value = this.settings.kanjiFont;
        document.getElementById('fontSize').value = this.settings.fontSize;
        document.getElementById('defaultAudio').value = this.settings.defaultAudio;
        document.getElementById('localBackupFreq').value = this.settings.localBackupFreq;
        document.getElementById('onlineBackupFreq').value = this.settings.onlineBackupFreq;
        
        // Update font preview active state
        this.updateFontPreviewActive();
    }

    closeSettings() {
        const modal = document.getElementById('settingsModal');
        modal.classList.remove('show');
    }

    resetProgress() {
        if (confirm('Are you sure you want to reset all progress? This cannot be undone.')) {
            StorageManager.resetProgress();
            this.updateProgress();
            this.renderKanjiJourney();
            this.loadRecentKanji();
            this.loadCurrentKanji();
            this.showToast('Progress reset successfully');
            this.closeSettings();
        }
    }

    // Sets the theme, saves it, and updates the UI
    setTheme(themeName) {
        document.documentElement.setAttribute('data-theme', themeName);
        localStorage.setItem('theme', themeName);

        // Define which themes are "dark"
        const darkThemes = ['dark', 'nord', 'midnight', 'forest', 'nami', 'lumen', 'obake', 'ito'];

        // Save history so the toggle remembers
        if (darkThemes.includes(themeName)) {
            localStorage.setItem('lastDarkTheme', themeName);
        } else {
            localStorage.setItem('lastLightTheme', themeName);
        }

        // NEW FIX: Bulletproof WebGL & Timer Kill Switches!
        if (typeof namiAnimationId !== 'undefined' && namiAnimationId) { cancelAnimationFrame(namiAnimationId); namiAnimationId = null; }
        if (typeof lumenAnimationId !== 'undefined' && lumenAnimationId) { cancelAnimationFrame(lumenAnimationId); lumenAnimationId = null; }
        if (typeof obakeAnimationId !== 'undefined' && obakeAnimationId) { cancelAnimationFrame(obakeAnimationId); obakeAnimationId = null; }
        if (typeof itoAnimationId !== 'undefined' && itoAnimationId) { cancelAnimationFrame(itoAnimationId); itoAnimationId = null; }
        if (typeof itoIntervalId !== 'undefined' && itoIntervalId) { clearInterval(itoIntervalId); itoIntervalId = null; }

        // NEW: Automatically boot the WebGL wave.
        if (themeName === 'nami') {
            initNamiWave();
        }
        else if (themeName === 'lumen') {
            initLumenWave();
        }
        else if (themeName === 'obake') {
            initObakeGhost();
        }
        else if (themeName === 'ito') {
            initItoTubes();
        }
        else if (themeName.startsWith('custom-')) {
            const slot = themeName.replace('custom-', '');
            this.loadCustomTheme(slot);
        }
        // Update the dropdown selector
        const select = document.getElementById('themeSelect');
        if (select) select.value = themeName;

        // Update the top toggle icon (custom themes carry their own saved mode)
        const icon = document.querySelector('#themeToggle i');
        if (icon) {
            let isDark = darkThemes.includes(themeName);
            if (themeName.startsWith('custom-')) {
                const slot = themeName.replace('custom-', '');
                const saved = localStorage.getItem(`customTheme:slot${slot}:settings`);
                isDark = saved ? JSON.parse(saved).mode === 'dark' : true;
            }
            icon.className = isDark ? 'fas fa-moon' : 'fas fa-sun';
        }
    }

    async loadCustomTheme(slot) {
        const settingsRaw = localStorage.getItem(`customTheme:slot${slot}:settings`);
        if (!settingsRaw) return; // nothing saved for this slot yet

        const settings = JSON.parse(settingsRaw);
        const blob = await getCustomThemeImage(slot);
        const imageUrl = blob ? URL.createObjectURL(blob) : null;

        this.applyCustomThemeStyles(imageUrl, settings.blur, settings.accent, settings.mode);
    }

    applyCustomThemeStyles(imageUrl, blurPx, accentHex, mode) {
        const root = document.documentElement;
        root.setAttribute('data-custom-mode', mode);

        if (imageUrl) {
            root.style.setProperty('--custom-bg-image', `url(${imageUrl})`);
        }
        root.style.setProperty('--custom-blur', `${blurPx}px`);

        const rgb = hexToRgb(accentHex);
        root.style.setProperty('--custom-accent', accentHex);
        root.style.setProperty('--custom-accent-rgb', `${rgb.r}, ${rgb.g}, ${rgb.b}`);
    }

    // Loads the saved theme on startup (Defaulting to 'candy' for new users)
    applyTheme() {
        const savedTheme = localStorage.getItem('theme') || 'nami';
        this.setTheme(savedTheme);
    }

    loadSettings() {
        const saved = localStorage.getItem('kanjiSettings');
        if (saved) {
            this.settings = { ...this.settings, ...JSON.parse(saved) };
        }

        // PREMIUM UPGRADE: Load the KanjiAlive key into the UI and Audio Manager
        // if (this.settings.kanjiAliveKey !== undefined) {
        //     const keyInput = document.getElementById('kanjiAliveKey');
        //     if (keyInput) {
        //         keyInput.value = this.settings.kanjiAliveKey;
        //     }
        //     // Give the key directly to our audio manager
        //     if (window.AudioManager) {
        //         AudioManager.setApiKey(this.settings.kanjiAliveKey);
        //     }
        // }
    }

    saveSettings() {
        // PREMIUM UPGRADE: Grab the key from the UI before saving
        // const keyInput = document.getElementById('kanjiAliveKey');
        // if (keyInput) {
        //     this.settings.kanjiAliveKey = keyInput.value.trim();
        //     if (window.AudioManager) {
        //         AudioManager.setApiKey(this.settings.kanjiAliveKey);
        //     }
        // }

        localStorage.setItem('kanjiSettings', JSON.stringify(this.settings));
    }

    applyFontSettings() {
        const widget = document.getElementById('kanjiWidget');
        const appContainer = document.querySelector('.app-container');
        
        // Remove existing font and size classes
        appContainer.classList.remove('font-size-small', 'font-size-medium', 'font-size-large', 'font-size-extra-large');
        widget.classList.remove('font-klee-one', 'font-noto-sans-jp', 'font-zen-antique', 'font-zen-maru-gothic', 'font-hannari', 'font-kokoro',
                                'font-hiragino-sans', 'font-yu-gothic', 'font-meiryo', 'font-ms-gothic');
        
        // Apply font size class
        appContainer.classList.add(`font-size-${this.settings.fontSize}`);
        
        // Apply font family class or style
        const fontClassMap = {
            'Klee One': 'font-klee-one',
            'Noto Sans JP': 'font-noto-sans-jp',
            'Zen Antique': 'font-zen-antique',
            'Zen Maru Gothic': 'font-zen-maru-gothic',
            'Hannari': 'font-hannari',
            'Kokoro': 'font-kokoro',
            'Hiragino Sans': 'font-hiragino-sans',
            'Yu Gothic': 'font-yu-gothic',
            'Meiryo': 'font-meiryo',
            'MS Gothic': 'font-ms-gothic'
        };

        if (fontClassMap[this.settings.kanjiFont]) {
            widget.classList.add(fontClassMap[this.settings.kanjiFont]);
            widget.style.removeProperty('--japanese-font');
        } else if (this.settings.kanjiFont !== 'Noto Sans JP') {
            widget.style.setProperty('--japanese-font', `'${this.settings.kanjiFont}', 'Noto Sans JP', sans-serif`);
        } else {
            widget.style.removeProperty('--japanese-font');
        }
    }

    updateFontPreviewActive() {
        // Set the active state on the font preview grid
        const fontOptions = document.querySelectorAll('.font-option');
        fontOptions.forEach(option => {
            option.classList.remove('active');
            if (option.getAttribute('data-font') === this.settings.kanjiFont) {
                option.classList.add('active');
            }
        });
        // Also update hidden input
        const hiddenInput = document.getElementById('kanjiFont-hidden');
        if (hiddenInput) {
            hiddenInput.value = this.settings.kanjiFont;
        }
    }

    createLocalBackup() {
        try {
            const backupData = StorageManager.exportData();
            const blob = new Blob([backupData], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `kanji-backup-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            // Update last backup time
            localStorage.setItem('lastLocalBackup', Date.now().toString());
            this.showToast('Local backup created successfully!');
            
        } catch (error) {
            console.error('Error creating backup:', error);
            this.showToast('Error creating backup. Please try again.');
        }
    }

    restoreLocalBackup(file) {
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const success = StorageManager.importData(e.target.result);
                if (success) {
                    this.showToast('Backup restored successfully! Reloading...');
                    setTimeout(() => {
                        location.reload();
                    }, 2000);
                } else {
                    this.showToast('Error restoring backup. Invalid file format.');
                }
            } catch (error) {
                console.error('Error restoring backup:', error);
                this.showToast('Error restoring backup. Please check the file.');
            }
        };
        reader.readAsText(file);
    }

    scheduleBackups() {
        // Clear existing timers
        if (this.localBackupTimer) {
            clearInterval(this.localBackupTimer);
        }
        if (this.onlineBackupTimer) {
            clearInterval(this.onlineBackupTimer);
        }

        // Schedule local backups
        if (this.settings.localBackupFreq !== 'never') {
            const intervals = {
                'daily': 24 * 60 * 60 * 1000,
                'weekly': 7 * 24 * 60 * 60 * 1000,
                'monthly': 30 * 24 * 60 * 60 * 1000
            };
            
            const interval = intervals[this.settings.localBackupFreq];
            if (interval) {
                this.localBackupTimer = setInterval(() => {
                    this.autoCreateBackup();
                }, interval);
                
                // Check if backup is due on startup
                this.checkBackupDue();
            }
        }

        // Online backup would be implemented here with cloud storage API
        if (this.settings.onlineBackupFreq !== 'never') {
            this.showToast('Online backup feature coming soon!');
        }
    }

    checkBackupDue() {
        const lastBackup = localStorage.getItem('lastLocalBackup');
        if (!lastBackup) {
            // First time - create backup
            this.autoCreateBackup();
            return;
        }

        const lastBackupTime = parseInt(lastBackup);
        const now = Date.now();
        const intervals = {
            'daily': 24 * 60 * 60 * 1000,
            'weekly': 7 * 24 * 60 * 60 * 1000,
            'monthly': 30 * 24 * 60 * 60 * 1000
        };

        const interval = intervals[this.settings.localBackupFreq];
        if (interval && (now - lastBackupTime) >= interval) {
            this.autoCreateBackup();
        }
    }

    autoCreateBackup() {
        try {
            const backupData = StorageManager.exportData();
            localStorage.setItem(`autoBackup_${Date.now()}`, backupData);
            localStorage.setItem('lastLocalBackup', Date.now().toString());
            
            // Keep only last 5 auto backups
            const keys = Object.keys(localStorage).filter(key => key.startsWith('autoBackup_'));
            if (keys.length > 5) {
                keys.sort().slice(0, -5).forEach(key => {
                    localStorage.removeItem(key);
                });
            }
            
            console.log('Auto backup created');
        } catch (error) {
            console.error('Error creating auto backup:', error);
        }
    }

    showToast(message, isHTML = false) {
        const toast = document.getElementById('toast');
        const messageEl = document.getElementById('toastMessage');

        if (isHTML) {
            messageEl.innerHTML = message;
        } else {
            messageEl.textContent = message;
        }

        toast.classList.add('show');

        // Clear any existing timeout so the toast doesn't disappear early if spammed
        if (this.toastTimeout) clearTimeout(this.toastTimeout);

        // Bumped to 4 seconds to give the user time to click 'Undo'
        this.toastTimeout = setTimeout(() => {
            toast.classList.remove('show');
        }, 4000);
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new KanjiLearningApp();
});

// Service Worker registration for offline support
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                console.log('SW registered: ', registration);
            })
            .catch(registrationError => {
                console.log('SW registration failed: ', registrationError);
            });
    });
}
// ==========================================
// 波 (NAMI) THEME: MOON LAKE SHADER
// ==========================================

function initNamiWave() {
    const container = document.getElementById('nami-canvas-container');
    if (container.innerHTML !== '') {
        if (!namiAnimationId && window.namiRenderLoop) window.namiRenderLoop();
        return;
    }
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 2, 6);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    // Caps it at 1 for mobile to save battery and GPU, allows up to 2 on Desktop
    const pixelCap = window.innerWidth < 768 ? 1 : Math.min(window.devicePixelRatio, 2);
    renderer.setPixelRatio(pixelCap);
    container.appendChild(renderer.domElement);

    const geometry = new THREE.PlaneGeometry(30, 15, 128, 128);
    geometry.rotateX(-Math.PI / 2);

    const waveMaterial = new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 } },
        vertexShader: `
            uniform float uTime;
            varying vec2 vUv;
            varying float vElevation;

            void main() {
                vUv = uv;
                vec4 modelPosition = modelMatrix * vec4(position, 1.0);
                float elevation = sin(modelPosition.x * 0.6 + uTime * 1.5) * 0.4
                                + sin(modelPosition.z * 0.5 + uTime * 1.2) * 0.4;
                modelPosition.y += elevation;
                vElevation = elevation;
                gl_Position = projectionMatrix * viewMatrix * modelPosition;
            }
        `,
        fragmentShader: `
            varying vec2 vUv;
            varying float vElevation;

            void main() {
                float mixStrength = (vElevation + 1.0) * 0.5;
                vec3 colorCyan = vec3(0.0, 0.898, 1.0);
                vec3 colorMagenta = vec3(1.0, 0.0, 1.0);
                vec3 finalColor = mix(colorCyan, colorMagenta, mixStrength);
                
                float edgeAlpha = smoothstep(0.0, 0.2, vUv.y) * smoothstep(1.0, 0.8, vUv.y) *
                                  smoothstep(0.0, 0.2, vUv.x) * smoothstep(1.0, 0.8, vUv.x);
                
                float glow = smoothstep(0.0, 0.5, vElevation) * 0.6;
                gl_FragColor = vec4(finalColor + glow, edgeAlpha * 0.85); 
            }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide
    });

    const waveMesh = new THREE.Mesh(geometry, waveMaterial);
    scene.add(waveMesh);

    const clock = new THREE.Clock();

    window.namiRenderLoop = function () {
        if (document.documentElement.getAttribute('data-theme') === 'nami') {
            const time = clock.getElapsedTime();
            waveMaterial.uniforms.uTime.value = time;
            camera.position.x = Math.sin(time * 0.2) * 1.5;
            camera.position.z = 6 + Math.cos(time * 0.2) * 1.5;
            camera.lookAt(0, 0, 0);
            renderer.render(scene, camera);
        }
        namiAnimationId = requestAnimationFrame(window.namiRenderLoop);
    };
    window.namiRenderLoop();

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
}

// ==========================================
// LUMEN THEME: CHROMATIC ABERRATION WAVE
// ==========================================

function initLumenWave() {
    const container = document.getElementById('lumen-canvas-container');

    // Restart the loop if it already exists!
    if (container.innerHTML !== '') {
        if (!lumenAnimationId && window.lumenRenderLoop) window.lumenRenderLoop();
        return;
    }

    // 1. Setup Scene, Orthographic Camera, and Renderer
    const scene = new THREE.Scene();

    // An Orthographic camera is used here because this is a 2D flat shader effect
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });

    // NEW: Cap the pixel ratio at 1 for mobile devices (screens narrower than 768px)
    // to save battery and GPU, but allow up to 2 on Desktop for crispness.
    const pixelCap = window.innerWidth < 768 ? 1 : Math.min(window.devicePixelRatio, 2);
    renderer.setPixelRatio(pixelCap);

    renderer.setSize(window.innerWidth, window.innerHeight);
    // Sets the clear color to transparent so it blends with your CSS background
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);


    // 2. Create the flat geometry covering the screen
    const position = [
        -1.0, -1.0, 0.0,
        1.0, -1.0, 0.0,
        -1.0, 1.0, 0.0,
        1.0, -1.0, 0.0,
        -1.0, 1.0, 0.0,
        1.0, 1.0, 0.0
    ];
    const positions = new THREE.BufferAttribute(new Float32Array(position), 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", positions);

    // 3. Define the Uniforms (Variables passed to the shader)
    const uniforms = {
        resolution: { type: "v2", value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
        time: { type: "f", value: 0.0 },
        xScale: { type: "f", value: 1.0 },
        yScale: { type: "f", value: 0.5 },
        distortion: { type: "f", value: 0.050 }
    };

    // 4. Create the Shader Material (Yuki's CodePen Math)
    const material = new THREE.RawShaderMaterial({
        uniforms: uniforms,
        side: THREE.DoubleSide,
        transparent: true,
        vertexShader: `
        attribute vec3 position;
        void main() {
        gl_Position = vec4(position, 1.0);
        }
        `,
        fragmentShader: `
        precision highp float;
        uniform vec2 resolution;
        uniform float time;
        uniform float xScale;
        uniform float yScale;
        uniform float distortion;

        void main() {
            // Normalize pixel coordinates
            vec2 p = (gl_FragCoord.xy * 2.0 - resolution) / min(resolution.x, resolution.y);

            // Calculate distortion for chromatic aberration
            float d = length(p) * distortion;
            float rx = p.x * (1.0 + d);
            float gx = p.x;
            float bx = p.x * (1.0 - d);

            // Calculate the sine waves for RGB channels
            float r = 0.05 / abs(p.y + sin((rx + time) * xScale) * yScale);
            float g = 0.05 / abs(p.y + sin((gx + time) * xScale) * yScale);
            float b = 0.05 / abs(p.y + sin((bx + time) * xScale) * yScale);
            
            gl_FragColor = vec4(r, g, b, 1.0);
        }
        `
    });

    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    // 5. Battery-Optimized Render Loop
    window.lumenRenderLoop = function () {
        if (document.documentElement.getAttribute('data-theme') === 'lumen') {
            uniforms.time.value += 0.01; // Progress the animation time
            renderer.render(scene, camera);
        }
        lumenAnimationId = requestAnimationFrame(window.lumenRenderLoop);
    };
    window.lumenRenderLoop();

    // 6. Handle Window Resizing smoothly
    window.addEventListener('resize', () => {
        const width = window.innerWidth;
        const height = window.innerHeight;
        renderer.setSize(width, height);
        // Update the shader's resolution uniform so the wave doesn't stretch
        uniforms.resolution.value.set(width, height);
    });
}
// ==========================================
// お化け (OBAKE) THEME: SPECTRAL GHOST
// ==========================================

function initObakeGhost() {
    const container = document.getElementById('obake-canvas-container');
    // Restart the loop if it already exists!
    if (container.innerHTML !== '') {
        if (!obakeAnimationId && window.obakeRenderLoop) window.obakeRenderLoop();
        return;
    }

    // 1. Setup Scene & Camera
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 20;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    // Caps it at 1 for mobile to save battery and GPU, allows up to 2 on Desktop
    const pixelCap = window.innerWidth < 768 ? 1 : Math.min(window.devicePixelRatio, 2);
    renderer.setPixelRatio(pixelCap);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9;
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    // 2. Setup Post-Processing (Bloom + VHS Glitch)
    const composer = new THREE.EffectComposer(renderer);
    const renderPass = new THREE.RenderPass(scene, camera);
    composer.addPass(renderPass);

    const bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.3, 1.25, 0.0);
    composer.addPass(bloomPass);

    const analogDecayShader = {
        uniforms: {
            tDiffuse: { value: null }, uTime: { value: 0.0 }, uAnalogGrain: { value: 0.4 },
            uAnalogBleeding: { value: 1.0 }, uAnalogVSync: { value: 1.0 }, uAnalogScanlines: { value: 1.0 },
            uAnalogVignette: { value: 1.0 }, uAnalogJitter: { value: 0.4 }, uAnalogIntensity: { value: 0.6 }
        },
        vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `
            uniform sampler2D tDiffuse; uniform float uTime; uniform float uAnalogGrain;
            uniform float uAnalogBleeding; uniform float uAnalogVSync; uniform float uAnalogScanlines;
            uniform float uAnalogVignette; uniform float uAnalogJitter; uniform float uAnalogIntensity;
            varying vec2 vUv;
            float random(vec2 st) { return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123); }
            float gaussian(float z, float u, float o) { return (1.0 / (o * sqrt(2.0 * 3.1415))) * exp(-(((z - u) * (z - u)) / (2.0 * (o * o)))); }
            vec3 grain(vec2 uv, float time, float intensity) {
                float seed = dot(uv, vec2(12.9898, 78.233));
                float noise = fract(sin(seed) * 43758.5453 + time * 2.0);
                return vec3(gaussian(noise, 0.0, 0.25)) * intensity;
            }
            void main() {
                vec2 uv = vUv; float time = uTime * 1.8; vec2 jitteredUV = uv;
                if (uAnalogJitter > 0.01) {
                    jitteredUV.x += (random(vec2(floor(time * 60.0))) - 0.5) * 0.003 * uAnalogJitter * uAnalogIntensity;
                    jitteredUV.y += (random(vec2(floor(time * 30.0) + 1.0)) - 0.5) * 0.001 * uAnalogJitter * uAnalogIntensity;
                }
                if (uAnalogVSync > 0.01) {
                    float vsyncRoll = sin(time * 2.0 + uv.y * 100.0) * 0.02 * uAnalogVSync * uAnalogIntensity;
                    jitteredUV.y += vsyncRoll * step(0.95, random(vec2(floor(time * 4.0))));
                }
                vec4 color = texture2D(tDiffuse, jitteredUV);
                if (uAnalogBleeding > 0.01) {
                    float bleed = 0.012 * uAnalogBleeding * uAnalogIntensity;
                    float phase = time * 1.5 + uv.y * 20.0;
                    color.r = texture2D(tDiffuse, jitteredUV + vec2(sin(phase) * bleed, 0.0)).r;
                    color.b = texture2D(tDiffuse, jitteredUV + vec2(-sin(phase * 1.1) * bleed * 0.8, 0.0)).b;
                }
                if (uAnalogGrain > 0.01) color.rgb += grain(uv, time, 0.075 * uAnalogGrain * uAnalogIntensity) * (1.0 - color.rgb);
                if (uAnalogScanlines > 0.01) {
                    float freq = 600.0 + uAnalogScanlines * 400.0;
                    color.rgb *= (1.0 - (sin(uv.y * freq) * 0.5 + 0.5) * 0.1 * uAnalogScanlines * uAnalogIntensity);
                }
                if (uAnalogVignette > 0.01) {
                    vec2 vigUV = (uv - 0.5) * 2.0;
                    color.rgb *= 1.0 - dot(vigUV, vigUV) * 0.3 * uAnalogVignette * uAnalogIntensity;
                }
                gl_FragColor = color;
            }
        `
    };
    const analogDecayPass = new THREE.ShaderPass(analogDecayShader);
    composer.addPass(analogDecayPass);

    // 3. Build the Ghost
    const ghostGroup = new THREE.Group();
    scene.add(ghostGroup);

    const ghostGeometry = new THREE.SphereGeometry(2, 40, 40);
    const positions = ghostGeometry.getAttribute("position").array;
    for (let i = 0; i < positions.length; i += 3) {
        if (positions[i + 1] < -0.2) {
            const x = positions[i]; const z = positions[i + 2];
            positions[i + 1] = -2.0 + Math.sin(x * 5) * 0.35 + Math.cos(z * 4) * 0.25 + Math.sin((x + z) * 3) * 0.15;
        }
    }
    ghostGeometry.computeVertexNormals();

    const ghostMaterial = new THREE.MeshStandardMaterial({
        color: 0x0f2027, transparent: true, opacity: 0.88,
        emissive: 0xbb86fc, emissiveIntensity: 5.8, // NEW: Soft glowing purple
        roughness: 0.02, side: THREE.DoubleSide
    });
    const ghostBody = new THREE.Mesh(ghostGeometry, ghostMaterial);
    ghostGroup.add(ghostBody);

    // Ghost Eyes
    const eyeGeom = new THREE.SphereGeometry(0.3, 12, 12);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x03dac6 }); // Soft Teal eyes
    const leftEye = new THREE.Mesh(eyeGeom, eyeMat); leftEye.position.set(-0.7, 0.6, 2.0);
    const rightEye = new THREE.Mesh(eyeGeom, eyeMat); rightEye.position.set(0.7, 0.6, 2.0);
    ghostGroup.add(leftEye); ghostGroup.add(rightEye);

    // 4. Fireflies
    const fireflies = [];
    const fireflyGroup = new THREE.Group();
    scene.add(fireflyGroup);

    for (let i = 0; i < 20; i++) {
        const fireflyGeometry = new THREE.SphereGeometry(0.03, 4, 4);
        const fireflyMaterial = new THREE.MeshBasicMaterial({ color: 0xffff44, transparent: true, opacity: 0.9 });
        const firefly = new THREE.Mesh(fireflyGeometry, fireflyMaterial);

        firefly.position.set((Math.random() - 0.5) * 40, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 20);

        const glowGeometry = new THREE.SphereGeometry(0.12, 8, 8);
        const glowMaterial = new THREE.MeshBasicMaterial({ color: 0xffff88, transparent: true, opacity: 0.4, side: THREE.BackSide });
        const glow = new THREE.Mesh(glowGeometry, glowMaterial);
        firefly.add(glow);

        firefly.userData = {
            velocity: new THREE.Vector3((Math.random() - 0.5) * 0.04, (Math.random() - 0.5) * 0.04, (Math.random() - 0.5) * 0.04),
            phase: Math.random() * Math.PI * 2,
            pulseSpeed: 2 + Math.random() * 3,
            glowMaterial: glowMaterial,
            fireflyMaterial: fireflyMaterial
        };
        fireflyGroup.add(firefly);
        fireflies.push(firefly);
    }

    // Lighting
    scene.add(new THREE.AmbientLight(0x0a0a2e, 0.08));
    const rimLight1 = new THREE.DirectionalLight(0x4a90e2, 1.8); rimLight1.position.set(-8, 6, -4); scene.add(rimLight1);
    const rimLight2 = new THREE.DirectionalLight(0x50e3c2, 1.26); rimLight2.position.set(8, -4, -6); scene.add(rimLight2);

    // 5. Mouse Tracking Logic (Reverted to original perfect tracking)
    const mouse = new THREE.Vector2();

    window.addEventListener("mousemove", (e) => {
        if (document.documentElement.getAttribute('data-theme') === 'obake') {
            // Unrestricted, smooth tracking across the entire screen
            mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
            mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
        }
    });

    // 6. The Render Loop
    const clock = new THREE.Clock();
    window.obakeRenderLoop = function () {
        if (document.documentElement.getAttribute('data-theme') === 'obake') {
            const time = clock.getElapsedTime();
            analogDecayPass.uniforms.uTime.value = time;

            // Original pure math: Ghost cleanly snuggles up to the cursor's exact coordinates
            ghostGroup.position.x += (mouse.x * 11 - ghostGroup.position.x) * 0.075;
            ghostGroup.position.y += (mouse.y * 7 - ghostGroup.position.y) * 0.075;

            // Hover and wobble animation
            ghostGroup.position.y += Math.sin(time * 2.4) * 0.03 + Math.cos(time * 1.1) * 0.018;
            ghostBody.rotation.y = Math.sin(time * 1.4) * 0.05 * 0.35;

            const pulse = Math.sin(time * 1.6) * 0.6;
            ghostMaterial.emissiveIntensity = 5.8 + pulse + Math.sin(time * 0.6) * 0.12;

            // Firefly animation
            fireflies.forEach(firefly => {
                const data = firefly.userData;
                const pulsePhase = time + data.phase;
                const fireflyPulse = Math.sin(pulsePhase * data.pulseSpeed) * 0.4 + 0.6;

                data.glowMaterial.opacity = 2.6 * 0.4 * fireflyPulse;
                data.fireflyMaterial.opacity = 2.6 * 0.9 * fireflyPulse;

                data.velocity.x += (Math.random() - 0.5) * 0.002;
                data.velocity.y += (Math.random() - 0.5) * 0.002;
                data.velocity.z += (Math.random() - 0.5) * 0.002;
                data.velocity.clampLength(0, 0.04); // Speed limit

                firefly.position.add(data.velocity);

                // Keep fireflies on screen
                if (Math.abs(firefly.position.x) > 30) data.velocity.x *= -0.5;
                if (Math.abs(firefly.position.y) > 20) data.velocity.y *= -0.5;
                if (Math.abs(firefly.position.z) > 15) data.velocity.z *= -0.5;
            });

            composer.render();
        }
        obakeAnimationId = requestAnimationFrame(window.obakeRenderLoop);
    };
    window.obakeRenderLoop();

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        composer.setSize(window.innerWidth, window.innerHeight);
    });
}
// ==========================================
// 糸 (ITO) THEME: NEON THREADS CURSOR
// ==========================================

let itoState = {
    currentTubes: ["#f967fb", "#53bc28", "#6958d5"],
    currentLights: ["#83f36e", "#fe8a2e", "#ff008a", "#60aed5"],
    targetTubes: ["#f967fb", "#53bc28", "#6958d5"],
    targetLights: ["#83f36e", "#fe8a2e", "#ff008a", "#60aed5"],
    progress: 1,
    clickBound: false
};

// Math Helpers
const getRandomHex = () => "#" + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
const hexToRgb = (hex) => {
    const bigint = parseInt(hex.replace('#', ''), 16);
    return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 };
};

const rgbToHex = (r, g, b) => "#" + (1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1);

// Convert hex -> {h, s, l} so we can safely reason about a color's lightness
const hexToHsl = (hex) => {
    const { r, g, b } = hexToRgb(hex);
    const rn = r / 255, gn = g / 255, bn = b / 255;
    const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case rn: h = (gn - bn) / d + (gn < bn ? 6 : 0); break;
            case gn: h = (bn - rn) / d + 2; break;
            case bn: h = (rn - gn) / d + 4; break;
        }
        h /= 6;
    }
    return { h: h * 360, s: s * 100, l: l * 100 };
};

const hslToHex = (h, s, l) => {
    s /= 100; l /= 100;
    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const toHex = x => Math.round(x * 255).toString(16).padStart(2, '0');
    return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
};

// Nudges an accent color's lightness into a safe range for the given mode,
// so icons/buttons using --primary-color never disappear against the
// surface color. Hue and saturation are left untouched.
function sanitizeAccentColor(hex, mode) {
    const { h, s, l } = hexToHsl(hex);
    let safeL = l;

    if (mode === 'dark') {
        if (l < 35) safeL = 55;       // too dark to read on a dark surface
        else if (l > 92) safeL = 80;  // near-white can blend with light icon fills
    } else {
        if (l > 65) safeL = 45;       // too light to read on a light surface
        else if (l < 10) safeL = 25;  // near-black can blend with dark text/icons
    }

    if (safeL === l) return { hex, adjusted: false };
    return { hex: hslToHex(h, s, safeL), adjusted: true };
}

// Scans a downscaled copy of the image for the most "vibrant" pixel
// (high saturation, avoiding near-black/near-white) to use as an accent color.
function extractVibrantColor(imgElement) {
    const canvas = document.createElement('canvas');
    const size = 40; // small on purpose — this is a rough pick, not precision color science
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imgElement, 0, 0, size, size);

    let data;
    try {
        data = ctx.getImageData(0, 0, size, size).data;
    } catch (err) {
        return null; // shouldn't happen for local blob: URLs, but guard just in case
    }

    let best = null;
    let bestScore = -1;

    for (let i = 0; i < data.length; i += 4) {
        const alpha = data[i + 3];
        if (alpha < 200) continue; // skip transparent pixels

        const hex = rgbToHex(data[i], data[i + 1], data[i + 2]);
        const { s, l } = hexToHsl(hex);
        if (l < 15 || l > 90) continue; // skip near-black/near-white pixels

        const score = s * (1 - Math.abs(l - 55) / 55); // favor saturated, mid-lightness pixels
        if (score > bestScore) {
            bestScore = score;
            best = hex;
        }
    }

    return best;
}

function loadImageElement(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
    });
}

// Ties extraction + the existing contrast safety net together.
// Returns a safe hex string, or null if there's no image to work with.
async function autoPickAccentFromImage(mode) {
    const previewEl = document.getElementById('customThemePreview');
    const url = previewEl?.dataset.imageUrl;
    if (!url) return null;

    const img = await loadImageElement(url);
    const extracted = extractVibrantColor(img);
    if (!extracted) return null;

    return sanitizeAccentColor(extracted, mode).hex;
}

const lerpColor = (c1, c2, t) => {
    const r1 = hexToRgb(c1), r2 = hexToRgb(c2);
    const r = Math.round(r1.r + (r2.r - r1.r) * t);
    const g = Math.round(r1.g + (r2.g - r1.g) * t);
    const b = Math.round(r1.b + (r2.b - r1.b) * t);
    return rgbToHex(r, g, b);
};

window.triggerColorTransition = () => {
    if (itoState.progress >= 1) {
        itoState.targetTubes = [getRandomHex(), getRandomHex(), getRandomHex()];
        itoState.targetLights = [getRandomHex(), getRandomHex(), getRandomHex(), getRandomHex()];
        itoState.progress = 0;
    }
};

window.smoothColorLoop = () => {
    // HARD KILL SWITCH: If the theme isn't Ito, immediately kill the loop process!
    if (document.documentElement.getAttribute('data-theme') !== 'ito') return;

    if (itoAppInstance && itoState.progress < 1) {
        const easeT = itoState.progress < 0.5
            ? 2 * itoState.progress * itoState.progress
            : 1 - Math.pow(-2 * itoState.progress + 2, 2) / 2;

        const nextTubes = itoState.currentTubes.map((c, i) => lerpColor(c, itoState.targetTubes[i], easeT));
        const nextLights = itoState.currentLights.map((c, i) => lerpColor(c, itoState.targetLights[i], easeT));

        // Fail-safe to ensure the library's internal tubes object still exists
        if (itoAppInstance.tubes) {
            itoAppInstance.tubes.setColors(nextTubes);
            itoAppInstance.tubes.setLightsColors(nextLights);
        }

        itoState.progress += 0.015;

        if (itoState.progress >= 1) {
            itoState.progress = 1;
            itoState.currentTubes = [...itoState.targetTubes];
            itoState.currentLights = [...itoState.targetLights];
        }
    }

    itoAnimationId = requestAnimationFrame(window.smoothColorLoop);
};

async function initItoTubes() {
    const container = document.getElementById('ito-canvas-container');

    // THE FIX: The Nuke and Rebuild Strategy
    // Because this is a 3rd party black-box library, we cannot safely pause/resume it.
    // We completely wipe it and let it boot fresh into a visible container.
    container.innerHTML = '';

    if (itoAnimationId) { cancelAnimationFrame(itoAnimationId); itoAnimationId = null; }
    if (itoIntervalId) { clearInterval(itoIntervalId); itoIntervalId = null; }

    // If the library supports an internal memory cleanup method, call it.
    if (itoAppInstance && typeof itoAppInstance.destroy === 'function') {
        itoAppInstance.destroy();
    }
    itoAppInstance = null;

    const canvas = document.createElement('canvas');
    canvas.style.width = '100vw';
    canvas.style.height = '100vh';
    container.appendChild(canvas);

    try {
        const module = await import("https://cdn.jsdelivr.net/npm/threejs-components@0.0.19/build/cursors/tubes1.min.js");
        const TubesCursor = module.default;

        itoAppInstance = TubesCursor(canvas, {
            tubes: {
                colors: itoState.currentTubes,
                lights: { intensity: 200, colors: itoState.currentLights }
            }
        });

        window.smoothColorLoop();

        // Bind click event only once per page load to prevent 100x overlaps
        if (!itoState.clickBound) {
            window.addEventListener('click', (e) => {
                if (document.documentElement.getAttribute('data-theme') === 'ito' && itoAppInstance) {
                    if (e.target.closest('button') || e.target.closest('a') || e.target.closest('.level-option') || e.target.closest('.modal-content')) return;
                    window.triggerColorTransition();
                }
            });
            itoState.clickBound = true;
        }

        itoIntervalId = setInterval(() => {
            if (document.documentElement.getAttribute('data-theme') === 'ito' && itoAppInstance) {
                window.triggerColorTransition();
            }
        }, 5000);
    } catch (err) {
        console.error("Failed to load Ito Tubes theme:", err);
    }
}