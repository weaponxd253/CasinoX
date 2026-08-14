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
    renderGuests();

    $('start-spa-btn')?.addEventListener('click', startSession);
    $('guest-slots')?.addEventListener('click', e => {
      const card = e.target.closest('[data-guest-id]');
      if (!card || card.classList.contains('empty')) return;
      selectGuest(card.dataset.guestId);
    });
    $('guest-slots')?.addEventListener('keydown', e => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const card = e.target.closest('[data-guest-id]');
      if (!card || card.classList.contains('empty')) return;
      e.preventDefault();
      selectGuest(card.dataset.guestId);
    });
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
    };

    $('start-spa-btn').disabled = true;
    $('start-spa-btn').innerHTML = '<i class="fa-solid fa-spinner"></i> In Session';
    hideResults();
    clearLog();
    log('Spa session opened.', 'gold');
    renderTreatments();
    spawnUntilFull();
    ensureSelectedGuest();
    updateAll();
    startTick();
  }

  function selectGuest(guestId) {
    if (!session?.active) return;
    const guest = session.guests.find(g => g.id === guestId);
    if (!guest || guest.status !== 'waiting') return;
    session.selectedGuestId = guestId;
    renderGuests();
  }

  function assignTreatment(treatmentId) {
    if (!session?.active) return;
    ensureSelectedGuest();
    if (!session.selectedGuestId) return;

    const treatment = TREATMENTS.find(t => t.id === treatmentId);
    if (!treatment || treatment.level > session.spaLevel) return;

    const guest = session.guests.find(g => g.id === session.selectedGuestId);
    const station = session.stations.find(s => !s.guest);
    if (!guest || !station) {
      log('All treatment rooms are busy.', 'bad');
      return;
    }

    const now = Date.now();
    guest.status = 'treating';
    guest.assignedTreatment = treatment.id;
    station.guest = guest;
    station.treatment = treatment;
    station.startedAt = now;
    station.doneAt = now + treatment.time;
    session.selectedGuestId = null;
    ensureSelectedGuest();

    CasinoShell.sound.tone(560, 'sine', 0.08, 0.18);
    renderGuests();
    renderStations();
  }

  function startTick() {
    clearInterval(tickTimer);
    tickTimer = setInterval(() => {
      if (!session?.active) return;
      const now = Date.now();

      session.guests
        .filter(g => g.status === 'waiting' && now >= g.patienceEnd)
        .forEach(handleWalkout);

      session.stations
        .filter(s => s.guest && now >= s.doneAt)
        .forEach(completeTreatment);

      spawnUntilFull();
      ensureSelectedGuest();
      updateAll();

      if (now >= session.endsAt || session.treated + session.walkouts >= session.target) {
        finishSession();
      }
    }, 120);
  }

  function spawnUntilFull() {
    if (!session?.active) return;
    while (
      session.guests.filter(g => g.status === 'waiting').length < SLOT_COUNT &&
      session.spawned < session.target
    ) {
      session.guests.push(makeGuest());
      session.spawned++;
    }
  }

  function ensureSelectedGuest() {
    if (!session?.active) return;
    const current = session.guests.find(g => g.id === session.selectedGuestId && g.status === 'waiting');
    if (current) return;
    session.selectedGuestId = session.guests.find(g => g.status === 'waiting')?.id ?? null;
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
    ensureSelectedGuest();
    log(`${guest.name} left before treatment.`, 'bad');
    CasinoShell.sound.lose();
  }

  function completeTreatment(station) {
    const guest = station.guest;
    const treatment = station.treatment;
    const perfect = treatment.id === guest.mood.best || treatment.bestFor.includes(guest.mood.id);
    const acceptable = !perfect && treatment.level >= Math.max(1, session.spaLevel - 1);
    const vipBonus = guest.mood.vip && treatment.id === 'signature' ? 60 : 0;
    const earned = Math.round(treatment.cash + vipBonus + session.spaLevel * 8 + (perfect ? treatment.cash * 0.45 : 0));
    const sat = perfect ? treatment.sat : acceptable ? Math.max(1, treatment.sat - 2) : 0;

    guest.status = 'done';
    session.treated++;
    session.earned += earned;
    session.satPoints += sat;
    if (perfect) session.perfect++;

    log(
      perfect
        ? `${guest.name} loved the ${treatment.label}. +$${earned}`
        : `${guest.name} finished the ${treatment.label}. +$${earned}`,
      perfect ? 'good' : 'gold'
    );
    CasinoShell.sound.tone(perfect ? 760 : 520, 'sine', 0.12, 0.22);

    station.guest = null;
    station.treatment = null;
    station.startedAt = 0;
    station.doneAt = 0;
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
    $('start-spa-btn').innerHTML = '<i class="fa-solid fa-rotate-right"></i> New Session';
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
    updateStats();
  }

  function renderGuests() {
    const wrap = $('guest-slots');
    if (!wrap) return;
    const waiting = session?.guests?.filter(g => g.status === 'waiting') ?? [];
    const cards = Array.from({ length: SLOT_COUNT }, (_, i) => {
      const guest = waiting[i];
      if (!guest) return '<div class="guest-card empty">Open waiting seat</div>';
      const selected = session.selectedGuestId === guest.id ? 'selected' : '';
      const pct = patiencePct(guest);
      const mood = guest.mood;
      return `
        <article class="guest-card ${selected}" data-guest-id="${guest.id}" role="button" tabindex="0">
          <div class="guest-top">
            <div class="guest-avatar"><i class="fa-solid ${mood.avatar}"></i></div>
            <div>
              <div class="guest-name">${guest.name}</div>
              <div class="guest-sub">${mood.label} · Wants ${mood.wants}</div>
            </div>
            ${mood.vip ? '<span class="guest-vip">VIP</span>' : ''}
          </div>
          <div class="guest-request">
            <i class="fa-solid fa-spa"></i>
            Best match: ${treatmentLabel(mood.best)}
          </div>
          <div class="patience-track">
            <div class="patience-fill ${pct < 26 ? 'danger' : pct < 52 ? 'warn' : ''}" style="width:${pct}%"></div>
          </div>
          <div class="guest-action">${selected ? 'Selected' : 'Select guest'}</div>
        </article>
      `;
    }).join('');
    wrap.innerHTML = cards;
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
        <article class="station-card ${guest ? 'busy' : 'idle'}">
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
    wrap.innerHTML = TREATMENTS.map(t => {
      const unlocked = spaLevel >= t.level;
      return `
        <button class="treatment-btn ${unlocked ? '' : 'locked'}" type="button"
                data-treatment-id="${t.id}" ${unlocked && session?.active ? '' : 'disabled'}>
          <i class="fa-solid ${t.icon}"></i>
          ${t.label}
          <small>${unlocked ? t.style : `Spa Lv ${t.level}`}</small>
        </button>
      `;
    }).join('');
  }

  function updateAll() {
    renderGuests();
    renderStations();
    updateStats();
    updateSessionMeter();
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
