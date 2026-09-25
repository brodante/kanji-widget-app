/**
 * AudioManager — audio playback for KanjiWidgets Native.
 *
 * 3-tier strategy (mirrors the web app):
 *   1. Bundled mp3  — Hiragana / Katakana only
 *   2. TTS          — react-native-tts, used for all kanji levels
 *   3. Silent       — logs a warning, never throws
 */

import Sound from 'react-native-sound';
import Tts from 'react-native-tts';

// Enable audio in iOS silent mode
Sound.setCategory('Playback');

// ─── TTS init ─────────────────────────────────────────────────────────────────
let _ttsReady = false;
async function ensureTTS(): Promise<void> {
  if (_ttsReady) return;
  try {
    await Tts.setDefaultLanguage('ja-JP');
    await Tts.setDefaultRate(0.5);
    await Tts.setDefaultPitch(1.0);
    _ttsReady = true;
  } catch {
    // TTS unavailable — will use silent fallback
  }
}

// ─── Active sound management ──────────────────────────────────────────────────
let _currentSound: Sound | null = null;

function stopCurrent(): void {
  if (_currentSound) {
    _currentSound.stop();
    _currentSound.release();
    _currentSound = null;
  }
}

// ─── Bundled mp3 ──────────────────────────────────────────────────────────────
// react-native-sound loads from the main bundle given just the filename.
// Files must be copied to android/app/src/main/assets and added to
// the iOS Xcode bundle — this happens at native build time.
function playBundledMp3(relativePath: string): Promise<boolean> {
  return new Promise(resolve => {
    stopCurrent();
    if (typeof Sound !== 'function') { resolve(false); return; }
    const filename = relativePath.split('/').pop() ?? relativePath;
    const sound = new Sound(filename, Sound.MAIN_BUNDLE, err => {
      if (err) { resolve(false); return; }
      _currentSound = sound;
      sound.play(success => {
        sound.release();
        _currentSound = null;
        resolve(success);
      });
    });
  });
}

// ─── TTS ──────────────────────────────────────────────────────────────────────
async function playTTS(text: string): Promise<boolean> {
  try {
    await ensureTTS();
    if (!_ttsReady) return false;
    Tts.stop();
    await Tts.speak(text);
    return true;
  } catch {
    return false;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────
export type AudioLevel =
  | 'Hiragana' | 'Katakana'
  | 'N5' | 'N4' | 'N3' | 'N2' | 'N1' | 'all';

export interface PlayOptions {
  audioPath?: string | null;
  text?:      string;
  level?:     AudioLevel;
}

export async function playAudio(opts: PlayOptions): Promise<boolean> {
  const { audioPath, text, level } = opts;
  const isKana = level === 'Hiragana' || level === 'Katakana';

  // Tier 1 — bundled mp3 (kana only)
  if (isKana && audioPath) {
    const ok = await playBundledMp3(audioPath);
    if (ok) return true;
  }

  // Tier 2 — TTS
  if (text) {
    const ok = await playTTS(text);
    if (ok) return true;
  }

  // Tier 3 — silent
  console.warn('[AudioManager] audio unavailable:', text ?? audioPath);
  return false;
}

export function stopAudio(): void {
  stopCurrent();
  try { Tts.stop(); } catch { /* ignore */ }
}
