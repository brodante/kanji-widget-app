/**
 * SRSEngine unit tests — pure logic, no I/O.
 */

import {
  applyReview,
  createCard,
  getDueCards,
  getOrCreateCard,
  getRetentionStats,
  getWeakCards,
  recordReview,
} from '../../src/engine/SRSEngine';
import { AppProgress, JLPTLevel, SRSCard, SRSData } from '../../src/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────────

function makeProgress(overrides: Partial<AppProgress> = {}): AppProgress {
  return {
    mastered:     [],
    studied:      [],
    skipped:      [],
    currentLevel: 'N5' as JLPTLevel,
    startDate:    Date.now(),
    lastStudied:  null,
    streak:       0,
    totalTime:    0,
    ...overrides,
  };
}

function makeSRSData(cards: Record<string, SRSCard> = {}): SRSData {
  return { cards };
}

// ─── createCard ───────────────────────────────────────────────────────────────────

describe('createCard', () => {
  it('creates a card with default SM-2 values', () => {
    const card = createCard('日', 'N5');
    expect(card.character).toBe('日');
    expect(card.level).toBe('N5');
    expect(card.repetition).toBe(0);
    expect(card.interval).toBe(0);
    expect(card.easeFactor).toBeCloseTo(2.5);
    expect(card.lapses).toBe(0);
    expect(card.totalReviews).toBe(0);
    expect(card.correctReviews).toBe(0);
    expect(card.history).toHaveLength(0);
    expect(card.weaknessType).toBeNull();
  });

  it('dueDate is approximately now', () => {
    const before = Date.now();
    const card   = createCard('一');
    const after  = Date.now();
    expect(card.dueDate).toBeGreaterThanOrEqual(before);
    expect(card.dueDate).toBeLessThanOrEqual(after);
  });
});

// ─── getOrCreateCard ──────────────────────────────────────────────────────────────

describe('getOrCreateCard', () => {
  it('returns existing card when present', () => {
    const existing = createCard('水', 'N5');
    const data     = makeSRSData({ '水': existing });
    expect(getOrCreateCard('水', data)).toBe(existing);
  });

  it('creates a fresh card when not present', () => {
    const card = getOrCreateCard('火', makeSRSData());
    expect(card.character).toBe('火');
  });
});

// ─── recordReview ─────────────────────────────────────────────────────────────────

describe('recordReview', () => {
  it('increments totalReviews on every call', () => {
    const card    = createCard('山');
    const updated = recordReview(card, 'good');
    expect(updated.totalReviews).toBe(1);
  });

  it('does NOT mutate the original card', () => {
    const card    = createCard('川');
    const updated = recordReview(card, 'easy');
    expect(card.totalReviews).toBe(0);
    expect(updated.totalReviews).toBe(1);
  });

  it('Again resets repetition and adds a lapse', () => {
    const card    = createCard('木');
    const updated = recordReview(card, 'again');
    expect(updated.repetition).toBe(0);
    expect(updated.lapses).toBe(1);
    expect(updated.correctReviews).toBe(0);
  });

  it('Good on first rep sets interval to 1 day', () => {
    const card    = createCard('本');
    const updated = recordReview(card, 'good');
    expect(updated.interval).toBe(1);
    expect(updated.repetition).toBe(1);
  });

  it('Easy on first rep sets interval to 1 day', () => {
    const card    = createCard('休');
    const updated = recordReview(card, 'easy');
    expect(updated.interval).toBe(1);
  });

  it('second Good review gives interval 3', () => {
    const card  = createCard('人');
    const step1 = recordReview(card, 'good');       // rep=1, interval=1
    const step2 = recordReview(step1, 'good');      // rep=2, interval=3
    expect(step2.interval).toBe(3);
    expect(step2.repetition).toBe(2);
  });

  it('second Easy review gives interval 6', () => {
    const card  = createCard('入');
    const step1 = recordReview(card, 'good');
    const step2 = recordReview(step1, 'easy');
    expect(step2.interval).toBe(6);
  });

  it('ease factor decreases on Hard', () => {
    const card    = createCard('大');
    const updated = recordReview(card, 'hard');
    expect(updated.easeFactor).toBeLessThan(2.5);
  });

  it('ease factor increases on Easy', () => {
    const card    = createCard('小');
    const updated = recordReview(card, 'easy');
    expect(updated.easeFactor).toBeGreaterThan(2.5);
  });

  it('ease factor never goes below MIN (1.3)', () => {
    let card = createCard('天');
    for (let i = 0; i < 30; i++) card = recordReview(card, 'again');
    expect(card.easeFactor).toBeGreaterThanOrEqual(1.3);
  });

  it('history is capped at 10 entries', () => {
    let card = createCard('夫');
    for (let i = 0; i < 15; i++) card = recordReview(card, 'good');
    expect(card.history).toHaveLength(10);
  });

  it('dueDate advances after a successful review', () => {
    const before  = Date.now();
    const card    = createCard('日');
    const updated = recordReview(card, 'good');
    expect(updated.dueDate).toBeGreaterThan(before);
  });
});

