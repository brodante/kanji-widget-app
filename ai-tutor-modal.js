/**
 * AI Tutor Modal -- KanjiWidgets
 *
 * Owns all UI logic for the AI Sensei modal (Diagnostics, Study Path, Ask Sensei tabs)
 * and the Kanji Mnemonic/Etymology slide-in drawer.
 *
 * Depends on: AIManager (ai-manager.js), SRSEngine (srs-engine.js),
 *             StorageManager (storage-manager.js)
 *
 * All methods are mixed into the KanjiApp instance via AISenseiModule.applyTo(app)
 * so they share the same `this` context as the rest of the app.
 */

const AISenseiModule = {
    /** Call once after KanjiApp is constructed to graft all AI-Sensei methods onto it. */
    applyTo(app) {
        Object.assign(app, this._methods);
    },

    _methods: {
        // ==========================================
        // AI SENSEI MODAL
        // ==========================================

        openAISenseiModal(initialTab = 'diagnostics') {
            const modal = document.getElementById('aiSenseiModal');
            if (!modal) {
                return;
            }
            modal.classList.add('show');
            this.switchAISenseiTab(initialTab);
            this.updateAISenseiTelemetry();
            this.updatePersonaTag();
        },

        closeAISenseiModal() {
            const modal = document.getElementById('aiSenseiModal');
            if (modal) {
                modal.classList.remove('show');
            }
        },

        switchAISenseiTab(tabName) {
            document.querySelectorAll('.ai-tab').forEach((tab) => {
                tab.classList.toggle('active', tab.dataset.tab === tabName);
            });
            const tabMap = {
                diagnostics: 'aiTabDiagnostics',
                'study-path': 'aiTabStudyPath',
                'ask-sensei': 'aiTabAskSensei'
            };
            document.querySelectorAll('.ai-tab-pane').forEach((pane) => {
                pane.classList.remove('active');
            });
            const targetPane = document.getElementById(tabMap[tabName] || 'aiTabDiagnostics');
            if (targetPane) {
                targetPane.classList.add('active');
            }
            if (tabName === 'study-path') {
                this.renderAIPriorityStudyPlan();
            }
        },

        updateAISenseiTelemetry() {
            if (!window.SRSEngine || !window.StorageManager) {
                return;
            }
            const level = this.settings.jlptLevel;
            const stats = SRSEngine.getRetentionStats(level);
            const weakCards = SRSEngine.getWeakCards(level, 10);
            const progress = StorageManager.getProgress();
            const retEl = document.getElementById('aiRetentionRate');
            const dueEl = document.getElementById('aiDueCount');
            const matEl = document.getElementById('aiMatureCount');
            const weakEl = document.getElementById('aiWeakCount');
            if (retEl) {
                retEl.textContent = `${stats.retentionRate}%`;
            }
            if (dueEl) {
                dueEl.textContent = stats.dueCount;
            }
            if (matEl) {
                matEl.textContent = stats.matureCount;
            }
            if (weakEl) {
                weakEl.textContent = weakCards.length;
            }
            const diagnostics = SRSEngine.generateRuleBasedDiagnostics(progress, this.currentKanjiPool || []);
            this.renderAILookalikeTraps(diagnostics.lookalikeTraps || []);
        },

        renderAILookalikeTraps(traps) {
            const listEl = document.getElementById('aiLookalikeTrapsList');
            if (!listEl) {
                return;
            }
            if (!traps || traps.length === 0) {
                listEl.innerHTML = '<p class="ai-placeholder-text">No high-risk lookalikes detected in your current deck.</p>';
                return;
            }
            listEl.innerHTML = traps.map((trap) => {
                return `<div class="ai-trap-item"><div class="ai-trap-chars"><span>${trap.kanji1}</span><span class="ai-trap-vs">vs</span><span>${trap.kanji2}</span></div><div class="ai-trap-reason">${trap.reason}</div></div>`;
            }).join('');
        },

        async runAIDiagnosticAnalysis() {
            if (!window.AIManager || !window.SRSEngine || !window.StorageManager) {
                return;
            }
            const loadingEl = document.getElementById('aiDiagnosticLoading');
            const contentEl = document.getElementById('aiDiagnosticContent');
            const level = this.settings.jlptLevel;
            if (loadingEl) {
                loadingEl.style.display = 'flex';
            }
            if (contentEl) {
                contentEl.style.display = 'none';
            }
            try {
                const progress = StorageManager.getProgress();
                const stats = SRSEngine.getRetentionStats(level);
                const weakCards = SRSEngine.getWeakCards(level, 8);
                const result = await AIManager.analyzeStudyProfile(progress, stats, weakCards, this.currentKanjiPool || []);
                if (contentEl) {
                    if (result.aiGenerated && result.commentary) {
                        contentEl.innerHTML = this.formatMarkdownToHtml(result.commentary);
                    } else {
                        let html = `<h3><i class="fas fa-chart-line"></i> Local Algorithmic Analysis</h3><p>${result.advice || 'Keep reviewing consistently!'}</p>`;
                        if (result.note) {
                            html += `<p style="opacity:0.7;font-size:0.8rem;"><i class="fas fa-info-circle"></i> ${result.note}</p>`;
                        }
                        contentEl.innerHTML = html;
                    }
                }
            } catch (error) {
                if (contentEl) {
                    contentEl.innerHTML = `<p class="ai-conn-status error"><i class="fas fa-exclamation-triangle"></i> Failed to run analysis: ${error.message}</p>`;
                }
            } finally {
                if (loadingEl) {
                    loadingEl.style.display = 'none';
                }
                if (contentEl) {
                    contentEl.style.display = 'block';
                }
            }
        },

        renderAIPriorityStudyPlan() {
            if (!window.SRSEngine || !window.StorageManager) {
                return;
            }
            const listEl = document.getElementById('aiPriorityKanjiList');
            if (!listEl) {
                return;
            }
            const progress = StorageManager.getProgress();
            const diagnostics = SRSEngine.generateRuleBasedDiagnostics(progress, this.currentKanjiPool || []);
            const priorityList = diagnostics.priorityStudy || [];
            if (priorityList.length === 0) {
                listEl.innerHTML = '<p class="ai-placeholder-text">All caught up! Great work.</p>';
                return;
            }
            listEl.innerHTML = priorityList.map((item) => {
                return `<div class="ai-priority-card" onclick="app.jumpToKanjiCharacter('${item.character}')"><div class="ai-priority-char japanese-text">${item.character}</div><div class="ai-priority-reason">${item.reason}</div></div>`;
            }).join('');
        },

        startSRSReviewSession() {
            if (!window.SRSEngine || !window.StorageManager) {
                return;
            }
            const dueCards = SRSEngine.getDueCards(this.settings.jlptLevel);
            const weakCards = SRSEngine.getWeakCards(this.settings.jlptLevel, 5);
            const target = dueCards[0] || weakCards[0];
            this.closeAISenseiModal();
            if (target) {
                this.jumpToKanjiCharacter(target.character);
                this.showToast(`Starting review for "${target.character}"!`);
            } else if (this.currentKanji) {
                this.showToast('No overdue cards! Reviewing current deck.');
            }
        },

        jumpToKanjiCharacter(character) {
            if (!this.currentKanjiPool) {
                return;
            }
            const index = this.currentKanjiPool.findIndex((k) => k.character === character);
            if (index !== -1) {
                this.currentIndex = index;
                this.currentKanji = this.currentKanjiPool[index];
                this.renderKanji();
                this.closeAISenseiModal();
                this.closeKanjiDrawer();
            } else {
                this.showKanjiFromRecent(character);
                this.closeAISenseiModal();
                this.closeKanjiDrawer();
            }
        },

        async askAISensei(question) {
            const chatLog = document.getElementById('aiChatLog');
            if (!chatLog || !window.AIManager) {
                return;
            }
            const userMsg = document.createElement('div');
            userMsg.className = 'ai-chat-msg ai-msg-user';
            userMsg.innerHTML = `<div class="ai-msg-text">${this.escapeHtml(question)}</div>`;
            chatLog.appendChild(userMsg);
            const botMsg = document.createElement('div');
            botMsg.className = 'ai-chat-msg ai-msg-bot';
            botMsg.innerHTML = '<div class="ai-msg-avatar"><i class="fas fa-brain"></i></div><div class="ai-msg-text"><i class="fas fa-spinner fa-spin"></i> Sensei is thinking...</div>';
            chatLog.appendChild(botMsg);
            chatLog.scrollTop = chatLog.scrollHeight;
            try {
                const answer = await AIManager.askSenseiQuestion(question, this.currentKanji);
                botMsg.querySelector('.ai-msg-text').innerHTML = this.formatMarkdownToHtml(answer);
            } catch (error) {
                botMsg.querySelector('.ai-msg-text').innerHTML = `<span style="color:#FF5252;"><i class="fas fa-circle-exclamation"></i> ${error.message}</span>`;
            }
            chatLog.scrollTop = chatLog.scrollHeight;
        },

        openAISenseiForCurrentKanji() {
            this.openAISenseiModal('ask-sensei');
            if (this.currentKanji) {
                this.askAISensei(`Explain the radicals and visual mnemonic for "${this.currentKanji.character}"`);
            }
        },
        // ==========================================
        // KANJI MNEMONIC & ETYMOLOGY DRAWER
        // ==========================================

        openKanjiDrawer(tab) {
            if (tab === undefined) {
                tab = 'mnemonic';
            }
            if (!this.currentKanji) {
                return;
            }
            const drawer = document.getElementById('kanjiDrawer');
            if (!drawer) {
                return;
            }
            const charEl = document.getElementById('drawerKanjiChar');
            const meaningEl = document.getElementById('drawerKanjiMeaning');
            const badgeEl = document.getElementById('drawerCacheBadge');
            if (charEl) {
                charEl.textContent = this.currentKanji.character;
            }
            if (meaningEl) {
                meaningEl.textContent = (this.currentKanji.meanings || []).join(', ');
            }
            const mnemonicCached = StorageManager.getAICacheItem(`mnemonic_${this.currentKanji.character}`);
            const etymologyCached = StorageManager.getAICacheItem(`etymology_${this.currentKanji.character}`);
            if (badgeEl) {
                badgeEl.style.display = (mnemonicCached || etymologyCached) ? 'inline-flex' : 'none';
            }
            this.switchKanjiDrawerTab(tab);
            drawer.classList.add('open');
            document.body.style.overflow = 'hidden';
        },

        closeKanjiDrawer() {
            const drawer = document.getElementById('kanjiDrawer');
            if (drawer) {
                drawer.classList.remove('open'); document.body.style.overflow = '';
            }
        },

        switchKanjiDrawerTab(tabName) {
            document.querySelectorAll('.kanji-drawer-tab').forEach((tab) => {
                tab.classList.toggle('active', tab.dataset.drawerTab === tabName);
            });
            const paneMap = { mnemonic: 'drawerTabMnemonic', etymology: 'drawerTabEtymology' };
            document.querySelectorAll('.kanji-drawer-pane').forEach((p) => p.classList.remove('active'));
            const target = document.getElementById(paneMap[tabName]);
            if (target) {
                target.classList.add('active');
            }
            if (tabName === 'mnemonic') {
                this.loadDrawerMnemonic();
            } else if (tabName === 'etymology') {
                this.loadDrawerEtymology();
            }
        },

        async loadDrawerMnemonic() {
            if (!this.currentKanji) {
                return;
            }
            const contentEl = document.getElementById('drawerMnemonicContent');
            if (!contentEl) {
                return;
            }
            if (this._drawerMnemonicInFlight === this.currentKanji.character) {
                return;
            }
            this._drawerMnemonicInFlight = this.currentKanji.character;
            if (!window.AIManager || !window.StorageManager) {
                contentEl.innerHTML = this._drawerNoAIMessage(); return;
            }
            const settings = StorageManager.getAISettings();
            if (!settings.apiKey && settings.provider !== 'ollama') {
                contentEl.innerHTML = this._drawerNoAIMessage(); this._drawerMnemonicInFlight = null; return;
            }
            const cacheKey = `mnemonic_${this.currentKanji.character}`;
            const cached = StorageManager.getAICacheItem(cacheKey);
            const badgeEl = document.getElementById('drawerCacheBadge');
            if (cached && cached.data) {
                contentEl.innerHTML = `<div class="kanji-drawer-content">${this.formatMarkdownToHtml(cached.data)}</div>`;
                if (badgeEl) {
                    badgeEl.style.display = 'inline-flex';
                }
                this._enrichKanjiWithStrokeCount().then(() => {
                    if (this.currentKanji && (this.currentKanji.strokes || 0) > 12) {
                        this._appendStrokeWarning(contentEl, this.currentKanji);
                    }
                });
                return;
            }
            contentEl.innerHTML = `<div class="ai-loading-container"><div class="ai-spinner"></div><p>Sensei is crafting a mnemonic for <strong class="japanese-text">${this.currentKanji.character}</strong>...</p></div>`;
            try {
                await this._enrichKanjiWithStrokeCount();
                const result = await AIManager.generateMnemonic(this.currentKanji);
                contentEl.innerHTML = `<div class="kanji-drawer-content">${this.formatMarkdownToHtml(result)}</div>`;
                this._appendStrokeWarning(contentEl, this.currentKanji);
                if (badgeEl) {
                    badgeEl.style.display = 'inline-flex';
                }
                this._drawerMnemonicInFlight = null;
            } catch (error) {
                contentEl.innerHTML = `<div class="kanji-drawer-content"><div class="kanji-drawer-stroke-warning"><i class="fas fa-circle-exclamation"></i><span>${this.escapeHtml(error.message)}</span></div></div>`;
                this._drawerMnemonicInFlight = null;
            }
        },

        async loadDrawerEtymology() {
            if (!this.currentKanji) {
                return;
            }
            const contentEl = document.getElementById('drawerEtymologyContent');
            if (!contentEl) {
                return;
            }
            if (this._drawerEtymologyInFlight === this.currentKanji.character) {
                return;
            }
            this._drawerEtymologyInFlight = this.currentKanji.character;
            if (!window.AIManager || !window.StorageManager) {
                contentEl.innerHTML = this._drawerNoAIMessage(); return;
            }
            const settings = StorageManager.getAISettings();
            if (!settings.apiKey && settings.provider !== 'ollama') {
                contentEl.innerHTML = this._drawerNoAIMessage(); return;
            }
            const cacheKey = `etymology_${this.currentKanji.character}`;
            const cached = StorageManager.getAICacheItem(cacheKey);
            const badgeEl = document.getElementById('drawerCacheBadge');
            if (cached && cached.data) {
                contentEl.innerHTML = `<div class="kanji-drawer-content">${this.formatMarkdownToHtml(cached.data)}</div>`;
                if (badgeEl) {
                    badgeEl.style.display = 'inline-flex';
                }
                this._enrichKanjiWithStrokeCount().then(() => {
                    if (this.currentKanji && (this.currentKanji.strokes || 0) > 12) {
                        this._appendStrokeWarning(contentEl, this.currentKanji);
                    }
                });
                return;
            }
            contentEl.innerHTML = `<div class="ai-loading-container"><div class="ai-spinner"></div><p>Exploring etymology of <strong class="japanese-text">${this.currentKanji.character}</strong>...</p></div>`;
            try {
                await this._enrichKanjiWithStrokeCount();
                const result = await AIManager.explainEtymology(this.currentKanji);
                contentEl.innerHTML = `<div class="kanji-drawer-content">${this.formatMarkdownToHtml(result)}</div>`;
                if (badgeEl) {
                    badgeEl.style.display = 'inline-flex';
                }
                this._drawerEtymologyInFlight = null;
            } catch (error) {
                contentEl.innerHTML = `<div class="kanji-drawer-content"><div class="kanji-drawer-stroke-warning"><i class="fas fa-circle-exclamation"></i><span>${this.escapeHtml(error.message)}</span></div></div>`;
                this._drawerEtymologyInFlight = null;
            }
        },

        refreshKanjiDrawer() {
            if (!this.currentKanji) {
                return;
            }
            const cache = StorageManager.getItem(StorageManager.keys.AI_CACHE, {});
            delete cache[`mnemonic_${this.currentKanji.character}`];
            delete cache[`etymology_${this.currentKanji.character}`];
            StorageManager.setItem(StorageManager.keys.AI_CACHE, cache);
            const badgeEl = document.getElementById('drawerCacheBadge');
            if (badgeEl) {
                badgeEl.style.display = 'none';
            }
            this._drawerMnemonicInFlight = null;
            this._drawerEtymologyInFlight = null;
            const activeTab = document.querySelector('.kanji-drawer-tab.active');
            if (activeTab) {
                const tabName = activeTab.dataset.drawerTab;
                if (tabName === 'mnemonic') {
                    this.loadDrawerMnemonic();
                } else if (tabName === 'etymology') {
                    this.loadDrawerEtymology();
                }
            }
            this.showToast('Regenerating AI content...');
        },

        _appendStrokeWarning(containerEl, kanjiData) {
            if (!kanjiData.strokes || kanjiData.strokes <= 12) {
                return;
            }
            containerEl.insertAdjacentHTML('beforeend', `<div class="kanji-drawer-stroke-warning"><i class="fas fa-pen-nib"></i><span>This kanji has <strong>${kanjiData.strokes} strokes</strong>. Pay close attention to the stroke order tips above to avoid common mistakes.</span></div>`);
        },

        _drawerNoAIMessage() {
            return '<div class="kanji-drawer-no-ai"><i class="fas fa-key"></i><p><strong>AI not configured</strong></p><p>Set up your API key in Settings to unlock AI-powered mnemonics and etymology.</p><button onclick="app.closeKanjiDrawer(); app.openSettings();">Open Settings</button></div>';
        },
        /**
         * Derives the kanji stroke count from KanjiVG SVG paths.
         * Enriches this.currentKanji.strokes; falls back gracefully if unavailable.
         */
        async _enrichKanjiWithStrokeCount() {
            if (!this.currentKanji) {
                return;
            }
            if (this.currentKanji.strokes) {
                return this.currentKanji.strokes;
            }
            const container = document.getElementById('strokeOrderContainer');
            const renderedSvg = container ? container.querySelector('svg') : null;
            if (renderedSvg) {
                const count = renderedSvg.querySelectorAll('path').length;
                if (count > 0) {
                    this.currentKanji.strokes = count; return count;
                }
            }
            try {
                const svgMarkup = await this.fetchStrokeOrderSvg(this.currentKanji.character);
                if (svgMarkup) {
                    const count = (svgMarkup.match(/<path\b/gi) || []).length;
                    if (count > 0) {
                        this.currentKanji.strokes = count; return count;
                    }
                }
            } catch (error) {
                console.warn('Could not derive stroke count:', error);
            }
            return null;
        },

        formatMarkdownToHtml(text) {
            if (!text) {
                return '';
            }
            let html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
            html = html.replace(/^## (.*$)/gim, '<h3>$1</h3>');
            html = html.replace(/^# (.*$)/gim, '<h3>$1</h3>');
            html = html.replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>');
            html = html.replace(/\*(.*?)\*/gim, '<em>$1</em>');
            html = html.replace(/^\s*[-*]\s+(.*$)/gim, '<li>$1</li>');
            html = html.replace(/(<li>.*<\/li>)/gim, '<ul>$1</ul>');
            html = html.replace(/\n\n+/gim, '<p></p>').replace(/\n/gim, '<br>');
            return html;
        },

        escapeHtml(str) {
            const div = document.createElement('div');
            div.textContent = str;
            return div.innerHTML;
        }

    } // end _methods
}; // end AISenseiModule

// Expose AISenseiModule to the browser global scope so script.js can consume it.
// (Top-level `const` in classic scripts is global-lexical, but assigning to window
// also gives a first-class reference and keeps ESLint's no-unused-vars happy.)
if (typeof window !== 'undefined') {
    window.AISenseiModule = AISenseiModule;
}

// Export for CommonJS/test environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AISenseiModule;
}
