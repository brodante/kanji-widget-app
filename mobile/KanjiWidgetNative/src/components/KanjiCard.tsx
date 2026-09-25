// @ts-nocheck
// NOTE: ts-nocheck is required here because react-native-reanimated 3.x has a
// known type-depth regression with TypeScript 6 strict mode (TS2589).
// The runtime behaviour is fully correct. Remove once Reanimated ships TS6-compatible types.
/**
 * KanjiCard — the central flashcard component.
 *
 * Front: large kanji character + JLPT badge
 * Back:  on'yomi, kun'yomi, meanings, example word
 *
 * Tap to flip. Implemented with Reanimated 3 rotateY interpolation.
 */

import React, { useCallback, useImperativeHandle } from 'react';
import {
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
  ViewStyle,
} from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import AudioButton from './AudioButton';
import { spacing, typography, useTheme } from '../theme/ThemeContext';
import { KanjiEntry } from '../types';

export interface KanjiCardHandle {
  flip:      () => void;
  showFront: () => void;
}

interface Props {
  entry:       KanjiEntry;
  isMastered?: boolean;
}

// ── Flip style helper ──────────────────────────────────────────────────────────
// Extracted into a module-level hook so TypeScript doesn't try to deep-infer
// Reanimated's generic types inside the forwardRef body (TS2589 with TS6+).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function useFlipStyle(rotation: { value: number }, inputMin: number, inputMax: number): any {
  return useAnimatedStyle(() => {
    const deg = interpolate(rotation.value, [0, 1], [inputMin, inputMax]);
    return { transform: [{ rotateY: `${deg}deg` }] };
  });
}

const FLIP_DURATION = 320;

const KanjiCard = React.forwardRef<KanjiCardHandle, Props>(
  ({ entry, isMastered = false }, ref) => {
    const { colors } = useTheme();
    const rotation   = useSharedValue(0); // 0 = front, 1 = back

    const flip = useCallback(() => {
      rotation.value = withTiming(rotation.value === 0 ? 1 : 0, {
        duration: FLIP_DURATION,
      });
    }, [rotation]);

    const showFront = useCallback(() => {
      rotation.value = withTiming(0, { duration: FLIP_DURATION });
    }, [rotation]);

    useImperativeHandle(ref, () => ({ flip, showFront }));

    // ── Front face styles ──
    const frontAnimStyle = useFlipStyle(rotation, 0, 180);

    // ── Back face styles (starts at -180 so it's hidden behind front) ──
    const backAnimStyle = useFlipStyle(rotation, -180, 0);

    const jlptColor = JLPT_COLORS[entry.jlpt] ?? colors.primary;

    // Pre-build composed styles as plain ViewStyle arrays to avoid TS2589
    // (Reanimated 3 + TS6 deep inference issue with Animated.View style prop)
    const frontStyle: ViewStyle[] = [
      styles.card,
      styles.backfaceHidden,
      // No hard border on front — shadow provides depth (Apple §12 materials)
      { backgroundColor: isMastered ? colors.primary + '0A' : colors.surface },
      frontAnimStyle as ViewStyle,
      styles.absolute,
    ];
    const backStyle: ViewStyle[] = [
      styles.card,
      styles.backfaceHidden,
      { backgroundColor: colors.cardBack },
      backAnimStyle as ViewStyle,
      styles.absolute,
    ];

    return (
      <TouchableWithoutFeedback onPress={flip} accessibilityRole="button" accessibilityLabel={`Kanji card for ${entry.character}. Tap to flip.`}>
        <View style={styles.container}>
          {/* ── FRONT ── */}
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <Animated.View style={frontStyle as any}>
            {/* Mastered indicator — corner accent arc, not a loud banner */}
            {isMastered && (
              <View style={[styles.masteredAccent, { backgroundColor: colors.primary }]} />
            )}

            {/* JLPT level chip — tinted bg only, no border */}
            <View style={[styles.jlptChip, { backgroundColor: jlptColor + '18' }]}>
              <Text style={[styles.jlptText, { color: jlptColor }]}>{entry.jlpt}</Text>
            </View>

            {/* The kanji */}
            <Text
              style={[styles.kanjiChar, { color: colors.text }]}
              adjustsFontSizeToFit
              numberOfLines={1}
            >
              {entry.character}
            </Text>

            <Text style={[styles.tapHint, { color: colors.textMuted }]}>
              tap to reveal
            </Text>
          </Animated.View>

          {/* ── BACK ── */}
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <Animated.View style={backStyle as any}>
            {/* Character (smaller on back) */}
            <Text style={[styles.kanjiCharSmall, { color: colors.primary }]}>
              {entry.character}
            </Text>

            {/* Meanings */}
            <Text style={[styles.meanings, { color: colors.text }]}>
              {entry.meanings.join('・')}
            </Text>

            {/* Hairline divider — barely-there, avoids the "boxy" AI look */}
            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            {/* Readings */}
            <View style={styles.readingsContainer}>
              {entry.onyomi.length > 0 && (
                <View style={styles.readingRow}>
                  <Text style={[styles.readingLabel, { color: colors.textMuted }]}>音</Text>
                  <Text style={[styles.readingValue, { color: colors.text }]}>
                    {entry.onyomi.join('　')}
                  </Text>
                </View>
              )}
              {entry.kunyomi.length > 0 && (
                <View style={styles.readingRow}>
                  <Text style={[styles.readingLabel, { color: colors.textMuted }]}>訓</Text>
                  <Text style={[styles.readingValue, { color: colors.text }]}>
                    {entry.kunyomi.join('　')}
                  </Text>
                </View>
              )}
            </View>

            {/* Example word */}
            {entry.examples.length > 0 && (
              <View style={[styles.exampleBox, { backgroundColor: colors.background }]}>
                <Text style={[styles.exampleWord, { color: colors.primary }]}>
                  {entry.examples[0].word}
                </Text>
                <Text style={[styles.exampleReading, { color: colors.textSecondary }]}>
                  {entry.examples[0].reading}
                </Text>
                <Text style={[styles.exampleMeaning, { color: colors.textMuted }]}>
                  {entry.examples[0].meaning}
                </Text>
              </View>
            )}

            {/* Audio button */}
            <AudioButton entry={entry} size="md" />
          </Animated.View>
        </View>
      </TouchableWithoutFeedback>
    );
  },
);

