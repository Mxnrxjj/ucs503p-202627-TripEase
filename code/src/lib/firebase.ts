import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  connectAuthEmulator,
  GoogleAuthProvider,
} from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";

// `NEXT_PUBLIC_*` values are inlined at build time. When they are absent (for
// example `next build` in CI with no secrets, or a forgotten `.env.local`), the
// Firebase SDKs throw at module-evaluation time — which breaks prerendering.
// Fall back to a syntactically valid placeholder so the module still loads; the
// loud warning below makes a misconfigured deploy obvious rather than silent.
const PLACEHOLDER_API_KEY = "AIzaSyMISSING-CONFIG-see-env-example-00000";

const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

if (typeof window !== "undefined" && !apiKey) {
  console.error(
    "[TripEase] Firebase env vars are not set. Copy .env.example to .env.local " +
      "and fill in the web app config from the Firebase console.",
  );
}

const config = {
  apiKey: apiKey || PLACEHOLDER_API_KEY,
  authDomain:
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ||
    (projectId ? `${projectId}.firebaseapp.com` : "missing.firebaseapp.com"),
  projectId: projectId || "missing-project",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// getApps() guard: Next.js re-executes modules on hot reload, and
// initializeApp throws if called twice for the same app name.
const isFirstInit = getApps().length === 0;
const app = isFirstInit ? initializeApp(config) : getApp();

export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

// Only wire the emulators on the very first initialisation; calling the
// connect helpers twice (which hot reload would do) throws.
if (isFirstInit && process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "true") {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8085);
}

export default app;
