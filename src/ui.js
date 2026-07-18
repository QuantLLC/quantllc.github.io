// Shared UI "chrome" used by both the landing page and the dashboard page:
// header state, the auth modal, the settings drawer, the stock ticker, and a
// few small helpers. Page-specific content (hero panel, dashboard widgets)
// lives in main.js / dashboard.js.
import { auth, USING_EMULATORS, IS_PLACEHOLDER_CONFIG } from './firebase.js';
import {
  signUp,
  signIn,
  logOut,
  changePassword,
  deleteAccount,
  friendlyError,
} from './auth.js';
import { getSettings, setSetting } from './settings.js';
import { TICKER_STOCKS } from './portfolio.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// Callbacks provided by the host page.
let onAccountChange = () => {};
let onAvatarClick = null;
let focusReturn = null;
let trapHandler = null;

export function notConfigured() {
  return !USING_EMULATORS && IS_PLACEHOLDER_CONFIG;
}

export function displayName(user) {
  const fromSettings = getSettings().displayName;
  if (fromSettings) return fromSettings;
  if (user && user.displayName) return user.displayName;
  const local = ((user && user.email) || 'investor').split('@')[0];
  return local.charAt(0).toUpperCase() + local.slice(1);
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function toast(text) {
  let t = $('#toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.style.cssText =
      'position:fixed;left:50%;bottom:28px;transform:translateX(-50%) translateY(20px);' +
      'background:#171a20;border:1px solid rgba(255,255,255,0.16);color:#f3f5f8;' +
      'padding:12px 18px;border-radius:12px;font-size:14px;z-index:200;opacity:0;' +
      'transition:opacity .2s ease, transform .2s ease;box-shadow:0 16px 40px rgba(0,0,0,.5);max-width:90vw;';
    document.body.appendChild(t);
  }
  t.textContent = text;
  requestAnimationFrame(() => { t.style.opacity = '1'; t.style.transform = 'translateX(-50%) translateY(0)'; });
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateX(-50%) translateY(20px)'; }, 2600);
}

let liveTicker = TICKER_STOCKS.map(([sym, chg]) => [sym, chg]);

export function buildTicker() {
  const track = $('#ticker-track');
  if (!track) return;
  track.innerHTML = liveTicker.concat(liveTicker)
    .map(([sym, chg]) => {
      const cls = chg >= 0 ? 'up' : 'down';
      const arrow = chg >= 0 ? '▲' : '▼';
      return `<span class="tk"><b>${sym}</b><span class="${cls}">${arrow} ${Math.abs(chg).toFixed(1)}%</span></span>`;
    })
    .join('');
}

/** Nudge ticker percentages slightly so the strip feels live. */
export function tickLiveTicker() {
  liveTicker = liveTicker.map(([sym, chg]) => {
    const next = +(chg + (Math.random() - 0.5) * 0.08).toFixed(1);
    return [sym, Math.max(-9.9, Math.min(9.9, next))];
  });
  buildTicker();
}

export function startTickerPulse(ms = 4500) {
  buildTicker();
  if (window.__quantTicker) clearInterval(window.__quantTicker);
  window.__quantTicker = setInterval(tickLiveTicker, ms);
}

// ---------------------------------------------------------------------------
// Focus trap + loading
// ---------------------------------------------------------------------------
function trapFocus(container) {
  releaseFocus();
  focusReturn = document.activeElement;
  const focusable = () =>
    Array.from(container.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])'))
      .filter((el) => el.offsetParent !== null);
  const list = focusable();
  if (list[0]) list[0].focus();
  trapHandler = (e) => {
    if (e.key !== 'Tab') return;
    const items = focusable();
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  document.addEventListener('keydown', trapHandler);
}

function releaseFocus() {
  if (trapHandler) document.removeEventListener('keydown', trapHandler);
  trapHandler = null;
  if (focusReturn && focusReturn.focus) { try { focusReturn.focus(); } catch (_) { /* ignore */ } }
  focusReturn = null;
}

export function showLoading(slot) {
  if (!slot) return;
  slot.innerHTML = `
    <div class="panel panel--prompt skeleton-panel" aria-busy="true" aria-label="Loading">
      <div class="skel skel-circle"></div>
      <div class="skel skel-line w60"></div>
      <div class="skel skel-line w90"></div>
      <div class="skel skel-line w40"></div>
    </div>`;
}

export function showDashLoading(slot) {
  if (!slot) return;
  slot.innerHTML = `
    <div class="dash-loading" aria-busy="true" aria-label="Loading dashboard">
      <div class="skel skel-line w40"></div>
      <div class="skel skel-line w30" style="height:36px;margin:12px 0 24px"></div>
      <div class="stat-grid">
        <div class="card skel-card"></div><div class="card skel-card"></div>
        <div class="card skel-card"></div><div class="card skel-card"></div>
      </div>
      <div class="dash-grid" style="margin-top:16px">
        <div class="card skel-card" style="height:280px"></div>
        <div class="card skel-card" style="height:280px"></div>
      </div>
    </div>`;
}

/** Deposit / withdraw modal (preview UX — funds are not moved yet). */
export function openMoneyModal(kind = 'deposit') {
  let overlay = $('#money-modal');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'money-modal';
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="money-title">
        <button class="modal-close" id="money-close" aria-label="Close">&times;</button>
        <div id="money-body"></div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target.id === 'money-modal') closeMoneyModal(); });
    $('#money-close', overlay).addEventListener('click', closeMoneyModal);
  }
  const isDep = kind === 'deposit';
  $('#money-body').innerHTML = `
    <div class="auth-brand"><span class="auth-logo">QUANT<span class="dot">.</span></span></div>
    <h3 id="money-title" style="margin:8px 0 4px">${isDep ? 'Deposit funds' : 'Withdraw funds'}</h3>
    <p class="auth-sub">${isDep ? 'Add capital for Quant to invest automatically.' : 'Move available cash back to your bank.'}</p>
    <form class="auth-form" id="money-form">
      <label>Amount
        <input type="number" id="money-amt" min="1" step="0.01" placeholder="e.g. 250" required />
      </label>
      <label>Reference <small style="font-weight:400;color:var(--faint)">(optional)</small>
        <input type="text" id="money-ref" maxlength="40" placeholder="Payday top-up" />
      </label>
      <button type="submit" class="btn btn--primary btn--block">${isDep ? 'Request deposit' : 'Request withdrawal'}</button>
    </form>
    <p class="auth-hint">Preview only — banking rails ship with the server pairing release.</p>
    <div class="auth-msg" id="money-msg"></div>`;
  overlay.hidden = false;
  document.body.style.overflow = 'hidden';
  trapFocus(overlay.querySelector('.modal'));
  $('#money-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const amt = Number($('#money-amt').value);
    if (!amt || amt <= 0) { $('#money-msg').textContent = 'Enter a valid amount.'; $('#money-msg').className = 'auth-msg err'; return; }
    $('#money-msg').textContent = `${isDep ? 'Deposit' : 'Withdrawal'} of ${amt.toFixed(2)} queued. You'll be notified when banking is live.`;
    $('#money-msg').className = 'auth-msg ok';
    toast(`${isDep ? 'Deposit' : 'Withdrawal'} request noted`);
    setTimeout(closeMoneyModal, 1200);
  });
}

