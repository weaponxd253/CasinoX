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
    _wireStaffControls();
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
    renderGuestRoster(state);
    renderGuestPanel(state);
    renderStaffPanel(state);
    renderOperationsPanel(state);
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

  function renderGuestRoster(state = HotelState.get()) {
    const wrap = document.getElementById('guest-roster');
    if (!wrap) return;

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
          <div class="roster-stay">
            <div>
              <span>Stay Timer</span>
              <strong class="${time.expired ? 'expired' : ''}">${time.label}</strong>
            </div>
            <div>
              <span>Match</span>
              <strong class="match-${match.key}">${match.label}</strong>
            </div>
          </div>
        </div>
      </article>
    `;
  }

  function renderGuestPanel(state = HotelState.get()) {
    const wrap = document.getElementById('guest-panel');
    if (!wrap) return;
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

    const operations = [
      { dept:'lobby', title:'Check-In Rush', subtitle:'Lobby operation', href:'checkin/index.html', icon:'fa-id-card', always:true },
      { dept:'casino', title:'Casino Floor', subtitle:'Slots, blackjack, and table games', href:'../casino.html', icon:'fa-dice' },
      { dept:'rooms', title:'Floor Ops', subtitle:'Guest rooms operation', href:'rooms/index.html', icon:'fa-bell-concierge' },
      { dept:'restaurant', title:'Tasting Room', subtitle:'Restaurant operation', href:'restaurant/index.html', icon:'fa-utensils' },
      { dept:'bar', title:'Bar Shift', subtitle:'Bar & lounge operation', href:'bar/index.html', icon:'fa-martini-glass-citrus' },
      { dept:'entertainment', title:'Show Lineup', subtitle:'Entertainment operation', href:'entertainment/index.html', icon:'fa-masks-theater' },
      { dept:'spa', title:'Spa Rush', subtitle:'Spa & wellness operation', href:'spa/index.html', icon:'fa-spa' },
    ];

    wrap.innerHTML = operations.map(op => {
      const dept = state.departments[op.dept];
      const enabled = op.always || (dept?.unlocked && (dept.level ?? 0) > 0);
      const meta = HotelConfig.DEPT_META[op.dept];
      const level = dept?.level ?? 0;
      const tag = enabled ? (op.dept === 'lobby' ? 'Open' : `Lv ${level}`) : dept?.unlocked ? 'Build' : `Rep ${HotelConfig.DEPT_UNLOCK_REP[op.dept] ?? 1}`;
      const body = `
        <span class="operation-icon"><i class="fa-solid ${op.icon}"></i></span>
        <span class="operation-copy">
          <strong>${op.title}</strong>
          <span>${op.subtitle}</span>
        </span>
        <span class="operation-status">${tag}</span>
      `;
      return enabled
        ? `<a class="operation-card" href="${op.href}" style="--operation-color:${meta?.color ?? '#0d2218'}">${body}</a>`
        : `<button class="operation-card locked" type="button" disabled style="--operation-color:${meta?.color ?? '#0d2218'}">${body}</button>`;
    }).join('');
  }

  function renderStaffPanel(state = HotelState.get()) {
    const wrap = document.getElementById('staff-panel');
    if (!wrap) return;

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
        ${renderApplicationsPanel(applications, state)}
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
      <div class="staff-coverage-grid">
        ${coverage.map(renderCoverageCard).join('')}
      </div>
      ${renderApplicationsPanel(applications, state, market)}
      ${renderStaffEvents(events)}
      <div class="staff-report-panel">
        <div class="staff-subtitle">
          <i class="fa-solid fa-clipboard-list"></i>
          Shift Reports
        </div>
        ${reports.length ? reports.slice(0, 3).map(renderStaffReport).join('') : '<p class="staff-report-empty">Advance time or train staff to generate reports.</p>'}
        ${renderMoraleHistory(moraleHistory)}
      </div>
      <div class="staff-card-list">
        ${staff.map(member => renderStaffCard(member, targets)).join('')}
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
      <div class="staff-coverage-card ${item.status}">
        <span>${escapeHtml(item.label)}</span>
        <strong>${item.score}%</strong>
        <em>${item.copy} · ${slotText(item.slots)}</em>
        ${item.traitCopy ? `<small>${escapeHtml(item.traitCopy)}</small>` : ''}
      </div>
    `;
  }

  function renderStaffWarnings(warnings) {
    if (!warnings.length) return '';
    return `
      <div class="staff-warning-panel">
        ${warnings.slice(0, 3).map(warning => `
          <div class="staff-warning-card ${warning.tone ?? 'warn'}">
            <i class="fa-solid ${warning.tone === 'bad' ? 'fa-triangle-exclamation' : 'fa-circle-exclamation'}"></i>
            <div>
              <strong>${escapeHtml(warning.title)}</strong>
              <span>${escapeHtml(warning.detail)}</span>
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
    const buttons = targets.map(target => `
      <button class="staff-assign-btn ${current === target.id ? 'active' : ''}" type="button"
              data-staff-action="assign" data-staff-id="${escapeHtml(member.id)}" data-assignment="${target.id}"
              ${current !== target.id && target.slots?.full ? 'disabled' : ''}
              title="${current !== target.id && target.slots?.full ? `${target.short} slots full` : `Assign to ${target.short}`}">
        <i class="fa-solid ${target.icon}"></i>
        ${target.short}<span>${target.slots?.used ?? 0}/${target.slots?.limit ?? 1}</span>
      </button>
    `).join('');
    const trainCost = HotelState.getTrainingCost?.(member) ?? 0;
    const xpNeed = HotelState.staffXpRequired?.(member.level ?? 1) ?? 50;
    const promotion = HotelState.getPromotionInfo?.(member) ?? {};
    const statCap = HotelState.getStaffStatCap?.(member) ?? 10;
    const fireImpact = HotelState.getFireStaffImpact?.(member) ?? { moraleDelta:-3, label:'Morale hit' };
    const traitEffect = HotelState.getStaffTraitEffect?.(member, current) ?? { trait:member.trait, applies:false, copy:'Reliable personality fit' };

    return `
      <article class="staff-card">
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
          <div class="staff-assign-grid">
            ${buttons}
            <button class="staff-assign-btn rest ${current === 'rest' ? 'active' : ''}" type="button"
                    data-staff-action="rest" data-staff-id="${escapeHtml(member.id)}">
              <i class="fa-solid fa-mug-hot"></i>
              Rest
            </button>
          </div>
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
          if (deptId === 'casino') {
            window.location.href = '../casino.html';
            return;
          }
          if (deptId === 'rooms') {
            window.location.href = 'rooms/index.html';
            return;
          }
          if (deptId === 'bar') {
            window.location.href = 'bar/index.html';
            return;
          }
          if (deptId === 'restaurant') {
            window.location.href = 'restaurant/index.html';
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

  function _wireManagementTabs() {
    document.querySelectorAll('[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => setManagementTab(btn.dataset.tab));
    });
  }

  function _wireStaffControls() {
    document.addEventListener('click', e => {
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

      renderStaffPanel();
      CasinoShell.toast(action === 'rest'
        ? 'Staff member is resting.'
        : `Staff assigned to ${assignmentLabel(btn.dataset.assignment)}.`);
    });
  }

  function setManagementTab(tabId) {
    if (!tabId || tabId === activeMgmtTab) return;
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
    setManagementTab('departments');
    selectedDeptId = deptId;
    renderDeptPanel();
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
