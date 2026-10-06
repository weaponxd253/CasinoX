/* ============================================================
   CASINO X — SHELL  (global: CasinoShell)
   ------------------------------------------------------------
   Chrome + meta-game for every page.

   Game pages:
       <script src="../wallet.js"></script>
       <script src="../casino-shell.js"></script>
       <script src="game.js"></script>
       ... CasinoShell.mount({ name:'Coin Flip', subtitle:'Double or Nothing' });

   Pages with their own header (e.g. the lobby):
       ... CasinoShell.standalone({ lobbyHref:'index.html' });
       // add elements with ids #shell-level / #shell-xp-fill / #shell-bonus-btn
       // anywhere in your own header and they'll be wired automatically.

   Meta-game API:
       CasinoShell.awardXp(wager)      → grant XP scaled to a wager
       CasinoShell.profile             → { xp, level, into, need, streak }
       CasinoShell.dailyBonus.available() / .open() / .claim()
   ============================================================ */

const CasinoShell = (function () {
  // Where this script was served from — dev-tools.js sits beside it.
  const SHELL_SRC = (typeof document !== 'undefined' && document.currentScript?.src) || '';
  const THEME_KEY = 'theme';
  const MUTE_KEY = 'casinoMuted';
  const PROFILE_KEY = 'casinoProfile';
  let cfg = {};

  /* ── Soft-launch settings ──
     FEEDBACK_URL: paste your feedback form link here (a Google Form works).
     Until it's set, the menu asks testers to copy their debug info instead. */
  const FEEDBACK_URL = '';
  const BUILD = (SHELL_SRC.match(/[?&]v=([^&]+)/) || [])[1] || 'dev';

  // The last few page errors, so a tester's debug info shows what went wrong
  const recentErrors = [];
  if (typeof window !== 'undefined') {
    const note = msg => { recentErrors.push(`${new Date().toISOString().slice(11, 19)} ${String(msg).slice(0, 160)}`); recentErrors.splice(0, recentErrors.length - 5); };
    window.addEventListener('error', e => note(`${e.message} (${(e.filename || '').split('/').pop()}:${e.lineno})`));
    window.addEventListener('unhandledrejection', e => note(`Promise: ${e.reason?.message ?? e.reason}`));
  }

  /* ───────── PROGRESSION DATA ───────── */
  const BONUS_TABLE = [50, 75, 100, 150, 250, 400, 750];   // streak day 1..7 (plateaus)
  const XP_PER_LEVEL = (lvl) => 50 * lvl;                   // XP to advance FROM level `lvl`
  const LEVELUP_CHIPS = (lvl) => lvl * 25;                  // chips paid on reaching `lvl`

  const profile = {
    data: { xp: 0, lastClaim: null, streak: 0 },
    load() {
      try { Object.assign(this.data, JSON.parse(localStorage.getItem(PROFILE_KEY)) || {}); }
      catch (e) { /* fresh profile */ }
      return this.data;
    },
    save() { localStorage.setItem(PROFILE_KEY, JSON.stringify(this.data)); }
  };

  function levelFromXp(xp) {
    let level = 1, acc = 0, need = XP_PER_LEVEL(1);
    while (xp >= acc + need) { acc += need; level++; need = XP_PER_LEVEL(level); }
    return { level, into: xp - acc, need };
  }

  function snapshot() {
    const l = levelFromXp(profile.data.xp);
    return { xp: profile.data.xp, level: l.level, into: l.into, need: l.need, streak: profile.data.streak };
  }

  /* Award XP scaled to a wager (1 XP per $1, min 1). Handles level-ups + rewards. */
  function awardXp(wager) {
    // +50% while a hotel high roller has the high-stakes table open
    const mult = window.HotelPerks?.xpMult?.() ?? 1;
    const pts = Math.max(1, Math.round((Number(wager) || 0) * mult));
    const before = levelFromXp(profile.data.xp).level;
    profile.data.xp += pts;
    const after = levelFromXp(profile.data.xp).level;
    profile.save();
    if (after > before) {
      let chips = 0;
      for (let L = before + 1; L <= after; L++) chips += LEVELUP_CHIPS(L);
      if (CasinoShell.wallet) CasinoShell.wallet.add(chips);
      toast(`⭐ Level ${after}! +$${chips.toFixed(2)} level bonus`);
      sound.jackpot();
    }
    renderProgression();
  }

  /* ───────── DAILY BONUS ───────── */
  function dayStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function bonusState() {
    const today = dayStr(new Date());
    const yest = dayStr(new Date(Date.now() - 86400000));
    const claimedToday = profile.data.lastClaim === today;
    const pendingStreak = claimedToday
      ? profile.data.streak
      : (profile.data.lastClaim === yest ? profile.data.streak + 1 : 1);
    const base = BONUS_TABLE[Math.min(pendingStreak, BONUS_TABLE.length) - 1];
    // Hotel perks (Casino Floor chip bonus, Bar Sky Lounge) add to the base.
    const extra = window.HotelPerks?.dailyBonusExtra?.(base) ?? 0;
    return { today, yest, claimedToday, pendingStreak, base, extra, reward: base + extra };
  }

  const dailyBonus = {
    available() { return profile.data.lastClaim !== dayStr(new Date()); },
    open() { const m = document.getElementById('shell-bonus-modal'); if (m) { renderBonusModal(); openModal(m); } },
    close() { closeModal(document.getElementById('shell-bonus-modal')); },
    claim() {
      if (!this.available()) return false;
      const s = bonusState();
      profile.data.streak = s.pendingStreak;
      profile.data.lastClaim = s.today;
      profile.save();
      if (CasinoShell.wallet) CasinoShell.wallet.add(s.reward);
      awardXp(20);
      celebrate(s.reward);
      renderProgression();
      renderBonusModal();
      return s;
    }
  };

  function renderBonusModal() {
    const strip = document.getElementById('shell-streak');
    const sub = document.querySelector('.shell-bonus-sub');
    const claim = document.getElementById('shell-claim');
    if (!strip) return;
    const s = bonusState();
    const activeDay = Math.min(s.pendingStreak, BONUS_TABLE.length);   // 1-based

    strip.innerHTML = BONUS_TABLE.map((amt, i) => {
      const day = i + 1;
      let cls = 'day';
      if (s.claimedToday) { if (day <= activeDay) cls += ' claimed'; }
      else { if (day < activeDay) cls += ' claimed'; else if (day === activeDay) cls += ' today'; }
      return `<div class="${cls}"><div class="d">Day ${day}</div><div class="amt">$${amt}</div></div>`;
    }).join('');

    if (s.claimedToday) {
      sub.textContent = `Streak: ${profile.data.streak} day${profile.data.streak === 1 ? '' : 's'}. Come back tomorrow to keep it going!`;
      claim.disabled = true;
      claim.textContent = 'Claimed today ✓';
    } else {
      sub.textContent = s.extra > 0
        ? `Day ${activeDay} of your streak — $${s.base} + $${s.extra} from your hotel perks!`
        : `Day ${activeDay} of your streak — claim $${s.reward}!`;
      claim.disabled = false;
      claim.textContent = `Claim $${s.reward}`;
    }
  }

  /* ───────── THEME ───────── */
  const theme = {
    get() { return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'; },
    apply(t) {
      const light = t === 'light';
      document.documentElement.dataset.theme = light ? 'light' : 'dark';
      document.body.classList.toggle('light-theme', light);
      document.body.classList.toggle('dark-theme', !light);
      document.body.classList.toggle('light', light);
      localStorage.setItem(THEME_KEY, light ? 'light' : 'dark');
      syncThemeControls(light ? 'light' : 'dark');
    },
    toggle() { this.apply(this.get() === 'light' ? 'dark' : 'light'); }
  };

  function syncThemeControls(mode = theme.get()) {
    const light = mode === 'light';
    document.querySelectorAll('#shell-theme-icon, #theme-icon, [data-theme-icon]').forEach(icon => {
      icon.className = light ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
    });
    document.querySelectorAll('#shell-theme-btn, #theme-toggle, [data-theme-toggle]').forEach(btn => {
      btn.setAttribute('aria-label', light ? 'Switch to dark theme' : 'Switch to light theme');
      btn.setAttribute('aria-pressed', light ? 'true' : 'false');
      btn.title = light ? 'Switch to dark theme' : 'Switch to light theme';
    });
  }

  function wireThemeControls() {
    document.querySelectorAll('#shell-theme-btn, #theme-toggle, [data-theme-toggle]').forEach(btn => {
      if (btn.dataset.themeWired === '1') return;
      btn.dataset.themeWired = '1';
      btn.addEventListener('click', () => theme.toggle());
    });
    syncThemeControls();
  }

  /* ───────── SOUND ───────── */
  let actx = null;
  const sound = {
    get muted() { return localStorage.getItem(MUTE_KEY) === '1'; },
    set muted(v) { localStorage.setItem(MUTE_KEY, v ? '1' : '0'); this._sync(); },
    toggle() { this.muted = !this.muted; },
    _sync() { const b = document.getElementById('shell-sound-icon'); if (b) b.className = this.muted ? 'fa-solid fa-volume-xmark' : 'fa-solid fa-volume-high'; },
    tone(freq, type = 'sine', dur = 0.2, gain = 0.25, delay = 0) {
      if (this.muted) return;
      try {
        actx = actx || new (window.AudioContext || window.webkitAudioContext)();
        const o = actx.createOscillator(), g = actx.createGain();
        o.connect(g); g.connect(actx.destination);
        o.type = type;
        o.frequency.setValueAtTime(freq, actx.currentTime + delay);
        g.gain.setValueAtTime(gain, actx.currentTime + delay);
        g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + delay + dur);
        o.start(actx.currentTime + delay);
        o.stop(actx.currentTime + delay + dur);
      } catch (e) { /* no audio */ }
    },
    play(id) { if (this.muted) return; const el = document.getElementById(id); if (el) el.play().catch(() => { }); },
    click() { this.tone(180, 'square', 0.08, 0.15); },
    win() { this.tone(523, 'sine', 0.2, 0.3, 0); this.tone(784, 'sine', 0.25, 0.3, 0.15); },
    jackpot() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 'sine', 0.3, 0.35, i * 0.12)); },
    lose() { this.tone(180, 'sawtooth', 0.18, 0.15, 0); this.tone(140, 'sawtooth', 0.2, 0.1, 0.15); }
  };

  /* ───────── DIALOGS ─────────
     Every shell modal goes through openModal/closeModal: focus moves into
     the dialog and back to whatever opened it, Tab stays inside, and
     Escape or a backdrop click closes it. */
  const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';
  const modalReturnFocus = new Map();

  function openModal(modal) {
    if (!modal) return;
    if (!modal.classList.contains('open')) modalReturnFocus.set(modal, document.activeElement);
    modal.classList.add('open');
    const box = modal.querySelector('.shell-modal-box');
    const first = [...modal.querySelectorAll(FOCUSABLE)].find(el => el.offsetParent !== null);
    (first || box)?.focus({ preventScroll: true });
  }

  function closeModal(modal) {
    if (!modal || !modal.classList.contains('open')) return;
    modal.classList.remove('open');
    const back = modalReturnFocus.get(modal);
    modalReturnFocus.delete(modal);
    if (back && document.contains(back)) back.focus({ preventScroll: true });
  }

  function topModal() {
    const open = [...document.querySelectorAll('.shell-modal.open')];
    return open[open.length - 1] || null;
  }

  function wireModalKeys() {
    document.addEventListener('keydown', (e) => {
      const modal = topModal();
      if (!modal) return;
      if (e.key === 'Escape') { e.preventDefault(); closeModal(modal); return; }
      if (e.key !== 'Tab') return;
      const items = [...modal.querySelectorAll(FOCUSABLE)].filter(el => el.offsetParent !== null);
      if (!items.length) { e.preventDefault(); return; }
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || !modal.contains(document.activeElement))) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !modal.contains(document.activeElement))) {
        e.preventDefault(); first.focus();
      }
    });
  }

  /* ───────── MOTION + ANNOUNCEMENTS ───────── */
  // Honour the OS "reduce motion" setting: no confetti, instant reels/text.
  function reducedMotion() {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    catch (_) { return false; }
  }

  /* Read a result to screen readers once (a live region that games write
     to instead of their animated, character-by-character displays). */
  function announce(text) {
    const region = document.getElementById('shell-announcer');
    if (!region || !text) return;
    region.textContent = '';
    setTimeout(() => { region.textContent = text; }, 30);
  }

  /* ───────── KEYBOARD SHORTCUTS ─────────
     Games register shortcuts; "?" lists them. Keys are ignored while a
     dialog is open or the player is typing, and Space/Enter still press a
     focused button instead of triggering a shortcut. */
  const shortcuts = [];

  function registerShortcuts(list) {
    shortcuts.push(...list);
    renderShortcutHint();
  }

  function shortcutLabel(key) {
    return { ' ': 'Space', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓' }[key] ?? key.toUpperCase();
  }

  // ['1','2','3','4','5'] → "1–5"; anything else → "H / ←"
  function shortcutKeysHtml(keys) {
    const digits = keys.every(k => /^\d$/.test(k)) && keys.length > 2
      && keys.every((k, i) => i === 0 || Number(k) === Number(keys[i - 1]) + 1);
    if (digits) return `<kbd>${keys[0]}</kbd>–<kbd>${keys[keys.length - 1]}</kbd>`;
    return keys.map(k => `<kbd>${shortcutLabel(k)}</kbd>`).join(' / ');
  }

  function showShortcuts() {
    if (!shortcuts.length) return;
    info('Keyboard shortcuts', `
      <ul class="shell-shortcut-list">
        ${shortcuts.map(s => `<li>${shortcutKeysHtml(s.keys)} <span>${s.label}</span></li>`).join('')}
        <li><kbd>?</kbd> <span>Show this list</span></li>
        <li><kbd>Esc</kbd> <span>Close a dialog</span></li>
      </ul>`);
  }

  function renderShortcutHint() {
    if (document.getElementById('shell-shortcut-hint') || !document.querySelector('.shell-footer')) return;
    const hint = document.createElement('button');
    hint.type = 'button';
    hint.id = 'shell-shortcut-hint';
    hint.className = 'shell-shortcut-hint';
    hint.innerHTML = '<kbd>?</kbd> Keyboard shortcuts';
    hint.addEventListener('click', showShortcuts);
    document.querySelector('.shell-footer').before(hint);
  }

  function wireShortcutKeys() {
    document.addEventListener('keydown', (e) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      if (topModal()) return;
      const target = e.target;
      if (target.closest?.('input, select, textarea, [contenteditable]')) return;
      if ((e.key === ' ' || e.key === 'Enter') && target.closest?.('button, a')) return;
      if (e.key === '?') { e.preventDefault(); showShortcuts(); return; }
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const match = shortcuts.find(s => s.keys.includes(key));
      if (!match || e.repeat) return;
      e.preventDefault();
      match.run(e);
    });
  }

  /* ───────── TOAST ───────── */
  function toast(msg, ms = 4000) {
    const wrap = document.getElementById('shell-toasts');
    if (!wrap) return;
    const t = document.createElement('div');
    t.className = 'shell-toast';
    t.textContent = msg;
    t.title = 'Dismiss';
    t.addEventListener('click', () => t.remove());   // tap to dismiss
    wrap.appendChild(t);
    while (wrap.children.length > 3) wrap.firstChild.remove();   // never stack more than 3
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 300); }, ms);
  }

  /* ───────── CELEBRATION ───────── */
  /* celebrate(amount)                       → casino chips (gold, jackpot sound)
     celebrate(amount, { currency: 'hotel' }) → hotel cash (green, building icon,
                                                 softer chime) so shift earnings
                                                 never look like chip winnings */
  function celebrate(amount, { currency = 'chips' } = {}) {
    const hotel = currency === 'hotel';
    if (amount > 0) {
      const big = document.getElementById('shell-bigwin');
      if (big) {
        big.classList.toggle('hotel-cash', hotel);
        big.innerHTML = hotel
          ? `<span class="bigwin-amount">+$${Math.round(amount).toLocaleString()}</span><span class="bigwin-unit"><i class="fa-solid fa-building" aria-hidden="true"></i> hotel cash</span>`
          : `<span class="bigwin-amount">+$${Number(amount).toFixed(2)}</span><span class="bigwin-unit">chips</span>`;
        big.classList.remove('show'); void big.offsetWidth; big.classList.add('show');
      }
    }
    if (hotel) sound.win(); else sound.jackpot();
    if (!reducedMotion()) confettiBurst(hotel ? ['#6fcf97', '#a8e6c3', '#f5ead5', '#c9a84c'] : undefined);
  }
  function confettiBurst(colors = ['#c9a84c', '#e8cb80', '#f5ead5', '#6fcf97']) {
    const canvas = document.getElementById('shell-confetti');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = innerWidth; canvas.height = innerHeight;
    const pieces = Array.from({ length: 140 }, () => ({
      x: innerWidth / 2 + (Math.random() - 0.5) * 120, y: innerHeight / 3,
      vx: (Math.random() - 0.5) * 12, vy: Math.random() * -14 - 4,
      g: 0.35 + Math.random() * 0.2, s: 5 + Math.random() * 7,
      rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
      c: colors[Math.floor(Math.random() * colors.length)], life: 1
    }));
    let frame = 0;
    (function tick() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pieces.forEach(p => {
        p.vy += p.g; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life -= 0.008;
        ctx.save(); ctx.globalAlpha = Math.max(0, p.life);
        ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6); ctx.restore();
      });
      if (frame++ < 150) requestAnimationFrame(tick); else ctx.clearRect(0, 0, canvas.width, canvas.height);
    })();
  }

  /* ───────── GAME OVER ───────── */
  function gameOver(opts = {}) {
    const modal = document.getElementById('shell-modal');
    if (!modal) return;
    modal.querySelector('.shell-modal-box h3').textContent = opts.title || '💸 Out of Chips';
    modal.querySelector('.shell-modal-box p').textContent = opts.message || "You've run out of funds. Visit the Cashier to keep playing.";
    const comp = window.HotelPerks?.compOffer?.();
    const compBtn = document.getElementById('shell-oos-comp');
    if (compBtn) {
      compBtn.hidden = !comp?.available;
      if (comp?.available) compBtn.textContent = `Hotel comp · ${comp.chips} chips`;
    }
    openModal(modal);
  }

  /* ───────── CASHIER ─────────
     Free refill when the bankroll is busted, or exchange hotel cash for
     chips at any time (comps — see hotel-perks.js). */
  function renderCashier() {
    const m = document.getElementById('shell-cashier-modal');
    if (!m || !window.CasinoWallet) return;
    const w = CasinoWallet;
    m.querySelector('.shell-cashier-balance').textContent = `Bankroll: $${w.get().toFixed(2)} in chips`;

    const refill = document.getElementById('shell-cashier-refill');
    const canRefill = w.canTopUp();
    refill.disabled = !canRefill;
    m.querySelector('[data-cashier="refill"] .cashier-note').textContent = canRefill
      ? `Brings your bankroll back to $${w.STARTING}.`
      : `Available once your bankroll drops below $${w.TOPUP_BELOW}.`;

    const compRow = m.querySelector('[data-cashier="comp"]');
    const offer = window.HotelPerks?.compOffer?.();
    compRow.hidden = !offer;
    if (offer) {
      const btn = document.getElementById('shell-cashier-comp');
      btn.disabled = !offer.available;
      btn.textContent = `${offer.chips} chips for $${offer.cost.toLocaleString()}`;
      compRow.querySelector('.cashier-note').textContent = offer.available
        ? `Paid from hotel cash ($${Math.floor(offer.hotelCash).toLocaleString()} available).`
        : offer.reason;
    }
  }

  function openCashier() {
    renderCashier();
    openModal(document.getElementById('shell-cashier-modal'));
  }

  function takeComp() {
    const taken = window.HotelPerks?.takeComp?.();
    if (!taken) { renderCashier(); return false; }
    toast(`+${taken.chips} chips · $${taken.cost.toLocaleString()} charged to your hotel`);
    celebrate(taken.chips);
    return taken;
  }

  /* ───────── INFO / RULES ───────── */
  function info(title, html) {
    const m = document.getElementById('shell-info-modal');
    if (!m) return;
    m.classList.remove('is-welcome');
    m.querySelector('.shell-info-title').textContent = title || '';
    m.querySelector('.shell-info-body').innerHTML = html || '';
    openModal(m);
  }

  /* ───────── BALANCE + PROGRESSION RENDER ───────── */
  function syncBalance(b) {
    const el = document.getElementById('shell-balance-amt');
    if (el) el.textContent = Number(b).toFixed(2);
    const pill = document.getElementById('shell-balance');
    if (pill) { pill.classList.remove('bump'); void pill.offsetWidth; pill.classList.add('bump'); }
  }
  function renderProgression() {
    const s = snapshot();
    const lvl = document.getElementById('shell-level');
    const fill = document.getElementById('shell-xp-fill');
    const txt = document.getElementById('shell-xp-text');
    if (lvl) lvl.textContent = s.level;
    const pct = Math.round((s.into / s.need) * 100);
    if (fill) fill.style.width = `${pct}%`;
    // #shell-xp-text is the bar's track and holds the fill element, so label
    // it with attributes rather than textContent (which would delete the fill).
    if (txt) {
      const label = `Level ${s.level}: ${s.into}/${s.need} XP`;
      txt.title = label;
      txt.setAttribute('role', 'progressbar');
      txt.setAttribute('aria-label', label);
      txt.setAttribute('aria-valuemin', '0');
      txt.setAttribute('aria-valuemax', String(s.need));
      txt.setAttribute('aria-valuenow', String(s.into));
    }
    const bonus = document.getElementById('shell-bonus-btn');
    if (bonus) bonus.classList.toggle('ready', dailyBonus.available());
  }

  /* ───────── INJECTION ───────── */
  function progressHTML() {
    return `
      <div class="shell-progress" title="Level & XP">
        <span class="lvl">Lv <span id="shell-level">1</span></span>
        <div class="shell-xp" id="shell-xp-text" aria-label="XP progress">
          <div class="shell-xp-fill" id="shell-xp-fill"></div>
        </div>
      </div>
      <button class="shell-pill shell-icon-btn shell-bonus" id="shell-bonus-btn" aria-label="Daily bonus" title="Daily bonus">
        <i class="fa-solid fa-gift"></i>
      </button>`;
  }

  // "Casino Floor" → "Casino", "Hotel Lobby" → "Hotel" on narrow screens
  function shortLabel(label) { return String(label).split(' ')[0]; }

  function injectHeader() {
    const lobby = cfg.lobbyHref || '../casino.html';
    const hotelOperation = String(lobby).includes('../..');
    const lobbyLabel = cfg.lobbyLabel || (hotelOperation ? 'Hotel Lobby' : 'Casino Floor');
    const hotel = cfg.hotelHref === undefined
      ? (hotelOperation ? '' : '../hotel/index.html')
      : cfg.hotelHref;
    const header = document.createElement('header');
    header.className = 'shell-header';
    header.innerHTML = `
      <div class="shell-logo">
        <span class="name">${cfg.name || 'Casino X'}</span>
        <span class="sub">${cfg.subtitle || 'Casino Edition'}</span>
      </div>
      <div class="shell-controls">
        <div class="shell-balance" id="shell-balance" title="Casino chips — one bankroll for every game">
          <span class="chip" aria-hidden="true"></span> $<span id="shell-balance-amt">0.00</span><span class="balance-unit">chips</span>
        </div>
        ${progressHTML()}
        <a class="shell-pill" href="${lobby}" aria-label="${lobbyLabel}"><i class="fa-solid fa-dice" aria-hidden="true"></i> <span class="pill-label" aria-hidden="true">${lobbyLabel}</span><span class="pill-label-short" aria-hidden="true">${shortLabel(lobbyLabel)}</span></a>
        ${hotel ? `<a class="shell-pill shell-hotel-link" href="${hotel}" aria-label="Hotel Lobby"><i class="fa-solid fa-hotel" aria-hidden="true"></i> <span class="pill-label" aria-hidden="true">Hotel Lobby</span><span class="pill-label-short" aria-hidden="true">Hotel</span></a>` : ''}
        <button class="shell-pill shell-icon-btn" id="shell-theme-btn" aria-label="Switch to light theme" title="Switch to light theme"><i id="shell-theme-icon" class="fa-solid fa-moon"></i></button>
        <button class="shell-pill shell-icon-btn" type="button" data-shell-menu aria-label="Save and settings" title="Save &amp; settings"><i class="fa-solid fa-gear" aria-hidden="true"></i></button>
        <button class="shell-pill shell-icon-btn" id="shell-sound-btn" aria-label="Toggle sound"><i id="shell-sound-icon" class="fa-solid fa-volume-high"></i></button>
      </div>`;
    document.body.insertBefore(header, document.body.firstChild);
    document.getElementById('shell-sound-btn').addEventListener('click', () => sound.toggle());
  }

  function injectOverlays() {
    const lobby = cfg.lobbyHref || '../casino.html';
    const hotelOperation = String(lobby).includes('../..');
    const lobbyLabel = cfg.lobbyLabel || (hotelOperation ? 'Hotel Lobby' : 'Casino Floor');
    const html = `
      <div id="shell-toasts" role="status" aria-live="polite"></div>
      <div id="shell-announcer" class="shell-sr-only" aria-live="polite" aria-atomic="true"></div>
      <canvas id="shell-confetti"></canvas>
      <div id="shell-bigwin"></div>
      <div class="shell-modal" id="shell-modal">
        <div class="shell-modal-box" role="alertdialog" aria-modal="true" aria-labelledby="shell-modal-title" aria-describedby="shell-modal-desc" tabindex="-1">
          <h3 id="shell-modal-title">💸 Out of Chips</h3><p id="shell-modal-desc">You've run out of funds.</p>
          <div class="shell-modal-actions">
            <button class="btn primary" id="shell-cashier">Cashier · $100</button>
            <button class="btn secondary" id="shell-oos-comp" hidden>Hotel comp</button>
            <a class="btn secondary" href="${lobby}">${lobbyLabel}</a>
            <button class="btn secondary shell-modal-close">Close</button>
          </div>
        </div>
      </div>
      <div class="shell-modal" id="shell-info-modal">
        <div class="shell-modal-box info" role="dialog" aria-modal="true" aria-labelledby="shell-info-title" tabindex="-1">
          <h3 class="shell-info-title" id="shell-info-title"></h3>
          <div class="shell-info-body"></div>
          <div class="shell-modal-actions"><button class="btn secondary shell-info-close">Close</button></div>
        </div>
      </div>
      <div class="shell-modal" id="shell-cashier-modal">
        <div class="shell-modal-box cashier" role="dialog" aria-modal="true" aria-labelledby="shell-cashier-title" tabindex="-1">
          <h3 id="shell-cashier-title">🏦 Cashier</h3>
          <p class="shell-cashier-balance"></p>
          <div class="cashier-options">
            <div class="cashier-option" data-cashier="refill">
              <div><strong>Free refill</strong><span class="cashier-note"></span></div>
              <button class="btn primary" id="shell-cashier-refill">Refill to $100</button>
            </div>
            <div class="cashier-option" data-cashier="comp">
              <div><strong><i class="fa-solid fa-building" aria-hidden="true"></i> Hotel comp</strong><span class="cashier-note"></span></div>
              <button class="btn secondary" id="shell-cashier-comp">Comp</button>
            </div>
          </div>
          <div class="shell-modal-actions"><button class="btn secondary shell-cashier-close">Close</button></div>
        </div>
      </div>
      <div class="shell-modal" id="shell-bonus-modal">
        <div class="shell-modal-box bonus" role="dialog" aria-modal="true" aria-labelledby="shell-bonus-title" tabindex="-1">
          <h3 id="shell-bonus-title">🎁 Daily Bonus</h3>
          <p class="shell-bonus-sub"></p>
          <div class="shell-streak" id="shell-streak"></div>
          <div class="shell-modal-actions">
            <button class="btn primary" id="shell-claim">Claim</button>
            <button class="btn secondary shell-bonus-close">Close</button>
          </div>
        </div>
      </div>`;
    const div = document.createElement('div');
    div.innerHTML = html;
    while (div.firstChild) document.body.appendChild(div.firstChild);

    document.getElementById('shell-cashier').addEventListener('click', () => {
      if (window.CasinoWallet && !CasinoWallet.topUp()) {
        toast(`The Cashier refills your bankroll once it drops below $${CasinoWallet.TOPUP_BELOW}.`);
      }
      closeModal(document.getElementById('shell-modal'));
    });
    const om = document.getElementById('shell-modal');
    om.querySelector('.shell-modal-close').addEventListener('click', () => closeModal(om));
    document.getElementById('shell-oos-comp').addEventListener('click', () => {
      if (takeComp()) closeModal(om);
    });

    const cm = document.getElementById('shell-cashier-modal');
    document.getElementById('shell-cashier-refill').addEventListener('click', () => {
      if (window.CasinoWallet?.topUp()) { toast(`Bankroll refilled to $${CasinoWallet.STARTING}.`); closeModal(cm); }
      else renderCashier();
    });
    document.getElementById('shell-cashier-comp').addEventListener('click', () => {
      if (takeComp()) closeModal(cm);
    });
    cm.querySelector('.shell-cashier-close').addEventListener('click', () => closeModal(cm));
    cm.addEventListener('click', (e) => { if (e.target === cm) closeModal(cm); });
    const im = document.getElementById('shell-info-modal');
    im.querySelector('.shell-info-close').addEventListener('click', () => closeModal(im));
    im.addEventListener('click', (e) => { if (e.target === im) closeModal(im); });

    const bm = document.getElementById('shell-bonus-modal');
    document.getElementById('shell-claim').addEventListener('click', () => dailyBonus.claim());
    bm.querySelector('.shell-bonus-close').addEventListener('click', () => closeModal(bm));
    bm.addEventListener('click', (e) => { if (e.target === bm) closeModal(bm); });
    wireModalKeys();
    wireShortcutKeys();
  }

  /* Dev mode (?dev=1): a badge that opens the dev tools panel. The tools
     script is only fetched in dev mode, so players never download it. */
  function renderDevBadge() {
    if (!window.CasinoWallet?.devMode?.() || document.getElementById('casino-dev-badge')) return;
    const badge = document.createElement('button');
    badge.type = 'button';
    badge.id = 'casino-dev-badge';
    badge.className = 'casino-dev-badge';
    badge.textContent = 'DEV MODE';
    badge.title = 'Economy limits are off for testing. Click for dev tools.';
    badge.setAttribute('aria-expanded', 'false');
    badge.addEventListener('click', () => window.CasinoDevTools?.toggle());
    document.body.appendChild(badge);

    if (SHELL_SRC && !window.CasinoDevTools) {
      const src = new URL('dev-tools.js', SHELL_SRC);
      src.search = new URL(SHELL_SRC).search;   // same cache-busting version
      const script = document.createElement('script');
      script.src = src.toString();
      document.head.appendChild(script);
    }
  }

  function injectFooter() {
    if (cfg.footer === false) return;
    const f = document.createElement('footer');
    f.className = 'shell-footer';
    f.textContent = cfg.footer || 'Casino X · For entertainment only — no real-money wagering.';
    document.body.appendChild(f);
  }

  /* ───────── SAVES, FEEDBACK & SETTINGS MENU ─────────
     Progress lives in this browser's storage. Players can download it
     as a file and load it back (another device, or after clearing data).
     Only the game's own keys travel: GitHub Pages shares one origin
     across all of an account's sites. */
  const SAVE_KEYS = ['casinoBalance', 'casinoProfile', 'casinoMuted', 'theme', 'slotToastShown',
    'hotelGameState', 'hotelGuestPool', 'hotelEventQueue', 'hotelShiftHints', 'casinoWelcomed'];
  const SAVE_FORMAT = 'casino-x-save';

  function exportSave() {
    const data = {};
    SAVE_KEYS.forEach(k => { const v = localStorage.getItem(k); if (v !== null) data[k] = v; });
    const file = { format: SAVE_FORMAT, version: 1, build: BUILD, exportedAt: new Date().toISOString(), data };
    const blob = new Blob([JSON.stringify(file, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `casino-x-save-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
    toast('Save downloaded. Keep the file somewhere safe.');
    return file;
  }

  /** Checks a save file's text; returns { ok, data } or { ok:false, error }. */
  function parseSave(text) {
    let file;
    try { file = JSON.parse(text); } catch (_) { return { ok: false, error: 'That file isn\'t a Casino X save.' }; }
    if (file?.format !== SAVE_FORMAT || typeof file.data !== 'object' || !file.data) {
      return { ok: false, error: 'That file isn\'t a Casino X save.' };
    }
    const data = {};
    for (const [k, v] of Object.entries(file.data)) {
      if (!SAVE_KEYS.includes(k) || typeof v !== 'string') continue;   // ignore anything unexpected
      data[k] = v;
    }
    if (!data.hotelGameState && !data.casinoBalance) return { ok: false, error: 'That save file is empty.' };
    if (data.hotelGameState) {
      try { if (!JSON.parse(data.hotelGameState)?.meta) throw new Error('no meta'); }
      catch (_) { return { ok: false, error: 'The hotel data in that file is damaged.' }; }
    }
    return { ok: true, data, exportedAt: file.exportedAt };
  }

  function applySave(data) {
    SAVE_KEYS.forEach(k => localStorage.removeItem(k));
    Object.entries(data).forEach(([k, v]) => localStorage.setItem(k, v));
  }

  function importSave(fileObj) {
    if (!fileObj) return;
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseSave(String(reader.result));
      if (!parsed.ok) { toast(parsed.error, 6000); return; }
      const when = parsed.exportedAt ? new Date(parsed.exportedAt).toLocaleString() : 'an unknown date';
      if (!window.confirm(`Load the save from ${when}? This replaces your current progress in this browser.`)) return;
      applySave(parsed.data);
      window.location.reload();
    };
    reader.readAsText(fileObj);
  }

  function debugInfo() {
    const lines = [`Casino X build ${BUILD}`, `Page: ${location.pathname}`, `Browser: ${navigator.userAgent}`,
      `Screen: ${window.innerWidth}×${window.innerHeight} @${window.devicePixelRatio || 1}x`,
      `Storage: ${window.CasinoStorage?.persistent === false ? `not saving (${window.CasinoStorage.reason})` : 'saving'}`,
      `Chips: ${localStorage.getItem('casinoBalance') ?? '?'} · Casino level ${snapshot().level}`];
    try {
      const h = JSON.parse(localStorage.getItem('hotelGameState') || 'null');
      if (h) {
        const depts = Object.entries(h.departments || {}).filter(([, d]) => d.level > 0).map(([id, d]) => `${id} ${d.level}`).join(', ');
        lines.push(`Hotel: day ${h.calendar?.day ?? '?'} ${h.calendar?.phase ?? ''} · cash $${Math.round(h.currencies?.hotelCash ?? 0)} · ${depts}`);
        const runs = Object.entries(h.stats?.shiftsByDept || {}).map(([k, v]) => `${k} ${v}`).join(', ');
        if (runs) lines.push(`Shifts played: ${runs}`);
      }
    } catch (_) { lines.push('Hotel: save unreadable'); }
    lines.push(recentErrors.length ? `Recent errors:\n  ${recentErrors.join('\n  ')}` : 'Recent errors: none');
    return lines.join('\n');
  }

  async function copyDebugInfo() {
    const text = debugInfo();
    try {
      await navigator.clipboard.writeText(text);
      toast('Debug info copied. Paste it into your feedback.');
    } catch (_) {
      // Clipboard blocked: show it so it can be copied by hand
      info('Debug info', `<p class="shell-menu-note">Select and copy this text into your feedback:</p><textarea class="shell-debug-text" readonly rows="9">${escapeHtml(text)}</textarea>`);
    }
    return text;
  }

  function escapeHtml(v) {
    return String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  function storageLine() {
    const st = window.CasinoStorage;
    if (!st || st.persistent) return '<p class="shell-menu-note ok">✓ Progress saves automatically in this browser.</p>';
    return `<p class="shell-menu-note warn">⚠ This browser isn't saving game data (${st.reason === 'blocked' ? 'storage is blocked' : 'storage is full'}). Progress lasts until you close the tab. Download a save to keep it.</p>`;
  }

  function openMenu() {
    info('Save & settings', `
      <section class="shell-menu-section">
        <h3>Your progress</h3>
        ${storageLine()}
        <div class="shell-menu-actions">
          <button type="button" class="btn primary" data-menu="export">Download save</button>
          <label class="btn secondary shell-file-btn">Load save<input type="file" accept=".json,application/json" data-menu="import" hidden></label>
        </div>
        <p class="shell-menu-note">Use a save file to move to another device, or to restore progress after clearing browser data.</p>
      </section>
      <section class="shell-menu-section">
        <h3>Feedback</h3>
        <p class="shell-menu-note">${FEEDBACK_URL ? 'Found a bug or got confused? Tell us. Copy your debug info first and paste it into the form.' : 'Found a bug or got confused? Copy your debug info and send it to the developer with a note.'}</p>
        <div class="shell-menu-actions">
          ${FEEDBACK_URL ? `<a class="btn primary" href="${escapeHtml(FEEDBACK_URL)}" target="_blank" rel="noopener">Send feedback</a>` : ''}
          <button type="button" class="btn secondary" data-menu="debug">Copy debug info</button>
        </div>
      </section>
      <section class="shell-menu-section">
        <h3>About</h3>
        <p class="shell-menu-note">Casino X is a simulated casino and hotel game. No real money, no prizes, nothing to buy. Intended for adults (18+). Build ${escapeHtml(BUILD)}.</p>
      </section>`);
    const body = document.querySelector('#shell-info-modal .shell-info-body');
    body?.querySelector('[data-menu="export"]')?.addEventListener('click', exportSave);
    body?.querySelector('[data-menu="import"]')?.addEventListener('change', e => importSave(e.target.files?.[0]));
    body?.querySelector('[data-menu="debug"]')?.addEventListener('click', copyDebugInfo);
  }

  function renderMenuLink() {
    const footer = document.querySelector('.shell-footer, .lobby-footer');
    if (document.getElementById('shell-menu-link') || !footer) return;
    const link = document.createElement('button');
    link.type = 'button';
    link.id = 'shell-menu-link';
    link.className = 'shell-shortcut-hint shell-menu-link';
    link.textContent = '⚙ Save & feedback';
    link.addEventListener('click', openMenu);
    footer.before(link);
  }

  // A banner when this browser can't keep progress, with a way to download it
  function renderStorageNotice() {
    const st = window.CasinoStorage;
    if (!st || st.persistent || document.getElementById('shell-storage-notice')) return;
    try { if (sessionStorage.getItem('storageNoticeDismissed')) return; } catch (_) { /* ignore */ }
    const bar = document.createElement('div');
    bar.id = 'shell-storage-notice';
    bar.className = 'shell-storage-notice';
    bar.setAttribute('role', 'status');
    bar.innerHTML = `
      <span>⚠ This browser isn't saving your progress (${st.reason === 'blocked' ? 'storage is blocked' : 'storage is full'}). It lasts until you close the tab.</span>
      <button type="button" data-notice="save">Download save</button>
      <button type="button" data-notice="close" aria-label="Dismiss">✕</button>`;
    bar.querySelector('[data-notice="save"]').addEventListener('click', exportSave);
    bar.querySelector('[data-notice="close"]').addEventListener('click', () => {
      bar.remove();
      try { sessionStorage.setItem('storageNoticeDismissed', '1'); } catch (_) { /* ignore */ }
    });
    document.body.prepend(bar);
  }

  /* ───────── WELCOME (first visit) ─────────
     One card on a player's first visit: what the game is, that it's
     simulated (no real money), the age note, and where saves live. */
  const WELCOME_KEY = 'casinoWelcomed';

  function maybeWelcome() {
    let seen = true;
    try { seen = !!localStorage.getItem(WELCOME_KEY); } catch (_) { /* treat as seen */ }
    if (seen) return false;
    try { localStorage.setItem(WELCOME_KEY, String(Date.now())); } catch (_) { /* ignore */ }
    info('Welcome to Casino X', `
      <p class="shell-welcome-lead">Run a hotel, play its casino. Hotel shifts earn cash to grow the resort; casino wins bring in guests and high rollers.</p>
      <div class="shell-welcome-notice" role="note">
        <strong>Simulated casino</strong>
        <span>No real money, no prizes, nothing to buy. Chips have no cash value. Intended for adults (18+).</span>
      </div>
      <p class="shell-menu-note">Progress saves in this browser. Use <b>⚙ Save &amp; feedback</b> at the bottom of any page to back it up or report a problem.</p>
      <div class="shell-menu-actions shell-welcome-actions">
        <button type="button" class="btn primary" data-welcome-start>Start playing</button>
      </div>`);
    const modal = document.getElementById('shell-info-modal');
    modal?.classList.add('is-welcome');   // "Start playing" replaces the generic Close button
    modal?.querySelector('[data-welcome-start]')?.addEventListener('click', () => closeModal(modal));
    modal?.querySelector('[data-welcome-start]')?.focus();
    return true;
  }

  /* ───────── SHARED SETUP ───────── */
  function setup() {
    injectOverlays();
    renderDevBadge();
    theme.apply(theme.get());
    wireThemeControls();
    sound._sync();
    profile.load();

    if (window.CasinoWallet) {
      CasinoShell.wallet = CasinoWallet;
      CasinoWallet.onChange(syncBalance);
    }

    // Wire any daily-bonus button present (injected header OR a host page's own header)
    const bonusBtn = document.getElementById('shell-bonus-btn');
    if (bonusBtn) bonusBtn.addEventListener('click', () => dailyBonus.open());

    renderProgression();
    // The welcome card comes first; the daily bonus can wait for the next visit
    if (!maybeWelcome()) maybePromptBonus();
    renderStorageNotice();
    window.addEventListener('casino:storage-unavailable', renderStorageNotice);
    document.querySelectorAll('[data-shell-menu]').forEach(btn => btn.addEventListener('click', openMenu));
  }

  /* The gift button pulses whenever a bonus is waiting; the dialog only
     opens by itself on pages that opt in (the casino lobby), once per
     session, so it never interrupts a game or the hotel guide. */
  function maybePromptBonus() {
    if (!cfg.autoBonus || !dailyBonus.available()) return;
    if (sessionStorage.getItem('shellBonusPrompted')) return;
    sessionStorage.setItem('shellBonusPrompted', '1');
    setTimeout(() => dailyBonus.open(), 650);
  }

  /* ───────── ENTRY POINTS ───────── */
  function mount(config) {
    cfg = config || {};
    injectHeader();
    setup();
    injectFooter();
    renderMenuLink();
    // Casino games show what the hotel unlocks for them (not on hotel shifts)
    const hotelOperation = String(cfg.lobbyHref || '../casino.html').includes('../..');
    if (!hotelOperation) window.HotelPerks?.renderStrip?.({ hotelHref: cfg.hotelHref || '../hotel/index.html' });
    return CasinoShell;
  }
  function standalone(config) { cfg = config || {}; setup(); renderMenuLink(); return CasinoShell; }

  return {
    mount, standalone, theme, sound, toast, celebrate, gameOver, info, openCashier,
    openMenu, exportSave, parseSave, debugInfo, copyDebugInfo,
    announce, reducedMotion, registerShortcuts, showShortcuts,
    awardXp, dailyBonus, syncBalance, renderProgression,
    get profile() { return snapshot(); },
    wallet: null
  };
})();

if (typeof window !== 'undefined') window.CasinoShell = CasinoShell;
