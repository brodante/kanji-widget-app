/**
 * LevelSwitcher — bottom sheet style modal for picking a JLPT level.
 */

import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { spacing, useTheme } from '../theme/ThemeContext';
import { JLPTLevel } from '../types';

interface LevelOption {
  level:    JLPTLevel;
  label:    string;
  icon:     string;
  sublabel: string;
}

const LEVELS: LevelOption[] = [
  { level: 'Hiragana', icon: 'あ', label: 'Hiragana', sublabel: '46 characters' },
  { level: 'Katakana', icon: 'ア', label: 'Katakana', sublabel: '46 characters' },
  { level: 'N5',       icon: 'N5', label: 'N5',       sublabel: 'Beginner · ~100 kanji' },
  { level: 'N4',       icon: 'N4', label: 'N4',       sublabel: 'Elementary · ~300 kanji' },
  { level: 'N3',       icon: 'N3', label: 'N3',       sublabel: 'Intermediate · ~650 kanji' },
  { level: 'N2',       icon: 'N2', label: 'N2',       sublabel: 'Advanced · ~1000 kanji' },
  { level: 'N1',       icon: 'N1', label: 'N1',       sublabel: 'Master · ~2000 kanji' },
  { level: 'all',      icon: '全', label: 'All Levels', sublabel: 'Everything combined' },
];

interface Props {
  visible:       boolean;
  currentLevel:  JLPTLevel;
  onSelect:      (level: JLPTLevel) => void;
  onClose:       () => void;
}

export default function LevelSwitcher({ visible, currentLevel, onSelect, onClose }: Props) {
  const { colors } = useTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      {/* Backdrop — slightly darker, softer scrim (Apple §12) */}
      <Pressable style={styles.backdrop} onPress={onClose} />

      {/* Sheet — no side borders, just top radius */}
      <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
        {/* Handle — thinner, subtler */}
        <View style={[styles.handle, { backgroundColor: colors.border }]} />

        <Text style={[styles.title, { color: colors.text }]}>Select Level</Text>

        <ScrollView showsVerticalScrollIndicator={false} style={styles.list}>
          {LEVELS.map(opt => {
            const isActive = opt.level === currentLevel;
            return (
              <Pressable
                key={opt.level}
                onPress={() => { onSelect(opt.level); onClose(); }}
                style={({ pressed }) => [
                  styles.row,
                  {
                    backgroundColor: isActive
                      ? colors.primary + '10'
                      : pressed ? colors.surfaceElevated : 'transparent',
                  },
                ]}
              >
                {/* Icon box: filled primary when active, surface elevated otherwise */}
                <View style={[
                  styles.iconBox,
                  {
                    backgroundColor: isActive
                      ? colors.primary
                      : colors.surfaceElevated,
                  },
                ]}>
                  <Text style={[styles.iconText, { color: isActive ? '#FFF' : colors.textSecondary }]}>
                    {opt.icon}
                  </Text>
                </View>
                <View style={styles.labelBox}>
                  <Text style={[styles.levelLabel, {
                    color:      isActive ? colors.primary : colors.text,
                    fontWeight: isActive ? '600' : '400',
                  }]}>
                    {opt.label}
                  </Text>
                  <Text style={[styles.sublabel, { color: colors.textMuted }]}>
                    {opt.sublabel}
                  </Text>
                </View>
                {isActive && (
                  <Text style={[styles.checkmark, { color: colors.primary }]}>✓</Text>
                )}
              </Pressable>
            );
          })}
          {/* Bottom padding so last item isn't obscured */}
          <View style={{ height: spacing.xl }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex:            1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  // Sheet: no side borders — just top rounding and shadow
  sheet: {
    borderTopLeftRadius:  28,
    borderTopRightRadius: 28,
    paddingTop:           spacing.sm,
    maxHeight:            '75%',
    shadowColor:          '#000',
    shadowOffset:         { width: 0, height: -4 },
    shadowOpacity:        0.12,
    shadowRadius:         20,
    elevation:            20,
  },
  handle: {
    width:        36,
    height:       4,
    borderRadius: 2,
    alignSelf:    'center',
    marginBottom: spacing.sm,
    opacity:      0.5,
  },
  title: {
    fontSize:      17,
    fontWeight:    '600',
    letterSpacing: -0.2,
    textAlign:     'center',
    paddingBottom: spacing.sm,
  },
  list: {
    paddingHorizontal: spacing.md,
  },
  // Row: no border, just background shift on active/pressed
  row: {
    flexDirection:  'row',
    alignItems:     'center',
    borderRadius:   14,
    padding:        spacing.sm,
    marginBottom:   spacing.xs,
    gap:            spacing.sm,
  },
  iconBox: {
    width:          44,
    height:         44,
    borderRadius:   12,
    alignItems:     'center',
    justifyContent: 'center',
  },
  iconText: {
    fontSize:   18,
    fontWeight: '600',
  },
  labelBox:   { flex: 1 },
  levelLabel: {
    fontSize:      15,
    letterSpacing: -0.1,
  },
  sublabel: {
    fontSize:  12,
    marginTop: 1,
  },
  checkmark: {
    fontSize:   18,
    fontWeight: '600',
  },
});
