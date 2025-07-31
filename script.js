class KanjiLearningApp {
    constructor() {
        this.currentKanji = null;
        this.currentIndex = 0;
        this.widgetSize = 'medium';
        this.settings = {
            jlptLevel: 'N5',
            autoPlay: false,
            showFurigana: true,
            kanjiFont: 'Noto Sans JP',
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
        this.loadCurrentKanji();
        this.updateProgress();
        this.loadRecentKanji();
        this.applyTheme();
        this.applyFontSettings();
        this.scheduleBackups();
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
            const availableKanji = await KanjiData.getKanjiByLevel(this.settings.jlptLevel);
            
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
        content += `<div class="kanji-character">${this.currentKanji.character}</div>`;

        if (this.widgetSize === 'small') {
            // Small widget: Just kanji
            content += `
                <div class="widget-actions">
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
                            <div class="reading-label">On'yomi</div>
                            <div class="reading-value">
                                ${this.currentKanji.onyomi.map(reading => 
                                    `<span class="clickable-reading" onclick="app.playSpecificReading('${reading}')" title="Click to pronounce">${reading}</span>`
                                ).join(', ')}
                            </div>
                        </div>
                    ` : ''}
                    ${this.currentKanji.kunyomi.length > 0 ? `
                        <div class="reading-group">
                            <div class="reading-label">Kun'yomi</div>
                            <div class="reading-value">
                                ${this.currentKanji.kunyomi.map(reading => 
                                    `<span class="clickable-reading" onclick="app.playSpecificReading('${reading}')" title="Click to pronounce">${reading}</span>`
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
                                <span class="example-word" onclick="app.playSpecificReading('${example.reading || example.word}')" title="Click to pronounce">
                                    ${example.word}
                                    ${example.reading ? `<span class="reading-hiragana">${example.reading}</span>` : ''}
                                </span>
                                <span class="example-meaning">${example.meaning}</span>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
                <div class="widget-actions">
                    <button class="action-btn" onclick="app.playPronunciation()" title="Play Pronunciation">
                        <i class="fas fa-volume-up"></i>
                    </button>
                    <button class="action-btn master-action-btn" onclick="app.markAsMastered()" title="Mark as Mastered">
                        <i class="fas fa-check"></i>
                    </button>
                </div>
            `;
        }

        widget.innerHTML = content;
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
        this.loadRecentKanji();

        // Load next kanji
        setTimeout(() => {
            this.loadCurrentKanji();
        }, 1000);
    }

    playPronunciation() {
        if (!this.currentKanji) return;

        let readingToPlay = '';
        
        // Determine which reading to play based on default audio setting
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
            AudioManager.speak(readingToPlay, 'ja-JP');
            
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

    updateProgress() {
        const progress = StorageManager.getProgress();
        const masteredCount = progress.mastered.length;
        const totalStudied = progress.studied.length;

        document.getElementById('masteredCount').textContent = masteredCount;
        document.getElementById('totalStudied').textContent = totalStudied;

        // Update progress bar (assuming goal of 100 kanji for now)
        const progressPercentage = Math.min((masteredCount / 100) * 100, 100);
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
                <div class="recent-kanji">${item.character}</div>
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
    }

    closeSettings() {
        const modal = document.getElementById('settingsModal');
        modal.classList.remove('show');
    }

    resetProgress() {
        if (confirm('Are you sure you want to reset all progress? This cannot be undone.')) {
            StorageManager.resetProgress();
            this.updateProgress();
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
        widget.classList.remove('font-zen-antique', 'font-zen-maru-gothic', 'font-hannari', 'font-kokoro',
                                'font-hiragino-sans', 'font-yu-gothic', 'font-meiryo', 'font-ms-gothic');
        
        // Apply font size class
        appContainer.classList.add(`font-size-${this.settings.fontSize}`);
        
        // Apply font family class or style
        const fontClassMap = {
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
        } else if (this.settings.kanjiFont !== 'Noto Sans JP') {
            widget.style.fontFamily = `'${this.settings.kanjiFont}', 'Noto Sans JP', sans-serif`;
        } else {
            widget.style.fontFamily = '';
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
