// @ts-nocheck
/**
 * AccountSection — Firebase auth + cloud sync UI, embedded in SettingsScreen.
 *
 * States:
 *   - Guest:      show sign-in options
 *   - Signed in:  show profile + cloud sync controls
 *   - Conflict:   show side-by-side comparison and choice buttons
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuth } from '../hooks/useAuth';
import { spacing, useTheme } from '../theme/ThemeContext';

export default function AccountSection() {
  const { colors }   = useTheme();
  const {
    user, isLoading, conflict, cloudStatus,
    googleSignIn, emailSignIn, emailCreate, passwordReset,
    signOutUser, saveProgress, loadProgress,
    resolveConflictLocal, resolveConflictRemote,
  } = useAuth();

  const [tab,      setTab]      = useState<'signin'|'create'>('signin');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [wipe,     setWipe]     = useState(false);
  const [busy,     setBusy]     = useState(false);
  const [error,    setError]    = useState('');

  const handleEmailAction = async () => {
    if (!email || !password) { setError('Email and password required.'); return; }
    setBusy(true); setError('');
    try {
      if (tab === 'signin') await emailSignIn(email, password);
      else                  await emailCreate(email, password);
      setEmail(''); setPassword('');
    } catch (e: unknown) {
      setError(String((e as Error).message ?? e).slice(0, 120));
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert(
      'Sign out',
      wipe
        ? 'This will sign you out and erase local study data. Progress saved in the cloud is kept.'
        : 'You will be signed out. Local progress stays on this device.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign out', style: 'destructive', onPress: () => signOutUser(wipe) },
      ],
    );
  };

  const S = {
    section: [styles.sectionBox, { backgroundColor: colors.surface, borderColor: colors.border }],
    label:   [styles.label, { color: colors.textSecondary }],
    input:   [styles.input, { color: colors.text, backgroundColor: colors.surfaceElevated, borderColor: colors.border }],
    btn:     (primary: boolean) => [
      styles.btn,
      { backgroundColor: primary ? colors.primary : colors.surfaceElevated,
        borderColor:      primary ? colors.primary : colors.border },
    ],
    btnText: (primary: boolean) => [styles.btnText, { color: primary ? '#FFF' : colors.text }],
  };

  if (isLoading) {
    return (
      <View style={[S.section, { alignItems: 'center', padding: spacing.lg }]}>
        <ActivityIndicator color={colors.primary} />
        <Text style={[styles.status, { color: colors.textMuted }]}>Checking sign-in…</Text>
      </View>
    );
  }

  // ── CONFLICT RESOLUTION ────────────────────────────────────────────────────
  if (conflict) {
    const localCount  = conflict.local.progress.mastered.length;
    const remoteDoc   = JSON.parse(conflict.remote.payload);
    const remoteCount = remoteDoc?.progress?.mastered?.length ?? 0;
    return (
      <View style={[styles.sectionBox, { backgroundColor: colors.surface }]}>
        <Text style={[styles.heading, { color: colors.text }]}>Sync Conflict</Text>
        <Text style={[styles.status, { color: colors.textSecondary }]}>
          Both this device and the cloud have progress. Choose which to keep.
        </Text>
        <View style={styles.conflictGrid}>
          <View style={[styles.conflictCard, { backgroundColor: colors.surfaceElevated }]}>
            <Text style={[styles.conflictTitle, { color: colors.text }]}>This Device</Text>
            <Text style={[styles.conflictStat, { color: colors.primary }]}>{localCount}</Text>
            <Text style={[styles.conflictLabel, { color: colors.textSecondary }]}>mastered</Text>
          </View>
          <View style={[styles.conflictCard, { backgroundColor: colors.surfaceElevated }]}>
            <Text style={[styles.conflictTitle, { color: colors.text }]}>Cloud Copy</Text>
            <Text style={[styles.conflictStat, { color: colors.primary }]}>{remoteCount}</Text>
            <Text style={[styles.conflictLabel, { color: colors.textSecondary }]}>mastered</Text>
          </View>
        </View>
        <Text style={[styles.hint, { color: colors.textMuted }]}>
          A local recovery snapshot is saved before any data is replaced.
        </Text>
        <Pressable
          onPress={resolveConflictLocal}
          style={({ pressed }) => [styles.btn, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
        >
          <Text style={[styles.btnText, { color: '#FFF' }]}>Keep This Device's Progress</Text>
        </Pressable>
        <Pressable
          onPress={resolveConflictRemote}
          style={({ pressed }) => [styles.btn, { backgroundColor: colors.surfaceElevated, opacity: pressed ? 0.7 : 1 }]}
        >
          <Text style={[styles.btnText, { color: colors.text }]}>Use Cloud Progress</Text>
        </Pressable>
      </View>
    );
  }

  // ── SIGNED IN ──────────────────────────────────────────────────────────────
  if (user) {
    return (
      <View style={[styles.sectionBox, { backgroundColor: colors.surface }]}>
        <View style={styles.profileRow}>
          <View style={[styles.avatarPill, { backgroundColor: colors.primary + '18' }]}>
            <Text style={[styles.avatarText, { color: colors.primary }]}>
              {(user.displayName ?? user.email ?? 'U').charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.heading, { color: colors.text }]} numberOfLines={1}>
              {user.displayName ?? 'Account'}
            </Text>
            <Text style={[styles.status, { color: colors.textSecondary }]} numberOfLines={1}>
              {user.email ?? user.uid.slice(0, 12)}
            </Text>
          </View>
        </View>

        {cloudStatus !== '' && (
          <Text style={[styles.status, { color: colors.primary, fontWeight: '500' }]}>{cloudStatus}</Text>
        )}

        <View style={styles.syncRow}>
          <Pressable
            onPress={saveProgress}
            style={({ pressed }) => [styles.btn, { flex: 1, backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
          >
            <Text style={[styles.btnText, { color: '#FFF' }]}>Save to Cloud</Text>
          </Pressable>
          <Pressable
            onPress={loadProgress}
            style={({ pressed }) => [styles.btn, { flex: 1, backgroundColor: colors.surfaceElevated, opacity: pressed ? 0.7 : 1 }]}
          >
            <Text style={[styles.btnText, { color: colors.text }]}>Load Cloud Copy</Text>
          </Pressable>
        </View>

        <View style={styles.wipeRow}>
          <Text style={[styles.label, { color: colors.textSecondary, flex: 1 }]}>
            Shared device: clear local data on sign-out
          </Text>
          <Switch
            value={wipe}
            onValueChange={setWipe}
            trackColor={{ false: colors.border, true: colors.error }}
            thumbColor="#FFF"
          />
        </View>

        <Pressable
          onPress={handleSignOut}
          style={({ pressed }) => [
            styles.btn,
            { backgroundColor: colors.surfaceElevated, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Text style={[styles.btnText, { color: colors.error }]}>Sign Out</Text>
        </Pressable>
      </View>
    );
  }

  // ── GUEST / SIGN-IN FORM ───────────────────────────────────────────────────
  return (
    <View style={[styles.sectionBox, { backgroundColor: colors.surface }]}>
      <Text style={[styles.heading, { color: colors.text }]}>Cloud Account</Text>
      <Text style={[styles.hint, { color: colors.textSecondary }]}>
        Sign in to sync your kanji progress across your devices.
      </Text>

      {/* Segmented Control */}
      <View style={[styles.segmentedControl, { backgroundColor: colors.surfaceElevated }]}>
        {(['signin', 'create'] as const).map(t => (
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
              {t === 'signin' ? 'Sign In' : 'Create Account'}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={S.label}>Email</Text>
      <TextInput
        style={[styles.input, { color: colors.text, backgroundColor: colors.surfaceElevated }]}
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        placeholderTextColor={colors.textMuted}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
      />

      <Text style={S.label}>Password</Text>
      <TextInput
        style={[styles.input, { color: colors.text, backgroundColor: colors.surfaceElevated }]}
        value={password}
        onChangeText={setPassword}
        placeholder="••••••••"
        placeholderTextColor={colors.textMuted}
        secureTextEntry
      />

      {error !== '' && (
        <Text style={[styles.error, { color: colors.error }]}>{error}</Text>
      )}

      <Pressable
        onPress={handleEmailAction}
        style={({ pressed }) => [
          styles.btn,
          { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
        ]}
        disabled={busy}
      >
        {busy
          ? <ActivityIndicator color="#FFF" size="small" />
          : <Text style={[styles.btnText, { color: '#FFF' }]}>
              {tab === 'signin' ? 'Sign In' : 'Create Account'}
            </Text>
        }
      </Pressable>

      {tab === 'signin' && (
        <Pressable
          onPress={() => email && passwordReset(email)}
          style={{ alignSelf: 'center', marginTop: spacing.xs }}
        >
          <Text style={[styles.hint, { color: colors.primary }]}>Forgot password?</Text>
        </Pressable>
      )}

      {/* Google sign-in */}
      <View style={styles.dividerRow}>
        <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
        <Text style={[styles.dividerText, { color: colors.textMuted }]}>or</Text>
        <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
      </View>

      <Pressable
        onPress={googleSignIn}
        style={({ pressed }) => [
          styles.btn,
          { backgroundColor: colors.surfaceElevated, opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <Text style={[styles.btnText, { color: colors.text }]}>Continue with Google</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionBox: {
    borderRadius: 18,
    padding: spacing.md, gap: spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  heading: { fontSize: 16, fontWeight: '700', letterSpacing: -0.3 },
  status:  { fontSize: 13, letterSpacing: -0.1 },
  hint:    { fontSize: 12, lineHeight: 17, letterSpacing: 0 },
  error:   { fontSize: 13, letterSpacing: -0.1 },
  label:   { fontSize: 13, fontWeight: '500', letterSpacing: -0.1 },
  input: {
    fontSize: 15, borderRadius: 12,
    paddingHorizontal: spacing.md, paddingVertical: 12,
    letterSpacing: -0.1,
  },
  btn: {
    borderRadius: 14,
    paddingVertical: 12, alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  btnText: { fontSize: 15, fontWeight: '600', letterSpacing: -0.2 },

  segmentedControl: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 3,
    marginVertical: spacing.xs,
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

  profileRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatarPill: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText:   { fontSize: 18, fontWeight: '700' },
  syncRow:      { flexDirection: 'row', gap: spacing.sm },
  wipeRow:      { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginVertical: spacing.xs },
  conflictGrid: { flexDirection: 'row', gap: spacing.sm },
  conflictCard: {
    flex: 1, borderRadius: 14,
    padding: spacing.md, alignItems: 'center', gap: 2,
  },
  conflictTitle: { fontSize: 12, fontWeight: '600', letterSpacing: -0.1 },
  conflictStat:  { fontSize: 26, fontWeight: '700', letterSpacing: -0.4 },
  conflictLabel: { fontSize: 11, letterSpacing: 0 },
  dividerRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginVertical: spacing.xs,
  },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth },
  dividerText: { fontSize: 12, letterSpacing: 0 },
});
