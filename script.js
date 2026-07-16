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

        // Theme selector (The main control)
        document.getElementById('themeSelect').addEventListener('change', (e) => {
            this.setTheme(e.target.value);
        });

        // Theme toggle button (The "Quick Switcher")
        // This flips between your default light (candy) and default dark (dracula)
        // Theme toggle button (The "Quick Switcher")
        document.getElementById('themeToggle').addEventListener('click', () => {
            const current = localStorage.getItem('theme') || 'candy';
            const darkThemes = ['dark', 'dracula', 'nord', 'midnight', 'forest'];
            const isDark = darkThemes.includes(current);

            if (isDark) {
                // We were in dark mode, switch to the last used light theme (or default to candy)
                const lastLight = localStorage.getItem('lastLightTheme') || 'candy';
                this.setTheme(lastLight);
            } else {
                // We were in light mode, switch to the last used dark theme (or default to dark)
                const lastDark = localStorage.getItem('lastDarkTheme') || 'dark';
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
            content += `
                <div class="kanji-meaning">${this.currentKanji.meanings.join(', ')}</div>
                <div class="kanji-readings">
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
                    <button class="action-btn hint-btn" onclick="app.showPremiumHint()" style="background-color: #8A2BE2; color: white;"><i class="fas fa-lightbulb"></i></button>
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

    changeWidgetSize(size) {
        this.widgetSize = size;
        const widget = document.getElementById('kanjiWidget');
        
        // Remove existing size classes
        widget.classList.remove('small-widget', 'medium-widget', 'large-widget');
        
        // Add new size class
        widget.classList.add(`${size}-widget`);
        
        this.renderKanji();
    }

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

        // Load next kanji
        setTimeout(() => {
            this.loadCurrentKanji();
        }, 1000);
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
        const foundKanji = pool.find(item => item.character === character);

        if (foundKanji) {
            // THE FIX: Hydrate skeleton API data BEFORE rendering!
            const isKana = this.settings.jlptLevel === 'Hiragana' || this.settings.jlptLevel === 'Katakana';
            if (!isKana && (!foundKanji.onyomi || foundKanji.onyomi.length === 0) && (!foundKanji.kunyomi || foundKanji.kunyomi.length === 0)) {

                // Show temporary loading state on the widget
                const widget = document.getElementById('kanjiWidget');
                if (widget) {
                    widget.innerHTML = `<div class="widget-loading"><i class="fas fa-spinner fa-spin"></i><p>Fetching readings for ${character}...</p></div>`;
                }

                try {
                    const details = await KanjiData.fetchKanjiDetails(foundKanji.character);
                    if (details) {
                        foundKanji.meanings = details.meanings;
                        foundKanji.onyomi = details.onyomi;
                        foundKanji.kunyomi = details.kunyomi;
                        foundKanji.examples = details.examples;

                        // Save it back to the cache so we only fetch it once
                        const cacheKey = `level_${this.settings.jlptLevel}`;
                        if (KanjiData.cache.has(cacheKey)) {
                            const cachedPool = KanjiData.cache.get(cacheKey);
                            const index = cachedPool.findIndex(k => k.character === foundKanji.character);
                            if (index !== -1) cachedPool[index] = foundKanji;
                        }
                    }
                } catch (err) {
                    console.error("Hydration failed:", err);
                }
            }

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
        svg.style.color = getComputedStyle(document.documentElement).getPropertyValue('--primary-color').trim() || '#6200EE';

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
                const isKana = foundKanji.jlpt === 'Hiragana' || foundKanji.jlpt === 'Katakana';
                if (!isKana && (!foundKanji.onyomi || foundKanji.onyomi.length === 0) && (!foundKanji.kunyomi || foundKanji.kunyomi.length === 0)) {
                    try {
                        const details = await KanjiData.fetchKanjiDetails(foundKanji.character);
                        if (details) {
                            foundKanji.meanings = details.meanings;
                            foundKanji.onyomi = details.onyomi;
                            foundKanji.kunyomi = details.kunyomi;
                            foundKanji.examples = details.examples;
                        }
                    } catch (err) {
                        console.error("Hydration failed from recent:", err);
                    }
                }

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
    
    async showPremiumHint() {
        // Prevent API waste on basic Kana
        if (this.settings.jlptLevel === 'Hiragana' || this.settings.jlptLevel === 'Katakana') {
            this.showToast('Premium data is only available for Kanji characters!');
            return;
        }

        if (!this.settings.kanjiAliveKey) {
            this.showToast('Enter a free KanjiAlive RapidAPI Key in Settings to unlock Premium Data & Human Audio!');
            this.openSettings();
            return;
        }

        const widget = document.getElementById('kanjiWidget');
        let hintBox = document.getElementById('premiumHintBox');

        // Create the box if it doesn't exist
        if (!hintBox) {
            hintBox = document.createElement('div');
            hintBox.id = 'premiumHintBox';
            hintBox.className = 'premium-hint-box';
            const actions = widget.querySelector('.widget-actions');
            actions.parentNode.insertBefore(hintBox, actions);
        }

        hintBox.innerHTML = `<div style="text-align: center; padding: 1rem;"><i class="fas fa-spinner fa-spin"></i> Loading Premium Data...</div>`;
        hintBox.style.display = 'block';

        const data = await AudioManager.fetchKanjiAliveData(this.currentKanji.character);

        // FIXED: Removed the check for the non-existent 'hint' property
        // We now build a rich UI using the deep English meaning and Radical structure they provide
        if (data && data.kanji && data.kanji.meaning) {
            hintBox.innerHTML = `
                <div class="premium-hint-content">
                    <div class="hint-header"><i class="fas fa-gem"></i> KanjiAlive Premium Data</div>
                    <p style="margin-bottom: 0.5rem;"><strong>Deep Meaning:</strong> ${data.kanji.meaning.english}</p>
                    
                    ${data.radical && data.radical.character ? `
                    <div class="radical-hint" style="display: flex; align-items: center; gap: 0.8rem; background: rgba(138, 43, 226, 0.08); padding: 0.6rem; border-radius: 8px;">
                        <span style="font-size: 2rem; color: #8A2BE2; line-height: 1;">${data.radical.character}</span>
                        <div>
                            <div style="font-weight: bold; color: var(--text-color);">Radical: ${data.radical.name.hiragana} (${data.radical.name.romaji})</div>
                            <div style="font-size: 0.85rem; opacity: 0.8;">${data.radical.meaning.english}</div>
                        </div>
                    </div>` : ''}
                </div>
                <button class="close-hint" onclick="document.getElementById('premiumHintBox').style.display='none'"><i class="fas fa-times"></i></button>
            `;

            // Instantly play the crystal-clear native human pronunciation!
            if (data.examples && data.examples.length > 0 && data.examples[0].audio && data.examples[0].audio.mp3) {
                const premiumAudio = new Audio(data.examples[0].audio.mp3);
                premiumAudio.play();
                this.showToast('Playing Native Speaker Audio...');
            }
        } else {
            hintBox.innerHTML = `
                <div class="premium-hint-content"><p>No premium data found for this character.</p></div>
                <button class="close-hint" onclick="document.getElementById('premiumHintBox').style.display='none'"><i class="fas fa-times"></i></button>
            `;
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
        const darkThemes = ['dark', 'dracula', 'nord', 'midnight', 'forest'];

        // Save history so the toggle remembers
        if (darkThemes.includes(themeName)) {
            localStorage.setItem('lastDarkTheme', themeName);
        } else {
            localStorage.setItem('lastLightTheme', themeName);
        }

        // Update the dropdown selector
        const select = document.getElementById('themeSelect');
        if (select) select.value = themeName;

        // Update the top toggle icon
        const icon = document.querySelector('#themeToggle i');
        if (icon) {
            const isDark = darkThemes.includes(themeName);
            icon.className = isDark ? 'fas fa-moon' : 'fas fa-sun';
        }
    }

    // Loads the saved theme on startup (Defaulting to 'candy' for new users)
    applyTheme() {
        const savedTheme = localStorage.getItem('theme') || 'candy';
        this.setTheme(savedTheme);
    }

    loadSettings() {
        const saved = localStorage.getItem('kanjiSettings');
        if (saved) {
            this.settings = { ...this.settings, ...JSON.parse(saved) };
        }

        // PREMIUM UPGRADE: Load the KanjiAlive key into the UI and Audio Manager
        if (this.settings.kanjiAliveKey !== undefined) {
            const keyInput = document.getElementById('kanjiAliveKey');
            if (keyInput) {
                keyInput.value = this.settings.kanjiAliveKey;
            }
            // Give the key directly to our audio manager
            if (window.AudioManager) {
                AudioManager.setApiKey(this.settings.kanjiAliveKey);
            }
        }
    }

    saveSettings() {
        // PREMIUM UPGRADE: Grab the key from the UI before saving
        const keyInput = document.getElementById('kanjiAliveKey');
        if (keyInput) {
            this.settings.kanjiAliveKey = keyInput.value.trim();
            if (window.AudioManager) {
                AudioManager.setApiKey(this.settings.kanjiAliveKey);
            }
        }

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
    // showToast(message) {
    //     const toast = document.getElementById('toast');
    //     const messageEl = document.getElementById('toastMessage');
        
    //     messageEl.textContent = message;
    //     toast.classList.add('show');
        
    //     setTimeout(() => {
    //         toast.classList.remove('show');
    //     }, 3000);
    // }
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
