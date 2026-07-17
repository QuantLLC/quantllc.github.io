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

// ---------------------------------------------------------------------------
// Sample data. There is no live trading backend yet, so the dashboard uses
// representative placeholder figures (matching the product mockup).
// ---------------------------------------------------------------------------
const PORTFOLIO = {
  balance: 10425,
  invested: 218,
  changePct: 4.2,
  holdings: [
    { sym: 'NVDA', name: 'NVIDIA', shares: 21 },
    { sym: 'AAPL', name: 'Apple', shares: 19 },
  ],
  income: [120, 138, 129, 156, 171, 168, 190, 210, 205, 236, 258, 274],
};

const DOWNLOADS = [
  {
    id: 'quant-server-iso',
    name: 'Quant Server',
    badge: 'ISO',
    soon: true,
    desc: 'Bootable server image. Flash it, run it, and let Quant trade locally.',
    meta: 'coming soon',
  },
  {
    id: 'quant-android',
    name: 'Quant Monitor',
    badge: 'APK',
    soon: true,
    desc: 'Android app to view status on the go. Pairs as mouse/monitor for the server.',
    meta: 'coming soon',
  },
  {
    id: 'quant-quickstart',
    name: 'Quick-start guide',
    badge: 'TXT',
    soon: false,
    file: 'downloads/quant-server-quickstart.txt',
    desc: 'How to set up the server and connect your keyboard and phone.',
    meta: 'TXT · 2 KB',
  },
];

const STOCKS = [
  ['NVDA', +1.8], ['AAPL', +0.7], ['MSFT', +1.1], ['TSLA', -2.3], ['AMZN', +0.4],
  ['GOOGL', +0.9], ['META', -0.6], ['AMD', +2.5], ['SPY', +0.3], ['BTC', -1.2],
];

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const gbp = (n) => '£' + Math.round(n).toLocaleString('en-GB');

function displayName(user) {
  if (user.displayName) return user.displayName;
  const local = (user.email || 'investor').split('@')[0];
  return local.charAt(0).toUpperCase() + local.slice(1);
}

function notConfigured() {
  return !USING_EMULATORS && IS_PLACEHOLDER_CONFIG;
}

// ---------------------------------------------------------------------------
// Ticker
// ---------------------------------------------------------------------------
function buildTicker() {
  const track = $('#ticker-track');
  if (!track) return;
  const cells = STOCKS.concat(STOCKS)
    .map(([sym, chg]) => {
      const cls = chg >= 0 ? 'up' : 'down';
      const arrow = chg >= 0 ? '▲' : '▼';
      return `<span class="tk"><b>${sym}</b><span class="${cls}">${arrow} ${Math.abs(chg).toFixed(1)}%</span></span>`;
    })
    .join('');
  track.innerHTML = cells;
}

// ---------------------------------------------------------------------------
// Dashboard panel (logged in) / login prompt (logged out) / verify prompt
// ---------------------------------------------------------------------------
function sparkline(data, w = 240, h = 84) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const span = max - min || 1;
  const stepX = w / (data.length - 1);
  const pts = data.map((v, i) => [i * stepX, h - ((v - min) / span) * (h - 8) - 4]);
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const area = `${line} L ${w} ${h} L 0 ${h} Z`;
  return { line, area, w, h };
}

