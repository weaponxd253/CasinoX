/* ============================================================
   HOTEL MANAGER — UI  (hotel-ui.js)
   ------------------------------------------------------------
   All DOM manipulation lives here. Reads from HotelState and
   HotelConfig. Never writes game state directly — calls
   HotelState mutators or HotelEngine functions.
   ============================================================ */

const HotelUI = (() => {
  let selectedDeptId = null;
  let activeMgmtTab = 'departments';
  let activeStaffView = 'coverage';
  let previousUnlocks = null;
  let activePrepareDept = null;
  let onboardingDebugVisible = typeof location !== 'undefined'
    && new URLSearchParams(location.search).get('onboardingDebug') === '1';
  let guideConfirmation = null;
  let guideConfirmationTimer = null;

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
    _wireManagementTabs();
    _wireCommandCenter();
    _wireStaffControls();
    _wireOnboardingDebug();
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
      renderHotelSnapshot(HotelState.get());
    });

    HotelBridge.on('guest_income', ({ amount }) => {
      window.HotelRenderer?.flashIncome?.(amount);
    });
  }

  /* ── Full render ─────────────────────────────────────────── */
  function renderAll() {
    const state = HotelState.get();
    renderGuideFrame(state);
    renderSystemUnlocks(state);
    renderHotelCash();
    renderIncomeDisplay();
    renderStats(state);
    renderHotelSnapshot(state);
    renderCalendar(state);
    renderCommandCenter(state);
    renderGuestRoster(state);
    renderGuestPanel(state);
    renderStaffPanel(state);
    renderOperationsPanel(state);
    renderDeptPanel();
    renderSatisfactionMeter(state);
  }

  function renderGuideFrame(state = HotelState.get()) {
    const step = currentGuidedStep(state);
    document.body.dataset.guidedStep = step ?? '';
    document.body.classList.toggle('guided-onboarding-active', !!step);
  }

  function systemUnlocks(state = HotelState.get()) {
    if (HotelState.isExpertMode?.()) {
      return {
        departments: true,
        operations: true,
        staff: true,
        guests: true,
        staffBasic: true,
        reports: true,
        staffAdvanced: true,
        fullDashboard: true,
      };
    }
    const guide = state.onboarding ?? {};
    const guideStep = currentGuidedStep(state);
    const guidedComplete = !!guide.dismissedIntro
      || !!guide.guidedCompleted
      || guide.guidedStep === 'complete'
      || guide.completionReason === 'existing_save';
    const hasGuests = (state.guests?.roster?.length ?? 0) > 0
      || (state.guests?.checkInBoostRemaining ?? 0) > 0;
    const hasReports = (state.calendar?.reports?.length ?? 0) > 0
      || (state.staff?.reports?.length ?? 0) > 0
      || !!guide.lastGuideReport;
    const staffBasic = guidedComplete
      || isPhaseOneOnboarding()
      || guideStep === 'assign_staff'
      || !!guide.firstActionCompleted;
    const guests = guidedComplete || hasGuests;
    const reports = guidedComplete || hasReports || guideStep === 'review_report';
    const staffAdvanced = guidedComplete || reports || (state.calendar?.day ?? 1) > 1;

    return {
      departments: true,
      operations: true,
      staff: staffBasic,
      guests,
      staffBasic,
      reports,
      staffAdvanced,
      fullDashboard: guidedComplete,
    };
  }

  function renderSystemUnlocks(state = HotelState.get()) {
    const unlocks = systemUnlocks(state);
    document.body.dataset.guidanceMode = HotelState.getGuidanceMode?.() ?? 'guided';
    document.body.dataset.staffAdvanced = unlocks.staffAdvanced ? 'true' : 'false';
    document.body.dataset.reportsUnlocked = unlocks.reports ? 'true' : 'false';
    document.body.dataset.guestsUnlocked = unlocks.guests ? 'true' : 'false';

    document.querySelectorAll('[data-tab]').forEach(btn => {
      const tab = btn.dataset.tab;
      const available = canOpenManagementTab(tab, unlocks);
      btn.hidden = !available;
      btn.disabled = !available;
      btn.setAttribute('aria-hidden', available ? 'false' : 'true');
    });

    if (!canOpenManagementTab(activeMgmtTab, unlocks)) {
      setManagementTab(currentGuidedStep(state) === 'run_checkin' ? 'operations' : 'departments');
    }
    renderManagementTabBadges(state, unlocks);

    if (previousUnlocks) {
      if (!previousUnlocks.guests && unlocks.guests) CasinoShell.toast('Guest tracking unlocked.');
      if (!previousUnlocks.reports && unlocks.reports) CasinoShell.toast('Reports unlocked.');
      if (!previousUnlocks.staffAdvanced && unlocks.staffAdvanced) CasinoShell.toast('Staff management expanded.');
    }
    previousUnlocks = { ...unlocks };
  }

  function canOpenManagementTab(tabId, unlocks = systemUnlocks()) {
    if (tabId === 'departments' || tabId === 'operations') return true;
    if (tabId === 'staff') return unlocks.staffBasic;
    if (tabId === 'guests') return unlocks.guests;
    return true;
  }

  function renderManagementTabBadges(state = HotelState.get(), unlocks = systemUnlocks(state)) {
    const staff = typeof HotelState.getStaffRoster === 'function'
      ? HotelState.getStaffRoster()
      : [...(state.staff?.roster ?? [])];
    const shortAreas = staffCoverage(staff, state).filter(item => item.status === 'short').length;
    const guestCount = HotelState.getRosterCount?.() ?? state.guests?.roster?.length ?? 0;
    const tabMeta = {
      departments: { icon:'fa-arrow-up-right-dots', label:'Departments', badge:'' },
      guests: { icon:'fa-person-walking', label:'Guests', badge:unlocks.guests && guestCount ? String(guestCount) : '' },
      staff: { icon:'fa-user-tie', label:'Staff', badge:unlocks.staffBasic && shortAreas ? String(shortAreas) : '' },
      operations: { icon:'fa-list-check', label:'All Shifts', badge:'' },
    };
    document.querySelectorAll('[data-tab]').forEach(btn => {
      const meta = tabMeta[btn.dataset.tab];
      if (!meta) return;
      btn.innerHTML = `
        <i class="fa-solid ${meta.icon}"></i>
        <span>${meta.label}</span>
        ${meta.badge ? `<em>${escapeHtml(meta.badge)}</em>` : ''}
      `;
    });
  }

  function severityClass(item = {}) {
    return `severity-${item.severity ?? item.tone ?? 'info'}`;
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

  function renderHotelSnapshot(state = HotelState.get()) {
    const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    const guestSummary = window.HotelGuests?.uiSummary?.(state);
    const staff = typeof HotelState.getStaffRoster === 'function'
      ? HotelState.getStaffRoster()
      : [...(state.staff?.roster ?? [])];
    const gaps = staffCoverage(staff, state).filter(item => item.status === 'short').length;

    setEl('snapshot-income-rate', fmt(HotelEngine.currentIpm(state)));
    setEl('snapshot-guest-cap', `/${guestSummary?.capacity ?? 0}`);
    setEl('snapshot-staff-gaps', gaps);
    setEl('snapshot-next-unlock', nextUnlockLabel(state));
  }

  function nextUnlockLabel(state = HotelState.get()) {
    const rep = HotelState.getReputation();
    const candidates = HotelConfig.FLOOR_ORDER
      .filter(id => id !== 'lobby')
      .map(id => ({
        id,
        dept: state.departments[id],
        meta: HotelConfig.DEPT_META[id],
        req: HotelConfig.DEPT_UNLOCK_REP[id] ?? 1,
      }));
    const buildable = candidates.find(item => item.dept?.unlocked && (item.dept.level ?? 0) <= 0);
    if (buildable) return `Build ${buildable.meta?.label ?? buildable.id}`;
    const locked = candidates
      .filter(item => !item.dept?.unlocked)
      .sort((a, b) => a.req - b.req)[0];
    if (locked) return rep >= locked.req
      ? locked.meta?.label ?? locked.id
      : `${locked.meta?.label ?? locked.id} at rep ${locked.req}`;
    return 'All departments open';
  }

  function renderCommandCenter(state = HotelState.get()) {
    const strip = document.getElementById('hotel-command-strip');
    const feed = document.getElementById('hotel-activity-feed');
    const guided = isGuidedOnboarding();
    const unlocks = systemUnlocks(state);
    const shiftSet = todayShiftOps(state);
    const priorities = guided ? [guidedPriority(state)] : commandPriorities(state);
    const onboarding = isPhaseOneOnboarding() || guided;
    const compactFeed = onboarding || !unlocks.reports;
    const primary = commandPrimaryForDashboard(priorities, { guided, onboarding });
    const summary = guided ? [] : priorities
      .filter(item => item !== primary)
      .slice(onboarding ? 1 : 0, unlocks.fullDashboard ? 4 : 2);

    if (strip) {
      strip.innerHTML = `
        ${renderShiftReturnBanner(state)}
        ${isPhaseOneOnboarding() ? renderOnboardingIntro() : ''}
        ${guided ? renderGuidedIntro(state) : ''}
        ${renderGuideConfirmation()}
        ${onboardingDebugVisible ? renderOnboardingDebugPanel(state, unlocks) : ''}
        <div class="command-strip-head">
          <div>
            <span>Playable Now</span>
            <strong>Today's Shifts</strong>
            <div class="shift-headline-meta">
              <em>${shiftSet.playableCount} playable shift${shiftSet.playableCount === 1 ? '' : 's'} · Daily hotel actions</em>
              ${renderNextShiftChip(shiftSet.preview)}
            </div>
          </div>
          ${renderGuidanceModeControl()}
        </div>
        ${renderTodayShifts(state, shiftSet.playable)}
        ${renderNextRewardRail(shiftSet.preview, state)}
        ${primary ? renderCommandPrimary(primary, onboarding) : ''}
        <div class="command-chips ${guided ? 'guide-progress-panel' : ''}">
          ${guided ? renderGuideProgress(state) : summary.map(item => `
            <button type="button" class="command-chip ${item.tone} ${severityClass(item)}" data-command-action="${item.action}" ${item.dept ? `data-command-dept="${item.dept}"` : ''}>
              <i class="fa-solid ${item.icon}"></i>
              <span>${escapeHtml(item.label)}</span>
            </button>
          `).join('')}
        </div>
      `;
      strip.querySelectorAll('[data-shift-result-dismiss]').forEach(btn => {
        btn.addEventListener('click', e => {
          e.preventDefault();
          e.stopPropagation();
          dismissShiftResultBanner(btn.dataset.shiftResultDismiss);
        });
      });
      wireShiftLaunchLinks(strip);
      wireCommandActions(strip);
    }

    if (feed) {
      const events = activityEvents(state, priorities).slice(0, compactFeed ? 1 : 4);
      feed.innerHTML = `
        <div class="activity-feed-title ${compactFeed ? 'onboarding-notes-title' : ''}">
          <span><i class="fa-solid fa-wave-square"></i> ${compactFeed ? 'Hotel Notes' : 'Recent Activity'}</span>
          <strong>${events.length}</strong>
        </div>
        <div class="activity-feed-list">
          ${events.map(event => `
            <button type="button" class="activity-feed-item ${event.tone} ${severityClass(event)}" data-command-action="${event.action}" ${event.dept ? `data-command-dept="${event.dept}"` : ''}>
              <i class="fa-solid ${event.icon}"></i>
              <span>${escapeHtml(event.text)}</span>
            </button>
          `).join('')}
        </div>
        ${renderRecentShiftHistory(state)}
      `;
      wireCommandActions(feed);
    }
  }

  function commandPrimaryForDashboard(priorities = [], { guided = false, onboarding = false } = {}) {
    if (guided || onboarding) return priorities[0] ?? null;
    return priorities.find(item => ['critical', 'warning'].includes(item.severity)) ?? null;
  }

  function renderCommandPrimary(primary, onboarding = false) {
    return `
      <div class="command-primary ${primary.tone} ${severityClass(primary)} ${onboarding ? 'onboarding-primary' : ''}">
        <span class="command-icon"><i class="fa-solid ${primary.icon}"></i></span>
        <div>
          <span>${escapeHtml(primary.kicker ?? 'Next Best Move')}</span>
          <strong>${escapeHtml(primary.label)}</strong>
          <em>${escapeHtml(primary.detail)}</em>
        </div>
        <button type="button" data-command-action="${primary.action}" ${primary.dept ? `data-command-dept="${primary.dept}"` : ''}>
          ${escapeHtml(primary.actionLabel)}
        </button>
      </div>
    `;
  }

  function renderRecentShiftHistory(state = HotelState.get()) {
    const history = (state.shifts?.history ?? [])
      .filter(result => result?.deptId)
      .slice(0, 3);
    if (!history.length) return '';
    return `
      <div class="recent-shift-history">
        <div class="recent-shift-title">
          <span><i class="fa-solid fa-clock-rotate-left"></i> Recent Shifts</span>
          <strong>${history.length}</strong>
        </div>
        ${history.map(result => {
          const op = operationCatalog().find(item => item.dept === result.deptId);
          const riskClass = `risk-${result.risk ?? result.briefing?.risk ?? 'medium'}`;
          return `
            <button type="button" class="recent-shift-item ${result.prepared ? 'prepared' : riskClass}" data-command-action="prepare_shift" data-command-dept="${escapeHtml(result.deptId)}">
              <i class="fa-solid ${op?.icon ?? 'fa-clipboard-check'}"></i>
              <span class="recent-shift-copy">
                <span>${escapeHtml(result.title ?? op?.title ?? deptMiniGameLabel(result.deptId))}</span>
                <small>${escapeHtml(recentShiftMeta(result))}</small>
              </span>
              <strong>${escapeHtml(shiftResultRewardText(result))}</strong>
            </button>
          `;
        }).join('')}
      </div>
    `;
  }

  function recentShiftMeta(result) {
    const coverage = result.coverageScore ?? result.briefing?.coverageScore;
    const coverageText = Number.isFinite(coverage) ? `${coverage}% coverage` : '';
    const stateText = result.prepared ? 'Prepared' : shiftRiskCopy(result.risk ?? result.briefing?.risk);
    return [stateText, coverageText].filter(Boolean).join(' · ');
  }

  function shiftRiskCopy(risk = 'medium') {
    return { high:'High risk', medium:'Medium risk', low:'Low risk' }[risk] ?? 'Medium risk';
  }

  function renderShiftReturnBanner(state = HotelState.get()) {
    const result = HotelState.getLatestShiftResult?.(state);
    if (!result || result.id === state.shifts?.dismissedResultId) return '';
    if (Date.now() - (result.completedAt ?? 0) > 45 * 60 * 1000) return '';
    const op = operationCatalog().find(item => item.dept === result.deptId);
    const meta = HotelConfig.DEPT_META[result.deptId];
    const metrics = [
      renderShiftResultMetric('Reward', shiftResultRewardText(result)),
      result.primaryLabel ? renderShiftResultMetric(result.primaryLabel, result.primaryValue) : '',
      ...(Array.isArray(result.metrics) ? result.metrics.slice(0, 2).map(metric => renderShiftResultMetric(metric.label, metric.value)) : []),
    ].filter(Boolean).join('');
    return `
      <section class="shift-return-banner" style="--operation-color:${meta?.color ?? '#0d2218'}">
        <span class="shift-return-icon"><i class="fa-solid ${op?.icon ?? 'fa-clipboard-check'}"></i></span>
        <span class="shift-return-copy">
          <span>Shift Results</span>
          <strong>${escapeHtml(result.title)}</strong>
          <em>${escapeHtml(result.summary || result.impact || shiftResultRewardText(result))}</em>
          ${result.staffImpact ? `<small class="shift-return-staff">${escapeHtml(result.staffImpact)}</small>` : ''}
        </span>
        <span class="shift-return-metrics">
          ${metrics}
        </span>
        <span class="shift-return-actions">
          ${renderShiftReturnAction(result)}
          <button type="button" class="shift-result-dismiss" data-shift-result-dismiss="${escapeHtml(result.id)}" aria-label="Dismiss shift results">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </span>
      </section>
    `;
  }

  function renderShiftReturnAction(result) {
    const next = result?.nextAction;
    if (!next?.label || !next?.action) return '';
    return `
      <button type="button" class="shift-return-next" data-command-action="${escapeHtml(next.action)}" ${next.deptId ? `data-command-dept="${escapeHtml(next.deptId)}"` : ''}>
        ${escapeHtml(next.label)}
      </button>
    `;
  }

  function renderShiftResultMetric(label, value) {
    return `
      <span>
        <small>${escapeHtml(label)}</small>
        <strong>${escapeHtml(value)}</strong>
      </span>
    `;
  }

  function dismissShiftResultBanner(resultId) {
    HotelState.dismissShiftResult?.(resultId);
    renderAll();
  }

  function wireCommandActions(root) {
    root?.querySelectorAll('[data-command-action]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        handleCommandAction(btn);
      });
    });
  }

  function wireShiftLaunchLinks(root) {
    root?.querySelectorAll('.shift-card-main[href], .shift-card-cta[href]').forEach(link => {
      link.addEventListener('click', e => {
        recordShiftLaunchFromLink(link, e);
      }, { capture:true });
    });
  }

  function recordShiftLaunchFromLink(operationLink, event = null) {
    if (!operationLink) return null;
    if (event?.__hotelShiftLaunchDept) return event.__hotelShiftLaunchDept;
    const deptId = operationLink.dataset.shiftDept ?? shiftDeptFromHref(operationLink.getAttribute('href'));
    if (deptId) HotelState.recordShiftStart?.(deptId, shiftStartInfo(deptId));
    if (event) event.__hotelShiftLaunchDept = deptId ?? null;
    return deptId;
  }

  function operationCatalog() {
    return [
      { dept:'lobby', title:'Check-In Rush', subtitle:'Lobby operation', href:'checkin/index.html', icon:'fa-id-card', always:true },
      { dept:'casino', title:'Casino Floor', subtitle:'Slots, blackjack, and table games', href:'../casino.html', icon:'fa-dice' },
      { dept:'rooms', title:'Floor Ops', subtitle:'Guest rooms operation', href:'rooms/index.html', icon:'fa-bell-concierge' },
      { dept:'restaurant', title:'Tasting Room', subtitle:'Restaurant operation', href:'restaurant/index.html', icon:'fa-utensils' },
      { dept:'bar', title:'Bar Shift', subtitle:'Bar & lounge operation', href:'bar/index.html', icon:'fa-martini-glass-citrus' },
      { dept:'entertainment', title:'Show Lineup', subtitle:'Entertainment operation', href:'entertainment/index.html', icon:'fa-masks-theater' },
      { dept:'spa', title:'Spa Rush', subtitle:'Spa & wellness operation', href:'spa/index.html', icon:'fa-spa' },
    ];
  }

  function operationUiState(op, state = HotelState.get()) {
    const dept = state.departments[op.dept];
    const meta = HotelConfig.DEPT_META[op.dept];
    const level = dept?.level ?? 0;
    const repRequired = HotelConfig.DEPT_UNLOCK_REP[op.dept] ?? 1;
    const enabled = op.always || (dept?.unlocked && level > 0);
    const tag = enabled
      ? (op.dept === 'lobby' ? 'Open' : `Lv ${level}`)
      : dept?.unlocked
        ? 'Build'
        : `Rep ${repRequired}`;
    return { ...op, deptState: dept, meta, level, repRequired, enabled, tag };
  }

  function todayShiftOps(state = HotelState.get()) {
    const context = todayShiftContext(state);
    const ops = operationCatalog()
      .map((op, index) => decorateShiftOp(op, state, context, index));
    const playable = ops
      .filter(op => op.enabled)
      .sort((a, b) => Number(a.statusState === 'completed') - Number(b.statusState === 'completed') || b.score - a.score || a.sortIndex - b.sortIndex)
      .slice(0, 3)
      .map((op, index) => ({
        ...op,
        featured: index === 0,
        priorityLabel: index === 0 ? 'Best Now' : op.priorityLabel,
      }));

    return {
      playable,
      playableCount: ops.filter(op => op.enabled).length,
      preview: nextShiftPreview(ops),
    };
  }

  function todayShiftContext(state = HotelState.get()) {
    const guestSummary = window.HotelGuests?.uiSummary?.(state);
    const staff = typeof HotelState.getStaffRoster === 'function'
      ? HotelState.getStaffRoster()
      : [...(state.staff?.roster ?? [])];
    const coverage = new Map(staffCoverage(staff, state).map(item => [item.id, item]));
    return {
      guestSummary,
      coverage,
      population: guestSummary?.population ?? state.guests?.population ?? 0,
      capacity: guestSummary?.capacity ?? 0,
      satisfaction: state.satisfaction?.current ?? 100,
      activeShows: HotelEngine.activeEntertainmentBookings?.(state)?.length ?? 0,
      guidedStep: currentGuidedStep(state),
      rep: HotelState.getReputation(),
    };
  }

  function decorateShiftOp(op, state, context, sortIndex) {
    const ui = operationUiState(op, state);
    const statusInfo = HotelState.getShiftStatus?.(ui.dept, state) ?? { state:'ready', result:null };
    const score = shiftScore(ui, context);
    const readiness = shiftReadiness(ui, state, context, score);
    const expected = shiftExpectedReward(ui, state, context, readiness);
    const briefing = HotelState.getShiftBriefing?.(ui.dept, state) ?? null;
    return {
      ...ui,
      sortIndex,
      rep: context.rep,
      score,
      priorityLabel: shiftPriorityLabel(ui, context),
      reason: shiftDetail(ui, state, context),
      reward: shiftReward(ui, state),
      impact: shiftImpact(ui, state, context),
      readiness,
      expected,
      briefing,
      statusInfo,
      statusState: statusInfo.state,
      completedResult: statusInfo.result,
    };
  }

  function shiftScore(op, context) {
    if (!op.enabled) return -Infinity;
    const openRooms = Math.max(0, context.capacity - context.population);
    const occupancy = context.capacity ? context.population / context.capacity : 0;
    const coverage = context.coverage.get(op.dept);
    let score = 12 + (op.level * 4);

    if (op.dept === 'rooms') {
      score += context.population > 0 ? 70 : 16;
      score += Math.min(24, context.population * 3);
      if (occupancy >= 0.75) score += 14;
      if (context.satisfaction < 80) score += 12;
    } else if (op.dept === 'lobby') {
      score += openRooms > 0 ? 58 : 8;
      score += Math.min(18, openRooms * 2);
      if (context.population === 0) score += 18;
    } else if (op.dept === 'casino') {
      score += 42 + (op.level * 5);
      if (context.population === 0) score += 10;
    } else if (op.dept === 'restaurant' || op.dept === 'spa') {
      score += 34;
      if (context.satisfaction < 80) score += 16;
    } else if (op.dept === 'bar') {
      score += 32 + (occupancy >= 0.5 ? 8 : 0);
    } else if (op.dept === 'entertainment') {
      score += 30 + (context.activeShows ? 18 : 0);
    }

    if (coverage?.status === 'short') score += 8;
    if (coverage?.status === 'thin') score += 4;
    if (context.guidedStep === 'run_checkin' && op.dept === 'lobby') score += 200;
    return score;
  }

  function shiftPriorityLabel(op, context) {
    if (op.dept === 'rooms' && context.population > 0) return 'High Impact';
    if (op.dept === 'lobby') return 'Open Shift';
    if (op.dept === 'casino') return 'Daily';
    if (context.coverage.get(op.dept)?.status === 'short') return 'Needs Coverage';
    return 'Open Shift';
  }

  function nextShiftPreview(ops) {
    const candidates = ops.filter(op => !op.enabled && op.dept !== 'lobby');
    return candidates.find(op => op.deptState?.unlocked)
      ?? candidates.find(op => op.repRequired - op.rep <= 2)
      ?? candidates[0]
      ?? null;
  }

  function renderTodayShifts(state = HotelState.get(), ordered = todayShiftOps(state).playable) {
    const featured = ordered[0] ?? null;
    const secondary = ordered.slice(1);
    return `
      <section class="today-shifts" aria-label="Playable hotel shifts">
        ${featured ? renderTodayShiftCard(featured, state, 'featured') : ''}
        ${secondary.length ? `
          <div class="shift-secondary-stack" aria-label="Other playable shifts">
            ${secondary.map(op => renderTodayShiftCard(op, state, 'secondary')).join('')}
          </div>
        ` : ''}
      </section>
    `;
  }

  function renderTodayShiftCard(op, state = HotelState.get(), variant = 'standard') {
    const featured = variant === 'featured' || op.featured;
    const guideTarget = currentGuidedStep(state) === 'run_checkin' && op.dept === 'lobby';
    const guideMuted = currentGuidedStep(state) === 'run_checkin' && op.dept !== 'lobby';
    const style = `--operation-color:${op.meta?.color ?? '#0d2218'};--operation-accent:${op.meta?.accent ?? '#1a3d2a'}`;
    return `
      <article class="shift-card ${featured ? 'shift-card-featured featured' : 'shift-card-secondary'} shift-state-${shiftStateClass(op)} readiness-${op.readiness?.key ?? 'ready'} ${op.briefing?.prepared ? 'is-prepared' : ''} ${guideTarget ? 'guide-target-control' : ''} ${guideMuted ? 'guide-muted-control' : ''}" data-shift-role="${featured ? 'featured' : 'secondary'}" style="${style}">
        <a class="shift-card-main" href="${op.href}" data-shift-dept="${op.dept}" aria-label="${escapeHtml(op.title)}">
          <span class="shift-card-icon"><i class="fa-solid ${op.icon}"></i></span>
          <span class="shift-card-copy">
            <span class="shift-card-state">${escapeHtml(shiftStateLabel(op))}</span>
            ${op.briefing?.prepared ? '<span class="shift-prepared-badge"><i class="fa-solid fa-circle-check"></i> Prepared</span>' : ''}
            <span class="shift-card-kicker">${escapeHtml(op.priorityLabel)}</span>
            <strong>${escapeHtml(op.title)}</strong>
            <em>${escapeHtml(op.reason ?? shiftDetail(op, state))}</em>
            ${featured || op.readiness?.prepareTarget ? `<small class="shift-card-prep">${escapeHtml(shiftPrepNote(op))}</small>` : ''}
          </span>
          <span class="shift-card-reward">
            <span>Expected</span>
            <strong>${escapeHtml(shiftCardRewardValue(op, state))}</strong>
            ${featured ? `<em>${escapeHtml(op.expected?.detail ?? '')}</em>` : ''}
          </span>
        </a>
        <span class="shift-card-actions">
          ${renderShiftPrepareButton(op)}
          <a class="shift-card-cta" href="${op.href}" data-shift-dept="${op.dept}">${escapeHtml(shiftCta(op))}</a>
        </span>
      </article>
    `;
  }

  function renderShiftPrepareButton(op) {
    if (!op.readiness?.prepareTarget || op.statusState === 'completed') return '';
    return `
      <button class="shift-card-prepare" type="button" data-command-action="prepare_shift" data-command-dept="${op.dept}">
        <i class="fa-solid ${op.readiness.prepareTarget === 'staff' ? 'fa-user-tie' : 'fa-arrow-up-right-dots'}"></i>
        Prepare
      </button>
    `;
  }

  function renderNextRewardRail(op, state = HotelState.get()) {
    if (!op) {
      return `
        <section class="next-reward-rail is-complete" aria-label="Next shift reward">
          <span><small>Next Reward</small><strong>All shifts open</strong></span>
          <span><small>Need</small><strong>Keep improving departments</strong></span>
          <span><small>Reward</small><strong>Higher shift payouts</strong></span>
        </section>
      `;
    }
    const meta = HotelConfig.DEPT_META[op.dept];
    return `
      <section class="next-reward-rail" aria-label="Next shift reward">
        <span>
          <small>Next Reward</small>
          <strong><i class="fa-solid ${op.icon}"></i> ${escapeHtml(op.title)}</strong>
        </span>
        <span>
          <small>Need</small>
          <strong>${escapeHtml(nextRewardNeed(op, state))}</strong>
        </span>
        <span>
          <small>Reward</small>
          <strong>${escapeHtml(nextRewardValue(op, state))}</strong>
        </span>
        <button type="button" data-command-action="dept" data-command-dept="${op.dept}" style="--operation-color:${meta?.color ?? '#0d2218'}">
          ${escapeHtml(op.deptState?.unlocked ? 'Build' : 'View Path')}
        </button>
      </section>
    `;
  }

  function renderNextShiftChip(op) {
    if (!op) return '';
    return `
      <button class="shift-next-chip" type="button" data-command-action="dept" data-command-dept="${op.dept}">
        <i class="fa-solid ${op.icon}"></i>
        <span>${escapeHtml(nextShiftText(op))}</span>
      </button>
    `;
  }

  function nextShiftText(op) {
    if (op.deptState?.unlocked) return `Next: build ${op.title}`;
    return `Next: ${op.title} · Rep ${op.repRequired}`;
  }

  function nextRewardNeed(op, state = HotelState.get()) {
    if (op.deptState?.unlocked) {
      const first = HotelConfig.UPGRADE_CATALOG[op.dept]?.[0];
      const cost = first?.cost ? ` · $${fmt(first.cost)}` : '';
      return `Build ${op.meta?.label ?? op.title}${cost}`;
    }
    return `Reach reputation ${op.repRequired}`;
  }

  function nextRewardValue(op, state = HotelState.get()) {
    const first = HotelConfig.UPGRADE_CATALOG[op.dept]?.[0];
    const ipm = first?.ipm ? `+$${fmtShort(first.ipm)}/min` : 'new hotel action';
    return `Unlock ${op.title} · ${ipm}`;
  }

  function shiftDetail(op, state = HotelState.get(), context = todayShiftContext(state)) {
    const guestSummary = context.guestSummary;
    if (op.dept === 'lobby') {
      if (guestSummary) return `${Math.max(0, guestSummary.capacity - guestSummary.population)} rooms ready for arrivals`;
      return 'Check guests into open rooms';
    }
    if (op.dept === 'rooms' && guestSummary) {
      return `${guestSummary.population}/${guestSummary.capacity} guests in house`;
    }
    if (op.dept === 'casino') return 'Table games and reels are open';
    if (op.dept === 'restaurant') return 'Dining room service shift';
    if (op.dept === 'bar') return 'Bar and lounge service shift';
    if (op.dept === 'entertainment') return 'Book and run the show lineup';
    if (op.dept === 'spa') return 'Wellness guests are waiting';
    return op.subtitle;
  }

  function shiftReward(op, state = HotelState.get()) {
    const current = HotelConfig.UPGRADE_CATALOG[op.dept]?.[(state.departments[op.dept]?.level ?? 1) - 1];
    if (op.dept === 'lobby') return 'Guests + room revenue';
    if (op.dept === 'casino') return 'Chips + casino progress';
    if (current?.ipm) return `+$${fmtShort(current.ipm)}/min + satisfaction`;
    return 'Cash + satisfaction';
  }

  function shiftReadiness(op, state = HotelState.get(), context = todayShiftContext(state), score = shiftScore(op, context)) {
    const coverage = context.coverage.get(op.dept);
    const title = op.title ?? deptMiniGameLabel(op.dept);
    if (!op.enabled) {
      return {
        key: op.deptState?.unlocked ? 'needs_build' : 'locked',
        label: op.deptState?.unlocked ? 'Build First' : 'Locked',
        tone: 'locked',
        note: lockedShiftDetail(op),
        prepareTarget: 'dept',
      };
    }
    if (coverage?.status === 'short') {
      return {
        key: 'short_staffed',
        label: 'Short Staffed',
        tone: 'warn',
        note: `Assign ${assignmentLabel(op.dept)} staff before ${title} for better rewards.`,
        prepareTarget: 'staff',
      };
    }
    if ((state.satisfaction?.current ?? 100) < 55 && ['rooms', 'restaurant', 'spa', 'bar'].includes(op.dept)) {
      return {
        key: 'low_satisfaction',
        label: 'Low Satisfaction',
        tone: 'warn',
        note: `${title} can recover satisfaction; strong coverage lowers the risk.`,
        prepareTarget: coverage?.status === 'covered' ? null : 'staff',
      };
    }
    if (coverage?.status === 'thin') {
      return {
        key: 'thin_staff',
        label: 'Ready',
        tone: 'neutral',
        note: `${assignmentLabel(op.dept)} coverage is thin; add staff for a cleaner run.`,
        prepareTarget: 'staff',
      };
    }
    if (score >= 82 || op.dept === 'rooms' || op.dept === 'lobby') {
      return {
        key: 'high_reward',
        label: 'High Reward',
        tone: 'good',
        note: `${title} is a strong play right now.`,
        prepareTarget: null,
      };
    }
    return {
      key: 'ready',
      label: 'Ready',
      tone: 'good',
      note: `${title} is ready to run.`,
      prepareTarget: null,
    };
  }

  function shiftExpectedReward(op, state = HotelState.get(), context = todayShiftContext(state), readiness = shiftReadiness(op, state, context)) {
    const coverage = context.coverage.get(op.dept);
    const staffEffect = HotelState.getStaffEffect?.(op.dept, state);
    const staffBonus = Math.round(((staffEffect?.incomeMult ?? 1) - 1) * 100);
    const level = Math.max(1, op.level || state.departments?.[op.dept]?.level || 1);
    const guests = Math.max(0, context.population ?? 0);
    const openRooms = Math.max(0, (context.capacity ?? 0) - guests);
    let low = 40 + level * 12;
    let high = 95 + level * 34;

    if (op.dept === 'lobby') {
      low = Math.max(25, openRooms * 28);
      high = Math.max(70, openRooms * 86);
    } else if (op.dept === 'rooms') {
      low = Math.max(45, guests * 12 + level * 18);
      high = Math.max(110, guests * 30 + level * 45);
    } else if (op.dept === 'casino') {
      low = 0;
      high = 0;
    } else if (op.dept === 'entertainment') {
      low = 0;
      high = 0;
    } else {
      low = Math.round((55 + level * 24) * (staffEffect?.incomeMult ?? 1));
      high = Math.round((130 + level * 58) * (staffEffect?.incomeMult ?? 1));
    }

    const risk = readiness.key === 'short_staffed' || coverage?.status === 'short'
      ? 'high'
      : (state.satisfaction?.current ?? 100) < 55 || coverage?.status === 'thin'
        ? 'medium'
        : 'low';
    const cashText = op.dept === 'casino'
      ? 'casino progress'
      : op.dept === 'entertainment'
        ? 'traffic boost'
        : `+$${fmtShort(low)}-$${fmtShort(high)}`;
    return {
      cashText,
      risk,
      staffBonus,
      label: `Expected: ${cashText}`,
      detail: `Risk: ${risk}${staffBonus > 0 ? ` · Staff +${staffBonus}%` : ''}`,
    };
  }

  function shiftImpact(op, state = HotelState.get(), context = todayShiftContext(state)) {
    if (op.dept === 'lobby') return 'Fills rooms and starts guest revenue.';
    if (op.dept === 'rooms') return 'Protects satisfaction and guest retention.';
    if (op.dept === 'casino') return 'Feeds casino progress and the chip loop.';
    if (op.dept === 'restaurant') return 'Raises dining value and service momentum.';
    if (op.dept === 'bar') return 'Adds tips, mood, and nightlife value.';
    if (op.dept === 'entertainment') return 'Books shows that lift traffic and income.';
    if (op.dept === 'spa') return 'Recovers satisfaction for premium guests.';
    return 'Improves hotel momentum.';
  }

  function shiftDisplayReward(op, state = HotelState.get()) {
    if (op.statusState === 'completed' && op.completedResult) return shiftResultRewardText(op.completedResult);
    return op.expected?.label ?? op.reward ?? shiftReward(op, state);
  }

  function shiftCardRewardValue(op, state = HotelState.get()) {
    if (op.statusState === 'completed' && op.completedResult) return shiftResultRewardText(op.completedResult);
    return op.expected?.cashText ?? op.reward ?? shiftReward(op, state);
  }

  function shiftPrepNote(op) {
    if (op.statusState === 'completed' && op.completedResult) {
      return op.completedResult.impact || op.completedResult.summary || 'Result saved for this hotel phase.';
    }
    return op.readiness?.note || op.impact || 'Ready for hotel progress.';
  }

  function shiftResultRewardText(result) {
    if (!result) return 'Completed';
    if (result.rewardText) return result.rewardText;
    const parts = [];
    if (result.cash > 0) parts.push(`+$${fmt(result.cash)}`);
    if (result.satisfaction > 0) parts.push(`+${result.satisfaction} satisfaction`);
    return parts.length ? parts.join(' · ') : 'Progress recorded';
  }

  function shiftStateLabel(op) {
    if (op.statusState === 'completed') return 'Completed';
    if (op.statusState === 'in_progress') return 'Resume';
    if (op.readiness?.key === 'short_staffed') return 'Needs Staff';
    if (op.readiness?.key === 'low_satisfaction' || op.expected?.risk === 'high') return 'High Risk';
    if (op.readiness?.key === 'high_reward') return 'High Reward';
    return op.readiness?.label ?? 'Ready';
  }

  function shiftStateClass(op) {
    if (op.statusState === 'completed') return 'completed';
    if (op.statusState === 'in_progress') return 'progress';
    return 'ready';
  }

  function shiftCta(op) {
    if (op.statusState === 'completed') return 'Run Again';
    if (op.statusState === 'in_progress') return 'Resume Shift';
    if (op.dept === 'casino') return 'Open Casino';
    if (op.dept === 'lobby') return 'Start Check-In';
    if (op.dept === 'rooms') return 'Run Floor Ops';
    if (op.dept === 'restaurant') return 'Open Service';
    if (op.dept === 'bar') return 'Run Bar';
    if (op.dept === 'entertainment') return 'Book Show';
    if (op.dept === 'spa') return 'Start Spa';
    return 'Start Shift';
  }

  function isPhaseOneOnboarding() {
    return HotelState.isOnboardingActive?.() ?? false;
  }

  function isGuidedOnboarding() {
    return HotelState.isGuidedOnboardingActive?.() ?? false;
  }

  function currentGuidedStep(state = HotelState.get()) {
    return HotelState.isGuidedOnboardingActive?.()
      ? state.onboarding?.guidedStep ?? 'assign_staff'
      : null;
  }

  function renderGuidanceModeControl() {
    const mode = HotelState.getGuidanceMode?.() ?? 'guided';
    return `
      <div class="guidance-mode-control" aria-label="Dashboard guidance mode">
        <span>Mode</span>
        <button type="button" data-guidance-mode="guided" class="${mode === 'guided' ? 'active' : ''}" aria-pressed="${mode === 'guided'}">Guided</button>
        <button type="button" data-guidance-mode="expert" class="${mode === 'expert' ? 'active' : ''}" aria-pressed="${mode === 'expert'}">Expert</button>
      </div>
    `;
  }

  function renderOnboardingIntro() {
    return `
      <div class="onboarding-intro">
        <div>
          <span>New Manager Start</span>
          <strong>Start with one service fix: assign staff where coverage is short.</strong>
          <small>Use the best next move below. Good coverage protects satisfaction while the hotel grows.</small>
        </div>
        <button type="button" data-onboarding-action="dismiss">Skip guidance</button>
      </div>
    `;
  }

  function completePhaseOne(reason) {
    const changed = HotelState.completeOnboarding?.(reason);
    if (changed) showGuideConfirmation(reason);
    return changed;
  }

  function completeGuidedStep(expectedStep, report = null) {
    const changed = HotelState.advanceGuidedOnboarding?.(expectedStep, report);
    if (changed) showGuideConfirmation(expectedStep);
    return changed;
  }

  function markGuidedOperationStart(deptId) {
    if (isPhaseOneOnboarding()) {
      completePhaseOne('operation');
      return;
    }
    if (deptId === 'lobby') completeGuidedStep('run_checkin');
  }

  function renderGuidedIntro(state = HotelState.get()) {
    const meta = guidedStepMeta(state);
    return `
      <div class="onboarding-intro guide-step-intro">
        <div>
          <span>Guided Setup · Step ${meta.number} of 5</span>
          <strong>${escapeHtml(meta.title)}</strong>
          <small>${escapeHtml(meta.why)}</small>
        </div>
        <button type="button" data-onboarding-action="dismiss">End guidance</button>
      </div>
    `;
  }

  function guidedPriority(state = HotelState.get()) {
    const meta = guidedStepMeta(state);
    return {
      tone: meta.tone,
      icon: meta.icon,
      label: meta.label,
      detail: meta.detail,
      action: meta.action,
      actionLabel: meta.actionLabel,
      dept: meta.dept,
    };
  }

  function guidedStepMeta(state = HotelState.get()) {
    const step = currentGuidedStep(state) ?? 'assign_staff';
    const upgrade = guidedUpgradeTarget(state, HotelState.getCash());
    const report = state.onboarding?.lastGuideReport ?? {};
    return {
      assign_staff: {
        number: 1,
        tone: 'warn',
        icon: 'fa-user-tie',
        title: 'Cover service',
        label: 'Assign one staff member',
        detail: 'Click Staff, then assign an available worker to a short department.',
        why: 'Coverage is the fastest way to stop satisfaction from sliding.',
        action: 'staff',
        actionLabel: 'Open staff',
      },
      upgrade_department: {
        number: 2,
        tone: 'good',
        icon: 'fa-arrow-up-right-dots',
        title: 'Improve the hotel',
        label: upgrade ? `Upgrade ${upgrade.meta.label}` : 'Choose an upgrade',
        detail: upgrade ? `Click Upgrade. $${fmtShort(upgrade.next.cost)} buys ${upgrade.next.label}.` : 'Pick an affordable department upgrade.',
        why: 'Upgrades raise income and give the next shift more room to succeed.',
        action: upgrade ? 'dept' : 'departments',
        dept: upgrade?.id,
        actionLabel: 'Open upgrade',
      },
      run_checkin: {
        number: 3,
        tone: 'neutral',
        icon: 'fa-id-card',
        title: 'Bring in guests',
        label: 'Run Check-In Rush',
        detail: 'Click All Shifts, then open Check-In Rush and check in guests.',
        why: 'Guests make the hotel feel alive and unlock the guest view.',
        action: 'operations',
        actionLabel: 'Open All Shifts',
      },
      advance_time: {
        number: 4,
        tone: 'warn',
        icon: 'fa-forward-step',
        title: 'See the results',
        label: 'Advance time',
        detail: 'Click Advance Time at the top of the screen.',
        why: 'The next phase collects income, pays payroll, and creates your first report.',
        action: 'advance_time',
        actionLabel: 'Highlight button',
      },
      review_report: {
        number: 5,
        tone: 'good',
        icon: 'fa-clipboard-check',
        title: 'Review your hotel',
        label: 'Review the shift report',
        detail: report.summary ?? 'Click Complete guide after reviewing what changed.',
        why: 'The report shows what your first decisions improved and what needs attention next.',
        action: 'review_report',
        actionLabel: 'Complete guide',
      },
    }[step];
  }

  function showGuideConfirmation(stepId) {
    const text = guideCompletionText(stepId);
    if (!text) {
      renderAll();
      return;
    }
    guideConfirmation = { stepId, text, createdAt: Date.now() };
    renderAll();
    if (guideConfirmationTimer) clearTimeout(guideConfirmationTimer);
    guideConfirmationTimer = setTimeout(() => {
      if (!guideConfirmation || guideConfirmation.stepId !== stepId) return;
      guideConfirmation = null;
      renderCommandCenter(HotelState.get());
    }, 3600);
  }

  function guideCompletionText(stepId) {
    return {
      staff_assignment: 'Step complete: service coverage started.',
      upgrade: 'Step complete: your first improvement is underway.',
      operation: 'Step complete: shifts are open.',
      assign_staff: 'Step complete: coverage is better.',
      upgrade_department: 'Step complete: the hotel is stronger.',
      run_checkin: 'Step complete: guests are arriving.',
      advance_time: 'Step complete: the first shift report is ready.',
      review_report: 'Guide complete: the full dashboard is yours.',
    }[stepId] ?? '';
  }

  function renderGuideConfirmation() {
    if (!guideConfirmation) return '';
    return `
      <div class="guide-confirmation" role="status">
        <i class="fa-solid fa-circle-check"></i>
        <span>${escapeHtml(guideConfirmation.text)}</span>
      </div>
    `;
  }

  function renderOnboardingDebugPanel(state = HotelState.get(), unlocks = systemUnlocks(state)) {
    const guide = state.onboarding ?? {};
    const rows = [
      ['Mode', HotelState.getGuidanceMode?.() ?? 'guided'],
      ['Phase', String(guide.phase ?? 1)],
      ['Step', guide.guidedStep ?? 'assign_staff'],
      ['First action', guide.firstActionCompleted ? 'yes' : 'no'],
      ['Guided complete', guide.guidedCompleted ? 'yes' : 'no'],
      ['Dismissed', guide.dismissedIntro ? 'yes' : 'no'],
      ['Reason', guide.completionReason ?? 'none'],
      ['Active tab', activeMgmtTab],
      ['Unlocks', Object.entries(unlocks).filter(([, value]) => value).map(([key]) => key).join(', ')],
    ];
    return `
      <section class="onboarding-debug-panel" aria-label="Onboarding debug panel">
        <div class="onboarding-debug-head">
          <div>
            <span>Onboarding Test Panel</span>
            <strong>Use Ctrl+Shift+G to hide or show this panel.</strong>
          </div>
          <button type="button" data-onboarding-debug-action="hide">Hide</button>
        </div>
        <div class="onboarding-debug-grid">
          ${rows.map(([label, value]) => `
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(value)}</strong>
          `).join('')}
        </div>
        <div class="onboarding-debug-actions">
          <button type="button" data-onboarding-debug-scenario="fresh_user">Fresh user</button>
          <button type="button" data-onboarding-debug-scenario="skip_guidance">Skipped</button>
          <button type="button" data-onboarding-debug-scenario="expert_toggle">Expert</button>
          <button type="button" data-onboarding-debug-action="guided-mode">Guided</button>
          <button type="button" data-onboarding-debug-scenario="existing_save">Existing save</button>
          <button type="button" data-onboarding-debug-scenario="guided_complete">Guide complete</button>
          <button type="button" data-onboarding-debug-action="reset-onboarding">Reset onboarding only</button>
        </div>
      </section>
    `;
  }

  function renderGuideProgress(state = HotelState.get()) {
    const current = currentGuidedStep(state) ?? 'assign_staff';
    const steps = [
      ['assign_staff', 'Staff'],
      ['upgrade_department', 'Upgrade'],
      ['run_checkin', 'Check-In'],
      ['advance_time', 'Time'],
      ['review_report', 'Report'],
    ];
    const currentIndex = Math.max(0, steps.findIndex(([id]) => id === current));
    return `
      <div class="guide-progress-list">
        ${steps.map(([id, label], index) => `
          <span class="${index < currentIndex ? 'done' : id === current ? 'active' : ''}">
            <i class="fa-solid ${index < currentIndex ? 'fa-check' : id === current ? 'fa-location-dot' : 'fa-circle'}"></i>
            ${label}
          </span>
        `).join('')}
      </div>
      ${current === 'review_report' ? renderGuideReport(state) : ''}
    `;
  }

  function renderGuideReport(state = HotelState.get()) {
    const report = state.onboarding?.lastGuideReport;
    if (!report) return '<p class="guide-report-empty">Advance time to generate the first report.</p>';
    return `
      <div class="guide-report-card">
        <div><span>Income</span><strong>+$${fmt(report.income ?? 0)}</strong></div>
        <div><span>Payroll</span><strong>$${fmt(report.payroll ?? 0)}</strong></div>
        <div><span>Satisfaction</span><strong>${fmt(report.satBefore ?? 0)}% -> ${fmt(report.satAfter ?? 0)}%</strong></div>
        <div><span>Coverage</span><strong>${fmt(report.shortBefore ?? 0)} short -> ${fmt(report.shortAfter ?? 0)} short</strong></div>
      </div>
    `;
  }

  function commandPriorities(state) {
    const items = [];
    const cash = HotelState.getCash();
    const onboarding = isPhaseOneOnboarding();
    const staff = typeof HotelState.getStaffRoster === 'function'
      ? HotelState.getStaffRoster()
      : [...(state.staff?.roster ?? [])];
    const applications = typeof HotelState.getStaffApplications === 'function'
      ? HotelState.getStaffApplications()
      : [...(state.staff?.applications ?? [])];
    const coverage = staffCoverage(staff, state);
    const shortCoverage = coverage.filter(item => item.status === 'short');
    const thinCoverage = coverage.filter(item => item.status === 'thin');
    const upgrade = bestAffordableUpgrade(state, cash);
    const guestSummary = window.HotelGuests?.uiSummary?.(state);
    const unlocks = systemUnlocks(state);

    if (onboarding) {
      if (shortCoverage.length) {
        const focus = shortCoverage.find(item => item.id === 'restaurant') ?? shortCoverage[0];
        items.push({
          tone: 'warn',
          severity: 'warning',
          icon: 'fa-user-tie',
          label: focus.id === 'restaurant' ? 'Assign restaurant staff' : 'Staff setup needed',
          detail: `${focus.label} needs one available worker assigned.`,
          action: 'staff',
          actionLabel: 'Start with staff',
          onboarding: true,
        });
      }
      if (upgrade) {
        items.push({
          tone: 'good',
          severity: 'opportunity',
          icon: 'fa-arrow-up-right-dots',
          label: 'Upgrade available',
          detail: `$${fmtShort(upgrade.next.cost)} improves ${upgrade.meta.label}`,
          action: 'dept',
          dept: upgrade.id,
          actionLabel: 'View upgrade',
          onboarding: true,
        });
      }
      if (!items.length) {
        items.push({
          tone: 'neutral',
          severity: 'info',
          icon: 'fa-calendar-day',
          label: 'Ready to advance time',
          detail: 'Run the next hotel phase to see income and service results.',
          action: 'operations',
          actionLabel: 'Open All Shifts',
          onboarding: true,
        });
      }
      return items;
    }

    if (shortCoverage.length) {
      items.push({
        tone: shortCoverage.some(item => item.score <= 0) ? 'bad' : 'warn',
        severity: shortCoverage.some(item => item.score <= 0) ? 'critical' : 'warning',
        icon: 'fa-triangle-exclamation',
        label: `${shortCoverage.length} staff gaps`,
        detail: `${shortCoverage[0].label} needs coverage first`,
        action: 'staff',
        actionLabel: 'Assign staff',
      });
    }
    if (upgrade) {
      items.push({
        tone: 'good',
        severity: 'opportunity',
        icon: 'fa-arrow-up-right-dots',
        label: `${upgrade.meta.label} upgrade`,
        detail: `$${fmtShort(upgrade.next.cost)} buys ${upgrade.next.label}`,
        action: 'dept',
        dept: upgrade.id,
        actionLabel: 'View upgrade',
      });
    }
    if (applications.length && unlocks.staffAdvanced) {
      items.push({
        tone: 'neutral',
        severity: 'info',
        icon: 'fa-file-signature',
        label: `${applications.length} applicants`,
        detail: 'Review hires before the next rush',
        action: 'hiring',
        actionLabel: 'Review applicants',
      });
    }
    if (unlocks.guests && guestSummary && guestSummary.population >= guestSummary.capacity) {
      items.push({
        tone: 'warn',
        severity: 'warning',
        icon: 'fa-bed',
        label: 'Rooms capped',
        detail: `${guestSummary.population}/${guestSummary.capacity} guests in house`,
        action: 'dept',
        dept: 'rooms',
        actionLabel: 'Open rooms',
      });
    }
    if (thinCoverage.length && !shortCoverage.length) {
      items.push({
        tone: 'warn',
        severity: 'warning',
        icon: 'fa-gauge-high',
        label: `${thinCoverage.length} thin areas`,
        detail: `${thinCoverage[0].label} has little slack`,
        action: 'staff',
        actionLabel: 'Check coverage',
      });
    }
    if (unlocks.reports && (state.satisfaction?.current ?? 100) < 80) {
      items.push({
        tone: (state.satisfaction?.current ?? 100) < 40 ? 'bad' : 'warn',
        severity: (state.satisfaction?.current ?? 100) < 40 ? 'critical' : 'warning',
        icon: 'fa-face-frown',
        label: 'Satisfaction dip',
        detail: `${state.satisfaction.current}% satisfaction needs attention`,
        action: 'staff',
        actionLabel: 'Find cause',
      });
    }
    items.push({
      tone: 'neutral',
      severity: 'info',
      icon: 'fa-gamepad',
      label: 'All Shifts ready',
      detail: 'Run a department shift for active progress',
      action: 'operations',
      actionLabel: 'Open All Shifts',
    });
    return items;
  }

  function prepareNextShiftPriority(state = HotelState.get(), playable = todayShiftOps(state).playable) {
    const target = playable.find(op => op.statusState !== 'completed') ?? playable[0];
    if (!target) return null;
    const prepTarget = target.readiness?.prepareTarget;
    const issueTone = target.readiness?.tone === 'warn' ? 'warn' : 'good';
    const detail = prepTarget
      ? `${target.readiness.note} Then run ${target.title} for ${target.expected?.cashText ?? 'hotel progress'}.`
      : `${target.title} is ready. ${target.expected?.label ?? 'Expected rewards are available'} · ${target.expected?.detail ?? target.impact}`;
    return {
      tone: issueTone,
      severity: prepTarget ? 'warning' : 'opportunity',
      icon: prepTarget === 'staff' ? 'fa-user-tie' : prepTarget === 'dept' ? 'fa-arrow-up-right-dots' : target.icon,
      label: prepTarget ? `Prepare ${target.title}` : `Run ${target.title}`,
      detail,
      action: prepTarget ? 'prepare_shift' : 'play_shift',
      dept: target.dept,
      href: target.href,
      actionLabel: prepTarget === 'staff' ? 'Prepare staff' : prepTarget === 'dept' ? 'Open build path' : shiftCta(target),
      kicker: 'Prepare Next Shift',
    };
  }

  function activityEvents(state, priorities) {
    if (isPhaseOneOnboarding()) {
      const primary = priorities[0];
      return [{
        tone: primary?.tone ?? 'neutral',
        icon: primary?.icon ?? 'fa-circle-info',
        text: primary?.detail ?? 'Start with one hotel action, then advance time.',
        action: primary?.action ?? 'departments',
        dept: primary?.dept,
      }];
    }
    if (isGuidedOnboarding()) {
      const primary = priorities[0] ?? guidedPriority(state);
      return [{
        tone: primary?.tone ?? 'neutral',
        icon: primary?.icon ?? 'fa-circle-info',
        text: primary?.detail ?? 'Follow the highlighted setup step.',
        action: primary?.action ?? 'departments',
        dept: primary?.dept,
      }];
    }

    const events = priorities.slice(1).map(item => ({
      tone: item.tone,
      severity: item.severity,
      icon: item.icon,
      text: `${item.label}: ${item.detail}`,
      action: item.action,
      dept: item.dept,
    }));
    const ipm = HotelEngine.currentIpm(state);
    events.push({
      tone: 'good',
      severity: 'info',
      icon: 'fa-sack-dollar',
      text: `Hotel income is $${fmt(ipm)}/min`,
      action: 'departments',
    });
    events.push({
      tone: 'neutral',
      severity: 'info',
      icon: 'fa-calendar-day',
      text: `${phaseLabel(state.calendar?.phase ?? 'morning')} phase is active`,
      action: 'operations',
    });
    return events;
  }

  function bestAffordableUpgrade(state, cash) {
    const { FLOOR_ORDER, DEPT_META, UPGRADE_CATALOG } = HotelConfig;
    return FLOOR_ORDER
      .filter(id => id !== 'lobby')
      .map(id => {
        const dept = state.departments[id];
        if (!dept?.unlocked) return null;
        const catalog = UPGRADE_CATALOG[id] ?? [];
        const next = catalog[dept.level ?? 0];
        if (!next || cash < next.cost) return null;
        return { id, dept, next, meta: DEPT_META[id] };
      })
      .filter(Boolean)
      .sort((a, b) => (b.next.ipm ?? 0) - (a.next.ipm ?? 0))[0] ?? null;
  }

  function guidedUpgradeTarget(state, cash) {
    const preferred = ['rooms', 'casino', 'lobby'];
    const upgrades = preferred
      .map(id => {
        const dept = state.departments[id];
        const catalog = HotelConfig.UPGRADE_CATALOG[id] ?? [];
        const next = catalog[dept?.level ?? 0];
        if (!dept?.unlocked || !next || cash < next.cost) return null;
        return { id, dept, next, meta: HotelConfig.DEPT_META[id] };
      })
      .filter(Boolean);
    return upgrades[0] ?? bestAffordableUpgrade(state, cash);
  }

  function guidedStaffTarget(state = HotelState.get()) {
    const staff = typeof HotelState.getStaffRoster === 'function'
      ? HotelState.getStaffRoster()
      : [...(state.staff?.roster ?? [])];
    const coverage = staffCoverage(staff, state);
    return coverage.find(item => item.id === 'restaurant' && item.status !== 'covered')
      ?? coverage.find(item => item.status === 'short')
      ?? coverage.find(item => item.status === 'thin')
      ?? coverage[0]
      ?? null;
  }

  function renderGuestRoster(state = HotelState.get()) {
    const wrap = document.getElementById('guest-roster');
    if (!wrap) return;
    if (!systemUnlocks(state).guests) {
      wrap.innerHTML = `
        <div class="roster-empty progression-locked-panel">
          <i class="fa-solid fa-id-card"></i>
          <strong>Guest roster unlocks after Check-In Rush</strong>
          <span>Run the lobby operation to add your first named guests.</span>
        </div>
      `;
      return;
    }

    const roster = typeof HotelState.getRoster === 'function'
      ? HotelState.getRoster()
      : [...(state.guests.roster ?? [])];
    const active = roster
      .filter(guest => !guest.checkOutAt || guest.checkOutAt > Date.now())
      .sort((a, b) => (a.checkOutAt ?? Infinity) - (b.checkOutAt ?? Infinity));

    const status = document.getElementById('pool-status');
    if (status) {
      const boost = state.guests.checkInBoostRemaining ?? 0;
      status.textContent = `${active.length} current${boost > 0 ? ` · ${boost} boost` : ''}`;
    }

    if (!active.length) {
      wrap.innerHTML = `
        <div class="roster-empty">
          <i class="fa-solid fa-address-book"></i>
          <strong>No current roster guests</strong>
          <span>Run Check-In Rush to add named guests to the persistent roster.</span>
        </div>
      `;
      return;
    }

    wrap.innerHTML = active.map(renderRosterCard).join('');
  }

  function renderRosterCard(guest) {
    const type = HotelConfig.GUEST_TYPES[guest.type] ?? {};
    const name = guest.name
      ? guest.name
      : `${type.label ?? guest.type ?? 'Guest'} ${guest.id ? `#${String(guest.id).slice(-4)}` : ''}`.trim();
    const room = guest.roomNumber ? `Room ${guest.roomNumber}` : 'Room pending';
    const party = guest.partySize > 1 ? `Party of ${guest.partySize}` : 'Solo stay';
    const time = formatStayRemaining(guest.checkOutAt);
    const match = matchMeta(guest.matchQuality);
    const source = sourceLabel(guest.source);
    const origin = guest.origin ? `<span>${escapeHtml(guest.origin)}</span>` : '';

    return `
      <article class="roster-card">
        <div class="roster-avatar ${guest.source === 'simulated' ? 'simulated' : ''}">
          ${guest.flagEmoji ? escapeHtml(guest.flagEmoji) : `<i class="fa-solid fa-user"></i>`}
        </div>
        <div class="roster-main">
          <div class="roster-head">
            <div>
              <strong>${escapeHtml(name)}</strong>
              <span>${escapeHtml(type.label ?? guest.type ?? 'Guest')}</span>
            </div>
            <span class="roster-source ${source.key}">${source.label}</span>
          </div>
          <div class="roster-meta">
            <span><i class="fa-solid fa-door-closed"></i>${escapeHtml(room)}</span>
            <span><i class="fa-solid fa-users"></i>${party}</span>
            ${origin}
          </div>
          <div class="roster-kpis">
            <span class="${time.expired ? 'expired' : ''}"><i class="fa-solid fa-clock"></i>${time.label}</span>
            <span class="match-${match.key}"><i class="fa-solid fa-bed"></i>${match.label}</span>
          </div>
        </div>
      </article>
    `;
  }

  function renderGuestPanel(state = HotelState.get()) {
    const wrap = document.getElementById('guest-panel');
    if (!wrap) return;
    if (!systemUnlocks(state).guests) {
      wrap.innerHTML = `
        <div class="roster-empty progression-locked-panel">
          <i class="fa-solid fa-person-walking"></i>
          <strong>Guests appear after your first Check-In Rush</strong>
          <span>Start with All Shifts, then this view will track occupancy, demand, and guest mix.</span>
        </div>
      `;
      return;
    }
    const summary = window.HotelGuests?.uiSummary?.(state);
    if (!summary) {
      wrap.innerHTML = '<p class="guest-loading">Guest simulation is starting...</p>';
      return;
    }

    const mix = summary.activeMix.slice(0, 3).map(item => `
      <div class="guest-mix-row">
        <span>${item.icon ?? '👤'} ${escapeHtml(item.label ?? item.id)}</span>
        <strong>${Math.round(item.pct * 100)}%</strong>
      </div>
    `).join('');

    wrap.innerHTML = `
      <div class="guest-overview-grid">
        <div><span>Occupancy</span><strong>${summary.population}/${summary.capacity}</strong></div>
        <div><span>Demand</span><strong>${summary.occupancyLabel}</strong></div>
        <div><span>Arrivals</span><strong>${summary.checkInRate}/h</strong></div>
        <div><span>Departures</span><strong>${summary.checkOutRate}/h</strong></div>
      </div>
      <div class="guest-mix-panel">
        ${mix || '<span class="guest-loading">No active guest mix yet.</span>'}
      </div>
    `;
  }

  function renderOperationsPanel(state = HotelState.get()) {
    const wrap = document.getElementById('operations-list');
    if (!wrap) return;

    const context = todayShiftContext(state);
    const ops = operationCatalog()
      .map((op, index) => decorateShiftOp(op, state, context, index))
      .sort(sortAllShifts);
    const groups = [
      { id:'playable', title:'Playable Now', detail:'Live shifts you can run today.', ops:ops.filter(op => op.enabled) },
      { id:'build', title:'Build To Unlock', detail:'Departments are available; construction opens the shift.', ops:ops.filter(op => !op.enabled && op.deptState?.unlocked) },
      { id:'locked', title:'Reputation Locked', detail:'Future shifts with their exact reputation gate.', ops:ops.filter(op => !op.enabled && !op.deptState?.unlocked) },
    ].filter(group => group.ops.length);

    wrap.innerHTML = `
      <div class="all-shifts-intro">
        <span>Full Shift Catalog</span>
        <strong>Featured shifts live above. This catalog shows what is playable, what to build, and what reputation unlocks next.</strong>
      </div>
      ${groups.map(group => renderAllShiftGroup(group, state)).join('')}
    `;
  }

  function sortAllShifts(a, b) {
    return Number(b.enabled) - Number(a.enabled)
      || Number(a.statusState === 'completed') - Number(b.statusState === 'completed')
      || b.score - a.score
      || a.repRequired - b.repRequired
      || a.sortIndex - b.sortIndex;
  }

  function renderAllShiftGroup(group, state = HotelState.get()) {
    return `
      <section class="all-shift-group all-shift-group-${group.id}">
        <div class="all-shift-group-head">
          <span>${escapeHtml(group.title)}</span>
          <strong>${escapeHtml(group.detail)}</strong>
          <em>${group.ops.length}</em>
        </div>
        ${group.ops.map(op => renderAllShiftCard(op, state)).join('')}
      </section>
    `;
  }

  function renderAllShiftCard(op, state = HotelState.get()) {
    const guideTarget = currentGuidedStep(state) === 'run_checkin' && op.dept === 'lobby';
    const guideMuted = currentGuidedStep(state) === 'run_checkin' && op.dept !== 'lobby';
    const status = allShiftStatus(op);
    const body = `
      <span class="operation-icon"><i class="fa-solid ${op.icon}"></i></span>
      <span class="operation-copy">
        <strong>${escapeHtml(op.title)}</strong>
        <span>${escapeHtml(op.enabled ? op.reason : lockedShiftDetail(op))}</span>
        <em>${escapeHtml(op.enabled ? `${op.readiness?.label ?? 'Ready'} · ${op.expected?.label ?? shiftDisplayReward(op, state)} · ${op.expected?.detail ?? op.impact}` : lockedShiftReward(op, state))}</em>
      </span>
      <span class="operation-status">${escapeHtml(status)}</span>
    `;
    const style = `--operation-color:${op.meta?.color ?? '#0d2218'}`;
    if (op.enabled) {
      return `<a class="operation-card all-shift-card shift-state-${shiftStateClass(op)} ${guideTarget ? 'guide-target-control' : ''} ${guideMuted ? 'guide-muted-control' : ''}" href="${op.href}" data-shift-dept="${op.dept}" style="${style}">${body}</a>`;
    }
    return `
      <button class="operation-card all-shift-card locked ${guideMuted ? 'guide-muted-control' : ''}" type="button"
              data-command-action="dept" data-command-dept="${op.dept}" style="${style}">
        ${body}
      </button>
    `;
  }

  function allShiftStatus(op) {
    if (op.enabled && op.statusState === 'completed') return 'Completed';
    if (op.enabled && op.statusState === 'in_progress') return 'In Progress';
    if (op.enabled && op.readiness?.key === 'short_staffed') return 'Prepare';
    if (op.enabled) return shiftCta(op);
    if (op.deptState?.unlocked) return 'Build';
    return `Rep ${op.repRequired}`;
  }

  function lockedShiftDetail(op) {
    if (op.deptState?.unlocked) {
      const first = HotelConfig.UPGRADE_CATALOG[op.dept]?.[0];
      const cost = first?.cost ? ` for $${fmt(first.cost)}` : '';
      return `Build ${op.meta?.label ?? op.title}${cost} to unlock ${op.title}`;
    }
    return `Reach reputation ${op.repRequired} to unlock ${op.meta?.label ?? op.title}`;
  }

  function lockedShiftReward(op, state = HotelState.get()) {
    const first = HotelConfig.UPGRADE_CATALOG[op.dept]?.[0];
    if (first?.ipm) return `Unlocks ${op.title}: +$${fmtShort(first.ipm)}/min + hotel shift`;
    if (op.dept === 'casino') return 'Future reward: casino progress';
    return `Unlocks ${op.title}: cash + satisfaction`;
  }

  function renderStaffPanel(state = HotelState.get()) {
    const wrap = document.getElementById('staff-panel');
    if (!wrap) return;
    const unlocks = systemUnlocks(state);
    if (!unlocks.staffBasic) {
      wrap.innerHTML = `
        <div class="roster-empty progression-locked-panel">
          <i class="fa-solid fa-user-tie"></i>
          <strong>Staff unlocks when service needs attention</strong>
          <span>Your first staffing task will open this view with only the controls you need.</span>
        </div>
      `;
      return;
    }
    if (currentGuidedStep(state) === 'assign_staff') activeStaffView = 'roster';
    if (!unlocks.staffAdvanced && !['coverage', 'roster'].includes(activeStaffView)) {
      activeStaffView = currentGuidedStep(state) === 'assign_staff' ? 'roster' : 'coverage';
    }

    const staff = typeof HotelState.getStaffRoster === 'function'
      ? HotelState.getStaffRoster()
      : [...(state.staff?.roster ?? [])];
    const targets = staffAssignmentTargets(state);
    const coverage = staffCoverage(staff, state);
    const activeCount = staff.filter(s => s.assignment && s.assignment !== 'rest').length;
    const reports = typeof HotelState.getStaffReports === 'function'
      ? HotelState.getStaffReports()
      : [...(state.staff?.reports ?? [])];
    const moraleHistory = typeof HotelState.getStaffMoraleHistory === 'function'
      ? HotelState.getStaffMoraleHistory()
      : [...(state.staff?.moraleHistory ?? [])];
    const events = typeof HotelState.getStaffEvents === 'function'
      ? HotelState.getStaffEvents()
      : [...(state.staff?.events ?? [])];
    const applications = typeof HotelState.getStaffApplications === 'function'
      ? HotelState.getStaffApplications()
      : [...(state.staff?.applications ?? [])];
    const market = HotelState.getStaffMarket?.(state) ?? { label:'Stable Market', applicantNote:'Applicant quality is steady.', qualityShift:0, wagePressure:0 };
    const warnings = HotelState.getStaffWarnings?.(state) ?? coverage
      .filter(item => item.status !== 'covered')
      .map(item => ({
        id: item.id,
        label: item.label,
        status: item.status,
        tone: item.status === 'short' ? 'bad' : 'warn',
        score: item.score,
        title: `${item.label} ${item.status === 'short' ? 'is short staffed' : 'is thin'}`,
        detail: item.status === 'short' ? `Coverage is ${item.score}%. Guests will feel slower service.` : `Coverage is ${item.score}%. Service has little slack.`,
      }));
    const status = document.getElementById('staff-status');
    if (status) status.textContent = `${activeCount}/${staff.length} assigned · ${applications.length} apps`;

    if (!staff.length) {
      wrap.innerHTML = `
        <div class="roster-empty">
          <i class="fa-solid fa-user-tie"></i>
          <strong>No staff hired</strong>
          <span>Review applications below to open your first staff shift.</span>
        </div>
        ${renderStaffViewTabs(applications, reports, events, state)}
        ${unlocks.staffAdvanced ? renderApplicationsPanel(applications, state) : ''}
      `;
      return;
    }

    wrap.innerHTML = `
      <div class="staff-overview-grid">
        <div><span>Assigned</span><strong>${activeCount}/${staff.length}</strong></div>
        <div><span>Morale</span><strong>${Math.round(state.staff?.morale ?? 75)}%</strong></div>
        <div><span>Avg Stamina</span><strong>${averageStaffStamina(staff)}%</strong></div>
        <div><span>Coverage</span><strong>${coverageLabel(coverage)}</strong></div>
        <div><span>Payroll</span><strong>$${fmtShort(HotelState.calculatePayrollPerDay?.(staff) ?? state.staff?.payrollPerDay ?? 0)}/day</strong></div>
        <div><span>Paid</span><strong>$${fmtShort(state.staff?.payrollPaidTotal ?? 0)}</strong></div>
      </div>
      ${renderStaffWarnings(warnings)}
      ${renderStaffViewTabs(applications, reports, events, state)}
      ${renderStaffView(activeStaffView, { coverage, applications, state, market, events, reports, moraleHistory, staff, targets })}
    `;
  }

  function renderStaffViewTabs(applications, reports, events, state = HotelState.get()) {
    const unlocks = systemUnlocks(state);
    const tabs = [
      { id:'coverage', label:'Coverage', icon:'fa-chart-simple', count:null },
      { id:'roster', label:'Roster', icon:'fa-users-gear', count:null },
      ...(unlocks.staffAdvanced ? [
        { id:'hiring', label:'Hiring', icon:'fa-file-signature', count:applications.length },
        { id:'activity', label:'Activity', icon:'fa-clipboard-list', count:(events.length || reports.length) ? Math.max(events.length, reports.length) : null },
      ] : []),
    ];
    return `
      <div class="staff-view-tabs" role="tablist" aria-label="Staff sections">
        ${tabs.map(tab => `
          <button type="button" data-staff-view="${tab.id}" class="${activeStaffView === tab.id ? 'active' : ''}" aria-selected="${activeStaffView === tab.id ? 'true' : 'false'}">
            <i class="fa-solid ${tab.icon}"></i>
            ${tab.label}
            ${tab.count ? `<span>${tab.count}</span>` : ''}
          </button>
        `).join('')}
      </div>
    `;
  }

  function renderStaffView(view, data) {
    if (!systemUnlocks(data.state).staffAdvanced && !['coverage', 'roster'].includes(view)) {
      view = 'coverage';
    }
    if (view === 'hiring') {
      return renderApplicationsPanel(data.applications, data.state, data.market);
    }
    if (view === 'activity') {
      return `
        ${renderStaffEvents(data.events)}
        <div class="staff-report-panel">
          <div class="staff-subtitle">
            <i class="fa-solid fa-clipboard-list"></i>
            Shift Reports
          </div>
          ${data.reports.length ? data.reports.slice(0, 4).map(renderStaffReport).join('') : '<p class="staff-report-empty">Advance time or train staff to generate reports.</p>'}
          ${renderMoraleHistory(data.moraleHistory)}
        </div>
      `;
    }
    if (view === 'roster') {
      return `
        <div class="staff-card-list compact-roster">
          ${data.staff.map(member => renderStaffCard(member, data.targets)).join('')}
        </div>
      `;
    }
    return `
      <div class="staff-coverage-grid">
        ${data.coverage.map(renderCoverageCard).join('')}
      </div>
    `;
  }

  function renderApplicationsPanel(applications, state = HotelState.get(), market = HotelState.getStaffMarket?.(state)) {
    const newCount = applications.filter(app => app.status === 'new').length;
    const shortlistCount = applications.filter(app => app.status === 'shortlisted').length;
    const qualityText = market?.qualityShift > 0 ? `+${market.qualityShift} quality` : market?.qualityShift < 0 ? `${market.qualityShift} quality` : 'steady quality';
    const wageText = market?.wagePressure > 0 ? `+$${fmtShort(market.wagePressure)} wage pressure` : 'normal wages';
    return `
      <div class="staff-applications-panel">
        <div class="staff-subtitle">
          <i class="fa-solid fa-file-signature"></i>
          Applications
          <span>${newCount} new · ${shortlistCount} shortlisted</span>
        </div>
        <div class="staff-market-card ${marketClass(market)}">
          <div>
            <strong>${escapeHtml(market?.label ?? 'Stable Market')}</strong>
            <span>${escapeHtml(market?.applicantNote ?? 'Applicant quality is steady.')}</span>
          </div>
          <em>${escapeHtml(qualityText)} · ${escapeHtml(wageText)}</em>
        </div>
        <div class="staff-application-list">
          ${applications.length ? applications.map(app => renderApplicationCard(app, state)).join('') : '<p class="staff-report-empty">No applications are waiting. Advance to the next hotel day for a fresh batch.</p>'}
        </div>
      </div>
    `;
  }

  function renderApplicationCard(applicant, state) {
    const status = applicant.status ?? 'new';
    const target = applicant.desiredDepartment ?? applicant.specialty ?? 'lobby';
    const slots = HotelState.getStaffSlotInfo?.(target, state) ?? { used:0, limit:1, full:false };
    const fit = HotelState.departmentFitScore?.(applicant, target) ?? 0;
    const traitEffect = HotelState.getStaffTraitEffect?.(applicant, target) ?? { trait:applicant.trait, applies:false, copy:'Reliable personality fit' };
    const reviewed = status !== 'new';
    const canHire = reviewed && !slots.full && HotelState.getCash() >= (applicant.onboardingCost ?? 0);
    const note = applicant.reviewNote || 'Review this application to estimate department fit.';
    return `
      <article class="staff-application-card ${status}">
        <div class="staff-application-head">
          <div>
            <strong>${escapeHtml(applicant.name)}</strong>
            <span>${escapeHtml(applicant.role)} · ${escapeHtml(applicant.trait ?? 'Reliable')}</span>
          </div>
          <span class="staff-application-status">${applicationStatusLabel(status)}</span>
        </div>
        <div class="staff-application-meta">
          <span><i class="fa-solid fa-building-user"></i>${assignmentLabel(target)}</span>
          <span><i class="fa-solid fa-chart-simple"></i>${reviewed ? `${fit}% ${fitText(fit)}` : 'Unreviewed'}</span>
          <span><i class="fa-solid fa-door-open"></i>${slotText(slots)}</span>
          ${applicant.marketLabel ? `<span><i class="fa-solid fa-briefcase"></i>${escapeHtml(applicant.marketLabel)}</span>` : ''}
        </div>
        <div class="staff-stat-row">
          ${staffStat('Speed', applicant.speed, 10)}
          ${staffStat('Service', applicant.service, 10)}
          ${staffStat('Discipline', applicant.discipline, 10)}
        </div>
        ${renderTraitBadge(traitEffect)}
        <p class="staff-application-note">${escapeHtml(note)}</p>
        <div class="staff-application-actions">
          <button type="button" data-staff-action="review-application" data-applicant-id="${escapeHtml(applicant.id)}" ${reviewed ? 'disabled' : ''}>
            <i class="fa-solid fa-magnifying-glass"></i> Review
          </button>
          <button type="button" data-staff-action="shortlist-application" data-applicant-id="${escapeHtml(applicant.id)}">
            <i class="fa-solid fa-bookmark"></i> ${status === 'shortlisted' ? 'Unlist' : 'Shortlist'}
          </button>
          <button type="button" data-staff-action="hire-application" data-applicant-id="${escapeHtml(applicant.id)}" ${canHire ? '' : 'disabled'}>
            <i class="fa-solid fa-user-plus"></i> Hire $${fmtShort(applicant.onboardingCost ?? 0)}
          </button>
          <button type="button" class="danger" data-staff-action="reject-application" data-applicant-id="${escapeHtml(applicant.id)}">
            <i class="fa-solid fa-xmark"></i> Reject
          </button>
        </div>
      </article>
    `;
  }

  function renderCoverageCard(item) {
    return `
      <div class="staff-coverage-card ${item.status} ${activePrepareDept === item.id ? 'prepare-target-control' : ''}">
        <span>${escapeHtml(item.label)}</span>
        <strong>${item.score}%</strong>
        <em>${item.copy} · ${slotText(item.slots)}</em>
        ${item.traitCopy ? `<small>${escapeHtml(item.traitCopy)}</small>` : ''}
      </div>
    `;
  }

  function renderStaffWarnings(warnings) {
    if (!warnings.length) return '';
    const onboarding = isPhaseOneOnboarding();
    const unlocks = systemUnlocks();
    const visibleWarnings = onboarding ? warnings.slice(0, 1) : warnings.slice(0, 3);
    return `
      <div class="staff-warning-panel ${onboarding ? 'onboarding-warning-panel' : ''}">
        ${visibleWarnings.map(warning => `
          <div class="staff-warning-card ${warning.tone ?? 'warn'}">
            <i class="fa-solid ${warning.tone === 'bad' ? 'fa-triangle-exclamation' : 'fa-circle-exclamation'}"></i>
            <div>
              <strong>${escapeHtml(onboarding ? `${warning.label ?? 'Service'} needs coverage` : warning.title)}</strong>
              <span>${escapeHtml(onboarding ? 'Guests will be happier once someone is assigned here.' : warning.detail)}</span>
              <div class="staff-warning-actions">
                <button type="button" data-staff-view="roster">Assign staff</button>
                ${onboarding || !unlocks.staffAdvanced ? '' : '<button type="button" data-staff-view="hiring">Review applicants</button>'}
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  function renderMoraleHistory(history) {
    if (!history.length) return '';
    return `
      <div class="staff-morale-history">
        <div class="staff-subtitle compact">
          <i class="fa-solid fa-heart-pulse"></i>
          Morale History
        </div>
        ${history.slice(0, 4).map(entry => `
          <div class="staff-morale-entry ${entry.tone ?? ''}">
            <span>${escapeHtml(entry.reason ?? 'Morale changed')}</span>
            <strong>${entry.delta > 0 ? '+' : ''}${Math.round(entry.delta ?? 0)} · ${Math.round(entry.value ?? 0)}%</strong>
          </div>
        `).join('')}
      </div>
    `;
  }

  function renderStaffReport(report) {
    return `
      <div class="staff-report ${report.tone ?? ''}">
        <strong>${escapeHtml(report.title ?? 'Staff report')}</strong>
        <span>${escapeHtml(report.detail ?? '')}</span>
      </div>
    `;
  }

  function renderStaffEvents(events) {
    if (!events.length) return '';
    return `
      <div class="staff-events-panel">
        <div class="staff-subtitle">
          <i class="fa-solid fa-bolt"></i>
          Staff Events
          <span>${events.length} recent</span>
        </div>
        <div class="staff-event-list">
          ${events.slice(0, 3).map(event => `
            <div class="staff-event-card ${event.tone ?? ''}">
              <i class="fa-solid ${staffEventIcon(event.type)}"></i>
              <div>
                <strong>${escapeHtml(event.title ?? 'Staff event')}</strong>
                <span>${escapeHtml(event.detail ?? '')}</span>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  function renderStaffCard(member, targets) {
    const current = member.assignment ?? 'rest';
    const stamina = Math.max(0, Math.min(100, Math.round(member.stamina ?? 80)));
    const staminaClass = stamina >= 70 ? 'fresh' : stamina >= 40 ? 'tired' : 'spent';
    const initials = (member.name ?? '?')
      .split(/\s+/)
      .map(part => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
    const trainCost = HotelState.getTrainingCost?.(member) ?? 0;
    const xpNeed = HotelState.staffXpRequired?.(member.level ?? 1) ?? 50;
    const promotion = HotelState.getPromotionInfo?.(member) ?? {};
    const statCap = HotelState.getStaffStatCap?.(member) ?? 10;
    const fireImpact = HotelState.getFireStaffImpact?.(member) ?? { moraleDelta:-3, label:'Morale hit' };
    const traitEffect = HotelState.getStaffTraitEffect?.(member, current) ?? { trait:member.trait, applies:false, copy:'Reliable personality fit' };
    const guideTarget = currentGuidedStep() === 'assign_staff' ? guidedStaffTarget() : null;
    const staffAdvanced = systemUnlocks().staffAdvanced;
    const bestShiftDept = member.specialty && member.specialty !== 'rest' ? member.specialty : current;
    const bestShiftLabel = bestShiftDept && bestShiftDept !== 'rest' ? deptMiniGameLabel(bestShiftDept) : 'Any covered shift';
    const prepareFit = activePrepareDept
      ? HotelState.departmentFitScore?.(member, activePrepareDept) ?? 0
      : null;

    return `
      <article class="staff-card ${activePrepareDept && (current === activePrepareDept || member.specialty === activePrepareDept) ? 'prepare-match' : ''}">
        <div class="staff-avatar">${escapeHtml(initials)}</div>
        <div class="staff-card-main">
          <div class="staff-card-head">
            <div>
              <strong>${escapeHtml(member.name)}</strong>
              <span>${escapeHtml(promotion.title ?? member.role)} · ${escapeHtml(member.role)} · Lv ${member.level ?? 1} · ${escapeHtml(member.trait ?? 'Reliable')}</span>
            </div>
            <span class="staff-assignment ${current === 'rest' ? 'resting' : ''}">
              ${assignmentLabel(current)}
            </span>
          </div>
          <div class="staff-shift-fit">
            <i class="fa-solid ${activePrepareDept ? 'fa-bullseye' : 'fa-gamepad'}"></i>
            <span>${activePrepareDept ? `Prepare ${deptMiniGameLabel(activePrepareDept)}: ${prepareFit}% fit` : `Helps most: ${bestShiftLabel}`}</span>
          </div>
          <div class="staff-stat-row">
            ${staffStat('Speed', member.speed, statCap)}
            ${staffStat('Service', member.service, statCap)}
            ${staffStat('Discipline', member.discipline, statCap)}
          </div>
          ${renderTraitBadge(traitEffect)}
          <div class="staff-stamina">
            <span>Stamina</span>
            <div class="staff-stamina-bar"><div class="${staminaClass}" style="width:${stamina}%"></div></div>
            <strong>${stamina}%</strong>
          </div>
          <div class="staff-xp">
            <span>Growth</span>
            <div class="staff-xp-bar"><div style="width:${Math.min(100, Math.round(((member.xp ?? 0) / Math.max(1, xpNeed)) * 100))}%"></div></div>
            <strong>${member.xp ?? 0}/${xpNeed}</strong>
          </div>
          <div class="staff-assign-grid">
            ${targets.map(target => `
              <button class="staff-assign-btn ${current === target.id ? 'active' : ''} ${guideTarget?.id === target.id ? 'guide-target-control' : ''} ${activePrepareDept === target.id ? 'prepare-target-control' : ''}" type="button"
                      data-staff-action="assign" data-staff-id="${escapeHtml(member.id)}" data-assignment="${target.id}"
                      ${current !== target.id && target.slots?.full ? 'disabled' : ''}
                      title="${current !== target.id && target.slots?.full ? `${target.short} slots full` : `Assign to ${target.short}`}">
                <i class="fa-solid ${target.icon}"></i>
                ${target.short}<span>${target.slots?.used ?? 0}/${target.slots?.limit ?? 1}</span>
              </button>
            `).join('')}
            <button class="staff-assign-btn rest ${current === 'rest' ? 'active' : ''}" type="button"
                    data-staff-action="rest" data-staff-id="${escapeHtml(member.id)}">
              <i class="fa-solid fa-mug-hot"></i>
              Rest
            </button>
          </div>
          ${staffAdvanced ? `<details class="staff-development-panel guide-hide-during-staff">
            <summary>
              <span>Development</span>
              <strong>Train, promote, or manage employment</strong>
            </summary>
            <div class="staff-training-row">
              <span>Train · $${fmtShort(trainCost)}</span>
              <button type="button" data-staff-action="train" data-stat="speed" data-staff-id="${escapeHtml(member.id)}" ${member.speed >= statCap ? 'disabled' : ''}>Speed</button>
              <button type="button" data-staff-action="train" data-stat="service" data-staff-id="${escapeHtml(member.id)}" ${member.service >= statCap ? 'disabled' : ''}>Service</button>
              <button type="button" data-staff-action="train" data-stat="discipline" data-staff-id="${escapeHtml(member.id)}" ${member.discipline >= statCap ? 'disabled' : ''}>Discipline</button>
            </div>
            <div class="staff-promotion-row ${promotion.eligible ? 'ready' : ''}">
              <div>
                <span>${promotion.maxed ? 'Promotion Complete' : `Promote to ${escapeHtml(promotion.nextTitle ?? 'Next Role')}`}</span>
                <strong>${promotion.maxed ? 'Top role reached' : `${escapeHtml(promotion.reason ?? '')} · $${fmtShort(promotion.cost ?? 0)}`}</strong>
              </div>
              <button type="button" data-staff-action="promote" data-staff-id="${escapeHtml(member.id)}" ${promotion.eligible ? '' : 'disabled'}>
                Promote
              </button>
            </div>
            <div class="staff-fire-row">
              <div>
                <span>Termination</span>
                <strong>${escapeHtml(fireImpact.label)} · Morale ${fireImpact.moraleDelta}</strong>
              </div>
              <button type="button" data-staff-action="fire" data-staff-id="${escapeHtml(member.id)}">
                <i class="fa-solid fa-user-slash"></i> Fire
              </button>
            </div>
          </details>` : ''}
        </div>
      </article>
    `;
  }

  function staffAssignmentTargets(state) {
    const base = [
      { id:'lobby', short:'Lobby', icon:'fa-id-card' },
      { id:'rooms', short:'Rooms', icon:'fa-bell-concierge' },
      { id:'casino', short:'Casino', icon:'fa-dice' },
      { id:'restaurant', short:'Food', icon:'fa-utensils' },
      { id:'bar', short:'Bar', icon:'fa-martini-glass-citrus' },
      { id:'entertainment', short:'Shows', icon:'fa-masks-theater' },
      { id:'spa', short:'Spa', icon:'fa-spa' },
    ];
    return base
      .filter(target => target.id === 'lobby' || state.departments[target.id]?.unlocked)
      .map(target => ({
        ...target,
        slots: HotelState.getStaffSlotInfo?.(target.id, state) ?? { used:0, limit:1, available:1, full:false },
      }));
  }

  function staffCoverage(staff, state) {
    return staffAssignmentTargets(state).map(target => {
      const effect = HotelState.getStaffEffect?.(target.id, state);
      const score = effect?.score ?? 0;
      const status = effect?.status ?? 'short';
      const traitActive = effect?.traitSummary?.active ?? [];
      return {
        ...target,
        label: assignmentLabel(target.id),
        score,
        status,
        slots: effect?.slots ?? target.slots,
        copy: status === 'covered' ? `+${Math.round(((effect?.incomeMult ?? 1) - 1) * 100)}% income` : status === 'thin' ? 'Thin' : 'Short',
        traitCopy: traitActive.length ? `Traits: ${traitActive.map(item => item.trait).join(', ')}` : '',
      };
    });
  }

  function slotText(slots) {
    if (!slots) return '0/0 slots';
    if (slots.limit === Infinity) return `${slots.used} resting`;
    return `${slots.used}/${slots.limit} slots`;
  }

  function averageStaffStamina(staff) {
    if (!staff.length) return 0;
    return Math.round(staff.reduce((sum, s) => sum + (s.stamina ?? 80), 0) / staff.length);
  }

  function coverageLabel(coverage) {
    const short = coverage.filter(item => item.status === 'short').length;
    if (short) return `${short} Short`;
    const thin = coverage.filter(item => item.status === 'thin').length;
    return thin ? `${thin} Thin` : 'Covered';
  }

  function countShortCoverage(state = HotelState.get()) {
    const staff = typeof HotelState.getStaffRoster === 'function'
      ? HotelState.getStaffRoster()
      : [...(state.staff?.roster ?? [])];
    return staffCoverage(staff, state).filter(item => item.status === 'short').length;
  }

  function marketClass(market) {
    const score = market?.score ?? 0;
    if (score >= 2) return 'good';
    if (score < 0) return 'warn';
    return 'neutral';
  }

  function staffEventIcon(type) {
    return {
      praise: 'fa-comment-dots',
      service_moment: 'fa-gauge-high',
      breakthrough: 'fa-arrow-trend-up',
      burnout: 'fa-fire-extinguisher',
      sick_day: 'fa-kit-medical',
      conflict: 'fa-people-arrows',
      poaching: 'fa-handshake',
    }[type] ?? 'fa-bolt';
  }

  function fitText(score) {
    if (score >= 88) return 'Excellent';
    if (score >= 75) return 'Good';
    if (score >= 62) return 'Workable';
    return 'Risky';
  }

  function applicationStatusLabel(status) {
    return {
      new: 'New',
      reviewed: 'Reviewed',
      shortlisted: 'Shortlist',
    }[status] ?? 'New';
  }

  function staffStat(label, value, cap = 10) {
    return `
      <span>
        <em>${label}</em>
        <strong>${Math.round(value ?? 0)}/${cap}</strong>
      </span>
    `;
  }

  function renderTraitBadge(effect) {
    const trait = effect?.trait || 'Reliable';
    return `
      <div class="staff-trait-badge ${effect?.applies ? 'active' : 'inactive'}">
        <i class="fa-solid ${effect?.applies ? 'fa-star' : 'fa-puzzle-piece'}"></i>
        <div>
          <strong>${escapeHtml(trait)}</strong>
          <span>${escapeHtml(effect?.applies ? effect.copy : `Best in ${assignmentLabel(effect?.department)} · inactive here`)}</span>
        </div>
      </div>
    `;
  }

  function assignmentLabel(id) {
    return {
      lobby: 'Lobby',
      rooms: 'Guest Rooms',
      casino: 'Casino Floor',
      restaurant: 'Restaurant',
      bar: 'Bar & Lounge',
      entertainment: 'Entertainment',
      spa: 'Spa',
      rest: 'Resting',
    }[id] ?? 'Unassigned';
  }

  function staffStatLabel(stat) {
    return { speed:'Speed', service:'Service', discipline:'Discipline' }[stat] ?? stat;
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

    const advanceBtn = document.getElementById('advance-time-btn');
    if (advanceBtn) {
      advanceBtn.classList.toggle('guide-target-control', currentGuidedStep(state) === 'advance_time');
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
          <div class="hotel-floor floor-lobby ${selectedDeptId === id ? 'selected' : ''}" data-floor-dept="${id}" role="button" tabindex="0" aria-label="Open ${meta.label}">
            <div class="floor-interior">
              <span class="floor-icon">${meta.icon}</span>
              <div class="floor-info">
                <div class="floor-name">${meta.label}</div>
                <div class="floor-level">Lv ${dept.level} · ${stats?.label ?? ''}</div>
              </div>
              <div class="floor-dots" title="Current guests">
                ${_guestDots(Math.min(4, state.guests.population))}
              </div>
            </div>
            <div class="floor-elevator-slot">🛗</div>
          </div>`;
      }

      if (isLocked) {
        const reqRep = HotelConfig.DEPT_UNLOCK_REP[id] ?? 99;
        return `
          <div class="hotel-floor floor-locked ${selectedDeptId === id ? 'selected' : ''}" data-floor-dept="${id}" role="button" tabindex="0" aria-label="Open ${meta.label}">
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

      const rowState = floorState(id, dept, state, isMax);

      return `
        <div class="hotel-floor floor-active ${selectedDeptId === id ? 'selected' : ''}" data-floor-dept="${id}" role="button" tabindex="0" aria-label="Open ${meta.label}" style="--dept-color:${meta.color};--dept-accent:${meta.accent}">
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
              <span class="floor-state ${rowState.tone}" title="${escapeHtml(rowState.detail)}"><i class="fa-solid ${rowState.icon}"></i>${escapeHtml(rowState.label)}</span>
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

  function floorState(id, dept, state, isMax) {
    const cash = HotelState.getCash();
    const catalog = HotelConfig.UPGRADE_CATALOG[id] ?? [];
    const next = catalog[dept?.level ?? 0];
    const staff = typeof HotelState.getStaffRoster === 'function'
      ? HotelState.getStaffRoster()
      : [...(state.staff?.roster ?? [])];
    const coverage = staffCoverage(staff, state).find(item => item.id === id);

    if (coverage?.status === 'short') {
      return { tone: 'bad', icon: 'fa-triangle-exclamation', label: 'Staff', detail: 'Short staffed' };
    }
    if (next && cash >= next.cost) {
      return { tone: 'good', icon: 'fa-arrow-up-right-dots', label: 'Up', detail: `${next.label} is affordable` };
    }
    if (isMax) {
      return { tone: 'maxed', icon: 'fa-circle-check', label: 'Max', detail: 'Fully upgraded' };
    }
    if (coverage?.status === 'thin') {
      return { tone: 'warn', icon: 'fa-gauge-high', label: 'Thin', detail: 'Coverage has little slack' };
    }
    return { tone: 'neutral', icon: 'fa-ellipsis', label: 'OK', detail: 'Operating normally' };
  }

  /* ── Department upgrade panel ─────────────────────────────── */
  function renderDeptPanel() {
    const list  = document.getElementById('dept-upgrade-list');
    if (!list) return;
    const state = HotelState.get();
    const { FLOOR_ORDER, DEPT_META, UPGRADE_CATALOG, DEPT_UNLOCK_REP } = HotelConfig;
    const cash  = HotelState.getCash();
    const rep   = HotelState.getReputation();
    const guideUpgrade = currentGuidedStep(state) === 'upgrade_department'
      ? guidedUpgradeTarget(state, cash)
      : null;

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
      const isGuideTarget = guideUpgrade?.id === id;

      return `
        <div class="dept-card ${isMax ? 'maxed' : ''} ${isReady ? 'ready' : ''} ${isGuideTarget ? 'guide-target-control' : ''}" data-dept="${id}" role="button" tabindex="0">
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
                 <button class="upgrade-btn ${canAfford ? 'can-afford' : 'cant-afford'} ${isGuideTarget ? 'guide-target-control' : ''}"
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
    const isGuideTarget = currentGuidedStep(state) === 'upgrade_department'
      && guidedUpgradeTarget(state, cash)?.id === deptId;

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
          ${renderFocusAction(deptId, status, next, canAfford, actionLabel, isMax, isGuideTarget)}
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

  function renderFocusAction(deptId, status, next, canAfford, actionLabel, isMax, isGuideTarget = false) {
    if (status === 'locked') {
      return `<button class="upgrade-btn cant-afford" type="button" disabled>Locked</button>`;
    }
    if (isMax || !next) {
      return `<button class="upgrade-btn cant-afford" type="button" disabled>Maxed</button>`;
    }
    return `
      <button class="upgrade-btn ${canAfford ? 'can-afford' : 'cant-afford'} ${isGuideTarget ? 'guide-target-control' : ''}"
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
    if (deptId === 'casino') return 'Casino Games';
    if (deptId === 'rooms') return 'Floor Ops';
    if (deptId === 'restaurant') return 'Tasting Room';
    if (deptId === 'bar') return 'Bar Shift';
    if (deptId === 'spa') return 'Spa Rush';
    if (deptId === 'entertainment') return 'Show Lineup';
    return 'Department Game';
  }

  function deptMiniGameIcon(deptId) {
    if (deptId === 'lobby') return 'fa-id-card';
    if (deptId === 'casino') return 'fa-dice';
    if (deptId === 'rooms') return 'fa-bell-concierge';
    if (deptId === 'restaurant') return 'fa-utensils';
    if (deptId === 'bar') return 'fa-martini-glass-citrus';
    if (deptId === 'spa') return 'fa-spa';
    if (deptId === 'entertainment') return 'fa-masks-theater';
    return 'fa-gamepad';
  }

  function setMgmtTitle(html) {
    const title = document.getElementById('dept-mgmt-title');
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
      if (isPhaseOneOnboarding()) completePhaseOne('upgrade');
      else completeGuidedStep('upgrade_department');

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
          renderHotelSnapshot(HotelState.get());
          return;
        }
        if (action === 'minigame') {
          const deptId = panelAction.dataset.dept;
          const meta = HotelConfig.DEPT_META[deptId];
          if (deptId === 'lobby') {
            markGuidedOperationStart('lobby');
            window.location.href = 'checkin/index.html';
            return;
          }
          if (deptId === 'casino') {
            markGuidedOperationStart('casino');
            window.location.href = '../casino.html';
            return;
          }
          if (deptId === 'rooms') {
            markGuidedOperationStart('rooms');
            window.location.href = 'rooms/index.html';
            return;
          }
          if (deptId === 'bar') {
            markGuidedOperationStart('bar');
            window.location.href = 'bar/index.html';
            return;
          }
          if (deptId === 'restaurant') {
            markGuidedOperationStart('restaurant');
            window.location.href = 'restaurant/index.html';
            return;
          }
          if (deptId === 'spa') {
            markGuidedOperationStart('spa');
            window.location.href = 'spa/index.html';
            return;
          }
          if (deptId === 'entertainment') {
            markGuidedOperationStart('entertainment');
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
      const card = e.target.closest?.('.dept-card[data-dept], .hotel-floor[data-floor-dept]');
      if (!card) return;
      e.preventDefault();
      selectDepartment(card.dataset.dept || card.dataset.floorDept);
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
      const stateBefore = HotelState.get();
      const satBefore = stateBefore.satisfaction?.current ?? 0;
      const shortBefore = countShortCoverage(stateBefore);
      const report = HotelEngine.advanceCalendarPhase();
      if (currentGuidedStep(HotelState.get()) === 'advance_time') {
        const stateAfter = HotelState.get();
        completeGuidedStep('advance_time', {
          income: report.income ?? 0,
          payroll: report.staffReport?.payroll ?? 0,
          satBefore,
          satAfter: stateAfter.satisfaction?.current ?? satBefore,
          shortBefore,
          shortAfter: countShortCoverage(stateAfter),
          summary: calendarReportText(report),
        });
      }
      renderAll();
      CasinoShell.toast(calendarReportText(report));
    });
  }

  function _wireManagementTabs() {
    document.querySelectorAll('[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => setManagementTab(btn.dataset.tab));
    });
  }

  function _wireOnboardingDebug() {
    document.addEventListener('keydown', e => {
      if (!e.ctrlKey || !e.shiftKey || e.key.toLowerCase() !== 'g') return;
      e.preventDefault();
      toggleOnboardingDebug();
    });

    document.addEventListener('click', e => {
      const scenarioBtn = e.target.closest('[data-onboarding-debug-scenario]');
      if (scenarioBtn) {
        applyOnboardingDebugScenario(scenarioBtn.dataset.onboardingDebugScenario);
        return;
      }

      const actionBtn = e.target.closest('[data-onboarding-debug-action]');
      if (!actionBtn) return;
      const action = actionBtn.dataset.onboardingDebugAction;
      if (action === 'hide') {
        toggleOnboardingDebug(false);
        return;
      }
      if (action === 'guided-mode') {
        HotelState.setGuidanceMode?.('guided');
        renderAll();
        CasinoShell.toast('Debug: guided mode selected.');
        return;
      }
      if (action === 'reset-onboarding') {
        HotelState.resetOnboarding?.('guided');
        guideConfirmation = null;
        previousUnlocks = null;
        activeMgmtTab = 'departments';
        renderAll();
        CasinoShell.toast('Debug: onboarding reset.');
      }
    });

    if (typeof window !== 'undefined') {
      window.HotelOnboardingDebug = {
        toggle: toggleOnboardingDebug,
        scenario: applyOnboardingDebugScenario,
        resetOnboarding: () => {
          HotelState.resetOnboarding?.('guided');
          renderAll();
        },
      };
    }
  }

  function toggleOnboardingDebug(force = null) {
    onboardingDebugVisible = force === null ? !onboardingDebugVisible : !!force;
    renderCommandCenter(HotelState.get());
    CasinoShell.toast(onboardingDebugVisible ? 'Onboarding debug shown.' : 'Onboarding debug hidden.');
  }

  function applyOnboardingDebugScenario(scenario) {
    const changed = HotelState.applyOnboardingScenario?.(scenario);
    if (!changed) {
      CasinoShell.toast('Debug scenario failed.');
      return;
    }
    guideConfirmation = null;
    previousUnlocks = null;
    selectedDeptId = null;
    activeMgmtTab = 'departments';
    activeStaffView = 'coverage';
    renderAll();
    CasinoShell.toast(`Debug scenario: ${scenario.replaceAll('_', ' ')}.`);
  }

  function handleCommandAction(actionEl) {
    if (!actionEl) return;
    const action = actionEl.dataset.commandAction;
    if (action === 'dept') {
      selectDepartment(actionEl.dataset.commandDept);
      return;
    }
    if (action === 'prepare_shift') {
      prepareShift(actionEl.dataset.commandDept);
      return;
    }
    if (action === 'play_shift') {
      playShift(actionEl.dataset.commandDept);
      return;
    }
    if (action === 'advance_time') {
      const btn = document.getElementById('advance-time-btn');
      btn?.focus?.();
      btn?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (action === 'review_report') {
      completeGuidedStep('review_report');
      CasinoShell.toast('Guided setup complete. Keep building your resort.');
      return;
    }
    if (action === 'hiring') {
      activeStaffView = 'hiring';
      setManagementTab('staff');
      renderStaffPanel();
      return;
    }
    if (action === 'staff') {
      activeStaffView = isPhaseOneOnboarding() || currentGuidedStep() === 'assign_staff' ? 'roster' : 'coverage';
      setManagementTab('staff');
      renderStaffPanel();
      return;
    }
    setManagementTab(action);
  }

  function _wireCommandCenter() {
    document.addEventListener('click', e => {
      const modeEl = e.target.closest('[data-guidance-mode]');
      if (modeEl) {
        const nextMode = modeEl.dataset.guidanceMode === 'expert' ? 'expert' : 'guided';
        const changed = HotelState.setGuidanceMode?.(nextMode);
        if (changed) {
          renderAll();
          CasinoShell.toast(nextMode === 'expert'
            ? 'Expert dashboard enabled.'
            : 'Guided pacing enabled.');
        }
        return;
      }

      const onboardingEl = e.target.closest('[data-onboarding-action]');
      if (onboardingEl) {
        if (onboardingEl.dataset.onboardingAction === 'dismiss') {
          HotelState.dismissOnboarding?.();
          renderAll();
          CasinoShell.toast('Guidance hidden. Full dashboard restored.');
        }
        return;
      }

      const resultDismiss = e.target.closest('[data-shift-result-dismiss]');
      if (resultDismiss) {
        dismissShiftResultBanner(resultDismiss.dataset.shiftResultDismiss);
        return;
      }

      const operationLink = e.target.closest('.operation-card[href], .shift-card-main[href], .shift-card-cta[href]');
      if (operationLink) {
        recordShiftLaunchFromLink(operationLink, e);
        const isCheckIn = operationLink.getAttribute('href')?.includes('checkin/');
        if (isCheckIn) markGuidedOperationStart('lobby');
        else if (isPhaseOneOnboarding()) completePhaseOne('operation');
      }

      const actionEl = e.target.closest('[data-command-action]');
      if (!actionEl) return;
      handleCommandAction(actionEl);
    });

    document.addEventListener('click', e => {
      const floor = e.target.closest('.hotel-floor[data-floor-dept]');
      if (!floor) return;
      selectDepartment(floor.dataset.floorDept);
    });
  }

  function _wireStaffControls() {
    document.addEventListener('click', e => {
      const viewBtn = e.target.closest('[data-staff-view]');
      if (viewBtn) {
        const requestedView = viewBtn.dataset.staffView || 'coverage';
        if (!systemUnlocks().staffAdvanced && !['coverage', 'roster'].includes(requestedView)) {
          activeStaffView = 'coverage';
          CasinoShell.toast('Advanced staff tools unlock after your first shift report.');
        } else {
          activeStaffView = requestedView;
        }
        renderStaffPanel();
        return;
      }

      const btn = e.target.closest('[data-staff-action]');
      if (!btn) return;

      const staffId = btn.dataset.staffId;
      const action = btn.dataset.staffAction;
      const applicantId = btn.dataset.applicantId;

      if (action === 'review-application') {
        const result = HotelState.reviewStaffApplication?.(applicantId);
        if (!result?.ok) {
          CasinoShell.toast('Application review failed.');
          return;
        }
        renderStaffPanel();
        CasinoShell.toast(`${result.applicant.name} reviewed.`);
        return;
      }

      if (action === 'shortlist-application') {
        const result = HotelState.shortlistStaffApplication?.(applicantId);
        if (!result?.ok) {
          CasinoShell.toast('Could not update shortlist.');
          return;
        }
        renderStaffPanel();
        CasinoShell.toast(result.applicant.status === 'shortlisted'
          ? `${result.applicant.name} shortlisted.`
          : `${result.applicant.name} removed from shortlist.`);
        return;
      }

      if (action === 'reject-application') {
        const result = HotelState.rejectStaffApplication?.(applicantId);
        if (!result?.ok) {
          CasinoShell.toast('Could not reject application.');
          return;
        }
        renderStaffPanel();
        CasinoShell.toast(`${result.applicant.name} rejected.`);
        return;
      }

      if (action === 'hire-application') {
        const result = HotelState.hireStaffApplication?.(applicantId);
        if (!result?.ok) {
          const message = {
            needs_review: 'Review the application before hiring.',
            slots_full: 'That department has no open staff slot.',
            cash: 'Not enough hotel cash for onboarding.',
            department_locked: 'That department is not open yet.',
          }[result?.reason] ?? 'Could not hire applicant.';
          CasinoShell.toast(message);
          return;
        }
        renderHotelCash();
        renderIncomeDisplay();
        renderStaffPanel();
        CasinoShell.toast(`${result.member.name} hired for ${assignmentLabel(result.member.assignment)}.`);
        return;
      }

      if (action === 'train') {
        const result = HotelState.trainStaff?.(staffId, btn.dataset.stat);
        if (!result?.ok) {
          CasinoShell.toast(result?.reason === 'cash' ? 'Not enough hotel cash for training.' : 'Training is not available.');
          return;
        }
        renderHotelCash();
        renderIncomeDisplay();
        renderStaffPanel();
        CasinoShell.toast(`${result.member.name} trained ${staffStatLabel(btn.dataset.stat)}.`);
        return;
      }

      if (action === 'promote') {
        const result = HotelState.promoteStaff?.(staffId);
        if (!result?.ok) {
          CasinoShell.toast(result?.reason === 'cash' ? 'Not enough hotel cash for promotion.' : result?.info?.reason ?? 'Promotion requirements not met.');
          return;
        }
        renderHotelCash();
        renderIncomeDisplay();
        renderStaffPanel();
        CasinoShell.toast(`${result.member.name} promoted to ${HotelState.getPromotionTitle(result.member)}.`);
        return;
      }

      if (action === 'fire') {
        const result = HotelState.fireStaff?.(staffId);
        if (!result?.ok) {
          CasinoShell.toast(result?.reason === 'last_staff' ? 'You need at least one staff member on payroll.' : 'Could not fire staff member.');
          return;
        }
        renderIncomeDisplay();
        renderStaffPanel();
        CasinoShell.toast(`${result.member.name} let go. Morale ${result.impact.moraleDelta}.`);
        return;
      }

      const result = action === 'rest'
        ? HotelState.restStaff(staffId)
        : HotelState.assignStaff(staffId, btn.dataset.assignment);
      if (!result?.ok) {
        CasinoShell.toast(result?.reason === 'slots_full' ? `${assignmentLabel(btn.dataset.assignment)} slots are full.` : 'Staff assignment failed.');
        return;
      }

      if (action !== 'rest') {
        if (isPhaseOneOnboarding()) completePhaseOne('staff_assignment');
        else completeGuidedStep('assign_staff');
      }
      renderStaffPanel();
      renderHotelSnapshot(HotelState.get());
      renderCommandCenter(HotelState.get());
      CasinoShell.toast(action === 'rest'
        ? 'Staff member is resting.'
        : `Staff assigned to ${assignmentLabel(btn.dataset.assignment)}.`);
    });
  }

  function setManagementTab(tabId, force = false) {
    if (!canOpenManagementTab(tabId)) {
      const message = tabId === 'guests'
        ? 'Guest tracking unlocks after Check-In Rush.'
        : tabId === 'staff'
          ? 'Staff opens when service needs attention.'
          : 'That view is not ready yet.';
      CasinoShell.toast(message);
      return;
    }
    if (!tabId || (!force && tabId === activeMgmtTab)) return;
    activeMgmtTab = tabId;
    document.querySelectorAll('[data-tab]').forEach(btn => {
      const active = btn.dataset.tab === tabId;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    document.querySelectorAll('[data-tab-panel]').forEach(panel => {
      const active = panel.dataset.tabPanel === tabId;
      panel.hidden = !active;
      panel.classList.toggle('active', active);
      if (active) panel.scrollTo({ top: 0, behavior: 'auto' });
    });
  }

  function selectDepartment(deptId) {
    if (!deptId) return;
    setManagementTab('departments', true);
    selectedDeptId = deptId;
    renderDeptPanel();
    renderHotelSnapshot(HotelState.get());
    const panel = document.getElementById('mgmt-tab-departments');
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
      renderGuestRoster();
      renderStaffPanel();
      renderOperationsPanel();
      renderHotelSnapshot();
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
    const staffText = report.staffReport ? ` · Payroll $${fmt(report.staffReport.payroll ?? 0)}` : '';
    const eventText = report.staffReport?.staffEvent ? ` · ${report.staffReport.staffEvent.title}` : '';
    return `${phaseLabel(report.phase)} report: +$${fmt(report.income)}${showText}${staffText}${eventText}`;
  }

  function formatStayRemaining(checkOutAt) {
    if (!checkOutAt) return { label: 'Open stay', expired: false };
    const remaining = checkOutAt - Date.now();
    if (remaining <= 0) return { label: 'Checking out', expired: true };
    const mins = Math.ceil(remaining / 60_000);
    if (mins < 60) return { label: `${mins}m`, expired: false };
    const hrs = Math.floor(mins / 60);
    const rem = mins % 60;
    return { label: rem ? `${hrs}h ${rem}m` : `${hrs}h`, expired: false };
  }

  function matchMeta(matchQuality) {
    return {
      perfect: { key: 'perfect', label: 'Perfect' },
      good: { key: 'good', label: 'Good' },
      acceptable: { key: 'acceptable', label: 'Acceptable' },
      wrong: { key: 'wrong', label: 'Poor' },
    }[matchQuality] ?? { key: 'unknown', label: 'Unrated' };
  }

  function sourceLabel(source) {
    return {
      checkin_game: { key: 'checkin', label: 'Check-In' },
      simulated: { key: 'simulated', label: 'Sim' },
    }[source] ?? { key: 'other', label: 'Hotel' };
  }

  function decoratedShiftByDept(deptId, state = HotelState.get()) {
    const context = todayShiftContext(state);
    return operationCatalog()
      .map((op, index) => decorateShiftOp(op, state, context, index))
      .find(op => op.dept === deptId) ?? null;
  }

  function prepareShift(deptId) {
    if (!deptId) return;
    const state = HotelState.get();
    const op = decoratedShiftByDept(deptId, state);
    activePrepareDept = deptId;
    if (!op?.enabled || op?.readiness?.prepareTarget === 'dept') {
      selectDepartment(deptId);
      CasinoShell.toast(`Build path opened for ${op?.title ?? assignmentLabel(deptId)}.`);
      return;
    }
    activeStaffView = 'roster';
    setManagementTab('staff', true);
    renderStaffPanel();
    renderCommandCenter(HotelState.get());
    document.getElementById('staff-panel')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    CasinoShell.toast(`Prepare ${op.title}: assign staff to ${assignmentLabel(deptId)}.`);
  }

  function playShift(deptId) {
    const op = decoratedShiftByDept(deptId);
    if (!op?.enabled || !op.href) {
      prepareShift(deptId);
      return;
    }
    HotelState.recordShiftStart?.(op.dept, shiftStartInfo(op.dept, op.title));
    window.location.href = op.href;
  }

  function shiftStartInfo(deptId, title = null) {
    const briefing = HotelState.getShiftBriefing?.(deptId) ?? null;
    return {
      title: title ?? briefing?.title ?? deptMiniGameLabel(deptId),
      briefing,
    };
  }

  function shiftDeptFromHref(href = '') {
    if (href.includes('checkin/')) return 'lobby';
    if (href.includes('rooms/')) return 'rooms';
    if (href.includes('restaurant/')) return 'restaurant';
    if (href.includes('bar/')) return 'bar';
    if (href.includes('entertainment/')) return 'entertainment';
    if (href.includes('spa/')) return 'spa';
    if (href.includes('casino')) return 'casino';
    return null;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[ch]));
  }

  return { init, renderAll, renderBuildingView, renderDeptPanel, renderHotelCash, selectDepartment };
})();

if (typeof window !== 'undefined') window.HotelUI = HotelUI;
