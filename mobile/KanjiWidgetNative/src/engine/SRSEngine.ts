/**
 * SRSEngine — TypeScript port of srs-engine.js
 *
 * Implements an enhanced SM-2 algorithm tailored for Kanji & Kana acquisition.
 * Pure logic — no DOM, no AsyncStorage. Callers pass in data and get back
 * updated cards. Storage is the responsibility of StorageManager.
 */

import {
  AppProgress,
  JLPTLevel,
  ReviewGrade,
  SRSCard,
  SRSData,
  SRSReviewEvent,
  WeaknessType,
} from '../types';

// ─── Constants ───────────────────────────────────────────────────────────────────

const DEFAULT_EASE_FACTOR = 2.5;
const MIN_EASE_FACTOR     = 1.3;
const ONE_DAY_MS          = 24 * 60 * 60 * 1000;

// ─── Lookalike pairs ─────────────────────────────────────────────────────────────

export interface LookalikePair {
  pair:   string[];
  reason: string;
}

export const LOOKALIKE_PAIRS: LookalikePair[] = [
  { pair: ['日', '目'],       reason: 'Extra horizontal stroke in eye (目) vs sun (日)' },
  { pair: ['土', '士'],       reason: 'Bottom stroke length: Earth (土) longer bottom vs Samurai (士) longer top' },
  { pair: ['末', '未'],       reason: 'Top stroke length: End (末) longer top vs Not yet (未) longer second' },
  { pair: ['待', '持'],       reason: 'Radical distinction: Person walking (彳 - 待) vs Hand (扌 - 持)' },
  { pair: ['木', '本', '休'], reason: 'Radical derivation from tree (木)' },
  { pair: ['買', '貝'],       reason: 'Net radical (罒) atop shell (貝) means to buy (買)' },
  { pair: ['千', '干'],       reason: 'Slanted top tick in thousand (千) vs flat top in shield/dry (干)' },
  { pair: ['右', '左'],       reason: 'Stroke order difference: mouth (口) in right vs work (工) in left' },
  { pair: ['天', '夫'],       reason: 'Top stroke penetrates top in husband (夫) vs flat top in heaven (天)' },
  { pair: ['人', '入'],       reason: 'Left stroke overlaps in person (人) vs right stroke overlaps in enter (入)' },
  { pair: ['牛', '午'],       reason: 'Top vertical stroke penetrates top line in cow (牛) vs noon (午)' },
  { pair: ['白', '百'],       reason: 'Top horizontal stroke transforms white (白) into hundred (百)' },
  { pair: ['石', '右'],       reason: 'Top overhang in stone (石) vs right (右)' },
  { pair: ['大', '犬', '太'], reason: 'Dot position differences: dog (犬) top-right vs fat (太) bottom-center' },
];

// ─── Grade mapping ────────────────────────────────────────────────────────────────

// UI grades → numeric SM-2 grade (1..4)
const GRADE_TO_INT: Record<ReviewGrade, 1 | 2 | 3 | 4> = {
  again: 1,
  hard:  2,
  good:  3,
  easy:  4,
};

// ─── Card factory ─────────────────────────────────────────────────────────────────

export function createCard(character: string, level: JLPTLevel = 'N5'): SRSCard {
  return {
    character,
    level,
    repetition:     0,
    interval:       0,
    easeFactor:     DEFAULT_EASE_FACTOR,
    lastReviewed:   null,
    dueDate:        Date.now(),
    lapses:         0,
    totalReviews:   0,
    correctReviews: 0,
    history:        [],
    weaknessType:   null,
  };
}

export function getOrCreateCard(
  character: string,
  srsData:   SRSData,
  level:     JLPTLevel = 'N5',
): SRSCard {
  return srsData.cards[character] ?? createCard(character, level);
}

// ─── Core SM-2 review ─────────────────────────────────────────────────────────────

export interface RecordReviewOptions {
  level?:        JLPTLevel;
  weaknessType?: WeaknessType;
}

/**
 * Processes a review using the enhanced SM-2 algorithm.
 * Returns a new card (does NOT mutate the input).
 */
