/**
 * StreakBadge — fire icon + streak count.
 * Pulses on streak increment. Uses RN Animated for New Architecture compatibility.
 */

import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

interface Props {
  streak: number;
}

export default function StreakBadge({ streak }: Props) {
  const { colors } = useTheme();
  const scale      = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (streak > 0) {
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.2, duration: 120, useNativeDriver: true }),
        Animated.spring(scale,  { toValue: 1,   useNativeDriver: true, damping: 8, stiffness: 200 }),
      ]).start();
    }
  }, [streak, scale]);

  return (
    <Animated.View
      style={[
        styles.badge,
        // No border — rely on background alone (surface elevated = slight contrast)
        { backgroundColor: colors.surfaceElevated },
        { transform: [{ scale }] },
      ]}
    >
      <Text style={styles.fire}>🔥</Text>
      <View>
        <Text style={[styles.count, { color: colors.text }]}>{streak}</Text>
        <Text style={[styles.label, { color: colors.textMuted }]}>day streak</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               5,
    borderRadius:      20,
    paddingHorizontal: 11,
    paddingVertical:   5,
  },
  fire:  { fontSize: 18 },
  count: { fontSize: 17, fontWeight: '700', lineHeight: 21, letterSpacing: -0.3 },
  label: { fontSize: 9,  fontWeight: '400', letterSpacing: 0.1 },
});
