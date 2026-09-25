/**
 * KanjiData — loads the JSON database assets and exposes a clean API.
 *
 * All JSON files are bundled via require() — Metro bundles them at build time.
 * The data is loaded once and cached in memory for the app's lifetime.
 */

import { JLPTLevel, KanjiEntry } from '../types';

// ─── Raw JSON imports ─────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-require-imports
const HiraganaDB: { Hiragana: KanjiEntry[] } = require('../assets/database/Hiragana.json');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const KatakanaDB: { Katakana: KanjiEntry[] } = require('../assets/database/Katakana.json');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const N5DB: { N5: KanjiEntry[] } = require('../assets/database/N5.json');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const N4DB: { N4: KanjiEntry[] } = require('../assets/database/N4.json');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const N3DB: { N3: KanjiEntry[] } = require('../assets/database/N3.json');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const N2DB: { N2: KanjiEntry[] } = require('../assets/database/N2.json');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const N1DB: { N1: KanjiEntry[] } = require('../assets/database/N1.json');

// ─── Romaji → hiragana map ────────────────────────────────────────────────────────
const ROMAJI_MAP: Record<string, string> = {
  a:'あ', i:'い', u:'う', e:'え', o:'お',
  ka:'か', ki:'き', ku:'く', ke:'け', ko:'こ',
  sa:'さ', shi:'し', si:'し', su:'す', se:'せ', so:'そ',
  ta:'た', chi:'ち', ti:'ち', tsu:'つ', tu:'つ', te:'て', to:'と',
  na:'な', ni:'に', nu:'ぬ', ne:'ね', no:'の',
  ha:'は', hi:'ひ', fu:'ふ', hu:'ふ', he:'へ', ho:'ほ',
  ma:'ま', mi:'み', mu:'む', me:'め', mo:'も',
  ya:'や', yu:'ゆ', yo:'よ',
  ra:'ら', ri:'り', ru:'る', re:'れ', ro:'ろ',
  wa:'わ', wo:'を', n:'ん',
  ga:'が', gi:'ぎ', gu:'ぐ', ge:'げ', go:'ご',
  za:'ざ', ji:'じ', zi:'じ', zu:'ず', ze:'ぜ', zo:'ぞ',
  da:'だ', de:'で', do:'ど',
  ba:'ば', bi:'び', bu:'ぶ', be:'べ', bo:'ぼ',
  pa:'ぱ', pi:'ぴ', pu:'ぷ', pe:'ぺ', po:'ぽ',
};

// Hiragana → Katakana offset (Unicode: ぁ=0x3041, ァ=0x30A1, diff=96)
const HIRA_KATA_OFFSET = 0x60;

/** Converts a hiragana string to its katakana equivalent. */
function hiraganaToKatakana(hira: string): string {
  return hira.replace(/[\u3041-\u3096]/g, c =>
    String.fromCharCode(c.charCodeAt(0) + HIRA_KATA_OFFSET),
  );
}

/** Converts a katakana string to its hiragana equivalent. */
function katakanaToHiragana(kata: string): string {
  return kata.replace(/[\u30A1-\u30F6]/g, c =>
    String.fromCharCode(c.charCodeAt(0) - HIRA_KATA_OFFSET),
  );
}

// ─── Lazy-loaded master index ─────────────────────────────────────────────────────
let _allEntries:  KanjiEntry[]                  | null = null;
let _byCharacter: Map<string, KanjiEntry>        | null = null;
let _byLevel:     Map<JLPTLevel, KanjiEntry[]>   | null = null;

function buildIndex() {
  if (_allEntries) return;

  const all: KanjiEntry[] = [
    ...HiraganaDB.Hiragana,
    ...KatakanaDB.Katakana,
    ...N5DB.N5,
    ...N4DB.N4,
    ...N3DB.N3,
    ...N2DB.N2,
    ...N1DB.N1,
  ];

  _allEntries  = all;
  _byCharacter = new Map(all.map(e => [e.character, e]));
  _byLevel     = new Map<JLPTLevel, KanjiEntry[]>([
    ['Hiragana', HiraganaDB.Hiragana],
    ['Katakana', KatakanaDB.Katakana],
    ['N5',       N5DB.N5],
    ['N4',       N4DB.N4],
    ['N3',       N3DB.N3],
    ['N2',       N2DB.N2],
    ['N1',       N1DB.N1],
    ['all',      all],
  ]);
}

