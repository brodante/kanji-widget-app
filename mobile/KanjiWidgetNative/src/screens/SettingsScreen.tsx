// @ts-nocheck
/**
 * SettingsScreen — full settings implementation.
 *
 * Sections:
 *  - Profile (display name, device name)
 *  - Learning (level shortcut, font size)
 *  - Appearance (dark/light, accent color)
 *  - Audio (auto-play, default reading type)
 *  - AI Sensei (provider, API key, model, persona, test connection)
 *  - Backup & Data (export JSON, import JSON, reset progress)
 */

import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { testConnection } from '../engine/AIManager';
import { useProgress } from '../hooks/useProgress';
import {
  clearAll,
  exportBackup,
  getAISettings,
  getSettings,
  saveAISettings,
  saveSettings,
} from '../storage/StorageManager';
import {
  ACCENTS,
  AccentName,
  spacing,
  useTheme,
} from '../theme/ThemeContext';
import { JLPTLevel } from '../types';
import AccountSection from '../components/AccountSection';

const ACCENT_LABELS: Record<AccentName, string> = {
  indigo: 'Indigo',
  teal:   'Teal',
  rose:   'Rose',
  amber:  'Amber',
};

const AI_PROVIDERS = [
  { value: 'gemini',     label: 'Google Gemini (Free)' },
  { value: 'openai',     label: 'OpenAI' },
  { value: 'claude',     label: 'Anthropic Claude' },
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'ollama',     label: 'Ollama (Local)' },
];

const AI_PERSONAS = [
  { value: 'encouraging', label: 'Warm & Encouraging' },
  { value: 'strict',      label: 'Master Kenji (Strict)' },
  { value: 'mnemonic',    label: 'Mnemonic Magician' },
  { value: 'anime',       label: 'Anime Senpai' },
];

const LEVELS: JLPTLevel[] = ['Hiragana', 'Katakana', 'N5', 'N4', 'N3', 'N2', 'N1', 'all'];