export function recordReview(
  card:    SRSCard,
  grade:   ReviewGrade,
  options: RecordReviewOptions = {},
): SRSCard {
  const now          = Date.now();
  const clampedGrade = GRADE_TO_INT[grade];
  const updated      = { ...card, history: [...card.history] };

  updated.totalReviews += 1;
  updated.lastReviewed  = now;
  if (options.level)        updated.level        = options.level;
  if (options.weaknessType) updated.weaknessType = options.weaknessType;

  if (clampedGrade === 1) {
    // Again — true failure
    updated.repetition = 0;
    updated.interval   = 0.5; // review in 12h
    updated.lapses    += 1;
  } else {
    // Hard / Good / Easy — recalled successfully
    updated.correctReviews += 1;

    if (updated.repetition === 0) {
      updated.interval = 1;
    } else if (updated.repetition === 1) {
      updated.interval = clampedGrade === 4 ? 6 : clampedGrade === 2 ? 2 : 3;
    } else if (clampedGrade === 2) {
      // Hard: conservative growth so difficult cards don't schedule too far ahead
      updated.interval = Math.max(1, Math.round(updated.interval * 1.2));
    } else {
      const modifier   = clampedGrade === 4 ? 1.3 : 1.0;
      updated.interval = Math.max(1, Math.round(updated.interval * updated.easeFactor * modifier));
    }

    updated.repetition += 1;
  }

  // SM-2 ease factor update (mapped from 1–4 → 0–5 scale)
  const sm2Score =
    clampedGrade === 1 ? 0 :
    clampedGrade === 2 ? 2 :
    clampedGrade === 3 ? 4 : 5;
  const efDelta = 0.1 - (5 - sm2Score) * (0.08 + (5 - sm2Score) * 0.02);
  updated.easeFactor = Math.max(
    MIN_EASE_FACTOR,
    parseFloat((updated.easeFactor + efDelta).toFixed(3)),
  );

  // Next due date
  updated.dueDate = now + Math.round(updated.interval * ONE_DAY_MS);

  // History — keep last 10
  const event: SRSReviewEvent = {
    timestamp: now,
    grade:     clampedGrade as 0 | 1 | 2 | 3 | 4,
    interval:  updated.interval,
  };
  updated.history = [event, ...updated.history].slice(0, 10);

  return updated;
}

/**
 * Applies a review result to SRSData and optionally syncs legacy progress lists.
 * Returns updated { srsData, progress }.
 */
export function applyReview(
  srsData:   SRSData,
  progress:  AppProgress,
  character: string,
  grade:     ReviewGrade,
  options:   RecordReviewOptions = {},
): { srsData: SRSData; progress: AppProgress } {
  const existing   = getOrCreateCard(character, srsData, options.level ?? 'N5');
  const updated    = recordReview(existing, grade, options);
  const newCards   = { ...srsData.cards, [character]: updated };
  const newSRSData = { cards: newCards };

  // Sync with legacy mastered list
  let newProgress = { ...progress, studied: [...progress.studied] };
  if (!newProgress.studied.includes(character)) {
    newProgress.studied = [...newProgress.studied, character];
  }

  const gradeInt = GRADE_TO_INT[grade];
  if (gradeInt >= 3 && updated.repetition >= 2) {
    if (!newProgress.mastered.includes(character)) {
      newProgress = { ...newProgress, mastered: [...newProgress.mastered, character] };
    }
  } else if (gradeInt === 1) {
    newProgress = {
      ...newProgress,
      mastered: newProgress.mastered.filter(c => c !== character),
    };
  }

  return { srsData: newSRSData, progress: newProgress };
}

// ─── Due cards ───────────────────────────────────────────────────────────────────

export function getDueCards(srsData: SRSData, level?: JLPTLevel): SRSCard[] {
  const now = Date.now();
  return Object.values(srsData.cards)
    .filter(card => {
      if (level && level !== 'all' && card.level !== level) return false;
      return card.dueDate <= now;
    })
    .sort((a, b) => a.dueDate - b.dueDate); // most overdue first
}

// ─── Weak cards ──────────────────────────────────────────────────────────────────

export function getWeakCards(srsData: SRSData, level?: JLPTLevel, limit = 10): SRSCard[] {
  return Object.values(srsData.cards)
    .filter(card => {
      if (level && level !== 'all' && card.level !== level) return false;
      return (
        card.lapses > 0 ||
        card.easeFactor < 2.2 ||
        (card.totalReviews > 0 && card.correctReviews / card.totalReviews < 0.75)
      );
    })
    .sort((a, b) => {
      if (b.lapses !== a.lapses) return b.lapses - a.lapses;
      return a.easeFactor - b.easeFactor;
    })
    .slice(0, limit);
}

