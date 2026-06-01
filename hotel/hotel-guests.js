/* ============================================================
   HOTEL MANAGER — GUEST ENGINE  (hotel-guests.js)
   ------------------------------------------------------------
   Population simulation, guest-type mix, guest income, and
   VIP / High Roller event system.

   Depends on: hotel-config.js, hotel-state.js
   Called by:  hotel-engine.js (processLiveTick / processBootTick)
   ============================================================ */

const HotelGuests = (() => {

  /* ── Constants ──────────────────────────────────────────── */
  const MAX_OVERFILL   = 1.3;   // guests can exceed room capacity by 30%
  const VIP_BASE_CHANCE = 0.025; // per tick probability when eligible

  /* ────────────────────────────────────────────────────────────
     POPULATION MODEL
     ─────────────────────────────────────────────────────────── */

  function getRoomCapacity(state) {
    const lvl = state.departments.rooms?.level ?? 1;
    return HotelConfig.UPGRADE_CATALOG.rooms?.[lvl - 1]?.capacity ?? 10;
  }

  /**
   * The population the hotel should converge toward given
   * current reputation, satisfaction, and room capacity.
   */
  function targetPopulation(state) {
    const rep      = state.currencies.reputation;
    const sat      = state.satisfaction.current;
    const capacity = getRoomCapacity(state);

    // Reputation drives base demand; satisfaction scales it
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
   * Returns { population, checkInRate, checkOutRate }
   */
  function tickPopulation(state) {
    const current  = state.guests.population;
    const target   = targetPopulation(state);
    const sat      = state.satisfaction.current;
    const capacity = getRoomCapacity(state);

    // ── Check-in probability ──
    const deficit      = Math.max(0, target - current);
    const checkInBase  = Math.min(0.90, deficit * 0.28);
    const checkIn      = sat < 40 ? checkInBase * 0.25 : checkInBase;

    // ── Check-out probability ──
    const overcrowded   = current > capacity;
    const checkOutBase  = sat < 40 ? 0.45
                        : sat < 60 ? 0.18
                        : overcrowded ? 0.22
                        : 0.04;

    // Determine arrivals and departures for this tick
    const arrive = Math.random() < checkIn ? 1 : 0;
    const depart = Math.random() < checkOutBase
                 ? (overcrowded ? Math.min(current, 2) : Math.min(current, 1))
                 : 0;

    const newPop = Math.max(
      0,
      Math.min(Math.floor(capacity * MAX_OVERFILL), current + arrive - depart)
    );

    // Approximate hourly rates for display (each tick = ~1 min)
    const checkInRate  = Math.round(checkIn  * 60 * 10) / 10;
    const checkOutRate = Math.round(checkOutBase * 60 * 10) / 10;

    return { population: newPop, checkInRate, checkOutRate };
  }

  /* ────────────────────────────────────────────────────────────
     GUEST MIX
     ─────────────────────────────────────────────────────────── */

  /**
   * Build a proportional guest-type mix from the current reputation.
   * Higher-tier types unlock and gradually grow their share,
   * but the first unlocked type always stays dominant.
   */
  function calculateMix(reputation) {
    const { GUEST_TYPES } = HotelConfig;

    const unlocked = Object.values(GUEST_TYPES)
      .filter(g => !g.isSpecialEvent && reputation >= g.reputationRequired)
      .sort((a, b) => a.reputationRequired - b.reputationRequired);

    // Empty edge case
    const zero = {};
    Object.keys(GUEST_TYPES).forEach(id => zero[id] = 0);
    if (unlocked.length === 0) return { ...zero, budgetTraveler: 1.0 };

    // Each tier gets weight 1/(rank), creating a natural long tail
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

  /**
   * Calculate hotel cash earned by guest spending in `minutes`.
   * This is separate from department passive income — it represents
   * what guests spend on services, tips, room upgrades, etc.
   */
  function calculateGuestIncome(guests, minutes) {
    const { mix, population } = guests;
    if (!population || population <= 0) return 0;

    let total = 0;
    Object.entries(mix).forEach(([typeId, proportion]) => {
      if (proportion <= 0) return;
      const type = HotelConfig.GUEST_TYPES[typeId];
      if (!type) return;
      total += population * proportion * type.incomePerGuestPerMin * minutes;
    });

    return Math.floor(total);
  }

  /* ────────────────────────────────────────────────────────────
     SPECIAL GUESTS  (VIP / High Roller)
     ─────────────────────────────────────────────────────────── */

  /**
   * Check whether special guests arrive or depart this tick.
   * Returns an array of event objects for hotel-engine to process.
   */
  function checkSpecialGuests(state) {
    const rep        = state.currencies.reputation;
    const depts      = state.departments;
    const barLevel   = depts.bar?.level  ?? 0;
    const spaLevel   = depts.spa?.level  ?? 0;
    const casinoLevel= depts.casino?.level ?? 1;
    const events     = [];

    // ── VIP arrival ──
    if (!state.guests.vipPresent && rep >= 12) {
      const chance = VIP_BASE_CHANCE + barLevel * 0.008 + spaLevel * 0.008;
      if (Math.random() < chance) {
        const durationMs = (2 + Math.random() * 6) * 3_600_000;   // 2–8 hours
        events.push({ type: 'vip_arrival', departAt: Date.now() + durationMs });
      }
    }

    // ── VIP departure ──
    if (state.guests.vipPresent && state.guests.vipDepartsAt &&
        Date.now() >= state.guests.vipDepartsAt) {
      events.push({ type: 'vip_departure' });
    }

    // ── High Roller (rarer — needs casino Lv 3 + rep 20) ──
    if (!state.guests.highRollerPresent && rep >= 20 && casinoLevel >= 3) {
      if (Math.random() < 0.004) {
        events.push({ type: 'high_roller_arrival' });
      }
    }

    // ── High Roller flag auto-clear after 4 hours ──
    // (HR visits are tracked as a flag, not a timer, so we clear after a
    //  random duration so they don't persist forever)
    if (state.guests.highRollerPresent && Math.random() < 0.008) {
      events.push({ type: 'high_roller_departure' });
    }

    return events;
  }

  /* ────────────────────────────────────────────────────────────
     SATISFACTION ROLLING AVERAGE
     ─────────────────────────────────────────────────────────── */

  /**
   * Exponential moving average of satisfaction.
   * Used by the reputation formula (sat consistently above 80 = rep boost).
   */
  function updateRollingAverage(state) {
    const current = state.satisfaction.current;
    const prev    = state.satisfaction.rollingAverage ?? current;
    return parseFloat((0.95 * prev + 0.05 * current).toFixed(1));
  }

  /* ────────────────────────────────────────────────────────────
     OFFLINE RESTORE
     Quickly snap population to a reasonable value after the
     player was away for a long time.
     ─────────────────────────────────────────────────────────── */

  function restoreFromOffline(state, elapsedMs) {
    const LONG_ABSENCE_MS = 30 * 60_000;   // 30 minutes
    if (elapsedMs < LONG_ABSENCE_MS) return null;   // short absence — use normal tick

    // After a long absence, population stabilises toward target
    const target = targetPopulation(state);
    const current = state.guests.population;
    // Snap 70% of the way toward target
    const restored = Math.round(current + (target - current) * 0.7);
    const mix      = calculateMix(state.currencies.reputation);
    const rollingAverage = updateRollingAverage(state);

    return {
      population:    Math.max(0, restored),
      checkInRate:   state.guests.checkInRate,
      checkOutRate:  state.guests.checkOutRate,
      mix,
      guestIncome:   0,    // handled by the income calc elsewhere
      specialEvents: [],
      rollingAverage,
    };
  }

  /* ────────────────────────────────────────────────────────────
     FULL TICK  (called by hotel-engine every 60 s)
     ─────────────────────────────────────────────────────────── */

  function tick(state) {
    const { population, checkInRate, checkOutRate } = tickPopulation(state);
    const mix            = calculateMix(state.currencies.reputation);
    const guestIncome    = calculateGuestIncome({ mix, population }, 1);   // 1 min
    const specialEvents  = checkSpecialGuests(state);
    const rollingAverage = updateRollingAverage(state);

    return { population, checkInRate, checkOutRate, mix, guestIncome, specialEvents, rollingAverage };
  }

  /* ────────────────────────────────────────────────────────────
     UI HELPERS
     ─────────────────────────────────────────────────────────── */

  /** Guest type the player is closest to unlocking next. */
  function nextUnlock(reputation) {
    return Object.values(HotelConfig.GUEST_TYPES)
      .filter(g => !g.isSpecialEvent && g.reputationRequired > reputation)
      .sort((a, b) => a.reputationRequired - b.reputationRequired)[0] ?? null;
  }

  /** Friendly label for a guest count relative to capacity. */
  function occupancyLabel(population, capacity) {
    const pct = capacity > 0 ? Math.round((population / capacity) * 100) : 0;
    if (pct >= 120) return 'Overbooked';
    if (pct >= 95)  return 'Full House';
    if (pct >= 75)  return 'Busy';
    if (pct >= 50)  return 'Moderate';
    if (pct >= 25)  return 'Quiet';
    return 'Near Empty';
  }

  /** Summary object the UI panel uses — one call to build the whole panel. */
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
  };
})();

if (typeof window !== 'undefined') window.HotelGuests = HotelGuests;