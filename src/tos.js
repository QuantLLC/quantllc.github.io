import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase.js';

// Bump this when the legal text changes — users must re-accept.
export const TOS_VERSION = '2026-07-19';
const LS_KEY = 'quant.tos';

export const TOS_HTML = `
  <h3>Terms of Service &amp; Risk Disclosure</h3>
  <p class="tos-meta">Quant · England, United Kingdom · Version ${TOS_VERSION}<br/>
  Project by Alexander Korendowych · Contact: quantllcsupport@proton.me</p>

  <h4>1. Who we are</h4>
  <p>Quant (“Quant”, “we”, “us”) is a personal software project by Alexander Korendowych in England, United Kingdom. It is <strong>not</strong> a registered limited company (Ltd) or LLC. It provides tools that research markets and may automatically buy and sell holdings on a server you run locally. By creating an account or signing in, you agree to these terms in full.</p>

  <h4>2. Not financial advice</h4>
  <p><strong>Quant does not provide financial, investment, tax or legal advice.</strong> Nothing on this site, in the dashboard, app, server, or any communication from Quant is a recommendation to buy, sell or hold any security. You alone are responsible for your investment decisions.</p>

  <h4>3. Investing is risky — you can lose money</h4>
  <ul>
    <li>Investing in shares, ETFs and other instruments can result in <strong>partial or total loss of capital</strong>.</li>
    <li>Past performance does <strong>not</strong> guarantee future results.</li>
    <li>Automated systems can and do make losses. Markets gap, halt, or move against a position faster than software can react.</li>
    <li>News, Yahoo Finance data and other feeds can be delayed, incomplete or wrong. Quant may act on imperfect information.</li>
    <li>Currency moves, fees, spreads, taxes and liquidity can reduce or wipe out gains.</li>
    <li>You should only invest money you can afford to lose.</li>
  </ul>

  <h4>4. How Quant works (and what it does not guarantee)</h4>
  <p>Quant gathers market and news information (including from sources such as Yahoo Finance) and uses rules / models to decide whether to buy, hold or sell. Outcomes are uncertain. We do <strong>not</strong> guarantee profits, capital protection, uptime, or that every trade will be executed as intended.</p>

  <h4>5. Local server &amp; your hardware</h4>
  <p>The Quant server is designed to run on hardware you control (flashed from an ISO). You are responsible for that machine, power, network, physical security, backups and updates. Control is intended via physical/Bluetooth keyboard and related devices; the phone app is primarily for monitoring. Quant is not liable for hardware failure, theft, misconfiguration, or network outages.</p>

  <h4>6. Preview / sample data</h4>
  <p>Parts of the website (including some dashboard figures) may show <strong>sample or preview data</strong> until your server is paired. Sample numbers are not your real balances. Do not rely on preview UI as a statement of account.</p>

  <h4>7. Your account</h4>
  <p>You must use a real email address and keep your password confidential. You must be old enough to form a binding contract in your jurisdiction (usually 18+). You may delete your account from Settings. We may suspend accounts used for abuse, fraud or illegal activity.</p>

  <h4>8. Data</h4>
  <p>We process account and settings data as described in our <a href="/privacy/" target="_blank" rel="noopener">Privacy Policy</a>. Passwords are hashed by our authentication provider and are never stored by us in plain text.</p>

  <h4>9. Liability</h4>
  <p>To the fullest extent permitted by law, Alexander Korendowych and the Quant project are not liable for any trading losses, lost profits, indirect or consequential damages arising from use of Quant, market data errors, software bugs, downtime, or your local server. Our total liability for any claim relating to the service shall not exceed the fees you paid us in the 12 months before the claim (or £0 if you paid nothing).</p>

  <h4>10. Acceptance</h4>
  <p>By clicking <strong>I agree</strong> you confirm that you have read this disclosure, understand that investing is risky, accept that you may lose money, and agree to the Terms of Use at <a href="/terms/" target="_blank" rel="noopener">quantllc.github.io/terms</a>.</p>
`;

const SESSION_KEY = 'quant.tos.session';

function readLocal() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch { return {}; }
}
function writeLocal(partial) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ ...readLocal(), ...partial }));
  } catch { /* ignore */ }
}

function sessionOk() {
  try { return sessionStorage.getItem(SESSION_KEY) === TOS_VERSION; } catch { return false; }
}
function markSession() {
  try { sessionStorage.setItem(SESSION_KEY, TOS_VERSION); } catch { /* ignore */ }
}

/** Clear per-session acceptance (call on sign-out so TOS can reappear next login). */
export function clearTosSession() {
  try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
}

export function localTosOk() {
  const l = readLocal();
  return l.accepted === true && l.version === TOS_VERSION && l.dontShowAgain === true;
}

let ensureLock = null;

