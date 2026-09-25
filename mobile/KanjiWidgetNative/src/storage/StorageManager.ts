/**
 * StorageManager — AsyncStorage port of storage-manager.js
 *
 * Key design decisions vs the web version:
 * - All methods are async (AsyncStorage is async unlike localStorage)
 * - Same key names and data shapes as the web app for future Firestore compatibility
 * - A synchronous in-memory cache is kept so the UI can read without awaiting on
 *   every render. Cache is populated on init() and updated on every write.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AISettings,
  AppProgress,
  AppSettings,
  JLPTLevel,
  SRSData,
} from '../types';

// ─── Storage keys (same as web app) ─────────────────────────────────────────────
const KEYS = {
  PROGRESS:    'kanji_progress',
  RECENT:      'kanji_recent',
  SETTINGS:    'kanji_settings',
  CACHE:       'kanji_cache',
  SRS_DATA:    'kanji_srs_data',
  AI_SETTINGS:  'kanji_ai_settings',
  AI_CACHE:     'kanji_ai_cache',
  FAB_POSITION: 'kanji_ai_fab_pos',
} as const;

// ─── Defaults ────────────────────────────────────────────────────────────────────
const DEFAULT_PROGRESS: AppProgress = {
  mastered:     [],
  studied:      [],
  skipped:      [],
  currentLevel: 'N5',
  startDate:    Date.now(),
  lastStudied:  null,
  streak:       0,
  totalTime:    0,
};

const DEFAULT_SETTINGS: AppSettings = {
  theme:           'dark',
  accent:          'indigo',
  font:            'Klee One',
  fontSize:        'medium',
  autoPlay:        false,
  defaultAudio:    'kunyomi',
  localBackupFreq: 'daily',
};

const DEFAULT_AI_SETTINGS: AISettings = {
  provider:  'gemini',
  apiKey:    '',
  model:     'gemini-1.5-flash',
  persona:   'encouraging',
};

const DEFAULT_SRS_DATA: SRSData = { cards: {} };

// ─── In-memory cache ─────────────────────────────────────────────────────────────
// Lets components read the last-known value synchronously.
let _cache: {
  progress:   AppProgress;
  recent:     string[];
  settings:   AppSettings;
  srsData:    SRSData;
  aiSettings: AISettings;
} = {
  progress:   { ...DEFAULT_PROGRESS },
  recent:     [],
  settings:   { ...DEFAULT_SETTINGS },
  srsData:    { ...DEFAULT_SRS_DATA },
  aiSettings: { ...DEFAULT_AI_SETTINGS },
};

let _initialized = false;

// ─── Generic helpers ─────────────────────────────────────────────────────────────
async function setItem<T>(key: string, value: T): Promise<boolean> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.error('[StorageManager] setItem error:', key, e);
    return false;
  }
}

async function getItem<T>(key: string, defaultValue: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw === null) return defaultValue;
    return JSON.parse(raw) as T;
  } catch (e) {
    console.error('[StorageManager] getItem error:', key, e);
    return defaultValue;
  }
}

// ─── Initialisation ──────────────────────────────────────────────────────────────
/**
 * Must be called once on app start (in App.tsx).
 * Loads all values from AsyncStorage into the in-memory cache.
 */
export async function initStorage(): Promise<void> {
  if (_initialized) return;

  const [progress, recent, settings, srsData, aiSettings] = await Promise.all([
    getItem<AppProgress>(KEYS.PROGRESS,    DEFAULT_PROGRESS),
    getItem<string[]>  (KEYS.RECENT,       []),
    getItem<AppSettings>(KEYS.SETTINGS,    DEFAULT_SETTINGS),
    getItem<SRSData>    (KEYS.SRS_DATA,    DEFAULT_SRS_DATA),
    getItem<AISettings> (KEYS.AI_SETTINGS, DEFAULT_AI_SETTINGS),
  ]);

  _cache = { progress, recent, settings, srsData, aiSettings };
  _initialized = true;
}

// ─── Progress ────────────────────────────────────────────────────────────────────

export function getProgress(): AppProgress {
  return _cache.progress;
}

export async function saveProgress(progress: AppProgress): Promise<void> {
  _cache.progress = progress;
  await setItem(KEYS.PROGRESS, progress);
}

export async function markAsMastered(character: string): Promise<AppProgress> {
  const p = { ..._cache.progress };
  if (!p.mastered.includes(character)) p.mastered = [...p.mastered, character];
  if (!p.studied.includes(character))  p.studied  = [...p.studied,  character];
  p.lastStudied = Date.now();
  await saveProgress(p);
  return p;
}

export async function markAsStudied(character: string): Promise<AppProgress> {
  const p = { ..._cache.progress };
  if (!p.studied.includes(character)) p.studied = [...p.studied, character];
  p.lastStudied = Date.now();
  await saveProgress(p);
  return p;
}

