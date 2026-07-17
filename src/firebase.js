import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';

// Firebase web config. For local development the values can stay as the
// "demo-" placeholders below because we connect to the local Firebase
// Emulator Suite (no real cloud project or credentials required).
//
// For production, create a Firebase project, enable Email/Password auth and
// Firestore, then provide the real values through Vite env vars
// (see .env.example). Note: Firebase web API keys are safe to expose in
// client code; security is enforced by Firebase rules, not by hiding the key.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'demo-api-key',
  authDomain:
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ||
    'demo-quant-downloads.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'demo-quant-downloads',
  storageBucket:
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ||
    'demo-quant-downloads.appspot.com',
  messagingSenderId:
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '000000000000',
  appId:
    import.meta.env.VITE_FIREBASE_APP_ID || '1:000000000000:web:demo0000000000',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Connect to the local emulators during development. This is enabled whenever
// Vite runs in dev mode, or explicitly via VITE_USE_EMULATORS=true.
export const USING_EMULATORS =
  import.meta.env.VITE_USE_EMULATORS === 'true' || import.meta.env.DEV;

if (USING_EMULATORS) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  // eslint-disable-next-line no-console
  console.info('[firebase] Connected to local emulators (Auth:9099, Firestore:8080)');
}
