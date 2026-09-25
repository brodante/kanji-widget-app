// @ts-nocheck
/**
 * LearnScreen — the main learning loop.
 *
 * Shows a kanji card for the current level.
 * Swipe left/right (or tap Prev/Next) to navigate.
 * Tap the card to flip it.
 * "Mark Mastered" / "Unmark" to track progress.
 * Level switcher in the header.
 * Streak badge + progress bar below.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import KanjiCard, { KanjiCardHandle } from '../components/KanjiCard';
import LevelSwitcher from '../components/LevelSwitcher';
import ProgressBar from '../components/ProgressBar';
import StreakBadge from '../components/StreakBadge';
import AudioButton from '../components/AudioButton';
import { getLevel } from '../engine/KanjiData';
import { spacing, useTheme } from '../theme/ThemeContext';
import { JLPTLevel, KanjiEntry } from '../types';
import { useProgress } from '../hooks/useProgress';

const SWIPE_THRESHOLD = 60;

export default function LearnScreen() {
  const { colors } = useTheme();
  const {
    progress,
    isReady,
    mastered,
    unmastered,
    studied,
    setLevel,
    touchStreak,
    recordRecent,
  } = useProgress();

  const [showLevelSwitcher, setShowLevelSwitcher] = useState(false);
  const [index, setIndex] = useState(0);
  const cardRef = useRef<KanjiCardHandle>(null);

  // Load entries for current level
  const entries: KanjiEntry[] = useMemo(
    () => getLevel(progress.currentLevel),
    [progress.currentLevel],
  );

  const currentEntry = entries[index] ?? null;

  // Reset to first card whenever level changes
  useEffect(() => {
    setIndex(0);
    cardRef.current?.showFront();
  }, [progress.currentLevel]);

  // Track study + streak when a new card comes into view
  useEffect(() => {
    if (!currentEntry || !isReady) return;
    studied(currentEntry.character);
    recordRecent(currentEntry.character);
    touchStreak();
    // Only fire on character change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentEntry?.character, isReady]);

  // ── Navigation ──────────────────────────────────────────────────────────────
  // Use RN Animated (not Reanimated worklets) — compatible with New Architecture
  const translateX = useRef(new Animated.Value(0)).current;
  const opacity    = useRef(new Animated.Value(1)).current;

  const animateTransition = useCallback((direction: 1 | -1, next: number) => {
    // Fade + slide out
    Animated.parallel([
      Animated.timing(translateX, { toValue: direction * -80, duration: 150, useNativeDriver: true }),
      Animated.timing(opacity,    { toValue: 0.3,             duration: 150, useNativeDriver: true }),
    ]).start(() => {
      setIndex(next);
      cardRef.current?.showFront();
      translateX.setValue(direction * 80);
      // Slide + fade in
      Animated.parallel([
        Animated.spring(translateX, { toValue: 0, damping: 18, stiffness: 200, useNativeDriver: true }),
        Animated.timing(opacity,    { toValue: 1, duration: 150, useNativeDriver: true }),
      ]).start();
    });
  }, [translateX, opacity]);

  const goNext = useCallback(() => {
    if (entries.length === 0) return;
    const next = (index + 1) % entries.length;
    animateTransition(1, next);
  }, [index, entries.length, animateTransition]);

  const goPrev = useCallback(() => {
    if (entries.length === 0) return;
    const next = (index - 1 + entries.length) % entries.length;
    animateTransition(-1, next);
  }, [index, entries.length, animateTransition]);

  // ── Swipe gesture ────────────────────────────────────────────────────────────
  const panGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .runOnJS(true)
    .onEnd(e => {
      if (e.translationX < -SWIPE_THRESHOLD) goNext();
      else if (e.translationX > SWIPE_THRESHOLD) goPrev();
    });

  const cardAnimStyle = { transform: [{ translateX }], opacity };

  // ── Mastered toggle ──────────────────────────────────────────────────────────
  const isMastered = currentEntry
    ? progress.mastered.includes(currentEntry.character)
    : false;

  const handleMasterToggle = useCallback(async () => {
    if (!currentEntry) return;
    if (isMastered) {
      await unmastered(currentEntry.character);
    } else {
      await mastered(currentEntry.character);
    }
  }, [currentEntry, isMastered, mastered, unmastered]);

  // ── Level switch ─────────────────────────────────────────────────────────────
  const handleLevelSelect = useCallback(async (level: JLPTLevel) => {
    await setLevel(level);
  }, [setLevel]);

  // ── Loading state ─────────────────────────────────────────────────────────────
  if (!isReady || entries.length === 0) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        {!isReady
          ? <ActivityIndicator color={colors.primary} size="large" />
          : <Text style={[styles.emptyText, { color: colors.textMuted }]}>No entries for this level.</Text>
        }
      </View>
    );
  }

  const masteredCount = entries.filter(e => progress.mastered.includes(e.character)).length;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
      {/* ── HEADER ── */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        {/* Level pill — filled, not bordered */}
        <Pressable
          onPress={() => setShowLevelSwitcher(true)}
          style={({ pressed }) => [
            styles.levelPill,
            { backgroundColor: pressed ? colors.primary + '22' : colors.primary + '14' },
          ]}
        >
          <Text style={[styles.levelPillText, { color: colors.primary }]}>
            {LEVEL_ICONS[progress.currentLevel] ?? progress.currentLevel}
          </Text>
          <Text style={[styles.levelPillLabel, { color: colors.primary }]}>
            {progress.currentLevel}
          </Text>
          <Text style={[styles.levelPillChevron, { color: colors.primary + 'AA' }]}>›</Text>
        </Pressable>

        {/* Card counter */}
        <Text style={[styles.counter, { color: colors.textMuted }]}>
          {index + 1} / {entries.length}
        </Text>

        {/* Streak */}
        <StreakBadge streak={progress.streak} />
      </View>


      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── CARD ── */}
        <GestureDetector gesture={panGesture}>
          <Animated.View style={[styles.cardWrapper, cardAnimStyle]}>
            {currentEntry && (
              <KanjiCard
                ref={cardRef}
                entry={currentEntry}
                isMastered={isMastered}
              />
            )}
          </Animated.View>
        </GestureDetector>

        {/* ── NAVIGATION BUTTONS ── */}
        <View style={styles.navRow}>
          <Pressable
            onPress={goPrev}
            style={({ pressed }) => [
              styles.navBtn,
              { backgroundColor: colors.surface, opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <Text style={[styles.navBtnText, { color: colors.textSecondary }]}>← Prev</Text>
          </Pressable>

          {/* Audio button */}
          {currentEntry && (
            <AudioButton entry={currentEntry} size="md" />
          )}

          {/* Master toggle */}
          <Pressable
            onPress={handleMasterToggle}
            style={({ pressed }) => [
              styles.masterBtn,
              {
                backgroundColor: isMastered
                  ? colors.primary
                  : pressed ? colors.surfaceElevated : colors.surface,
              },
            ]}
          >
            <Text style={[styles.masterBtnText, {
              color: isMastered ? '#FFF' : colors.text,
            }]}>
              {isMastered ? '✓ Mastered' : 'Mark Mastered'}
            </Text>
          </Pressable>

          <Pressable
            onPress={goNext}
            style={({ pressed }) => [
              styles.navBtn,
              { backgroundColor: colors.surface, opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <Text style={[styles.navBtnText, { color: colors.textSecondary }]}>Next →</Text>
          </Pressable>
        </View>

        {/* ── PROGRESS ── */}
        <View style={[styles.progressSection, { backgroundColor: colors.surface }]}>
          <ProgressBar
            mastered={masteredCount}
            total={entries.length}
            label={`${progress.currentLevel} Progress`}
          />
          <Text style={[styles.progressHint, { color: colors.textMuted }]}>
            {entries.length - masteredCount} remaining to master
          </Text>
        </View>

        {/* ── HINT ── */}
        <Text style={[styles.swipeHint, { color: colors.textMuted }]}>
          Swipe left · right to navigate
        </Text>
      </ScrollView>


      {/* ── LEVEL SWITCHER MODAL ── */}
      <LevelSwitcher
        visible={showLevelSwitcher}
        currentLevel={progress.currentLevel}
        onSelect={handleLevelSelect}
        onClose={() => setShowLevelSwitcher(false)}
      />
    </SafeAreaView>
  );
}

const LEVEL_ICONS: Partial<Record<JLPTLevel, string>> = {
  Hiragana: 'あ',
  Katakana: 'ア',
  all:      '全',
};

const styles = StyleSheet.create({
  root:    { flex: 1 },
  center:  { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 15 },

  header: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  // Level pill: filled, no border
  levelPill: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               4,
    borderRadius:      20,
    paddingHorizontal: 12,
    paddingVertical:   6,
  },
  levelPillText: {
    fontSize:   17,
    fontWeight: '700',
  },
  levelPillLabel: {
    fontSize:      13,
    fontWeight:    '600',
    letterSpacing: -0.1,
  },
  levelPillChevron: {
    fontSize:   16,
    fontWeight: '300',
  },
  counter: {
    fontSize:      13,
    fontWeight:    '400',
    letterSpacing: 0.2,
  },

  content: {
    padding:      spacing.md,
    paddingBottom: spacing.xxl,
    gap:          spacing.md,
  },
  cardWrapper: {
    // Full width, let KanjiCard control height
  },

  navRow: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            spacing.sm,
  },
  // Nav buttons: no border, rely on surface background + subtle shadow
  navBtn: {
    flex:            1,
    borderRadius:    14,
    paddingVertical: spacing.sm + 2,
    alignItems:      'center',
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 1 },
    shadowOpacity:   0.06,
    shadowRadius:    4,
    elevation:       2,
  },
  navBtnText: {
    fontSize:      14,
    fontWeight:    '500',
    letterSpacing: -0.1,
  },
  // Master button: no border, filled primary when mastered
  masterBtn: {
    flex:            2,
    borderRadius:    14,
    paddingVertical: spacing.sm + 2,
    alignItems:      'center',
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 1 },
    shadowOpacity:   0.06,
    shadowRadius:    4,
    elevation:       2,
  },
  masterBtnText: {
    fontSize:      14,
    fontWeight:    '600',
    letterSpacing: -0.1,
  },

  // Progress section: no border
  progressSection: {
    borderRadius: 16,
    padding:      spacing.md,
    gap:          spacing.xs,
    shadowColor:  '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius:  4,
    elevation:     2,
  },
  progressHint: {
    fontSize:   12,
    textAlign:  'right',
    letterSpacing: 0.1,
  },

  swipeHint: {
    fontSize:      12,
    textAlign:     'center',
    letterSpacing: 0.3,
  },
});

