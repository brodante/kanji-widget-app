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

const FREE_AI_CHAT_COOLDOWN_MS = 5000;
const MAX_FREE_AI_RATE_LIMIT_COOLDOWN_MS = 120000;

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
            this.resetAISenseiFabIdleTimer?.();
            modal.classList.add('show');
            this.switchAISenseiTab(initialTab);
            this.updateAISenseiChatControls();
            this.updateAISenseiTelemetry();
            this.updatePersonaTag();
        },

        closeAISenseiModal() {
            const modal = document.getElementById('aiSenseiModal');
            if (modal) {
                modal.classList.remove('show');
            }
            this.resetAISenseiFabIdleTimer?.();
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
            } else if (tabName === 'ask-sensei') {
                this.updateAISenseiKanjiContext();
                this.updateAISenseiChatControls();
            }
        },

        updateAISenseiKanjiContext() {
            const contextEl = document.getElementById('aiSenseiKanjiContext');
            if (!contextEl) {
                return;
            }
            const character = this.currentKanji?.character;
            if (!character) {
                contextEl.hidden = true;
                contextEl.textContent = '';
                return;
            }
            contextEl.textContent = `Current kanji context: ${character} · included when you send a message`;
            contextEl.hidden = false;
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
            const diagnostics = SRSEngine.generateRuleBasedDiagnostics(
                progress,
                this.currentKanjiPool || []
            );
            this.renderAILookalikeTraps(diagnostics.lookalikeTraps || []);
        },

        renderAILookalikeTraps(traps) {
            const listEl = document.getElementById('aiLookalikeTrapsList');
            if (!listEl) {
                return;
            }
            if (!traps || traps.length === 0) {
                listEl.innerHTML =
                    '<p class="ai-placeholder-text">No high-risk lookalikes detected in your current deck.</p>';
                return;
            }
            listEl.innerHTML = traps
                .map((trap) => {
                    return `<div class="ai-trap-item"><div class="ai-trap-chars"><span>${trap.kanji1}</span><span class="ai-trap-vs">vs</span><span>${trap.kanji2}</span></div><div class="ai-trap-reason">${trap.reason}</div></div>`;
                })
                .join('');
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
                const result = await AIManager.analyzeStudyProfile(
                    progress,
                    stats,
                    weakCards,
                    this.currentKanjiPool || []
                );
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
                    if (result.limitReached) {
                        this.renderAIQuotaNotice(contentEl, () => this.runAIDiagnosticAnalysis());
                    }
                }
            } catch (error) {
                if (contentEl) {
                    contentEl.textContent = `Failed to run analysis: ${error?.message || 'Please try again.'}`;
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
            const diagnostics = SRSEngine.generateRuleBasedDiagnostics(
                progress,
                this.currentKanjiPool || []
            );
            const priorityList = diagnostics.priorityStudy || [];
            if (priorityList.length === 0) {
                listEl.innerHTML = '<p class="ai-placeholder-text">All caught up! Great work.</p>';
                return;
            }
            listEl.innerHTML = priorityList
                .map((item) => {
                    return `<div class="ai-priority-card" onclick="app.jumpToKanjiCharacter('${item.character}')"><div class="ai-priority-char japanese-text">${item.character}</div><div class="ai-priority-reason">${item.reason}</div></div>`;
                })
                .join('');
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

        renderAIQuotaNotice(containerEl, retryAction = null) {
            if (!containerEl) {
                return;
            }
            const card = document.createElement('section');
            card.className = 'ai-limit-notice';
            card.setAttribute('role', 'group');
            card.setAttribute('aria-label', 'AI Sensei free-limit options');

            const message = document.createElement('p');
            message.setAttribute('role', 'status');
            message.setAttribute('aria-live', 'polite');
            message.textContent =
                'You’ve reached the free AI Sensei limit for now. You can continue with your own provider API key in Settings, or contact the developer. Your provider may have its own limits or charges.';
            card.appendChild(message);

            const actions = document.createElement('div');
            actions.className = 'ai-limit-notice__actions';
            const keyButton = document.createElement('button');
            keyButton.type = 'button';
            keyButton.textContent = 'Use my own API key';
            keyButton.addEventListener('click', () => this.openAISettingsForBYOK());
            actions.appendChild(keyButton);

            if (typeof retryAction === 'function') {
                const retryButton = document.createElement('button');
                retryButton.type = 'button';
                retryButton.textContent = 'Try again after setup';
                retryButton.addEventListener('click', retryAction);
                actions.appendChild(retryButton);
            }

            const contactLink = document.createElement('a');
            contactLink.href =
                'mailto:spsc.mizu@gmail.com?subject=KanjiWidgets%20AI%20Sensei%20limit%20support';
            contactLink.textContent = 'Email the developer';
            actions.appendChild(contactLink);
            card.appendChild(actions);

            const email = document.createElement('a');
            email.className = 'ai-limit-notice__email';
            email.href = 'mailto:spsc.mizu@gmail.com';
            email.textContent = 'spsc.mizu@gmail.com';
            email.setAttribute('aria-label', 'Email address: spsc.mizu@gmail.com');
            card.appendChild(email);
            containerEl.appendChild(card);
        },

        openAISettingsForBYOK() {
            this.closeAISenseiModal();
            this.closeKanjiDrawer();
            if (typeof this.openSettings === 'function') {
                this.openSettings();
            }
            const settingsTarget = document.getElementById('settingsAI');
            settingsTarget?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
            document.getElementById('aiProvider')?.focus?.({ preventScroll: true });
        },

        isAISenseiUsingFreeProvider() {
            try {
                const storageManager =
                    typeof StorageManager !== 'undefined' ? StorageManager : window.StorageManager;
                const provider = storageManager?.getAISettings?.()?.provider;
                return !provider || provider === 'firebase';
            } catch {
                return true;
            }
        },

        isAISenseiChatLocked() {
            const cooldownUntil = Number(this._aiSenseiCooldownUntil || 0);
            const coolingDown = this.isAISenseiUsingFreeProvider() && cooldownUntil > Date.now();
            return Boolean(this._aiSenseiRequestPending || coolingDown);
        },

        updateAISenseiChatControls(announce = false) {
            const input = document.getElementById('aiSenseiInput');
            const sendButton = document.getElementById('aiSenseiSendBtn');
            const status = document.getElementById('aiSenseiCooldownStatus');
            const announcement = document.getElementById('aiSenseiCooldownAnnouncement');
            const usingFreeProvider = this.isAISenseiUsingFreeProvider();
            const cooldownUntil = Number(this._aiSenseiCooldownUntil || 0);
            const timeRemaining = Math.max(0, cooldownUntil - Date.now());
            const cooldownExpired = usingFreeProvider && cooldownUntil > 0 && timeRemaining === 0;
            const cooldownRemaining = usingFreeProvider ? timeRemaining : 0;
            const secondsRemaining = Math.ceil(cooldownRemaining / 1000);
            const isPending = Boolean(this._aiSenseiRequestPending);
            const isCoolingDown = cooldownRemaining > 0;
            const isLocked = isPending || isCoolingDown;

            if (
                timeRemaining === 0 &&
                this._aiSenseiCooldownTimer !== null &&
                this._aiSenseiCooldownTimer !== undefined
            ) {
                window.clearInterval(this._aiSenseiCooldownTimer);
                this._aiSenseiCooldownTimer = null;
                this._aiSenseiCooldownUntil = 0;
                this._aiSenseiCooldownReason = '';
            }

            if (input) {
                if (this._aiSenseiOriginalPlaceholder === undefined) {
                    this._aiSenseiOriginalPlaceholder = input.getAttribute('placeholder') || '';
                }
                input.disabled = isLocked;
                if (isPending) {
                    input.placeholder = usingFreeProvider
                        ? 'Free AI is preparing your reply…'
                        : 'Sensei is preparing your reply…';
                } else if (isCoolingDown) {
                    input.placeholder = `Free AI cooldown — send in ${secondsRemaining} second${secondsRemaining === 1 ? '' : 's'}`;
                } else {
                    input.placeholder = this._aiSenseiOriginalPlaceholder;
                }
            }

            if (sendButton) {
                sendButton.disabled = isLocked;
            }
            document.querySelectorAll('.ai-quick-prompt').forEach((button) => {
                button.disabled = isLocked;
            });

            document.querySelectorAll('.ai-chat-quota-retry').forEach((button) => {
                if (button.dataset.readyText === undefined) {
                    button.dataset.readyText = button.textContent;
                }
                button.disabled = isLocked;
                if (isCoolingDown) {
                    button.textContent = `Retry in ${secondsRemaining}s`;
                } else if (isPending) {
                    button.textContent = 'Sending…';
                } else {
                    button.textContent = button.dataset.readyText;
                }
            });

            let statusMessage = '';
            if (isPending) {
                statusMessage = usingFreeProvider
                    ? 'Free AI is preparing your reply. Please wait.'
                    : 'Sensei is preparing your reply. Please wait.';
            } else if (isCoolingDown && this._aiSenseiCooldownReason === 'rate-limit') {
                statusMessage = `Free AI rate-limit cooldown active. Try again in ${secondsRemaining} second${secondsRemaining === 1 ? '' : 's'}.`;
            } else if (isCoolingDown) {
                statusMessage = `Free AI message cooldown enabled. You can send again in ${secondsRemaining} second${secondsRemaining === 1 ? '' : 's'}.`;
            }

            if (status) {
                status.hidden = !isLocked;
                status.classList.toggle(
                    'is-rate-limited',
                    isCoolingDown && this._aiSenseiCooldownReason === 'rate-limit'
                );
                status.textContent = statusMessage;
            }
            if (announcement && announce) {
                announcement.textContent = statusMessage;
            } else if (announcement && cooldownExpired && !isPending) {
                announcement.textContent = 'Free AI cooldown ended. You can send a message now.';
            }
        },

        startAISenseiChatCooldown(durationMs, reason = 'message') {
            if (this._aiSenseiCooldownTimer !== null && this._aiSenseiCooldownTimer !== undefined) {
                window.clearInterval(this._aiSenseiCooldownTimer);
            }
            const duration = Math.min(
                MAX_FREE_AI_RATE_LIMIT_COOLDOWN_MS,
                Math.max(0, Number(durationMs) || 0)
            );
            this._aiSenseiCooldownUntil = Date.now() + duration;
            this._aiSenseiCooldownReason = reason;
            this._aiSenseiCooldownTimer = null;
            this.updateAISenseiChatControls(true);
            if (duration > 0) {
                this._aiSenseiCooldownTimer = window.setInterval(
                    () => this.updateAISenseiChatControls(),
                    1000
                );
            }
        },

        getAISenseiRateLimitCooldownMs() {
            this._aiSenseiRateLimitStreak = (this._aiSenseiRateLimitStreak || 0) + 1;
            const multiplier = 2 ** Math.min(this._aiSenseiRateLimitStreak - 1, 5);
            return Math.min(
                MAX_FREE_AI_RATE_LIMIT_COOLDOWN_MS,
                FREE_AI_CHAT_COOLDOWN_MS * multiplier
            );
        },

        async requestAISenseiAnswer(question, outputEl, kanjiContext = null) {
            if (!outputEl || !window.AIManager) {
                return false;
            }
            if (this.isAISenseiChatLocked()) {
                this.updateAISenseiChatControls();
                return false;
            }

            const usingFreeProvider = this.isAISenseiUsingFreeProvider();
            let cooldownMs = FREE_AI_CHAT_COOLDOWN_MS;
            let cooldownReason = 'message';
            this._aiSenseiRequestPending = true;
            this.updateAISenseiChatControls(true);
            outputEl.replaceChildren();
            const loading = document.createElement('span');
            loading.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sensei is thinking...';
            outputEl.appendChild(loading);
            try {
                const answer = await AIManager.askSenseiQuestion(question, kanjiContext);
                outputEl.innerHTML = this.formatMarkdownToHtml(answer);
                this._aiSenseiRateLimitStreak = 0;
                return true;
            } catch (error) {
                outputEl.replaceChildren();
                if (AIManager.isFreeTierLimitError?.(error)) {
                    cooldownReason = 'rate-limit';
                    cooldownMs = this.getAISenseiRateLimitCooldownMs();
                    this.renderAIQuotaNotice(outputEl, () =>
                        this.requestAISenseiAnswer(question, outputEl, kanjiContext)
                    );
                    const retryButton = outputEl.querySelector(
                        '.ai-limit-notice__actions button:nth-child(2)'
                    );
                    if (retryButton) {
                        retryButton.classList.add('ai-chat-quota-retry');
                        retryButton.dataset.readyText = 'Retry this question';
                    }
                } else {
                    const errorText = document.createElement('span');
                    errorText.className = 'ai-request-error';
                    errorText.textContent =
                        error?.message || 'Sensei could not reply right now. Please try again.';
                    outputEl.appendChild(errorText);
                }
                return false;
            } finally {
                this._aiSenseiRequestPending = false;
                if (usingFreeProvider) {
                    this.startAISenseiChatCooldown(cooldownMs, cooldownReason);
                } else {
                    this.updateAISenseiChatControls();
                }
            }
        },

        async askAISensei(question) {
            const chatLog = document.getElementById('aiChatLog');
            if (!chatLog || !window.AIManager) {
                return false;
            }
            if (this.isAISenseiChatLocked()) {
                this.updateAISenseiChatControls();
                return false;
            }
            const userMsg = document.createElement('div');
            userMsg.className = 'ai-chat-msg ai-msg-user';
            userMsg.innerHTML = `<div class="ai-msg-text">${this.escapeHtml(question)}</div>`;
            chatLog.appendChild(userMsg);
            const botMsg = document.createElement('div');
            botMsg.className = 'ai-chat-msg ai-msg-bot';
            botMsg.innerHTML =
                '<div class="ai-msg-avatar"><i class="fas fa-brain"></i></div><div class="ai-msg-text"></div>';
            chatLog.appendChild(botMsg);
            chatLog.scrollTop = chatLog.scrollHeight;
            await this.requestAISenseiAnswer(
                question,
                botMsg.querySelector('.ai-msg-text'),
                this.currentKanji
            );
            chatLog.scrollTop = chatLog.scrollHeight;
            return true;
        },

        openAISenseiForCurrentKanji() {
            this.openAISenseiModal('ask-sensei');
            document.getElementById('aiSenseiInput')?.focus();
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
            const mnemonicCached = StorageManager.getAICacheItem(
                `mnemonic_${this.currentKanji.character}`
            );
            const etymologyCached = StorageManager.getAICacheItem(
                `etymology_${this.currentKanji.character}`
            );
            if (badgeEl) {
                badgeEl.style.display = mnemonicCached || etymologyCached ? 'inline-flex' : 'none';
            }
            this.switchKanjiDrawerTab(tab);
            drawer.classList.add('open');
            document.body.style.overflow = 'hidden';
        },

        closeKanjiDrawer() {
            const drawer = document.getElementById('kanjiDrawer');
            if (drawer) {
                drawer.classList.remove('open');
                document.body.style.overflow = '';
            }
        },

        switchKanjiDrawerTab(tabName) {
            document.querySelectorAll('.kanji-drawer-tab').forEach((tab) => {
                tab.classList.toggle('active', tab.dataset.drawerTab === tabName);
            });
            const paneMap = { mnemonic: 'drawerTabMnemonic', etymology: 'drawerTabEtymology' };
            document
                .querySelectorAll('.kanji-drawer-pane')
                .forEach((p) => p.classList.remove('active'));
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
                contentEl.innerHTML = this._drawerNoAIMessage();
                return;
            }
            const settings = StorageManager.getAISettings();
            if (!AIManager.isProviderConfigured(settings)) {
                contentEl.innerHTML = this._drawerNoAIMessage();
                this._drawerMnemonicInFlight = null;
                return;
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
                if (AIManager.isFreeTierLimitError?.(error)) {
                    contentEl.replaceChildren();
                    this.renderAIQuotaNotice(contentEl, () => this.loadDrawerMnemonic());
                } else {
                    contentEl.textContent =
                        error?.message || 'AI Sensei could not make a mnemonic right now.';
                }
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
                contentEl.innerHTML = this._drawerNoAIMessage();
                return;
            }
            const settings = StorageManager.getAISettings();
            if (!AIManager.isProviderConfigured(settings)) {
                contentEl.innerHTML = this._drawerNoAIMessage();
                this._drawerEtymologyInFlight = null;
                return;
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
                if (AIManager.isFreeTierLimitError?.(error)) {
                    contentEl.replaceChildren();
                    this.renderAIQuotaNotice(contentEl, () => this.loadDrawerEtymology());
                } else {
                    contentEl.textContent =
                        error?.message || 'AI Sensei could not explain this kanji right now.';
                }
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
            containerEl.insertAdjacentHTML(
                'beforeend',
                `<div class="kanji-drawer-stroke-warning"><i class="fas fa-pen-nib"></i><span>This kanji has <strong>${kanjiData.strokes} strokes</strong>. Pay close attention to the stroke order tips above to avoid common mistakes.</span></div>`
            );
        },

        _drawerNoAIMessage() {
            return '<div class="kanji-drawer-no-ai"><i class="fas fa-key"></i><p><strong>AI provider needs setup</strong></p><p>Choose Free AI Sensei or add a provider API key in Settings to use AI-powered mnemonics and etymology.</p><button onclick="app.closeKanjiDrawer(); app.openSettings();">Open AI Settings</button></div>';
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
                    this.currentKanji.strokes = count;
                    return count;
                }
            }
            try {
                const svgMarkup = await this.fetchStrokeOrderSvg(this.currentKanji.character);
                if (svgMarkup) {
                    const count = (svgMarkup.match(/<path\b/gi) || []).length;
                    if (count > 0) {
                        this.currentKanji.strokes = count;
                        return count;
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
