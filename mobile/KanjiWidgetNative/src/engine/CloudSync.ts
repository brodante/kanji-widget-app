/**
 * CloudSync — Firestore progress sync for KanjiWidgets Native.
 *
 * Mirrors the web app's cloud-sync.js behaviour:
 *   - Saves progress as a JSON payload in users/{uid}/sync/progress
 *   - Revision counter prevents out-of-order writes
 *   - First sync asks which copy to keep (conflict resolution)
 *   - Auto-save every 30s while foregrounded and signed in
 *
 * Security rules (already deployed for web app) enforce:
 *   - Owner-only access (request.auth.uid == uid)
 *   - Revision must increment by exactly 1 on update
 *   - Payload size <= 350 KB
 */

import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import { getCurrentUser } from './AuthManager';
import { FIRESTORE_PATHS } from './FirebaseConfig';
import { exportBackup, importBackup, BackupPayload } from '../storage/StorageManager';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CloudProgress {
  version:   1;
  revision:  number;
  payload:   string; // JSON-encoded BackupPayload
  updatedAt: FirebaseFirestoreTypes.Timestamp;
}

export interface ConflictInfo {
  local:  BackupPayload;
  remote: CloudProgress;
}

export type SyncResult =
  | { status: 'saved';     revision: number }
  | { status: 'conflict';  info: ConflictInfo }
  | { status: 'no_remote' }
  | { status: 'error';     message: string }
  | { status: 'unauthenticated' };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function progressRef(uid: string) {
  return firestore().doc(FIRESTORE_PATHS.userProgress(uid));
}

// ─── Save to Firestore ────────────────────────────────────────────────────────

export async function saveToCloud(): Promise<SyncResult> {
  const user = getCurrentUser();
  if (!user) return { status: 'unauthenticated' };

  try {
    const backup  = await exportBackup();
    const payload = JSON.stringify(backup);

    if (payload.length > 350_000) {
      return { status: 'error', message: 'Backup too large (>350 KB). Consider resetting old data.' };
    }

    const ref     = progressRef(user.uid);
    const snap    = await ref.get();

    if (!snap.exists) {
      // First save
      await ref.set({
        version:   1,
        revision:  1,
        payload,
        updatedAt: firestore.FieldValue.serverTimestamp(),
      });
      return { status: 'saved', revision: 1 };
    }

    const remote = snap.data() as CloudProgress;
    await ref.update({
      revision:  remote.revision + 1,
      payload,
      updatedAt: firestore.FieldValue.serverTimestamp(),
    });
    return { status: 'saved', revision: remote.revision + 1 };

  } catch (e) {
    return { status: 'error', message: String(e).slice(0, 200) };
  }
}

// ─── Load from Firestore ──────────────────────────────────────────────────────

export async function loadFromCloud(): Promise<SyncResult> {
  const user = getCurrentUser();
  if (!user) return { status: 'unauthenticated' };

  try {
    const snap = await progressRef(user.uid).get();
    if (!snap.exists) return { status: 'no_remote' };

    const remote  = snap.data() as CloudProgress;
    const local   = await exportBackup();

    // Check for conflict: both have data and local is newer by mastered count
    const remoteBackup: BackupPayload = JSON.parse(remote.payload);
    const localMastered  = local.progress.mastered.length;
    const remoteMastered = remoteBackup.progress.mastered.length;

    if (localMastered > 0 && remoteMastered > 0 && localMastered !== remoteMastered) {
      return { status: 'conflict', info: { local, remote } };
    }

    // No conflict — apply remote
    await importBackup(remoteBackup);
    return { status: 'saved', revision: remote.revision };

  } catch (e) {
    return { status: 'error', message: String(e).slice(0, 200) };
  }
}

// ─── Resolve conflict ─────────────────────────────────────────────────────────

/** Keep local progress (overwrites cloud). */
export async function resolveKeepLocal(): Promise<SyncResult> {
  return saveToCloud();
}

/** Keep remote progress (overwrites local). */
export async function resolveKeepRemote(remote: CloudProgress): Promise<void> {
  const backup: BackupPayload = JSON.parse(remote.payload);
  await importBackup(backup);
}

// ─── Auto-save interval ───────────────────────────────────────────────────────

let _autoSaveInterval: ReturnType<typeof setInterval> | null = null;

export function startAutoSave(intervalMs = 30_000): void {
  if (_autoSaveInterval) return;
  _autoSaveInterval = setInterval(() => {
    if (getCurrentUser()) {
      saveToCloud().catch(e => console.warn('[CloudSync] auto-save error:', e));
    }
  }, intervalMs);
}

export function stopAutoSave(): void {
  if (_autoSaveInterval) {
    clearInterval(_autoSaveInterval);
    _autoSaveInterval = null;
  }
}
