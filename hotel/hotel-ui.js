/* ============================================================
   HOTEL MANAGER — UI  (hotel-ui.js)
   ------------------------------------------------------------
   All DOM manipulation lives here. Reads from HotelState and
   HotelConfig. Never writes game state directly — calls
   HotelState mutators or HotelEngine functions.
   ============================================================ */

const HotelUI = (() => {
  let selectedDeptId = null;

  /* ── Bootstrap ───────────────────────────────────────────── */
  function init() {
    CasinoShell.standalone({ lobbyHref: '../index.html' });

    const bootResult = HotelEngine.processBootTick();
    if (bootResult.isOffline && bootResult.amount > 0) {
      _showWelcomeBack(bootResult);
    }

    window.HotelRenderer?.init?.();
    renderAll();
    _startLiveTick();
    _wireUpgradeButtons();
    _wireDeptSelection();
    _wireNameEdit();
    _wireFloorSelection();
    _wireCalendarControls();
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

    HotelBridge.on('guest_income', ({ amount }) => {
      window.HotelRenderer?.flashIncome?.(amount);
    });
  }

  /* ── Full render ─────────────────────────────────────────── */
  function renderAll() {
    const state = HotelState.get();
    renderHotelCash();
    renderIncomeDisplay();
    renderStats(state);
    renderCalendar(state);
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

  function renderCalendar(state) {
    const cal = state.calendar ?? { day:1, weekday:0, phase:'morning' };
    const label = document.getElementById('calendar-current-label');
    if (label) {
      label.textContent = `Day ${cal.day} · ${HotelEngine.WEEKDAYS[cal.weekday] ?? 'Monday'} · ${phaseLabel(cal.phase)}`;
    }

    const activeShow = document.getElementById('calendar-active-show');
    if (activeShow) {
      const shows = HotelEngine.activeEntertainmentBookings(state);
      activeShow.classList.toggle('has-show', shows.length > 0);
      activeShow.textContent = shows.length
        ? `${shows.length} active show${shows.length === 1 ? '' : 's'}`
        : 'No active show';
    }
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
    if (window.HotelRenderer?.render?.(HotelState.get())) return;

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

    if (selectedDeptId) {
      renderFocusedDeptPanel(selectedDeptId, state);
      return;
    }

    setMgmtTitle('<i class="fa-solid fa-arrow-up-right-dots"></i> Departments');

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
          <div class="dept-card locked" data-dept="${id}" role="button" tabindex="0">
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
      const isReady = dept.level <= 0;

      return `
        <div class="dept-card ${isMax ? 'maxed' : ''} ${isReady ? 'ready' : ''}" data-dept="${id}" role="button" tabindex="0">
          <div class="dept-card-icon">${meta.icon}</div>
          <div class="dept-card-body">
            <div class="dept-card-header">
              <span class="dept-card-name">${meta.label}</span>
              <span class="level-badge ${isMax ? 'maxed' : ''}">${isReady ? 'Build' : `Lv ${dept.level}${isMax ? ' MAX' : ''}`}</span>
            </div>
            <div class="dept-card-current">${isReady ? 'Ready to build' : `${current?.label ?? ''} · $${current?.ipm ?? 0}/min`}</div>
            ${isMax
              ? `<div class="dept-card-maxed">Fully upgraded ✓</div>`
              : `<div class="dept-card-next">
                   <span class="next-label">→ ${next.label}</span>
                   <span class="next-ipm">$${next.ipm ?? 0}/min</span>
                 </div>
                 <button class="upgrade-btn ${canAfford ? 'can-afford' : 'cant-afford'}"
                         data-dept="${id}" data-cost="${next.cost}"
                         ${canAfford ? '' : 'disabled'}>
                   ${isReady ? 'Build' : 'Upgrade'} · $${fmtShort(next.cost)}
                 </button>`
            }
          </div>
        </div>`;
    }).filter(Boolean).join('');

    list.innerHTML = cards || '<p class="no-depts">All departments unlocked!</p>';
  }

  function renderFocusedDeptPanel(deptId, state) {
    const list = document.getElementById('dept-upgrade-list');
    if (!list) return;

    const dept = state.departments[deptId];
    const meta = HotelConfig.DEPT_META[deptId];
    const catalog = HotelConfig.UPGRADE_CATALOG[deptId] ?? [];
    const reqRep = HotelConfig.DEPT_UNLOCK_REP[deptId] ?? 1;
    const cash = HotelState.getCash();
    const rep = HotelState.getReputation();
    const status = getDeptStatus(deptId, dept, rep);
    const current = dept?.level > 0 ? catalog[dept.level - 1] : null;
    const next = status === 'locked' ? catalog[0] : catalog[dept?.level ?? 0];
    const isMax = status === 'active' && !next;
    const canAfford = !!next && cash >= next.cost && status !== 'locked';
    const actionLabel = status === 'ready' ? 'Build Department' : 'Upgrade Department';

    setMgmtTitle(`
      <button class="panel-icon-btn" type="button" data-panel-action="back" title="Back to departments">
        <i class="fa-solid fa-arrow-left"></i>
      </button>
      ${meta?.label ?? 'Department'}
    `);

    list.innerHTML = `
      <section class="dept-focus" data-dept="${deptId}">
        <div class="dept-focus-hero">
          <div class="dept-focus-icon">${status === 'locked' ? '🚧' : meta.icon}</div>
          <div class="dept-focus-copy">
            <div class="dept-focus-name">${meta.label}</div>
            <div class="dept-focus-status">${deptStatusLabel(status, dept, reqRep, rep, current)}</div>
          </div>
          <span class="level-badge ${isMax ? 'maxed' : ''}">
            ${status === 'locked' ? `REP ${reqRep}` : `LV ${dept?.level ?? 0}${isMax ? ' MAX' : ''}`}
          </span>
        </div>

        <div class="dept-focus-grid">
          ${focusStat('Current Income', `$${current?.ipm ?? 0}/min`)}
          ${focusStat('Next Income', next ? `$${next.ipm ?? 0}/min` : 'Maxed')}
          ${focusStat('Satisfaction', formatBonus(current?.sat))}
          ${focusStat('Reputation', formatBonus(current?.repBonus))}
        </div>

        ${renderDeptProgress(status, reqRep, rep)}

        <div class="dept-focus-upgrade">
          <div>
            <div class="focus-kicker">${status === 'ready' ? 'Build' : isMax ? 'Complete' : 'Next Upgrade'}</div>
            <div class="focus-next-name">${next?.label ?? 'Fully upgraded'}</div>
            <div class="focus-next-desc">${next?.desc ?? 'This department is operating at peak luxury.'}</div>
          </div>
          ${renderFocusAction(deptId, status, next, canAfford, actionLabel, isMax)}
        </div>

        <div class="dept-focus-actions">
          <button class="secondary-panel-btn" type="button" data-panel-action="back">
            <i class="fa-solid fa-list"></i>
            All Departments
          </button>
          <button class="secondary-panel-btn" type="button" data-panel-action="minigame" data-dept="${deptId}"
                  ${status === 'active' ? '' : 'disabled'}>
            <i class="fa-solid ${deptMiniGameIcon(deptId)}"></i>
            ${deptMiniGameLabel(deptId)}
          </button>
        </div>
      </section>
    `;
  }

  function getDeptStatus(deptId, dept, rep = HotelState.getReputation()) {
    if (deptId === 'lobby') return 'active';
    if (!dept?.unlocked) return 'locked';
    if ((dept.level ?? 0) <= 0) return 'ready';
    return 'active';
  }

  function deptStatusLabel(status, dept, reqRep, rep, current) {
    if (status === 'locked') return `Locked · reputation ${rep}/${reqRep}`;
    if (status === 'ready') return 'Ready to build';
    return `${current?.label ?? 'Operating'} · $${current?.ipm ?? 0}/min`;
  }

  function renderDeptProgress(status, reqRep, rep) {
    if (status !== 'locked') return '';
    return `
      <div class="dept-focus-progress">
        <div class="dept-focus-progress-label">
          <span>Reputation needed</span>
          <span>${rep}/${reqRep}</span>
        </div>
        <div class="rep-progress-bar">
          <div class="rep-progress-fill" style="width:${Math.min(100, (rep/reqRep)*100)}%"></div>
        </div>
      </div>
    `;
  }

  function renderFocusAction(deptId, status, next, canAfford, actionLabel, isMax) {
    if (status === 'locked') {
      return `<button class="upgrade-btn cant-afford" type="button" disabled>Locked</button>`;
    }
    if (isMax || !next) {
      return `<button class="upgrade-btn cant-afford" type="button" disabled>Maxed</button>`;
    }
    return `
      <button class="upgrade-btn ${canAfford ? 'can-afford' : 'cant-afford'}"
              type="button" data-dept="${deptId}" data-cost="${next.cost}"
              ${canAfford ? '' : 'disabled'}>
        ${actionLabel} · $${fmtShort(next.cost)}
      </button>
    `;
  }

  function focusStat(label, value) {
    return `
      <div class="dept-focus-stat">
        <span>${label}</span>
        <strong>${value}</strong>
      </div>
    `;
  }

  function formatBonus(value) {
    if (!value) return '0';
    return `+${value}`;
  }

  function deptMiniGameLabel(deptId) {
    if (deptId === 'lobby') return 'Check-In Rush';
    if (deptId === 'bar') return 'Bar Shift';
    if (deptId === 'spa') return 'Spa Rush';
    if (deptId === 'entertainment') return 'Show Lineup';
    return 'Department Game';
  }

  function deptMiniGameIcon(deptId) {
    if (deptId === 'lobby') return 'fa-id-card';
    if (deptId === 'bar') return 'fa-martini-glass-citrus';
    if (deptId === 'spa') return 'fa-spa';
    if (deptId === 'entertainment') return 'fa-masks-theater';
    return 'fa-gamepad';
  }

  function setMgmtTitle(html) {
    const title = document.querySelector('.mgmt-section-title');
    if (title) title.innerHTML = html;
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

  function _wireDeptSelection() {
    document.addEventListener('click', e => {
      const panelAction = e.target.closest('[data-panel-action]');
      if (panelAction) {
        const action = panelAction.dataset.panelAction;
        if (action === 'back') {
          selectedDeptId = null;
          renderDeptPanel();
          return;
        }
        if (action === 'minigame') {
          const deptId = panelAction.dataset.dept;
          const meta = HotelConfig.DEPT_META[deptId];
          if (deptId === 'lobby') {
            window.location.href = 'checkin/index.html';
            return;
          }
          if (deptId === 'bar') {
            window.location.href = 'bar/index.html';
            return;
          }
          if (deptId === 'spa') {
            window.location.href = 'spa/index.html';
            return;
          }
          if (deptId === 'entertainment') {
            window.location.href = 'entertainment/index.html';
            return;
          }
          CasinoShell.toast(`${meta?.label ?? 'Department'} game hooks will open here.`);
          return;
        }
      }

      const card = e.target.closest('.dept-card[data-dept]');
      if (!card || e.target.closest('.upgrade-btn')) return;
      selectDepartment(card.dataset.dept);
    });

    document.addEventListener('keydown', e => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const card = e.target.closest?.('.dept-card[data-dept]');
      if (!card) return;
      e.preventDefault();
      selectDepartment(card.dataset.dept);
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

  /* ── Dollhouse floor selection ───────────────────────────── */
  function _wireFloorSelection() {
    window.addEventListener('hotel:floor-selected', e => {
      const deptId = e.detail?.deptId;
      if (!deptId) return;

      window.HotelRenderer?.pulseFloor?.(deptId);
      selectDepartment(deptId);
      return;
    });
  }

  function _wireCalendarControls() {
    document.getElementById('advance-time-btn')?.addEventListener('click', () => {
      const report = HotelEngine.advanceCalendarPhase();
      renderAll();
      CasinoShell.toast(calendarReportText(report));
    });
  }

  function selectDepartment(deptId) {
    if (!deptId) return;
    selectedDeptId = deptId;
    renderDeptPanel();
    const panel = document.querySelector('.hotel-mgmt-panel');
    if (panel) panel.scrollTo({ top: 0, behavior: 'smooth' });
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
    window.HotelRenderer?.flashIncome?.(amount);

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

  function phaseLabel(phase) {
    return {
      morning: 'Morning',
      afternoon: 'Afternoon',
      evening: 'Evening',
      night: 'Night',
    }[phase] ?? phase;
  }

  function calendarReportText(report) {
    const showText = report.shows?.length ? ` · ${report.shows.length} show${report.shows.length === 1 ? '' : 's'}` : '';
    return `${phaseLabel(report.phase)} report: +$${fmt(report.income)}${showText}`;
  }

  return { init, renderAll, renderBuildingView, renderDeptPanel, renderHotelCash, selectDepartment };
})();

if (typeof window !== 'undefined') window.HotelUI = HotelUI;
