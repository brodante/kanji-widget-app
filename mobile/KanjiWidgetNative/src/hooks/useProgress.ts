/**
 * useProgress — subscribes to StorageManager and exposes reactive progress state.
 *
 * Because AsyncStorage is async, this hook initialises from the in-memory cache
 * (populated during app start via initStorage()) and re-renders only when a
 * mutation method is called through the returned actions.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  addRecent,
  getProgress,
  getRecent,
  getSettings,
  initStorage,
  markAsMastered,
  markAsStudied,
  setCurrentLevel,
  unmarkMastered,
  updateStreak,
} from '../storage/StorageManager';
import { AppProgress, AppSettings, JLPTLevel } from '../types';

interface UseProgressReturn {
  progress:   AppProgress;
  settings:   AppSettings;
  recent:     string[];
  isReady:    boolean;
  // Actions
  mastered:   (char: string) => Promise<void>;
  unmastered: (char: string) => Promise<void>;
  studied:    (char: string) => Promise<void>;
  setLevel:   (level: JLPTLevel) => Promise<void>;
  touchStreak: () => Promise<void>;
  recordRecent: (char: string) => Promise<void>;
  refresh:    () => void;
}

export function useProgress(): UseProgressReturn {
  const [progress, setProgress] = useState<AppProgress>(getProgress);
  const [settings, setSettings] = useState<AppSettings>(getSettings);
  const [recent,   setRecent]   = useState<string[]>(getRecent);
  const [isReady,  setIsReady]  = useState(false);

  // On mount: ensure storage is initialised (no-op if already done)
  useEffect(() => {
    initStorage().then(() => {
      setProgress(getProgress());
      setSettings(getSettings());
      setRecent(getRecent());
      setIsReady(true);
    });
  }, []);

  const refresh = useCallback(() => {
    setProgress(getProgress());
    setSettings(getSettings());
    setRecent(getRecent());
  }, []);

  const mastered = useCallback(async (char: string) => {
    const p = await markAsMastered(char);
    setProgress(p);
  }, []);

  const unmastered = useCallback(async (char: string) => {
    const p = await unmarkMastered(char);
    setProgress(p);
  }, []);

  const studied = useCallback(async (char: string) => {
    const p = await markAsStudied(char);
    setProgress(p);
  }, []);

  const setLevel = useCallback(async (level: JLPTLevel) => {
    await setCurrentLevel(level);
    setProgress({ ...getProgress(), currentLevel: level });
  }, []);

  const touchStreak = useCallback(async () => {
    await updateStreak();
    setProgress(getProgress());
  }, []);

  const recordRecent = useCallback(async (char: string) => {
    const list = await addRecent(char);
    setRecent(list);
  }, []);

  return {
    progress,
    settings,
    recent,
    isReady,
    mastered,
    unmastered,
    studied,
    setLevel,
    touchStreak,
    recordRecent,
    refresh,
  };
}
