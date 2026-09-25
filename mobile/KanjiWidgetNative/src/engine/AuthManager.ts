/**
 * AuthManager — Firebase Authentication for KanjiWidgets Native.
 *
 * Supports:
 *   - Google Sign-In (via @react-native-google-signin/google-signin)
 *   - Email + password
 *   - Sign out (with optional local data wipe)
 *
 * NOTE: Google Sign-In requires @react-native-google-signin/google-signin
 * and a native build with google-services.json / GoogleService-Info.plist.
 * The module is conditionally required so the JS bundle still loads in
 * environments where the native module isn't linked.
 */

import auth, { FirebaseAuthTypes } from '@react-native-firebase/auth';

export type AuthUser = FirebaseAuthTypes.User;

// ─── Auth state observer ──────────────────────────────────────────────────────

/** Subscribe to auth state changes. Returns an unsubscribe function. */
export function onAuthStateChanged(
  callback: (user: AuthUser | null) => void,
): () => void {
  return auth().onAuthStateChanged(callback);
}

export function getCurrentUser(): AuthUser | null {
  return auth().currentUser;
}

// ─── Email / password ─────────────────────────────────────────────────────────

export async function signInWithEmail(
  email: string,
  password: string,
): Promise<AuthUser> {
  const cred = await auth().signInWithEmailAndPassword(email, password);
  return cred.user;
}

export async function createAccountWithEmail(
  email: string,
  password: string,
): Promise<AuthUser> {
  const cred = await auth().createUserWithEmailAndPassword(email, password);
  return cred.user;
}

export async function sendPasswordReset(email: string): Promise<void> {
  await auth().sendPasswordResetEmail(email);
}

// ─── Google Sign-In ───────────────────────────────────────────────────────────

/**
 * Sign in with Google.
 * Requires @react-native-google-signin/google-signin installed and configured.
 * Returns null if the package isn't available (dev / Jest environment).
 */
export async function signInWithGoogle(): Promise<AuthUser | null> {
  try {
    // Dynamic require so the app doesn't crash if native module isn't linked
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { GoogleSignin } = require('@react-native-google-signin/google-signin');
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const { idToken } = await GoogleSignin.signIn();
    const googleCred  = auth.GoogleAuthProvider.credential(idToken);
    const result      = await auth().signInWithCredential(googleCred);
    return result.user;
  } catch (e) {
    console.warn('[AuthManager] Google Sign-In unavailable:', e);
    return null;
  }
}

// ─── Sign out ─────────────────────────────────────────────────────────────────

export async function signOut(): Promise<void> {
  await auth().signOut();
}
