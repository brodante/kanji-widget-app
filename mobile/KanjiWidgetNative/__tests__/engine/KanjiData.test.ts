/**
 * KanjiData tests — verifies JSON loading, lookup, and search.
 */

import {
  getAllEntries,
  getCharacter,
  getLevel,
  getLevelCount,
  getPrimaryAudioPath,
  romajiToKana,
  search,
} from '../../src/engine/KanjiData';

// ─── getLevel ────────────────────────────────────────────────────────────────────

describe('getLevel', () => {
  it('returns non-empty array for N5', () => {
    const entries = getLevel('N5');
    expect(entries.length).toBeGreaterThan(0);
  });

  it('returns non-empty array for Hiragana', () => {
    expect(getLevel('Hiragana').length).toBeGreaterThan(0);
  });

  it('returns non-empty array for Katakana', () => {
    expect(getLevel('Katakana').length).toBeGreaterThan(0);
  });

  it('every Hiragana entry has character_audio', () => {
    const kana = getLevel('Hiragana');
    kana.forEach(e => {
      expect(e.character_audio).toBeDefined();
    });
  });

  it('every N5 entry has at least one meaning', () => {
    getLevel('N5').forEach(e => {
      expect(e.meanings.length).toBeGreaterThan(0);
    });
  });
});

// ─── getLevelCount ────────────────────────────────────────────────────────────────

describe('getLevelCount', () => {
  it('N5 has between 80 and 120 entries', () => {
    const count = getLevelCount('N5');
    expect(count).toBeGreaterThan(80);
    expect(count).toBeLessThan(120);
  });

  it('Hiragana has 46 entries', () => {
    expect(getLevelCount('Hiragana')).toBe(46);
  });

  it('Katakana has 46 entries', () => {
    expect(getLevelCount('Katakana')).toBe(46);
  });
});

// ─── getCharacter ────────────────────────────────────────────────────────────────

describe('getCharacter', () => {
  it('finds the kanji 一 (one)', () => {
    const entry = getCharacter('一');
    expect(entry).toBeDefined();
    expect(entry!.meanings).toContain('one');
  });

  it('finds the hiragana あ', () => {
    const entry = getCharacter('あ');
    expect(entry).toBeDefined();
    expect(entry!.jlpt).toBe('Hiragana');
  });

  it('returns undefined for unknown character', () => {
    expect(getCharacter('🍣')).toBeUndefined();
  });
});

// ─── getAllEntries ────────────────────────────────────────────────────────────────

describe('getAllEntries', () => {
  it('returns more than 2000 entries', () => {
    expect(getAllEntries().length).toBeGreaterThan(2000);
  });

  it('contains entries from multiple levels', () => {
    const entries = getAllEntries();
    const levels  = new Set(entries.map(e => e.jlpt));
    expect(levels.has('N5')).toBe(true);
    expect(levels.has('Hiragana')).toBe(true);
    expect(levels.has('N1')).toBe(true);
  });
});

// ─── romajiToKana ────────────────────────────────────────────────────────────────

describe('romajiToKana', () => {
  it('converts "a" to "あ"', () => {
    expect(romajiToKana('a')).toBe('あ');
  });

  it('converts "ka" to "か"', () => {
    expect(romajiToKana('ka')).toBe('か');
  });

  it('converts "shi" to "し"', () => {
    expect(romajiToKana('shi')).toBe('し');
  });

  it('converts "tsu" to "つ"', () => {
    expect(romajiToKana('tsu')).toBe('つ');
  });

  it('converts "nichi" to "にち"', () => {
    expect(romajiToKana('nichi')).toBe('にち');
  });

  it('returns empty string for non-romaji input', () => {
    expect(romajiToKana('xyz')).toBe('');
  });
});

// ─── search ──────────────────────────────────────────────────────────────────────

describe('search', () => {
  it('returns empty array for empty query', () => {
    expect(search('')).toHaveLength(0);
    expect(search('  ')).toHaveLength(0);
  });

  it('finds 一 by exact kanji character', () => {
    const results = search('一');
    expect(results[0].entry.character).toBe('一');
    expect(results[0].score).toBe(100);
  });

  it('finds 日 by English meaning "sun"', () => {
    const results = search('sun');
    expect(results.some(r => r.entry.character === '日')).toBe(true);
  });

  it('finds results by kana reading', () => {
    const results = search('にち');
    expect(results.some(r => r.entry.character === '日')).toBe(true);
  });

  it('finds results by romaji "nichi"', () => {
    const results = search('nichi');
    expect(results.some(r => r.entry.character === '日')).toBe(true);
  });

  it('finds 水 by meaning "water"', () => {
    const results = search('water');
    expect(results.some(r => r.entry.character === '水')).toBe(true);
  });

  it('respects the limit parameter', () => {
    const results = search('a', 5);
    expect(results.length).toBeLessThanOrEqual(5);
  });

  it('results are sorted by descending score', () => {
    const results = search('one');
    for (let i = 1; i < results.length; i++) {
      expect(results[i].score).toBeLessThanOrEqual(results[i - 1].score);
    }
  });
});

// ─── getPrimaryAudioPath ─────────────────────────────────────────────────────────

describe('getPrimaryAudioPath', () => {
  it('returns character_audio path for Hiragana entries', () => {
    const entry = getCharacter('あ');
    expect(entry).toBeDefined();
    const path = getPrimaryAudioPath(entry!);
    expect(path).toMatch(/\.mp3$/);
  });

  it('returns a kunyomi audio path for N5 kanji', () => {
    const entry = getCharacter('一');
    expect(entry).toBeDefined();
    const path = getPrimaryAudioPath(entry!, 'kunyomi');
    expect(path).toBeTruthy();
  });

  it('returns null for entry with no audio at all', () => {
    const emptyEntry = {
      character: 'X',
      meanings: [],
      onyomi: [],
      kunyomi: [],
      jlpt: 'N5' as const,
      examples: [],
      audio: { onyomi: {}, kunyomi: {} },
      base_id: '000000',
    };
    expect(getPrimaryAudioPath(emptyEntry)).toBeNull();
  });
});