// ─── Retention stats ──────────────────────────────────────────────────────────────

export interface RetentionStats {
  totalTracked:      number;
  learning:          number; // interval <= 1
  young:             number; // 1 < interval <= 21
  mature:            number; // interval > 21
  dueCount:          number;
  retentionRate:     number; // percent
  averageEaseFactor: number;
}

export function getRetentionStats(srsData: SRSData, level?: JLPTLevel): RetentionStats {
  const now = Date.now();
  const cards = Object.values(srsData.cards).filter(card =>
    !level || level === 'all' || card.level === level,
  );

  let learning = 0, young = 0, mature = 0, due = 0;
  let totalReviews = 0, totalCorrect = 0, totalEase = 0;

  for (const card of cards) {
    if (card.dueDate <= now)     due      += 1;
    if (card.interval <= 1)      learning += 1;
    else if (card.interval <= 21) young   += 1;
    else                          mature  += 1;
    totalReviews  += card.totalReviews;
    totalCorrect  += card.correctReviews;
    totalEase     += card.easeFactor;
  }

  return {
    totalTracked:      cards.length,
    learning,
    young,
    mature,
    dueCount:          due,
    retentionRate:     totalReviews > 0 ? Math.round((totalCorrect / totalReviews) * 100) : 100,
    averageEaseFactor: cards.length > 0 ? parseFloat((totalEase / cards.length).toFixed(2)) : DEFAULT_EASE_FACTOR,
  };
}

// ─── Diagnostics (local/rule-based, no AI required) ──────────────────────────────

export interface LookalikeTrap {
  kanji1:  string;
  kanji2:  string;
  reason:  string;
  status:  'Both Studied' | 'One Studied' | 'Pending';
}

export interface DiagnosticsReport {
  source:        'algorithmic';
  retentionRate: number;
  dueCount:      number;
  matureCount:   number;
  weakCards:     Array<{ character: string; lapses: number; easeFactor: number }>;
  lookalikeTraps: LookalikeTrap[];
  priorityStudy: Array<{ character: string; reason: string }>;
  advice:        string;
}

export function generateDiagnostics(
  srsData:     SRSData,
  progress:    AppProgress,
  currentPool: Array<{ character: string }>,
): DiagnosticsReport {
  const level      = progress.currentLevel;
  const stats      = getRetentionStats(srsData, level);
  const weak       = getWeakCards(srsData, level, 8);
  const masteredSet = new Set(progress.mastered);
  const poolSet     = new Set(currentPool.map(k => k.character));

  // Lookalike traps in current pool
  const traps: LookalikeTrap[] = [];
  for (const item of LOOKALIKE_PAIRS) {
    if (item.pair.some(c => poolSet.has(c))) {
      traps.push({
        kanji1:  item.pair[0],
        kanji2:  item.pair[1],
        reason:  item.reason,
        status:  masteredSet.has(item.pair[0]) && masteredSet.has(item.pair[1])
          ? 'Both Studied'
          : masteredSet.has(item.pair[0]) || masteredSet.has(item.pair[1])
          ? 'One Studied'
          : 'Pending',
      });
    }
  }

  // Priority study list
  const priority: DiagnosticsReport['priorityStudy'] = [];
  for (const wc of weak) {
    priority.push({ character: wc.character, reason: `${wc.lapses} lapses` });
  }
  for (const item of currentPool) {
    if (!masteredSet.has(item.character) && !priority.some(p => p.character === item.character)) {
      priority.push({ character: item.character, reason: 'Next in sequence' });
      if (priority.length >= 5) break;
    }
  }

  const advice =
    stats.dueCount > 10
      ? 'You have a review backlog! Clear your queue before learning new kanji to prevent memory decay.'
      : stats.retentionRate < 80
      ? 'Retention below 80%. Spend extra time visualising radicals and stroke sequences.'
      : 'Pacing looks healthy! Keep up daily consistency to maintain retention.';

  return {
    source:         'algorithmic',
    retentionRate:  stats.retentionRate,
    dueCount:       stats.dueCount,
    matureCount:    stats.mature,
    weakCards:      weak.map(c => ({ character: c.character, lapses: c.lapses, easeFactor: c.easeFactor })),
    lookalikeTraps: traps.slice(0, 4),
    priorityStudy:  priority.slice(0, 5),
    advice,
  };
}
