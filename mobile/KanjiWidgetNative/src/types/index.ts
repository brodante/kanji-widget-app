/**
 * Core data types shared across the entire KanjiWidgets Native app.
 * These mirror the JSON database schema exactly.
 */

// ─── Database types ─────────────────────────────────────────────────────────────

export type JLPTLevel =
  | 'Hiragana'
  | 'Katakana'
  | 'N5'
  | 'N4'
  | 'N3'
  | 'N2'
  | 'N1'
  | 'all';

export interface KanjiExample {
  word:    string;
  reading: string;
  meaning: string;
  audio:   string; // relative path e.g. "Kanji/N5/000093_1.mp3"
}

export interface KanjiAudio {
  onyomi:  Record<string, string>; // reading → mp3 path
  kunyomi: Record<string, string>;
}

export interface KanjiEntry {
  character:       string;
  meanings:        string[];
  onyomi:          string[];
  kunyomi:         string[];
  jlpt:            JLPTLevel;
  examples:        KanjiExample[];
  audio:           KanjiAudio;
  base_id:         string;
  character_audio?: string; // present on kana entries
  // Optional fields that may appear in N1-N3 entries
  stroke_count?:   number;
  radicals?:       string[];
  // KanjiVG stroke order data (used in Practice phase)
  strokes?:        string[];
}

// ─── Storage / Progress types ────────────────────────────────────────────────────

export interface AppProgress {
  mastered:     string[];   // characters mastered
  studied:      string[];   // characters seen at least once
  skipped:      string[];   // characters explicitly skipped
  currentLevel: JLPTLevel;
  startDate:    number;     // timestamp
  lastStudied:  number | null;
  streak:       number;
  totalTime:    number;     // minutes
}

export interface AppSettings {
  theme:            'light' | 'dark';
  accent:           'indigo' | 'teal' | 'rose' | 'amber';
  font:             string;
  fontSize:         'small' | 'medium' | 'large' | 'extra-large';
  autoPlay:         boolean;
  defaultAudio:     'kunyomi' | 'onyomi' | 'first';
  localBackupFreq:  'never' | 'daily' | 'weekly' | 'monthly';
}

export interface AISettings {
  provider:        'gemini' | 'openai' | 'claude' | 'openrouter' | 'ollama';
  apiKey:          string;
  model:           string;
  persona:         'encouraging' | 'strict' | 'mnemonic' | 'anime';
  customEndpoint?: string;
}

// ─── SRS types ───────────────────────────────────────────────────────────────────

export type WeaknessType = 'visual' | 'reading' | 'meaning' | null;

export interface SRSCard {
  character:      string;
  level:          JLPTLevel;
  repetition:     number;
  interval:       number;       // days
  easeFactor:     number;       // SM-2 ease factor
  lastReviewed:   number | null; // timestamp
  dueDate:        number;        // timestamp
  lapses:         number;
  totalReviews:   number;
  correctReviews: number;
  history:        SRSReviewEvent[];
  weaknessType:   WeaknessType;
}

export interface SRSReviewEvent {
  timestamp: number;
  grade:     0 | 1 | 2 | 3 | 4; // 0=Again, 1=Hard, 2=Good, 3=Easy (SM-2 quality)
  interval:  number;
}

export type ReviewGrade = 'again' | 'hard' | 'good' | 'easy';

export interface SRSData {
  cards: Record<string, SRSCard>; // character → card
}

// ─── Session types ───────────────────────────────────────────────────────────────

export interface ReviewSession {
  cards:         SRSCard[];
  currentIndex:  number;
  results:       ReviewSessionResult[];
  startTime:     number;
}

export interface ReviewSessionResult {
  character: string;
  grade:     ReviewGrade;
  wasNew:    boolean;
}
