import './style.css';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, USING_EMULATORS } from './firebase.js';
import {
  resendVerification,
  refreshUser,
  touchUserProfile,
  friendlyError,
} from './auth.js';
import { initSettings, loadAccountSettings, getSettings, formatMoney } from './settings.js';
import {
  $, displayName, openAuthModal, updateHeader, initChrome, syncOpenSettings,
  toast, openMoneyModal, showDashLoading, escapeHtml,
} from './ui.js';
import {
  PORTFOLIO, PERFORMANCE, ACTIVITY, HOLDING_COLORS, WATCHLIST,
  holdingsValue, totalValue, totalReturnAbs, totalReturnPct, tickMarket,
} from './portfolio.js';

const money = (n) => formatMoney(n);
const signedPct = (n) => (n >= 0 ? '+' : '−') + Math.abs(n).toFixed(1) + '%';
const cls = (n) => (n >= 0 ? 'pos' : 'neg');
const arrow = (n) => (n >= 0 ? '▲' : '▼');

let currentRange = '1M';
let lastSynced = new Date();
let tickTimer = null;
let authReady = false;

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function timeAgo(d) {
  const s = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return s + 's ago';
  return Math.floor(s / 60) + 'm ago';
}

// ---------------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------------
function areaPath(data, w, h, pad = 6) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const span = max - min || 1;
  const stepX = w / (data.length - 1);
  const y = (v) => h - pad - ((v - min) / span) * (h - pad * 2);
  const pts = data.map((v, i) => [i * stepX, y(v)]);
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const area = `${line} L ${w} ${h} L 0 ${h} Z`;
  return { line, area };
}

function performanceChart() {
  const data = PERFORMANCE[currentRange];
  const w = 640;
  const h = 240;
  const { line, area } = areaPath(data, w, h);
  const first = data[0];
  const last = data[data.length - 1];
  const chgPct = ((last - first) / first) * 100;
  return `
    <div class="card chart-card">
      <div class="card-head">
        <div>
          <div class="card-title">Portfolio performance</div>
          <div class="card-sub"><span class="${cls(chgPct)}">${signedPct(chgPct)}</span> over ${currentRange}</div>
        </div>
        <div class="segmented range" id="range-tabs">
          ${['1W', '1M', '1Y', 'ALL'].map((r) => `<button data-range="${r}" class="${r === currentRange ? 'on' : ''}">${r}</button>`).join('')}
        </div>
      </div>
      <svg class="perf-chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="perfGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="rgba(34,211,122,0.35)"/>
            <stop offset="100%" stop-color="rgba(34,211,122,0)"/>
          </linearGradient>
        </defs>
        <path class="chart-area" d="${area}" fill="url(#perfGrad)"/>
        <path class="chart-line" id="perf-line" d="${line}"/>
      </svg>
    </div>`;
}

function donut(segments, size = 168, stroke = 24) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const circles = segments
    .map((s) => {
      const len = s.frac * c;
      const el = `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${s.color}" stroke-width="${stroke}" stroke-dasharray="${len.toFixed(2)} ${(c - len).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>`;
      offset += len;
      return el;
    })
    .join('');
  return `<svg viewBox="0 0 ${size} ${size}" class="donut" width="${size}" height="${size}">${circles}</svg>`;
}

