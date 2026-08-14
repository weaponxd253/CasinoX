/* ============================================================
   CHECK-IN RUSH — game.js
   Lobby department mini-game.
   Depends on: casino-shell.js, hotel-config.js, hotel-state.js,
               hotel-guest-pool.js
   ============================================================ */

const CheckInGame = (() => {

  /* ── Difficulty per lobby level ──────────────────────────── */
  const DIFFICULTY = {
    1: { guests:8,  duration:90, patience:1.00, label:'Reception Desk' },
    2: { guests:10, duration:85, patience:0.88, label:'Concierge Service' },
    3: { guests:12, duration:80, patience:0.76, label:'Luxury Reception' },
    4: { guests:14, duration:72, patience:0.64, label:'Five-Star Lobby' },
    5: { guests:16, duration:65, patience:0.52, label:'Grand Atrium' },
  };

  /* ── Base patience (ms) by guest type ────────────────────── */
  const BASE_PATIENCE = {
    budgetTraveler: 28000,
    tourist:        22000,
    gambler:        20000,
    businessGuest:  13000,
    vip:             9000,
    highRoller:      7000,
  };

  /* ── Cooldown storage kept for future pacing, but disabled for now. ── */
  const COOLDOWN_KEY = 'checkinGameCooldown';

  /* ── Game state ──────────────────────────────────────────── */
  let phase          = 'idle';     // idle|countdown|active|complete
  let guestQueue     = [];
  let activeGuest    = null;
  let selectedRoom   = null;
  let rooms          = [];
  let results        = [];
  let diff           = DIFFICULTY[1];
  let sessionMs      = 90_000;
  let sessionEnd     = 0;
  let patienceEnd    = 0;
  let patienceTotal  = 0;
  let staffEffect    = null;
  let raf            = null;
  let countdownVal   = 3;

  /* ── DOM refs ────────────────────────────────────────────── */
  const $ = id => document.getElementById(id);

  /* ────────────────────────────────────────────────────────────
     INIT
  ─────────────────────────────────────────────────────────── */
  function init() {
    CasinoShell.mount({
      name:     'Check-In Rush',
      subtitle: 'Lobby · Mini-Game',
      lobbyHref:'../../index.html',
    });

    HotelState.init();
    HotelGuestPool.init();
    window.HotelShiftBriefing?.mount?.('lobby');

    const lobbyLevel = HotelState.get().departments.lobby?.level ?? 1;
    diff = DIFFICULTY[Math.min(lobbyLevel, 5)];

    _renderDiffCard();
    _unlockStart();

    $('ci-start-btn').addEventListener('click', startCountdown);
    $('play-again-btn').addEventListener('click', () => {
      $('overlay-results').style.display = 'none';
      $('overlay-idle').style.display    = 'flex';
      _unlockStart();
    });
    $('ci-confirm-btn').addEventListener('click', confirmCheckIn);
  }

  /* ────────────────────────────────────────────────────────────
     ACCESS
  ─────────────────────────────────────────────────────────── */
  function _unlockStart() {
    try {
      localStorage.removeItem(COOLDOWN_KEY);
    } catch (err) {
      console.warn('Unable to clear check-in cooldown', err);
    }

    $('ci-start-btn').disabled = false;
    $('ci-cooldown').style.display = 'none';
  }

  /* ────────────────────────────────────────────────────────────
     COUNTDOWN  3–2–1
  ─────────────────────────────────────────────────────────── */
  function startCountdown() {
    phase = 'countdown';
    $('overlay-idle').style.display      = 'none';
    $('overlay-countdown').style.display = 'flex';
    countdownVal = 3;
    _tick();

    function _tick() {
      const el = $('countdown-num');
      el.textContent = countdownVal;
      el.classList.remove('pop');
      void el.offsetWidth;
      el.classList.add('pop');
      CasinoShell.sound.tone(440 + countdownVal * 80, 'sine', 0.12, 0.3);
      if (countdownVal > 1) {
        countdownVal--;
        setTimeout(_tick, 900);
      } else {
        setTimeout(startSession, 900);
      }
    }
  }

  /* ────────────────────────────────────────────────────────────
     SESSION START
  ─────────────────────────────────────────────────────────── */
  function startSession() {
    phase = 'active';
    window.HotelShiftBriefing?.start?.('lobby', 'Check-In Rush');
    $('overlay-countdown').style.display = 'none';
    $('ci-hud').style.display            = 'flex';
    $('ci-game-area').style.display      = 'grid';

    sessionMs  = diff.duration * 1000;
    sessionEnd = Date.now() + sessionMs;
    staffEffect = HotelState.getStaffEffect?.('lobby') ?? null;
    results    = [];
    rooms      = _generateRooms();
    guestQueue = _buildGuestQueue();

    _renderRoomList();
    setNextStep('Select the best matching room for the arriving guest.');
    _startRaf();
    nextGuest();
  }

  /* ────────────────────────────────────────────────────────────
     GUEST QUEUE
  ─────────────────────────────────────────────────────────── */
  function _buildGuestQueue() {
    const state = HotelState.get();
    const q = [];
    for (let i = 0; i < diff.guests; i++) {
      const g = HotelGuestPool.previewArrival(state);
      if (g) q.push(g);
    }
    return q;
  }

  function nextGuest() {
    selectedRoom = null;
    $('ci-confirm-btn').disabled = true;
    $('ci-confirm-btn').className = 'ci-confirm-btn';
    $('ci-confirm-btn').innerHTML = '<i class="fa-solid fa-key"></i> Select a room first';
    renderSelectionSummary(null);

    if (guestQueue.length === 0) {
      // All guests processed — end session
      setNextStep('All arrivals processed. Calculating results.');
      setTimeout(endSession, 800);
      return;
    }

    activeGuest  = guestQueue.shift();
    patienceTotal = (BASE_PATIENCE[activeGuest.type] ?? 20000) * diff.patience * (staffEffect?.patienceMult ?? 1);
    if (activeGuest.isReturning) patienceTotal *= 1.3;   // returning guests wait longer
    patienceEnd  = Date.now() + patienceTotal;

    _renderGuestCard(activeGuest);
    _highlightRooms();
    setNextStep(`Select the best matching room for ${activeGuest.name}.`);

    // Animate card in
    const slot = $('ci-guest-slot');
    slot.classList.remove('slide-in');
    void slot.offsetWidth;
    slot.classList.add('slide-in');
  }

  /* ────────────────────────────────────────────────────────────
     CONFIRM CHECK-IN
  ─────────────────────────────────────────────────────────── */
  function confirmCheckIn() {
    if (!activeGuest || !selectedRoom || phase !== 'active') return;

    const room   = rooms.find(r => r.id === selectedRoom);
    if (!room || room.occupied) return;

    const match  = _computeMatch(activeGuest, room);
    room.occupied = true;

    // Record result
    results.push({
      guest:    activeGuest,
      room,
      match,
      outcome:  'checked_in',
      income:   activeGuest.totalIncome,
    });

    // Commit to pool
    HotelGuestPool.commitGuest({ ...activeGuest, roomAssigned: room.number });

    if (typeof HotelState.addGuestToRoster === 'function') {
      HotelState.addGuestToRoster({
        id:           activeGuest.id,
        type:         activeGuest.type,
        name:         activeGuest.name,
        lastName:     activeGuest.lastName,
        flagEmoji:    activeGuest.flagEmoji,
        origin:       activeGuest.origin,
        roomAssigned: room.number,
        roomType:     room.type,
        partySize:    activeGuest.partySize ?? 1,
        preferences:  activeGuest.preferences ?? [],
        matchQuality: match.quality,
        isReturning:  activeGuest.isReturning,
        totalIncome:  activeGuest.totalIncome,
        incomePerMin: activeGuest.incomePerMin,
        source:       'checkin_game',
      });
    }

    // Sound & visual feedback
    if (match.quality === 'perfect') {
      CasinoShell.sound.win();
      _flashDesk('perfect');
    } else if (match.quality === 'good') {
      CasinoShell.sound.tone(660, 'sine', 0.12, 0.35);
      _flashDesk('good');
    } else {
      CasinoShell.sound.tone(440, 'sine', 0.08, 0.25);
      _flashDesk('ok');
    }

    _updateHUDCounters();
    nextGuest();
  }

  /* ────────────────────────────────────────────────────────────
     GUEST TIMEOUT
  ─────────────────────────────────────────────────────────── */
  function _handleTimeout() {
    if (!activeGuest || phase !== 'active') return;
    results.push({ guest: activeGuest, outcome: 'timeout', income: 0 });
    HotelGuestPool.dismissGuest(activeGuest.id);
    CasinoShell.sound.tone(200, 'sawtooth', 0.12, 0.5);
    _shakeDesk();
    _updateHUDCounters();
    nextGuest();
  }

  /* ────────────────────────────────────────────────────────────
     ROOM SELECTION
  ─────────────────────────────────────────────────────────── */
  function selectRoom(roomId) {
    if (phase !== 'active') return;
    const room = rooms.find(r => r.id === roomId);
    if (!room || room.occupied) return;

    const previousRoom = selectedRoom;
    selectedRoom = roomId;
    CasinoShell.sound.tone(660, 'sine', 0.05, 0.12);

    if (previousRoom) {
      const prevTile = document.querySelector(`.ci-room-tile[data-room-id="${previousRoom}"]`);
      if (prevTile) prevTile.classList.remove('selected');
    }
    const nextTile = document.querySelector(`.ci-room-tile[data-room-id="${roomId}"]`);
    if (nextTile) nextTile.classList.add('selected');

    const match = _computeMatch(activeGuest, room);
    renderSelectionSummary(room, match);
    setNextStep(`Confirm Room ${room.number} for ${activeGuest.name}. Match: ${_matchPlainLabel(match.quality)}.`);
    const btn   = $('ci-confirm-btn');
    btn.disabled = false;
    btn.innerHTML = match.quality === 'perfect'
      ? '<i class="fa-solid fa-star"></i> Perfect match — Check In!'
      : match.quality === 'good'
      ? '<i class="fa-solid fa-key"></i> Good match — Check In'
      : '<i class="fa-solid fa-key"></i> Assign Room & Check In';
    btn.className = `ci-confirm-btn match-${match.quality}`;
  }

  /* ────────────────────────────────────────────────────────────
     ROOM GENERATION
  ─────────────────────────────────────────────────────────── */
  function _generateRooms() {
    const { ROOM_TYPES } = HotelConfig;
    const level    = HotelState.get().departments.rooms?.level ?? 1;
    const avail    = Object.entries(ROOM_TYPES)
      .filter(([, rt]) => rt.reqRoomsLevel <= level)
      .map(([id]) => id);

    const count = 10 + level * 2;
    const roomList = [];

    for (let i = 0; i < count; i++) {
      const type     = avail[Math.floor(Math.random() * avail.length)];
      const floor    = Math.floor(Math.random() * 12) + 1;
      const features = [];
      if (floor >= 8)               features.push('high_floor');
      if (floor <= 3)               features.push('low_floor');
      if (Math.random() < 0.30)     features.push('view');
      if (Math.random() < 0.25)     features.push('quiet_room');
      if (Math.random() < 0.20)     features.push('near_elevator');
      if (Math.random() < 0.15)     features.push('large_bathroom');

      roomList.push({
        id:       `room_${i}`,
        number:   `${floor}${String((i % 10) + 1).padStart(2, '0')}`,
        type,
        label:    ROOM_TYPES[type].label,
        beds:     ROOM_TYPES[type].beds,
        floor,
        features,
        occupied: false,
      });
    }
    return roomList;
  }

  /* ────────────────────────────────────────────────────────────
     MATCH SCORING
  ─────────────────────────────────────────────────────────── */
  function _computeMatch(guest, room) {
    const { GUEST_ROOM_PREFS } = HotelConfig;
    const preferred  = GUEST_ROOM_PREFS[guest.type] ?? ['standard'];
    const typeRank   = preferred.indexOf(room.type);
    const isFirst    = typeRank === 0;
    const isOk       = typeRank >= 0;

    const guestPrefs  = guest.preferences ?? [];
    const matches     = guestPrefs.filter(p => (room.features ?? []).includes(p));
    const prefRate    = guestPrefs.length > 0 ? matches.length / guestPrefs.length : 1;

    let quality;
    if (isFirst && prefRate === 1)    quality = 'perfect';
    else if (isFirst && prefRate >= .5) quality = 'good';
    else if (isOk)                    quality = 'acceptable';
    else                              quality = 'wrong';

    if ((staffEffect?.qualityBonus ?? 0) >= 1 && quality === 'acceptable' && prefRate >= .5) {
      quality = 'good';
    }
    return { quality, typeRank, isFirst, isOk, matches, prefRate };
  }

  /* ────────────────────────────────────────────────────────────
     END SESSION + REWARD
  ─────────────────────────────────────────────────────────── */
  function endSession() {
    phase = 'complete';
    cancelAnimationFrame(raf);

    $('ci-hud').style.display       = 'none';
    $('ci-game-area').style.display = 'none';

    const checkedIn = results.filter(r => r.outcome === 'checked_in');
    const perfect   = results.filter(r => r.match?.quality === 'perfect');
    const missed    = results.filter(r => r.outcome === 'timeout');

    // Reward calculation
    const baseCashBonus = checkedIn.reduce((s, r) =>
      s + Math.round((r.room?.label?.startsWith('Presidential') ? 350 : r.income * 0.25)), 0);
    const cashBonus   = Math.round(baseCashBonus * (staffEffect?.incomeMult ?? 1));
    const matchRate   = checkedIn.length > 0 ? perfect.length / checkedIn.length : 0;
    const satBoost    = Math.round(matchRate * 18) + (checkedIn.length ? (staffEffect?.satisfactionBonus ?? 0) : 0);
    const total        = results.length;
    const pct          = total > 0 ? Math.round((checkedIn.length / total) * 100) : 0;
    const grade        = pct >= 90 ? '★★★ Exceptional!' : pct >= 70 ? '★★ Good Work' : pct >= 50 ? '★ Decent' : 'Keep Practising';

    // Apply rewards to hotel state
    if (cashBonus > 0) HotelState.addHotelCash(cashBonus);
    if (satBoost  > 0) {
      const state = HotelState.get();
      const newSat = Math.min(100, state.satisfaction.current + satBoost);
      HotelState.setSatisfaction(newSat);
    }

    if (checkedIn.length > 0 && typeof HotelState.applyCheckInBoost === 'function') {
      HotelState.applyCheckInBoost(checkedIn.length);
    }
    if (checkedIn.length > 0 && HotelState.isGuidedOnboardingActive?.()) {
      HotelState.advanceGuidedOnboarding?.('run_checkin');
    }
    HotelState.applyStaffFatigue?.('lobby', checkedIn.length ? 3 : 1);
    HotelState.recordShiftResult?.('lobby', {
      title: 'Check-In Rush complete',
      cash: cashBonus,
      satisfaction: satBoost,
      primaryLabel: 'Checked In',
      primaryValue: checkedIn.length,
      summary: `${checkedIn.length} guests checked in, ${perfect.length} perfect matches, ${missed.length} walked out.`,
      impact: 'Filled rooms and boosted arrival momentum.',
      metrics: [
        { label:'Perfect', value:perfect.length },
        { label:'Walkouts', value:missed.length },
        { label:'Success', value:`${pct}%` },
      ],
    });

    $('results-headline').textContent = `Check-In Complete - ${grade}`;

    $('results-grid').innerHTML = `
      <div class="res-stat">
        <span class="res-num win">${checkedIn.length}</span>
        <span class="res-lbl">Checked In</span>
      </div>
      <div class="res-stat">
        <span class="res-num gold">${perfect.length}</span>
        <span class="res-lbl">Perfect Match</span>
      </div>
      <div class="res-stat">
        <span class="res-num loss">${missed.length}</span>
        <span class="res-lbl">Walked Out</span>
      </div>
      <div class="res-stat">
        <span class="res-num">${pct}%</span>
        <span class="res-lbl">Success Rate</span>
      </div>`;

    $('results-reward').innerHTML = `
      <div class="reward-row">
        <i class="fa-solid fa-building"></i>
        <span>Hotel Cash Bonus</span>
        <strong>+$${cashBonus.toLocaleString()}</strong>
      </div>
      ${satBoost > 0 ? `
      <div class="reward-row">
        <i class="fa-solid fa-face-smile"></i>
        <span>Satisfaction Boost</span>
        <strong>+${satBoost}%</strong>
      </div>` : ''}
      ${staffEffect?.assignedCount ? `
      <div class="reward-row">
        <i class="fa-solid fa-user-tie"></i>
        <span>Front Desk Coverage</span>
        <strong>${staffEffect.score}% · ${staffEffect.label}</strong>
      </div>` : ''}
      `;

    if (pct >= 70) CasinoShell.celebrate(cashBonus);

    $('overlay-results').style.display = 'flex';
  }

  /* ────────────────────────────────────────────────────────────
     RAF LOOP  (HUD timer + patience bar)
  ─────────────────────────────────────────────────────────── */
  function _startRaf() {
    function loop() {
      if (phase !== 'active') return;
      const now = Date.now();

      // Session timer
      const secLeft = Math.max(0, Math.ceil((sessionEnd - now) / 1000));
      const m = Math.floor(secLeft / 60);
      const s = String(secLeft % 60).padStart(2, '0');
      $('hud-timer').textContent = `${m}:${s}`;
      $('hud-timer').classList.toggle('urgent', secLeft <= 15);

      // Session progress bar
      const pct = Math.max(0, (sessionEnd - now) / sessionMs * 100);
      $('hud-progress').style.width = pct + '%';

      // Patience bar
      if (activeGuest) {
        const pPct = Math.max(0, (patienceEnd - now) / patienceTotal * 100);
        const fill  = $('ci-patience-fill');
        fill.style.width = pPct + '%';
        fill.className   = 'ci-patience-fill ' + (
          pPct > 60 ? 'p-ok' : pPct > 30 ? 'p-warn' : 'p-danger'
        );

        if (now >= patienceEnd) _handleTimeout();
      }

      // Session end
      if (now >= sessionEnd) { endSession(); return; }

      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);
  }

  /* ────────────────────────────────────────────────────────────
     RENDER — GUEST CARD
  ─────────────────────────────────────────────────────────── */
  function _renderGuestCard(guest) {
    const card = HotelGuestPool.guestCardData(guest);
    if (!card) return;

    const prefsHtml = (card.preferences ?? []).map(p =>
      `<span class="ci-pref-tag">${p}</span>`
    ).join('');

    const reqHtml = card.specialRequest
      ? `<div class="ci-special-req">✦ ${card.specialRequest}</div>`
      : '';

    const returningBadge = card.isReturning
      ? `<span class="ci-returning">↩ Returning Guest</span>` : '';

    $('ci-guest-slot').innerHTML = `
      <div class="ci-guest-card">
        <div class="ci-card-top">
          <div class="ci-photo-wrap">
            ${card.photo
              ? `<img src="${card.photo}" alt="${card.name}" class="ci-photo"
                      onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
              : ''}
            <div class="ci-photo-init" ${card.photo ? 'style="display:none"' : ''}>
              ${(card.name?.[0] ?? '?')}${(card.lastName?.[0] ?? '')}
            </div>
          </div>
          <div class="ci-card-identity">
            <div class="ci-guest-name">
              ${card.name}
              <span class="ci-flag">${card.flagEmoji}</span>
              ${returningBadge}
            </div>
            <div class="ci-guest-sub">${card.typeIcon} ${card.typeLabel} · Age ${card.age}</div>
            <div class="ci-guest-from">${card.origin}</div>
          </div>
        </div>
        <div class="ci-card-divider"></div>
        <div class="ci-card-request">
          <div class="ci-req-row">
            <i class="fa-solid fa-bed"></i>
            <span class="ci-req-label">Wants</span>
            <strong>${card.roomTypeLabel}</strong>
            · ${card.partySizeLabel}
          </div>
          <div class="ci-req-row">
            <i class="fa-solid fa-list"></i>
            <span class="ci-req-label">Prefers</span>
            <div class="ci-prefs">${prefsHtml || '<span style="opacity:.5">No preference</span>'}</div>
          </div>
          <div class="ci-req-row">
            <i class="fa-solid fa-moon"></i>
            <span class="ci-req-label">Stay</span>
            <strong>${card.durationLabel}</strong>
            · $${card.totalIncome.toLocaleString()} total
          </div>
          ${reqHtml}
        </div>
      </div>`;
  }

  /* ────────────────────────────────────────────────────────────
     RENDER — ROOM LIST
  ─────────────────────────────────────────────────────────── */
  function _renderRoomList() {
    const avail = rooms.filter(r => !r.occupied).length;
    $('room-count').textContent = `(${avail} available)`;
    const bestQuality = activeGuest ? _bestRoomQuality(activeGuest) : null;

    $('ci-room-list').innerHTML = rooms.map(room => {
      if (room.occupied) {
        return `<div class="ci-room-tile occupied">
          <span class="room-num">${room.number}</span>
          <span class="room-type">${room.label}</span>
          <span class="room-status">Occupied</span>
        </div>`;
      }

      const match    = activeGuest ? _computeMatch(activeGuest, room) : null;
      const isSelected = selectedRoom === room.id;
      const qualClass  = match ? `match-${match.quality}` : '';
      const bestClass = match && match.quality === bestQuality ? 'best-choice' : '';
      const featHtml   = room.features.slice(0, 2).map(f =>
        `<span class="room-feat">${_prefShort(f)}</span>`
      ).join('');

      return `<div class="ci-room-tile ${qualClass} ${bestClass} ${isSelected ? 'selected' : ''}"
                   data-room-id="${room.id}" onclick="CheckInGame.selectRoom('${room.id}')">
        <div class="room-tile-top">
          <span class="room-num">${room.number}</span>
          ${match ? `<span class="match-badge match-${match.quality}">${_matchLabel(match.quality)}</span>` : ''}
        </div>
        <div class="room-tile-body">
          <span class="room-type">${room.label}</span>
          <span class="room-beds">${room.beds}</span>
        </div>
        <div class="room-feats">${featHtml}</div>
      </div>`;
    }).join('');
  }

  function _highlightRooms() {
    // Re-render with fresh match highlights for the new active guest
    _renderRoomList();
  }

  /* ────────────────────────────────────────────────────────────
     RENDER — DIFFICULTY CARD
  ─────────────────────────────────────────────────────────── */
  function _renderDiffCard() {
    const lobbyLevel = HotelState.get().departments.lobby?.level ?? 1;
    $('diff-card').innerHTML = `
      <div class="diff-level">${diff.label}</div>
      <div class="diff-stats">
        <span>👥 ${diff.guests} guests</span>
        <span>⏱ ${diff.duration}s</span>
        <span>🏨 Lobby Lv ${lobbyLevel}</span>
        ${HotelState.getStaffEffect?.('lobby')?.assignedCount ? `<span>👔 Staff ${HotelState.getStaffEffect('lobby').score}%</span>` : ''}
      </div>`;
  }

  /* ────────────────────────────────────────────────────────────
     HUD COUNTERS
  ─────────────────────────────────────────────────────────── */
  function _updateHUDCounters() {
    $('stat-in').textContent      = results.filter(r => r.outcome === 'checked_in').length;
    $('stat-miss').textContent    = results.filter(r => r.outcome === 'timeout').length;
    $('stat-perfect').textContent = results.filter(r => r.match?.quality === 'perfect').length;
  }

  function renderSelectionSummary(room, match = null) {
    const el = $('ci-selected-room-summary');
    if (!el) return;
    if (!room || !match) {
      el.hidden = true;
      el.innerHTML = '';
      return;
    }
    el.hidden = false;
    el.innerHTML = `
      <span>Selected Room</span>
      <strong>${room.number} · ${room.label}</strong>
      <small>${_matchPlainLabel(match.quality)} match for ${activeGuest?.name ?? 'guest'}.</small>
    `;
  }

  function setNextStep(message) {
    const el = $('ci-next-step');
    if (!el) return;
    el.querySelector('strong').textContent = message;
  }

  /* ────────────────────────────────────────────────────────────
     VISUAL FEEDBACK
  ─────────────────────────────────────────────────────────── */
  function _flashDesk(type) {
    const desk = $('ci-guest-slot');
    desk.classList.remove('flash-perfect', 'flash-good', 'flash-ok');
    void desk.offsetWidth;
    desk.classList.add(`flash-${type}`);
    setTimeout(() => desk.classList.remove(`flash-${type}`), 600);
  }

  function _shakeDesk() {
    const desk = $('ci-guest-slot');
    desk.classList.remove('shake');
    void desk.offsetWidth;
    desk.classList.add('shake');
    setTimeout(() => desk.classList.remove('shake'), 500);
  }

  /* ────────────────────────────────────────────────────────────
     LABEL HELPERS
  ─────────────────────────────────────────────────────────── */
  function _matchLabel(q) {
    return { perfect:'✦ Perfect', good:'✓ Good', acceptable:'~ Ok', wrong:'✗ Wrong' }[q] ?? q;
  }

  function _matchPlainLabel(q) {
    return { perfect:'Perfect', good:'Good', acceptable:'Okay', wrong:'Poor' }[q] ?? q;
  }

  function _bestRoomQuality(guest) {
    const rank = { perfect: 4, good: 3, acceptable: 2, wrong: 1 };
    let best = null;
    let bestRank = 0;
    rooms.filter(room => !room.occupied).forEach(room => {
      const quality = _computeMatch(guest, room).quality;
      const value = rank[quality] ?? 0;
      if (value > bestRank) {
        bestRank = value;
        best = quality;
      }
    });
    return best;
  }

  function _prefShort(p) {
    return {
      quiet_room:     '🤫 Quiet',
      high_floor:     '🏙 High flr',
      low_floor:      '📍 Low flr',
      near_elevator:  '🛗 Elevator',
      view:           '🌅 View',
      large_bathroom: '🛁 Big bath',
    }[p] ?? p;
  }

  /* ── Public surface ── */
  return { init, selectRoom };

})();

document.addEventListener('DOMContentLoaded', () => CheckInGame.init());