export function closeMoneyModal() {
  const overlay = $('#money-modal');
  if (overlay) overlay.hidden = true;
  document.body.style.overflow = '';
  releaseFocus();
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------
export function updateHeader(user) {
  const avatar = $('#profile-btn');
  const initial = $('#avatar-initial');
  const dot = $('#avatar-dot');
  const account = $('#menu-account');
  const authBtn = $('#menu-auth-btn');
  if (!avatar) return;
  if (user) {
    initial.textContent = displayName(user).charAt(0).toUpperCase();
    avatar.classList.add('is-auth');
    dot.classList.add('is-on');
    account.textContent = user.email;
    authBtn.textContent = 'Sign out';
  } else {
    initial.textContent = '';
    avatar.classList.remove('is-auth');
    dot.classList.remove('is-on');
    account.textContent = 'Not signed in';
    authBtn.textContent = 'Sign in';
  }
}

// ---------------------------------------------------------------------------
// Auth modal
// ---------------------------------------------------------------------------
export function openAuthModal(mode = 'signin') {
  const overlay = $('#auth-modal');
  const body = $('#auth-modal-body');
  if (!overlay || !body) return;
  const banner = notConfigured()
    ? `<div class="auth-banner">⚠ Firebase isn't configured for this deployment yet, so sign-in is disabled. Set the <code>VITE_FIREBASE_*</code> build variables to enable accounts.</div>`
    : '';
  body.innerHTML = `
    ${banner}
    <div class="auth-brand"><span class="auth-logo">QUANT<span class="dot">.</span></span></div>
    <p class="auth-sub">Access your automated portfolio.</p>
    <div class="tabs">
      <button class="tab ${mode === 'signin' ? 'active' : ''}" data-tab="signin">Sign In</button>
      <button class="tab ${mode === 'signup' ? 'active' : ''}" data-tab="signup">Create Account</button>
    </div>
    <form class="auth-form" id="auth-form" novalidate>
      <label>Email
        <input type="email" id="auth-email" placeholder="you@example.com" autocomplete="email" required ${notConfigured() ? 'disabled' : ''} />
      </label>
      <label>Password
        <input type="password" id="auth-password" placeholder="At least 6 characters" autocomplete="current-password" required ${notConfigured() ? 'disabled' : ''} />
      </label>
      <button type="submit" class="btn btn--primary btn--block" id="auth-submit" ${notConfigured() ? 'disabled' : ''}>${mode === 'signin' ? 'Sign In' : 'Create Account'}</button>
    </form>
    <div class="auth-msg" id="auth-msg"></div>
    <p class="auth-hint">New accounts must verify their email before accessing the dashboard.</p>`;

  overlay.hidden = false;
  document.body.style.overflow = 'hidden';
  trapFocus(overlay.querySelector('.modal') || overlay);

  let current = mode;
  const submit = $('#auth-submit');
  const pw = $('#auth-password');
  const msg = $('#auth-msg');
  const setMsg = (t, ok) => { msg.textContent = t || ''; msg.className = 'auth-msg ' + (t ? (ok ? 'ok' : 'err') : ''); };

  $$('.tab', body).forEach((tab) => {
    tab.addEventListener('click', () => {
      $$('.tab', body).forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      current = tab.dataset.tab;
      submit.textContent = current === 'signin' ? 'Sign In' : 'Create Account';
      pw.setAttribute('autocomplete', current === 'signin' ? 'current-password' : 'new-password');
      setMsg('');
    });
  });

  $('#auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('#auth-email').value.trim();
    const password = pw.value;
    setMsg('');
    submit.disabled = true;
    const original = submit.textContent;
    submit.textContent = 'Please wait…';
    try {
      if (current === 'signup') {
        await signUp(email, password);
        setMsg('Account created! Check your email to verify.', true);
      } else {
        await signIn(email, password);
      }
      setTimeout(closeAuthModal, 700);
    } catch (err) {
      setMsg(friendlyError(err));
      submit.disabled = false;
      submit.textContent = original;
    }
  });
}