// ─── Public API ──────────────────────────────────────────────────────────────────

/** Returns all entries for a given level. */
export function getLevel(level: JLPTLevel): KanjiEntry[] {
  buildIndex();
  return _byLevel!.get(level) ?? [];
}

/** Returns a single entry by character. */
export function getCharacter(character: string): KanjiEntry | undefined {
  buildIndex();
  return _byCharacter!.get(character);
}

/** Returns all entries across every level. */
export function getAllEntries(): KanjiEntry[] {
  buildIndex();
  return _allEntries!;
}

export function getLevelCount(level: JLPTLevel): number {
  return getLevel(level).length;
}

// ─── Search ───────────────────────────────────────────────────────────────────────

export interface SearchResult {
  entry:  KanjiEntry;
  score:  number;
  reason: string;
}

/**
 * Searches across all levels by:
 *  - Kanji character exact match
 *  - English meaning (partial)
 *  - Kana reading (onyomi / kunyomi) — handles both hiragana and katakana
 *  - Romaji e.g. "nichi" → ニチ/にち, "mizu" → みず
 */
export function search(query: string, limit = 30): SearchResult[] {
  if (!query.trim()) return [];
  buildIndex();

  const q    = query.trim().toLowerCase();
  // Convert romaji input → hiragana, then also to katakana (onyomi is stored in katakana)
  const hira = romajiToKana(q);
  const kata = hira ? hiraganaToKatakana(hira) : '';

  // If the query itself is kana, normalise both directions
  const queryHira = katakanaToHiragana(query.trim());
  const queryKata = hiraganaToKatakana(query.trim());

  const results: SearchResult[] = [];

  for (const entry of _allEntries!) {
    let score  = 0;
    let reason = '';

    if (entry.character === q) {
      score = 100; reason = 'kanji';
    } else if (entry.meanings.some(m => m.toLowerCase() === q)) {
      score = 85; reason = 'meaning-exact';
    } else if (entry.meanings.some(m => m.toLowerCase().includes(q))) {
      score = 55; reason = 'meaning';
    } else if (
      // Match onyomi (katakana) with kata equivalent of input
      (kata && entry.onyomi.some(r => r.includes(kata))) ||
      (queryKata && entry.onyomi.some(r => r.includes(queryKata))) ||
      // Match kunyomi (hiragana) with hira equivalent of input
      (hira && entry.kunyomi.some(r => r.includes(hira))) ||
      (queryHira && entry.kunyomi.some(r => r.includes(queryHira))) ||
      // Direct substring on the raw stored value
      entry.onyomi.some(r  => r.includes(query.trim())) ||
      entry.kunyomi.some(r => r.includes(query.trim()))
    ) {
      score = 65; reason = 'reading';
    } else if (entry.examples.some(ex => ex.meaning.toLowerCase().includes(q))) {
      score = 30; reason = 'example';
    }

    if (score > 0) results.push({ entry, score, reason });
  }

  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Converts a romaji string to hiragana. Returns empty string if conversion fails. */
export function romajiToKana(romaji: string): string {
  const r = romaji.toLowerCase();
  // Direct hit first
  if (ROMAJI_MAP[r]) return ROMAJI_MAP[r];

  let result = '';
  let i = 0;
  while (i < r.length) {
    const three = r.slice(i, i + 3);
    const two   = r.slice(i, i + 2);
    const one   = r.slice(i, i + 1);
    if (ROMAJI_MAP[three])      { result += ROMAJI_MAP[three]; i += 3; }
    else if (ROMAJI_MAP[two])   { result += ROMAJI_MAP[two];   i += 2; }
    else if (ROMAJI_MAP[one])   { result += ROMAJI_MAP[one];   i += 1; }
    else return ''; // not valid romaji — bail
  }
  return result;
}

/** Returns the primary audio path for an entry. */
export function getPrimaryAudioPath(
  entry:  KanjiEntry,
  prefer: 'kunyomi' | 'onyomi' = 'kunyomi',
): string | null {
  if (entry.character_audio) return entry.character_audio;
  const preferred = entry.audio[prefer];
  const fallback  = entry.audio[prefer === 'kunyomi' ? 'onyomi' : 'kunyomi'];
  return (
    Object.values(preferred)[0] ??
    Object.values(fallback)[0]  ??
    null
  );
}
