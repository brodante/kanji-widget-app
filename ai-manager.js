/**
 * Multi-Provider AI Integration Manager for KanjiWidgets
 * Supports Gemini, OpenAI, Claude, OpenRouter, and local Ollama.
 */
class AIManager {
    static PROVIDER_DEFAULTS = {
        gemini: {
            name: 'Google Gemini',
            defaultModel: 'gemini-1.5-flash',
            models: ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash-exp'],
            requiresKey: true
        },
        openai: {
            name: 'OpenAI',
            defaultModel: 'gpt-4o-mini',
            models: ['gpt-4o-mini', 'gpt-4o', 'gpt-3.5-turbo'],
            requiresKey: true
        },
        claude: {
            name: 'Anthropic Claude',
            defaultModel: 'claude-3-5-haiku-20241022',
            models: ['claude-3-5-haiku-20241022', 'claude-3-5-sonnet-20241022'],
            requiresKey: true
        },
        openrouter: {
            name: 'OpenRouter',
            defaultModel: 'google/gemini-flash-1.5',
            models: [
                'google/gemini-flash-1.5',
                'openai/gpt-4o-mini',
                'anthropic/claude-3.5-haiku',
                'meta-llama/llama-3.2-3b-instruct:free'
            ],
            requiresKey: true
        },
        ollama: {
            name: 'Ollama (Local)',
            defaultModel: 'llama3.2',
            models: ['llama3.2', 'mistral', 'qwen2.5'],
            requiresKey: false,
            defaultEndpoint: 'http://localhost:11434/api/generate'
        }
    };

    static PERSONA_PROMPTS = {
        encouraging:
            'You are Kanji Sensei, a warm, highly encouraging, and empathetic Japanese language teacher. You praise student progress and explain kanji concepts in simple, intuitive, and delightful ways.',
        strict: 'You are Master Kenji, a disciplined and razor-sharp traditional Japanese calligraphy master. You deliver concise, pinpoint-accurate critiques, identify precise error patterns, and demand total mastery of stroke nuances.',
        mnemonic:
            'You are the Memory Magician, an expert in vivid visual mnemonics and radical etymology. You break down complex kanji into striking, hilarious, or unforgettable mental movies so students never forget them.',
        anime: 'You are your cheerful anime senpai study partner! You use energetic and friendly language, peppered with natural Japanese conversational encouragement like よし！, 頑張って！, and すごい！.'
    };

    /**
     * Tests connectivity to the configured AI provider.
     */
    static async testConnection(customSettings = null) {
        const settings = customSettings || StorageManager.getAISettings();
        const testPrompt = 'Respond with exactly one word: "Connected"';

        try {
            const response = await this.callProvider(
                testPrompt,
                'You are a connection testing bot.',
                settings
            );
            if (response && response.length > 0) {
                return {
                    success: true,
                    message: `Connected successfully to ${settings.provider} (${settings.model})!`
                };
            }
            return { success: false, message: 'Received empty response from provider.' };
        } catch (error) {
            return { success: false, message: error.message || 'Connection failed.' };
        }
    }

    /**
     * Dispatches prompt completion to the selected provider.
     */
    static async callProvider(prompt, systemInstruction = '', overrideSettings = null) {
        const settings = overrideSettings || StorageManager.getAISettings();
        const provider = settings.provider || 'gemini';
        const apiKey = settings.apiKey ? settings.apiKey.trim() : '';
        const model =
            settings.model || this.PROVIDER_DEFAULTS[provider]?.defaultModel || 'gemini-1.5-flash';

        if (this.PROVIDER_DEFAULTS[provider]?.requiresKey && !apiKey) {
            throw new Error(
                `API Key is required for ${this.PROVIDER_DEFAULTS[provider]?.name || provider}. Please set it in Settings.`
            );
        }

        switch (provider) {
        case 'gemini':
            return this.callGemini(
                prompt,
                systemInstruction,
                apiKey,
                model,
                settings.temperature
            );
        case 'openai':
            return this.callOpenAI(
                prompt,
                systemInstruction,
                apiKey,
                model,
                settings.temperature
            );
        case 'claude':
            return this.callClaude(
                prompt,
                systemInstruction,
                apiKey,
                model,
                settings.temperature
            );
        case 'openrouter':
            return this.callOpenRouter(
                prompt,
                systemInstruction,
                apiKey,
                model,
                settings.temperature
            );
        case 'ollama':
            return this.callOllama(
                prompt,
                systemInstruction,
                settings.customEndpoint || 'http://localhost:11434/api/generate',
                model
            );
        default:
            throw new Error(`Unsupported provider: ${provider}`);
        }
    }

    /**
     * Google Gemini API Client
     */
    static async callGemini(prompt, systemInstruction, apiKey, model, temperature = 0.7) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const contents = [];

        if (systemInstruction) {
            contents.push({
                role: 'user',
                parts: [{ text: `[System Instruction: ${systemInstruction}]` }]
            });
            contents.push({
                role: 'model',
                parts: [{ text: 'Understood. I will follow these instructions.' }]
            });
        }

        contents.push({
            role: 'user',
            parts: [{ text: prompt }]
        });

