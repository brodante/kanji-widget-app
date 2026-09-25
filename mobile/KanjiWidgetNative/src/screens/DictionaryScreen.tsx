// @ts-nocheck
/**
 * DictionaryScreen — full kanji grid for the current level.
 *
 * - 6-column grid of all characters in the level
 * - Mastered: accent color highlight + checkmark
 * - Studied: slightly elevated background
 * - Pending: greyed out
 * - Tap any cell → switches to Learn tab
 * - Recently studied horizontal strip at the bottom
 */

import { useNavigation } from '@react-navigation/native';
import React, { useCallback, useMemo } from 'react';
import {
  FlatList,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { getCharacter, getLevel } from '../engine/KanjiData';
import { useProgress } from '../hooks/useProgress';
import { markAsStudied } from '../storage/StorageManager';
import { spacing, useTheme } from '../theme/ThemeContext';
import { KanjiEntry } from '../types';

const NUM_COLUMNS = 6;
const CELL_SIZE   = 52;

export default function DictionaryScreen() {
  const { colors }            = useTheme();
  const navigation            = useNavigation<any>();
  const { progress, isReady } = useProgress();

  const entries: KanjiEntry[] = useMemo(
    () => getLevel(progress.currentLevel),
    [progress.currentLevel],
  );

  const masteredSet = useMemo(() => new Set(progress.mastered), [progress.mastered]);
  const studiedSet  = useMemo(() => new Set(progress.studied),  [progress.studied]);
  const masteredCount = entries.filter(e => masteredSet.has(e.character)).length;

  // Recently studied filtered to current level, newest first, max 12
  const recentEntries = useMemo(() => {
    return [...progress.studied]
      .reverse()
      .filter(c => entries.some(e => e.character === c))
      .slice(0, 12)
      .map(c => getCharacter(c))
      .filter(Boolean) as KanjiEntry[];
  }, [progress.studied, entries]);

  const handleCellPress = useCallback(async (entry: KanjiEntry) => {
    await markAsStudied(entry.character);
    navigation.navigate('Learn');
  }, [navigation]);

  const renderCell = useCallback(({ item }: { item: KanjiEntry }) => {
    const isMastered = masteredSet.has(item.character);
    const isStudied  = studiedSet.has(item.character);
    return (
      <Pressable
        onPress={() => handleCellPress(item)}
        style={({ pressed }) => [
          styles.cell,
          {
            backgroundColor: isMastered
              ? colors.primary + '22'
              : isStudied ? colors.surfaceElevated : colors.surface,
            opacity: pressed ? 0.65 : 1,
          },
        ]}
        accessibilityLabel={`${item.character}: ${item.meanings[0]}`}
      >
        <Text
          style={[styles.cellChar, {
            color: isMastered ? colors.primary
              : isStudied ? colors.text : colors.textMuted,
          }]}
          adjustsFontSizeToFit
          numberOfLines={1}
        >
          {item.character}
        </Text>
        {isMastered && (
          <Text style={[styles.check, { color: colors.primary }]}>✓</Text>
        )}
      </Pressable>
    );
  }, [masteredSet, studiedSet, colors, handleCellPress]);

  if (!isReady) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.textMuted }}>Loading…</Text>
      </View>
    );
  }

  const pct = entries.length > 0
    ? Math.round((masteredCount / entries.length) * 100) : 0;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <View>
            <Text style={[styles.title, { color: colors.text }]}>
              {progress.currentLevel} Dictionary
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              {masteredCount} mastered · {entries.length} total
            </Text>
          </View>
          <View style={[styles.pctBadge, { backgroundColor: colors.primary + '18', borderColor: colors.primary }]}>
            <Text style={[styles.pctText, { color: colors.primary }]}>{pct}%</Text>
          </View>
        </View>

        {/* Legend */}
        <View style={styles.legend}>
          {[
            { color: colors.primary + '22', border: colors.primary, label: 'Mastered' },
            { color: colors.surfaceElevated,  border: colors.border,   label: 'Studied'  },
            { color: colors.surface,          border: colors.border + '50', label: 'Pending'  },
          ].map(item => (
            <View key={item.label} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: item.color, borderColor: item.border, borderWidth: 1 }]} />
              <Text style={[styles.legendText, { color: colors.textMuted }]}>{item.label}</Text>
            </View>
          ))}
        </View>

        {/* Grid */}
        <View style={styles.gridWrap}>
          <FlatList
            data={entries}
            renderItem={renderCell}
            keyExtractor={item => item.character}
            numColumns={NUM_COLUMNS}
            scrollEnabled={false}
            columnWrapperStyle={styles.row}
          />
        </View>

        {/* Recently studied */}
        {recentEntries.length > 0 && (
          <View style={styles.recentSection}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Recently Studied</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.recentRow}
            >
              {recentEntries.map(entry => (
                <Pressable
                  key={entry.character}
                  onPress={() => handleCellPress(entry)}
                  style={[
                    styles.recentCard,
                    {
                      backgroundColor: masteredSet.has(entry.character)
                        ? colors.primary + '22' : colors.surface,
                      borderColor: masteredSet.has(entry.character)
                        ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text style={[styles.recentChar, {
                    color: masteredSet.has(entry.character) ? colors.primary : colors.text,
                  }]}>
                    {entry.character}
                  </Text>
                  <Text style={[styles.recentMeaning, { color: colors.textMuted }]} numberOfLines={1}>
                    {entry.meanings[0]}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
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

  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title:    { fontSize: 20, fontWeight: '700', letterSpacing: -0.4 },
  subtitle: { fontSize: 13, marginTop: 2, letterSpacing: 0, color: '#8E8E93' },
  pctBadge: {
    borderRadius: 20,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
  },
  pctText: { fontSize: 18, fontWeight: '700', letterSpacing: -0.3 },

  legend: {
    flexDirection: 'row', gap: spacing.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot:  { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, letterSpacing: 0.1 },

  gridWrap: { paddingHorizontal: spacing.sm, paddingTop: spacing.xs },
  row:      { gap: spacing.xs, marginBottom: spacing.xs },
  cell: {
    width: CELL_SIZE, height: CELL_SIZE,
    borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    // Shadow only — no border (Apple §12)
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius:  3,
    elevation: 1,
  },
  cellChar: { fontSize: 22, fontWeight: '500', letterSpacing: 0 },
  check: {
    position: 'absolute', top: 2, right: 4,
    fontSize: 9, fontWeight: '800',
  },

  recentSection: { marginTop: spacing.lg, paddingHorizontal: spacing.md },
  sectionTitle:  { fontSize: 15, fontWeight: '600', marginBottom: spacing.sm, letterSpacing: -0.2 },
  recentRow:     { gap: spacing.sm, paddingBottom: spacing.xs },
  recentCard: {
    width: 64, borderRadius: 14,
    padding: spacing.xs, alignItems: 'center', gap: 2,
    // Shadow only, no border
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  recentChar:    { fontSize: 26, fontWeight: '500' },
  recentMeaning: { fontSize: 9, textAlign: 'center', letterSpacing: 0.1 },
});

