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
  const THEME_KEY = 'theme';
  const MUTE_KEY  = 'casinoMuted';
  const PROFILE_KEY = 'casinoProfile';
  let cfg = {};

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
    const pts = Math.max(1, Math.round(Number(wager) || 0));
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
    const yest  = dayStr(new Date(Date.now() - 86400000));
    const claimedToday = profile.data.lastClaim === today;
    const pendingStreak = claimedToday
      ? profile.data.streak
      : (profile.data.lastClaim === yest ? profile.data.streak + 1 : 1);
    const reward = BONUS_TABLE[Math.min(pendingStreak, BONUS_TABLE.length) - 1];
    return { today, yest, claimedToday, pendingStreak, reward };
  }

  const dailyBonus = {
    available() { return profile.data.lastClaim !== dayStr(new Date()); },
    open() { const m = document.getElementById('shell-bonus-modal'); if (m) { renderBonusModal(); m.classList.add('open'); } },
    close() { const m = document.getElementById('shell-bonus-modal'); if (m) m.classList.remove('open'); },
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
    const sub   = document.querySelector('.shell-bonus-sub');
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
      sub.textContent = `Day ${activeDay} of your streak — claim $${s.reward}!`;
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
      const i = document.getElementById('shell-theme-icon');
      if (i) i.className = light ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
    },
    toggle() { this.apply(this.get() === 'light' ? 'dark' : 'light'); }
  };

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
    play(id) { if (this.muted) return; const el = document.getElementById(id); if (el) el.play().catch(() => {}); },
    click()   { this.tone(180, 'square', 0.08, 0.15); },
    win()     { this.tone(523, 'sine', 0.2, 0.3, 0); this.tone(784, 'sine', 0.25, 0.3, 0.15); },
    jackpot() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 'sine', 0.3, 0.35, i * 0.12)); },
    lose()    { this.tone(180, 'sawtooth', 0.18, 0.15, 0); this.tone(140, 'sawtooth', 0.2, 0.1, 0.15); }
  };

  /* ───────── TOAST ───────── */
  function toast(msg, ms = 4000) {
    const wrap = document.getElementById('shell-toasts');
    if (!wrap) return;
    const t = document.createElement('div');
    t.className = 'shell-toast';
    t.textContent = msg;
    wrap.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 300); }, ms);
  }

  /* ───────── CELEBRATION ───────── */
  function celebrate(amount) {
    if (amount > 0) {
      const big = document.getElementById('shell-bigwin');
      if (big) { big.textContent = `+$${Number(amount).toFixed(2)}`; big.classList.remove('show'); void big.offsetWidth; big.classList.add('show'); }
    }
    sound.jackpot();
    confettiBurst();
  }
  function confettiBurst() {
    const canvas = document.getElementById('shell-confetti');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = innerWidth; canvas.height = innerHeight;
    const colors = ['#c9a84c', '#e8cb80', '#f5ead5', '#6fcf97'];
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
    modal.querySelector('.shell-modal-box p').textContent  = opts.message || "You've run out of funds. Visit the Cashier to keep playing.";
    modal.classList.add('open');
  }

  /* ───────── INFO / RULES ───────── */
  function info(title, html) {
    const m = document.getElementById('shell-info-modal');
    if (!m) return;
    m.querySelector('.shell-info-title').textContent = title || '';
    m.querySelector('.shell-info-body').innerHTML = html || '';
    m.classList.add('open');
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
    if (fill) fill.style.width = `${Math.round((s.into / s.need) * 100)}%`;
    if (txt) txt.textContent = `${s.into}/${s.need} XP`;
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

  function injectHeader() {
    const lobby = cfg.lobbyHref || '../index.html';
    const header = document.createElement('header');
    header.className = 'shell-header';
    header.innerHTML = `
      <div class="shell-logo">
        <span class="name">${cfg.name || 'Casino X'}</span>
        <span class="sub">${cfg.subtitle || 'Casino Edition'}</span>
      </div>
      <div class="shell-controls">
        <div class="shell-balance" id="shell-balance" title="Shared bankroll">
          <span class="chip"></span> $<span id="shell-balance-amt">0.00</span>
        </div>
        ${progressHTML()}
        <a class="shell-pill" href="${lobby}"><i class="fa-solid fa-dice"></i> Lobby</a>
        <button class="shell-pill shell-icon-btn" id="shell-theme-btn" aria-label="Toggle theme"><i id="shell-theme-icon" class="fa-solid fa-moon"></i></button>
        <button class="shell-pill shell-icon-btn" id="shell-sound-btn" aria-label="Toggle sound"><i id="shell-sound-icon" class="fa-solid fa-volume-high"></i></button>
      </div>`;
    document.body.insertBefore(header, document.body.firstChild);
    document.getElementById('shell-theme-btn').addEventListener('click', () => theme.toggle());
    document.getElementById('shell-sound-btn').addEventListener('click', () => sound.toggle());
  }

  function injectOverlays() {
    const lobby = cfg.lobbyHref || '../index.html';
    const html = `
      <div id="shell-toasts"></div>
      <canvas id="shell-confetti"></canvas>
      <div id="shell-bigwin"></div>
      <div class="shell-modal" id="shell-modal">
        <div class="shell-modal-box">
          <h3>💸 Out of Chips</h3><p>You've run out of funds.</p>
          <div class="shell-modal-actions">
            <button class="btn primary" id="shell-cashier">Cashier · $100</button>
            <a class="btn secondary" href="${lobby}">Lobby</a>
          </div>
        </div>
      </div>
      <div class="shell-modal" id="shell-info-modal">
        <div class="shell-modal-box info">
          <h3 class="shell-info-title"></h3>
          <div class="shell-info-body"></div>
          <div class="shell-modal-actions"><button class="btn secondary shell-info-close">Close</button></div>
        </div>
      </div>
      <div class="shell-modal" id="shell-bonus-modal">
        <div class="shell-modal-box bonus">
          <h3>🎁 Daily Bonus</h3>
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
      if (window.CasinoWallet) CasinoWallet.reset();
      document.getElementById('shell-modal').classList.remove('open');
    });
    const im = document.getElementById('shell-info-modal');
    im.querySelector('.shell-info-close').addEventListener('click', () => im.classList.remove('open'));
    im.addEventListener('click', (e) => { if (e.target === im) im.classList.remove('open'); });

    const bm = document.getElementById('shell-bonus-modal');
    document.getElementById('shell-claim').addEventListener('click', () => dailyBonus.claim());
    bm.querySelector('.shell-bonus-close').addEventListener('click', () => bm.classList.remove('open'));
    bm.addEventListener('click', (e) => { if (e.target === bm) bm.classList.remove('open'); });
  }

  function injectFooter() {
    if (cfg.footer === false) return;
    const f = document.createElement('footer');
    f.className = 'shell-footer';
    f.textContent = cfg.footer || 'Casino X · For entertainment only — no real-money wagering.';
    document.body.appendChild(f);
  }

  /* ───────── SHARED SETUP ───────── */
  function setup() {
    injectOverlays();
    theme.apply(theme.get());
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
    maybePromptBonus();
  }

  function maybePromptBonus() {
    if (!dailyBonus.available()) return;
    if (sessionStorage.getItem('shellBonusPrompted')) return;
    sessionStorage.setItem('shellBonusPrompted', '1');
    setTimeout(() => dailyBonus.open(), 650);
  }

  /* ───────── ENTRY POINTS ───────── */
  function mount(config) { cfg = config || {}; injectHeader(); setup(); injectFooter(); return CasinoShell; }
  function standalone(config) { cfg = config || {}; setup(); return CasinoShell; }

  return {
    mount, standalone, theme, sound, toast, celebrate, gameOver, info,
    awardXp, dailyBonus, syncBalance, renderProgression,
    get profile() { return snapshot(); },
    wallet: null
  };
})();

if (typeof window !== 'undefined') window.CasinoShell = CasinoShell;
