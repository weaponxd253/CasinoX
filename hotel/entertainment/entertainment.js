/* ============================================================
   ENTERTAINMENT BOOKER V1
   ------------------------------------------------------------
   Schedule acts across a 7-day lineup. Today's bookings feed
   traffic/satisfaction/income effects into the hotel engine.
   ============================================================ */

const EntertainmentBooker = (() => {
  const SLOTS = [
    { id:'afternoon', label:'Matinee' },
    { id:'evening', label:'Evening' },
  ];

  const ACTS = [
    {
      id:'jazz', label:'Jazz Night', icon:'fa-music', level:1, cost:450,
      style:'Bar + restaurant traffic',
      desc:'A polished lounge set that pulls guests into food and drinks.',
      effects:{ trafficBoost:0.12, satisfactionBoost:2, incomeBoost:0.04, barBoost:0.08, restaurantBoost:0.06, casinoBoost:0, vipChance:0.005 },
    },
    {
      id:'comedy', label:'Comedy Set', icon:'fa-face-laugh-beam', level:1, cost:600,
      style:'Guest satisfaction',
      desc:'A reliable crowd-pleaser that lifts mood across the hotel.',
      effects:{ trafficBoost:0.10, satisfactionBoost:4, incomeBoost:0.03, barBoost:0.04, restaurantBoost:0.02, casinoBoost:0, vipChance:0.004 },
    },
    {
      id:'magic', label:'Magic Show', icon:'fa-wand-magic-sparkles', level:2, cost:900,
      style:'Tourist demand',
      desc:'Family-friendly spectacle for tourists and casual guests.',
      effects:{ trafficBoost:0.18, satisfactionBoost:3, incomeBoost:0.05, barBoost:0.02, restaurantBoost:0.06, casinoBoost:0.02, vipChance:0.006 },
    },
    {
      id:'dj', label:'DJ Residency', icon:'fa-compact-disc', level:3, cost:1400,
      style:'Bar crowd surge',
      desc:'Late-night energy that boosts lounge spend and casino traffic.',
      effects:{ trafficBoost:0.20, satisfactionBoost:2, incomeBoost:0.08, barBoost:0.16, restaurantBoost:0.01, casinoBoost:0.06, vipChance:0.01 },
    },
    {
      id:'headliner', label:'Headliner Concert', icon:'fa-ticket', level:4, cost:2600,
      style:'Major traffic draw',
      desc:'A marquee performer that turns the resort into the destination.',
      effects:{ trafficBoost:0.34, satisfactionBoost:5, incomeBoost:0.14, barBoost:0.1, restaurantBoost:0.08, casinoBoost:0.1, vipChance:0.018 },
    },
    {
      id:'gala', label:'VIP Gala', icon:'fa-champagne-glasses', level:5, cost:4200,
      style:'VIP attraction',
      desc:'Invitation-only glamour with a real chance of VIP arrivals.',
      effects:{ trafficBoost:0.24, satisfactionBoost:6, incomeBoost:0.18, barBoost:0.12, restaurantBoost:0.12, casinoBoost:0.08, vipChance:0.04 },
    },
  ];

  let selectedSlot = null;
  let selectedActId = null;

  const $ = id => document.getElementById(id);

  function init() {
    syncHotelCash();
    window.HotelShiftBriefing?.mount?.('entertainment');
    ensureSchedule();
    selectedSlot = firstOpenSlot();
    selectedActId = firstUnlockedAct()?.id ?? null;
    renderAll();

    $('calendar-grid')?.addEventListener('click', e => {
      const slot = e.target.closest('[data-date-key][data-slot-id]');
      if (!slot) return;
      selectedSlot = { dateKey: slot.dataset.dateKey, slotId: slot.dataset.slotId, day: Number(slot.dataset.day) };
      renderAll();
    });

    $('act-list')?.addEventListener('click', e => {
      const card = e.target.closest('[data-act-id]');
      if (!card || card.classList.contains('locked')) return;
      selectedActId = card.dataset.actId;
      renderAll();
    });

    $('lineup-list')?.addEventListener('click', e => {
      const btn = e.target.closest('[data-cancel-id]');
      if (!btn) return;
      if (HotelState.cancelEntertainmentShow(btn.dataset.cancelId)) {
        CasinoShell.sound.tone(220, 'sine', 0.08, 0.18);
        renderAll();
      }
    });

    $('book-btn')?.addEventListener('click', bookSelectedShow);
  }

  function bookSelectedShow() {
    const act = selectedAct();
    if (!act || !selectedSlot) return;
    if (bookingFor(selectedSlot.dateKey, selectedSlot.slotId)) {
      CasinoShell.toast('That slot is already booked.');
      return;
    }
    if (!HotelState.spendHotelCash(act.cost)) {
      CasinoShell.toast('Not enough hotel cash.');
      return;
    }

    window.HotelShiftBriefing?.start?.('entertainment', 'Show Lineup');
    HotelState.bookEntertainmentShow({
      id: `show_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      actId: act.id,
      label: act.label,
      slotId: selectedSlot.slotId,
      phase: selectedSlot.slotId,
      dateKey: selectedSlot.dateKey,
      day: selectedSlot.day,
      bookedAt: Date.now(),
      cost: act.cost,
      effects: act.effects,
    });
    HotelState.recordShiftResult?.('entertainment', {
      title: 'Show Lineup booked',
      rewardText: `+${Math.round((act.effects?.trafficBoost ?? 0) * 100)}% traffic window`,
      satisfaction: act.effects?.satisfactionBoost ?? 0,
      primaryLabel: 'Booked',
      primaryValue: act.label,
      summary: `${act.label} booked for Day ${selectedSlot.day} ${slotLabel(selectedSlot.slotId)}.`,
      impact: 'Scheduled entertainment to lift traffic, income, and guest mood.',
      metrics: [
        { label:'Cost', value:`$${fmt(act.cost)}` },
        { label:'Income', value:`+${Math.round((act.effects?.incomeBoost ?? 0) * 100)}%` },
        { label:'Mood', value:`+${act.effects?.satisfactionBoost ?? 0}` },
      ],
    });

    CasinoShell.sound.win();
    CasinoShell.toast(`${act.label} booked.`);
    syncHotelCash();
    selectedSlot = firstOpenSlot() ?? selectedSlot;
    renderAll();
  }

  function renderAll() {
    renderTier();
    renderCalendar();
    renderActs();
    renderSelectedSlot();
    renderActDetail();
    renderLineup();
    renderTodayEffects();
    updateBookButton();
    syncHotelCash();
  }

  function renderTier() {
    const lvl = entertainmentLevel();
    const tier = HotelConfig.UPGRADE_CATALOG.entertainment?.[Math.max(0, lvl - 1)];
    $('ent-tier-label').textContent = tier?.label ?? 'Entertainment not built';
  }

  function renderCalendar() {
    const days = nextSevenDays();
    $('calendar-grid').innerHTML = days.map(day => `
      <div class="day-column">
        <div class="day-head">
          <div class="day-name">${day.name}</div>
          <div class="day-date">${day.shortDate}</div>
        </div>
        ${SLOTS.map(slot => renderSlot(day, slot)).join('')}
      </div>
    `).join('');
  }

  function renderSlot(day, slot) {
    const booking = bookingFor(day.dateKey, slot.id);
    const selected = selectedSlot?.dateKey === day.dateKey && selectedSlot?.slotId === slot.id;
    return `
      <button class="slot-card ${booking ? 'booked' : ''} ${selected ? 'selected' : ''}"
              type="button" data-date-key="${day.dateKey}" data-slot-id="${slot.id}" data-day="${day.day}">
        <div class="slot-time">${slot.label}</div>
        <div class="slot-title">${booking ? booking.label : 'Open Slot'}</div>
        <div class="slot-sub">${booking ? effectSummary(booking.effects) : 'Choose an act'}</div>
      </button>
    `;
  }

  function renderActs() {
    const lvl = entertainmentLevel();
    $('act-list').innerHTML = ACTS.map(act => {
      const locked = lvl < act.level;
      const selected = selectedActId === act.id;
      return `
        <article class="act-card ${locked ? 'locked' : ''} ${selected ? 'selected' : ''}" data-act-id="${act.id}">
          <span class="act-icon"><i class="fa-solid ${act.icon}"></i></span>
          <div>
            <div class="act-name">${act.label}</div>
            <div class="act-sub">${locked ? `Unlocks at Lv ${act.level}` : act.style}</div>
          </div>
          <div class="act-cost">$${fmt(act.cost)}</div>
        </article>
      `;
    }).join('');
  }

  function renderSelectedSlot() {
    const el = $('selected-slot-label');
    if (!selectedSlot) {
      el.textContent = 'Choose a calendar slot';
      return;
    }
        const day = nextSevenDays().find(d => d.dateKey === selectedSlot.dateKey);
    const slot = SLOTS.find(s => s.id === selectedSlot.slotId);
    const booking = bookingFor(selectedSlot.dateKey, selectedSlot.slotId);
    el.textContent = `${day?.name ?? selectedSlot.dateKey} · ${slot?.label ?? selectedSlot.slotId}${booking ? ' · booked' : ''}`;
  }

  function renderActDetail() {
    const act = selectedAct();
    if (!act) {
      $('act-detail').innerHTML = `
        <span class="selection-label">Selected Act</span>
        <strong>Choose an act</strong>
        <p>Pick an act and calendar slot to preview its traffic and satisfaction effect.</p>
      `;
      return;
    }
    $('act-detail').innerHTML = `
      <span class="selection-label">Selected Act</span>
      <strong>${act.label}</strong>
      <p>${act.desc}</p>
      <div class="effect-grid">
        ${effectChip('Traffic', `+${pct(act.effects.trafficBoost)}`)}
        ${effectChip('Satisfaction', `+${act.effects.satisfactionBoost}`)}
        ${effectChip('Income', `+${pct(act.effects.incomeBoost)}`)}
        ${effectChip('VIP Chance', `+${pct(act.effects.vipChance)}`)}
      </div>
    `;
  }

  function renderLineup() {
    const bookings = scheduledBookings();
    $('lineup-list').innerHTML = bookings.length
      ? bookings.map(booking => {
        const day = nextSevenDays().find(d => d.dateKey === booking.dateKey);
        const slot = SLOTS.find(s => s.id === booking.slotId);
        return `
          <article class="lineup-item">
            <div>
              <div class="lineup-title">${booking.label}</div>
              <div class="lineup-meta">${day?.name ?? booking.dateKey} · ${slot?.label ?? booking.slotId} · ${effectSummary(booking.effects)}</div>
            </div>
            <button class="cancel-show-btn" type="button" data-cancel-id="${booking.id}">
              Cancel
            </button>
          </article>
        `;
      }).join('')
      : '<div class="empty-lineup">No shows booked this week.</div>';
  }

  function renderTodayEffects() {
    const effects = HotelEngine.activeEntertainmentEffects(HotelState.get());
    const state = HotelState.get();
    const shows = scheduledBookings().filter(b => b.dateKey === HotelEngine.calendarDayKey(state) && b.phase === state.calendar.phase);
    $('today-effect-label').textContent = shows.length
      ? `${shows.length} show${shows.length === 1 ? '' : 's'} · +${pct(effects.trafficBoost)} traffic`
      : 'No show booked';
  }

  function updateBookButton() {
    const btn = $('book-btn');
    const act = selectedAct();
    const alreadyBooked = selectedSlot && bookingFor(selectedSlot.dateKey, selectedSlot.slotId);
    const disabled = !act || !selectedSlot || !!alreadyBooked || entertainmentLevel() < act.level;
    btn.disabled = disabled;
    btn.innerHTML = alreadyBooked
      ? '<i class="fa-solid fa-lock"></i> Slot Booked'
      : `<i class="fa-solid fa-calendar-plus"></i> Book Show${act ? ` · $${fmt(act.cost)}` : ''}`;
  }

  function ensureSchedule() {
    const state = HotelState.get();
    state.entertainment = state.entertainment ?? { schedule:{ bookings:[] }, stats:{ showsBooked:0, showsCancelled:0 } };
    state.entertainment.schedule = state.entertainment.schedule ?? { bookings:[] };
    state.entertainment.schedule.bookings = (state.entertainment.schedule.bookings ?? [])
      .filter(b => nextSevenDays().some(day => day.dateKey === b.dateKey));
    HotelState.save();
  }

  function selectedAct() {
    return ACTS.find(act => act.id === selectedActId) ?? null;
  }

  function slotLabel(slotId) {
    return SLOTS.find(slot => slot.id === slotId)?.label ?? slotId;
  }

  function firstUnlockedAct() {
    const lvl = entertainmentLevel();
    return ACTS.find(act => act.level <= lvl) ?? null;
  }

  function firstOpenSlot() {
    for (const day of nextSevenDays()) {
      for (const slot of SLOTS) {
        if (!bookingFor(day.dateKey, slot.id)) return { dateKey: day.dateKey, slotId: slot.id, day: day.day };
      }
    }
    return null;
  }

  function bookingFor(dateKey, slotId) {
    return scheduledBookings().find(b => b.dateKey === dateKey && b.slotId === slotId) ?? null;
  }

  function scheduledBookings() {
    return [...(HotelState.get().entertainment?.schedule?.bookings ?? [])]
      .sort((a, b) => `${a.dateKey}-${a.slotId}`.localeCompare(`${b.dateKey}-${b.slotId}`));
  }

  function entertainmentLevel() {
    return HotelState.get().departments.entertainment?.level ?? 0;
  }

  function nextSevenDays() {
    const calendar = HotelState.get().calendar ?? { day:1, weekday:0 };
    return Array.from({ length: 7 }, (_, i) => {
      const day = calendar.day + i;
      const weekday = (calendar.weekday + i) % HotelEngine.WEEKDAYS.length;
      return {
        day,
        dateKey: HotelEngine.calendarDayKey(HotelState.get(), day),
        name: i === 0 ? 'Today' : HotelEngine.WEEKDAYS[weekday].slice(0, 3),
        shortDate: `Day ${day}`,
      };
    });
  }

  function effectChip(label, value) {
    return `<div class="effect-chip"><span>${label}</span><strong>${value}</strong></div>`;
  }

  function effectSummary(effects = {}) {
    return `+${pct(effects.trafficBoost ?? 0)} traffic · +${effects.satisfactionBoost ?? 0} sat`;
  }

  function pct(value) {
    return `${Math.round((value ?? 0) * 100)}%`;
  }

  function fmt(value) {
    return Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
  }

  function syncHotelCash() {
    const el = $('ent-hotel-cash');
    if (el) el.textContent = fmt(HotelState.getCash());
  }

  return { init };
})();