export function closeAuthModal() {
  const overlay = $('#auth-modal');
  if (overlay) overlay.hidden = true;
  document.body.style.overflow = '';
  releaseFocus();
}

// ---------------------------------------------------------------------------
// Settings drawer
// ---------------------------------------------------------------------------
export function openSettings() {
  renderSettings();
  const o = $('#settings-overlay');
  if (o) o.hidden = false;
  document.body.style.overflow = 'hidden';
  if (o) trapFocus(o.querySelector('.drawer') || o);
}
export function closeSettings() {
  const o = $('#settings-overlay');
  if (o) o.hidden = true;
  document.body.style.overflow = '';
  releaseFocus();
}

export function renderSettings() {
  const s = getSettings();
  const user = auth.currentUser;
  const body = $('#settings-body');
  const foot = $('#settings-foot');
  if (!body) return;

  const accountSection = user
    ? `
      <div class="set-group">
        <h3>Account</h3>
        <div class="set-row col">
          <div class="set-label">Display name<small>Shown on your dashboard greeting.</small></div>
          <div class="set-input">
            <input id="set-name" type="text" maxlength="40" placeholder="Your name" value="${escapeHtml(s.displayName || '')}" />
            <button class="btn btn--primary btn--sm" id="set-name-save">Save</button>
          </div>
        </div>
        <div class="set-row">
          <div class="set-label">Email<small>${escapeHtml(user.email)} · ${user.emailVerified ? 'verified' : 'unverified'}</small></div>
        </div>
        <div class="set-row">
          <div class="set-label">Password<small>We'll email you a secure reset link.</small></div>
          <button class="btn btn--ghost btn--sm" id="set-pw">Change</button>
        </div>
        <div class="set-msg" id="set-account-msg"></div>
      </div>`
    : `
      <div class="set-group">
        <h3>Account</h3>
        <div class="set-row">
          <div class="set-label">Not signed in<small>Sign in to manage your account and sync settings.</small></div>
          <button class="btn btn--primary btn--sm" id="set-signin">Sign in</button>
        </div>
      </div>`;

  body.innerHTML = `
    ${accountSection}
    <div class="set-group">
      <h3>Appearance</h3>
      <div class="set-row col">
        <div class="set-label">Theme</div>
        <div class="segmented" id="seg-theme">
          <button data-val="system" class="${s.theme === 'system' ? 'on' : ''}">System</button>
          <button data-val="light" class="${s.theme === 'light' ? 'on' : ''}">Light</button>
          <button data-val="dark" class="${s.theme === 'dark' ? 'on' : ''}">Dark</button>
        </div>
      </div>
      <div class="set-row">
        <div class="set-label">Reduce motion<small>Minimise animations across the site.</small></div>
        <label class="switch"><input type="checkbox" id="tg-motion" ${s.reduceMotion ? 'checked' : ''}><span class="track"></span></label>
      </div>
    </div>
    <div class="set-group">
      <h3>Preferences</h3>
      <div class="set-row">
        <div class="set-label">Currency<small>Used across your dashboard.</small></div>
        <select class="set-select" id="sel-currency">
          <option value="GBP" ${s.currency === 'GBP' ? 'selected' : ''}>£ GBP</option>
          <option value="USD" ${s.currency === 'USD' ? 'selected' : ''}>$ USD</option>
          <option value="EUR" ${s.currency === 'EUR' ? 'selected' : ''}>€ EUR</option>
        </select>
      </div>
      <div class="set-row">
        <div class="set-label">Email updates<small>Product news and account alerts.</small></div>
        <label class="switch"><input type="checkbox" id="tg-email" ${s.emailUpdates ? 'checked' : ''}><span class="track"></span></label>
      </div>
    </div>
    <div class="set-group">
      <h3>Trading</h3>
      <div class="set-row col">
        <div class="set-label">Risk profile<small>Guides how aggressively Quant trades for you.</small></div>
        <div class="segmented" id="seg-risk">
          <button data-val="conservative" class="${s.riskProfile === 'conservative' ? 'on' : ''}">Safe</button>
          <button data-val="balanced" class="${s.riskProfile === 'balanced' ? 'on' : ''}">Balanced</button>
          <button data-val="aggressive" class="${s.riskProfile === 'aggressive' ? 'on' : ''}">Bold</button>
        </div>
      </div>
      <div class="set-row">
        <div class="set-label">Auto-invest<small>Let Quant buy and sell automatically.</small></div>
        <label class="switch"><input type="checkbox" id="tg-auto" ${s.autoInvest ? 'checked' : ''}><span class="track"></span></label>
      </div>
    </div>
    <div class="set-group">
      <h3>Security</h3>
      <div class="set-row disabled">
        <div class="set-label">Two-factor authentication <span class="soon">SOON</span><small>Extra protection at login.</small></div>
        <label class="switch"><input type="checkbox" disabled><span class="track"></span></label>
      </div>
      <div class="set-row disabled">
        <div class="set-label">Active sessions <span class="soon">SOON</span><small>Review devices signed into your account.</small></div>
        <button class="btn btn--ghost btn--sm" disabled>View</button>
      </div>
    </div>
    <div class="set-group">
      <h3>Server &amp; devices</h3>
      <div class="set-row disabled">
        <div class="set-label">Pair local server <span class="soon">SOON</span><small>Connect the Quant server you run from the ISO.</small></div>
        <button class="btn btn--ghost btn--sm" disabled>Pair</button>
      </div>
      <div class="set-row disabled">
        <div class="set-label">Connected devices <span class="soon">SOON</span><small>Bluetooth keyboard &amp; phone controls.</small></div>
        <button class="btn btn--ghost btn--sm" disabled>Manage</button>
      </div>
    </div>
    ${user ? `
    <div class="set-group">
      <h3>Danger zone</h3>
      <div class="set-row">
        <div class="set-label">Delete account<small>Permanently remove your account and data.</small></div>
        <button class="btn btn--danger btn--sm" id="set-delete">Delete</button>
      </div>
      <div class="set-msg" id="set-danger-msg"></div>
    </div>` : ''}
  `;

  if (foot) {
    foot.innerHTML =
      `<span class="ver">Quant · v0.1.0</span>` +
      (user ? `<button class="btn btn--ghost btn--sm" id="set-signout">Sign out</button>` : '');
  }

  wireSettings(user);
}

