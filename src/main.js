import './style.css';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, USING_EMULATORS } from './firebase.js';
import {
  resendVerification,
  refreshUser,
  touchUserProfile,
  recordDownload,
  friendlyError,
} from './auth.js';
import { initSettings, loadAccountSettings, formatMoney } from './settings.js';
import {
  $, $$,
  displayName,
  notConfigured,
  openAuthModal,
  updateHeader,
  initChrome,
  syncOpenSettings,
  toast,
} from './ui.js';

// ---------------------------------------------------------------------------
// Sample data (no live trading backend yet — representative figures).
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
  { id: 'quant-server-iso', name: 'Quant Server', badge: 'ISO', soon: true, desc: 'Bootable server image. Flash it, run it, and let Quant trade locally.', meta: 'coming soon' },
  { id: 'quant-android', name: 'Quant Monitor', badge: 'APK', soon: true, desc: 'Android app to view status on the go. Pairs as mouse/monitor for the server.', meta: 'coming soon' },
  { id: 'quant-quickstart', name: 'Quick-start guide', badge: 'TXT', soon: false, file: 'downloads/quant-server-quickstart.txt', desc: 'How to set up the server and connect your keyboard and phone.', meta: 'TXT · 2 KB' },
];

const gbp = (n) => formatMoney(n);

// ---------------------------------------------------------------------------
// Hero panel: dashboard summary / login prompt / verify prompt
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

function renderPanelDashboard(user) {
  const slot = $('#panel-slot');
  const spark = sparkline(PORTFOLIO.income);
  const holdings = PORTFOLIO.holdings
    .map((hd) => `
      <div class="chip">
        <span class="sym">${hd.sym}<small>${hd.name}</small></span>
        <span class="qty">${hd.shares} shares</span>
      </div>`)
    .join('');

  slot.innerHTML = `
    <div class="panel">
      <button class="share-btn" id="share-btn" title="Share" aria-label="Share">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5 8.6 10.5"/></svg>
      </button>
      <div class="panel-grid">
        <div>
          <div class="hello">HELLO, ${displayName(user).toUpperCase()}.</div>
          <div class="balance" id="balance" data-target="${PORTFOLIO.balance}">${gbp(0)}</div>
          <div class="balance-sub"><span class="up">▲ ${PORTFOLIO.changePct}%</span> today · auto-managed</div>
          <div class="holdings-label">YOU ARE SHAREHOLDER OF:</div>
          <div class="chips">${holdings}</div>
          <div class="panel-actions">
            <a class="btn btn--primary btn--sm" href="/dashboard/">Open dashboard →</a>
            <button class="btn btn--ghost btn--sm" id="see-summary">Summary</button>
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
  const share = $('#share-btn');
  if (summaryBtn) summaryBtn.addEventListener('click', () => toast(`Today: ${gbp(PORTFOLIO.balance)} · +${PORTFOLIO.changePct}% · ${PORTFOLIO.holdings.length} holdings`));
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
      renderPanelDashboard(refreshed);
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

function refreshPanel() {
  const u = auth.currentUser;
  if (!u) renderLoginPrompt();
  else if (!u.emailVerified) renderVerifyPrompt(u);
  else renderPanelDashboard(u);
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
    (entries) => { entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); obs.unobserve(e.target); } }); },
    { threshold: 0.12 }
  );
  $$('.reveal').forEach((el) => obs.observe(el));
}

// Scroll-spy for the in-page nav pills.
function setupScrollSpy() {
  const pills = $$('.nav-pill');
  const sections = ['home', 'about', 'download', 'contact'].map((id) => document.getElementById(id)).filter(Boolean);
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
  sections.forEach((s) => obs.observe(s));
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
initSettings();
initChrome({ onAccountChange: refreshPanel, onAvatar: () => document.getElementById('home').scrollIntoView() });
renderDownloads();
setupReveals();
animateTagline();
setupScrollSpy();

onAuthStateChanged(auth, async (user) => {
  if (user) {
    try { await loadAccountSettings(user); } catch (err) { console.warn('loadAccountSettings failed', err); }
  }
  updateHeader(user);
  refreshPanel();
  syncOpenSettings();
});