export default function SettingsScreen() {
  const { colors, isDark, accent, toggleDark, setAccent } = useTheme();
  const { progress, setLevel, refresh }                   = useProgress();

  const settings   = getSettings();
  const aiSettings = getAISettings();

  const [autoPlay,      setAutoPlay]      = useState(settings.autoPlay);
  const [defaultAudio,  setDefaultAudio]  = useState(settings.defaultAudio);
  const [apiKey,        setApiKey]        = useState(aiSettings.apiKey);
  const [aiProvider,    setAiProvider]    = useState(aiSettings.provider);
  const [aiModel,       setAiModel]       = useState(aiSettings.model);
  const [aiPersona,     setAiPersona]     = useState(aiSettings.persona);
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [connStatus,    setConnStatus]    = useState<string>('');
  const [testingConn,   setTestingConn]   = useState(false);

  // ── Persist helpers ───────────────────────────────────────────────────────────
  const persistSettings = useCallback(async (patch: Partial<typeof settings>) => {
    await saveSettings(patch);
  }, []);

  const persistAI = useCallback(async (patch: Parameters<typeof saveAISettings>[0]) => {
    await saveAISettings(patch);
  }, []);

  // ── Test AI connection ─────────────────────────────────────────────────────────
  const handleTestConnection = useCallback(async () => {
    setTestingConn(true);
    setConnStatus('');
    // Save current state first so AIManager picks up latest key
    await saveAISettings({ provider: aiProvider, apiKey, model: aiModel, persona: aiPersona });
    const { ok, message } = await testConnection();
    setConnStatus(ok ? `✓ ${message.slice(0, 80)}` : `✗ ${message.slice(0, 80)}`);
    setTestingConn(false);
  }, [aiProvider, apiKey, aiModel, aiPersona]);

  // ── Export backup ─────────────────────────────────────────────────────────────
  const handleExport = useCallback(async () => {
    const backup = await exportBackup();
    const json   = JSON.stringify(backup, null, 2);
    Alert.alert(
      'Backup Ready',
      `Backup contains ${backup.progress.mastered.length} mastered kanji.\n\nIn a full build, this would open the share sheet.`,
      [{ text: 'OK' }],
    );
    console.log('[Backup JSON]', json.slice(0, 200));
  }, []);

  // ── Reset progress ────────────────────────────────────────────────────────────
  const handleReset = useCallback(() => {
    Alert.alert(
      'Reset All Progress',
      'This will erase all mastered kanji, SRS data, and your streak. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset', style: 'destructive',
          onPress: async () => {
            await clearAll();
            refresh();
            Alert.alert('Done', 'Progress has been reset.');
          },
        },
      ],
    );
  }, [refresh]);

  const S = StyleSheet.create({
    root:    { flex: 1 },
    content: { padding: spacing.md, gap: spacing.xs, paddingBottom: 80 },
    // Section headers: iOS grouped style — not ALL_CAPS, not wide tracking
    section: {
      fontSize: 13,
      fontWeight: '400',
      letterSpacing: 0,
      marginTop: spacing.md,
      marginBottom: spacing.xs,
      paddingHorizontal: spacing.xs,
      color: colors.textMuted,
    },
    row: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md,
      borderRadius: 14,
      backgroundColor: colors.surface,
      // No border — shadow only
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 3,
      elevation: 1,
    },
    rowLabel:    { fontSize: 15, fontWeight: '400', letterSpacing: -0.1, color: colors.text, flex: 1 },
    rowValue:    { fontSize: 15, color: colors.textSecondary },
    accentRow:   { flexDirection: 'row', gap: spacing.md },
    accentSwatch: {
      width: 36, height: 36, borderRadius: 18,
      alignItems: 'center', justifyContent: 'center',
    },
    levelGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
    levelChip: {
      borderRadius: 10,
      paddingHorizontal: spacing.sm, paddingVertical: 5,
    },
    levelChipText: { fontSize: 12, fontWeight: '600', letterSpacing: -0.1 },
    inputBox: {
      borderRadius: 14,
      padding: spacing.md,
      backgroundColor: colors.surface,
      gap: spacing.sm,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 3,
      elevation: 1,
    },
    inputLabel: { fontSize: 13, fontWeight: '400', color: colors.textSecondary, letterSpacing: 0 },
    textInput: {
      fontSize: 15, color: colors.text, letterSpacing: -0.1,
      borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
      padding: spacing.sm, backgroundColor: colors.surfaceElevated,
    },
    selectRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
    option: {
      borderRadius: 8,
      paddingHorizontal: spacing.sm, paddingVertical: 5,
    },
    optionText: { fontSize: 13, fontWeight: '500', letterSpacing: -0.1 },
    actionBtn: {
      borderRadius: 14, paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.xs,
      shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3,
      elevation: 1,
    },
    dangerBtn: {
      borderRadius: 14, paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.xs,
      backgroundColor: colors.error + '10',
    },
    connStatus: { fontSize: 12, marginTop: spacing.xs, fontStyle: 'italic' },
  });

  return (
    <SafeAreaView style={[S.root, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={S.content} showsVerticalScrollIndicator={false}>

        {/* ── ACCOUNT & SYNC ── */}
        <Text style={S.section}>Account & Sync</Text>
        <AccountSection />

        {/* ── APPEARANCE ── */}
        <Text style={S.section}>Appearance</Text>


        <View style={S.row}>
          <Text style={S.rowLabel}>Dark Mode</Text>
          <Switch
            value={isDark}
            onValueChange={toggleDark}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor="#FFF"
          />
        </View>

        <View style={[S.inputBox]}>
          <Text style={S.inputLabel}>Accent Color</Text>
          <View style={S.accentRow}>
            {(Object.keys(ACCENTS) as AccentName[]).map(name => (
              <Pressable
                key={name}
                onPress={() => setAccent(name)}
                style={[
                  S.accentSwatch,
                  { backgroundColor: ACCENTS[name].primary },
                  accent === name && { borderWidth: 3, borderColor: '#FFF' },
                ]}
              >
                {accent === name && <Text style={{ color: '#FFF', fontWeight: '800' }}>✓</Text>}
              </Pressable>
            ))}
          </View>
          <Text style={[S.inputLabel, { marginTop: 2 }]}>
            Current: {ACCENT_LABELS[accent]}
          </Text>
        </View>

        {/* ── LEARNING ── */}
        <Text style={S.section}>Learning</Text>

        <View style={S.inputBox}>
          <Text style={S.inputLabel}>Current Level</Text>
          <View style={S.levelGrid}>
            {LEVELS.map(level => {
              const active = progress.currentLevel === level;
              return (
                <Pressable
                  key={level}
                  onPress={() => setLevel(level)}
                  style={[
                    S.levelChip,
                    {
                      backgroundColor: active ? colors.primary + '18' : colors.surfaceElevated,
                    },
                  ]}
                >
                  <Text style={[S.levelChipText, { color: active ? colors.primary : colors.textSecondary }]}>
                    {level === 'all' ? '全 All' : level}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* ── AUDIO ── */}
        <Text style={S.section}>Audio</Text>

        <View style={S.row}>
          <Text style={S.rowLabel}>Auto-play pronunciation</Text>
          <Switch
            value={autoPlay}
            onValueChange={async val => {
              setAutoPlay(val);
              await persistSettings({ autoPlay: val });
            }}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor="#FFF"
          />
        </View>

        <View style={S.inputBox}>
          <Text style={S.inputLabel}>Default Reading Type</Text>
          <View style={S.selectRow}>
            {([
              { value: 'kunyomi', label: '訓読み (kun)' },
              { value: 'onyomi',  label: '音読み (on)' },
              { value: 'first',   label: 'First available' },
            ] as const).map(opt => {
              const active = defaultAudio === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  onPress={async () => {
                    setDefaultAudio(opt.value);
                    await persistSettings({ defaultAudio: opt.value });
                  }}
                  style={[
                    S.option,
                    {
                      backgroundColor: active ? colors.primary + '18' : colors.surfaceElevated,
                    },
                  ]}
                >
                  <Text style={[S.optionText, { color: active ? colors.primary : colors.textSecondary }]}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* ── AI SENSEI ── */}
        <Text style={S.section}>AI Sensei</Text>

        <View style={S.inputBox}>
          <Text style={S.inputLabel}>Provider</Text>
          <View style={S.selectRow}>
            {AI_PROVIDERS.map(p => {
              const active = aiProvider === p.value;
              return (
                <Pressable
                  key={p.value}
                  onPress={async () => {
                    setAiProvider(p.value as typeof aiProvider);
                    await persistAI({ provider: p.value as typeof aiProvider });
                  }}
                  style={[
                    S.option,
                    {
                      backgroundColor: active ? colors.primary + '18' : colors.surfaceElevated,
                    },
                  ]}
                >
                  <Text style={[S.optionText, { color: active ? colors.primary : colors.textSecondary }]}>
                    {p.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={S.inputLabel}>API Key</Text>
          <View style={{ flexDirection: 'row', gap: spacing.xs }}>
            <TextInput
              style={[S.textInput, { flex: 1 }]}
              value={apiKey}
              onChangeText={setApiKey}
              onEndEditing={() => persistAI({ apiKey })}
              placeholder="Enter API key…"
              placeholderTextColor={colors.textMuted}
              secureTextEntry={!apiKeyVisible}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Pressable
              onPress={() => setApiKeyVisible(v => !v)}
              style={[S.option, { backgroundColor: colors.surfaceElevated, justifyContent: 'center' }]}
            >
              <Text style={{ color: colors.textSecondary, fontSize: 16 }}>
                {apiKeyVisible ? '🙈' : '👁'}
              </Text>
            </Pressable>
          </View>
          <Text style={[S.inputLabel, { fontSize: 11, color: colors.textMuted }]}>
            Stored locally only — never uploaded or backed up.
          </Text>

          <Text style={S.inputLabel}>Persona</Text>
          <View style={S.selectRow}>
            {AI_PERSONAS.map(p => {
              const active = aiPersona === p.value;
              return (
                <Pressable
                  key={p.value}
                  onPress={async () => {
                    setAiPersona(p.value as typeof aiPersona);
                    await persistAI({ persona: p.value as typeof aiPersona });
                  }}
                  style={[
                    S.option,
                    {
                      backgroundColor: active ? colors.primary + '18' : colors.surfaceElevated,
                    },
                  ]}
                >
                  <Text style={[S.optionText, { color: active ? colors.primary : colors.textSecondary }]}>
                    {p.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Test connection — no border, just surface */}
          <Pressable
            onPress={handleTestConnection}
            style={[S.actionBtn, { backgroundColor: colors.surfaceElevated }]}
          >
            {testingConn
              ? <ActivityIndicator color={colors.primary} />
              : <Text style={{ color: colors.text, fontWeight: '500', fontSize: 15 }}>Test Connection</Text>
            }
          </Pressable>
          {connStatus !== '' && (
            <Text style={[S.connStatus, { color: connStatus.startsWith('✓') ? colors.success : colors.error }]}>
              {connStatus}
            </Text>
          )}
        </View>

        {/* ── BACKUP & DATA ── */}
        <Text style={S.section}>Backup & Data</Text>

        <Pressable
          onPress={handleExport}
          style={[S.actionBtn, { backgroundColor: colors.primary }]}
        >
          <Text style={{ color: '#FFF', fontWeight: '600', fontSize: 15 }}>Export Backup</Text>
        </Pressable>

        <View style={[S.row, { marginTop: spacing.xs }]}>
          <Text style={S.rowLabel}>Mastered kanji</Text>
          <Text style={S.rowValue}>{progress.mastered.length}</Text>
        </View>
        <View style={S.row}>
          <Text style={S.rowLabel}>Streak</Text>
          <Text style={S.rowValue}>{progress.streak} days 🔥</Text>
        </View>
        <View style={S.row}>
          <Text style={S.rowLabel}>Started learning</Text>
          <Text style={S.rowValue}>
            {new Date(progress.startDate).toLocaleDateString()}
          </Text>
        </View>

        {/* ── DANGER ZONE ── */}
        <Text style={S.section}>Danger Zone</Text>

        <Pressable onPress={handleReset} style={S.dangerBtn}>
          <Text style={{ color: colors.error, fontWeight: '600', fontSize: 15 }}>
            Reset All Progress
          </Text>
        </Pressable>

      </ScrollView>
    </SafeAreaView>
  );
}
