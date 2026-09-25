/**
 * AIManager — TypeScript port of ai-manager.js
 *
 * Supports: Gemini (default), OpenAI, Claude, OpenRouter, Ollama
 * API keys are stored in AsyncStorage via StorageManager (never backed up).
 * Responses are cached per character+prompt type.
 */

import { getAICache, getAISettings, setAICache } from '../storage/StorageManager';
import { AISettings } from '../types';

// ─── Provider endpoints ────────────────────────────────────────────────────────
const ENDPOINTS: Record<AISettings['provider'], string> = {
  gemini:     'https://generativelanguage.googleapis.com/v1beta/models',
  openai:     'https://api.openai.com/v1/chat/completions',
  claude:     'https://api.anthropic.com/v1/messages',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
  ollama:     'http://localhost:11434/api/generate',
};

const DEFAULT_MODELS: Record<AISettings['provider'], string> = {
  gemini:     'gemini-1.5-flash',
  openai:     'gpt-4o-mini',
  claude:     'claude-3-haiku-20240307',
  openrouter: 'openai/gpt-4o-mini',
  ollama:     'llama3',
};

// ─── Persona system prompts ────────────────────────────────────────────────────
const PERSONAS: Record<AISettings['persona'], string> = {
  encouraging:
    'You are a warm, encouraging Japanese language sensei. You celebrate small wins, use gentle explanations, and make kanji feel approachable. Keep responses concise (3-4 sentences max) and end with an encouraging note.',
  strict:
    'You are Master Kenji, a strict and precise Japanese language teacher. You demand accuracy, point out common mistakes directly, and focus on correct usage. Be concise and exact.',
  mnemonic:
    'You are the Mnemonic Magician. You create vivid, memorable visual stories that connect kanji shapes to their meanings. Make every explanation a mini story. Keep it under 4 sentences.',
  anime:
    'You are an enthusiastic anime senpai who loves Japanese! Use casual language, occasional Japanese words with translations, and high energy. Keep it fun and under 4 sentences. Ganbatte!',
};

// ─── Cache key ────────────────────────────────────────────────────────────────
function cacheKey(character: string, promptType: string): string {
  return `${character}::${promptType}`;
}

// ─── Build request ────────────────────────────────────────────────────────────
function buildPrompt(settings: AISettings, systemPrompt: string, userMessage: string): RequestInit {
  const { provider, apiKey, model } = settings;
  const effectiveModel = model || DEFAULT_MODELS[provider];

  switch (provider) {
    case 'gemini': {
      const url = `${ENDPOINTS.gemini}/${effectiveModel}:generateContent?key=${apiKey}`;
      return {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${systemPrompt}\n\n${userMessage}` }] }],
          generationConfig: { maxOutputTokens: 300, temperature: 0.7 },
        }),
        // Attach url as a non-standard field for our fetch wrapper
        // @ts-ignore
        _url: url,
      };
    }
    case 'ollama': {
      const endpoint = settings.customEndpoint || ENDPOINTS.ollama;
      return {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: effectiveModel,
          prompt: `${systemPrompt}\n\n${userMessage}`,
          stream: false,
        }),
        // @ts-ignore
        _url: endpoint,
      };
    }
    default: {
      // OpenAI-compatible (openai, claude via openrouter, openrouter)
      return {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          ...(provider === 'claude' ? { 'anthropic-version': '2023-06-01' } : {}),
        },
        body: JSON.stringify({
          model: effectiveModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user',   content: userMessage  },
          ],
          max_tokens: 300,
        }),
        // @ts-ignore
        _url: ENDPOINTS[provider],
      };
    }
  }
}

function extractText(provider: AISettings['provider'], data: unknown): string {
  try {
    const d = data as Record<string, unknown>;
    if (provider === 'gemini') {
      return (d as any).candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    }
    if (provider === 'ollama') {
      return (d as any).response ?? '';
    }
    // OpenAI-compatible
    return (d as any).choices?.[0]?.message?.content ?? '';
  } catch {
    return '';
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface AskOptions {
  character?:  string;
  promptType?: string;   // e.g. 'mnemonic', 'etymology', 'chat'
  userMessage: string;
  useCache?:   boolean;
}

export async function askSensei(opts: AskOptions): Promise<string> {
  const settings    = getAISettings();
  const { character, promptType = 'chat', userMessage, useCache = true } = opts;

  if (!settings.apiKey && settings.provider !== 'ollama') {
    return 'No API key configured. Go to Settings → AI Sensei to add your key.';
  }

  // Cache check
  if (useCache && character) {
    const cache = await getAICache();
    const key   = cacheKey(character, promptType);
    if (cache[key]) return cache[key] as string;
  }

  const systemPrompt = PERSONAS[settings.persona];
  const reqInit      = buildPrompt(settings, systemPrompt, userMessage);
  // @ts-ignore
  const url: string  = reqInit._url;

  try {
    const res  = await fetch(url, reqInit);
    if (!res.ok) {
      const err = await res.text();
      return `API error ${res.status}: ${err.slice(0, 200)}`;
    }
    const data = await res.json();
    const text = extractText(settings.provider, data).trim();
    if (!text) return 'Sensei has no response right now. Please try again.';

    // Cache the response
    if (useCache && character) {
      const cache = await getAICache();
      cache[cacheKey(character, promptType)] = text;
      await setAICache(cache);
    }

    return text;
  } catch (e) {
    return `Network error: ${String(e).slice(0, 150)}`;
  }
}

/** Test the current provider config. Returns { ok, message }. */
export async function testConnection(): Promise<{ ok: boolean; message: string }> {
  try {
    const result = await askSensei({
      userMessage: 'Say "Connection OK" in Japanese and English, nothing else.',
      useCache: false,
    });
    const ok = !result.startsWith('API error') && !result.startsWith('Network error') && !result.startsWith('No API key');
    return { ok, message: result };
  } catch (e) {
    return { ok: false, message: String(e) };
  }
}