function renderDashboard(user) {
  const slot = $('#panel-slot');
  const spark = sparkline(PORTFOLIO.income);
  const holdings = PORTFOLIO.holdings
    .map(
      (hd) => `
      <div class="chip">
        <span class="sym">${hd.sym}<small>${hd.name}</small></span>
        <span class="qty">${hd.shares} shares</span>
      </div>`
    )
    .join('');

  slot.innerHTML = `
    <div class="panel">
      <button class="share-btn" id="share-btn" title="Share" aria-label="Share">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5 8.6 10.5"/></svg>
      </button>
      <div class="panel-grid">
        <div>
          <div class="hello">HELLO, ${displayName(user).toUpperCase()}.</div>
          <div class="balance" id="balance" data-target="${PORTFOLIO.balance}">£0</div>
          <div class="balance-sub"><span class="up">▲ ${PORTFOLIO.changePct}%</span> today · auto-managed</div>
          <div class="holdings-label">YOU ARE SHAREHOLDER OF:</div>
          <div class="chips">${holdings}</div>
          <div class="panel-actions">
            <button class="btn btn--ghost btn--sm" id="see-more">See more</button>
            <button class="btn btn--primary btn--sm" id="see-summary">See summary of today</button>
          </div>
        </div>
        <div>
          <div class="mini-card">
            <div class="mini-title">REMINDER</div>
            <div class="reminder-sub">you invested:</div>
            <div class="reminder-amt">${gbp(PORTFOLIO.invested)}</div>
          </div>
          <div class="mini-card">
            <div class="mini-title">INCOME</div>
            <svg class="chart" viewBox="0 0 ${spark.w} ${spark.h}" preserveAspectRatio="none">
              <defs>
                <linearGradient id="incGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="rgba(34,211,122,0.35)"/>
                  <stop offset="100%" stop-color="rgba(34,211,122,0)"/>
                </linearGradient>
              </defs>
              <path class="chart-area" d="${spark.area}"/>
              <path class="chart-line" id="chart-line" d="${spark.line}"/>
            </svg>
          </div>
        </div>
      </div>
    </div>`;

  countUp($('#balance'));
  drawChart($('#chart-line'));

  const summaryBtn = $('#see-summary');
  const seeMore = $('#see-more');
  const share = $('#share-btn');
  if (summaryBtn) summaryBtn.addEventListener('click', () => toast(`Today: ${gbp(PORTFOLIO.balance)} · +${PORTFOLIO.changePct}% · ${PORTFOLIO.holdings.length} holdings`));
  if (seeMore) seeMore.addEventListener('click', () => document.querySelector('#about').scrollIntoView());
  if (share) share.addEventListener('click', async () => {
    const text = `I'm using Quant — automated investing. Balance ${gbp(PORTFOLIO.balance)}.`;
    if (navigator.share) { try { await navigator.share({ title: 'Quant', text }); } catch (e) { /* cancelled */ } }
    else { try { await navigator.clipboard.writeText(text); toast('Copied to clipboard'); } catch (e) { toast('Share: ' + text); } }
  });
}

function renderVerifyPrompt(user) {
  const slot = $('#panel-slot');
  slot.innerHTML = `
    <div class="panel panel--prompt">
      <div class="lock">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
      </div>
      <h3>Verify your email</h3>
      <p>We sent a link to <strong>${user.email}</strong>. Verify it to unlock your dashboard.</p>
      <div class="panel-actions">
        <button class="btn btn--primary btn--sm" id="verify-check">I've verified</button>
        <button class="btn btn--ghost btn--sm" id="verify-resend">Resend email</button>
      </div>
      ${USING_EMULATORS ? '<div class="panel-note">Dev: find the link in the <a href="http://127.0.0.1:4000/auth" target="_blank" rel="noopener" style="color:var(--accent)">Auth emulator</a>.</div>' : ''}
      <div class="panel-note" id="verify-msg"></div>
    </div>`;

  $('#verify-check').addEventListener('click', async () => {
    const msg = $('#verify-msg');
    msg.textContent = 'Checking…';
    const refreshed = await refreshUser();
    if (refreshed && refreshed.emailVerified) {
      await touchUserProfile(refreshed);
      renderDashboard(refreshed);
      updateHeader(refreshed);
    } else {
      msg.textContent = 'Still not verified — click the link in your email first.';
    }
  });
  $('#verify-resend').addEventListener('click', async () => {
    try { await resendVerification(); $('#verify-msg').textContent = 'Verification email resent.'; }
    catch (err) { $('#verify-msg').textContent = friendlyError(err); }
  });
}

function renderLoginPrompt() {
  const slot = $('#panel-slot');
  const warn = notConfigured()
    ? '<div class="panel-note warn">Sign-in is disabled until Firebase is configured for this deployment.</div>'
    : '';
  slot.innerHTML = `
    <div class="panel panel--prompt">
      <div class="lock">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m8 11 4 4 4-4"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>
      </div>
      <h3>Your dashboard awaits</h3>
      <p>Sign in to see your balance, holdings and income — or create an account to get started.</p>
      <div class="panel-actions">
        <button class="btn btn--primary btn--sm" id="prompt-signin" ${notConfigured() ? 'disabled' : ''}>Sign in</button>
        <button class="btn btn--ghost btn--sm" id="prompt-signup" ${notConfigured() ? 'disabled' : ''}>Create account</button>
      </div>
      ${warn}
    </div>`;
  const si = $('#prompt-signin');
  const su = $('#prompt-signup');
  if (si) si.addEventListener('click', () => openAuthModal('signin'));
  if (su) su.addEventListener('click', () => openAuthModal('signup'));
}