export async function unmarkMastered(character: string): Promise<AppProgress> {
  const p = { ..._cache.progress };
  p.mastered = p.mastered.filter(c => c !== character);
  await saveProgress(p);
  return p;
}

export async function setCurrentLevel(level: JLPTLevel): Promise<void> {
  const p = { ..._cache.progress, currentLevel: level };
  await saveProgress(p);
}

export async function updateStreak(): Promise<number> {
  const p = { ..._cache.progress };
  const now      = new Date();
  const last     = p.lastStudied ? new Date(p.lastStudied) : null;
  const today    = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = today - 86400000;

  if (!last) {
    p.streak = 1;
  } else {
    const lastDay = new Date(last.getFullYear(), last.getMonth(), last.getDate()).getTime();
    if (lastDay === today) {
      // already studied today — no change
    } else if (lastDay === yesterday) {
      p.streak += 1;
    } else {
      p.streak = 1; // streak broken
    }
  }

  p.lastStudied = Date.now();
  await saveProgress(p);
  return p.streak;
}

export async function resetProgress(): Promise<void> {
  const fresh: AppProgress = { ...DEFAULT_PROGRESS, startDate: Date.now() };
  await saveProgress(fresh);
}

// ─── Recent ──────────────────────────────────────────────────────────────────────
const MAX_RECENT = 20;

export function getRecent(): string[] {
  return _cache.recent;
}

export async function addRecent(character: string): Promise<string[]> {
  const list = [character, ..._cache.recent.filter(c => c !== character)].slice(
    0, MAX_RECENT,
  );
  _cache.recent = list;
  await setItem(KEYS.RECENT, list);
  return list;
}

// ─── Settings ────────────────────────────────────────────────────────────────────

export function getSettings(): AppSettings {
  return _cache.settings;
}

export async function saveSettings(settings: Partial<AppSettings>): Promise<AppSettings> {
  const merged = { ..._cache.settings, ...settings };
  _cache.settings = merged;
  await setItem(KEYS.SETTINGS, merged);
  return merged;
}

// ─── SRS Data ────────────────────────────────────────────────────────────────────

export function getSRSData(): SRSData {
  return _cache.srsData;
}

export async function saveSRSData(data: SRSData): Promise<void> {
  _cache.srsData = data;
  await setItem(KEYS.SRS_DATA, data);
}

// ─── AI Settings ─────────────────────────────────────────────────────────────────

export function getAISettings(): AISettings {
  return _cache.aiSettings;
}

export async function saveAISettings(settings: Partial<AISettings>): Promise<AISettings> {
  const merged = { ..._cache.aiSettings, ...settings };
  _cache.aiSettings = merged;
  await setItem(KEYS.AI_SETTINGS, merged);
  return merged;
}

// ─── AI Cache (per-character AI responses) ───────────────────────────────────────

export async function getAICache(): Promise<Record<string, unknown>> {
  return getItem<Record<string, unknown>>(KEYS.AI_CACHE, {});
}

export async function setAICache(cache: Record<string, unknown>): Promise<void> {
  await setItem(KEYS.AI_CACHE, cache);
}

// ─── Export / Import (for backup) ────────────────────────────────────────────────

export interface BackupPayload {
  version:    2;
  exportedAt: number;
  progress:   AppProgress;
  recent:     string[];
  settings:   AppSettings;
  srsData:    SRSData;
}

export async function exportBackup(): Promise<BackupPayload> {
  return {
    version:    2,
    exportedAt: Date.now(),
    progress:   _cache.progress,
    recent:     _cache.recent,
    settings:   _cache.settings,
    srsData:    _cache.srsData,
  };
}

export async function importBackup(payload: BackupPayload): Promise<void> {
  if (payload.version !== 2) throw new Error('Unsupported backup version');
  await Promise.all([
    saveProgress(payload.progress),
    setItem(KEYS.RECENT, payload.recent),
    saveSettings(payload.settings),
    saveSRSData(payload.srsData),
  ]);
  _cache.recent = payload.recent;
}

// ─── Floating Button Position ────────────────────────────────────────────────────
export interface FabPosition {
  x: number;
  y: number;
}

export async function getFabPosition(): Promise<FabPosition | null> {
  return getItem<FabPosition | null>(KEYS.FAB_POSITION, null);
}

export async function saveFabPosition(pos: FabPosition): Promise<void> {
  await setItem(KEYS.FAB_POSITION, pos);
}

// ─── Full reset ──────────────────────────────────────────────────────────────────

export async function clearAll(): Promise<void> {
  await AsyncStorage.multiRemove(Object.values(KEYS));
  _cache = {
    progress:   { ...DEFAULT_PROGRESS, startDate: Date.now() },
    recent:     [],
    settings:   { ...DEFAULT_SETTINGS },
    srsData:    { ...DEFAULT_SRS_DATA },
    aiSettings: { ...DEFAULT_AI_SETTINGS },
  };
  _initialized = false;
}

