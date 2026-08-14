/* ============================================================
   HOTEL ROOMS - FLOOR OPS
   ------------------------------------------------------------
   Dispatch staff to housekeeping, room service, and guest issues.
   The skill is prioritization: match request urgency to staff specialty.
   ============================================================ */

const RoomsGame = (() => {
  const SHIFT_MS = 70_000;
  const ROOM_COUNT = 12;
  const MAX_ACTIVE_REQUESTS = 5;

  const STAFF = [
    { id:'housekeeper', label:'Housekeeping', icon:'fa-broom', specialty:['housekeeping','turndown','spill'], speed:1.0 },
    { id:'runner', label:'Runner', icon:'fa-person-running', specialty:['tray','minibar','towels'], speed:0.82 },
    { id:'engineer', label:'Engineer', icon:'fa-screwdriver-wrench', specialty:['maintenance','noise'], speed:1.12 },
  ];

  const REQUESTS = [
    { id:'tray', label:'Room Service Tray', icon:'fa-utensils', need:'runner', type:'tray', patience:15000, duration:4300, cash:48, sat:1, risk:'tip' },
    { id:'towels', label:'Fresh Towels', icon:'fa-soap', need:'runner', type:'towels', patience:17000, duration:3600, cash:24, sat:2, risk:'comfort' },
    { id:'housekeeping', label:'Housekeeping Reset', icon:'fa-broom', need:'housekeeper', type:'housekeeping', patience:19000, duration:5200, cash:36, sat:2, risk:'room quality' },
    { id:'turndown', label:'VIP Turndown', icon:'fa-champagne-glasses', need:'housekeeper', type:'turndown', patience:13500, duration:5900, cash:72, sat:3, risk:'VIP mood', vip:true },
    { id:'spill', label:'Spill Cleanup', icon:'fa-droplet', need:'housekeeper', type:'spill', patience:12000, duration:4100, cash:28, sat:2, risk:'complaint' },
    { id:'noise', label:'Noise Complaint', icon:'fa-volume-xmark', need:'engineer', type:'noise', patience:10500, duration:3900, cash:18, sat:3, risk:'walkout' },
    { id:'maintenance', label:'Leaky Fixture', icon:'fa-wrench', need:'engineer', type:'maintenance', patience:14500, duration:6100, cash:52, sat:2, risk:'room downtime' },
    { id:'minibar', label:'Minibar Restock', icon:'fa-wine-bottle', need:'runner', type:'minibar', patience:16000, duration:4600, cash:56, sat:1, risk:'lost sale' },
  ];

  const NAMES = ['Vale', 'Park', 'Wynn', 'Cross', 'Sol', 'Reed', 'Stone', 'Marin', 'Kade', 'Lux'];

  let shift = null;
  let timer = null;

  const $ = id => document.getElementById(id);

  function init() {
    syncHotelCash();
    window.HotelShiftBriefing?.mount?.('rooms');
    renderIdle();
    renderRooms();
    renderStaff();

    $('start-ops-btn')?.addEventListener('click', startShift);
    $('room-grid')?.addEventListener('click', e => {
      const card = e.target.closest('[data-request-id]');
      if (!card || card.classList.contains('empty') || card.classList.contains('busy')) return;
      selectRequest(card.dataset.requestId);
    });
    $('staff-grid')?.addEventListener('click', e => {
      const card = e.target.closest('[data-staff-id]');
      if (!card || card.classList.contains('busy')) return;
      assignStaff(card.dataset.staffId);
    });
  }

  function startShift() {
    const roomsLevel = HotelState.get().departments.rooms?.level ?? 1;
    if (roomsLevel <= 0) {
      log('Build Guest Rooms before opening Floor Ops.', 'bad', true);
      CasinoShell.toast('Build Guest Rooms first.');
      return;
    }

    window.HotelShiftBriefing?.start?.('rooms', 'Floor Ops');
    const now = Date.now();
    shift = {
      active: true,
      roomsLevel,
      staffEffect: HotelState.getStaffEffect?.('rooms') ?? null,
      startedAt: now,
      endsAt: now + SHIFT_MS,
      target: 8 + roomsLevel * 2,
      rooms: buildRooms(roomsLevel),
      staff: STAFF.map(s => ({ ...s, request:null, doneAt:0, startedAt:0 })),
      selectedRequestId: null,
      spawned: 0,
      resolved: 0,
      complaints: 0,
      perfect: 0,
      earned: 0,
      satPoints: 0,
    };

    $('start-ops-btn').disabled = true;
    $('start-ops-btn').innerHTML = '<i class="fa-solid fa-spinner"></i> On Shift';
    setReturnLink('Back to Hotel', 'fa-arrow-left');
    setNextStep('Pick a room request, then assign the best staff match.');
    hideResults();
    clearLog();
    log(`Floor Ops opened. Room staff coverage: ${shift.staffEffect?.score ?? 0}% ${shift.staffEffect?.label ?? 'Short'}.`, 'gold');
    spawnRequests(3);
    ensureSelection();
    updateAll();
    startTimer();
  }

  function buildRooms(level) {
    const count = Math.min(ROOM_COUNT, 8 + level);
    return Array.from({ length: count }, (_, i) => {
      const floor = 2 + Math.floor(i / 4);
      const room = `${floor}${String((i % 4) + 1).padStart(2, '0')}`;
      return { id:`room_${i}`, number: room, request:null };
    });
  }

  function makeRequest(room) {
    const options = REQUESTS.filter(r => !r.vip || shift.roomsLevel >= 3 || Math.random() < 0.16);
    const template = options[Math.floor(Math.random() * options.length)];
    const now = Date.now();
    const patience = Math.round(template.patience * Math.max(0.78, 1.06 - shift.roomsLevel * 0.035) * (shift.staffEffect?.patienceMult ?? 1));
    return {
      ...template,
      requestId: `req_${shift.spawned}_${now}_${room.id}`,
      roomId: room.id,
      roomNumber: room.number,
      guestName: `${NAMES[Math.floor(Math.random() * NAMES.length)]} ${template.vip ? 'Suite' : 'Room'}`,
      arrivedAt: now,
      patience,
      patienceEnd: now + patience,
      status: 'waiting',
    };
  }

  function spawnRequests(minimum = 1) {
    if (!shift?.active) return;
    const activeCount = shift.rooms.filter(room => room.request && room.request.status !== 'done').length;
    const openRooms = shift.rooms.filter(room => !room.request);
    const canSpawn = Math.min(
      openRooms.length,
      shift.target - shift.spawned,
      Math.max(minimum, MAX_ACTIVE_REQUESTS - activeCount)
    );
    for (let i = 0; i < canSpawn; i++) {
      const room = openRooms.splice(Math.floor(Math.random() * openRooms.length), 1)[0];
      room.request = makeRequest(room);
      shift.spawned++;
    }
  }

  function selectRequest(requestId) {
    if (!shift?.active) return;
    const request = findRequest(requestId);
    if (!request || request.status !== 'waiting') return;
    shift.selectedRequestId = requestId;
    renderRooms();
    renderStaff();
    renderSelectedBrief();
  }

  function assignStaff(staffId) {
    if (!shift?.active) return;
    ensureSelection();
    const staff = shift.staff.find(s => s.id === staffId);
    const request = findRequest(shift.selectedRequestId);
    if (!staff || staff.request || !request || request.status !== 'waiting') return;

    const now = Date.now();
    const match = staff.id === request.need || staff.specialty.includes(request.type);
    const slowPenalty = match ? 1 : 1.38;
    request.status = 'assigned';
    request.staffId = staff.id;
    request.matched = match;
    staff.request = request;
    staff.startedAt = now;
    staff.doneAt = now + Math.round(request.duration * staff.speed * slowPenalty * (shift.staffEffect?.speedMult ?? 1));
    shift.selectedRequestId = null;
    ensureSelection();
    CasinoShell.sound.tone(match ? 660 : 420, 'sine', 0.08, 0.2);
    renderStaff();
    renderRooms();
    renderSelectedBrief();
  }

  function startTimer() {
    clearInterval(timer);
    timer = setInterval(() => {
      if (!shift?.active) return;
      const now = Date.now();

      shift.rooms.forEach(room => {
        const request = room.request;
        if (request?.status === 'waiting' && now >= request.patienceEnd) {
          request.status = 'complaint';
          shift.complaints++;
          if (shift.selectedRequestId === request.requestId) shift.selectedRequestId = null;
          log(`Room ${request.roomNumber} escalated: ${request.label}.`, 'bad');
          CasinoShell.sound.lose();
        }
      });

      shift.staff
        .filter(staff => staff.request && now >= staff.doneAt)
        .forEach(completeRequest);

      cleanupCompletedRooms();
      spawnRequests(1);
      ensureSelection();
      updateAll();

      if (now >= shift.endsAt || shift.resolved + shift.complaints >= shift.target) {
        finishShift();
      }
    }, 120);
  }

  function completeRequest(staff) {
    const request = staff.request;
    const patienceLeft = Math.max(0, (request.patienceEnd - Date.now()) / request.patience);
    const fast = patienceLeft > 0.45;
    const perfect = request.matched && fast;
    const earned = Math.round((request.cash + shift.roomsLevel * 7 + (perfect ? request.cash * 0.55 : request.matched ? request.cash * 0.18 : 0)) * (shift.staffEffect?.incomeMult ?? 1));
    const sat = perfect ? request.sat : request.matched ? Math.max(1, request.sat - 1) : 0;

    request.status = 'done';
    request.completedAt = Date.now();
    shift.resolved++;
    shift.earned += earned;
    shift.satPoints += sat;
    if (perfect) shift.perfect++;

    log(
      perfect
        ? `${staff.label} nailed Room ${request.roomNumber}: ${request.label}. +$${earned}`
        : `${staff.label} handled Room ${request.roomNumber}. +$${earned}`,
      perfect ? 'good' : 'gold'
    );
    CasinoShell.sound.tone(perfect ? 760 : 540, 'sine', 0.11, 0.22);

    staff.request = null;
    staff.startedAt = 0;
    staff.doneAt = 0;
  }

  function cleanupCompletedRooms() {
    const now = Date.now();
    shift.rooms.forEach(room => {
      if (!room.request) return;
      if (room.request.status === 'done' && now - room.request.completedAt > 700) room.request = null;
      if (room.request?.status === 'complaint' && now - room.request.patienceEnd > 850) room.request = null;
    });
  }

  function finishShift() {
    if (!shift?.active) return;
    clearInterval(timer);
    shift.active = false;

    const satBonus = Math.max(0, Math.min(9, Math.round(shift.satPoints / 3) - shift.complaints + (shift.staffEffect?.satisfactionBonus ?? 0)));
    HotelState.addHotelCash(shift.earned);
    HotelState.setSatisfaction(HotelState.getSatisfaction() + satBonus);
    HotelState.applyStaffFatigue?.('rooms', shift.resolved ? 4 : 1);
    HotelEngine.recalculateReputation(HotelState.get());
    HotelBridge.applyHotelToCasino(HotelState.get());
    HotelState.recordShiftResult?.('rooms', {
      title: 'Floor Ops complete',
      cash: shift.earned,
      satisfaction: satBonus,
      primaryLabel: 'Resolved',
      primaryValue: shift.resolved,
      summary: `${shift.resolved} requests resolved, ${shift.complaints} complaints, ${shift.perfect} perfect dispatches.`,
      impact: 'Protected guest satisfaction and room quality.',
      metrics: [
        { label:'Complaints', value:shift.complaints },
        { label:'Perfect', value:shift.perfect },
        { label:'Coverage', value:`${shift.staffEffect?.score ?? 0}%` },
      ],
    });
    CasinoShell.awardXp(Math.max(10, Math.round(shift.earned / 5)));

    $('start-ops-btn').disabled = false;
    $('start-ops-btn').innerHTML = '<i class="fa-solid fa-rotate-right"></i> Run Floor Ops Again';
    setReturnLink('Return to Hotel', 'fa-building');
    setNextStep('Return to Hotel with the result, or run Floor Ops again.');
    syncHotelCash();
    updateAll();
    showResults(satBonus);
    log(`Shift complete. Hotel earned $${fmt(shift.earned)}. Satisfaction +${satBonus}.`, 'gold');
    if (shift.earned > 0) CasinoShell.celebrate(shift.earned);
    CasinoShell.toast(`Floor Ops complete: +$${fmt(shift.earned)} hotel cash`);
  }

  function ensureSelection() {
    if (!shift?.active) return;
    const current = findRequest(shift.selectedRequestId);
    if (current?.status === 'waiting') return;
    shift.selectedRequestId = shift.rooms.find(room => room.request?.status === 'waiting')?.request.requestId ?? null;
  }

  function findRequest(requestId) {
    if (!requestId || !shift) return null;
    return shift.rooms.map(room => room.request).find(request => request?.requestId === requestId) ?? null;
  }

  function renderIdle() {
    const roomsLevel = HotelState.get().departments.rooms?.level ?? 1;
    const tier = HotelConfig.UPGRADE_CATALOG.rooms?.[Math.max(0, roomsLevel - 1)];
    $('rooms-tier-label').textContent = tier?.label ?? 'Guest Rooms';
    $('ops-target').textContent = 8 + roomsLevel * 2;
    $('ops-time').textContent = '1:10';
    $('ops-session-fill').style.width = '0%';
    log('Guest Rooms are ready for Floor Ops.', 'gold', true);
    setReturnLink('Back to Hotel', 'fa-arrow-left');
    setNextStep('Start Floor Ops to open room requests.');
    updateStats();
    renderSelectedBrief();
  }

  function renderRooms() {
    const wrap = $('room-grid');
    if (!wrap) return;
    const rooms = shift?.rooms ?? buildPreviewRooms();
    wrap.innerHTML = rooms.map(room => {
      const request = room.request;
      if (!request) {
        return `
          <article class="room-tile empty">
            <span class="room-number">${room.number}</span>
            <strong>Clear</strong>
          </article>
        `;
      }
      const selected = shift?.selectedRequestId === request.requestId ? 'selected' : '';
      const status = request.status;
      const pct = patiencePct(request);
      return `
        <article class="room-tile ${selected} ${status}" data-request-id="${request.requestId}">
          <div class="room-top">
            <span class="room-number">${request.roomNumber}</span>
            <i class="fa-solid ${request.icon}"></i>
          </div>
          <strong>${request.label}</strong>
          <span class="room-risk">${request.risk}</span>
          <div class="patience-track">
            <div class="patience-fill ${pct < 25 ? 'danger' : pct < 50 ? 'warn' : ''}" style="width:${pct}%"></div>
          </div>
        </article>
      `;
    }).join('');
  }

  function buildPreviewRooms() {
    const level = HotelState.get().departments.rooms?.level ?? 1;
    return buildRooms(level);
  }

  function renderStaff() {
    const wrap = $('staff-grid');
    if (!wrap) return;
    const staff = shift?.staff ?? STAFF.map(s => ({ ...s, request:null, doneAt:0, startedAt:0 }));
    const request = findRequest(shift?.selectedRequestId);
    wrap.innerHTML = staff.map(member => {
      const busy = !!member.request;
      const recommended = !!request && !busy && shift?.active && (member.id === request.need || member.specialty.includes(request.type));
      const pct = staffPct(member);
      return `
        <button class="staff-card ${busy ? 'busy' : ''} ${recommended ? 'recommended' : ''}" type="button" data-staff-id="${member.id}" ${busy || !shift?.active ? 'disabled' : ''}>
          <i class="fa-solid ${member.icon}"></i>
          <span>${member.label}</span>
          <strong>${busy ? `Room ${member.request.roomNumber}` : 'Available'}</strong>
          ${recommended ? '<small class="staff-fit-label">Best Fit</small>' : ''}
          <div class="staff-track"><div class="staff-fill" style="width:${pct}%"></div></div>
        </button>
      `;
    }).join('');
  }

  function renderSelectedBrief() {
    const wrap = $('selected-brief');
    if (!wrap) return;
    const request = findRequest(shift?.selectedRequestId);
    if (!request) {
      wrap.innerHTML = `
        <span>Selected Request</span>
        <strong>No request selected</strong>
        <p>Pick an active room request, then assign the best available staff member.</p>
      `;
      setNextStep(shift?.active ? 'Pick an active room request, then assign staff.' : 'Start Floor Ops to open room requests.');
      return;
    }
    const staff = STAFF.find(member => member.id === request.need);
    wrap.innerHTML = `
      <span>Selected Request</span>
      <strong>Room ${request.roomNumber}: ${request.label}</strong>
      <p>${request.guestName} needs ${request.risk} handled. Best staff: ${staff?.label ?? 'Any staff'}.</p>
    `;
    setNextStep(`Assign ${staff?.label ?? 'available staff'} to Room ${request.roomNumber}.`);
  }

  function updateAll() {
    renderRooms();
    renderStaff();
    renderSelectedBrief();
    updateStats();
    updateSessionMeter();
  }

  function updateStats() {
    const resolved = shift?.resolved ?? 0;
    const target = shift?.target ?? 10;
    const earned = shift?.earned ?? 0;
    const perfect = shift?.perfect ?? 0;
    const complaints = shift?.complaints ?? 0;
    const satPreview = Math.max(0, Math.min(9, Math.round((shift?.satPoints ?? 0) / 3) - complaints));
    $('ops-resolved').textContent = resolved;
    $('ops-target').textContent = target;
    $('ops-earned').textContent = fmt(earned);
    $('ops-perfect').textContent = perfect;
    $('ops-complaints').textContent = complaints;
    $('ops-sat-preview').textContent = satPreview;
    $('ops-boost-fill').style.width = `${Math.min(100, satPreview * 12)}%`;
  }

  function updateSessionMeter() {
    if (!shift?.active) return;
    const remaining = Math.max(0, shift.endsAt - Date.now());
    const seconds = Math.ceil(remaining / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    $('ops-time').textContent = `${mins}:${String(secs).padStart(2, '0')}`;
    $('ops-session-fill').style.width = `${Math.max(0, 100 - (remaining / SHIFT_MS) * 100)}%`;
  }

  function showResults(satBonus) {
    $('result-cash').textContent = fmt(shift.earned);
    $('result-resolved').textContent = shift.resolved;
    $('result-complaints').textContent = shift.complaints;
    $('result-sat').textContent = satBonus;
    const panel = $('ops-results');
    panel.hidden = false;
    panel.classList.remove('pop');
    void panel.offsetWidth;
    panel.classList.add('pop');
  }

  function hideResults() {
    const panel = $('ops-results');
    if (panel) panel.hidden = true;
  }

  function patiencePct(request) {
    if (!shift?.active || !request || request.status !== 'waiting') return request?.status === 'assigned' ? 100 : 0;
    return Math.max(0, Math.round(((request.patienceEnd - Date.now()) / request.patience) * 100));
  }

  function staffPct(staff) {
    if (!staff?.request) return 0;
    const total = staff.doneAt - staff.startedAt;
    return Math.max(0, Math.min(100, Math.round(((Date.now() - staff.startedAt) / total) * 100)));
  }

  function syncHotelCash() {
    const el = $('ops-hotel-cash');
    if (el) el.textContent = fmt(HotelState.getCash());
  }

  function setReturnLink(label, icon) {
    const link = $('ops-return-link');
    if (!link) return;
    link.innerHTML = `<i class="fa-solid ${icon}"></i> ${label}`;
  }

  function setNextStep(message) {
    const el = $('ops-next-step');
    if (!el) return;
    el.querySelector('strong').textContent = message;
  }

  function clearLog() {
    $('ops-log').innerHTML = '';
  }

  function log(message, type = '', replace = false) {
    const wrap = $('ops-log');
    if (!wrap) return;
    if (replace) wrap.innerHTML = '';
    const p = document.createElement('p');
    p.className = type;
    p.textContent = message;
    wrap.prepend(p);
  }

  function fmt(value) {
    return Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
  }

  return { init };
})();

if (typeof window !== 'undefined') window.RoomsGame = RoomsGame;
