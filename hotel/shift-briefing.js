/* ============================================================
   HOTEL SHIFT BRIEFING
   ------------------------------------------------------------
   Shared context strip for hotel mini-games. It mirrors the
   dashboard's prepared/risk briefing inside each operation.
   ============================================================ */

const HotelShiftBriefing = (() => {
  /* ── Coaching hints ───────────────────────────────────────
     Shifts used to highlight the right answer every time. Hints are
     now training wheels: on for the first runs of each shift, or while
     the department's staff are well prepared ("coaching"), or always if
     the player chooses. Games ask HotelShiftBriefing.hintsOn(deptId). */
  const HINT_RUNS = 3;
  const COACH_COVERAGE = 80;
  const HINT_KEY = 'hotelShiftHints';      // 'auto' | 'always' | 'off'

  /* ── Grades ───────────────────────────────────────────────
     Each game turns a run into a 0–100 score; this turns it into a
     letter + stars and tracks the personal best per shift. */
  const GRADES = [
    { min: 90, letter: 'S', stars: 3 },
    { min: 75, letter: 'A', stars: 2 },
    { min: 55, letter: 'B', stars: 1 },
    { min: 0,  letter: 'C', stars: 0 },
  ];
  const OP_META = {
    lobby: { title:'Check-In Rush', department:'Lobby', icon:'fa-id-card' },
    rooms: { title:'Floor Ops', department:'Guest Rooms', icon:'fa-bell-concierge' },
    restaurant: { title:'Tasting Room', department:'Restaurant', icon:'fa-utensils' },
    bar: { title:'Bar Shift', department:'Bar & Lounge', icon:'fa-martini-glass-citrus' },
    entertainment: { title:'Show Lineup', department:'Entertainment', icon:'fa-masks-theater' },
    spa: { title:'Spa Rush', department:'Spa & Wellness', icon:'fa-spa' },
    casino: { title:'Casino Floor', department:'Casino Floor', icon:'fa-dice' },
  };

  /* ── Collapsing ──────────────────────────────────────────
     The full briefing is ~430px tall on a phone, which pushed every
     game below the fold. It collapses to a one-line summary on phones,
     and on every screen while a shift is running; tap to expand. */
  const PHONE_QUERY = '(max-width: 768px)';
  let running = false;
  let expandedPref = null;      // null = automatic, true/false = player's choice this shift

  const isPhone = () => typeof window !== 'undefined' && !!window.matchMedia?.(PHONE_QUERY).matches;
  const isCollapsed = () => (expandedPref === null ? (running || isPhone()) : !expandedPref);

  function setExpanded(deptId, expanded) {
    expandedPref = expanded;
    mount(deptId);
  }

  function renderToggle(briefing, deptId) {
    const twist = twistFor(deptId);
    const hints = deptId === 'entertainment' || deptId === 'casino' ? null : hintStatus(deptId);
    const bits = [
      briefing.riskLabel ?? riskLabel(briefing.risk),
      twist ? `${twist.emoji} ${twist.title}` : null,
      hints ? (hints.on ? 'Hints on' : 'Hints off') : null,
    ].filter(Boolean);
    const collapsed = isCollapsed();
    return `
      <button type="button" class="mini-shift-toggle" data-shift-briefing-toggle aria-expanded="${!collapsed}">
        <span class="mini-shift-toggle-title">${escapeHtml(briefing.title)}</span>
        <span class="mini-shift-toggle-bits">${bits.map(escapeHtml).join(' · ')}</span>
        <span class="mini-shift-toggle-cta">${collapsed ? 'Briefing ▾' : 'Hide ▴'}</span>
      </button>`;
  }

  function mount(deptId, options = {}) {
    if (!deptId || typeof document === 'undefined') return null;
    const briefing = briefingFor(deptId, options);
    const existing = document.querySelector(`[data-mini-shift-briefing="${deptId}"]`);
    const section = existing ?? document.createElement('section');
    section.className = `mini-shift-briefing risk-${briefing.risk ?? 'medium'} ${briefing.prepared ? 'is-prepared' : 'needs-prep'}${isCollapsed() ? ' is-collapsed' : ''}${running ? ' is-running' : ''}`;
    section.dataset.miniShiftBriefing = deptId;
    section.setAttribute('aria-label', `${briefing.title} shift briefing`);
    section.innerHTML = renderToggle(briefing, deptId) + renderBriefing(briefing, options) + renderTwist(deptId) + renderHintControl(deptId);
    section.querySelector('[data-shift-hint-mode]')?.addEventListener('change', e => setHintMode(e.target.value));
    section.querySelector('[data-shift-briefing-toggle]')?.addEventListener('click', () => setExpanded(deptId, isCollapsed()));
    if (!section.dataset.mediaBound && window.matchMedia) {
      section.dataset.mediaBound = '1';
      window.matchMedia(PHONE_QUERY).addEventListener?.('change', () => { if (expandedPref === null) mount(deptId); });
    }

    if (!existing && STATUS_SOURCES[deptId] && !running) setTimeout(() => startStatusBar(deptId), 0);
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
    running = deptId !== 'entertainment';    // booking a show isn't a timed shift
    expandedPref = null;
    const section = mount(deptId);
    if (running) {
      startStatusBar(deptId);
      scrollToEl(section);
    }
    const rewardMult = HotelState.shiftRewardMultiplier?.(deptId) ?? 1;
    const twist = twistFor(deptId);
    if (twist) window.CasinoShell?.announce?.(`Shift twist: ${twist.title}. ${twist.summary}`);
    if (rewardMult < 1 && deptId !== 'entertainment') {
      window.CasinoShell?.toast?.(`Repeat run this phase: ${Math.round(rewardMult * 100)}% rewards. Full rewards return next phase.`, 6000);
    }
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
    const levelLabel = briefing.level
      ? `${briefing.department ?? meta.department ?? 'Hotel'} Lv ${briefing.level}`
      : briefing.department ?? meta.department ?? 'Hotel';
    const coverage = Number.isFinite(briefing.coverageScore)
      ? `${briefing.coverageScore}% ${briefing.coverageLabel ?? 'coverage'}`
      : briefing.coverageLabel ?? 'Coverage pending';
    const staff = `${briefing.assignedCount ?? 0}/${Math.max(1, briefing.demand ?? 1)}`;
    const bonus = briefing.staffBonus > 0 ? `+${briefing.staffBonus}%` : 'Base';
    const prepLabel = briefing.prepared ? 'Prepared' : 'Needs Staff';
    const staffImpact = staffImpactText(briefing, { coverage, staff, bonus });
    return `
      <div class="mini-shift-title">
        <span class="mini-shift-icon"><i class="fa-solid ${escapeHtml(icon)}"></i></span>
        <span>
          <small>Operation Briefing</small>
          <strong>${escapeHtml(briefing.title)}</strong>
          <em>${escapeHtml(levelLabel)}</em>
        </span>
      </div>
      <div class="mini-shift-mission">
        <span class="mini-shift-mission-block">
          <small>Today's Goal</small>
          <strong>${escapeHtml(briefing.goal)}</strong>
        </span>
        <span class="mini-shift-mission-block">
          <small>Reward</small>
          <strong>${escapeHtml(briefing.rewardHint)}</strong>
        </span>
      </div>
      <div class="mini-shift-facts">
        ${renderFact('Coverage', coverage)}
        ${renderFact('Risk', briefing.riskLabel ?? riskLabel(briefing.risk))}
        ${renderFact('Staff', staff)}
        ${renderFact('Bonus', bonus)}
      </div>
      <div class="mini-shift-note">
        <small>Staff Impact</small>
        <span><i class="fa-solid ${briefing.prepared ? 'fa-circle-check' : 'fa-triangle-exclamation'}"></i> ${escapeHtml(prepLabel)}</span>
        <em>${escapeHtml(staffImpact)}</em>
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

  function staffImpactText(briefing, { coverage, staff, bonus }) {
    if (briefing.prepared) {
      const speed = briefing.speedBonus > 0 ? `, ${briefing.speedBonus}% faster handling` : '';
      const quality = briefing.qualityBonus > 0 ? `, +${briefing.qualityBonus} quality` : '';
      return `${coverage} coverage with ${staff} staff. ${bonus} reward pace${speed}${quality}.`;
    }
    return briefing.prepNote ?? `Assign staff before starting to improve ${coverage} coverage.`;
  }

  function hintMode() {
    try { return ['always', 'off'].includes(localStorage.getItem(HINT_KEY)) ? localStorage.getItem(HINT_KEY) : 'auto'; }
    catch (_) { return 'auto'; }
  }

  function setHintMode(mode) {
    try { localStorage.setItem(HINT_KEY, mode); } catch (_) { /* storage unavailable */ }
    document.querySelectorAll('[data-mini-shift-briefing]').forEach(el => mount(el.dataset.miniShiftBriefing));
    document.dispatchEvent(new CustomEvent('shift-hints-changed'));
  }

  function runsOf(deptId) {
    return window.HotelState?.get?.()?.stats?.shiftsByDept?.[deptId] ?? 0;
  }

  function hintStatus(deptId) {
    const mode = hintMode();
    if (mode === 'always') return { on: true, mode, reason: 'Hints always on' };
    if (mode === 'off') return { on: false, mode, reason: 'Hints off' };
    const left = HINT_RUNS - runsOf(deptId);
    if (left > 0) return { on: true, mode, reason: `Training hints · ${left} run${left === 1 ? '' : 's'} left` };
    const briefing = briefingFor(deptId);
    if (briefing.prepared && (briefing.coverageScore ?? 0) >= COACH_COVERAGE) {
      return { on: true, mode, reason: `Staff coaching you (${briefing.coverageScore}% coverage)` };
    }
    return { on: false, mode, reason: `No hints · staff at ${COACH_COVERAGE}%+ coverage will coach you` };
  }

  const hintsOn = (deptId) => hintStatus(deptId).on;

  function gradeFor(score) {
    const value = Math.max(0, Math.min(100, Math.round(Number(score) || 0)));
    return { score: value, ...GRADES.find(g => value >= g.min) };
  }

  /* Grade a finished run, record the personal best, and show the grade
     at the top of the game's results panel. Returns the grade info. */
  function finishRun(deptId, score, panel = null) {
    running = false;
    expandedPref = null;
    stopStatusBar();
    mount(deptId);
    startStatusBar(deptId);          // back to the idle bar (Start again)
    setTimeout(() => scrollToEl(panel), 60);
    const grade = gradeFor(score);
    const hints = hintsOn(deptId);
    const best = window.HotelState?.recordShiftBest?.(deptId, grade.score, grade.letter)
      ?? { isNewBest: false, previous: null, best: null };
    const result = { ...grade, hints, ...best };
    result.twist = twistFor(deptId)?.title ?? null;
    if (panel) showGrade(panel, result);
    window.CasinoShell?.announce?.(`Grade ${grade.letter}, ${grade.score} out of 100.${best.isNewBest ? ' New personal best!' : ''}`);
    return result;
  }

  function showGrade(panel, result) {
    let el = panel.querySelector('.shift-grade');
    if (!el) {
      el = document.createElement('div');
      el.className = 'shift-grade';
      panel.insertBefore(el, panel.firstChild);
    }
    el.className = `shift-grade grade-${result.letter}${result.isNewBest ? ' new-best' : ''}`;
    const stars = '★'.repeat(result.stars) + '☆'.repeat(3 - result.stars);
    const bestText = result.isNewBest
      ? (result.previous ? `New personal best! (was ${result.previous.letter} · ${result.previous.score})` : 'First grade on record!')
      : result.best ? `Personal best: ${result.best.letter} · ${result.best.score}` : '';
    el.innerHTML = `
      <span class="grade-letter" aria-hidden="true">${result.letter}</span>
      <span class="grade-copy">
        <strong><span class="grade-stars" aria-label="${result.stars} of 3 stars">${stars}</span> ${result.score}/100</strong>
        <small>${escapeHtml(bestText)}</small>
        ${result.hints ? '<small class="grade-hints">Played with hints on</small>' : ''}
        ${result.twist ? `<small class="grade-twist">Shift twist: ${escapeHtml(result.twist)}</small>` : ''}
      </span>`;
  }

  /* ── Calendar twists (shift-twists.js) ── */
  function twistFor(deptId) {
    return window.HotelTwists?.active?.(deptId) ?? null;
  }

  function renderTwist(deptId) {
    const twist = twistFor(deptId);
    if (!twist) return '';
    return `
      <div class="mini-shift-twist" data-shift-twist="${escapeHtml(twist.id)}">
        <span class="mini-shift-twist-emoji" aria-hidden="true">${escapeHtml(twist.emoji)}</span>
        <span>
          <small>Shift twist</small>
          <strong>${escapeHtml(twist.title)}</strong>
          <em>${escapeHtml(twist.summary)}</em>
        </span>
      </div>`;
  }

  function renderHintControl(deptId) {
    if (deptId === 'entertainment' || deptId === 'casino') return '';
    const status = hintStatus(deptId);
    return `
      <label class="mini-shift-hints ${status.on ? 'hints-on' : 'hints-off'}">
        <span><i class="fa-solid fa-lightbulb" aria-hidden="true"></i> ${escapeHtml(status.reason)}</span>
        <select data-shift-hint-mode aria-label="Shift hints">
          <option value="auto" ${status.mode === 'auto' ? 'selected' : ''}>Hints: auto</option>
          <option value="always" ${status.mode === 'always' ? 'selected' : ''}>Hints: always</option>
          <option value="off" ${status.mode === 'off' ? 'selected' : ''}>Hints: off</option>
        </select>
      </label>`;
  }

  /* ── Phone status bar ────────────────────────────────────
     On phones the side panel (next step, score, latest result) ends up
     below the game. While a shift runs, a slim bar pinned to the bottom
     mirrors it so feedback stays in view. Hidden on wider screens. */
  const STATUS_SOURCES = {
    bar:        { next: '#bar-next-step strong', log: '#shift-log', start: '#start-shift-btn',
                  stats: [['Served', '#served-count', '#served-target'], ['Tips', '#tips-total', null, '$'], ['Streak', '#streak-count']] },
    spa:        { next: '#spa-next-step strong', log: '#spa-log', start: '#start-spa-btn',
                  stats: [['Guests', '#spa-served', '#spa-target'], ['Cash', '#spa-earned', null, '$'], ['Time', '#spa-time']] },
    rooms:      { next: '#ops-next-step strong', log: '#ops-log', start: '#start-ops-btn',
                  stats: [['Done', '#ops-resolved', '#ops-target'], ['Cash', '#ops-earned', null, '$'], ['Time', '#ops-time']] },
    restaurant: { next: '#tasting-next-step strong', log: '#tasting-log', start: '#start-tasting-btn',
                  stats: [['Tables', '#tables-served', '#tables-target'], ['Revenue', '#tasting-earned', null, '$'], ['Harmony', '#harmony-score', null, '', '%']] },
  };
  let statusTimer = null;

  function startStatusBar(deptId) {
    const src = STATUS_SOURCES[deptId];
    if (!src || typeof document === 'undefined') return;
    let bar = document.getElementById('shift-status-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'shift-status-bar';
      bar.className = 'shift-status-bar';
      bar.setAttribute('aria-hidden', 'true');   // mirrors on-page text that screen readers already get
      document.body.appendChild(bar);
    }
    document.body.classList.add('has-shift-status');
    const text = sel => document.querySelector(sel)?.textContent?.trim() ?? '';
    const paint = () => {
      bar.classList.toggle('is-idle', !running);
      if (!running) {
        // Between shifts: the Start button lives in the panel below the game, so mirror it here
        const startBtn = document.querySelector(src.start);
        const html = `
          <div class="ssb-next">${escapeHtml(text(src.next))}</div>
          ${startBtn ? `<button type="button" class="ssb-start" tabindex="-1" ${startBtn.disabled ? 'disabled' : ''}>${escapeHtml(startBtn.textContent.trim())}</button>` : ''}`;
        if (bar.dataset.html === html) return;      // only repaint on change, so a tap is never lost mid-render
        bar.dataset.html = html;
        bar.innerHTML = html;
        bar.querySelector('.ssb-start')?.addEventListener('click', () => document.querySelector(src.start)?.click());
        return;
      }
      const stats = src.stats.map(([label, value, total, pre = '', post = '']) =>
        `<span class="ssb-stat"><small>${escapeHtml(label)}</small><b>${escapeHtml(pre + text(value) + (total ? `/${text(total)}` : '') + post)}</b></span>`).join('');
      const latest = document.querySelector(`${src.log} p`);
      const html = `
        <div class="ssb-next">${escapeHtml(text(src.next))}</div>
        <div class="ssb-row">${stats}</div>
        ${latest ? `<div class="ssb-latest ${escapeHtml(latest.className)}">${escapeHtml(latest.textContent)}</div>` : ''}`;
      if (bar.dataset.html === html) return;
      bar.dataset.html = html;
      bar.innerHTML = html;
    };
    paint();
    clearInterval(statusTimer);
    statusTimer = setInterval(paint, running ? 300 : 700);
  }

  function stopStatusBar() {
    clearInterval(statusTimer);
    statusTimer = null;
  }

  /* On phones the game sits above the side panel: bring the game into
     view when a shift starts, and the results into view when it ends. */
  function scrollToEl(el) {
    if (!el || !isPhone()) return;
    const reduce = window.CasinoShell?.reducedMotion?.() ?? false;
    el.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
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

  return { mount, start, briefingFor, hintsOn, hintStatus, setHintMode, gradeFor, finishRun, twistFor, GRADES };
})();

if (typeof window !== 'undefined') window.HotelShiftBriefing = HotelShiftBriefing;
