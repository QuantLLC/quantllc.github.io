import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  updateProfile,
  deleteUser,
  signOut,
  reload,
} from 'firebase/auth';
import {
  doc,
  setDoc,
  updateDoc,
  serverTimestamp,
  increment,
  collection,
  addDoc,
} from 'firebase/firestore';
import { auth, db } from './firebase.js';
import { clearTosSession } from './tos.js';

// Where the verification link should send the user back to after clicking.
const actionCodeSettings = {
  url: window.location.origin + window.location.pathname,
  handleCodeInApp: false,
};

// Create a real account. Callers MUST obtain TOS acceptance BEFORE calling
// this (so we never create Auth/Firestore records for users who decline).
// Passwords are NEVER stored in plain text — Firebase salts + hashes them.
export async function signUp(email, password, tos = {}) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);

  // Store profile (incl. TOS) before verification email so the record is
  // complete, but TOS itself was already agreed pre-signup.
  await createUserProfile(cred.user, {
    tosAccepted: true,
    tosDontShowAgain: !!tos.dontShowAgain,
    tosVersion: tos.version || null,
    tosAcceptedAt: serverTimestamp(),
  });

  // Verification email only after TOS + account creation.
  await sendEmailVerification(cred.user, actionCodeSettings);

  return cred.user;
}

export async function signIn(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function resendVerification() {
  if (!auth.currentUser) throw new Error('No signed-in user.');
  await sendEmailVerification(auth.currentUser, actionCodeSettings);
}

export async function logOut() {
  clearTosSession();
  await signOut(auth);
}

// Re-fetch the user from the server to pick up a freshly-verified email.
export async function refreshUser() {
  if (!auth.currentUser) return null;
  await reload(auth.currentUser);
  return auth.currentUser;
}

// Create the user's profile document on sign-up. `createdAt` is written once
// here and must not be overwritten by later updates.
export async function createUserProfile(user, extra = {}) {
  const ref = doc(db, 'users', user.uid);
  await setDoc(
    ref,
    {
      uid: user.uid,
      email: user.email,
      emailVerified: user.emailVerified,
      downloadCount: 0,
      createdAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
      ...extra,
    },
    { merge: true }
  );
}

// Update mutable profile fields on each sign-in / auth-state change so the
// record (notably emailVerified and lastLoginAt) stays current. Does NOT touch
// createdAt.
export async function touchUserProfile(user) {
  const ref = doc(db, 'users', user.uid);
  await setDoc(
    ref,
    {
      email: user.email,
      emailVerified: user.emailVerified,
      lastLoginAt: serverTimestamp(),
    },
    { merge: true }
  );
}

// Record a download event automatically in Firestore.
export async function recordDownload(user, file) {
  const userRef = doc(db, 'users', user.uid);
  await updateDoc(userRef, {
    downloadCount: increment(1),
    lastDownloadAt: serverTimestamp(),
  });
  await addDoc(collection(db, 'users', user.uid, 'downloads'), {
    fileId: file.id,
    fileName: file.name,
    downloadedAt: serverTimestamp(),
  });
}

// Update the account's display name (Auth profile + Firestore mirror).
export async function updateDisplayName(name) {
  if (!auth.currentUser) throw new Error('No signed-in user.');
  await updateProfile(auth.currentUser, { displayName: name });
  await setDoc(doc(db, 'users', auth.currentUser.uid), { displayName: name }, { merge: true });
}

// Send a password-reset email so the user can change their password securely.
export async function changePassword(email) {
  await sendPasswordResetEmail(auth, email);
}

// Persist a partial settings object under the user's profile.
export async function saveUserSettings(user, partial) {
  await setDoc(doc(db, 'users', user.uid), { settings: partial }, { merge: true });
}

// Permanently delete the signed-in account. May throw auth/requires-recent-login.
export async function deleteAccount() {
  if (!auth.currentUser) throw new Error('No signed-in user.');
  await deleteUser(auth.currentUser);
}

// Map Firebase error codes to friendly messages.
export function friendlyError(err) {
  const code = err && err.code ? err.code : '';
  const map = {
    'auth/email-already-in-use': 'That email is already registered. Try signing in.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/weak-password': 'Password should be at least 6 characters.',
    'auth/missing-password': 'Please enter a password.',
    'auth/invalid-credential': 'Incorrect email or password.',
    'auth/user-not-found': 'No account found for that email.',
    'auth/wrong-password': 'Incorrect email or password.',
    'auth/too-many-requests': 'Too many attempts. Please wait and try again.',
    'auth/requires-recent-login': 'For security, please sign out and back in, then try again.',
    'auth/missing-email': 'Please enter a valid email address.',
  };
  return map[code] || (err && err.message) || 'Something went wrong.';
}