        const body = {
            contents: contents,
            generationConfig: {
                temperature: temperature,
                maxOutputTokens: 1200
            }
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(
                errData.error?.message || `Gemini API error (Status: ${response.status})`
            );
        }

        const data = await response.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    }

    /**
     * OpenAI API Client
     */
    static async callOpenAI(prompt, systemInstruction, apiKey, model, temperature = 0.7) {
        const url = 'https://api.openai.com/v1/chat/completions';
        const messages = [];

        if (systemInstruction) {
            messages.push({ role: 'system', content: systemInstruction });
        }
        messages.push({ role: 'user', content: prompt });

        const body = {
            model: model,
            messages: messages,
            temperature: temperature,
            max_tokens: 1200
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(
                errData.error?.message || `OpenAI API error (Status: ${response.status})`
            );
        }

        const data = await response.json();
        return data.choices?.[0]?.message?.content?.trim() || '';
    }

    /**
     * Anthropic Claude API Client
     */
    static async callClaude(prompt, systemInstruction, apiKey, model, temperature = 0.7) {
        const url = 'https://api.anthropic.com/v1/messages';
        const body = {
            model: model,
            max_tokens: 1200,
            temperature: temperature,
            system: systemInstruction || undefined,
            messages: [{ role: 'user', content: prompt }]
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'dangerously-allow-browser': 'true',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(
                errData.error?.message || `Claude API error (Status: ${response.status})`
            );
        }

        const data = await response.json();
        return data.content?.[0]?.text?.trim() || '';
    }

    /**
     * OpenRouter API Client
     */
    static async callOpenRouter(prompt, systemInstruction, apiKey, model, temperature = 0.7) {
        const url = 'https://openrouter.ai/api/v1/chat/completions';
        const messages = [];

        if (systemInstruction) {
            messages.push({ role: 'system', content: systemInstruction });
        }
        messages.push({ role: 'user', content: prompt });

        const body = {
            model: model,
            messages: messages,
            temperature: temperature
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'HTTP-Referer': window.location.href || 'https://kanjiwidgets.local',
                'X-Title': 'KanjiWidgets',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(
                errData.error?.message || `OpenRouter API error (Status: ${response.status})`
            );
        }

        const data = await response.json();
        return data.choices?.[0]?.message?.content?.trim() || '';
    }

    /**
     * Ollama (Local LLM) Client
     */
    static async callOllama(prompt, systemInstruction, endpoint, model) {
        const fullPrompt = systemInstruction
            ? `[SYSTEM: ${systemInstruction}]\n\n${prompt}`
            : prompt;
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: model,
                prompt: fullPrompt,
                stream: false
            })
        });

        if (!response.ok) {
            throw new Error(
                `Ollama connection error (Status: ${response.status}). Ensure Ollama is running locally.`
            );
        }

        const data = await response.json();
        return (data.response || data.message?.content || '').trim();
    }

    /**
     * Analyzes user study profile and SRS data to generate a deep-dive diagnostic report.
     */
    static async analyzeStudyProfile(progressData, srsStats, weakCards, currentPool = []) {
        const settings = StorageManager.getAISettings();
        const personaPrompt =
            this.PERSONA_PROMPTS[settings.persona] || this.PERSONA_PROMPTS.encouraging;

        // Check if API key is provided; if not, return fallback immediately
        const providerConfig = this.PROVIDER_DEFAULTS[settings.provider];
        if (providerConfig?.requiresKey && !settings.apiKey) {
            const fallback = SRSEngine.generateRuleBasedDiagnostics(progressData, currentPool);
            return {
                ...fallback,
                aiGenerated: false,
                note: 'Showing local algorithmic diagnostic. Add an API key in Settings for personalized AI Sensei commentary.'
            };
        }

        const masteredCount = progressData.mastered ? progressData.mastered.length : 0;
        const totalStudied = progressData.studied ? progressData.studied.length : 0;
        const streak = progressData.streak || 0;
        const currentLevel = progressData.currentLevel || 'N5';
        const weakList =
            weakCards
                .map((c) => `${c.character} (lapses: ${c.lapses}, ease: ${c.easeFactor})`)
                .join(', ') || 'None identified yet';

        const prompt = `Analyze this Japanese learner's study profile and SRS telemetry data:
- Current JLPT Level: ${currentLevel}
- Mastered Characters (${masteredCount}): ${progressData.mastered.slice(-20).join(', ')}...
- Total Studied Count: ${totalStudied}
- Daily Streak: ${streak} days
- SRS Retention Rate: ${srsStats.retentionRate}%
- Cards Due for Review: ${srsStats.dueCount}
- Mature Cards: ${srsStats.matureCount}
- Struggling/Weak Kanji: ${weakList}

Provide a comprehensive, highly insightful learning diagnostic with these exact 4 sections formatted cleanly with markdown:
### 1. 🌟 Strengths & Momentum
Comment on their retention pace, streak consistency, and mastered milestones.

### 2. ⚠️ Critical Weak Spots & Confusion Traps
Highlight specific traps (lookalike kanji, onyomi/kunyomi mixups, or lapses) and why they occur.

### 3. 🗺️ Tailored Study Path & Strategy
Give 3 concrete, actionable steps for the next 7 days to maximize retention and breakthrough bottlenecks.

### 4. 💬 Sensei's Words of Encouragement
A short inspirational or coaching signoff tailored to your persona.`;

        try {
            const commentary = await this.callProvider(prompt, personaPrompt);
            const fallback = SRSEngine.generateRuleBasedDiagnostics(progressData, currentPool);

            return {
                ...fallback,
                aiGenerated: true,
                commentary: commentary,
                persona: settings.persona
            };
        } catch (error) {
            console.warn('AI analysis request failed, using algorithmic fallback:', error);
            const fallback = SRSEngine.generateRuleBasedDiagnostics(progressData, currentPool);
            return {
                ...fallback,
                aiGenerated: false,
                error: error.message,
                note: 'AI service was unavailable. Displaying local algorithmic diagnostics.'
            };
        }
    }

    /**
     * Generates a custom visual mnemonic story for a Kanji.
     * Enhanced with JLPT level context and stroke-count warnings.
     */
    static async generateMnemonic(kanjiData) {
        const cacheKey = `mnemonic_${kanjiData.character}`;
        const cached = StorageManager.getAICacheItem(cacheKey);
        if (cached && cached.data) {
            return cached.data;
        }

        const settings = StorageManager.getAISettings();
        const personaPrompt =
            this.PERSONA_PROMPTS[settings.persona] || this.PERSONA_PROMPTS.mnemonic;

        const jlptContext = (kanjiData.level || kanjiData.jlpt)
            ? `\nJLPT Level: ${kanjiData.level || kanjiData.jlpt}`
            : '';
        const strokeContext = kanjiData.strokes
            ? `\nStroke count: ${kanjiData.strokes}`
            : '';

        const prompt = `Create an unforgettable, vivid visual mnemonic for the kanji "${kanjiData.character}".
Meanings: ${(kanjiData.meanings || []).join(', ')}
On'yomi: ${(kanjiData.onyomi || []).join(', ')}
Kun'yomi: ${(kanjiData.kunyomi || []).join(', ')}${jlptContext}${strokeContext}

Structure your response clearly with:
- **Radical Anatomy**: Break down its components/shapes.
- **The Mnemonic Story**: A memorable, visual, or funny scene connecting the radicals to the meaning.
- **Reading Hook**: A catchy sound association to remember the primary reading.
${kanjiData.strokes && kanjiData.strokes > 12 ? '- **Stroke Order Tip**: This is a complex kanji with many strokes. Highlight the most commonly confused strokes or stroke order pitfalls.' : ''}`;

        const result = await this.callProvider(prompt, personaPrompt);
        StorageManager.setAICacheItem(cacheKey, result);
        return result;
    }

    /**
     * Explains the etymology, radical breakdown, and nuances of a Kanji.
     * Enhanced with JLPT level context, stroke warnings, and radical sharing.
     */
    static async explainEtymology(kanjiData) {
        const cacheKey = `etymology_${kanjiData.character}`;
        const cached = StorageManager.getAICacheItem(cacheKey);
        if (cached && cached.data) {
            return cached.data;
        }

        const personaPrompt =
            'You are a Japanese linguistics scholar and etymologist. Explain historical origins, oracle bone script evolution, and semantic radicals concisely.';

        const jlptContext = (kanjiData.level || kanjiData.jlpt)
            ? `\nJLPT Level: ${kanjiData.level || kanjiData.jlpt}`
            : '';

        const prompt = `Explain the historical etymology and radical composition of the kanji "${kanjiData.character}" (${(kanjiData.meanings || []).join(', ')}).
Include:
1. Historical origin / visual evolution (ancient pictograph or ideograph).
2. The core radical and its semantic meaning.
3. Common lookalike kanji and how to distinguish them without error.
4. Structural breakdown (left-right, top-bottom, enclosure, etc.).
${kanjiData.strokes && kanjiData.strokes > 12 ? `5. **Stroke Warning**: This complex kanji has ${kanjiData.strokes} strokes. Point out the trickiest stroke transitions and commonly confused sub-components.` : ''}${jlptContext}`;

        const result = await this.callProvider(prompt, personaPrompt);
        StorageManager.setAICacheItem(cacheKey, result);
        return result;
    }

    /**
     * Answers a freeform student question about Japanese / Kanji.
     */
    static async askSenseiQuestion(question, currentKanji = null) {
        const settings = StorageManager.getAISettings();
        const personaPrompt =
            this.PERSONA_PROMPTS[settings.persona] || this.PERSONA_PROMPTS.encouraging;

        let prompt = `Student Question: "${question}"`;
        if (currentKanji) {
            prompt += `\n\nCurrently viewing Kanji card: ${currentKanji.character} (Meanings: ${(currentKanji.meanings || []).join(', ')}, Readings: ${[...(currentKanji.onyomi || []), ...(currentKanji.kunyomi || [])].join(', ')})`;
        }

        return this.callProvider(prompt, personaPrompt);
    }
}

// Export for module/browser environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AIManager;
}
