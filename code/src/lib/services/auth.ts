import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from "firebase/auth";
import { auth, googleProvider } from "@/lib/firebase";

/**
 * All Firebase Auth access goes through this module rather than being called
 * from components directly, so the surface that would have to change if the
 * identity provider ever changes is small and enumerable.
 */

export type { User };

export async function signUpWithEmail(
  email: string,
  password: string,
  displayName?: string,
): Promise<User> {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  if (displayName) {
    await updateProfile(credential.user, { displayName });
  }
  return credential.user;
}

export async function signInWithEmail(
  email: string,
  password: string,
): Promise<User> {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

export async function signInWithGoogle(): Promise<User> {
  const credential = await signInWithPopup(auth, googleProvider);
  return credential.user;
}

export function signOutUser(): Promise<void> {
  return signOut(auth);
}

/** Subscribe to auth-state changes. Returns the unsubscribe function. */
export function onUserChanged(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, callback);
}

/**
 * Turn a Firebase Auth error code into a message fit for showing a user.
 * Unknown codes fall through to a generic string.
 */
export function authErrorMessage(error: unknown): string {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code)
      : "";
  switch (code) {
    case "auth/invalid-email":
      return "That email address doesn't look right.";
    case "auth/email-already-in-use":
      return "An account already exists for that email.";
    case "auth/weak-password":
      return "Password should be at least 6 characters.";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Email or password is incorrect.";
    case "auth/popup-closed-by-user":
      return "The Google sign-in window was closed before finishing.";
    case "auth/too-many-requests":
      return "Too many attempts. Try again in a few minutes.";
    case "auth/operation-not-allowed":
      return "This sign-in method is disabled. Enable it in the Firebase console under Authentication → Sign-in method.";
    case "auth/api-key-not-valid":
    case "auth/invalid-api-key":
      return "Firebase is misconfigured (invalid API key). Check .env.local.";
    case "auth/network-request-failed":
      return "Network error reaching Firebase. Check your connection.";
    default:
      // Surface the raw code in development so misconfiguration is diagnosable.
      return process.env.NODE_ENV === "development" && code
        ? `Something went wrong (${code}).`
        : "Something went wrong. Please try again.";
  }
}