// ─── getDueCards ──────────────────────────────────────────────────────────────────

describe('getDueCards', () => {
  it('returns cards whose dueDate has passed', () => {
    const past    = createCard('月');
    const future  = { ...createCard('火'), dueDate: Date.now() + 86400000 };
    const data    = makeSRSData({ '月': { ...past, dueDate: Date.now() - 1 }, '火': future });
    const due     = getDueCards(data);
    expect(due.map(c => c.character)).toContain('月');
    expect(due.map(c => c.character)).not.toContain('火');
  });

  it('filters by level when specified', () => {
    const n5Card = { ...createCard('水', 'N5'), dueDate: Date.now() - 1 };
    const n4Card = { ...createCard('海', 'N4'), dueDate: Date.now() - 1 };
    const data   = makeSRSData({ '水': n5Card, '海': n4Card });
    const due    = getDueCards(data, 'N5');
    expect(due.map(c => c.character)).toContain('水');
    expect(due.map(c => c.character)).not.toContain('海');
  });
});

// ─── getWeakCards ─────────────────────────────────────────────────────────────────

describe('getWeakCards', () => {
  it('includes cards with lapses', () => {
    let card = createCard('鬼');
    card     = recordReview(card, 'again'); // 1 lapse
    const data = makeSRSData({ '鬼': card });
    expect(getWeakCards(data).map(c => c.character)).toContain('鬼');
  });

  it('excludes perfect cards', () => {
    let card = createCard('花');
    card = recordReview(card, 'easy');
    card = recordReview(card, 'easy');
    const data = makeSRSData({ '花': card });
    expect(getWeakCards(data).map(c => c.character)).not.toContain('花');
  });

  it('respects limit param', () => {
    const cards: Record<string, SRSCard> = {};
    for (let i = 0; i < 20; i++) {
      let c = createCard(`char${i}`);
      c = recordReview(c, 'again');
      cards[`char${i}`] = c;
    }
    expect(getWeakCards(makeSRSData(cards), undefined, 5)).toHaveLength(5);
  });
});

// ─── getRetentionStats ────────────────────────────────────────────────────────────

describe('getRetentionStats', () => {
  it('returns 100% retention when no reviews done', () => {
    const stats = getRetentionStats(makeSRSData());
    expect(stats.retentionRate).toBe(100);
  });

  it('counts mature cards (interval > 21)', () => {
    const card    = createCard('桜');
    const mature  = { ...card, interval: 30 };
    const data    = makeSRSData({ '桜': mature });
    const stats   = getRetentionStats(data);
    expect(stats.mature).toBe(1);
    expect(stats.young).toBe(0);
  });

  it('calculates correct retention rate', () => {
    const card = {
      ...createCard('星'),
      totalReviews:   10,
      correctReviews: 8,
    };
    const stats = getRetentionStats(makeSRSData({ '星': card }));
    expect(stats.retentionRate).toBe(80);
  });
});

// ─── applyReview (integration) ────────────────────────────────────────────────────

describe('applyReview', () => {
  it('adds character to studied list after review', () => {
    const { progress } = applyReview(makeSRSData(), makeProgress(), '日', 'good');
    expect(progress.studied).toContain('日');
  });

  it('adds to mastered after 2+ correct reviews at good/easy', () => {
    let srsData = makeSRSData();
    let progress = makeProgress();

    ({ srsData, progress } = applyReview(srsData, progress, '月', 'good'));
    ({ srsData, progress } = applyReview(srsData, progress, '月', 'good'));

    expect(progress.mastered).toContain('月');
  });

  it('removes from mastered on Again', () => {
    const premastered = makeProgress({ mastered: ['火'] });
    const { progress } = applyReview(makeSRSData(), premastered, '火', 'again');
    expect(progress.mastered).not.toContain('火');
  });

  it('persists updated card in srsData', () => {
    const { srsData } = applyReview(makeSRSData(), makeProgress(), '水', 'easy');
    expect(srsData.cards['水']).toBeDefined();
    expect(srsData.cards['水'].totalReviews).toBe(1);
  });
});