// ---------------------------------------------------------------------------
// Full dashboard
// ---------------------------------------------------------------------------
function renderDashboard(user, { soft = false } = {}) {
  const s = getSettings();
  const total = totalValue();
  const retAbs = totalReturnAbs();
  const retPct = totalReturnPct();
  const hv = holdingsValue() || 1;

  const segments = PORTFOLIO.holdings.map((h, i) => ({
    frac: (h.shares * h.price) / hv,
    color: HOLDING_COLORS[i % HOLDING_COLORS.length],
  }));

  const legend = PORTFOLIO.holdings
    .map((h, i) => {
      const val = h.shares * h.price;
      const pct = ((val / hv) * 100).toFixed(1);
      return `
      <div class="legend-row">
        <span class="dot" style="background:${HOLDING_COLORS[i % HOLDING_COLORS.length]}"></span>
        <span class="legend-sym">${h.sym}</span>
        <span class="legend-pct">${pct}%</span>
      </div>`;
    })
    .join('');

  const holdingRows = PORTFOLIO.holdings
    .map((h, i) => {
      const val = h.shares * h.price;
      const alloc = ((val / hv) * 100).toFixed(1);
      return `
      <tr class="holding-row" data-sym="${h.sym}" tabindex="0" role="button" aria-label="Open ${h.sym} details">
        <td><span class="dot" style="background:${HOLDING_COLORS[i % HOLDING_COLORS.length]}"></span><b>${h.sym}</b> <small>${h.name}</small></td>
        <td class="num">${h.shares}</td>
        <td class="num tick-price" data-sym="${h.sym}">${money(h.price)}</td>
        <td class="num">${money(val)}</td>
        <td class="num ${cls(h.dayPct)}">${arrow(h.dayPct)} ${Math.abs(h.dayPct).toFixed(1)}%</td>
        <td class="num">${alloc}%</td>
      </tr>`;
    })
    .join('');

  const watchRows = WATCHLIST.map((w) => `
    <div class="watch-row">
      <div><b>${w.sym}</b><small>${w.name}</small></div>
      <div class="watch-right">
        <span class="tick-price" data-sym="${w.sym}">${money(w.price)}</span>
        <span class="${cls(w.dayPct)}">${signedPct(w.dayPct)}</span>
      </div>
    </div>`).join('');

  const activityRows = ACTIVITY.map((a) => {
    const label = a.type === 'DEPOSIT' ? 'Deposit' : a.type === 'DIVIDEND' ? `Dividend · ${a.sym}` : `${a.type === 'BUY' ? 'Bought' : 'Sold'} ${a.qty} ${a.sym}`;
    const sign = a.type === 'SELL' || a.type === 'DIVIDEND' || a.type === 'DEPOSIT' ? '+' : '−';
    const tone = a.type === 'BUY' ? 'neg' : 'pos';
    return `
      <div class="act-row">
        <span class="act-badge act-${a.type.toLowerCase()}">${a.type[0]}</span>
        <div class="act-main"><span>${label}</span><small>${a.when}</small></div>
        <span class="act-amt ${tone}">${sign}${money(a.amount)}</span>
      </div>`;
  }).join('');

  const riskLabel = { conservative: 'Safe', balanced: 'Balanced', aggressive: 'Bold' }[s.riskProfile] || 'Balanced';

  const root = $('#dash-root');
  root.innerHTML = `
    <div class="dash-head">
      <div>
        <div class="dash-eyebrow">${greeting()},</div>
        <h1 class="dash-name">${escapeHtml(displayName(user))}</h1>
        <div class="sync-line"><span class="pulse"></span> Live preview · synced <span id="sync-ago">${timeAgo(lastSynced)}</span></div>
      </div>
      <div class="dash-actions">
        <button class="btn btn--ghost btn--sm" id="act-withdraw">Withdraw</button>
        <button class="btn btn--primary btn--sm" id="act-deposit">Deposit</button>
      </div>
    </div>

    <section class="stat-grid">
      <div class="card stat">
        <div class="stat-label">Total value</div>
        <div class="stat-value" id="stat-total" data-target="${total}">${soft ? money(total) : money(0)}</div>
        <div class="stat-foot ${cls(PORTFOLIO.todayPct)}" id="stat-today">${arrow(PORTFOLIO.todayPct)} ${money(Math.abs(PORTFOLIO.todayAbs))} (${signedPct(PORTFOLIO.todayPct)}) today</div>
      </div>
      <div class="card stat">
        <div class="stat-label">Invested</div>
        <div class="stat-value">${money(PORTFOLIO.deposited)}</div>
        <div class="stat-foot muted">across ${PORTFOLIO.holdings.length} holdings + cash</div>
      </div>
      <div class="card stat">
        <div class="stat-label">Total return</div>
        <div class="stat-value ${cls(retAbs)}" id="stat-return">${retAbs >= 0 ? '+' : '−'}${money(Math.abs(retAbs))}</div>
        <div class="stat-foot ${cls(retPct)}" id="stat-return-pct">${signedPct(retPct)} all time</div>
      </div>
      <div class="card stat">
        <div class="stat-label">Cash available</div>
        <div class="stat-value">${money(PORTFOLIO.cash)}</div>
        <div class="stat-foot muted">ready to invest</div>
      </div>
    </section>

    <section class="dash-grid">
      <div id="perf-slot">${performanceChart()}</div>
      <div class="card alloc-card">
        <div class="card-title">Allocation</div>
        <div class="alloc-body">
          <div class="donut-wrap">
            ${donut(segments)}
            <div class="donut-center"><span>${PORTFOLIO.holdings.length}</span><small>assets</small></div>
          </div>
          <div class="legend">${legend}</div>
        </div>
      </div>
    </section>

    <section class="dash-grid">
      <div class="card table-card">
        <div class="card-head">
          <div class="card-title">Holdings</div>
          <span class="card-sub">Click a row for details</span>
        </div>
        <div class="table-scroll">
          <table class="holdings-table">
            <thead><tr><th>Asset</th><th class="num">Shares</th><th class="num">Price</th><th class="num">Value</th><th class="num">Day</th><th class="num">Alloc.</th></tr></thead>
            <tbody>${holdingRows}</tbody>
          </table>
        </div>
      </div>
      <div class="dash-col">
        <div class="card status-card">
          <div class="card-title">Quant status</div>
          <div class="status-row"><span>Auto-invest</span><span class="pill ${s.autoInvest ? 'pill--on' : 'pill--off'}">${s.autoInvest ? 'On' : 'Off'}</span></div>
          <div class="status-row"><span>Risk profile</span><span class="pill">${riskLabel}</span></div>
          <div class="status-row"><span>Server</span><span class="pill pill--warn">Not paired</span></div>
          <div class="status-row"><span>Last action</span><span class="muted">${ACTIVITY[0].type === 'BUY' ? 'Bought' : 'Sold'} ${ACTIVITY[0].sym}</span></div>
          <button class="btn btn--ghost btn--sm" id="pair-cta" style="margin-top:12px;width:100%;justify-content:center">Pair server — coming soon</button>
        </div>
        <div class="card watch-card">
          <div class="card-title">Watchlist</div>
          <div class="watch-list">${watchRows}</div>
        </div>
      </div>
    </section>

    <section class="dash-grid">
      <div class="card act-card">
        <div class="card-title">Recent activity</div>
        <div class="act-list">${activityRows}</div>
      </div>
      <div class="card insight-card">
        <div class="card-title">Today's insight</div>
        <p class="insight-body">Quant is watching news + Yahoo Finance signals on your holdings. Risk profile is set to <strong>${riskLabel}</strong>${s.autoInvest ? ' with auto-invest on' : ' (auto-invest off)'}.</p>
        <ul class="insight-list">
          <li><span class="pos">▲</span> NVDA momentum remains constructive</li>
          <li><span class="neg">▼</span> TSLA volatility elevated — stop rules active</li>
          <li>Cash buffer ${money(PORTFOLIO.cash)} ready for dips</li>
        </ul>
      </div>
    </section>

    <p class="dash-note">Figures shown are sample / preview data. Live trading data appears once your local Quant server is paired.</p>
  `;

  if (!soft) countUp($('#stat-total'));
  drawLine($('#perf-line'));
  wireDashboard(user);
  startMarketTicks();
}

