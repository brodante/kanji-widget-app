// @ts-nocheck
/**
 * ReviewScreen — Spaced Repetition review session.
 *
 * States:
 *   idle    → shows due count + "Start Session" button
 *   session → one card at a time, reveal then rate
 *   summary → stats after completing the deck
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { getCharacter } from '../engine/KanjiData';
import {
  applyReview,
  createCard,
  getDueCards,
  getOrCreateCard,
  getRetentionStats,
} from '../engine/SRSEngine';
import { useProgress } from '../hooks/useProgress';
import {
  getSRSData,
  getProgress,
  saveSRSData,
  saveProgress,
} from '../storage/StorageManager';
import { spacing, useTheme } from '../theme/ThemeContext';
import { KanjiEntry, ReviewGrade, SRSCard } from '../types';

type ScreenState = 'idle' | 'question' | 'answer' | 'summary';

interface SessionResult {
  character: string;
  grade:     ReviewGrade;
}

export default function ReviewScreen() {
  const { colors }            = useTheme();
  const { progress, refresh } = useProgress();

  const [state,    setState]    = useState<ScreenState>('idle');
  const [deck,     setDeck]     = useState<SRSCard[]>([]);
  const [index,    setIndex]    = useState(0);
  const [results,  setResults]  = useState<SessionResult[]>([]);
  const fadeAnim               = useRef(new Animated.Value(1)).current;

  // Stats for idle screen
  const srsData  = getSRSData();
  const stats    = useMemo(() => getRetentionStats(srsData, progress.currentLevel), [srsData, progress.currentLevel]);
  const dueCards = useMemo(() => getDueCards(srsData, progress.currentLevel),       [srsData, progress.currentLevel]);

  const currentCard  = deck[index];
  const currentEntry = currentCard ? getCharacter(currentCard.character) : null;

  // ── Start session ────────────────────────────────────────────────────────────
  const startSession = useCallback(() => {
    const due = getDueCards(getSRSData(), progress.currentLevel);
    if (due.length === 0) return;
    setDeck(due);
    setIndex(0);
    setResults([]);
    setState('question');
  }, [progress.currentLevel]);

  // ── Reveal answer ────────────────────────────────────────────────────────────
  const revealAnswer = useCallback(() => {
    setState('answer');
  }, []);

  // ── Animate card transition ───────────────────────────────────────────────────
  const fadeTransition = useCallback((fn: () => void) => {
    Animated.timing(fadeAnim, { toValue: 0, duration: 120, useNativeDriver: true }).start(() => {
      fn();
      Animated.timing(fadeAnim, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    });
  }, [fadeAnim]);

  // ── Grade a card ─────────────────────────────────────────────────────────────
  const gradeCard = useCallback(async (grade: ReviewGrade) => {
    if (!currentCard) return;

    const newResults = [...results, { character: currentCard.character, grade }];
    setResults(newResults);

    // Apply the review to storage
    const srs  = getSRSData();
    const prog = getProgress();
    const { srsData: newSRS, progress: newProg } = applyReview(
      srs, prog, currentCard.character, grade,
      { level: currentCard.level },
    );
    await saveSRSData(newSRS);
    await saveProgress(newProg);
    refresh();

    fadeTransition(() => {
      const next = index + 1;
      if (next >= deck.length) {
        setState('summary');
      } else {
        setIndex(next);
        setState('question');
      }
    });
  }, [currentCard, results, index, deck.length, fadeTransition, refresh]);

  // ── End session ───────────────────────────────────────────────────────────────
  const endSession = useCallback(() => {
    setState('idle');
    setDeck([]);
    setIndex(0);
    setResults([]);
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────
  // IDLE screen
  // ─────────────────────────────────────────────────────────────────────────────
  if (state === 'idle') {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
        <ScrollView contentContainerStyle={styles.center} showsVerticalScrollIndicator={false}>
          {/* Header Icon Pill */}
          <View style={[styles.headerIconPill, { backgroundColor: colors.primary + '15' }]}>
            <Text style={[styles.headerIconKanji, { color: colors.primary }]}>復</Text>
          </View>

          <Text style={[styles.heading, { color: colors.text }]}>Spaced Repetition</Text>
          <Text style={[styles.subheading, { color: colors.textSecondary }]}>
            {progress.currentLevel} · Daily Recall Deck
          </Text>

          {/* Stats grid */}
          <View style={styles.statsGrid}>
            {[
              { label: 'Due Today',    value: String(stats.dueCount),      color: stats.dueCount > 0 ? colors.warning : colors.success },
              { label: 'Retention',    value: `${stats.retentionRate}%`,   color: colors.primary },
              { label: 'Mature',       value: String(stats.mature),        color: colors.success },
              { label: 'Total Tracked', value: String(stats.totalTracked), color: colors.text },
            ].map(s => (
              <View key={s.label} style={[styles.statCard, { backgroundColor: colors.surface }]}>
                <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{s.label}</Text>
              </View>
            ))}
          </View>

          {dueCards.length === 0 ? (
            <View style={[styles.allDone, { backgroundColor: colors.surface }]}>
              <View style={[styles.checkCircle, { backgroundColor: colors.success + '18' }]}>
                <Text style={[styles.checkMark, { color: colors.success }]}>✓</Text>
              </View>
              <Text style={[styles.allDoneText, { color: colors.text }]}>All Caught Up</Text>
              <Text style={[styles.allDoneSubtext, { color: colors.textSecondary }]}>
                No reviews are due right now. You can continue learning new kanji in the Learn tab.
              </Text>
            </View>
          ) : (
            <Pressable
              onPress={startSession}
              style={({ pressed }) => [
                styles.startBtn,
                { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <Text style={styles.startBtnText}>
                Start Session ({dueCards.length} {dueCards.length === 1 ? 'card' : 'cards'})
              </Text>
            </Pressable>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SUMMARY screen
  // ─────────────────────────────────────────────────────────────────────────────
  if (state === 'summary') {
    const correct = results.filter(r => r.grade !== 'again').length;
    const pct     = results.length > 0 ? Math.round((correct / results.length) * 100) : 0;
    const gradeCounts = results.reduce((acc, r) => {
      acc[r.grade] = (acc[r.grade] ?? 0) + 1; return acc;
    }, {} as Record<ReviewGrade, number>);

    return (
      <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
        <ScrollView contentContainerStyle={styles.center} showsVerticalScrollIndicator={false}>
          <View style={[styles.headerIconPill, { backgroundColor: colors.primary + '15' }]}>
            <Text style={[styles.pctDisplay, { color: colors.primary }]}>{pct}%</Text>
          </View>
          <Text style={[styles.heading, { color: colors.text }]}>Session Complete</Text>
          <Text style={[styles.subheading, { color: colors.textSecondary }]}>
            {results.length} cards reviewed · {correct} recalled
          </Text>

          {/* Grade breakdown */}
          <View style={[styles.summaryCard, { backgroundColor: colors.surface }]}>
            {Object.entries(GRADE_META).map(([grade, meta], idx) => (
              <View
                key={grade}
                style={[
                  styles.gradeRow,
                  idx > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
                ]}
              >
                <View style={[styles.gradeDot, { backgroundColor: meta.color }]} />
                <Text style={[styles.gradeRowLabel, { color: colors.text }]}>{meta.label}</Text>
                <Text style={[styles.gradeRowCount, { color: colors.text }]}>
                  {gradeCounts[grade as ReviewGrade] ?? 0}
                </Text>
              </View>
            ))}
          </View>

          <Pressable
            onPress={endSession}
            style={({ pressed }) => [
              styles.startBtn,
              { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Text style={styles.startBtnText}>Done</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // QUESTION / ANSWER screen
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Progress bar */}
      <View style={[styles.progressTrack, { backgroundColor: colors.border + '40' }]}>
        <View style={[
          styles.progressFill,
          { backgroundColor: colors.primary, width: `${(index / deck.length) * 100}%` },
        ]} />
      </View>

      <Animated.View style={[styles.sessionContent, { opacity: fadeAnim }]}>
        {/* Counter */}
        <Text style={[styles.counter, { color: colors.textSecondary }]}>
          {index + 1} of {deck.length}
        </Text>

        {/* Card */}
        <View style={[styles.reviewCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.reviewChar, { color: colors.text }]}>
            {currentCard?.character ?? '?'}
          </Text>

          {state === 'answer' && currentEntry && (
            <View style={styles.answerSection}>
              <Text style={[styles.answerMeaning, { color: colors.text }]}>
                {currentEntry.meanings.join(', ')}
              </Text>
              {currentEntry.onyomi.length > 0 && (
                <Text style={[styles.answerReading, { color: colors.textSecondary }]}>
                  音: {currentEntry.onyomi.join('  ·  ')}
                </Text>
              )}
              {currentEntry.kunyomi.length > 0 && (
                <Text style={[styles.answerReading, { color: colors.textSecondary }]}>
                  訓: {currentEntry.kunyomi.join('  ·  ')}
                </Text>
              )}
            </View>
          )}
        </View>

        {/* Reveal / Grade buttons */}
        {state === 'question' ? (
          <Pressable
            onPress={revealAnswer}
            style={({ pressed }) => [
              styles.revealBtn,
              { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Text style={styles.revealBtnText}>Reveal Answer</Text>
          </Pressable>
        ) : (
          <View style={styles.gradeButtons}>
            {(Object.entries(GRADE_META) as [ReviewGrade, typeof GRADE_META[ReviewGrade]][]).map(([grade, meta]) => (
              <Pressable
                key={grade}
                onPress={() => gradeCard(grade)}
                style={({ pressed }) => [
                  styles.gradeBtn,
                  { backgroundColor: meta.color + '15', opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Text style={[styles.gradeBtnLabel, { color: meta.color }]}>{meta.label}</Text>
                <Text style={[styles.gradeBtnHint, { color: meta.color }]}>{meta.hint}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </Animated.View>
    </SafeAreaView>
  );
}

const GRADE_META = {
  again: { label: 'Again', hint: 'Forgot',    color: '#E03131' },
  hard:  { label: 'Hard',  hint: 'Difficult', color: '#E8590C' },
  good:  { label: 'Good',  hint: 'Recalled',  color: '#2B8A3E' },
  easy:  { label: 'Easy',  hint: 'Instant',   color: '#1971C2' },
} as const;

const styles = StyleSheet.create({
  root:  { flex: 1 },
  center: {
    flexGrow: 1, alignItems: 'center', justifyContent: 'center',
    padding: spacing.md, gap: spacing.md,
  },
  headerIconPill: {
    width: 60, height: 60, borderRadius: 30,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  headerIconKanji: { fontSize: 26, fontWeight: '700' },
  pctDisplay:      { fontSize: 20, fontWeight: '700', letterSpacing: -0.5 },
  heading:  { fontSize: 24, fontWeight: '700', textAlign: 'center', letterSpacing: -0.5 },
  subheading: { fontSize: 14, textAlign: 'center', letterSpacing: -0.1 },

  statsGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    gap: spacing.sm, justifyContent: 'center',
    width: '100%',
  },
  statCard: {
    width: '47%', borderRadius: 16,
    padding: spacing.md, alignItems: 'center', gap: 2,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  statValue: { fontSize: 26, fontWeight: '700', letterSpacing: -0.4 },
  statLabel: { fontSize: 12, fontWeight: '500', letterSpacing: 0 },

  allDone: {
    borderRadius: 20,
    padding: spacing.xl, alignItems: 'center', gap: spacing.sm,
    width: '100%',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  checkCircle: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
  },
  checkMark:      { fontSize: 24, fontWeight: '700' },
  allDoneText:    { fontSize: 18, fontWeight: '700', letterSpacing: -0.3 },
  allDoneSubtext: { fontSize: 13, textAlign: 'center', lineHeight: 18, letterSpacing: 0 },

  startBtn: {
    borderRadius: 16, paddingVertical: 15,
    paddingHorizontal: spacing.xl, width: '100%', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 4, elevation: 2,
  },
  startBtnText: { color: '#FFF', fontSize: 16, fontWeight: '600', letterSpacing: -0.2 },

  // Summary
  summaryCard: {
    borderRadius: 18,
    paddingHorizontal: spacing.md, width: '100%',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  gradeRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: 14,
  },
  gradeDot:      { width: 8, height: 8, borderRadius: 4 },
  gradeRowLabel: { flex: 1, fontSize: 15, fontWeight: '500', letterSpacing: -0.1 },
  gradeRowCount: { fontSize: 17, fontWeight: '600', letterSpacing: -0.2 },

  // Session
  progressTrack: { height: 3, width: '100%' },
  progressFill:  { height: 3 },
  sessionContent: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: spacing.md, gap: spacing.md,
  },
  counter: { fontSize: 13, fontWeight: '500', letterSpacing: 0 },
  reviewCard: {
    width: '100%', borderRadius: 24,
    padding: spacing.xl, alignItems: 'center', gap: spacing.md,
    minHeight: 240, justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 16, elevation: 3,
  },
  reviewChar:     { fontSize: 88, fontWeight: '400' },
  answerSection:  { alignItems: 'center', gap: 6, marginTop: spacing.xs },
  answerMeaning:  { fontSize: 19, fontWeight: '600', textAlign: 'center', letterSpacing: -0.3 },
  answerReading:  { fontSize: 13, textAlign: 'center', letterSpacing: 0.1 },

  revealBtn: {
    width: '100%', borderRadius: 16, paddingVertical: 15,
    alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 4, elevation: 2,
  },
  revealBtnText: { color: '#FFF', fontSize: 16, fontWeight: '600', letterSpacing: -0.2 },

  gradeButtons: {
    flexDirection: 'row', width: '100%', gap: spacing.xs,
  },
  gradeBtn: {
    flex: 1, borderRadius: 14,
    paddingVertical: 12, alignItems: 'center', gap: 2,
  },
  gradeBtnLabel: { fontSize: 13, fontWeight: '600', letterSpacing: -0.1 },
  gradeBtnHint:  { fontSize: 11, fontWeight: '500', opacity: 0.8 },
});
