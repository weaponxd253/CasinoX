/* ============================================================
   CASINO X — SHELL  (global: CasinoShell)
   ------------------------------------------------------------
   Load order in every game page:
       <script src="../wallet.js"></script>
       <script src="../casino-shell.js"></script>
       <script src="game.js"></script>

   In your game:
       CasinoShell.mount({ name: 'Coin Flip', subtitle: 'Double or nothing' });

   Then use:
       CasinoShell.wallet              → the shared CasinoWallet
       CasinoShell.sound.click/win/jackpot/lose() · .tone() · .toggle()
       CasinoShell.toast('message')
       CasinoShell.celebrate(netWinAmount)
       CasinoShell.gameOver()          → when the player is broke
       CasinoShell.theme.toggle()
   ============================================================ */

const CasinoShell = (function () {
  const THEME_KEY = 'theme';
  const MUTE_KEY  = 'casinoMuted';
  let cfg = {};

  /* ───────── THEME ───────── */
  const theme = {
    get() { return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'; },
    apply(t) {
      const light = t === 'light';
      document.documentElement.dataset.theme = light ? 'light' : 'dark';
      // Bridge: keep legacy game stylesheets responding to the same toggle.
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
    _sync() {
      const b = document.getElementById('shell-sound-icon');
      if (b) b.className = this.muted ? 'fa-solid fa-volume-xmark' : 'fa-solid fa-volume-high';
    },
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
      } catch (e) { /* audio not available */ }
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

  /* ───────── CELEBRATION (confetti + big number) ───────── */
  function celebrate(amount) {
    if (amount > 0) {
      const big = document.getElementById('shell-bigwin');
      if (big) {
        big.textContent = `+$${Number(amount).toFixed(2)}`;
        big.classList.remove('show'); void big.offsetWidth; big.classList.add('show');
      }
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
      x: innerWidth / 2 + (Math.random() - 0.5) * 120,
      y: innerHeight / 3,
      vx: (Math.random() - 0.5) * 12,
      vy: Math.random() * -14 - 4,
      g: 0.35 + Math.random() * 0.2,
      s: 5 + Math.random() * 7,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      c: colors[Math.floor(Math.random() * colors.length)],
      life: 1
    }));
    let frame = 0;
    (function tick() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pieces.forEach(p => {
        p.vy += p.g; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life -= 0.008;
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6);
        ctx.restore();
      });
      if (frame++ < 150) requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, canvas.width, canvas.height);
    })();
  }

  /* ───────── GAME OVER ───────── */
  function gameOver(opts = {}) {
    const modal = document.getElementById('shell-modal');
    if (!modal) return;
    modal.querySelector('.shell-modal-box h3').textContent = opts.title || '💸 Out of Chips';
    modal.querySelector('.shell-modal-box p').textContent  =
      opts.message || "You've run out of funds. Visit the Cashier to keep playing.";
    modal.classList.add('open');
  }

  /* ───────── BALANCE ───────── */
  function syncBalance(b) {
    const el = document.getElementById('shell-balance-amt');
    if (el) el.textContent = Number(b).toFixed(2);
    const pill = document.getElementById('shell-balance');
    if (pill) { pill.classList.remove('bump'); void pill.offsetWidth; pill.classList.add('bump'); }
  }

  /* ───────── INJECTION ───────── */
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
        <a class="shell-pill" href="${lobby}"><i class="fa-solid fa-dice"></i> Lobby</a>
        <button class="shell-pill shell-icon-btn" id="shell-theme-btn" aria-label="Toggle theme"><i id="shell-theme-icon" class="fa-solid fa-moon"></i></button>
        <button class="shell-pill shell-icon-btn" id="shell-sound-btn" aria-label="Toggle sound"><i id="shell-sound-icon" class="fa-solid fa-volume-high"></i></button>
      </div>`;
    document.body.insertBefore(header, document.body.firstChild);

    document.getElementById('shell-theme-btn').addEventListener('click', () => theme.toggle());
    document.getElementById('shell-sound-btn').addEventListener('click', () => sound.toggle());
  }

  function injectOverlays() {
    const html = `
      <div id="shell-toasts"></div>
      <canvas id="shell-confetti"></canvas>
      <div id="shell-bigwin"></div>
      <div class="shell-modal" id="shell-modal">
        <div class="shell-modal-box">
          <h3>💸 Out of Chips</h3>
          <p>You've run out of funds.</p>
          <div class="shell-modal-actions">
            <button class="btn primary" id="shell-cashier">Cashier · $100</button>
            <a class="btn secondary" href="${cfg.lobbyHref || '../index.html'}">Lobby</a>
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
  }

  function injectFooter() {
    if (cfg.footer === false) return;
    const f = document.createElement('footer');
    f.className = 'shell-footer';
    f.textContent = cfg.footer || 'Casino X · For entertainment only — no real-money wagering.';
    document.body.appendChild(f);
  }

  /* ───────── MOUNT ───────── */
  function mount(config) {
    cfg = config || {};
    injectHeader();
    injectOverlays();
    injectFooter();
    theme.apply(theme.get());
    sound._sync();

    if (window.CasinoWallet) {
      CasinoShell.wallet = CasinoWallet;
      CasinoWallet.onChange(syncBalance);   // fires immediately with current balance
    }
    return CasinoShell;
  }

  return { mount, theme, sound, toast, celebrate, gameOver, syncBalance, wallet: null };
})();

if (typeof window !== 'undefined') window.CasinoShell = CasinoShell;