function openHoldingDetail(sym) {
  const h = PORTFOLIO.holdings.find((x) => x.sym === sym);
  if (!h) return;
  const i = PORTFOLIO.holdings.indexOf(h);
  const val = h.shares * h.price;
  let overlay = $('#holding-modal');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'holding-modal';
    overlay.className = 'modal-overlay';
    overlay.hidden = true;
    overlay.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><button class="modal-close" id="holding-close" aria-label="Close">&times;</button><div id="holding-body"></div></div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target.id === 'holding-modal') closeHolding(); });
    $('#holding-close', overlay).addEventListener('click', closeHolding);
  }
  $('#holding-body').innerHTML = `
    <div class="holding-detail">
      <div class="hd-top">
        <span class="dot" style="background:${HOLDING_COLORS[i % HOLDING_COLORS.length]};width:14px;height:14px"></span>
        <div>
          <h3 style="margin:0">${h.sym}</h3>
          <small style="color:var(--muted)">${h.name}</small>
        </div>
      </div>
      <div class="hd-grid">
        <div><span class="stat-label">Price</span><div class="stat-value" style="font-size:24px">${money(h.price)}</div></div>
        <div><span class="stat-label">Day</span><div class="stat-value ${cls(h.dayPct)}" style="font-size:24px">${signedPct(h.dayPct)}</div></div>
        <div><span class="stat-label">Shares</span><div class="stat-value" style="font-size:24px">${h.shares}</div></div>
        <div><span class="stat-label">Value</span><div class="stat-value" style="font-size:24px">${money(val)}</div></div>
      </div>
      <p class="auth-hint">Quant will buy, hold or sell ${h.sym} based on research + your risk profile. Per-holding controls arrive with server pairing.</p>
      <button class="btn btn--primary btn--block" id="hd-close-btn">Done</button>
    </div>`;
  overlay.hidden = false;
  document.body.style.overflow = 'hidden';
  $('#hd-close-btn').addEventListener('click', closeHolding);
}