function wireSegment(id, key) {
  const seg = $('#' + id);
  if (!seg) return;
  $$('button', seg).forEach((b) => {
    b.addEventListener('click', async () => {
      $$('button', seg).forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      await setSetting(key, b.dataset.val, auth.currentUser);
    });
  });
}

function wireSettings(user) {
  wireSegment('seg-theme', 'theme');
  wireSegment('seg-risk', 'riskProfile');

  const on = (sel, evt, fn) => { const el = $(sel); if (el) el.addEventListener(evt, fn); };

  on('#tg-motion', 'change', (e) => setSetting('reduceMotion', e.target.checked, user));
  on('#tg-email', 'change', (e) => setSetting('emailUpdates', e.target.checked, user));
  on('#tg-auto', 'change', async (e) => { await setSetting('autoInvest', e.target.checked, user); onAccountChange(); });
  on('#sel-currency', 'change', async (e) => { await setSetting('currency', e.target.value, user); onAccountChange(); });

  on('#set-name-save', 'click', async () => {
    const msg = $('#set-account-msg');
    try {
      await setSetting('displayName', $('#set-name').value.trim(), user);
      updateHeader(user);
      onAccountChange();
      msg.textContent = 'Display name updated.';
      msg.className = 'set-msg ok';
    } catch (err) {
      msg.textContent = friendlyError(err);
      msg.className = 'set-msg err';
    }
  });

  on('#set-pw', 'click', async () => {
    const msg = $('#set-account-msg');
    try {
      await changePassword(user.email);
      msg.textContent = 'Password reset email sent' + (USING_EMULATORS ? ' (check the Auth emulator).' : '.');
      msg.className = 'set-msg ok';
    } catch (err) {
      msg.textContent = friendlyError(err);
      msg.className = 'set-msg err';
    }
  });

  on('#set-delete', 'click', async () => {
    const msg = $('#set-danger-msg');
    if (!window.confirm('Delete your account permanently? This cannot be undone.')) return;
    try {
      await deleteAccount();
      closeSettings();
    } catch (err) {
      msg.textContent = friendlyError(err);
      msg.className = 'set-msg err';
    }
  });

  on('#set-signout', 'click', () => { logOut(); closeSettings(); });
  on('#set-signin', 'click', () => { closeSettings(); openAuthModal('signin'); });
}

