/**
 * AudioButton — speaker icon that plays audio for a KanjiEntry.
 *
 * Tap:       plays the preferred reading (kunyomi by default)
 * Long-press: toggles between kunyomi and onyomi
 *
 * States: idle → loading → playing → idle
 */

import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
} from 'react-native';
import { getPrimaryAudioPath } from '../engine/KanjiData';
import { spacing, useTheme } from '../theme/ThemeContext';
import { KanjiEntry } from '../types';
import { playAudio, stopAudio, AudioLevel } from '../audio/AudioManager';

type ReadingType = 'kunyomi' | 'onyomi';

interface Props {
  entry:        KanjiEntry;
  defaultReading?: ReadingType;
  size?:         'sm' | 'md' | 'lg';
  onPlay?:      () => void;
}

type PlayState = 'idle' | 'loading' | 'playing';

export default function AudioButton({
  entry,
  defaultReading = 'kunyomi',
  size = 'md',
  onPlay,
}: Props) {
  const { colors }               = useTheme();
  const [state, setState]        = useState<PlayState>('idle');
  const [reading, setReading]    = useState<ReadingType>(defaultReading);
  const scaleAnim                = useRef(new Animated.Value(1)).current;

  const pulse = useCallback(() => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.85, duration: 80, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1,    duration: 120, useNativeDriver: true }),
    ]).start();
  }, [scaleAnim]);

  const handlePress = useCallback(async () => {
    if (state === 'loading') return;
    if (state === 'playing') { stopAudio(); setState('idle'); return; }

    pulse();
    setState('loading');
    onPlay?.();

    // Pick text to speak
    const readings      = reading === 'kunyomi' ? entry.kunyomi : entry.onyomi;
    const text          = readings[0] ?? entry.kunyomi[0] ?? entry.character;
    const audioPath     = getPrimaryAudioPath(entry, reading);
    const level         = entry.jlpt as AudioLevel;

    setState('playing');
    await playAudio({ audioPath, text, level });
    setState('idle');
  }, [state, pulse, onPlay, reading, entry]);

  // Long-press toggles between kunyomi / onyomi
  const handleLongPress = useCallback(() => {
    stopAudio();
    setState('idle');
    setReading(r => r === 'kunyomi' ? 'onyomi' : 'kunyomi');
  }, []);

  const sz     = SIZES[size];
  const icon   = state === 'playing' ? '⏹' : '🔊';
  const active = state !== 'idle';

  return (
    <Pressable
      onPress={handlePress}
      onLongPress={handleLongPress}
      accessibilityLabel={`Play ${reading} reading`}
      accessibilityRole="button"
    >
      <Animated.View
        style={[
          styles.btn,
          sz.btn,
          {
            backgroundColor: active ? colors.primary : colors.surfaceElevated,
            borderColor:     active ? colors.primary : colors.border,
          },
          { transform: [{ scale: scaleAnim }] },
        ]}
      >
        {state === 'loading' ? (
          <ActivityIndicator
            size="small"
            color={active ? '#FFF' : colors.primary}
          />
        ) : (
          <Text style={[sz.icon]}>{icon}</Text>
        )}
        <Text style={[styles.label, sz.label, { color: active ? '#FFF' : colors.textSecondary }]}>
          {reading === 'kunyomi' ? '訓' : '音'}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

const SIZES = {
  sm: {
    btn:   { width: 44, height: 44, borderRadius: 22 },
    icon:  { fontSize: 16 },
    label: { fontSize: 9 },
  },
  md: {
    btn:   { width: 56, height: 56, borderRadius: 28 },
    icon:  { fontSize: 20 },
    label: { fontSize: 10 },
  },
  lg: {
    btn:   { width: 68, height: 68, borderRadius: 34 },
    icon:  { fontSize: 24 },
    label: { fontSize: 11 },
  },
};

const styles = StyleSheet.create({
  btn: {
    alignItems:     'center',
    justifyContent: 'center',
    gap:            2,
    shadowColor:    '#000',
    shadowOffset:   { width: 0, height: 2 },
    shadowOpacity:  0.08,
    shadowRadius:   6,
    elevation:      2,
  },
  label: {
    fontWeight: '700',
    lineHeight: 12,
  },
});
