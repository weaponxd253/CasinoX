/* ============================================================
   HOTEL MANAGER — UI  (hotel-ui.js)
   ------------------------------------------------------------
   All DOM manipulation lives here. Reads from HotelState and
   HotelConfig. Never writes game state directly — calls
   HotelState mutators or HotelEngine functions.
   ============================================================ */

const HotelUI = (() => {

  /* ── Bootstrap ───────────────────────────────────────────── */
  function init() {
    CasinoShell.standalone({ lobbyHref: '../index.html' });

    const bootResult = HotelEngine.processBootTick();
    if (bootResult.isOffline && bootResult.amount > 0) {
      _showWelcomeBack(bootResult);
    }

    renderAll();
    _startLiveTick();
    _wireUpgradeButtons();
    _wireNameEdit();
    HotelBridge.syncCasinoSnapshot();

    // Subscribe to bridge events for visual feedback
    HotelBridge.on('income_boost', ({ mult, minutes, reason }) => {
      CasinoShell.toast(`⚡ ${reason} Income ${mult}× for ${minutes} min!`);
      renderIncomeDisplay();
    });
    HotelBridge.on('comp_chips', ({ chips }) => {
      CasinoShell.toast(`🎰 Hotel comped you ${chips} chips!`);
    });
    HotelBridge.on('dept_unlocked', ({ deptId }) => {
      const meta = HotelConfig.DEPT_META[deptId];
      CasinoShell.toast(`🏨 ${meta?.label} is now available to build!`);
      renderAll();
    });
    HotelBridge.on('income', () => {
      renderIncomeDisplay();
      renderHotelCash();
      renderBuildingView();
    });
  }

  /* ── Full render ─────────────────────────────────────────── */
  function renderAll() {
    const state = HotelState.get();
    renderHotelCash();
    renderIncomeDisplay();
    renderStats(state);
    renderBuildingView();
    renderDeptPanel();
    renderSatisfactionMeter(state);
  }

  /* ── Hotel cash ──────────────────────────────────────────── */
  function renderHotelCash() {
    const el = document.getElementById('hotel-cash-amount');
    if (el) el.textContent = fmt(HotelState.getCash());
    // also bump the display
    const pill = document.getElementById('hotel-cash-pill');
    if (pill) { pill.classList.remove('bump'); void pill.offsetWidth; pill.classList.add('bump'); }
  }

  /* ── Income rate ─────────────────────────────────────────── */
  function renderIncomeDisplay() {
    const state = HotelState.get();
    const ipm   = HotelEngine.currentIpm(state);
    const el    = document.getElementById('income-rate-value');
    if (el) el.textContent = fmt(ipm);
    const boostEl = document.getElementById('income-boost-badge');
    if (boostEl) {
      const active = state.ticker.activeMultiplierExpiry > Date.now();
      boostEl.style.display = active ? 'inline-flex' : 'none';
      if (active) {
        const remaining = Math.ceil((state.ticker.activeMultiplierExpiry - Date.now()) / 60_000);
        boostEl.textContent = `${state.ticker.activeMultiplier}× (${remaining}m)`;
      }
    }
  }

  /* ── Quick stats bar ─────────────────────────────────────── */
  function renderStats(state) {
    const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setEl('hotel-reputation',   state.currencies.reputation);
    setEl('hotel-satisfaction', state.satisfaction.current + '%');
    setEl('hotel-tier',         `Tier ${state.meta.hotelTier}`);
    setEl('hotel-name-display', state.meta.hotelName);
    setEl('hotel-guests',       state.guests.population);
  }

  /* ── Satisfaction meter ──────────────────────────────────── */
  function renderSatisfactionMeter(state) {
    const sat   = state.satisfaction.current;
    const fill  = document.getElementById('sat-fill');
    const label = document.getElementById('sat-label-value');
    const trend = document.getElementById('sat-trend');
    if (fill)  fill.style.width = sat + '%';
    if (fill)  fill.className = 'sat-fill ' + satClass(sat);
    if (label) label.textContent = sat + '%';
    if (trend) {
      trend.textContent = { rising:'↑', falling:'↓', stable:'→' }[state.satisfaction.trend] ?? '→';
      trend.className   = 'sat-trend ' + state.satisfaction.trend;
    }
  }

  function satClass(sat) {
    if (sat >= 80) return 'excellent';
    if (sat >= 60) return 'good';
    if (sat >= 40) return 'fair';
    return 'poor';
  }

  /* ── CSS building view ───────────────────────────────────────
     Phase 1 placeholder for the Phase 3 Pixi canvas.
     Each floor = a div. Locked floors show a construction state.
     The #hotel-canvas-wrap container is sized in CSS to exactly
     match what Phase 3 expects (520px wide, height: auto).
  ─────────────────────────────────────────────────────────── */
  function renderBuildingView() {
    const wrap  = document.getElementById('hotel-building-css');
    if (!wrap) return;
    const state = HotelState.get();
    const { FLOOR_ORDER, DEPT_META, UPGRADE_CATALOG } = HotelConfig;

    // Render floors top → bottom (reverse of FLOOR_ORDER)
    const floors = [...FLOOR_ORDER].reverse();
    wrap.innerHTML = floors.map(id => {
      const dept  = state.departments[id];
      const meta  = DEPT_META[id];
      const stats = dept?.unlocked ? UPGRADE_CATALOG[id]?.[dept.level - 1] : null;
      const isLocked = !dept?.unlocked;
      const isMax    = dept?.unlocked && dept.level >= (UPGRADE_CATALOG[id]?.length ?? 1);

      if (id === 'lobby') {
        return `
          <div class="hotel-floor floor-lobby">
            <div class="floor-interior">
              <span class="floor-icon">${meta.icon}</span>
              <div class="floor-info">
                <div class="floor-name">${meta.label}</div>
                <div class="floor-level">Lv ${dept.level} · ${stats?.label ?? ''}</div>
              </div>
              <div class="floor-dots">
                ${_guestDots(Math.min(4, state.guests.population))}
              </div>
            </div>
            <div class="floor-elevator-slot">🛗</div>
          </div>`;
      }

      if (isLocked) {
        const reqRep = HotelConfig.DEPT_UNLOCK_REP[id] ?? 99;
        return `
          <div class="hotel-floor floor-locked">
            <div class="floor-interior">
              <span class="floor-icon locked-icon">🚧</span>
              <div class="floor-info">
                <div class="floor-name locked-name">${meta.label}</div>
                <div class="floor-level locked-req">Requires Reputation ${reqRep}</div>
              </div>
            </div>
            <div class="floor-elevator-slot"></div>
          </div>`;
      }

      const activityLevel = Math.min(dept.level, 3);
      const activityDots  = '●'.repeat(activityLevel) + '○'.repeat(3 - activityLevel);

      return `
        <div class="hotel-floor floor-active" style="--dept-color:${meta.color};--dept-accent:${meta.accent}">
          <div class="floor-interior">
            <span class="floor-icon">${meta.icon}</span>
            <div class="floor-info">
              <div class="floor-name">${meta.label}</div>
              <div class="floor-level">
                <span class="level-badge ${isMax ? 'maxed' : ''}">Lv ${dept.level}</span>
                ${stats?.label ?? ''}
              </div>
            </div>
            <div class="floor-activity">
              <span class="activity-dots" title="Activity level">${activityDots}</span>
              ${stats?.ipm ? `<span class="floor-ipm">$${stats.ipm}/m</span>` : ''}
            </div>
          </div>
          <div class="floor-elevator-slot"></div>
        </div>`;
    }).join('');
  }

  function _guestDots(n) {
    return Array.from({ length: n }, () => '<span class="guest-dot">🚶</span>').join('');
  }

  /* ── Department upgrade panel ─────────────────────────────── */
  function renderDeptPanel() {
    const list  = document.getElementById('dept-upgrade-list');
    if (!list) return;
    const state = HotelState.get();
    const { FLOOR_ORDER, DEPT_META, UPGRADE_CATALOG, DEPT_UNLOCK_REP } = HotelConfig;
    const cash  = HotelState.getCash();
    const rep   = HotelState.getReputation();

    // Show depts in floor order; locked-but-visible first, then hidden until close to rep
    const cards = FLOOR_ORDER.map(id => {
      if (id === 'lobby') return '';    // lobby has no upgrades in Phase 1
      const dept    = state.departments[id];
      const meta    = DEPT_META[id];
      const catalog = UPGRADE_CATALOG[id] ?? [];
      const reqRep  = DEPT_UNLOCK_REP[id] ?? 1;

      // Hide department if reputation is far below requirement
      if (!dept?.unlocked && rep < reqRep - 2) return '';

      if (!dept?.unlocked) {
        return `
          <div class="dept-card locked" data-dept="${id}">
            <div class="dept-card-icon">${meta.icon}</div>
            <div class="dept-card-body">
              <div class="dept-card-name">${meta.label}</div>
              <div class="dept-card-status">Reputation ${reqRep} required · currently ${rep}</div>
              <div class="dept-card-progress">
                <div class="rep-progress-bar">
                  <div class="rep-progress-fill" style="width:${Math.min(100, (rep/reqRep)*100)}%"></div>
                </div>
              </div>
            </div>
          </div>`;
      }

      const current  = catalog[dept.level - 1];
      const next     = catalog[dept.level];          // undefined if maxed
      const isMax    = !next;
      const canAfford = !isMax && cash >= (next?.cost ?? Infinity);

      return `
        <div class="dept-card ${isMax ? 'maxed' : ''}" data-dept="${id}">
          <div class="dept-card-icon">${meta.icon}</div>
          <div class="dept-card-body">
            <div class="dept-card-header">
              <span class="dept-card-name">${meta.label}</span>
              <span class="level-badge ${isMax ? 'maxed' : ''}">Lv ${dept.level}${isMax ? ' MAX' : ''}</span>
            </div>
            <div class="dept-card-current">${current?.label ?? ''} · $${current?.ipm ?? 0}/min</div>
            ${isMax
              ? `<div class="dept-card-maxed">Fully upgraded ✓</div>`
              : `<div class="dept-card-next">
                   <span class="next-label">→ ${next.label}</span>
                   <span class="next-ipm">$${next.ipm ?? 0}/min</span>
                 </div>
                 <button class="upgrade-btn ${canAfford ? 'can-afford' : 'cant-afford'}"
                         data-dept="${id}" data-cost="${next.cost}"
                         ${canAfford ? '' : 'disabled'}>
                   Upgrade · $${fmtShort(next.cost)}
                 </button>`
            }
          </div>
        </div>`;
    }).filter(Boolean).join('');

    list.innerHTML = cards || '<p class="no-depts">All departments unlocked!</p>';
  }

  /* ── Wire upgrade buttons ─────────────────────────────────── */
  function _wireUpgradeButtons() {
    document.addEventListener('click', e => {
      const btn = e.target.closest('.upgrade-btn');
      if (!btn || btn.disabled) return;
      const deptId = btn.dataset.dept;
      const ok     = HotelState.upgradeDept(deptId);
      if (!ok) { CasinoShell.toast('Not enough hotel cash.'); return; }

      // Post-upgrade
      HotelEngine.recalculateReputation(HotelState.get());
      HotelEngine.recalculateSatisfaction(HotelState.get());
      HotelBridge.applyHotelToCasino(HotelState.get());
      HotelEngine.checkAchievements(HotelState.get());

      const meta = HotelConfig.DEPT_META[deptId];
      const newStats = HotelConfig.UPGRADE_CATALOG[deptId]?.[HotelState.getDept(deptId).level - 1];
      CasinoShell.toast(`${meta.icon} ${meta.label} upgraded to ${newStats?.label}!`);

      renderAll();
    });
  }

  /* ── Hotel name inline edit ──────────────────────────────── */
  function _wireNameEdit() {
    const el = document.getElementById('hotel-name-display');
    if (!el) return;
    el.addEventListener('click', () => {
      const cur  = HotelState.get().meta.hotelName;
      const name = prompt('Rename your hotel:', cur);
      if (name?.trim()) {
        HotelState.get().meta.hotelName = name.trim();
        HotelState.save();
        renderStats(HotelState.get());
      }
    });
  }

  /* ── Live income tick ─────────────────────────────────────── */
  function _startLiveTick() {
    setInterval(() => {
      const result = HotelEngine.processLiveTick();
      renderAll();
      if (result.amount > 0) {
        _floatIncomeNumber(result.amount);
      }
    }, HotelConfig.ECONOMY.INCOME_TICK_MS);

    // Faster display update every 5s (so cash number ticks visibly)
    setInterval(() => {
      renderHotelCash();
      renderIncomeDisplay();
    }, 5_000);
  }

  /* ── Welcome-back offline earnings modal ─────────────────── */
  function _showWelcomeBack(result) {
    const mins = Math.round(result.minutes);
    const hrs  = mins >= 60 ? `${Math.floor(mins/60)}h ${mins%60}m` : `${mins} min`;
    CasinoShell.info(
      '🏨 Welcome Back!',
      `<p>Your hotel ran for <strong>${hrs}</strong> while you were away.</p>
       <p>You earned: <strong style="color:var(--gold-light)">$${fmt(result.amount)} hotel cash</strong></p>
       <hr style="border-color:var(--border);margin:12px 0">
       <p style="font-size:.9rem;color:var(--text-dim)">
         Income rate: $${result.baseIpm}/min · Satisfaction ×${result.satMult}
       </p>`
    );
  }

  /* ── Floating income number ──────────────────────────────── */
  function _floatIncomeNumber(amount) {
    const wrap = document.getElementById('hotel-cash-pill');
    if (!wrap) return;
    const span = document.createElement('span');
    span.className   = 'float-income';
    span.textContent = `+$${fmtShort(amount)}`;
    wrap.appendChild(span);
    setTimeout(() => span.remove(), 1400);
  }

  /* ── Formatting helpers ──────────────────────────────────── */
  function fmt(n) {
    return Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
  }
  function fmtShort(n) {
    if (n >= 1_000_000) return (n/1_000_000).toFixed(1) + 'M';
    if (n >= 1_000)     return (n/1_000).toFixed(1) + 'K';
    return String(Math.round(n));
  }

  return { init, renderAll, renderBuildingView, renderDeptPanel, renderHotelCash };
})();

if (typeof window !== 'undefined') window.HotelUI = HotelUI;