export async function fetchTosState(user) {
  if (!user) return { accepted: false, dontShowAgain: false, version: null };
  try {
    const snap = await getDoc(doc(db, 'users', user.uid));
    const d = snap.exists() ? snap.data() : {};
    return {
      accepted: d.tosAccepted === true && d.tosVersion === TOS_VERSION,
      dontShowAgain: d.tosDontShowAgain === true,
      version: d.tosVersion || null,
    };
  } catch {
    const l = readLocal();
    return {
      accepted: l.accepted === true && l.version === TOS_VERSION,
      dontShowAgain: !!l.dontShowAgain,
      version: l.version || null,
    };
  }
}

export async function persistTosAcceptance(user, { dontShowAgain }) {
  writeLocal({ accepted: true, dontShowAgain: !!dontShowAgain, version: TOS_VERSION, at: Date.now() });
  markSession();
  if (!user) return;
  await setDoc(
    doc(db, 'users', user.uid),
    {
      tosAccepted: true,
      tosDontShowAgain: !!dontShowAgain,
      tosVersion: TOS_VERSION,
      tosAcceptedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

/**
 * Show the blocking TOS modal.
 * @param {{ required?: boolean, title?: string }} opts
 * @returns {Promise<{ accepted: boolean, dontShowAgain: boolean }>}
 */
export function promptTos(opts = {}) {
  const required = opts.required !== false;
  return new Promise((resolve) => {
    let overlay = document.getElementById('tos-modal');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'tos-modal';
      overlay.className = 'modal-overlay tos-overlay';
      overlay.innerHTML = `
        <div class="modal tos-modal" role="dialog" aria-modal="true" aria-labelledby="tos-title">
          <div class="tos-head">
            <span class="auth-logo">QUANT<span class="dot">.</span></span>
            <h2 id="tos-title">Agreement required</h2>
          </div>
          <div class="tos-scroll" id="tos-scroll"></div>
          <div class="tos-foot">
            <label class="tos-check"><input type="checkbox" id="tos-dont" /> Don't show this again after I agree</label>
            <div class="tos-actions">
              <button type="button" class="btn btn--ghost" id="tos-decline">Decline</button>
              <button type="button" class="btn btn--primary" id="tos-agree" disabled>Scroll to enable · I agree</button>
            </div>
            <p class="tos-foot-note">You must accept to create an account or use the dashboard.</p>
          </div>
        </div>`;
      document.body.appendChild(overlay);
    }

    const scroll = overlay.querySelector('#tos-scroll');
    const agreeBtn = overlay.querySelector('#tos-agree');
    const declineBtn = overlay.querySelector('#tos-decline');
    const dont = overlay.querySelector('#tos-dont');
    scroll.innerHTML = TOS_HTML;
    dont.checked = false;
    agreeBtn.disabled = true;
    agreeBtn.textContent = 'Scroll to enable · I agree';
    overlay.querySelector('#tos-title').textContent = opts.title || 'Terms of Service & Risk Disclosure';

    const onScroll = () => {
      const el = scroll;
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 24;
      if (atBottom) {
        agreeBtn.disabled = false;
        agreeBtn.textContent = 'I agree';
      }
    };
    scroll.scrollTop = 0;
    scroll.addEventListener('scroll', onScroll);
    // Tiny TOS on tall screens may already fit — enable after a tick if no overflow
    requestAnimationFrame(() => {
      if (scroll.scrollHeight <= scroll.clientHeight + 8) {
        agreeBtn.disabled = false;
        agreeBtn.textContent = 'I agree';
      }
    });

    const finish = (accepted) => {
      scroll.removeEventListener('scroll', onScroll);
      overlay.hidden = true;
      document.body.style.overflow = '';
      resolve({ accepted, dontShowAgain: !!dont.checked });
    };

    agreeBtn.onclick = () => finish(true);
    declineBtn.onclick = () => {
      if (required) finish(false);
      else finish(false);
    };
    // Clicking backdrop does not dismiss when required
    overlay.onclick = (e) => {
      if (e.target === overlay && !required) finish(false);
    };

    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
  });
}

/**
 * Ensure the signed-in user has accepted the current TOS.
 * Shows the modal when needed. Returns true if they may proceed.
 *
 * - "Don't show again" → skip until TOS_VERSION changes
 * - Otherwise → show once per browser session / sign-in
 */
export async function ensureTosAccepted(user) {
  if (!user) return false;
  if (ensureLock) return ensureLock;

  ensureLock = (async () => {
    if (localTosOk()) {
      markSession();
      try { await persistTosAcceptance(user, { dontShowAgain: true }); } catch { /* ignore */ }
      return true;
    }
    if (sessionOk()) return true;

    const state = await fetchTosState(user);
    if (state.accepted && state.dontShowAgain) {
      writeLocal({ accepted: true, dontShowAgain: true, version: TOS_VERSION });
      markSession();
      return true;
    }

    const result = await promptTos({
      required: true,
      title: state.accepted ? 'Review Terms & Risks' : 'Agree to continue',
    });
    if (!result.accepted) return false;
    await persistTosAcceptance(user, { dontShowAgain: result.dontShowAgain });
    markSession();
    return true;
  })();

  try {
    return await ensureLock;
  } finally {
    ensureLock = null;
  }
}