KanjiCard.displayName = 'KanjiCard';
export default KanjiCard;

// ── JLPT badge colors — updated to iOS system semantic palette ─────────────────
const JLPT_COLORS: Record<string, string> = {
  Hiragana: '#30D158',
  Katakana: '#32ADE6',
  N5:       '#BF5AF2',
  N4:       '#5E5CE6',
  N3:       '#30D158',
  N2:       '#FF9F0A',
  N1:       '#FF453A',
};

const styles = StyleSheet.create({
  container: {
    width:  '100%',
    height: 380,
  },
  absolute: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
  },
  backfaceHidden: {
    backfaceVisibility: 'hidden' as const,
  },
  card: {
    flex:           1,
    borderRadius:   28,
    alignItems:     'center',
    justifyContent: 'center',
    padding:        spacing.lg,
    // Deeper, more refined shadow — physical depth without hard borders
    shadowColor:    '#000',
    shadowOffset:   { width: 0, height: 8 },
    shadowOpacity:  0.09,
    shadowRadius:   24,
    elevation:      8,
    gap:            spacing.sm,
  },
  // Mastered: corner accent arc — subtle, not a loud badge
  masteredAccent: {
    position:               'absolute',
    top:                    0,
    right:                  0,
    width:                  44,
    height:                 44,
    borderTopRightRadius:   28,
    borderBottomLeftRadius: 28,
    opacity:                0.85,
  },
  // JLPT chip: no border, just a tinted bg
  jlptChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical:   3,
    borderRadius:      6,
    marginBottom:      spacing.xs,
  },
  jlptText: {
    fontSize:      11,
    fontWeight:    '600',
    letterSpacing: 0.4,
  },
  kanjiChar: {
    ...typography.kanjiLarge,
    textAlign: 'center',
  },
  kanjiCharSmall: {
    ...typography.kanjiMedium,
    textAlign: 'center',
  },
  tapHint: {
    fontSize:      12,
    marginTop:     spacing.md,
    letterSpacing: 0.2,
    fontWeight:    '400',
  },
  meanings: {
    ...typography.heading3,
    textAlign: 'center',
    flexWrap:  'wrap',
  },
  // Hairline divider — barely visible
  divider: {
    width:          '50%',
    height:         StyleSheet.hairlineWidth,
    marginVertical: spacing.sm,
    opacity:        0.5,
  },
  readingsContainer: {
    gap:               spacing.xs,
    alignSelf:         'stretch',
    paddingHorizontal: spacing.md,
  },
  readingRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing.sm,
  },
  readingLabel: {
    ...typography.kanjiSmall,
    fontSize: 18,
    width:    28,
  },
  readingValue: {
    ...typography.body,
    flex: 1,
  },
  exampleBox: {
    borderRadius: 14,
    padding:      spacing.sm,
    alignSelf:    'stretch',
    marginTop:    spacing.xs,
    gap:          2,
  },
  exampleWord: {
    ...typography.kanjiSmall,
    fontSize: 22,
  },
  exampleReading: {
    ...typography.bodySmall,
  },
  exampleMeaning: {
    ...typography.caption,
  },
});
