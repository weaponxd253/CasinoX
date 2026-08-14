/* ============================================================
   HOTEL SHIFT BRIEFING
   ------------------------------------------------------------
   Shared context strip for hotel mini-games. It mirrors the
   dashboard's prepared/risk briefing inside each operation.
   ============================================================ */

const HotelShiftBriefing = (() => {
  const OP_META = {
    lobby: { title:'Check-In Rush', department:'Lobby', icon:'fa-id-card' },
    rooms: { title:'Floor Ops', department:'Guest Rooms', icon:'fa-bell-concierge' },
    restaurant: { title:'Tasting Room', department:'Restaurant', icon:'fa-utensils' },
    bar: { title:'Bar Shift', department:'Bar & Lounge', icon:'fa-martini-glass-citrus' },
    entertainment: { title:'Show Lineup', department:'Entertainment', icon:'fa-masks-theater' },
    spa: { title:'Spa Rush', department:'Spa & Wellness', icon:'fa-spa' },
    casino: { title:'Casino Floor', department:'Casino Floor', icon:'fa-dice' },
  };

  function mount(deptId, options = {}) {
    if (!deptId || typeof document === 'undefined') return null;
    const briefing = briefingFor(deptId, options);
    const existing = document.querySelector(`[data-mini-shift-briefing="${deptId}"]`);
    const section = existing ?? document.createElement('section');
    section.className = `mini-shift-briefing risk-${briefing.risk ?? 'medium'} ${briefing.prepared ? 'is-prepared' : 'needs-prep'}`;
    section.dataset.miniShiftBriefing = deptId;
    section.setAttribute('aria-label', `${briefing.title} shift briefing`);
    section.innerHTML = renderBriefing(briefing, options);

    if (!existing) {
      const header = document.querySelector('.shell-header');
      if (header?.parentNode) header.insertAdjacentElement('afterend', section);
      else document.body.insertBefore(section, document.body.firstChild);
    }
    return section;
  }

  function start(deptId, title = null) {
    if (!deptId || !window.HotelState?.recordShiftStart) return null;
    const briefing = briefingFor(deptId);
    mount(deptId);
    return HotelState.recordShiftStart(deptId, {
      title: title ?? briefing.title,
      briefing,
    });
  }

  function briefingFor(deptId, options = {}) {
    const fromState = window.HotelState?.getShiftBriefing?.(deptId);
    if (fromState) return fromState;
    const meta = OP_META[deptId] ?? {};
    return {
      deptId,
      title: options.title ?? meta.title ?? 'Hotel Shift',
      department: meta.department ?? 'Hotel',
      level: 1,
      goal: 'Complete the operation and return to the hotel with progress.',
      rewardHint: 'Cash, satisfaction, and hotel momentum.',
      coverageLabel: 'Unknown',
      coverageScore: null,
      assignedCount: 0,
      demand: 1,
      staffBonus: 0,
      risk: 'medium',
      riskLabel: 'Medium risk',
      prepared: false,
      prepNote: 'Open the hotel dashboard to prepare staff for this shift.',
    };
  }

  function renderBriefing(briefing, options = {}) {
    const meta = OP_META[briefing.deptId] ?? {};
    const icon = options.icon ?? meta.icon ?? 'fa-clipboard-check';
    const coverage = Number.isFinite(briefing.coverageScore)
      ? `${briefing.coverageScore}% ${briefing.coverageLabel ?? 'coverage'}`
      : briefing.coverageLabel ?? 'Coverage pending';
    const staff = `${briefing.assignedCount ?? 0}/${Math.max(1, briefing.demand ?? 1)}`;
    const bonus = briefing.staffBonus > 0 ? `+${briefing.staffBonus}%` : 'Base';
    return `
      <div class="mini-shift-title">
        <span class="mini-shift-icon"><i class="fa-solid ${escapeHtml(icon)}"></i></span>
        <span>
          <small>Shift Briefing</small>
          <strong>${escapeHtml(briefing.title)}</strong>
          <em>${escapeHtml(briefing.goal)}</em>
        </span>
      </div>
      <div class="mini-shift-facts">
        ${renderFact('Coverage', coverage)}
        ${renderFact('Staff', staff)}
        ${renderFact('Risk', briefing.riskLabel ?? riskLabel(briefing.risk))}
        ${renderFact('Bonus', bonus)}
      </div>
      <div class="mini-shift-note">
        <span>${escapeHtml(briefing.rewardHint)}</span>
        <small>${escapeHtml(briefing.prepNote)}</small>
      </div>
    `;
  }

  function renderFact(label, value) {
    return `
      <span class="mini-shift-fact">
        <small>${escapeHtml(label)}</small>
        <strong>${escapeHtml(value)}</strong>
      </span>
    `;
  }

  function riskLabel(risk = 'medium') {
    return { high:'High risk', medium:'Medium risk', low:'Low risk' }[risk] ?? 'Medium risk';
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

  return { mount, start, briefingFor };
})();

if (typeof window !== 'undefined') window.HotelShiftBriefing = HotelShiftBriefing;
