import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase.js';
import { saveUserSettings, updateDisplayName } from './auth.js';

// ---------------------------------------------------------------------------
// Settings storage.
// - "Device" settings (theme, motion) live in localStorage only.
// - "Account" settings live in Firestore (users/{uid}.settings) when signed in,
//   mirrored to localStorage so they survive reloads and work while signed out.
// ---------------------------------------------------------------------------
const DEVICE_KEY = 'quant.device';
const ACCOUNT_KEY = 'quant.account';

export const DEFAULTS = {
  // device
  theme: 'dark', // 'system' | 'light' | 'dark'
  reduceMotion: false,
  // account
  currency: 'GBP', // 'GBP' | 'USD' | 'EUR'
  emailUpdates: true,
  riskProfile: 'balanced', // 'conservative' | 'balanced' | 'aggressive'
  autoInvest: true,
  displayName: '',
};

const DEVICE_KEYS = ['theme', 'reduceMotion'];
const ACCOUNT_KEYS = ['currency', 'emailUpdates', 'riskProfile', 'autoInvest', 'displayName'];

const CURRENCY_SYMBOLS = { GBP: '£', USD: '$', EUR: '€' };

let state = { ...DEFAULTS };
let mql = null;

function readLS(key) {
  try { return JSON.parse(localStorage.getItem(key)) || {}; } catch { return {}; }
}
function writeLS(key, obj) {
  try { localStorage.setItem(key, JSON.stringify(obj)); } catch { /* ignore */ }
}

export function getSettings() { return { ...state }; }
export function currencySymbol() { return CURRENCY_SYMBOLS[state.currency] || '£'; }

export function formatMoney(n) {
  const locale = state.currency === 'USD' ? 'en-US' : state.currency === 'EUR' ? 'de-DE' : 'en-GB';
  return currencySymbol() + Math.round(n).toLocaleString(locale);
}

// Load device settings and apply theme/motion immediately on boot.
export function initSettings() {
  const dev = readLS(DEVICE_KEY);
  const acc = readLS(ACCOUNT_KEY);
  state = { ...DEFAULTS, ...dev, ...acc };
  applyTheme();
  applyMotion();
  return state;
}

// Merge account settings from Firestore once the user is known.
export async function loadAccountSettings(user) {
  try {
    const snap = await getDoc(doc(db, 'users', user.uid));
    const remote = snap.exists() ? snap.data().settings || {} : {};
    ACCOUNT_KEYS.forEach((k) => { if (remote[k] !== undefined) state[k] = remote[k]; });
    if (user.displayName) state.displayName = user.displayName;
    const acc = {};
    ACCOUNT_KEYS.forEach((k) => (acc[k] = state[k]));
    writeLS(ACCOUNT_KEY, acc);
  } catch (err) {
    console.warn('loadAccountSettings failed', err);
  }
  applyTheme();
  applyMotion();
  return state;
}

// Update one setting, persist it, and apply side-effects.
export async function setSetting(key, value, user) {
  state[key] = value;
  if (DEVICE_KEYS.includes(key)) {
    const dev = readLS(DEVICE_KEY);
    dev[key] = value;
    writeLS(DEVICE_KEY, dev);
    if (key === 'theme') applyTheme();
    if (key === 'reduceMotion') applyMotion();
    return;
  }
  const acc = readLS(ACCOUNT_KEY);
  acc[key] = value;
  writeLS(ACCOUNT_KEY, acc);
  if (user) {
    if (key === 'displayName') {
      await updateDisplayName(value);
    } else {
      await saveUserSettings(user, { [key]: value });
    }
  }
}

// ---------------------------------------------------------------------------
// Appearance side-effects
// ---------------------------------------------------------------------------
export function applyTheme() {
  const root = document.documentElement;
  let resolved = state.theme;
  if (state.theme === 'system') {
    resolved = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    // Re-apply automatically when the OS theme changes.
    if (!mql) {
      mql = window.matchMedia('(prefers-color-scheme: light)');
      mql.addEventListener('change', () => { if (state.theme === 'system') applyTheme(); });
    }
  }
  root.setAttribute('data-theme', resolved);
}

export function applyMotion() {
  document.documentElement.classList.toggle('reduce-motion', !!state.reduceMotion);
}
