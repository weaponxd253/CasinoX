/* ============================================================
   SPA RUSH - MINI-GAME V2
   ------------------------------------------------------------
   Up to three guests wait in the lounge, each with two needs.
   Pick a guest, pick a treatment: covering both needs is a
   perfect match, one is a good recovery. Long treatments pay
   more but tie up a room, and impatient guests hate them.
   Rooms need a reset between guests (auto, or tidy by hand).
   Rewards feed back into hotel state.
   ============================================================ */

const SpaRush = (() => {
  const SESSION_MS = 60_000;
  const STATION_COUNT = 3;
  const LOUNGE_SIZE = 3;
  const CLEAN_MS = 3200;       // auto-reset time after a treatment
  const RUSH_PCT = 35;         // below this patience, long treatments backfire
  const LONG_MS = 5000;        // a treatment this long counts as "long"
  const VIP_CHANCE = 0.12;

  const NEEDS = [
    { id:'stressed', label:'Stressed', wants:'Relaxation', icon:'fa-face-tired' },
    { id:'sore',     label:'Sore',     wants:'Muscle relief', icon:'fa-person-walking' },
    { id:'tired',    label:'Tired',    wants:'Recovery', icon:'fa-bed' },
    { id:'luxury',   label:'Luxury-seeking', wants:'Pampering', icon:'fa-gem' },
    { id:'quiet',    label:'Overstimulated', wants:'Quiet', icon:'fa-volume-xmark' },
  ];

  const TREATMENTS = [
    { id:'massage',    label:'Massage',      key:'q', level:1, icon:'fa-hands',            covers:['stressed','sore'], time:5000, cash:46, sat:3 },
    { id:'sauna',      label:'Sauna',        key:'w', level:1, icon:'fa-temperature-high', covers:['tired','sore'],    time:3200, cash:30, sat:2 },
    { id:'aroma',      label:'Aromatherapy', key:'e', level:2, icon:'fa-seedling',         covers:['luxury','stressed'], time:4400, cash:60, sat:3 },
    { id:'meditation', label:'Meditation',   key:'r', level:3, icon:'fa-brain',            covers:['quiet','tired'],   time:3800, cash:34, sat:4 },
    { id:'stones',     label:'Hot Stones',   key:'t', level:4, icon:'fa-fire',             covers:['sore','quiet','luxury'], time:5600, cash:64, sat:4 },
    { id:'signature',  label:'Signature',    key:'y', level:5, icon:'fa-star',             covers:NEEDS.map(n => n.id), time:7800, cash:96, sat:5 },
  ];

  const NAMES = ['Mara Vale', 'Theo Park', 'Celeste Rio', 'Iris Wynn', 'Julian Cross', 'Nadia Sol', 'Vera Lux', 'Anton Reed'];

  let session = null;
  let tickTimer = null;

  const $ = id => document.getElementById(id);
  const need = id => NEEDS.find(n => n.id === id);

  function hintsOn() { return window.HotelShiftBriefing?.hintsOn?.('spa') ?? true; }
  document.addEventListener('shift-hints-changed', () => updateAll());

  function init() {
    syncHotelCash();
    window.HotelShiftBriefing?.mount?.('spa');
    renderIdle();
    updateAll();

    $('start-spa-btn')?.addEventListener('click', startSession);
    $('treatment-bar')?.addEventListener('click', e => {
      const btn = e.target.closest('[data-treatment-id]');
      if (!btn || btn.disabled) return;
      assignTreatment(btn.dataset.treatmentId);
    });
    $('spa-lounge')?.addEventListener('click', e => {
      const card = e.target.closest('[data-guest-id]');
      if (card) selectGuest(card.dataset.guestId);
    });
    $('station-grid')?.addEventListener('click', e => {
      const btn = e.target.closest('[data-tidy]');
      if (btn) tidyStation(btn.dataset.tidy);
    });
    $('spa-menu-btn')?.addEventListener('click', showMenu);

    CasinoShell.registerShortcuts?.([
      { keys: ['1', '2', '3'], label: 'Pick a waiting guest', run: e => selectGuestAt(Number(e.key) - 1) },
      { keys: ['c'], label: 'Tidy a room', run: () => tidyStation() },
      { keys: ['m'], label: 'Treatment menu', run: showMenu },
      ...TREATMENTS.map(t => ({ keys: [t.key], label: t.label, run: () => assignTreatment(t.id) })),
    ]);
  }

  function spaLevelNow() {
    return session?.spaLevel ?? HotelState.get().departments.spa?.level ?? 0;
  }

  function unlockedTreatments(level = spaLevelNow()) {
    return TREATMENTS.filter(t => t.level <= level);
  }

  function startSession() {
    const spaLevel = HotelState.get().departments.spa?.level ?? 0;
    if (spaLevel <= 0) {
      log('Build Spa & Wellness before opening Spa Rush.', 'bad', true);
      CasinoShell.toast('Build Spa & Wellness first.');
      return;
    }

    window.HotelShiftBriefing?.start?.('spa', 'Spa Rush');
    const twist = window.HotelShiftBriefing?.twistFor?.('spa') ?? null;
    const now = Date.now();
    session = {
      active: true,
      spaLevel,
      twist,
      startedAt: now,
      endsAt: now + SESSION_MS,
      target: 7 + spaLevel + (twist?.effects.extraGuests ?? 0),
      guests: [],
      stations: Array.from({ length: STATION_COUNT }, (_, i) => ({ id:`station_${i}`, treatment:null, guest:null, startedAt:0, doneAt:0, cleanUntil:0 })),
      selectedGuestId: null,
      nextArrival: now,
      spawned: 0,
      treated: 0,
      walkouts: 0,
      perfect: 0,
      good: 0,
      risky: 0,
      earned: 0,
      satPoints: 0,
      lastOutcome: null,
      // A high roller staying at the hotel books in mid-session
      highRollerDue: HotelState.highRollerInHouse?.() ? Math.floor((7 + spaLevel) / 2) : -1,
      highRollerResult: null,
    };

    $('start-spa-btn').disabled = true;
    $('start-spa-btn').innerHTML = '<i class="fa-solid fa-spinner"></i> In Session';
    setReturnLink('Back to Hotel Lobby', 'fa-arrow-left');
    hideResults();
    clearLog();
    log('Spa session opened. Each guest has two needs.', 'gold');
    if (twist) log(`${twist.emoji} ${twist.title}: ${twist.summary}`, 'gold');
    if (session.highRollerDue >= 0) log('🎰 A high roller is staying at the hotel and will book in. Give them a perfect treatment.', 'gold');
    spawnGuest(now);
    session.nextArrival = now + 1200; // a second guest arrives quickly so there is a choice
    updateAll();
    startTick();
  }

  /* ── Lounge ───────────────────────────────────────────── */

  function waitingGuests() {
    return session?.active ? session.guests.filter(g => g.status === 'waiting') : [];
  }

  function activeGuest() {
    if (!session?.active) return null;
    return session.guests.find(g => g.id === session.selectedGuestId && g.status === 'waiting') ?? null;
  }

  function ensureSelection() {
    if (!session?.active || activeGuest()) return;
    session.selectedGuestId = waitingGuests()[0]?.id ?? null;
  }

  function selectGuest(id) {
    if (!session?.active) return;
    const guest = session.guests.find(g => g.id === id && g.status === 'waiting');
    if (!guest) return;
    session.selectedGuestId = guest.id;
    CasinoShell.sound.tone(480, 'sine', 0.05, 0.12);
    updateAll();
  }

  function selectGuestAt(index) {
    const guest = waitingGuests()[index];
    if (guest) selectGuest(guest.id);
  }

  function spawnGuest(now) {
    if (session.spawned >= session.target || waitingGuests().length >= LOUNGE_SIZE) return false;
    const guest = makeGuest(now);
    session.guests.push(guest);
    session.spawned++;
    session.nextArrival = now + 2200 + Math.random() * 2600;
    ensureSelection();
    return true;
  }

  // Two needs per guest. Most pairs have a treatment that covers both
  // (a perfect match exists); the rest force a partial or the Signature.
  function needPairs(level) {
    const open = NEEDS.filter(n => unlockedTreatments(level).some(t => t.id !== 'signature' && t.covers.includes(n.id)));
    const pairs = [];
    for (let i = 0; i < open.length; i++) {
      for (let j = i + 1; j < open.length; j++) pairs.push([open[i].id, open[j].id]);
    }
    return pairs;
  }

  function perfectable(pair, level) {
    return unlockedTreatments(level).some(t => t.id !== 'signature' && pair.every(n => t.covers.includes(n)));
  }

  function makeGuest(now) {
    // A twist can give every guest the same need (e.g. Morning After: recovery)
    const twistNeed = session.twist?.effects.need;
    const allPairs = needPairs(session.spaLevel);
    const pairs = twistNeed && allPairs.some(p => p.includes(twistNeed)) ? allPairs.filter(p => p.includes(twistNeed)) : allPairs;
    const easy = pairs.filter(p => perfectable(p, session.spaLevel));
    const pool = easy.length && Math.random() < 0.65 ? easy : pairs;
    const highRoller = session.spawned === session.highRollerDue;
    // High rollers always want pampering once the spa offers it
    const luxuryPair = highRoller ? pairs.find(p => p.includes('luxury')) : null;
    const needs = luxuryPair ?? pool[Math.floor(Math.random() * pool.length)];
    const vip = highRoller || Math.random() < (session.spaLevel >= 5 ? VIP_CHANCE * 1.6 : VIP_CHANCE);
    const patience = Math.round(16000 * Math.max(0.72, 1.08 - session.spaLevel * 0.04) * (highRoller ? 0.7 : vip ? 0.8 : 1) * (session.twist?.effects.patienceMult ?? 1));
    return {
      id: `spa_guest_${session.spawned}_${now}`,
      name: highRoller ? 'High Roller' : NAMES[Math.floor(Math.random() * NAMES.length)],
      needs,
      vip,
      highRoller,
      status: 'waiting',
      arrivedAt: now,
      patience,
      patienceEnd: now + patience,
    };
  }

  /* ── Treatments ───────────────────────────────────────── */

  function freeStation() {
    return session?.stations.find(s => !s.guest && !s.cleanUntil) ?? null;
  }

  function assignTreatment(treatmentId) {
    if (!session?.active) return;
    const guest = activeGuest();
    if (!guest) return;

    const treatment = TREATMENTS.find(t => t.id === treatmentId);
    if (!treatment || treatment.level > session.spaLevel) return;

    const station = freeStation();
    if (!station) {
      log('No room is ready. Tidy one or wait.', 'bad');
      setNextStep(session.stations.some(s => s.cleanUntil)
        ? 'No room is ready. Tidy a room (C) to open it now.'
        : 'All treatment rooms are busy. Wait for one to open.');
      return;
    }

    const now = Date.now();
    const read = evaluateTreatment(treatment, guest, patiencePct(guest));
    guest.status = 'treating';
    guest.assignedTreatment = treatment.id;
    guest.treatmentRead = read;
    station.guest = guest;
    station.treatment = treatment;
    station.startedAt = now;
    station.doneAt = now + treatment.time;
    session.selectedGuestId = null;
    ensureSelection();
    session.lastOutcome = {
      tone: read.tier === 'risky' ? 'bad' : 'gold',
      title: `${treatment.label} started`,
      body: `${guest.name}: ${read.label}. ${read.reason}`,
    };

    CasinoShell.sound.tone(560, 'sine', 0.08, 0.18);
    updateAll();
  }

  // How well a treatment fits a guest: both needs = best, one = acceptable,
  // none = risky. A long treatment on a guest about to walk drops a tier.
  function evaluateTreatment(treatment, guest, pct = 100) {
    if (!treatment || !guest) return { tier:'risky', label:'Risky', reason:'No active guest.', covered:0 };
    const covered = guest.needs.filter(n => treatment.covers.includes(n)).length;
    const tiers = ['risky', 'acceptable', 'best'];
    let tierIndex = covered;
    const rushed = pct < RUSH_PCT && treatment.time >= LONG_MS && covered > 0;
    if (rushed) tierIndex--;
    const tier = tiers[tierIndex];
    const missing = guest.needs.filter(n => !treatment.covers.includes(n)).map(n => need(n).wants.toLowerCase());
    const reason = rushed
      ? 'Too impatient for a long session.'
      : covered === 2
        ? `Covers ${guest.needs.map(n => need(n).wants.toLowerCase()).join(' and ')}.`
        : covered === 1
          ? `Misses ${missing[0]}.`
          : `Misses ${missing.join(' and ')}.`;
    const label = tier === 'best' ? 'Perfect Match' : tier === 'acceptable' ? 'Good Backup' : 'Risky';
    return { tier, label, reason, covered, rushed };
  }

  // The coach recommends the quickest perfect treatment, which keeps the lounge moving.
  function recommendedFor(guest) {
    if (!guest) return null;
    const pct = patiencePct(guest);
    return unlockedTreatments()
      .map(t => ({ t, read: evaluateTreatment(t, guest, pct) }))
      .filter(x => x.read.tier === 'best')
      .sort((a, b) => a.t.time - b.t.time)[0]?.t ?? null;
  }

  function completeTreatment(station, now = Date.now()) {
    const guest = station.guest;
    const treatment = station.treatment;
    const read = guest.treatmentRead ?? evaluateTreatment(treatment, guest);
    const perfect = read.tier === 'best';
    const acceptable = read.tier === 'acceptable';
    const mult = (perfect ? 1.4 : acceptable ? 1 : 0.5) * (guest.highRoller ? 3 : guest.vip ? 1.6 : 1);
    const earned = Math.round((treatment.cash * mult + session.spaLevel * 8) * (session.twist?.effects.cashMult ?? 1));
    const sat = perfect ? treatment.sat : acceptable ? Math.max(1, treatment.sat - 2) : 0;

    guest.status = 'done';
    session.treated++;
    session.earned += earned;
    session.satPoints += sat;
    if (perfect) session.perfect++;
    else if (acceptable) session.good++;
    else session.risky++;
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
    if (guest.highRoller) settleHighRoller(perfect ? true : acceptable ? null : false);

    station.guest = null;
    station.treatment = null;
    station.startedAt = 0;
    station.doneAt = 0;
    station.cleanUntil = now + CLEAN_MS;
  }

  // pleased: true = perfect (stays longer), false = botched (checks out), null = fine, no change
  function settleHighRoller(pleased) {
    if (!session) return;
    if (pleased === null) {
      session.highRollerResult = 'satisfied';
      log('🎰 The high roller was satisfied, but not wowed.', 'gold');
      return;
    }
    const result = HotelState.settleHighRollerService?.(pleased);
    session.highRollerResult = pleased ? 'pleased' : 'lost';
    const msg = pleased
      ? `🎰 The high roller loved it and will stay longer at the tables${result?.minutesLeft ? ` (${result.minutesLeft} min left)` : ''}.`
      : '🎰 The high roller checked out early. The casino\'s high-stakes table closes.';
    log(msg, pleased ? 'good' : 'bad');
    CasinoShell.toast(msg);
  }

  function tidyStation(id) {
    if (!session?.active) return;
    const station = id
      ? session.stations.find(s => s.id === id && s.cleanUntil)
      : session.stations.find(s => s.cleanUntil);
    if (!station) return;
    station.cleanUntil = 0;
    CasinoShell.sound.tone(640, 'triangle', 0.05, 0.12);
    updateAll();
  }

  function handleWalkout(guest) {
    guest.status = 'left';
    session.walkouts++;
    if (session.selectedGuestId === guest.id) session.selectedGuestId = null;
    ensureSelection();
    session.lastOutcome = {
      tone: 'bad',
      title: 'Guest Walked Out',
      body: `${guest.name} waited too long for ${guest.needs.map(n => need(n).wants.toLowerCase()).join(' and ')}.`,
    };
    log(`${guest.name} left before treatment.`, 'bad');
    CasinoShell.sound.lose();
    if (guest.highRoller) settleHighRoller(false);
  }

  function startTick() {
    clearInterval(tickTimer);
    tickTimer = setInterval(tick, 120);
  }

  function tick() {
    if (!session?.active) return;
    const now = Date.now();
    let boardChanged = false;

    waitingGuests().filter(g => now >= g.patienceEnd).forEach(guest => {
      handleWalkout(guest);
      boardChanged = true;
    });

    session.stations.forEach(station => {
      if (station.guest && now >= station.doneAt) {
        completeTreatment(station, now);
        boardChanged = true;
      } else if (station.cleanUntil && now >= station.cleanUntil) {
        station.cleanUntil = 0;
        boardChanged = true;
      }
    });

    if (now >= session.nextArrival) boardChanged = spawnGuest(now) || boardChanged;

    if (boardChanged) updateAll();
    else updateLiveMeters();

    if (now >= session.endsAt || session.treated + session.walkouts >= session.target) {
      finishSession();
    }
  }

  function finishSession() {
    if (!session?.active) return;
    clearInterval(tickTimer);

    // Guests still in a room finish now; anyone left in the lounge counts as a walkout.
    const now = Date.now();
    session.stations.filter(s => s.guest).forEach(s => completeTreatment(s, now));
    waitingGuests().forEach(g => {
      g.status = 'left';
      session.walkouts++;
      if (g.highRoller) settleHighRoller(false);
    });
    session.active = false;

    // Grade: perfect treatments, partial credit for good ones, walkouts count against
    const treatedWell = session.perfect + 0.6 * session.good + 0.15 * session.risky;
    const grade = window.HotelShiftBriefing?.finishRun?.('spa',
      100 * treatedWell / Math.max(1, session.treated + session.walkouts), $('spa-results'));
    const rewardMult = HotelState.shiftRewardMultiplier?.('spa') ?? 1;
    session.earned = Math.round(session.earned * rewardMult);
    const satBonus = Math.round(Math.max(0, Math.min(10, Math.round(session.satPoints / 2) - session.walkouts)) * rewardMult);
    HotelState.addHotelCash(session.earned);
    HotelState.addSatisfactionBonus(satBonus);
    HotelEngine.recalculateReputation(HotelState.get());
    HotelBridge.applyHotelToCasino(HotelState.get());
    HotelState.recordShiftResult?.('spa', {
      title: `Spa Rush complete${session.twist ? ` · ${session.twist.title}` : ''}`,
      cash: session.earned,
      satisfaction: satBonus,
      rewardMult,
      grade: grade?.letter,
      score: grade?.score,
      primaryLabel: 'Treated',
      primaryValue: session.treated,
      summary: `${session.treated} guests treated (${session.perfect} perfect), ${session.walkouts} walkouts.`,
      impact: 'Recovered satisfaction for premium guests.',
      metrics: [
        { label:'Perfect', value:session.perfect },
        { label:'Walkouts', value:session.walkouts },
      ],
    });
    CasinoShell.awardXp(Math.max(10, Math.round(session.earned / 5)));

    session.guests = [];
    session.selectedGuestId = null;
    session.stations.forEach(station => {
      station.guest = null;
      station.treatment = null;
      station.startedAt = 0;
      station.doneAt = 0;
      station.cleanUntil = 0;
    });
    $('start-spa-btn').disabled = false;
    $('start-spa-btn').innerHTML = '<i class="fa-solid fa-rotate-right"></i> Start Spa Rush Again';
    setReturnLink('Back to Hotel Lobby', 'fa-building');
    syncHotelCash();
    updateAll();
    setNextStep('Head back to the Hotel Lobby with the result, or start Spa Rush again.');
    showResults(satBonus);
    log(`Session complete. Hotel earned $${fmt(session.earned)}. Satisfaction +${satBonus}.`, 'gold');
    if (rewardMult < 1) log(`Repeat run this phase: ${Math.round(rewardMult * 100)}% rewards. Full rewards return next phase.`, 'bad');
    if (session.earned > 0) CasinoShell.celebrate(session.earned, { currency: 'hotel' });
    CasinoShell.toast(`Spa Rush complete: +$${fmt(session.earned)} hotel cash`);
  }

  /* ── Rendering ────────────────────────────────────────── */

  function renderIdle() {
    const spaLevel = HotelState.get().departments.spa?.level ?? 0;
    const tier = HotelConfig.UPGRADE_CATALOG.spa?.[Math.max(0, spaLevel - 1)];
    $('spa-tier-label').textContent = tier?.label ?? 'Spa not built';
    $('spa-target').textContent = 7 + Math.max(1, spaLevel) + (window.HotelShiftBriefing?.twistFor?.('spa')?.effects.extraGuests ?? 0);
    $('spa-time').textContent = '1:00';
    $('spa-session-fill').style.width = '0%';
    log(spaLevel > 0 ? 'Spa is ready for guests.' : 'Spa & Wellness is not built yet.', spaLevel > 0 ? 'gold' : 'bad', true);
    if (spaLevel > 0 && HotelState.highRollerInHouse?.()) log('🎰 A high roller is staying at the hotel. They\'ll book in during your next session.', 'gold');
    setReturnLink('Back to Hotel Lobby', 'fa-arrow-left');
    setNextStep(spaLevel > 0 ? 'Start Spa Rush to seat waiting guests.' : 'Build Spa & Wellness to unlock this shift.');
    updateStats();
  }

  function needChips(guest) {
    return guest.needs.map(id => {
      const n = need(id);
      return `<span class="need-chip"><i class="fa-solid ${n.icon}" aria-hidden="true"></i>${n.wants}</span>`;
    }).join('');
  }

  function renderLounge() {
    const wrap = $('spa-lounge');
    if (!wrap) return;
    const waiting = waitingGuests();
    const cards = waiting.map((guest, i) => {
      const pct = patiencePct(guest);
      const selected = guest.id === session.selectedGuestId;
      return `
        <button type="button" class="lounge-guest ${selected ? 'selected' : ''} ${guest.vip ? 'vip' : ''} ${guest.highRoller ? 'high-roller' : ''}" data-guest-id="${guest.id}"
                aria-pressed="${selected}" aria-label="${guest.name}, needs ${guest.needs.map(n => need(n).wants).join(' and ')}, patience ${pct}%">
          <span class="lounge-key" aria-hidden="true">${i + 1}</span>
          <span class="lounge-name">${guest.highRoller ? '🎰 ' : ''}${guest.name}${guest.vip && !guest.highRoller ? ' <em>VIP</em>' : ''}</span>
          <span class="lounge-needs">${guest.needs.map(n => `<i class="fa-solid ${need(n).icon}" title="${need(n).wants}"></i>`).join('')}</span>
          <span class="patience-track"><span class="patience-fill ${pctClass(pct)}" style="width:${pct}%"></span></span>
        </button>`;
    });
    for (let i = waiting.length; i < LOUNGE_SIZE; i++) {
      cards.push(`<div class="lounge-guest empty" aria-hidden="true">${session?.active && session.spawned < session.target ? 'Arriving…' : 'Empty'}</div>`);
    }
    wrap.innerHTML = cards.join('');
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
          <p>Guests arrive in the lounge with two needs each. Pick a guest, then a treatment that covers both.</p>
        </article>
      `;
      return;
    }
    if (!guest) {
      wrap.innerHTML = `
        <article class="active-guest-card idle">
          <span class="active-guest-label">Waiting</span>
          <strong>Lounge is empty</strong>
          <p>${session.spawned < session.target ? 'The next guest is on their way.' : 'Every guest has been seen. Rooms are finishing up.'}</p>
        </article>
      `;
      return;
    }

    const pct = patiencePct(guest);
    const rec = hintsOn() ? recommendedFor(guest) : null;
    wrap.innerHTML = `
      <article class="active-guest-card" data-active-guest-id="${guest.id}">
        <div class="active-guest-header">
          <div class="guest-avatar"><i class="fa-solid ${need(guest.needs[0]).icon}"></i></div>
          <div>
            <span class="active-guest-label">Active Guest</span>
            <strong>${guest.name}</strong>
            <p>${guest.needs.map(n => need(n).label).join(' · ')}</p>
          </div>
          ${guest.highRoller ? '<span class="guest-vip high-roller">High Roller</span>' : guest.vip ? '<span class="guest-vip">VIP</span>' : ''}
        </div>
        <div class="active-guest-needs">${needChips(guest)}</div>
        <div class="active-guest-read">
          <div><span>Needs</span><strong>2</strong></div>
          ${hintsOn()
            ? `<div><span>Best Treatment</span><strong>${rec ? rec.label : 'None covers both'}</strong></div>`
            : `<div><span>Pays</span><strong>${guest.highRoller ? 'High roller ×3' : guest.vip ? 'VIP ×1.6' : 'Standard'}</strong></div>`}
        </div>
        <div class="active-patience">
          <div class="active-patience-top">
            <span>Patience</span>
            <strong>${pct}%</strong>
          </div>
          <div class="patience-track">
            <div class="patience-fill ${pctClass(pct)}" style="width:${pct}%"></div>
          </div>
          <p class="rush-note" ${pct < RUSH_PCT ? '' : 'hidden'}>In a hurry: long treatments will annoy them.</p>
        </div>
      </article>
    `;
  }

  function renderStations() {
    const wrap = $('station-grid');
    if (!wrap) return;
    const stations = session?.stations ?? Array.from({ length: STATION_COUNT }, (_, i) => ({ id:`station_${i}` }));
    const live = !!session?.active;
    wrap.innerHTML = stations.map((station, i) => {
      const treatment = live ? station.treatment : null;
      const guest = live ? station.guest : null;
      const cleaning = live && !!station.cleanUntil;
      const pct = live ? stationPct(station) : 0;
      return `
        <article class="station-card ${guest ? 'busy' : cleaning ? 'cleaning' : 'idle'}" data-station-id="${station.id}">
          <div>
            <div class="station-icon"><i class="fa-solid ${treatment?.icon ?? (cleaning ? 'fa-broom' : 'fa-spa')}"></i></div>
            <div class="station-name">Room ${i + 1}</div>
            <div class="station-guest">${guest ? `${guest.name} · ${treatment.label}` : cleaning ? 'Resetting…' : 'Ready'}</div>
          </div>
          ${cleaning ? `<button type="button" class="station-tidy" data-tidy="${station.id}">Tidy now <kbd>C</kbd></button>` : ''}
          <div class="station-track"><div class="station-fill" style="width:${pct}%"></div></div>
        </article>
      `;
    }).join('');
  }

  function renderTreatments() {
    const wrap = $('treatment-bar');
    if (!wrap) return;
    const spaLevel = spaLevelNow();
    const guest = activeGuest();
    const hints = hintsOn();
    const pct = guest ? patiencePct(guest) : 100;
    const rec = hints ? recommendedFor(guest) : null;
    const roomReady = !session?.active || !!freeStation();
    wrap.innerHTML = TREATMENTS.map(t => {
      const unlocked = spaLevel >= t.level;
      // Training hint: rate each treatment for the active guest
      const read = hints && guest && unlocked ? evaluateTreatment(t, guest, pct) : null;
      const recommended = rec?.id === t.id;
      const alsoPerfect = !recommended && read?.tier === 'best';
      const acceptable = read?.tier === 'acceptable';
      const risky = read?.tier === 'risky';
      const disabled = !unlocked || !session?.active || !guest || !roomReady;
      const label = recommended
        ? 'Best Match'
        : alsoPerfect
          ? 'Also Perfect'
          : !guest && unlocked
            ? 'Waiting'
            : unlocked
              ? read?.label ?? `${t.time / 1000}s`
              : `Spa Lv ${t.level}`;
      const covers = hints
        ? `<span class="treatment-covers">${t.covers.length === NEEDS.length ? 'Covers everything' : t.covers.map(n => `<i class="fa-solid ${need(n).icon}" title="${need(n).wants}"></i>`).join('')}</span>`
        : '';
      const detail = !unlocked
        ? `Spa Lv ${t.level}`
        : read?.reason ?? `$${t.cash} · ${(t.time / 1000).toFixed(1)}s`;
      return `
        <button class="treatment-btn ${unlocked ? '' : 'locked'} ${t.time >= LONG_MS ? 'long' : ''} ${recommended ? 'best-match next-action' : alsoPerfect ? 'also-perfect' : acceptable ? 'good-backup' : risky ? 'risky-treatment' : ''}" type="button"
                data-treatment-id="${t.id}" ${disabled ? 'disabled' : ''}>
          <span class="treatment-step">${label}</span>
          <i class="fa-solid ${t.icon}"></i>
          <strong>${t.label} <kbd>${t.key.toUpperCase()}</kbd></strong>
          ${covers}
          <small>${detail}</small>
        </button>
      `;
    }).join('');
  }

  function showMenu() {
    const level = Math.max(1, spaLevelNow());
    const rows = TREATMENTS.map(t => {
      const open = t.level <= level;
      const covers = t.covers.length === NEEDS.length ? 'Every need' : t.covers.map(n => need(n).wants).join(' + ');
      return `<li class="${open ? '' : 'locked'}"><span><strong>${t.label}</strong> <small>${(t.time / 1000).toFixed(1)}s · $${t.cash}</small></span><span>${open ? covers : `Spa level ${t.level}`}</span></li>`;
    }).join('');
    CasinoShell.info('🧖 Treatment menu', `
      <p class="recipe-book-note">Cover both needs for a perfect match. Treatments of ${LONG_MS / 1000}s or more annoy a guest whose patience is under ${RUSH_PCT}%. Guests keep waiting while this is open.</p>
      <ul class="recipe-book spa-menu">${rows}</ul>`);
  }

  function updateAll() {
    ensureSelection();
    renderLounge();
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
    updateGuestMeters();
    updateStationMeters();
  }

  function updateGuestMeters() {
    waitingGuests().forEach(guest => {
      const pct = patiencePct(guest);
      document.querySelectorAll(`[data-guest-id="${guest.id}"] .patience-fill, [data-active-guest-id="${guest.id}"] .patience-fill`).forEach(fill => {
        fill.style.width = `${pct}%`;
        fill.className = `patience-fill ${pctClass(pct)}`;
      });
      const card = document.querySelector(`[data-active-guest-id="${guest.id}"]`);
      if (card) {
        const label = card.querySelector('.active-patience-top strong');
        if (label) label.textContent = `${pct}%`;
        const note = card.querySelector('.rush-note');
        if (note && note.hidden !== (pct >= RUSH_PCT)) {
          // Crossing the rush line changes the ratings, so redraw everything.
          updateAll();
        }
      }
    });
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
    const target = session?.target ?? 7 + Math.max(1, HotelState.get().departments.spa?.level ?? 1) + (window.HotelShiftBriefing?.twistFor?.('spa')?.effects.extraGuests ?? 0);
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
    $('spa-time').textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
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

  function updateNextStep() {
    if (!session?.active) return;
    const guest = activeGuest();
    if (!guest) {
      setNextStep(session.spawned < session.target
        ? 'The lounge is empty. The next guest is on their way.'
        : 'Every guest has been seen. Rooms are finishing up.');
      return;
    }
    if (!freeStation()) {
      setNextStep(session.stations.some(s => s.cleanUntil)
        ? 'No room is ready. Tidy a room (C) to open it now.'
        : 'All treatment rooms are busy. Wait for one to open.');
      return;
    }
    const wants = guest.needs.map(n => need(n).wants.toLowerCase()).join(' and ');
    const rec = hintsOn() ? recommendedFor(guest) : null;
    setNextStep(rec
      ? `Choose a treatment for ${guest.name}. Best match: ${rec.label}.`
      : `Choose a treatment for ${guest.name}, who wants ${wants}.`);
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

  function pctClass(pct) {
    return pct < 26 ? 'danger' : pct < 52 ? 'warn' : '';
  }

  function stationPct(station) {
    if (station?.guest) {
      const total = station.doneAt - station.startedAt;
      return Math.max(0, Math.min(100, Math.round(((Date.now() - station.startedAt) / total) * 100)));
    }
    if (station?.cleanUntil) {
      return Math.max(0, Math.min(100, Math.round(100 - ((station.cleanUntil - Date.now()) / CLEAN_MS) * 100)));
    }
    return 0;
  }

  function fmt(value) {
    return Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
  }

  return {
    init,
    TREATMENTS,
    NEEDS,
    // Test hooks: rate a treatment for a hypothetical guest, and peek at the live session.
    debugEvaluate: (treatmentId, needs, pct = 100) =>
      evaluateTreatment(TREATMENTS.find(t => t.id === treatmentId), { needs }, pct),
    debugSession: () => session,
  };
})();