// ---------------------------------------------------------------------------
// Wire the shared header/menu/drawer/modal. Call once per page.
// options.onAccountChange: re-render page content after currency/name changes.
// options.onAvatar: what the avatar does when a signed-in user clicks it.
// ---------------------------------------------------------------------------
export function initChrome(options = {}) {
  onAccountChange = options.onAccountChange || (() => {});
  onAvatarClick = options.onAvatar || null;

  const yearEl = $('#year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();
  startTickerPulse();

  const menuBtn = $('#menu-btn');
  const menu = $('#settings-menu');
  if (menuBtn && menu) {
    const closeMenu = () => { menu.hidden = true; menuBtn.setAttribute('aria-expanded', 'false'); };
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = menu.hidden;
      menu.hidden = !open;
      menuBtn.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', (e) => { if (!menu.hidden && !menu.contains(e.target) && e.target !== menuBtn) closeMenu(); });
    $$('.menu-item[data-nav], .menu-item[href]', menu).forEach((mi) => mi.addEventListener('click', closeMenu));

    const authBtn = $('#menu-auth-btn');
    if (authBtn) authBtn.addEventListener('click', () => { closeMenu(); if (auth.currentUser) logOut(); else openAuthModal('signin'); });
    const setBtn = $('#menu-settings-btn');
    if (setBtn) setBtn.addEventListener('click', () => { closeMenu(); openSettings(); });
  }

  const settingsClose = $('#settings-close');
  if (settingsClose) settingsClose.addEventListener('click', closeSettings);
  const settingsOverlay = $('#settings-overlay');
  if (settingsOverlay) settingsOverlay.addEventListener('click', (e) => { if (e.target.id === 'settings-overlay') closeSettings(); });

  const avatar = $('#profile-btn');
  if (avatar) avatar.addEventListener('click', () => {
    if (auth.currentUser) { if (onAvatarClick) onAvatarClick(); }
    else openAuthModal('signin');
  });

  const modalClose = $('#modal-close');
  if (modalClose) modalClose.addEventListener('click', closeAuthModal);
  const authModal = $('#auth-modal');
  if (authModal) authModal.addEventListener('click', (e) => { if (e.target.id === 'auth-modal') closeAuthModal(); });

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeSettings(); closeAuthModal(); closeMoneyModal(); } });
}

// Keep an open settings drawer in sync after an auth-state change.
export function syncOpenSettings() {
  const o = $('#settings-overlay');
  if (o && !o.hidden) renderSettings();
}
