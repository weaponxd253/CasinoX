/* ============================================================
   HOTEL MANAGER — GUEST ENGINE  (hotel-guests.js)
   ------------------------------------------------------------
   Population simulation, guest-type mix, guest income, and
   VIP / High Roller event system.

   v2: Consumes the check-in game boost and keeps the named
   guest roster in sync with population.

   Depends on: hotel-config.js, hotel-state.js
   Called by:  hotel-engine.js (processLiveTick / processBootTick)
   ============================================================ */

const HotelGuests = (() => {

  /* ── Constants ──────────────────────────────────────────── */
  const MAX_OVERFILL    = 1.3;   // guests can exceed room capacity by 30%
  const VIP_BASE_CHANCE = 0.025; // per tick probability when eligible
  const BOOST_HIT_RATE  = 0.7;   // chance a remaining boost charge fires this tick

  /* ────────────────────────────────────────────────────────────
     POPULATION MODEL
     ─────────────────────────────────────────────────────────── */

  function getRoomCapacity(state) {
    const lvl = state.departments.rooms?.level ?? 1;
    return HotelConfig.UPGRADE_CATALOG.rooms?.[lvl - 1]?.capacity ?? 10;
  }

  function targetPopulation(state) {
    const rep      = state.currencies.reputation;
    const sat      = state.satisfaction.current;
    const capacity = getRoomCapacity(state);

    const repDemand = Math.floor(2 + rep * 0.75);
    const satScale  = sat >= 75 ? 1.0
                    : sat >= 60 ? 0.85
                    : sat >= 40 ? 0.60
                    : 0.30;

    return Math.min(
      Math.floor(repDemand * satScale),
      Math.floor(capacity * MAX_OVERFILL)
    );
  }

  /**
   * Run one population tick (called every 60 s).
   * Now consumes one boost charge with a 70% probability — if it
   * fires, an extra arrival is added regardless of normal odds.
   */
  function tickPopulation(state) {
    const current  = state.guests.population;
    const target   = targetPopulation(state);
    const sat      = state.satisfaction.current;
    const capacity = getRoomCapacity(state);
    const hardCap  = Math.floor(capacity * MAX_OVERFILL);

    // ── Check-in probability (idle / organic) ──
    const deficit      = Math.max(0, target - current);
    const checkInBase  = Math.min(0.90, deficit * 0.28);
    const checkIn      = sat < 40 ? checkInBase * 0.25 : checkInBase;
    const organicArrive = Math.random() < checkIn ? 1 : 0;

    // ── Boost-driven extra arrival ──
    // Try to consume one boost charge; if it fires, +1 arrival even at full
    // organic odds. Boost is gated by room hard-cap so it can't overfill.
    let boostArrive = 0;
    const boostRemaining = state.guests.checkInBoostRemaining ?? 0;
    if (boostRemaining > 0 && current + organicArrive < hardCap) {
      if (Math.random() < BOOST_HIT_RATE) {
        boostArrive = window.HotelState
          ? HotelState.consumeCheckInBoost()
          : 1;
      }
    }

    const arrive = organicArrive + boostArrive;

    // ── Check-out probability ──
    const overcrowded   = current > capacity;
    const checkOutBase  = sat < 40 ? 0.45
                        : sat < 60 ? 0.18
                        : overcrowded ? 0.22
                        : 0.04;

    const depart = Math.random() < checkOutBase
                 ? (overcrowded ? Math.min(current, 2) : Math.min(current, 1))
                 : 0;

    const newPop = Math.max(0, Math.min(hardCap, current + arrive - depart));

    // Approximate hourly rates for display (each tick = ~1 min)
    const checkInRate  = Math.round(checkIn  * 60 * 10) / 10;
    const checkOutRate = Math.round(checkOutBase * 60 * 10) / 10;

    return { population: newPop, checkInRate, checkOutRate, arrive, depart };
  }

  /* ────────────────────────────────────────────────────────────
     ROSTER SYNC
     Keeps the named-guest roster aligned with population.
     • Adds synthetic entries when arrivals exceed roster size
     • Removes oldest/expired entries when departures happen
     ─────────────────────────────────────────────────────────── */

  function syncRoster(state, { arrive, depart }) {
    if (!window.HotelState) return;
    const now = Date.now();

    // First: prune any expired entries (their checkOutAt has passed)
    HotelState.pruneExpiredFromRoster(now);

    const rosterSize = HotelState.getRosterCount();
    const targetSize = state.guests.population;
    const mix        = state.guests.mix;

    // Add synthetic entries to match population
    if (rosterSize < targetSize) {
      const toAdd = targetSize - rosterSize;
      for (let i = 0; i < toAdd; i++) {
        const type = pickTypeFromMix(mix);
        HotelState.addGuestToRoster(buildSynthetic(type, now));
      }
    }

    // Remove entries if population dropped (prefer earliest checkOutAt = "ready to leave")
    if (rosterSize > targetSize) {
      const toRemove = rosterSize - targetSize;
      const roster   = HotelState.getRoster()
        .slice()
        .sort((a, b) => a.checkOutAt - b.checkOutAt);   // earliest first
      for (let i = 0; i < toRemove && i < roster.length; i++) {
        HotelState.removeGuestFromRoster(roster[i].id);
      }
    }
  }

  /** Build a synthetic ("simulated") roster entry of the given type. */
  function buildSynthetic(typeId, now = Date.now()) {
    const cfg = HotelConfig.GUEST_TYPES[typeId] ?? HotelConfig.GUEST_TYPES.budgetTraveler;
    const ipm = cfg.incomePerGuestPerMin ?? 2;

    // Stay duration: vary by type. 15–60 real minutes for standard types,
    // shorter for special events (vip/highRoller already have visitDurationHours).
    let stayMs;
    if (cfg.visitDurationHours) {
      const { min, max } = cfg.visitDurationHours;
      stayMs = (min + Math.random() * (max - min)) * 60 * 60_000; // hours
    } else if (typeId === 'budgetTraveler') {
      stayMs = (15 + Math.random() * 15) * 60_000;
    } else if (typeId === 'tourist') {
      stayMs = (25 + Math.random() * 25) * 60_000;
    } else if (typeId === 'gambler') {
      stayMs = (10 + Math.random() * 20) * 60_000;
    } else if (typeId === 'businessGuest') {
      stayMs = (35 + Math.random() * 30) * 60_000;
    } else {
      stayMs = (20 + Math.random() * 20) * 60_000;
    }

    const stayMinutes = stayMs / 60_000;
    const totalIncome = Math.round(ipm * stayMinutes);

    return {
      type:          typeId,
      name:          null,                  // synthetic guests are unnamed
      preferences:   [],
      incomePerMin:  ipm,
      totalIncome,
      checkedInAt:   now,
      checkOutAt:    now + stayMs,
      source:        'simulated',
    };
  }

  /** Weighted-random guest type pick from a mix object. */
  function pickTypeFromMix(mix) {
    const entries = Object.entries(mix).filter(([, p]) => p > 0);
    if (entries.length === 0) return 'budgetTraveler';
    const r = Math.random();
    let acc = 0;
    for (const [id, p] of entries) {
      acc += p;
      if (r <= acc) return id;
    }
    return entries[entries.length - 1][0];
  }

  /* ────────────────────────────────────────────────────────────
     GUEST MIX
     ─────────────────────────────────────────────────────────── */

  function calculateMix(reputation) {
    const { GUEST_TYPES } = HotelConfig;

    const unlocked = Object.values(GUEST_TYPES)
      .filter(g => !g.isSpecialEvent && reputation >= g.reputationRequired)
      .sort((a, b) => a.reputationRequired - b.reputationRequired);

    const zero = {};
    Object.keys(GUEST_TYPES).forEach(id => zero[id] = 0);
    if (unlocked.length === 0) return { ...zero, budgetTraveler: 1.0 };

    const weights = unlocked.map((_, i) => 1 / (i + 1));
    const total   = weights.reduce((a, b) => a + b, 0);

    const mix = { ...zero };
    unlocked.forEach((type, i) => {
      mix[type.id] = parseFloat((weights[i] / total).toFixed(4));
    });

    return mix;
  }

  /* ────────────────────────────────────────────────────────────
     GUEST INCOME
     ─────────────────────────────────────────────────────────── */

  function calculateGuestIncome({ mix, population }, minutes = 1) {
    if (!mix || !population) return 0;
    let perMin = 0;
    for (const [id, pct] of Object.entries(mix)) {
      if (pct <= 0) continue;
      const cfg = HotelConfig.GUEST_TYPES[id];
      if (!cfg) continue;
      perMin += (cfg.incomePerGuestPerMin ?? 0) * pct * population;
    }
    return Math.round(perMin * minutes);
  }

  /* ────────────────────────────────────────────────────────────
     SPECIAL EVENTS
     ─────────────────────────────────────────────────────────── */

  function checkSpecialGuests(state) {
    const events = [];
    const rep    = state.currencies.reputation;
    const now    = Date.now();

    // VIP departure
    if (state.guests.vipPresent && state.guests.vipDepartsAt && now >= state.guests.vipDepartsAt) {
      events.push({ type: 'vip_departure' });
    }

    // VIP arrival
    if (!state.guests.vipPresent && rep >= HotelConfig.GUEST_TYPES.vip.reputationRequired) {
      if (Math.random() < VIP_BASE_CHANCE) {
        const { min, max } = HotelConfig.GUEST_TYPES.vip.visitDurationHours;
        const hours = min + Math.random() * (max - min);
        events.push({ type: 'vip_arrival', departAt: now + hours * 60 * 60_000 });
      }
    }

    // High Roller arrival
    const hr = HotelConfig.GUEST_TYPES.highRoller;
    const casinoLevel = state.departments.casino?.level ?? 0;
    if (
      !state.guests.highRollerPresent &&
      rep >= hr.reputationRequired &&
      casinoLevel >= (hr.requiresCasinoLevel ?? 1) &&
      Math.random() < VIP_BASE_CHANCE * 0.4
    ) {
      events.push({ type: 'high_roller_arrival' });
    }

    if (state.guests.highRollerPresent && Math.random() < 0.008) {
      events.push({ type: 'high_roller_departure' });
    }

    return events;
  }

  /* ────────────────────────────────────────────────────────────
     ROLLING SATISFACTION AVERAGE
     ─────────────────────────────────────────────────────────── */

  function updateRollingAverage(state) {
    const current = state.satisfaction.current;
    const prev    = state.satisfaction.rollingAverage ?? current;
    return parseFloat((0.95 * prev + 0.05 * current).toFixed(1));
  }

  /* ────────────────────────────────────────────────────────────
     OFFLINE RESTORE
     ─────────────────────────────────────────────────────────── */

  function restoreFromOffline(state, elapsedMs) {
    const LONG_ABSENCE_MS = 30 * 60_000;   // 30 minutes
    if (elapsedMs < LONG_ABSENCE_MS) return null;

    // Prune anyone whose stay ended while the player was away
    if (window.HotelState) HotelState.pruneExpiredFromRoster(Date.now());

    const target = targetPopulation(state);
    const current = state.guests.population;
    const restored = Math.round(current + (target - current) * 0.7);
    const mix      = calculateMix(state.currencies.reputation);
    const rollingAverage = updateRollingAverage(state);

    return {
      population:    Math.max(0, restored),
      checkInRate:   state.guests.checkInRate,
      checkOutRate:  state.guests.checkOutRate,
      mix,
      guestIncome:   0,
      specialEvents: [],
      rollingAverage,
      arrive: Math.max(0, restored - current),
      depart: Math.max(0, current - restored),
    };
  }

  /* ────────────────────────────────────────────────────────────
     FULL TICK  (called by hotel-engine every 60 s)
     ─────────────────────────────────────────────────────────── */

  function tick(state) {
    const popResult       = tickPopulation(state);
    const mix             = calculateMix(state.currencies.reputation);
    const guestIncome     = calculateGuestIncome({ mix, population: popResult.population }, 1);
    const specialEvents   = checkSpecialGuests(state);
    const rollingAverage  = updateRollingAverage(state);

    // Roster sync happens AFTER setGuestData would write the new population.
    // We pass arrive/depart hints to syncRoster — it works against the
    // CURRENT state (caller will write the new population after this).
    // We need the new population reflected for syncRoster, so write it
    // into a shallow clone for the sync step.
    const stateForSync = {
      ...state,
      guests: { ...state.guests, population: popResult.population, mix }
    };
    syncRoster(stateForSync, popResult);

    return {
      population:    popResult.population,
      checkInRate:   popResult.checkInRate,
      checkOutRate:  popResult.checkOutRate,
      mix,
      guestIncome,
      specialEvents,
      rollingAverage,
    };
  }

  /* ────────────────────────────────────────────────────────────
     UI HELPERS
     ─────────────────────────────────────────────────────────── */

  function nextUnlock(reputation) {
    return Object.values(HotelConfig.GUEST_TYPES)
      .filter(g => !g.isSpecialEvent && g.reputationRequired > reputation)
      .sort((a, b) => a.reputationRequired - b.reputationRequired)[0] ?? null;
  }

  function occupancyLabel(population, capacity) {
    const pct = capacity > 0 ? Math.round((population / capacity) * 100) : 0;
    if (pct >= 120) return 'Overbooked';
    if (pct >= 95)  return 'Full House';
    if (pct >= 75)  return 'Busy';
    if (pct >= 50)  return 'Moderate';
    if (pct >= 25)  return 'Quiet';
    return 'Near Empty';
  }

  function uiSummary(state) {
    const capacity   = getRoomCapacity(state);
    const population = state.guests.population;
    const mix        = state.guests.mix;
    const rep        = state.currencies.reputation;

    const activeMix = Object.entries(mix)
      .filter(([, pct]) => pct > 0.005)
      .sort(([, a], [, b]) => b - a)
      .map(([id, pct]) => ({
        id, pct,
        ...HotelConfig.GUEST_TYPES[id],
        count: Math.round(population * pct),
      }));

    return {
      population,
      capacity,
      pct:            capacity > 0 ? Math.round((population / capacity) * 100) : 0,
      occupancyLabel: occupancyLabel(population, capacity),
      checkInRate:    state.guests.checkInRate,
      checkOutRate:   state.guests.checkOutRate,
      activeMix,
      next:           nextUnlock(rep),
      vipPresent:     state.guests.vipPresent,
      highRollerPresent: state.guests.highRollerPresent,
      target:         targetPopulation(state),

      // ── NEW IN v2 ──
      rosterCount:    state.guests.roster?.length ?? 0,
      checkInBoost:   state.guests.checkInBoostRemaining ?? 0,
    };
  }

  return {
    tick,
    restoreFromOffline,
    calculateMix,
    calculateGuestIncome,
    checkSpecialGuests,
    nextUnlock,
    getRoomCapacity,
    targetPopulation,
    uiSummary,

    // exposed for tests / debugging
    syncRoster,
    buildSynthetic,
    pickTypeFromMix,
  };
})();

if (typeof window !== 'undefined') window.HotelGuests = HotelGuests;