// ---------------------------------------------------------------------------
// Auth modal
// ---------------------------------------------------------------------------
function openAuthModal(mode = 'signin') {
  const overlay = $('#auth-modal');
  const body = $('#auth-modal-body');
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

function closeAuthModal() {
  const overlay = $('#auth-modal');
  if (overlay) overlay.hidden = true;
  document.body.style.overflow = '';
}

// ---------------------------------------------------------------------------
// Header state
// ---------------------------------------------------------------------------
function updateHeader(user) {
  const avatar = $('#profile-btn');
  const initial = $('#avatar-initial');
  const dot = $('#avatar-dot');
  const account = $('#menu-account');
  const authBtn = $('#menu-auth-btn');
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
// Downloads
// ---------------------------------------------------------------------------
function renderDownloads() {
  const list = $('#downloads');
  if (!list) return;
  list.innerHTML = DOWNLOADS.map((d) => {
    const badge = `<span class="badge ${d.soon ? 'badge--soon' : ''}">${d.badge}</span>`;
    const action = d.soon
      ? `<button class="btn btn--ghost btn--sm" disabled>Coming soon</button>`
      : `<a class="btn btn--primary btn--sm" href="${d.file}" download data-id="${d.id}" data-name="${d.name}">Download</a>`;
    return `
      <li class="download">
        <div>
          <h3>${d.name} ${badge}</h3>
          <p>${d.desc}</p>
          <span class="meta">${d.meta}</span>
        </div>
        ${action}
      </li>`;
  }).join('');

  $$('.download a[download]', list).forEach((a) => {
    a.addEventListener('click', async () => {
      const note = $('#download-note');
      const file = { id: a.dataset.id, name: a.dataset.name };
      const user = auth.currentUser;
      if (user && user.emailVerified) {
        try {
          await recordDownload(user, file);
          note.textContent = `Downloading ${file.name}… (recorded to your account)`;
          note.className = 'download-note ok';
        } catch (err) {
          note.textContent = friendlyError(err);
          note.className = 'download-note err';
        }
      } else {
        note.textContent = `Downloading ${file.name}…`;
        note.className = 'download-note ok';
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Animations
// ---------------------------------------------------------------------------
function countUp(el) {
  if (!el) return;
  const target = Number(el.dataset.target || 0);
  const dur = 1100;
  const start = performance.now();
  function tick(now) {
    const t = Math.min((now - start) / dur, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = gbp(target * eased);
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function drawChart(path) {
  if (!path || typeof path.getTotalLength !== 'function') return;
  const len = path.getTotalLength();
  path.style.strokeDasharray = String(len);
  path.style.strokeDashoffset = String(len);
  path.getBoundingClientRect();
  path.style.transition = 'stroke-dashoffset 1.2s ease';
  requestAnimationFrame(() => { path.style.strokeDashoffset = '0'; });
}

function animateTagline() {
  $$('#tagline p[data-line]').forEach((p, i) => {
    setTimeout(() => p.classList.add('in'), 250 + i * 260);
  });
}

function setupReveals() {
  const obs = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); obs.unobserve(e.target); } });
    },
    { threshold: 0.12 }
  );
  $$('.reveal').forEach((el) => obs.observe(el));
}

function toast(text) {
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

// ---------------------------------------------------------------------------
// Navigation + menu wiring
// ---------------------------------------------------------------------------
function setupNav() {
  const pills = $$('.nav-pill');
  const sections = ['home', 'about', 'download', 'contact'].map((id) => document.getElementById(id));
  const obs = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          const id = e.target.id;
          pills.forEach((p) => p.classList.toggle('is-active', p.dataset.nav === id));
        }
      });
    },
    { threshold: 0.45 }
  );
  sections.forEach((s) => s && obs.observe(s));

  // Settings menu
  const menuBtn = $('#menu-btn');
  const menu = $('#settings-menu');
  const closeMenu = () => { menu.hidden = true; menuBtn.setAttribute('aria-expanded', 'false'); };
  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = menu.hidden;
    menu.hidden = !open;
    menuBtn.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click', (e) => { if (!menu.hidden && !menu.contains(e.target) && e.target !== menuBtn) closeMenu(); });
  $$('.menu-item[data-nav]', menu).forEach((mi) => mi.addEventListener('click', closeMenu));

  $('#menu-auth-btn').addEventListener('click', () => {
    closeMenu();
    if (auth.currentUser) logOut();
    else openAuthModal('signin');
  });

  // Avatar
  $('#profile-btn').addEventListener('click', () => {
    if (auth.currentUser) document.getElementById('home').scrollIntoView();
    else openAuthModal('signin');
  });

  // Modal close wiring
  $('#modal-close').addEventListener('click', closeAuthModal);
  $('#auth-modal').addEventListener('click', (e) => { if (e.target.id === 'auth-modal') closeAuthModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAuthModal(); });
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
$('#year').textContent = new Date().getFullYear();
buildTicker();
renderDownloads();
setupNav();
setupReveals();
animateTagline();

onAuthStateChanged(auth, async (user) => {
  updateHeader(user);
  if (!user) {
    renderLoginPrompt();
  } else if (!user.emailVerified) {
    renderVerifyPrompt(user);
  } else {
    try { await touchUserProfile(user); } catch (err) { console.warn('touchUserProfile failed', err); }
    renderDashboard(user);
  }
});
