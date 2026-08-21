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
    { id:'housekeeper', label:'Housekeeping', icon:'fa-broom', specialty:['housekeeping','turndown','spill'], speed:1.0, strength:'Protects cleanliness and guest comfort.' },
    { id:'runner', label:'Runner', icon:'fa-person-running', specialty:['tray','minibar','towels'], speed:0.82, strength:'Moves fast on revenue and comfort requests.' },
    { id:'engineer', label:'Engineer', icon:'fa-screwdriver-wrench', specialty:['maintenance','noise'], speed:1.12, strength:'Prevents downtime and technical complaints.' },
  ];

  const REQUESTS = [
    { id:'tray', label:'Room Service Tray', icon:'fa-utensils', need:'runner', fallback:['housekeeper'], type:'tray', patience:15000, duration:4300, cash:48, sat:1, risk:'tip', urgency:'normal', pressure:'lost tip', rewardLabel:'Tip recovery', consequence:'Tip disappears if it waits.', fitReason:'Runner clears trays fastest.' },
    { id:'towels', label:'Fresh Towels', icon:'fa-soap', need:'runner', fallback:['housekeeper'], type:'towels', patience:17000, duration:3600, cash:24, sat:2, risk:'comfort', urgency:'low', pressure:'comfort slip', rewardLabel:'Comfort save', consequence:'Guest comfort drops.', fitReason:'Runner keeps comfort requests moving.' },
    { id:'housekeeping', label:'Housekeeping Reset', icon:'fa-broom', need:'housekeeper', fallback:['runner'], type:'housekeeping', patience:19000, duration:5200, cash:36, sat:2, risk:'room quality', urgency:'normal', pressure:'quality hit', rewardLabel:'Room quality', consequence:'Room quality falls for the next guest.', fitReason:'Housekeeping restores the room cleanly.' },
    { id:'turndown', label:'VIP Turndown', icon:'fa-champagne-glasses', need:'housekeeper', fallback:['runner'], type:'turndown', patience:13500, duration:5900, cash:72, sat:3, risk:'VIP mood', urgency:'vip', pressure:'VIP mood', rewardLabel:'VIP satisfaction', consequence:'VIP mood can sour quickly.', fitReason:'Housekeeping protects the VIP detail.', vip:true },
    { id:'spill', label:'Spill Cleanup', icon:'fa-droplet', need:'housekeeper', fallback:['engineer'], type:'spill', patience:12000, duration:4100, cash:28, sat:2, risk:'complaint', urgency:'high', pressure:'complaint', rewardLabel:'Complaint save', consequence:'Complaint risk rises fast.', fitReason:'Housekeeping fixes guest-facing messes.' },
    { id:'noise', label:'Noise Complaint', icon:'fa-volume-xmark', need:'engineer', fallback:['housekeeper'], type:'noise', patience:10500, duration:3900, cash:18, sat:3, risk:'walkout', urgency:'critical', pressure:'walkout', rewardLabel:'Walkout prevention', consequence:'Guest may walk out.', fitReason:'Engineer can stop the source of the noise.' },
    { id:'maintenance', label:'Leaky Fixture', icon:'fa-wrench', need:'engineer', fallback:['housekeeper'], type:'maintenance', patience:14500, duration:6100, cash:52, sat:2, risk:'room downtime', urgency:'high', pressure:'downtime', rewardLabel:'Downtime prevention', consequence:'Room downtime eats future revenue.', fitReason:'Engineer prevents maintenance downtime.' },
    { id:'minibar', label:'Minibar Restock', icon:'fa-wine-bottle', need:'runner', fallback:['housekeeper'], type:'minibar', patience:16000, duration:4600, cash:56, sat:1, risk:'lost sale', urgency:'normal', pressure:'lost sale', rewardLabel:'Revenue save', consequence:'Minibar sale is lost.', fitReason:'Runner recovers minibar revenue.' },
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
      dispatchRequest(card.dataset.requestId);
    });
    $('staff-grid')?.addEventListener('click', e => {
      const card = e.target.closest('[data-staff-id]');
      if (!card || card.classList.contains('busy')) return;
      selectManualStaff(card.dataset.staffId);
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
      selectedStaffId: null,
      spawned: 0,
      resolved: 0,
      complaints: 0,
      perfect: 0,
      earned: 0,
      satPoints: 0,
      lastOutcome: null,
    };

    $('start-ops-btn').disabled = true;
    $('start-ops-btn').innerHTML = '<i class="fa-solid fa-spinner"></i> On Shift';
    setReturnLink('Back to Hotel', 'fa-arrow-left');
    setNextStep('Click a room request to dispatch the best available staff.');
    hideResults();
    clearLog();
    log(`Floor Ops opened. Room staff coverage: ${shift.staffEffect?.score ?? 0}% ${shift.staffEffect?.label ?? 'Short'}.`, 'gold');
    spawnRequests(3);
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
    if (!shift?.active) return false;
    const activeCount = shift.rooms.filter(room => room.request && room.request.status !== 'done').length;
    const openRooms = shift.rooms.filter(room => !room.request);
    const canSpawn = Math.min(
      openRooms.length,
      shift.target - shift.spawned,
      Math.max(minimum, MAX_ACTIVE_REQUESTS - activeCount)
    );
    let spawned = false;
    for (let i = 0; i < canSpawn; i++) {
      const room = openRooms.splice(Math.floor(Math.random() * openRooms.length), 1)[0];
      room.request = makeRequest(room);
      shift.spawned++;
      spawned = true;
    }
    return spawned;
  }

  function dispatchRequest(requestId) {
    if (!shift?.active) return;
    const request = findRequest(requestId);
    if (!request || request.status !== 'waiting') return;
    const staff = chooseStaffForRequest(request);
    if (!staff) {
      shift.selectedRequestId = requestId;
      shift.lastOutcome = {
        tone: 'bad',
        title: 'All Staff Busy',
        body: `Room ${request.roomNumber} is queued. Free staff will be needed before patience runs out.`,
      };
      updateAll();
      CasinoShell.sound.tone(260, 'sine', 0.08, 0.18);
      return;
    }
    assignStaffToRequest(staff, request);
  }

  function selectManualStaff(staffId) {
    if (!shift?.active) return;
    const staff = shift.staff.find(s => s.id === staffId);
    if (!staff || staff.request) return;
    shift.selectedStaffId = shift.selectedStaffId === staffId ? null : staffId;
    shift.selectedRequestId = null;
    shift.lastOutcome = shift.selectedStaffId
      ? {
          tone: 'gold',
          title: `Manual Override: ${staff.label}`,
          body: `Click a room to send ${staff.label}, or click ${staff.label} again to return to auto-dispatch.`,
        }
      : {
          tone: 'gold',
          title: 'Auto Dispatch On',
          body: 'Click a room request to send the best available staff automatically.',
        };
    updateAll();
    CasinoShell.sound.tone(500, 'sine', 0.06, 0.14);
  }

  function assignStaffToRequest(staff, request) {
    const now = Date.now();
    const fit = evaluateDispatch(staff, request);
    const manual = shift.selectedStaffId === staff.id;
    request.status = 'assigned';
    request.staffId = staff.id;
    request.matched = fit.tier === 'best';
    request.fitTier = fit.tier;
    request.fitLabel = fit.label;
    request.fitReason = fit.reason;
    request.assignedBy = staff.label;
    request.manual = manual;
    staff.request = request;
    staff.startedAt = now;
    staff.doneAt = now + Math.round(request.duration * staff.speed * fit.timeMult * (shift.staffEffect?.speedMult ?? 1));
    shift.selectedRequestId = null;
    shift.selectedStaffId = null;
    shift.lastOutcome = {
      tone: fit.tier === 'risky' ? 'bad' : 'gold',
      title: `${staff.label} dispatched`,
      body: `${manual ? 'Manual override' : 'Auto dispatch'} - ${fit.label}: ${fit.reason}`,
    };
    CasinoShell.sound.tone(fit.tier === 'best' ? 660 : fit.tier === 'acceptable' ? 520 : 420, 'sine', 0.08, 0.2);
    updateAll();
  }

  function startTimer() {
    clearInterval(timer);
    timer = setInterval(() => {
      if (!shift?.active) return;
      const now = Date.now();
      let boardChanged = false;

      shift.rooms.forEach(room => {
        const request = room.request;
        if (request?.status === 'waiting' && now >= request.patienceEnd) {
          request.status = 'complaint';
          shift.complaints++;
          if (shift.selectedRequestId === request.requestId) shift.selectedRequestId = null;
          log(`Room ${request.roomNumber} escalated: ${request.label}.`, 'bad');
          CasinoShell.sound.lose();
          boardChanged = true;
        }
      });

      shift.staff
        .filter(staff => staff.request && now >= staff.doneAt)
        .forEach(staff => {
          completeRequest(staff);
          boardChanged = true;
        });

      boardChanged = cleanupCompletedRooms() || boardChanged;
      boardChanged = spawnRequests(1) || boardChanged;
      ensureSelection();
      if (boardChanged) {
        updateAll();
      } else {
        updateLiveMeters();
      }

      if (now >= shift.endsAt || shift.resolved + shift.complaints >= shift.target) {
        finishShift();
      }
    }, 120);
  }

  function completeRequest(staff) {
    const request = staff.request;
    const patienceLeft = Math.max(0, (request.patienceEnd - Date.now()) / request.patience);
    const fast = patienceLeft > 0.45;
    const fit = evaluateDispatch(staff, request);
    const perfect = fit.tier === 'best' && fast;
    const handled = fit.tier !== 'risky';
    const base = request.cash + shift.roomsLevel * 7;
    const speedBonus = fast ? request.cash * 0.22 : 0;
    const earned = Math.round((base * fit.cashMult + speedBonus + (perfect ? request.cash * 0.35 : 0)) * (shift.staffEffect?.incomeMult ?? 1));
    const sat = perfect
      ? request.sat
      : fit.tier === 'best'
        ? Math.max(1, request.sat - 1)
        : fit.tier === 'acceptable'
          ? Math.max(0, request.sat - 1)
          : 0;
    const outcome = buildOutcome(request, staff, fit, perfect, fast, earned, sat);

    request.status = 'done';
    request.completedAt = Date.now();
    request.outcome = outcome;
    shift.resolved++;
    shift.earned += earned;
    shift.satPoints += sat;
    if (perfect) shift.perfect++;
    shift.lastOutcome = outcome;

    log(
      `${outcome.title}: Room ${request.roomNumber}. +$${earned}`,
      outcome.tone
    );
    CasinoShell.sound.tone(perfect ? 760 : handled ? 540 : 360, 'sine', 0.11, 0.22);

    staff.request = null;
    staff.startedAt = 0;
    staff.doneAt = 0;
  }

  function cleanupCompletedRooms() {
    const now = Date.now();
    let removed = false;
    shift.rooms.forEach(room => {
      if (!room.request) return;
      if (room.request.status === 'done' && now - room.request.completedAt > 700) {
        room.request = null;
        removed = true;
      }
      if (room.request?.status === 'complaint' && now - room.request.patienceEnd > 850) {
        room.request = null;
        removed = true;
      }
    });
    return removed;
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
    shift.selectedRequestId = null;
    const selectedStaff = shift.staff.find(staff => staff.id === shift.selectedStaffId);
    if (selectedStaff?.request) shift.selectedStaffId = null;
  }

  function findRequest(requestId) {
    if (!requestId || !shift) return null;
    return shift.rooms.map(room => room.request).find(request => request?.requestId === requestId) ?? null;
  }

  function chooseStaffForRequest(request) {
    const available = shift.staff.filter(staff => !staff.request);
    if (!available.length) return null;
    const manualStaff = available.find(staff => staff.id === shift.selectedStaffId);
    if (manualStaff) return manualStaff;

    const tierScore = { best: 3, acceptable: 2, risky: 1 };
    return available
      .map(staff => {
        const fit = evaluateDispatch(staff, request);
        return { staff, fit, score: tierScore[fit.tier] ?? 0 };
      })
      .sort((a, b) => b.score - a.score || (a.fit.timeMult * a.staff.speed) - (b.fit.timeMult * b.staff.speed))[0]?.staff ?? null;
  }

  function evaluateDispatch(staff, request) {
    if (!staff || !request) return { tier:'risky', label:'No Fit', reason:'Select a request first.', timeMult:1.55, cashMult:0.55 };
    if (staff.id === request.need || staff.specialty.includes(request.type)) {
      return {
        tier: 'best',
        label: 'Best Fit',
        reason: request.fitReason,
        timeMult: 1,
        cashMult: 1,
      };
    }
    if ((request.fallback ?? []).includes(staff.id)) {
      return {
        tier: 'acceptable',
        label: 'Can Cover',
        reason: `${staff.label} can stabilize the ${request.pressure}, but slower.`,
        timeMult: 1.18,
        cashMult: 0.82,
      };
    }
    return {
      tier: 'risky',
      label: 'Risky Match',
      reason: `${staff.label} may miss the core issue: ${request.consequence}`,
      timeMult: 1.55,
      cashMult: 0.52,
    };
  }

  function buildOutcome(request, staff, fit, perfect, fast, earned, sat) {
    if (perfect) {
      return {
        tone: 'good',
        title: 'Perfect Match',
        body: `${staff.label} solved ${request.label.toLowerCase()} before pressure built.`,
        detail: `${request.rewardLabel}: +$${fmt(earned)} and satisfaction +${sat}.`,
      };
    }
    if (fit.tier === 'best') {
      return {
        tone: 'gold',
        title: fast ? 'Handled Cleanly' : 'Handled Late',
        body: `${staff.label} was the right call, but timing limited the upside.`,
        detail: `${request.rewardLabel}: +$${fmt(earned)} and satisfaction +${sat}.`,
      };
    }
    if (fit.tier === 'acceptable') {
      return {
        tone: 'gold',
        title: 'Covered',
        body: `${staff.label} covered outside their lane and kept the room stable.`,
        detail: `${request.rewardLabel}: +$${fmt(earned)}${sat ? ` and satisfaction +${sat}` : ''}.`,
      };
    }
    return {
      tone: 'bad',
      title: 'Wrong Staff',
      body: `${staff.label} handled the call, but ${request.consequence}`,
      detail: `Partial recovery: +$${fmt(earned)}.`,
    };
  }

  function urgencyState(request) {
    if (!request) return { tier:'idle', label:'Clear' };
    if (request.status === 'assigned') return { tier:'assigned', label:'Assigned' };
    if (request.status === 'done') return { tier:'done', label:'Done' };
    if (request.status === 'complaint') return { tier:'critical', label:'Complaint' };
    const pct = patiencePct(request);
    if (request.urgency === 'vip') return { tier:'vip', label:'VIP' };
    if (pct < 25 || request.urgency === 'critical') return { tier:'critical', label:'Critical' };
    if (pct < 50 || request.urgency === 'high') return { tier:'high', label:'Urgent' };
    return { tier:'normal', label:'Stable' };
  }

  function staffLabel(staffId) {
    return STAFF.find(member => member.id === staffId)?.label ?? 'Any staff';
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
    setNextStep('Start Floor Ops, then click a room to dispatch staff.');
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
      const urgency = urgencyState(request);
      return `
        <article class="room-tile ${selected} ${status} urgency-${urgency.tier}" data-request-id="${request.requestId}">
          <div class="room-top">
            <span class="room-number">${request.roomNumber}</span>
            <i class="fa-solid ${request.icon}"></i>
          </div>
          <div class="room-meta">
            <span class="urgency-pill ${urgency.tier}">${urgency.label}</span>
            <span>${staffLabel(request.need)}</span>
          </div>
          <strong>${request.label}</strong>
          <span class="room-risk">${request.pressure}</span>
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
      const fit = request && !busy && shift?.active ? evaluateDispatch(member, request) : null;
      const recommended = fit?.tier === 'best';
      const selected = shift?.selectedStaffId === member.id;
      const pct = staffPct(member);
      return `
        <button class="staff-card ${busy ? 'busy' : ''} ${recommended ? 'recommended' : ''} ${selected ? 'manual-selected' : ''} ${fit ? `fit-${fit.tier}` : ''}" type="button" data-staff-id="${member.id}" ${busy || !shift?.active ? 'disabled' : ''}>
          <i class="fa-solid ${member.icon}"></i>
          <span>${member.label}</span>
          <strong>${busy ? `Room ${member.request.roomNumber}` : selected ? 'Manual Override' : 'Auto Available'}</strong>
          ${fit ? `<small class="staff-fit-label">${fit.label}</small><em>${fit.reason}</em>` : selected ? '<small class="staff-fit-label">Selected</small><em>Click a room to send this staff member.</em>' : `<em>${member.strength}</em>`}
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
      const selectedStaff = shift?.staff?.find(staff => staff.id === shift.selectedStaffId);
      wrap.innerHTML = `
        <span>${selectedStaff ? 'Manual Override' : 'Floor Triage'}</span>
        <strong>${selectedStaff ? `${selectedStaff.label} ready` : 'No room selected'}</strong>
        <p>${shift?.active
          ? selectedStaff
            ? `Click a room to send ${selectedStaff.label}. Click the staff card again to return to auto-dispatch.`
            : 'Click any active room request to auto-dispatch the best available staff.'
          : 'Start a shift to open live room requests and triage the floor.'}</p>
      `;
      setNextStep(shift?.active
        ? selectedStaff
          ? `Click a room to send ${selectedStaff.label}.`
          : 'Click a room request to dispatch the best available staff.'
        : 'Start Floor Ops to open room requests.');
      return;
    }
    const staff = STAFF.find(member => member.id === request.need);
    const urgency = urgencyState(request);
    wrap.innerHTML = `
      <span>Selected Request</span>
      <strong>Room ${request.roomNumber}: ${request.label}</strong>
      <p>${request.guestName} needs ${request.risk} handled. Best staff: ${staff?.label ?? 'Any staff'}.</p>
      <div class="request-brief-grid">
        <div><span>Pressure</span><strong>${urgency.label}</strong></div>
        <div><span>Reward</span><strong>${request.rewardLabel}</strong></div>
        <div><span>Consequence</span><strong>${request.consequence}</strong></div>
      </div>
    `;
    setNextStep(`All staff are busy. Room ${request.roomNumber} is queued until someone frees up.`);
  }

  function renderDispatchPanel() {
    const panel = $('dispatch-preview');
    if (!panel) return;
    const request = findRequest(shift?.selectedRequestId);

    if (request) {
      const bestStaff = STAFF.find(member => member.id === request.need);
      const available = (shift?.staff ?? []).filter(member => !member.request);
      const riskyCount = available.filter(member => evaluateDispatch(member, request).tier === 'risky').length;
      const preview = bestStaff ? evaluateDispatch(bestStaff, request) : null;
      const latest = shift?.lastOutcome
        ? `<p class="dispatch-detail">Last: ${shift.lastOutcome.title}. ${shift.lastOutcome.body}</p>`
        : '';
      panel.hidden = false;
      panel.className = 'dispatch-preview';
      if (!available.length) {
        panel.innerHTML = `
          <span>Queued Request</span>
          <strong>All staff are busy</strong>
          <p>Room ${request.roomNumber} is selected so you can see the pressure while staff finish their current calls.</p>
          ${latest}
        `;
        return;
      }
      panel.innerHTML = `
        <span>Outcome Preview</span>
        <strong>${preview?.label ?? 'Choose Staff'}: ${bestStaff?.label ?? 'Any staff'}</strong>
        <p>${request.fitReason}</p>
        <div class="dispatch-preview-grid">
          <div><span>Cash</span><strong>$${fmt(request.cash + shift.roomsLevel * 7)}+</strong></div>
          <div><span>Satisfaction</span><strong>+${request.sat}</strong></div>
          <div><span>Risky Options</span><strong>${riskyCount}</strong></div>
        </div>
        ${latest}
      `;
      return;
    }

    if (shift?.lastOutcome) {
      const outcome = shift.lastOutcome;
      panel.hidden = false;
      panel.className = `dispatch-preview outcome ${outcome.tone}`;
      panel.innerHTML = `
        <span>Latest Outcome</span>
        <strong>${outcome.title}</strong>
        <p>${outcome.body}</p>
        ${outcome.detail ? `<p class="dispatch-detail">${outcome.detail}</p>` : ''}
      `;
      return;
    }

    panel.hidden = true;
    panel.innerHTML = '';
  }

  function updateAll() {
    renderRooms();
    renderStaff();
    renderSelectedBrief();
    renderDispatchPanel();
    updateStats();
    updateSessionMeter();
  }

  function updateLiveMeters() {
    updateStats();
    updateSessionMeter();
    updateRoomMeters();
    updateStaffMeters();
  }

  function updateRoomMeters() {
    if (!shift?.active) return;
    shift.rooms.forEach(room => {
      const request = room.request;
      if (!request) return;
      const tile = document.querySelector(`[data-request-id="${request.requestId}"]`);
      if (!tile) return;
      const pct = patiencePct(request);
      const urgency = urgencyState(request);
      const fill = tile.querySelector('.patience-fill');
      const pill = tile.querySelector('.urgency-pill');

      if (fill) {
        fill.style.width = `${pct}%`;
        fill.classList.toggle('danger', pct < 25);
        fill.classList.toggle('warn', pct >= 25 && pct < 50);
      }

      ['urgency-normal', 'urgency-high', 'urgency-critical', 'urgency-vip', 'urgency-assigned', 'urgency-done'].forEach(cls => {
        tile.classList.remove(cls);
      });
      tile.classList.add(`urgency-${urgency.tier}`);

      if (pill) {
        pill.className = `urgency-pill ${urgency.tier}`;
        pill.textContent = urgency.label;
      }
    });
  }

  function updateStaffMeters() {
    if (!shift?.active) return;
    shift.staff.forEach(staff => {
      const card = document.querySelector(`[data-staff-id="${staff.id}"]`);
      const fill = card?.querySelector('.staff-fill');
      if (fill) fill.style.width = `${staffPct(staff)}%`;
    });
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

  function debugEvaluateDispatch(staffId, requestId) {
    const staff = STAFF.find(member => member.id === staffId);
    const request = REQUESTS.find(item => item.id === requestId) ?? REQUESTS[0];
    return evaluateDispatch(staff, request);
  }

  return { init, debugEvaluateDispatch };
})();

if (typeof window !== 'undefined') window.RoomsGame = RoomsGame;
