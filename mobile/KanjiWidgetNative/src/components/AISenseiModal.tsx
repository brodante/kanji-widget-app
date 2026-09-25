// @ts-nocheck
/**
 * AISenseiModal — bottom sheet with 3 tabs:
 *   1. Diagnostics  — local SRS stats + AI commentary
 *   2. Study Path   — priority deck from due cards
 *   3. Ask Sensei   — free-form chat
 *
 * Opened by the AIFab floating button.
 */

import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { askSensei } from '../engine/AIManager';
import { getCharacter } from '../engine/KanjiData';
import {
  generateDiagnostics,
  getDueCards,
  getRetentionStats,
} from '../engine/SRSEngine';
import { useProgress } from '../hooks/useProgress';
import { getProgress, getSRSData } from '../storage/StorageManager';
import { spacing, useTheme } from '../theme/ThemeContext';

const SNAP_POINTS = ['50%', '90%'];

type Tab = 'diagnostics' | 'study' | 'chat';

interface ChatMessage {
  role: 'user' | 'sensei';
  text: string;
}

interface Props {
  sheetRef: React.RefObject<BottomSheet>;
}

export default function AISenseiModal({ sheetRef }: Props) {
  const { colors }            = useTheme();
  const { progress }          = useProgress();
  const [tab, setTab]         = useState<Tab>('diagnostics');
  const [loading, setLoading] = useState(false);
  const [aiText,  setAiText]  = useState('');
  const [chat,    setChat]    = useState<ChatMessage[]>([
    { role: 'sensei', text: 'こんにちは！ I am your AI Sensei. Ask me anything about kanji, readings, or Japanese grammar!' },
  ]);
  const [input,   setInput]   = useState('');

  const srsData  = getSRSData();
  const stats    = getRetentionStats(srsData, progress.currentLevel);
  const due      = getDueCards(srsData, progress.currentLevel);

  // ── Diagnostics ──────────────────────────────────────────────────────────────
  const runDiagnostics = useCallback(async () => {
    setLoading(true);
    setAiText('');
    const prog    = getProgress();
    const entries = due.map(c => ({ character: c.character }));
    const report  = generateDiagnostics(srsData, prog, entries);

    const prompt = `Here is my study data:
- Retention: ${report.retentionRate}%
- Reviews due: ${report.dueCount}
- Mature cards: ${report.matureCount}
- Weak cards: ${report.weakCards.map(w => w.character).join(', ') || 'none'}

Give me a brief, personalised 2-3 sentence study analysis.`;

    const text = await askSensei({ userMessage: prompt, promptType: 'diagnostics', useCache: false });
    setAiText(text);
    setLoading(false);
  }, [srsData, due]);

  // ── Chat ──────────────────────────────────────────────────────────────────────
  const sendMessage = useCallback(async () => {
    if (!input.trim()) return;
    const userMsg = input.trim();
    setInput('');
    setChat(prev => [...prev, { role: 'user', text: userMsg }]);

    const reply = await askSensei({ userMessage: userMsg, useCache: false });
    setChat(prev => [...prev, { role: 'sensei', text: reply }]);
  }, [input]);

  const quickPrompts = [
    { label: 'Radical Breakdown', prompt: 'Explain the radicals and stroke anatomy of a common N5 kanji.' },
    { label: 'Visual Mnemonic',   prompt: 'Create a vivid visual mnemonic story for the kanji 日.' },
    { label: 'Example Sentences', prompt: 'Give 2 natural example sentences using the kanji 水 at N5 level.' },
    { label: 'Common Pitfalls',   prompt: 'What are common mistakes learners make with kanji readings?' },
  ];

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={SNAP_POINTS}
      enablePanDownToClose
      backgroundStyle={{ backgroundColor: colors.surface }}
      handleIndicatorStyle={{ backgroundColor: colors.border, width: 36, height: 4 }}
    >
      <BottomSheetScrollView contentContainerStyle={[styles.content, { backgroundColor: colors.surface }]}>
        {/* Title */}
        <View style={styles.titleRow}>
          <View style={[styles.titleIconPill, { backgroundColor: colors.primary + '18' }]}>
            <Text style={[styles.titleIconText, { color: colors.primary }]}>師</Text>
          </View>
          <View>
            <Text style={[styles.title, { color: colors.text }]}>AI Sensei</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Interactive Japanese tutor & diagnostics
            </Text>
          </View>
        </View>

        {/* Segmented Control Tabs */}
        <View style={[styles.segmentedControl, { backgroundColor: colors.surfaceElevated }]}>
          {(['diagnostics', 'study', 'chat'] as Tab[]).map(t => (
            <Pressable
              key={t}
              onPress={() => setTab(t)}
              style={[
                styles.segment,
                tab === t && [styles.segmentActive, { backgroundColor: colors.surface }],
              ]}
            >
              <Text style={[
                styles.segmentText,
                { color: tab === t ? colors.text : colors.textMuted },
                tab === t && { fontWeight: '600', color: colors.primary },
              ]}>
                {t === 'diagnostics' ? 'Diagnostics' : t === 'study' ? 'Study Path' : 'Ask Sensei'}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* ── DIAGNOSTICS TAB ── */}
        {tab === 'diagnostics' && (
          <View style={styles.tabContent}>
            {/* Stats grid */}
            <View style={styles.statsGrid}>
              {[
                { label: 'Retention',  value: `${stats.retentionRate}%`, color: colors.primary },
                { label: 'Due',        value: String(stats.dueCount),    color: stats.dueCount > 0 ? colors.warning : colors.success },
                { label: 'Mature',     value: String(stats.mature),      color: colors.success },
                { label: 'Weak Cards', value: String(stats.learning),    color: colors.error },
              ].map(s => (
                <View key={s.label} style={[styles.statCard, { backgroundColor: colors.surfaceElevated }]}>
                  <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
                  <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{s.label}</Text>
                </View>
              ))}
            </View>

            {/* AI commentary */}
            <View style={[styles.commentaryBox, { backgroundColor: colors.surfaceElevated }]}>
              {loading ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator color={colors.primary} size="small" />
                  <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Sensei is analysing…</Text>
                </View>
              ) : aiText ? (
                <Text style={[styles.aiText, { color: colors.text }]}>{aiText}</Text>
              ) : (
                <Text style={[styles.placeholder, { color: colors.textMuted }]}>
                  Tap below for a personalised study breakdown.
                </Text>
              )}
            </View>

            <Pressable
              onPress={runDiagnostics}
              style={({ pressed }) => [
                styles.actionBtn,
                { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <Text style={styles.actionBtnText}>Analyze Study Data</Text>
            </Pressable>
          </View>
        )}

        {/* ── STUDY PATH TAB ── */}
        {tab === 'study' && (
          <View style={styles.tabContent}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Today's Priority Deck
            </Text>
            <Text style={[styles.sectionSub, { color: colors.textSecondary }]}>
              {due.length} cards due · sorted by most overdue
            </Text>
            {due.slice(0, 10).map(card => {
              const entry = getCharacter(card.character);
              return (
                <View key={card.character} style={[styles.deckRow, { backgroundColor: colors.surfaceElevated }]}>
                  <Text style={[styles.deckChar, { color: colors.primary }]}>{card.character}</Text>
                  <View style={styles.deckInfo}>
                    <Text style={[styles.deckMeaning, { color: colors.text }]} numberOfLines={1}>
                      {entry?.meanings[0] ?? '—'}
                    </Text>
                    <Text style={[styles.deckMeta, { color: colors.textMuted }]}>
                      Lapses: {card.lapses}  ·  Interval: {card.interval}d
                    </Text>
                  </View>
                </View>
              );
            })}
            {due.length === 0 && (
              <Text style={[styles.placeholder, { color: colors.textMuted }]}>
                No cards due right now. You are fully caught up!
              </Text>
            )}
          </View>
        )}

        {/* ── CHAT TAB ── */}
        {tab === 'chat' && (
          <View style={styles.tabContent}>
            {/* Quick prompts */}
            <View style={styles.quickRow}>
              {quickPrompts.map(qp => (
                <Pressable
                  key={qp.label}
                  onPress={() => {
                    setInput(qp.prompt);
                  }}
                  style={({ pressed }) => [
                    styles.quickBtn,
                    { backgroundColor: colors.surfaceElevated, opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  <Text style={[styles.quickBtnText, { color: colors.text }]} numberOfLines={1}>
                    {qp.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Chat log */}
            <View style={styles.chatLog}>
              {chat.map((msg, i) => (
                <View
                  key={i}
                  style={[
                    styles.chatBubble,
                    msg.role === 'user'
                      ? [styles.userBubble, { backgroundColor: colors.primary }]
                      : [styles.senseibubble, { backgroundColor: colors.surfaceElevated }],
                  ]}
                >
                  <Text style={[
                    styles.chatText,
                    { color: msg.role === 'user' ? '#FFF' : colors.text },
                  ]}>
                    {msg.text}
                  </Text>
                </View>
              ))}
            </View>

            {/* Input */}
            <View style={[styles.inputRow, { backgroundColor: colors.surfaceElevated }]}>
              <TextInput
                style={[styles.chatInput, { color: colors.text }]}
                placeholder="Ask Sensei anything…"
                placeholderTextColor={colors.textMuted}
                value={input}
                onChangeText={setInput}
                multiline
                returnKeyType="send"
                onSubmitEditing={sendMessage}
              />
              <Pressable
                onPress={sendMessage}
                style={({ pressed }) => [
                  styles.sendBtn,
                  { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
                ]}
              >
                <Text style={styles.sendBtnText}>↑</Text>
              </Pressable>
            </View>
          </View>
        )}
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  titleIconPill: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  titleIconText: { fontSize: 20, fontWeight: '700' },
  title:    { fontSize: 19, fontWeight: '700', letterSpacing: -0.4 },
  subtitle: { fontSize: 12, letterSpacing: -0.1 },

  segmentedControl: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 3,
  },
  segment: {
    flex: 1, paddingVertical: 7, alignItems: 'center',
    borderRadius: 8,
  },
  segmentActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  segmentText: { fontSize: 13, fontWeight: '500', letterSpacing: -0.1 },

  tabContent: { gap: spacing.sm, paddingTop: spacing.xs },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  statCard: {
    width: '48%', borderRadius: 14,
    padding: spacing.sm, alignItems: 'center', gap: 2,
  },
  statValue: { fontSize: 22, fontWeight: '700', letterSpacing: -0.3 },
  statLabel: { fontSize: 11, letterSpacing: 0 },

  commentaryBox: {
    borderRadius: 14,
    padding: spacing.md, minHeight: 70, justifyContent: 'center',
  },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, justifyContent: 'center' },
  loadingText: { fontSize: 13, letterSpacing: -0.1 },
  aiText:      { fontSize: 14, lineHeight: 21, letterSpacing: 0 },
  placeholder: { fontSize: 13, textAlign: 'center', paddingVertical: spacing.xs, letterSpacing: 0 },

  actionBtn: {
    borderRadius: 14, paddingVertical: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 1,
  },
  actionBtnText: { color: '#FFF', fontSize: 15, fontWeight: '600', letterSpacing: -0.2 },

  sectionTitle: { fontSize: 16, fontWeight: '700', letterSpacing: -0.2 },
  sectionSub:   { fontSize: 12, letterSpacing: 0 },

  deckRow: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 14,
    padding: spacing.sm, gap: spacing.sm,
  },
  deckChar:    { fontSize: 28, fontWeight: '500', width: 36, textAlign: 'center' },
  deckInfo:    { flex: 1 },
  deckMeaning: { fontSize: 14, fontWeight: '500', letterSpacing: -0.1 },
  deckMeta:    { fontSize: 11, marginTop: 1, letterSpacing: 0 },

  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  quickBtn: {
    borderRadius: 10,
    paddingHorizontal: spacing.sm, paddingVertical: 8,
    width: '48%',
  },
  quickBtnText: { fontSize: 12, fontWeight: '500', textAlign: 'center', letterSpacing: -0.1 },

  chatLog:  { gap: spacing.sm, marginVertical: spacing.xs },
  chatBubble: {
    maxWidth: '85%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10,
  },
  userBubble:   { alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  senseibubble: { alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  chatText:     { fontSize: 14, lineHeight: 20, letterSpacing: -0.1 },

  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 22,
    paddingHorizontal: 12, paddingVertical: 4, gap: spacing.xs,
  },
  chatInput: { flex: 1, fontSize: 14, maxHeight: 100, paddingVertical: 6, letterSpacing: -0.1 },
  sendBtn:   { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  sendBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700', lineHeight: 18 },
});
