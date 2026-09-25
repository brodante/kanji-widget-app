// @ts-nocheck
/**
 * SearchOverlay — slides down from the top, searches across all levels.
 *
 * Supports: kanji, English meaning, kana reading, romaji (ima→今, nichi→日)
 * Tap a result → navigates to Learn tab and highlights that character.
 */

import { useNavigation } from '@react-navigation/native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { search, SearchResult } from '../engine/KanjiData';
import { markAsStudied } from '../storage/StorageManager';
import { spacing, useTheme } from '../theme/ThemeContext';

interface Props {
  visible:  boolean;
  onClose:  () => void;
  onSelect?: (character: string) => void;
}

export default function SearchOverlay({ visible, onClose, onSelect }: Props) {
  const { colors }            = useTheme();
  const navigation            = useNavigation<any>();
  const [query, setQuery]     = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const inputRef              = useRef<TextInput>(null);
  const slideY                = useRef(new Animated.Value(-300)).current;
  const opacity               = useRef(new Animated.Value(0)).current;

  // Animate in/out
  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideY, { toValue: 0, useNativeDriver: true, damping: 20, stiffness: 200 }),
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start(() => inputRef.current?.focus());
    } else {
      Keyboard.dismiss();
      Animated.parallel([
        Animated.timing(slideY,  { toValue: -300, duration: 200, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0,    duration: 150, useNativeDriver: true }),
      ]).start(() => setQuery(''));
    }
  }, [visible, slideY, opacity]);

  // Live search as user types
  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const r = search(query, 20);
    setResults(r);
  }, [query]);

  const handleSelect = useCallback(async (result: SearchResult) => {
    await markAsStudied(result.entry.character);
    onSelect?.(result.entry.character);
    onClose();
    navigation.navigate('Learn');
  }, [navigation, onClose, onSelect]);

  if (!visible && !query) return null; // fully unmounted when idle

  return (
    <Animated.View
      style={[styles.overlay, { opacity }]}
      pointerEvents={visible ? 'box-none' : 'none'}
    >
      {/* Backdrop tap to close */}
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>

      {/* Search panel */}
      <Animated.View
        style={[
          styles.panel,
          { backgroundColor: colors.surface },
          { transform: [{ translateY: slideY }] },
        ]}
      >
        {/* Input row */}
        <View style={[styles.inputRow, { backgroundColor: colors.surfaceElevated }]}>
          <Text style={[styles.searchIcon, { color: colors.textSecondary }]}>􀊫</Text>
          <TextInput
            ref={inputRef}
            style={[styles.input, { color: colors.text }]}
            placeholder="Search kanji, meaning, kana…"
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')} style={styles.clearBtn} hitSlop={8}>
              <View style={[styles.clearCircle, { backgroundColor: colors.textMuted + '33' }]}>
                <Text style={{ color: colors.text, fontSize: 11, fontWeight: '700' }}>✕</Text>
              </View>
            </Pressable>
          )}
        </View>

        {/* Results */}
        <FlatList
          data={results}
          keyExtractor={item => item.entry.character}
          keyboardShouldPersistTaps="handled"
          style={styles.list}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => handleSelect(item)}
              style={({ pressed }) => [
                styles.resultRow,
                {
                  backgroundColor: pressed ? colors.surfaceElevated : 'transparent',
                  borderBottomColor: colors.border + '40',
                },
              ]}
            >
              <Text style={[styles.resultChar, { color: colors.primary }]}>
                {item.entry.character}
              </Text>
              <View style={styles.resultInfo}>
                <Text style={[styles.resultMeaning, { color: colors.text }]} numberOfLines={1}>
                  {item.entry.meanings.join(', ')}
                </Text>
                <Text style={[styles.resultReading, { color: colors.textSecondary }]} numberOfLines={1}>
                  {[...item.entry.kunyomi, ...item.entry.onyomi].slice(0, 3).join('  ·  ')}
                </Text>
              </View>
              <View style={[styles.jlptTag, { backgroundColor: colors.surfaceElevated }]}>
                <Text style={[styles.jlptTagText, { color: colors.textSecondary }]}>
                  {item.entry.jlpt}
                </Text>
              </View>
            </Pressable>
          )}
          ListEmptyComponent={
            query.trim() ? (
              <Text style={[styles.empty, { color: colors.textMuted }]}>
                No results for "{query}"
              </Text>
            ) : null
          }
        />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 100,
  },
  backdrop: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  panel: {
    position: 'absolute', top: 0, left: 0, right: 0,
    borderBottomLeftRadius:  24,
    borderBottomRightRadius: 24,
    maxHeight: '75%',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15, shadowRadius: 20, elevation: 12,
  },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    margin: spacing.md, borderRadius: 14,
    paddingHorizontal: spacing.sm, paddingVertical: 4,
    gap: spacing.xs,
  },
  searchIcon: { fontSize: 15, fontWeight: '600', marginLeft: 4 },
  input: { flex: 1, fontSize: 16, paddingVertical: 10, letterSpacing: -0.2 },
  clearBtn: { padding: spacing.xs },
  clearCircle: {
    width: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
  },

  list: { maxHeight: 420 },
  resultRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth, gap: spacing.sm,
  },
  resultChar:    { fontSize: 28, fontWeight: '500', width: 40, textAlign: 'center' },
  resultInfo:    { flex: 1 },
  resultMeaning: { fontSize: 15, fontWeight: '600', letterSpacing: -0.2 },
  resultReading: { fontSize: 12, marginTop: 1, letterSpacing: 0 },
  jlptTag: {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 8,
  },
  jlptTagText: { fontSize: 11, fontWeight: '600', letterSpacing: 0.2 },
  empty: {
    textAlign: 'center', padding: spacing.xl, fontSize: 14, letterSpacing: -0.1,
  },
});
