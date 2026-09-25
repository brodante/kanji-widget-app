/**
 * ProgressBar — animated horizontal fill bar.
 * Uses RN Animated (not Reanimated) for New Architecture compatibility.
 */

import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { spacing, useTheme } from '../theme/ThemeContext';

interface Props {
  mastered: number;
  total:    number;
  label?:   string;
}

export default function ProgressBar({ mastered, total, label }: Props) {
  const { colors } = useTheme();
  const pct        = total > 0 ? mastered / total : 0;
  const animPct    = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animPct, {
      toValue:         pct,
      duration:        600,
      useNativeDriver: false, // width can't use native driver
    }).start();
  }, [pct, animPct]);

  const fillWidth = animPct.interpolate({
    inputRange:  [0, 1],
    outputRange: ['0%', '100%'],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.wrapper}>
      <View style={styles.row}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>
          {label ?? 'Progress'}
        </Text>
        <Text style={[styles.count, { color: colors.primary }]}>
          {mastered} / {total}
        </Text>
      </View>
      <View style={[styles.track, { backgroundColor: colors.border }]}>
        <Animated.View
          style={[styles.fill, { backgroundColor: colors.primary, width: fillWidth as unknown as string }]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.xs },
  row: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
  },
  label: { fontSize: 13, fontWeight: '400', letterSpacing: -0.1 },
  count: { fontSize: 13, fontWeight: '600', letterSpacing: -0.1 },
  // Thinner track — more refined, less chunky
  track: { height: 5, borderRadius: 3, overflow: 'hidden' },
  fill:  { height: 5, borderRadius: 3 },
});

