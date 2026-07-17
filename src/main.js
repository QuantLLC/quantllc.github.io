import './style.css';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, USING_EMULATORS, IS_PLACEHOLDER_CONFIG } from './firebase.js';
import {
  signUp,
  signIn,
  logOut,
  resendVerification,
  refreshUser,
  touchUserProfile,
  recordDownload,
  friendlyError,
} from './auth.js';

// The download catalog. Files live in /public/downloads and are only offered
// to signed-in users with a verified email.
const DOWNLOADS = [
  {
    id: 'quant-cli',
    name: 'Quant CLI',
    version: '1.0.0',
    size: '2 KB',
    description: 'Command-line tool for the Quant platform.',
    file: 'downloads/quant-cli-1.0.0.txt',
  },
  {
    id: 'quant-sdk',
    name: 'Quant SDK',
    version: '0.9.3',
    size: '3 KB',
    description: 'Client SDK and quick-start guide.',
    file: 'downloads/quant-sdk-0.9.3.txt',
  },
];

const appEl = document.getElementById('app');

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function setMessage(node, text, type = 'error') {
  if (!node) return;
  node.textContent = text || '';
  node.className = 'message ' + (text ? type : '');
}

// ---------- Views ----------

function renderAuth() {
  appEl.innerHTML = '';
  // In a deployed build with no real Firebase config, warn that auth is not yet
  // wired up (the page still comes up so it can be previewed).
  const notConfigured = !USING_EMULATORS && IS_PLACEHOLDER_CONFIG;
  const banner = notConfigured
    ? `<div class="banner">⚠ Firebase is not configured for this deployment yet, so sign-in is disabled. Set the <code>VITE_FIREBASE_*</code> build variables to enable accounts.</div>`
    : '';
  const view = el(`
    <div class="card">
      ${banner}
      <div class="brand"><span class="logo">Q</span><h1>Quant Downloads</h1></div>
      <p class="subtitle">Sign in to access secure downloads.</p>
      <div class="tabs">
        <button class="tab active" data-tab="signin">Sign In</button>
        <button class="tab" data-tab="signup">Create Account</button>
      </div>
      <form id="auth-form" novalidate>
        <label>Email
          <input type="email" id="email" placeholder="you@example.com" autocomplete="email" required />
        </label>
        <label>Password
          <input type="password" id="password" placeholder="At least 6 characters" autocomplete="current-password" required />
        </label>
        <button type="submit" class="primary" id="submit-btn">Sign In</button>
      </form>
      <div class="message" id="msg"></div>
      <p class="hint">A verification email is sent on sign-up. You must verify before downloading.</p>
    </div>
  `);
  appEl.appendChild(view);

  let mode = 'signin';
  const tabs = view.querySelectorAll('.tab');
  const submitBtn = view.querySelector('#submit-btn');
  const pwInput = view.querySelector('#password');
  const msg = view.querySelector('#msg');

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      mode = tab.dataset.tab;
      submitBtn.textContent = mode === 'signin' ? 'Sign In' : 'Create Account';
      pwInput.setAttribute(
        'autocomplete',
        mode === 'signin' ? 'current-password' : 'new-password'
      );
      setMessage(msg, '');
    });
  });

  view.querySelector('#auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = view.querySelector('#email').value.trim();
    const password = pwInput.value;
    setMessage(msg, '');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Please wait…';
    try {
      if (mode === 'signup') {
        await signUp(email, password);
        setMessage(msg, 'Account created! Check your email to verify.', 'success');
      } else {
        await signIn(email, password);
      }
    } catch (err) {
      setMessage(msg, friendlyError(err));
      submitBtn.disabled = false;
      submitBtn.textContent = mode === 'signin' ? 'Sign In' : 'Create Account';
    }
  });
}

function renderVerify(user) {
  appEl.innerHTML = '';
  const view = el(`
    <div class="card">
      <div class="brand"><span class="logo">Q</span><h1>Verify your email</h1></div>
      <p class="subtitle">We sent a verification link to<br /><strong>${user.email}</strong></p>
      <p class="hint">Click the link in that email, then press "I've verified" below.
      ${
        USING_EMULATORS
          ? 'In local dev, open the <a href="http://127.0.0.1:4000/auth" target="_blank" rel="noopener">Auth Emulator</a> to find the link.'
          : ''
      }</p>
      <button class="primary" id="check-btn">I've verified my email</button>
      <button class="secondary" id="resend-btn">Resend email</button>
      <button class="link" id="logout-btn">Sign out</button>
      <div class="message" id="msg"></div>
    </div>
  `);
  appEl.appendChild(view);
  const msg = view.querySelector('#msg');

  view.querySelector('#check-btn').addEventListener('click', async () => {
    setMessage(msg, 'Checking…', 'success');
    const refreshed = await refreshUser();
    if (refreshed && refreshed.emailVerified) {
      await touchUserProfile(refreshed);
      renderDownloads(refreshed);
    } else {
      setMessage(msg, 'Still not verified. Click the link in your email first.');
    }
  });

  view.querySelector('#resend-btn').addEventListener('click', async () => {
    try {
      await resendVerification();
      setMessage(msg, 'Verification email resent.', 'success');
    } catch (err) {
      setMessage(msg, friendlyError(err));
    }
  });

  view.querySelector('#logout-btn').addEventListener('click', () => logOut());
}

function renderDownloads(user) {
  appEl.innerHTML = '';
  const items = DOWNLOADS.map(
    (d) => `
      <li class="download">
        <div>
          <h3>${d.name} <span class="version">v${d.version}</span></h3>
          <p>${d.description}</p>
          <span class="meta">${d.size}</span>
        </div>
        <a class="primary download-btn" href="${d.file}" download data-id="${d.id}" data-name="${d.name}">Download</a>
      </li>`
  ).join('');

  const view = el(`
    <div class="card wide">
      <div class="topbar">
        <div class="brand"><span class="logo">Q</span><h1>Downloads</h1></div>
        <div class="account">
          <span class="verified">✓ ${user.email}</span>
          <button class="link" id="logout-btn">Sign out</button>
        </div>
      </div>
      <p class="subtitle">Your email is verified. Enjoy your downloads.</p>
      <ul class="downloads">${items}</ul>
      <div class="message" id="msg"></div>
    </div>
  `);
  appEl.appendChild(view);
  const msg = view.querySelector('#msg');

  view.querySelectorAll('.download-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const file = { id: btn.dataset.id, name: btn.dataset.name };
      try {
        await recordDownload(user, file);
        setMessage(msg, `Downloading ${file.name}… (recorded to your account)`, 'success');
      } catch (err) {
        // Download still proceeds via the anchor even if logging fails.
        setMessage(msg, friendlyError(err));
      }
    });
  });

  view.querySelector('#logout-btn').addEventListener('click', () => logOut());
}

// ---------- Auth state routing ----------

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    renderAuth();
  } else if (!user.emailVerified) {
    renderVerify(user);
  } else {
    // Keep the stored profile current (e.g. emailVerified) on every load.
    try {
      await touchUserProfile(user);
    } catch (err) {
      // Non-fatal: still show downloads even if the profile write fails.
      // eslint-disable-next-line no-console
      console.warn('touchUserProfile failed', err);
    }
    renderDownloads(user);
  }
});
