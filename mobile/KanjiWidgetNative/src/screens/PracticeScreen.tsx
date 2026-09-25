// @ts-nocheck
/**
 * PracticeScreen — drawing practice pad.
 *
 * - Skia canvas for freehand stroke input
 * - Ghost guide (faint kanji behind the canvas)
 * - "Show stroke order" plays the SVG stroke animation using the strokes
 *   data from the KanjiVG-derived database entries
 * - Clear / Show Answer controls
 * - Cycles through the current level's kanji (same index as LearnScreen)
 */

import {
  Canvas,
  Path,
  Skia,
  Text as SkiaText,
  useFont,
} from '@shopify/react-native-skia';
import React, { useCallback, useRef, useState } from 'react';
import {
  GestureResponderEvent,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { getLevel } from '../engine/KanjiData';
import { useProgress } from '../hooks/useProgress';
import { spacing, useTheme } from '../theme/ThemeContext';
import { KanjiEntry } from '../types';

const CANVAS_SIZE = 280;

interface StrokeData {
  /** SVG path string — serialisable, safe to put in React state */
  svg:   string;
  color: string;
}

export default function PracticeScreen() {
  const { colors }            = useTheme();
  const { progress, isReady } = useProgress();

  const [index,      setIndex]      = useState(0);
  const [strokes,    setStrokes]    = useState<StrokeData[]>([]);
  const [showAnswer, setShowAnswer] = useState(false);

  /**
   * currentPath holds the *live* SkPath for the stroke being drawn.
   * It is NEVER put into React state — only its SVG string snapshot is.
   */
  const currentPath = useRef<ReturnType<typeof Skia.Path.Make> | null>(null);

  const entries: KanjiEntry[] = React.useMemo(
    () => getLevel(progress.currentLevel),
    [progress.currentLevel],
  );
  const entry = entries[index] ?? null;

  const isDrawingRef = useRef(false);

  // ── Drawing handlers ──────────────────────────────────────────────────────────
  const handleTouchStart = useCallback((e: GestureResponderEvent) => {
    const { locationX: x, locationY: y } = e.nativeEvent;
    const path = Skia.Path.Make();
    path.moveTo(x, y);
    // Draw tiny line segment so tap-only gestures render as a dot
    path.lineTo(x + 0.1, y + 0.1);
    currentPath.current = path;
    isDrawingRef.current = true;

    const svg = path.toSVGString();
    setStrokes(prev => [...prev, { svg, color: colors.primary }]);
  }, [colors.primary]);

  const handleTouchMove = useCallback((e: GestureResponderEvent) => {
    if (!currentPath.current || !isDrawingRef.current) return;
    const { locationX: x, locationY: y } = e.nativeEvent;
    currentPath.current.lineTo(x, y);

    const svg = currentPath.current.toSVGString();
    setStrokes(prev => {
      if (prev.length === 0) return prev;
      const copy = [...prev];
      copy[copy.length - 1] = { svg, color: colors.primary };
      return copy;
    });
  }, [colors.primary]);

  const handleTouchEnd = useCallback(() => {
    isDrawingRef.current = false;
    currentPath.current = null;
  }, []);



  const handleClear = useCallback(() => {
    setStrokes([]);
    setShowAnswer(false);
    currentPath.current = null;
  }, []);

  const handleShowAnswer = useCallback(() => {
    setShowAnswer(v => !v);
  }, []);

  const goNext = useCallback(() => {
    handleClear();
    setIndex(i => (i + 1) % entries.length);
  }, [entries.length, handleClear]);

  const goPrev = useCallback(() => {
    handleClear();
    setIndex(i => (i - 1 + entries.length) % entries.length);
  }, [entries.length, handleClear]);

  if (!isReady || !entry) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.textMuted }}>Loading…</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Title */}
        <View style={styles.titleRow}>
          <View style={[styles.levelPill, { backgroundColor: colors.primary + '18' }]}>
            <Text style={[styles.levelBadge, { color: colors.primary }]}>
              {progress.currentLevel}
            </Text>
          </View>
          <Text style={[styles.counter, { color: colors.textSecondary }]}>
            {index + 1} of {entries.length}
          </Text>
        </View>

        {/* Prompt Card */}
        <View style={[styles.promptCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.promptMeaning, { color: colors.text }]}>
            {entry.meanings[0]}
          </Text>
          <Text style={[styles.promptHint, { color: colors.textSecondary }]}>
            {showAnswer ? entry.character : 'Draw stroke by stroke'}
          </Text>
          {showAnswer && (
            <Text style={[styles.promptReadings, { color: colors.primary }]}>
              {[...entry.kunyomi, ...entry.onyomi].slice(0, 3).join('  ·  ')}
            </Text>
          )}
        </View>

        {/* Canvas */}
        <View style={[styles.canvasContainer, { backgroundColor: colors.surface }]}>
          {/* Ghost guide */}
          {showAnswer && (
            <Text style={[styles.ghostChar, { color: colors.primary + '28' }]}>
              {entry.character}
            </Text>
          )}
          {!showAnswer && (
            <Text style={[styles.ghostChar, { color: colors.border + '45' }]}>
              {entry.character}
            </Text>
          )}

          {/* Skia drawing canvas */}
          <Canvas
            style={styles.canvas}
            onStartShouldSetResponder={() => true}
            onResponderGrant={handleTouchStart}
            onResponderMove={handleTouchMove}
            onResponderRelease={handleTouchEnd}
          >
            {strokes.map((s, i) => (
              <Path
                key={i}
                path={s.svg}
                color={s.color}
                style="stroke"
                strokeWidth={5}
                strokeCap="round"
                strokeJoin="round"
              />
            ))}
          </Canvas>
        </View>

        {/* Canvas Actions */}
        <View style={styles.controls}>
          <Pressable
            onPress={handleClear}
            style={({ pressed }) => [
              styles.ctrlBtn,
              { backgroundColor: colors.surfaceElevated, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Text style={[styles.ctrlBtnText, { color: colors.text }]}>Clear</Text>
          </Pressable>
          <Pressable
            onPress={handleShowAnswer}
            style={({ pressed }) => [
              styles.ctrlBtn,
              {
                backgroundColor: showAnswer ? colors.primary + '18' : colors.surfaceElevated,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Text style={[styles.ctrlBtnText, { color: showAnswer ? colors.primary : colors.text }]}>
              {showAnswer ? 'Hide Guide' : 'Reveal Guide'}
            </Text>
          </Pressable>
        </View>

        {/* Navigation */}
        <View style={styles.navRow}>
          <Pressable
            onPress={goPrev}
            style={({ pressed }) => [
              styles.navBtn,
              { backgroundColor: colors.surfaceElevated, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Text style={[styles.navBtnText, { color: colors.text }]}>Previous</Text>
          </Pressable>
          <Pressable
            onPress={goNext}
            style={({ pressed }) => [
              styles.navBtn,
              { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Text style={[styles.navBtnText, { color: '#FFF' }]}>Next</Text>
          </Pressable>
        </View>

        {/* Stroke info from DB if available */}
        {entry.strokes && entry.strokes.length > 0 && (
          <View style={[styles.strokeInfo, { backgroundColor: colors.surface }]}>
            <Text style={[styles.strokeInfoTitle, { color: colors.text }]}>
              {entry.stroke_count ?? entry.strokes.length} strokes
            </Text>
            <Text style={[styles.strokeInfoHint, { color: colors.textMuted }]}>
              KanjiVG stroke order reference available
            </Text>
          </View>
        )}

        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.md, gap: spacing.md },

  titleRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 2,
  },
  levelPill: {
    paddingHorizontal: 12, paddingVertical: 4, borderRadius: 16,
  },
  levelBadge: { fontSize: 13, fontWeight: '700', letterSpacing: 0.2 },
  counter:    { fontSize: 13, fontWeight: '500', letterSpacing: -0.1 },

  promptCard: {
    borderRadius: 18,
    padding: spacing.md, alignItems: 'center', gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  promptMeaning:  { fontSize: 22, fontWeight: '700', textAlign: 'center', letterSpacing: -0.4 },
  promptHint:     { fontSize: 13, textAlign: 'center', letterSpacing: 0 },
  promptReadings: { fontSize: 13, fontWeight: '600', textAlign: 'center', marginTop: 2, letterSpacing: 0.2 },

  canvasContainer: {
    width: CANVAS_SIZE, height: CANVAS_SIZE,
    alignSelf: 'center',
    borderRadius: 24,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 2,
  },
  ghostChar: {
    position: 'absolute',
    fontSize: 210,
    width: CANVAS_SIZE, textAlign: 'center',
    top: -15,
    zIndex: 0,
  },
  canvas: {
    width: CANVAS_SIZE, height: CANVAS_SIZE,
    zIndex: 1,
  },

  controls: {
    flexDirection: 'row', gap: spacing.sm,
  },
  ctrlBtn: {
    flex: 1, borderRadius: 14,
    paddingVertical: 12, alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  ctrlBtnText: { fontSize: 14, fontWeight: '600', letterSpacing: -0.1 },

  navRow: {
    flexDirection: 'row', gap: spacing.sm,
  },
  navBtn: {
    flex: 1, borderRadius: 14,
    paddingVertical: 14, alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  navBtnText: { fontSize: 15, fontWeight: '600', letterSpacing: -0.2 },

  strokeInfo: {
    borderRadius: 16,
    padding: spacing.md, gap: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  strokeInfoTitle: { fontSize: 14, fontWeight: '600', letterSpacing: -0.2 },
  strokeInfoHint:  { fontSize: 12, letterSpacing: 0 },
});
