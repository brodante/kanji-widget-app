// @ts-nocheck
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import SearchOverlay from '../components/SearchOverlay';
import AIFab from '../components/AIFab';
import DictionaryScreen from '../screens/DictionaryScreen';
import LearnScreen from '../screens/LearnScreen';
import PracticeScreen from '../screens/PracticeScreen';
import ReviewScreen from '../screens/ReviewScreen';
import SettingsScreen from '../screens/SettingsScreen';
import { spacing, useTheme } from '../theme/ThemeContext';

export type RootTabParamList = {
  Learn:      undefined;
  Dictionary: undefined;
  Practice:   undefined;
  Review:     undefined;
  Settings:   undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

const TABS = [
  { name: 'Learn',      kanji: '学', label: 'Learn',      screen: LearnScreen },
  { name: 'Dictionary', kanji: '辞', label: 'Dictionary', screen: DictionaryScreen },
  { name: 'Practice',   kanji: '練', label: 'Practice',   screen: PracticeScreen },
  { name: 'Review',     kanji: '脳', label: 'Review',     screen: ReviewScreen },
  { name: 'Settings',   kanji: '設', label: 'Settings',   screen: SettingsScreen },
] as const;

function TabIcon({ kanji, focused, activeColor, inactiveColor }: {
  kanji: string; focused: boolean; activeColor: string; inactiveColor: string;
}) {
  return (
    <View style={[styles.tabIcon, focused && styles.tabIconFocused]}>
      <Text style={[
        styles.tabKanji,
        { color: focused ? activeColor : inactiveColor },
      ]}>
        {kanji}
      </Text>
    </View>
  );
}

export default function RootNavigator() {
  const { colors, isDark }      = useTheme();
  const [searchOpen, setSearch] = useState(false);

  return (
    <View style={{ flex: 1 }}>
      <Tab.Navigator
        screenOptions={{
          headerShown: true,
          // Cleaner header — no shadow, just a subtle separation via background
          headerStyle:       {
            backgroundColor: colors.background,
            shadowOpacity:   0,
            elevation:       0,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.border,
          },
          headerTitleStyle:  {
            color:        colors.text,
            fontSize:     17,
            fontWeight:   '600',
            letterSpacing: -0.2,
          },
          headerTintColor:   colors.text,
          headerRight: () => (
            <Pressable
              onPress={() => setSearch(true)}
              style={({ pressed }) => [
                styles.headerBtn,
                pressed && { opacity: 0.5 },
              ]}
              accessibilityLabel="Search kanji"
            >
              {/* SF Symbol-style magnifying glass — cleaner than emoji */}
              <Text style={{ fontSize: 18, color: colors.primary }}>⌕</Text>
            </Pressable>
          ),
          // iOS-style tab bar: hairline separator, no hard border
          tabBarStyle: {
            backgroundColor: colors.tabBarBg,
            borderTopColor:  colors.border,
            borderTopWidth:  StyleSheet.hairlineWidth,
            height:          Platform.OS === 'ios' ? 83 : 60,
            paddingBottom:   Platform.OS === 'ios' ? 28 : 6,
            paddingTop:      6,
          },
          tabBarActiveTintColor:   colors.tabBarActive,
          tabBarInactiveTintColor: colors.tabBarInactive,
          tabBarLabelStyle: styles.tabLabel,
        }}
      >
        {TABS.map(({ name, kanji, label, screen }) => (
          <Tab.Screen
            key={name}
            name={name}
            component={screen}
            options={{
              headerTitle: label,
              tabBarLabel: label,
              tabBarIcon: ({ focused }) => (
                <TabIcon
                  kanji={kanji}
                  focused={focused}
                  activeColor={colors.tabBarActive}
                  inactiveColor={colors.tabBarInactive}
                />
              ),
            }}
          />
        ))}
      </Tab.Navigator>

      {/* Global search overlay */}
      <SearchOverlay
        visible={searchOpen}
        onClose={() => setSearch(false)}
      />

      {/* AI Sensei FAB — always visible */}
      <AIFab />
    </View>
  );
}

const styles = StyleSheet.create({
  tabIcon:      { alignItems: 'center', justifyContent: 'center' },
  tabIconFocused: { transform: [{ scale: 1.08 }] },
  tabKanji:     { fontSize: 22, lineHeight: 28 },
  // Labels: lighter weight, tighter tracking — less "made by a robot"
  tabLabel:     { fontSize: 10, fontWeight: '500', letterSpacing: 0.1, marginTop: 1 },
  headerBtn:    { marginRight: spacing.md, padding: spacing.xs },
});

