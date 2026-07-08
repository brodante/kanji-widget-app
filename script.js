class KanjiLearningApp {
    constructor() {
        this.currentKanji = null;
        this.currentKanjiPool = [];
        this.currentIndex = 0;
        this.widgetSize = 'medium';
        this.settings = {
            jlptLevel: 'N5',
            autoPlay: false,
            showFurigana: true,
            kanjiFont: 'Klee One',
            fontSize: 'medium',
            defaultAudio: 'kunyomi',
            localBackupFreq: 'daily',
            onlineBackupFreq: 'never'
        };
        
        this.init();
    }

    init() {
        this.loadSettings();
        this.bindEvents();
        this.bindFontGridEvents();
        this.loadCurrentKanji();
        this.updateProgress();
        this.loadRecentKanji();
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
        document.getElementById('widgetSize').addEventListener('change', (e) => {
            this.changeWidgetSize(e.target.value);
        });

        // Theme toggle
        document.getElementById('themeToggle').addEventListener('click', () => {
            this.toggleTheme();
        });

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
            this.loadCurrentKanji();
        });

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

        // Close modal when clicking outside
        document.getElementById('settingsModal').addEventListener('click', (e) => {
            if (e.target.id === 'settingsModal') {
                this.closeSettings();
            }
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Space' || e.key === 'Enter') {
                e.preventDefault();
                this.markAsMastered();
            } else if (e.key === 'p' || e.key === 'P') {
                e.preventDefault();
                this.playPronunciation();
            }
        });
    }

    async loadCurrentKanji() {
        const widget = document.getElementById('kanjiWidget');
        widget.innerHTML = `
            <div class="widget-loading">
                <i class="fas fa-spinner fa-spin"></i>
                <p>Loading Kanji...</p>
            </div>
        `;

        try {
            const progress = StorageManager.getProgress();
            const availableKanji = await this.getKanjiPool(this.settings.jlptLevel);
            this.currentKanjiPool = availableKanji;
            
            if (availableKanji.length === 0) {
                throw new Error('No kanji available for this level');
            }

            // Find next unmastered kanji
            let nextKanji = null;
            for (let i = 0; i < availableKanji.length; i++) {
                const kanji = availableKanji[i];
                if (!progress.mastered.includes(kanji.character)) {
                    nextKanji = kanji;
                    this.currentIndex = i;
                    break;
                }
            }

            // If all kanji are mastered, cycle back to first
            if (!nextKanji) {
                nextKanji = availableKanji[0];
                this.currentIndex = 0;
                this.showToast('Congratulations! You\'ve mastered all kanji in this level. Starting over.');
            }

            this.currentKanji = nextKanji;
            this.renderKanji();
            this.renderKanjiJourney();

            if (this.settings.autoPlay) {
                setTimeout(() => this.playPronunciation(), 1000);
            }

        } catch (error) {
            console.error('Error loading kanji:', error);
            widget.innerHTML = `
                <div class="widget-loading">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Error loading kanji. Please check your connection and try again.</p>
                    <button onclick="app.loadCurrentKanji()" style="margin-top: 1rem; padding: 0.5rem 1rem; border: none; border-radius: 8px; background: var(--primary-color); color: var(--on-primary); cursor: pointer;">Retry</button>
                </div>
            `;
        }
    }

    renderKanji() {
        if (!this.currentKanji) return;

        const widget = document.getElementById('kanjiWidget');
        let content = '';

        // Base kanji display
        content += `<div class="kanji-character japanese-text">${this.currentKanji.character}</div>`;

        if (this.widgetSize === 'small') {
            // Small widget: Just kanji
            content += `
                <div class="widget-actions">
                    <button class="action-btn jisho-btn" onclick="window.open('https://jisho.org/search/${encodeURIComponent(this.currentKanji.character)}%20%23kanji', '_blank', 'noopener,noreferrer')" title="Look on Jisho">
                        <i class="fas fa-book-open"></i>
                    </button>
                    <button class="action-btn master-action-btn" onclick="app.markAsMastered()" title="Mark as Mastered">
                        <i class="fas fa-check"></i>
                    </button>
                </div>
            `;
        } else if (this.widgetSize === 'medium') {
            // Medium widget: Kanji + meaning + audio
            content += `
                <div class="kanji-meaning">${this.currentKanji.meanings.join(', ')}</div>
                <div class="widget-actions">
                    <button class="action-btn" onclick="app.playPronunciation()" title="Play Pronunciation">
                        <i class="fas fa-volume-up"></i>
                    </button>
                    <button class="action-btn jisho-btn" onclick="window.open('https://jisho.org/search/${encodeURIComponent(this.currentKanji.character)}%20%23kanji', '_blank', 'noopener,noreferrer')" title="Look on Jisho">
                        <i class="fas fa-book-open"></i>
                    </button>
                    <button class="action-btn master-action-btn" onclick="app.markAsMastered()" title="Mark as Mastered">
                        <i class="fas fa-check"></i>
                    </button>
                </div>
            `;
        } else {
            // Large widget: Full details
            content += `
                <div class="kanji-meaning">${this.currentKanji.meanings.join(', ')}</div>
                <div class="kanji-readings">
                    ${this.currentKanji.onyomi.length > 0 ? `
                        <div class="reading-group">
                            <div class="reading-label japanese-text">On'yomi</div>
                            <div class="reading-value japanese-text">
                                ${this.currentKanji.onyomi.map(reading => 
                                    `<span class="clickable-reading japanese-text" onclick="app.playSpecificReading('${reading}')" title="Click to pronounce">${reading}</span>`
                                ).join(', ')}
                            </div>
                        </div>
                    ` : ''}
                    ${this.currentKanji.kunyomi.length > 0 ? `
                        <div class="reading-group">
                            <div class="reading-label japanese-text">Kun'yomi</div>
                            <div class="reading-value japanese-text">
                                ${this.currentKanji.kunyomi.map(reading => 
                                    `<span class="clickable-reading japanese-text" onclick="app.playSpecificReading('${reading}')" title="Click to pronounce">${reading}</span>`
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
                                <span class="example-word japanese-text" onclick="app.playSpecificReading('${example.reading || example.word}')" title="Click to pronounce">
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
                    <div id="strokeOrderContainer" class="stroke-order-container"></div>
                </div>
                <div class="widget-actions">
                    <button class="action-btn" onclick="app.playPronunciation()" title="Play Pronunciation">
                        <i class="fas fa-volume-up"></i>
                    </button>
                    <button class="action-btn jisho-btn" onclick="window.open('https://jisho.org/search/${encodeURIComponent(this.currentKanji.character)}%20%23kanji', '_blank', 'noopener,noreferrer')" title="Look on Jisho">
                        <i class="fas fa-book-open"></i>
                    </button>
                    <button class="action-btn master-action-btn" onclick="app.markAsMastered()" title="Mark as Mastered">
                        <i class="fas fa-check"></i>
                    </button>
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

        // Save progress
        StorageManager.markAsMastered(this.currentKanji.character);
        
        // Add to recent
        StorageManager.addToRecent({
            character: this.currentKanji.character,
            meanings: this.currentKanji.meanings,
            timestamp: Date.now()
        });

        this.showToast(`Great! "${this.currentKanji.character}" marked as mastered!`);

        // Update progress display
        this.updateProgress();
        this.renderKanjiJourney();
        this.loadRecentKanji();

        // Load next kanji
        setTimeout(() => {
            this.loadCurrentKanji();
        }, 1000);
    }

    playPronunciation() {
        if (!this.currentKanji) return;

        let readingToPlay = '';
        let readingType = 'onyomi';
        
        // Determine which reading to play based on default audio setting
        switch (this.settings.defaultAudio) {
            case 'kunyomi':
                readingToPlay = this.currentKanji.kunyomi.length > 0 ? 
                    this.currentKanji.kunyomi[0] : 
                    (this.currentKanji.onyomi.length > 0 ? this.currentKanji.onyomi[0] : '');
                readingType = 'kunyomi';
                break;
            case 'onyomi':
                readingToPlay = this.currentKanji.onyomi.length > 0 ? 
                    this.currentKanji.onyomi[0] : 
                    (this.currentKanji.kunyomi.length > 0 ? this.currentKanji.kunyomi[0] : '');
                readingType = 'onyomi';
                break;
            case 'first':
            default:
                const allReadings = [...this.currentKanji.onyomi, ...this.currentKanji.kunyomi];
                readingToPlay = allReadings.length > 0 ? allReadings[0] : '';
                break;
        }

        if (readingToPlay) {
            // Try Kanji Alive API first for professional audio quality
            if (AudioManager.kanjiAliveApiKey && this.currentKanji.character) {
                AudioManager.speakKanjiWithAPI(this.currentKanji.character, readingType)
                    .catch(err => {
                        console.log('API audio failed, using fallback');
                        AudioManager.speak(readingToPlay, 'ja-JP');
                    });
            } else {
                AudioManager.speak(readingToPlay, 'ja-JP');
            }
            
            // Visual feedback
            const btn = document.querySelector('.action-btn .fa-volume-up');
            if (btn) {
                btn.classList.add('pulse-animation');
                setTimeout(() => btn.classList.remove('pulse-animation'), 300);
            }
        }
    }

    playSpecificReading(reading) {
        if (reading) {
            AudioManager.speak(reading, 'ja-JP');
            this.showToast(`Playing pronunciation: ${reading}`);
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

        if (!container || !summary || !progressStats) return;

        const progress = StorageManager.getProgress();
        const masteredCount = progress.mastered.length;
        const pool = this.currentKanjiPool.length > 0 ? this.currentKanjiPool : [];
        const totalCount = pool.length;
        const levelLabel = this.settings.jlptLevel === 'all' ? 'all levels' : `${this.settings.jlptLevel} level`;

        summary.textContent = `${masteredCount} mastered`;
        progressStats.textContent = `${masteredCount} mastered | ${totalCount} total (${levelLabel})`;

        if (totalCount === 0) {
            container.innerHTML = '<p class="stroke-order-empty">Loading kanji list…</p>';
            return;
        }

        const masteredSet = new Set(progress.mastered || []);
        container.innerHTML = pool.map(kanji => `
            <button class="journey-pill ${masteredSet.has(kanji.character) ? 'mastered' : 'pending'}" data-character="${kanji.character}" type="button">
                ${kanji.character}
            </button>
        `).join('');

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
            this.currentKanji = foundKanji;
            this.renderKanji();
            this.showToast(`Showing ${character}`);
            document.getElementById('kanjiWidget').scrollIntoView({ behavior: 'smooth', block: 'center' });
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
            const padding = 14;
            const drawLength = length > 0 ? length + padding : 0;
            path.style.transition = 'none';
            path.style.strokeLinecap = 'round';
            path.style.strokeLinejoin = 'round';
            path.style.strokeDasharray = `${drawLength} ${drawLength}`;
            path.style.strokeDashoffset = `${drawLength}`;
            path.style.opacity = '0.2';
            path.getBoundingClientRect();
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

        const duration = 220;
        let index = 0;

        const step = () => {
            if (index >= paths.length) {
                this.strokeOrderTimer = null;
                return;
            }

            const path = paths[index];
            const length = path.getTotalLength ? path.getTotalLength() : 0;
            path.style.transition = `stroke-dashoffset ${duration}ms linear, opacity ${duration / 2}ms ease`;
            path.style.opacity = '1';
            path.style.strokeDashoffset = '0';
            path.getBoundingClientRect();
            index += 1;
            this.strokeOrderTimer = window.setTimeout(step, duration + 40);
        };

        step();
    }

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
            const padding = 14;
            path.style.transition = 'none';
            path.style.opacity = '0.2';
            path.style.strokeDashoffset = `${length + padding}`;
        });
    }

    updateProgress() {
        const progress = StorageManager.getProgress();
        const masteredCount = progress.mastered.length;
        const totalCount = this.currentKanjiPool.length || 0;
        const levelLabel = this.settings.jlptLevel === 'all' ? 'all levels' : `${this.settings.jlptLevel} level`;

        const progressStats = document.getElementById('progressStats');
        if (progressStats) {
            progressStats.textContent = `${masteredCount} mastered | ${totalCount} total (${levelLabel})`;
        }

        const progressPercentage = totalCount > 0 ? Math.min((masteredCount / totalCount) * 100, 100) : 0;
        document.getElementById('progressFill').style.width = `${progressPercentage}%`;
    }

    loadRecentKanji() {
        const recent = StorageManager.getRecent();
        const container = document.getElementById('recentKanji');

        if (recent.length === 0) {
            container.innerHTML = '<p style="text-align: center; opacity: 0.6;">No recent kanji yet. Start learning!</p>';
            return;
        }

        container.innerHTML = recent.map(item => `
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
                this.currentKanji = foundKanji;
                this.renderKanji();
                this.renderKanjiJourney();
                this.showToast(`Showing details for "${character}"`);
                
                // Scroll to widget
                document.getElementById('kanjiWidget').scrollIntoView({ 
                    behavior: 'smooth', 
                    block: 'center' 
                });
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

    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        
        // Update theme toggle icon
        const icon = document.querySelector('#themeToggle i');
        icon.className = newTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    }

    applyTheme() {
        const savedTheme = localStorage.getItem('theme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
        
        // Update theme toggle icon
        const icon = document.querySelector('#themeToggle i');
        icon.className = savedTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    }

    loadSettings() {
        const saved = localStorage.getItem('kanjiSettings');
        if (saved) {
            this.settings = { ...this.settings, ...JSON.parse(saved) };
        }
    }

    saveSettings() {
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

    showToast(message) {
        const toast = document.getElementById('toast');
        const messageEl = document.getElementById('toastMessage');
        
        messageEl.textContent = message;
        toast.classList.add('show');
        
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
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