function closeHolding() {
  const o = $('#holding-modal');
  if (o) o.hidden = true;
  document.body.style.overflow = '';
}

function wireDashboard(user) {
  const dep = $('#act-deposit');
  const wd = $('#act-withdraw');
  if (dep) dep.addEventListener('click', () => openMoneyModal('deposit'));
  if (wd) wd.addEventListener('click', () => openMoneyModal('withdraw'));
  const pair = $('#pair-cta');
  if (pair) pair.addEventListener('click', () => toast('Server pairing ships with the ISO release.'));

  Array.from(document.querySelectorAll('.holding-row')).forEach((row) => {
    const open = () => openHoldingDetail(row.dataset.sym);
    row.addEventListener('click', open);
    row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  });

  const tabs = $('#range-tabs');
  if (tabs) {
    Array.from(tabs.querySelectorAll('button')).forEach((b) => {
      b.addEventListener('click', () => {
        currentRange = b.dataset.range;
        $('#perf-slot').innerHTML = performanceChart();
        drawLine($('#perf-line'));
        wireDashboard(user);
      });
    });
  }
}

function startMarketTicks() {
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = setInterval(() => {
    if (!auth.currentUser || !auth.currentUser.emailVerified) return;
    // Don't re-render whole page if a modal/drawer is open
    const open = (id) => { const el = $(id); return el && !el.hidden; };
    if (open('#money-modal') || open('#holding-modal') || open('#settings-overlay') || open('#auth-modal')) {
      const ago = $('#sync-ago');
      if (ago) ago.textContent = timeAgo(lastSynced);
      return;
    }
    tickMarket();
    lastSynced = new Date();
    // Soft refresh numbers without count-up animation
    renderDashboard(auth.currentUser, { soft: true });
  }, 8000);
  // Keep "synced Xs ago" fresh
  if (window.__syncAgo) clearInterval(window.__syncAgo);
  window.__syncAgo = setInterval(() => {
    const ago = $('#sync-ago');
    if (ago) ago.textContent = timeAgo(lastSynced);
  }, 1000);
}

