/**
 * KanjiWidgets Native
 * React Native port of https://brodante.github.io/kanji-widget-app/
 */

import { NavigationContainer } from '@react-navigation/native';
import React from 'react';
import { Platform, StatusBar, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import RootNavigator from './src/navigation/RootNavigator';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';

// Inner component so we can read theme colors for StatusBar
function AppShell() {
  const { colors, isDark } = useTheme();
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {Platform.OS === 'android' ? (
        // backgroundColor is Android-only prop
        <StatusBar
          barStyle={isDark ? 'light-content' : 'dark-content'}
          // @ts-expect-error: backgroundColor is valid on Android but not typed universally
          backgroundColor={colors.background}
          translucent={false}
        />
      ) : (
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      )}
      <NavigationContainer>
        <RootNavigator />
      </NavigationContainer>
    </View>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AppShell />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
