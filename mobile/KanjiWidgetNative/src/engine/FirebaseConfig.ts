/**
 * Firebase configuration for KanjiWidgets Native.
 *
 * Uses the same project as the web app (kanji-widgets).
 * @react-native-firebase reads google-services.json (Android) and
 * GoogleService-Info.plist (iOS) at build time — these files must be
 * added before running a native build. This module just exports the
 * project ID for reference and Firestore path constants.
 */

export const FIREBASE_PROJECT_ID = 'kanji-widgets';

// Firestore document paths
export const FIRESTORE_PATHS = {
  userProgress: (uid: string) => `users/${uid}/sync/progress`,
  userRecord:   (uid: string) => `users/${uid}`,
} as const;

// Firestore progress document schema (version 1, matches web app)
export interface FirestoreProgressDoc {
  version:   1;
  revision:  number;
  payload:   string; // JSON-encoded BackupPayload
  updatedAt: { toDate(): Date };  // Firestore Timestamp
}