// ---------------------------------------------------------------------------
// Gates
// ---------------------------------------------------------------------------
function renderGate(mode, user) {
  if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
  const root = $('#dash-root');
  if (mode === 'verify') {
    root.innerHTML = `
      <div class="dash-gate">
        <div class="card gate-card">
          <div class="lock"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></div>
          <h2>Verify your email</h2>
          <p>We sent a link to <strong>${escapeHtml(user.email)}</strong>. Verify it to open your dashboard.</p>
          <div class="gate-actions">
            <button class="btn btn--primary" id="g-check">I've verified</button>
            <button class="btn btn--ghost" id="g-resend">Resend email</button>
          </div>
          ${USING_EMULATORS ? '<p class="dash-note">Dev: find the link in the <a href="http://127.0.0.1:4000/auth" target="_blank" rel="noopener" style="color:var(--accent)">Auth emulator</a>.</p>' : ''}
          <p class="dash-note" id="g-msg"></p>
        </div>
      </div>`;
    $('#g-check').addEventListener('click', async () => {
      $('#g-msg').textContent = 'Checking…';
      const r = await refreshUser();
      if (r && r.emailVerified) { await touchUserProfile(r); updateHeader(r); renderDashboard(r); }
      else $('#g-msg').textContent = 'Still not verified — click the link in your email first.';
    });
    $('#g-resend').addEventListener('click', async () => {
      try { await resendVerification(); $('#g-msg').textContent = 'Verification email resent.'; }
      catch (err) { $('#g-msg').textContent = friendlyError(err); }
    });
    return;
  }

  root.innerHTML = `
    <div class="dash-gate">
      <div class="card gate-card">
        <div class="lock"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></div>
        <h2>Sign in to view your dashboard</h2>
        <p>Your balance, holdings, performance and activity live here — sign in or create an account to continue.</p>
        <div class="gate-actions">
          <button class="btn btn--primary" id="g-signin">Sign in</button>
          <button class="btn btn--ghost" id="g-signup">Create account</button>
        </div>
        <p class="dash-note"><a href="/#home" style="color:var(--accent)">← Back to home</a></p>
      </div>
    </div>`;
  $('#g-signin').addEventListener('click', () => openAuthModal('signin'));
  $('#g-signup').addEventListener('click', () => openAuthModal('signup'));
}

function countUp(el) {
  if (!el) return;
  const target = Number(el.dataset.target || 0);
  const dur = 1100;
  const start = performance.now();
  function tick(now) {
    const t = Math.min((now - start) / dur, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = money(target * eased);
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function drawLine(path) {
  if (!path || typeof path.getTotalLength !== 'function') return;
  const len = path.getTotalLength();
  path.style.strokeDasharray = String(len);
  path.style.strokeDashoffset = String(len);
  path.getBoundingClientRect();
  path.style.transition = 'stroke-dashoffset 1.3s ease';
  requestAnimationFrame(() => { path.style.strokeDashoffset = '0'; });
}

function renderCurrent() {
  const u = auth.currentUser;
  if (!authReady) { showDashLoading($('#dash-root')); return; }
  if (!u) renderGate('login');
  else if (!u.emailVerified) renderGate('verify', u);
  else renderDashboard(u);
}

initSettings();
showDashLoading($('#dash-root'));
initChrome({ onAccountChange: renderCurrent, onAvatar: () => window.scrollTo({ top: 0, behavior: 'smooth' }) });

onAuthStateChanged(auth, async (user) => {
  authReady = true;
  if (user) {
    try { await loadAccountSettings(user); } catch (err) { console.warn('loadAccountSettings failed', err); }
    try { await touchUserProfile(user); } catch (err) { console.warn('touchUserProfile failed', err); }
  }
  updateHeader(user);
  renderCurrent();
  syncOpenSettings();
});
