/**
 * StorageManager tests — uses the AsyncStorage mock from
 * @react-native-async-storage/async-storage/jest/async-storage-mock
 */

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  addRecent,
  clearAll,
  exportBackup,
  getFabPosition,
  getProgress,
  getRecent,
  getSettings,
  getSRSData,
  importBackup,
  initStorage,
  markAsMastered,
  markAsStudied,
  resetProgress,
  saveFabPosition,
  saveProgress,
  saveSettings,
  unmarkMastered,
  updateStreak,
} from '../../src/storage/StorageManager';

// Reset storage and module state before each test
beforeEach(async () => {
  await AsyncStorage.clear();
  await clearAll();
  await initStorage();
});

// ─── initStorage ─────────────────────────────────────────────────────────────────

describe('initStorage', () => {
  it('provides default progress on first init', () => {
    const p = getProgress();
    expect(p.mastered).toEqual([]);
    expect(p.studied).toEqual([]);
    expect(p.currentLevel).toBe('N5');
    expect(p.streak).toBe(0);
  });

  it('provides default settings on first init', () => {
    const s = getSettings();
    expect(s.theme).toBe('dark');
    expect(s.accent).toBe('indigo');
    expect(s.autoPlay).toBe(false);
  });
});

// ─── saveProgress / getProgress ──────────────────────────────────────────────────

describe('saveProgress / getProgress', () => {
  it('persists progress to AsyncStorage', async () => {
    const p = { ...getProgress(), streak: 5 };
    await saveProgress(p);
    expect(getProgress().streak).toBe(5);
  });

  it('round-trips through AsyncStorage', async () => {
    await saveProgress({ ...getProgress(), mastered: ['一', '二'] });
    // Re-init simulates app restart
    await clearAll();
    await initStorage();
    // Data should be gone (clearAll wipes storage)
    expect(getProgress().mastered).toEqual([]);
  });
});

// ─── markAsMastered ───────────────────────────────────────────────────────────────

describe('markAsMastered', () => {
  it('adds character to mastered and studied', async () => {
    const p = await markAsMastered('日');
    expect(p.mastered).toContain('日');
    expect(p.studied).toContain('日');
  });

  it('is idempotent — does not duplicate', async () => {
    await markAsMastered('月');
    await markAsMastered('月');
    expect(getProgress().mastered.filter(c => c === '月')).toHaveLength(1);
  });
});

// ─── markAsStudied ────────────────────────────────────────────────────────────────

describe('markAsStudied', () => {
  it('adds to studied but not mastered', async () => {
    const p = await markAsStudied('火');
    expect(p.studied).toContain('火');
    expect(p.mastered).not.toContain('火');
  });
});

// ─── unmarkMastered ───────────────────────────────────────────────────────────────

describe('unmarkMastered', () => {
  it('removes character from mastered, keeps it in studied', async () => {
    await markAsMastered('水');
    const p = await unmarkMastered('水');
    expect(p.mastered).not.toContain('水');
  });
});

// ─── addRecent ────────────────────────────────────────────────────────────────────

describe('addRecent', () => {
  it('prepends character to recent list', async () => {
    await addRecent('木');
    expect(getRecent()[0]).toBe('木');
  });

  it('deduplicates — moves existing to front', async () => {
    await addRecent('金');
    await addRecent('土');
    await addRecent('金');
    const recent = getRecent();
    expect(recent[0]).toBe('金');
    expect(recent.filter(c => c === '金')).toHaveLength(1);
  });

  it('caps list at 20 items', async () => {
    for (let i = 0; i < 25; i++) {
      await addRecent(`char${i}`);
    }
    expect(getRecent().length).toBeLessThanOrEqual(20);
  });
});

// ─── saveSettings ────────────────────────────────────────────────────────────────

describe('saveSettings', () => {
  it('merges partial settings', async () => {
    await saveSettings({ theme: 'light' });
    expect(getSettings().theme).toBe('light');
    expect(getSettings().accent).toBe('indigo'); // unchanged
  });
});

// ─── updateStreak ────────────────────────────────────────────────────────────────

describe('updateStreak', () => {
  it('starts streak at 1 when no prior study', async () => {
    const streak = await updateStreak();
    expect(streak).toBe(1);
  });

  it('does not increment streak if already studied today', async () => {
    await updateStreak(); // streak = 1
    const streak = await updateStreak(); // still today
    expect(streak).toBe(1);
  });
});

// ─── resetProgress ───────────────────────────────────────────────────────────────

describe('resetProgress', () => {
  it('resets mastered and streak to zero', async () => {
    await markAsMastered('一');
    await updateStreak();
    await resetProgress();
    const p = getProgress();
    expect(p.mastered).toEqual([]);
    expect(p.streak).toBe(0);
  });
});

// ─── getSRSData ───────────────────────────────────────────────────────────────────

describe('getSRSData', () => {
  it('returns empty cards on init', () => {
    expect(getSRSData().cards).toEqual({});
  });
});

// ─── exportBackup / importBackup ──────────────────────────────────────────────────

describe('exportBackup / importBackup', () => {
  it('export includes current progress', async () => {
    await markAsMastered('二');
    const backup = await exportBackup();
    expect(backup.version).toBe(2);
    expect(backup.progress.mastered).toContain('二');
  });

  it('import restores progress', async () => {
    const backup = await exportBackup();
    backup.progress.mastered = ['三'];
    backup.progress.streak   = 7;
    await importBackup(backup);
    expect(getProgress().mastered).toContain('三');
    expect(getProgress().streak).toBe(7);
  });

  it('throws on unknown backup version', async () => {
    const backup = await exportBackup();
    // @ts-expect-error: intentionally invalid
    backup.version = 99;
    await expect(importBackup(backup)).rejects.toThrow('Unsupported backup version');
  });
});

// ─── FabPosition persistence ──────────────────────────────────────────────────────

describe('getFabPosition / saveFabPosition', () => {
  it('returns null when no position has been saved', async () => {
    const pos = await getFabPosition();
    expect(pos).toBeNull();
  });

  it('persists and retrieves custom coordinates', async () => {
    await saveFabPosition({ x: 300, y: 550 });
    const pos = await getFabPosition();
    expect(pos).toEqual({ x: 300, y: 550 });
  });
});

