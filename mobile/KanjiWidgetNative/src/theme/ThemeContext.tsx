import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useColorScheme } from 'react-native';

// ─── Accent palette ────────────────────────────────────────────────────────────
// Refined from generic Material Design to Apple iOS-adjacent system hues
export const ACCENTS = {
  indigo: { primary: '#5E5CE6', light: '#9D9BFF', dark: '#3634A3' },
  teal:   { primary: '#32ADE6', light: '#70D7FF', dark: '#0071A4' },
  rose:   { primary: '#FF375F', light: '#FF6B8A', dark: '#C0002D' },
  amber:  { primary: '#FF9F0A', light: '#FFD60A', dark: '#B05E00' },
} as const;

export type AccentName = keyof typeof ACCENTS;

// ─── Full color tokens ──────────────────────────────────────────────────────────
export interface ThemeColors {
  // Surfaces
  background:      string;
  surface:         string;
  surfaceElevated: string;
  border:          string;
  // Text
  text:            string;
  textSecondary:   string;
  textMuted:       string;
  textOnPrimary:   string;
  // Brand
  primary:         string;
  primaryLight:    string;
  primaryDark:     string;
  // Status
  success:         string;
  warning:         string;
  error:           string;
  // Card specific
  cardBack:        string;
  masteredBg:      string;
  masteredText:    string;
  unmasteredBg:    string;
  unmasteredText:  string;
  // Tab bar
  tabBarBg:        string;
  tabBarActive:    string;
  tabBarInactive:  string;
}

function buildColors(dark: boolean, accent: (typeof ACCENTS)[AccentName]): ThemeColors {
  if (dark) {
    // Apple dark mode: true black base, iOS system gray scale
    return {
      background:      '#000000',
      surface:         '#1C1C1E',
      surfaceElevated: '#2C2C2E',
      border:          '#38383A',
      text:            '#F5F5F7',
      textSecondary:   '#AEAEB2',
      textMuted:       '#636366',
      textOnPrimary:   '#FFFFFF',
      primary:         accent.primary,
      primaryLight:    accent.light,
      primaryDark:     accent.dark,
      success:         '#30D158',
      warning:         '#FF9F0A',
      error:           '#FF453A',
      cardBack:        '#1C1C2E',
      masteredBg:      accent.dark + '30',
      masteredText:    accent.light,
      unmasteredBg:    '#2C2C2E',
      unmasteredText:  '#48484A',
      tabBarBg:        '#1C1C1E',
      tabBarActive:    accent.primary,
      tabBarInactive:  '#48484A',
    };
  }
  // Apple light mode: iOS grouped background + pure white surfaces
  return {
    background:      '#F2F2F7',
    surface:         '#FFFFFF',
    surfaceElevated: '#FFFFFF',
    border:          '#C6C6C8',
    text:            '#1C1C1E',
    textSecondary:   '#6C6C70',
    textMuted:       '#AEAEB2',
    textOnPrimary:   '#FFFFFF',
    primary:         accent.primary,
    primaryLight:    accent.light,
    primaryDark:     accent.dark,
    success:         '#34C759',
    warning:         '#FF9500',
    error:           '#FF3B30',
    cardBack:        '#F0F0FF',
    masteredBg:      accent.primary + '14',
    masteredText:    accent.dark,
    unmasteredBg:    '#F2F2F7',
    unmasteredText:  '#C7C7CC',
    tabBarBg:        '#F9F9F9',
    tabBarActive:    accent.primary,
    tabBarInactive:  '#8E8E93',
  };
}

// ─── Spacing & typography ───────────────────────────────────────────────────────
export const spacing = {
  xs:  4,
  sm:  8,
  md:  16,
  lg:  24,
  xl:  32,
  xxl: 48,
} as const;

export const typography = {
  kanjiLarge:  { fontSize: 96, fontFamily: 'NotoSansJP-Regular' },
  kanjiMedium: { fontSize: 48, fontFamily: 'NotoSansJP-Regular' },
  kanjiSmall:  { fontSize: 28, fontFamily: 'NotoSansJP-Regular' },
  // Headings: negative tracking grows with size (SKILL §15)
  heading1:    { fontSize: 28, fontWeight: '700' as const, letterSpacing: -0.5, lineHeight: 34 },
  heading2:    { fontSize: 22, fontWeight: '600' as const, letterSpacing: -0.3, lineHeight: 28 },
  heading3:    { fontSize: 17, fontWeight: '600' as const, letterSpacing: -0.2, lineHeight: 22 },
  // Body: near-zero tracking, comfortable leading
  body:        { fontSize: 15, fontWeight: '400' as const, letterSpacing: -0.1, lineHeight: 22 },
  bodySmall:   { fontSize: 13, fontWeight: '400' as const, letterSpacing: 0,    lineHeight: 18 },
  caption:     { fontSize: 11, fontWeight: '400' as const, letterSpacing: 0.1,  lineHeight: 15 },
  // Small UI labels: slight positive tracking for legibility
  label:       { fontSize: 12, fontWeight: '500' as const, letterSpacing: 0.2 },
} as const;

// ─── Context ────────────────────────────────────────────────────────────────────
interface ThemeContextValue {
  colors:    ThemeColors;
  isDark:    boolean;
  accent:    AccentName;
  setDark:   (dark: boolean) => void;
  setAccent: (name: AccentName) => void;
  toggleDark: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [isDark, setIsDark] = useState(systemScheme === 'dark');
  const [accent, setAccentState] = useState<AccentName>('indigo');

  // Keep in sync with system scheme changes (user can still override)
  useEffect(() => {
    setIsDark(systemScheme === 'dark');
  }, [systemScheme]);

  const setDark = useCallback((dark: boolean) => setIsDark(dark), []);
  const toggleDark = useCallback(() => setIsDark(d => !d), []);
  const setAccent = useCallback((name: AccentName) => setAccentState(name), []);

  const colors = useMemo(
    () => buildColors(isDark, ACCENTS[accent]),
    [isDark, accent],
  );

  const value = useMemo(
    () => ({ colors, isDark, accent, setDark, setAccent, toggleDark }),
    [colors, isDark, accent, setDark, setAccent, toggleDark],
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
