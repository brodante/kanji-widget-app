/**
 * useAuth — subscribes to Firebase auth state and exposes sign-in/out actions.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  AuthUser,
  createAccountWithEmail,
  getCurrentUser,
  onAuthStateChanged,
  sendPasswordReset,
  signInWithEmail,
  signInWithGoogle,
  signOut,
} from '../engine/AuthManager';
import {
  loadFromCloud,
  resolveKeepLocal,
  resolveKeepRemote,
  saveToCloud,
  startAutoSave,
  stopAutoSave,
  ConflictInfo,
} from '../engine/CloudSync';
import { clearAll } from '../storage/StorageManager';

export interface UseAuthReturn {
  user:         AuthUser | null;
  isLoading:    boolean;
  conflict:     ConflictInfo | null;
  cloudStatus:  string;
  // Actions
  googleSignIn:       () => Promise<void>;
  emailSignIn:        (email: string, password: string) => Promise<void>;
  emailCreate:        (email: string, password: string) => Promise<void>;
  passwordReset:      (email: string) => Promise<void>;
  signOutUser:        (wipeLocalData?: boolean) => Promise<void>;
  saveProgress:       () => Promise<void>;
  loadProgress:       () => Promise<void>;
  resolveConflictLocal:  () => Promise<void>;
  resolveConflictRemote: () => Promise<void>;
}

export function useAuth(): UseAuthReturn {
  const [user,        setUser]        = useState<AuthUser | null>(getCurrentUser());
  const [isLoading,   setIsLoading]   = useState(true);
  const [conflict,    setConflict]    = useState<ConflictInfo | null>(null);
  const [cloudStatus, setCloudStatus] = useState('');

  // Subscribe to auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(u => {
      setUser(u);
      setIsLoading(false);
      if (u) {
        startAutoSave();
        setCloudStatus('Signed in as ' + (u.displayName ?? u.email ?? u.uid.slice(0, 8)));
      } else {
        stopAutoSave();
        setCloudStatus('');
      }
    });
    return () => { unsub(); stopAutoSave(); };
  }, []);

  // ── Sign-in actions ──────────────────────────────────────────────────────────
  const googleSignIn = useCallback(async () => {
    setIsLoading(true);
    try {
      await signInWithGoogle();
    } catch (e) {
      setCloudStatus('Sign-in failed: ' + String(e).slice(0, 80));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const emailSignIn = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    try {
      await signInWithEmail(email, password);
    } catch (e) {
      setCloudStatus('Sign-in failed: ' + String(e).slice(0, 80));
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const emailCreate = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    try {
      await createAccountWithEmail(email, password);
    } catch (e) {
      setCloudStatus('Account creation failed: ' + String(e).slice(0, 80));
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const passwordReset = useCallback(async (email: string) => {
    await sendPasswordReset(email);
    setCloudStatus('Password reset email sent to ' + email);
  }, []);

  const signOutUser = useCallback(async (wipeLocalData = false) => {
    stopAutoSave();
    if (wipeLocalData) await clearAll();
    await signOut();
  }, []);

  // ── Cloud sync actions ────────────────────────────────────────────────────────
  const saveProgress = useCallback(async () => {
    setCloudStatus('Saving…');
    const result = await saveToCloud();
    if (result.status === 'saved')           setCloudStatus(`Saved (rev ${result.revision})`);
    else if (result.status === 'error')      setCloudStatus('Save error: ' + result.message);
    else if (result.status === 'unauthenticated') setCloudStatus('Sign in to save progress.');
  }, []);

  const loadProgress = useCallback(async () => {
    setCloudStatus('Checking cloud…');
    const result = await loadFromCloud();
    if (result.status === 'saved')    setCloudStatus('Progress restored from cloud.');
    else if (result.status === 'no_remote') setCloudStatus('No cloud save found.');
    else if (result.status === 'conflict')  { setConflict(result.info); setCloudStatus('Conflict: choose which progress to keep.'); }
    else if (result.status === 'error')     setCloudStatus('Load error: ' + result.message);
  }, []);

  const resolveConflictLocal = useCallback(async () => {
    setConflict(null);
    const result = await resolveKeepLocal();
    setCloudStatus(result.status === 'saved' ? 'Local progress saved to cloud.' : 'Error: ' + (result as {message?: string}).message);
  }, []);

  const resolveConflictRemote = useCallback(async () => {
    if (!conflict) return;
    await resolveKeepRemote(conflict.remote);
    setConflict(null);
    setCloudStatus('Cloud progress restored to this device.');
  }, [conflict]);

  return {
    user, isLoading, conflict, cloudStatus,
    googleSignIn, emailSignIn, emailCreate, passwordReset, signOutUser,
    saveProgress, loadProgress, resolveConflictLocal, resolveConflictRemote,
  };
}
