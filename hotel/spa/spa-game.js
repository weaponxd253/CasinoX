/* ============================================================
   SPA RUSH - MINI-GAME V1
   ------------------------------------------------------------
   Assign stressed hotel guests to wellness treatments before
   patience runs out. Rewards feed back into hotel state.
   ============================================================ */

const SpaRush = (() => {
  const SESSION_MS = 60_000;
  const SLOT_COUNT = 3;
  const STATION_COUNT = 3;

  const TREATMENTS = [
    { id:'massage', label:'Massage', level:1, icon:'fa-hands', bestFor:['stressed'], time:5200, cash:45, sat:3, style:'Satisfaction' },
    { id:'sauna', label:'Sauna', level:2, icon:'fa-temperature-high', bestFor:['tired'], time:3600, cash:38, sat:2, style:'Fast recovery' },
    { id:'aroma', label:'Aromatherapy', level:3, icon:'fa-seedling', bestFor:['luxury'], time:4600, cash:68, sat:2, style:'Cash bonus' },
    { id:'meditation', label:'Meditation', level:4, icon:'fa-brain', bestFor:['overstimulated'], time:4400, cash:34, sat:4, style:'Mood rescue' },
    { id:'signature', label:'Signature', level:5, icon:'fa-star', bestFor:['vip','stressed','luxury'], time:6200, cash:110, sat:5, style:'VIP chance' },
  ];

  const MOODS = [
    { id:'stressed', label:'Stressed', wants:'Relaxation', best:'massage', patience:15000, avatar:'fa-face-tired' },
    { id:'tired', label:'Tired', wants:'Recovery', best:'sauna', patience:17000, avatar:'fa-bed' },
    { id:'luxury', label:'Luxury-seeking', wants:'Pampering', best:'aroma', patience:14500, avatar:'fa-gem' },
    { id:'overstimulated', label:'Overstimulated', wants:'Quiet', best:'meditation', patience:12500, avatar:'fa-volume-xmark' },
    { id:'vip', label:'VIP', wants:'Signature care', best:'signature', patience:11000, avatar:'fa-crown', vip:true },
  ];

  const NAMES = ['Mara Vale', 'Theo Park', 'Celeste Rio', 'Iris Wynn', 'Julian Cross', 'Nadia Sol', 'Vera Lux', 'Anton Reed'];

  let session = null;
  let tickTimer = null;

  const $ = id => document.getElementById(id);

  function init() {
    syncHotelCash();
    window.HotelShiftBriefing?.mount?.('spa');
    renderIdle();
    renderTreatments();
    renderStations();
    renderActiveGuest();

    $('start-spa-btn')?.addEventListener('click', startSession);
    $('treatment-bar')?.addEventListener('click', e => {
      const btn = e.target.closest('[data-treatment-id]');
      if (!btn || btn.disabled) return;
      assignTreatment(btn.dataset.treatmentId);
    });
  }

  function startSession() {
    const spaLevel = HotelState.get().departments.spa?.level ?? 0;
    if (spaLevel <= 0) {
      log('Build Spa & Wellness before opening Spa Rush.', 'bad', true);
      CasinoShell.toast('Build Spa & Wellness first.');
      return;
    }

    window.HotelShiftBriefing?.start?.('spa', 'Spa Rush');
    session = {
      active: true,
      spaLevel,
      startedAt: Date.now(),
      endsAt: Date.now() + SESSION_MS,
      target: 7 + spaLevel,
      guests: [],
      stations: Array.from({ length: STATION_COUNT }, (_, i) => ({ id:`station_${i}`, treatment:null, guest:null, startedAt:0, doneAt:0 })),
      selectedGuestId: null,
      spawned: 0,
      treated: 0,
      walkouts: 0,
      perfect: 0,
      earned: 0,
      satPoints: 0,
      lastOutcome: null,
    };

    $('start-spa-btn').disabled = true;
    $('start-spa-btn').innerHTML = '<i class="fa-solid fa-spinner"></i> In Session';
    setReturnLink('Back to Hotel', 'fa-arrow-left');
    setNextStep('Choose a treatment for the active guest.');
    hideResults();
    clearLog();
    log('Spa session opened.', 'gold');
    renderTreatments();
    presentNextGuest();
    updateAll();
    startTick();
  }

  function assignTreatment(treatmentId) {
    if (!session?.active) return;
    const guest = activeGuest();
    if (!guest) return;

    const treatment = TREATMENTS.find(t => t.id === treatmentId);
    if (!treatment || treatment.level > session.spaLevel) return;

    const station = session.stations.find(s => !s.guest);
    if (!guest || !station) {
      log('All treatment rooms are busy.', 'bad');
      setNextStep('All treatment rooms are busy. Wait for one to open.');
      return;
    }

    const now = Date.now();
    const read = evaluateTreatment(treatment, guest);
    guest.status = 'treating';
    guest.assignedTreatment = treatment.id;
    guest.treatmentRead = read;
    station.guest = guest;
    station.treatment = treatment;
    station.startedAt = now;
    station.doneAt = now + treatment.time;
    session.selectedGuestId = null;
    session.lastOutcome = {
      tone: read.tier === 'risky' ? 'bad' : 'gold',
      title: `${treatment.label} started`,
      body: `${read.label}: ${read.reason}`,
    };
    presentNextGuest();

    CasinoShell.sound.tone(560, 'sine', 0.08, 0.18);
    updateAll();
  }

  function startTick() {
    clearInterval(tickTimer);
    tickTimer = setInterval(() => {
      if (!session?.active) return;
      const now = Date.now();
      let boardChanged = false;

      const guest = activeGuest();
      if (guest && now >= guest.patienceEnd) {
        handleWalkout(guest);
        boardChanged = true;
      }

      session.stations
        .filter(s => s.guest && now >= s.doneAt)
        .forEach(station => {
          completeTreatment(station);
          boardChanged = true;
        });

      boardChanged = presentNextGuest() || boardChanged;
      if (boardChanged) {
        updateAll();
      } else {
        updateLiveMeters();
      }

      if (now >= session.endsAt || session.treated + session.walkouts >= session.target) {
        finishSession();
      }
    }, 120);
  }

  function presentNextGuest() {
    if (!session?.active || activeGuest()) return false;
    if (session.spawned >= session.target) {
      session.selectedGuestId = null;
      return false;
    }
    const guest = makeGuest();
    session.guests.push(guest);
    session.spawned++;
    session.selectedGuestId = guest.id;
    return true;
  }

  function makeGuest() {
    const options = MOODS.filter(m => m.id !== 'vip' || session.spaLevel >= 5 || Math.random() < 0.12);
    const mood = options[Math.floor(Math.random() * options.length)];
    const now = Date.now();
    const patience = Math.round(mood.patience * Math.max(0.72, 1.08 - session.spaLevel * 0.04));
    return {
      id: `spa_guest_${session.spawned}_${now}`,
      name: NAMES[Math.floor(Math.random() * NAMES.length)],
      mood,
      status: 'waiting',
      arrivedAt: now,
      patience,
      patienceEnd: now + patience,
      assignedTreatment: null,
    };
  }

  function handleWalkout(guest) {
    guest.status = 'left';
    session.walkouts++;
    session.selectedGuestId = session.selectedGuestId === guest.id ? null : session.selectedGuestId;
    session.lastOutcome = {
      tone: 'bad',
      title: 'Guest Walked Out',
      body: `${guest.name} waited too long for ${guest.mood.wants.toLowerCase()}.`,
    };
    log(`${guest.name} left before treatment.`, 'bad');
    CasinoShell.sound.lose();
  }

  function completeTreatment(station) {
    const guest = station.guest;
    const treatment = station.treatment;
    const read = guest.treatmentRead ?? evaluateTreatment(treatment, guest);
    const perfect = read.tier === 'best';
    const acceptable = read.tier === 'acceptable';
    const vipBonus = guest.mood.vip && treatment.id === 'signature' ? 60 : 0;
    const earned = Math.round(treatment.cash + vipBonus + session.spaLevel * 8 + (perfect ? treatment.cash * 0.45 : 0));
    const sat = perfect ? treatment.sat : acceptable ? Math.max(1, treatment.sat - 2) : 0;

    guest.status = 'done';
    session.treated++;
    session.earned += earned;
    session.satPoints += sat;
    if (perfect) session.perfect++;
    session.lastOutcome = {
      tone: perfect ? 'good' : acceptable ? 'gold' : 'bad',
      title: perfect ? 'Perfect Match' : acceptable ? 'Good Recovery' : 'Wrong Treatment',
      body: `${guest.name} received ${treatment.label}. +$${fmt(earned)}${sat ? `, satisfaction +${sat}` : ''}.`,
    };

    log(
      perfect
        ? `${guest.name} loved the ${treatment.label}. +$${earned}`
        : acceptable
          ? `${guest.name} recovered with ${treatment.label}. +$${earned}`
          : `${guest.name} disliked the ${treatment.label}. +$${earned}`,
      perfect ? 'good' : acceptable ? 'gold' : 'bad'
    );
    CasinoShell.sound.tone(perfect ? 760 : acceptable ? 520 : 330, 'sine', 0.12, 0.22);

    station.guest = null;
    station.treatment = null;
    station.startedAt = 0;
    station.doneAt = 0;
  }

  function evaluateTreatment(treatment, guest) {
    if (!treatment || !guest) {
      return { tier:'risky', label:'Risky', reason:'No active guest.' };
    }
    if (treatment.id === guest.mood.best) {
      return {
        tier: 'best',
        label: 'Best Match',
        reason: `Matches ${guest.mood.wants.toLowerCase()}.`,
      };
    }
    if (treatment.bestFor.includes(guest.mood.id) || treatment.level >= Math.max(1, session.spaLevel - 1)) {
      return {
        tier: 'acceptable',
        label: 'Good Backup',
        reason: 'Can help, but not the cleanest fit.',
      };
    }
    return {
      tier: 'risky',
      label: 'Risky',
      reason: `Does not match ${guest.mood.wants.toLowerCase()}.`,
    };
  }

  function finishSession() {
    if (!session?.active) return;
    clearInterval(tickTimer);
    session.active = false;

    const satBonus = Math.max(0, Math.min(10, Math.round(session.satPoints / 2) - session.walkouts));
    HotelState.addHotelCash(session.earned);
    HotelState.setSatisfaction(HotelState.getSatisfaction() + satBonus);
    HotelEngine.recalculateReputation(HotelState.get());
    HotelBridge.applyHotelToCasino(HotelState.get());
    HotelState.recordShiftResult?.('spa', {
      title: 'Spa Rush complete',
      cash: session.earned,
      satisfaction: satBonus,
      primaryLabel: 'Treated',
      primaryValue: session.treated,
      summary: `${session.treated} guests treated, ${session.walkouts} walkouts.`,
      impact: 'Recovered satisfaction for premium guests.',
      metrics: [
        { label:'Walkouts', value:session.walkouts },
        { label:'Stations', value:session.stations.length },
      ],
    });
    CasinoShell.awardXp(Math.max(10, Math.round(session.earned / 5)));

    session.guests = [];
    session.stations.forEach(station => {
      station.guest = null;
      station.treatment = null;
      station.startedAt = 0;
      station.doneAt = 0;
    });
    $('start-spa-btn').disabled = false;
    $('start-spa-btn').innerHTML = '<i class="fa-solid fa-rotate-right"></i> Start Spa Rush Again';
    setReturnLink('Return to Hotel', 'fa-building');
    setNextStep('Return to Hotel with the result, or start Spa Rush again.');
    syncHotelCash();
    renderTreatments();
    updateAll();
    showResults(satBonus);
    log(`Session complete. Hotel earned $${fmt(session.earned)}. Satisfaction +${satBonus}.`, 'gold');
    if (session.earned > 0) CasinoShell.celebrate(session.earned);
    CasinoShell.toast(`Spa Rush complete: +$${fmt(session.earned)} hotel cash`);
  }

  function renderIdle() {
    const spaLevel = HotelState.get().departments.spa?.level ?? 0;
    const tier = HotelConfig.UPGRADE_CATALOG.spa?.[Math.max(0, spaLevel - 1)];
    $('spa-tier-label').textContent = tier?.label ?? 'Spa not built';
    $('spa-target').textContent = 7 + Math.max(1, spaLevel);
    $('spa-time').textContent = '1:00';
    $('spa-session-fill').style.width = '0%';
    log(spaLevel > 0 ? 'Spa is ready for guests.' : 'Spa & Wellness is not built yet.', spaLevel > 0 ? 'gold' : 'bad', true);
    setReturnLink('Back to Hotel', 'fa-arrow-left');
    setNextStep(spaLevel > 0 ? 'Start Spa Rush to seat waiting guests.' : 'Build Spa & Wellness to unlock this shift.');
    updateStats();
  }

  function renderActiveGuest() {
    const wrap = $('guest-slots');
    if (!wrap) return;
    const guest = activeGuest();
    if (!session?.active) {
      wrap.innerHTML = `
        <article class="active-guest-card idle">
          <span class="active-guest-label">Ready</span>
          <strong>Start Spa Rush</strong>
          <p>One guest will appear here. Choose a treatment below to serve them.</p>
        </article>
      `;
      return;
    }
    if (!guest) {
      wrap.innerHTML = `
        <article class="active-guest-card idle">
          <span class="active-guest-label">Waiting</span>
          <strong>No active guest</strong>
          <p>Treatment rooms are catching up. The next guest will appear shortly.</p>
        </article>
      `;
      return;
    }

    const pct = patiencePct(guest);
    const mood = guest.mood;
    const treatment = treatmentLabel(mood.best);
    wrap.innerHTML = `
      <article class="active-guest-card" data-active-guest-id="${guest.id}">
        <div class="active-guest-header">
          <div class="guest-avatar"><i class="fa-solid ${mood.avatar}"></i></div>
          <div>
            <span class="active-guest-label">Active Guest</span>
            <strong>${guest.name}</strong>
            <p>${mood.label} · Wants ${mood.wants}</p>
          </div>
          ${mood.vip ? '<span class="guest-vip">VIP</span>' : ''}
        </div>
        <div class="active-guest-read">
          <div><span>Need</span><strong>${mood.wants}</strong></div>
          <div><span>Best Treatment</span><strong>${treatment}</strong></div>
        </div>
        <div class="active-patience">
          <div class="active-patience-top">
            <span>Patience</span>
            <strong>${pct}%</strong>
          </div>
          <div class="patience-track">
            <div class="patience-fill ${pct < 26 ? 'danger' : pct < 52 ? 'warn' : ''}" style="width:${pct}%"></div>
          </div>
        </div>
      </article>
    `;
  }

  function renderStations() {
    const wrap = $('station-grid');
    if (!wrap) return;
    const stations = session?.stations ?? Array.from({ length: STATION_COUNT }, (_, i) => ({ id:`station_${i}` }));
    wrap.innerHTML = stations.map((station, i) => {
      const treatment = station.treatment;
      const guest = station.guest;
      const pct = stationPct(station);
      return `
        <article class="station-card ${guest ? 'busy' : 'idle'}" data-station-id="${station.id}">
          <div>
            <div class="station-icon"><i class="fa-solid ${treatment?.icon ?? 'fa-spa'}"></i></div>
            <div class="station-name">Room ${i + 1}</div>
            <div class="station-guest">${guest ? `${guest.name} · ${treatment.label}` : 'Available'}</div>
          </div>
          <div class="station-track"><div class="station-fill" style="width:${pct}%"></div></div>
        </article>
      `;
    }).join('');
  }

  function renderTreatments() {
    const wrap = $('treatment-bar');
    if (!wrap) return;
    const spaLevel = session?.spaLevel ?? HotelState.get().departments.spa?.level ?? 0;
    const guest = activeGuest();
    const openStation = !session?.active || session.stations.some(station => !station.guest);
    wrap.innerHTML = TREATMENTS.map(t => {
      const unlocked = spaLevel >= t.level;
      const read = guest && unlocked ? evaluateTreatment(t, guest) : null;
      const recommended = read?.tier === 'best';
      const acceptable = read?.tier === 'acceptable';
      const risky = read?.tier === 'risky';
      const disabled = !unlocked || !session?.active || !guest || !openStation;
      const label = recommended
        ? 'Best Match'
        : !guest && unlocked
          ? 'Waiting'
          : unlocked
            ? read?.label ?? 'Available'
            : `Spa Lv ${t.level}`;
      return `
        <button class="treatment-btn ${unlocked ? '' : 'locked'} ${recommended ? 'best-match next-action' : acceptable ? 'good-backup' : risky ? 'risky-treatment' : ''}" type="button"
                data-treatment-id="${t.id}" ${disabled ? 'disabled' : ''}>
          <span class="treatment-step">${label}</span>
          <i class="fa-solid ${t.icon}"></i>
          <strong>${t.label}</strong>
          <small>${read?.reason ?? (unlocked ? t.style : `Spa Lv ${t.level}`)}</small>
        </button>
      `;
    }).join('');
  }

  function updateAll() {
    renderActiveGuest();
    renderStations();
    renderTreatments();
    renderOutcome();
    updateNextStep();
    updateStats();
    updateSessionMeter();
  }

  function updateLiveMeters() {
    updateStats();
    updateSessionMeter();
    updateActiveGuestMeter();
    updateStationMeters();
  }

  function updateActiveGuestMeter() {
    const guest = activeGuest();
    if (!guest) return;
    const card = document.querySelector('[data-active-guest-id]');
    if (!card) return;
    const pct = patiencePct(guest);
    const fill = card.querySelector('.patience-fill');
    const label = card.querySelector('.active-patience-top strong');
    if (fill) {
      fill.style.width = `${pct}%`;
      fill.classList.toggle('danger', pct < 26);
      fill.classList.toggle('warn', pct >= 26 && pct < 52);
    }
    if (label) label.textContent = `${pct}%`;
  }

  function updateStationMeters() {
    (session?.stations ?? []).forEach(station => {
      const card = document.querySelector(`[data-station-id="${station.id}"]`);
      const fill = card?.querySelector('.station-fill');
      if (fill) fill.style.width = `${stationPct(station)}%`;
    });
  }

  function renderOutcome() {
    const el = $('spa-outcome');
    if (!el) return;
    const outcome = session?.lastOutcome;
    if (!outcome) {
      el.hidden = true;
      el.innerHTML = '';
      return;
    }
    el.hidden = false;
    el.className = `spa-outcome ${outcome.tone}`;
    el.innerHTML = `
      <span>Latest Result</span>
      <strong>${outcome.title}</strong>
      <p>${outcome.body}</p>
    `;
  }

  function updateStats() {
    const treated = session?.treated ?? 0;
    const target = session?.target ?? 8;
    const earned = session?.earned ?? 0;
    const perfect = session?.perfect ?? 0;
    const walkouts = session?.walkouts ?? 0;
    const satPreview = Math.max(0, Math.min(10, Math.round((session?.satPoints ?? 0) / 2) - walkouts));
    $('spa-served').textContent = treated;
    $('spa-target').textContent = target;
    $('spa-earned').textContent = fmt(earned);
    $('spa-perfect').textContent = perfect;
    $('spa-mood').textContent = walkouts > 1 ? 'Tense' : perfect >= 3 ? 'Serene' : 'Calm';
    $('spa-sat-preview').textContent = satPreview;
    $('spa-boost-fill').style.width = `${Math.min(100, satPreview * 10)}%`;
  }

  function updateSessionMeter() {
    if (!session?.active) return;
    const remaining = Math.max(0, session.endsAt - Date.now());
    const seconds = Math.ceil(remaining / 1000);
    $('spa-time').textContent = `0:${String(seconds).padStart(2, '0')}`;
    $('spa-session-fill').style.width = `${Math.max(0, 100 - (remaining / SESSION_MS) * 100)}%`;
  }

  function showResults(satBonus) {
    $('result-cash').textContent = fmt(session.earned);
    $('result-treated').textContent = session.treated;
    $('result-walkouts').textContent = session.walkouts;
    $('result-sat').textContent = satBonus;
    const panel = $('spa-results');
    panel.hidden = false;
    panel.classList.remove('pop');
    void panel.offsetWidth;
    panel.classList.add('pop');
  }

  function hideResults() {
    const panel = $('spa-results');
    if (panel) panel.hidden = true;
  }

  function syncHotelCash() {
    const el = $('spa-hotel-cash');
    if (el) el.textContent = fmt(HotelState.getCash());
  }

  function setReturnLink(label, icon) {
    const link = $('spa-return-link');
    if (!link) return;
    link.innerHTML = `<i class="fa-solid ${icon}"></i> ${label}`;
  }

  function activeGuest() {
    if (!session?.active) return null;
    return session.guests.find(g => g.id === session.selectedGuestId && g.status === 'waiting') ?? null;
  }

  function updateNextStep() {
    if (!session?.active) return;
    const guest = activeGuest();
    if (!guest) {
      setNextStep('Treatment rooms are full. Wait for a room to open.');
      return;
    }
    if (!session.stations.some(station => !station.guest)) {
      setNextStep('All treatment rooms are busy. Wait for one to open.');
      return;
    }
    setNextStep(`Choose a treatment for ${guest.name}. Best match: ${treatmentLabel(guest.mood.best)}.`);
  }

  function setNextStep(message) {
    const el = $('spa-next-step');
    if (!el) return;
    el.querySelector('strong').textContent = message;
  }

  function clearLog() {
    $('spa-log').innerHTML = '';
  }

  function log(message, type = '', replace = false) {
    const wrap = $('spa-log');
    if (!wrap) return;
    if (replace) wrap.innerHTML = '';
    const p = document.createElement('p');
    p.className = type;
    p.textContent = message;
    wrap.prepend(p);
  }

  function patiencePct(guest) {
    if (!session?.active || !guest) return 100;
    return Math.max(0, Math.round(((guest.patienceEnd - Date.now()) / guest.patience) * 100));
  }

  function stationPct(station) {
    if (!station?.guest) return 0;
    const total = station.doneAt - station.startedAt;
    return Math.max(0, Math.min(100, Math.round(((Date.now() - station.startedAt) / total) * 100)));
  }

  function treatmentLabel(id) {
    return TREATMENTS.find(t => t.id === id)?.label ?? id;
  }

  function fmt(value) {
    return Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
  }

  return { init };
})();
