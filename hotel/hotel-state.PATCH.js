/* ============================================================
   HOTEL-STATE.JS — PATCH FILE
   ------------------------------------------------------------
   This file is NOT a drop-in replacement. Apply each block to
   the matching location in your existing hotel-state.js. Search
   for the ANCHOR comments to find the right spot.

   What this patch adds:
   • Schema v2 — guests.roster[] and guests.checkInBoostRemaining
   • Migration v1 → v2
   • Roster CRUD methods
   • Boost API: applyCheckInBoost, consumeCheckInBoost, getCheckInBoost
   ============================================================ */


/* ── PATCH 1 ────────────────────────────────────────────────
   ANCHOR: const SCHEMA_VERSION = 1;
   REPLACE with:                                              */
const SCHEMA_VERSION = 2;


/* ── PATCH 2 ────────────────────────────────────────────────
   ANCHOR: inside createNewSave(), the `guests:` block
   currently ends with:
        stats: { totalHosted:0, vipsHosted:0, ... },
      },

   REPLACE the entire `guests:` block with:                   */
      guests: {
        population:          5,
        checkInRate:         2,
        checkOutRate:        1,
        mix: {
          budgetTraveler: 1.0, tourist: 0, gambler: 0,
          businessGuest:  0,   vip: 0,     highRoller: 0,
        },
        vipPresent:          false,
        highRollerPresent:   false,
        vipDepartsAt:        null,

        // ── NEW IN v2 ────────────────────────────────────
        // Named guest roster (one entry per checked-in guest)
        roster:              [],
        // Remaining "extra arrival" rolls from check-in game shifts
        checkInBoostRemaining: 0,
        // Lifetime counter — distinct from population
        rosterIdCounter:     0,
        // ─────────────────────────────────────────────────

        stats: { totalHosted:0, vipsHosted:0, highRollersHosted:0, totalSpent:0 },
      },


/* ── PATCH 3 ────────────────────────────────────────────────
   ANCHOR: function migrate(state) { ...
   The existing function ends with:
        return state;
      }

   REPLACE the entire migrate() function with:               */
  function migrate(state) {
    const v = state?.meta?.version ?? 0;

    // v0 → v1: add casinoBridge if missing
    if (v < 1) {
      state.meta = state.meta ?? {};
      state.meta.version  = 1;
      state.casinoBridge  = state.casinoBridge  ?? createNewSave().casinoBridge;
      state.guests        = state.guests        ?? createNewSave().guests;
      state.achievements  = state.achievements  ?? createNewSave().achievements;
    }

    // v1 → v2: add roster + boost fields to guests
    if (state.meta.version < 2) {
      state.guests = state.guests ?? {};
      if (!Array.isArray(state.guests.roster))     state.guests.roster = [];
      if (typeof state.guests.checkInBoostRemaining !== 'number')
        state.guests.checkInBoostRemaining = 0;
      if (typeof state.guests.rosterIdCounter !== 'number')
        state.guests.rosterIdCounter = state.guests.roster.length;
      state.meta.version = 2;
    }

    return state;
  }


/* ── PATCH 4 ────────────────────────────────────────────────
   ANCHOR: just BEFORE the `function resetSave() { ... }` line
   (i.e. the last public mutator before the helpers/return block)

   ADD these new functions:                                  */

  /* ─────────────── ROSTER ─────────────── */

  /** Add a guest to the persistent roster. Returns the entry. */
  function addGuestToRoster(guest) {
    if (!guest || !guest.type) return null;

    const now = Date.now();

    // Derive stay duration in real ms from totalIncome / incomePerGuestPerMin
    // Fallback: 20–40 real minutes
    const cfg     = HotelConfig.GUEST_TYPES[guest.type];
    const ipm     = guest.incomePerMin ?? cfg?.incomePerGuestPerMin ?? 2;
    const total   = guest.totalIncome  ?? Math.round((20 + Math.random() * 20) * ipm);
    const stayMs  = Math.max(60_000, Math.round((total / ipm) * 60_000));

    _state.guests.rosterIdCounter++;
    const entry = {
      id:            guest.id ?? `guest_${_state.guests.rosterIdCounter.toString().padStart(5, '0')}`,
      type:          guest.type,
      name:          guest.name ?? null,
      lastName:      guest.lastName ?? null,
      flagEmoji:     guest.flagEmoji ?? '',
      origin:        guest.origin ?? null,
      roomNumber:    guest.roomAssigned ?? guest.roomNumber ?? null,
      roomType:      guest.roomType ?? null,
      partySize:     guest.partySize ?? 1,
      preferences:   Array.isArray(guest.preferences) ? guest.preferences : [],
      matchQuality:  guest.matchQuality ?? null,
      isReturning:   !!guest.isReturning,
      checkedInAt:   guest.checkedInAt ?? now,
      checkOutAt:    guest.checkOutAt  ?? now + stayMs,
      incomePerMin:  ipm,
      totalIncome:   total,
      incomeCollected: 0,
      source:        guest.source ?? 'checkin_game',
    };

    _state.guests.roster.push(entry);
    _state.guests.stats.totalHosted++;

    // Population is the bigger of the simulated count and the actual roster size
    _state.guests.population = Math.max(_state.guests.population, _state.guests.roster.length);

    save();
    return entry;
  }

  /** Remove a guest from the roster by id. */
  function removeGuestFromRoster(guestId) {
    const idx = _state.guests.roster.findIndex(g => g.id === guestId);
    if (idx === -1) return false;
    _state.guests.roster.splice(idx, 1);
    _state.guests.population = Math.max(0, Math.min(_state.guests.population, _state.guests.roster.length + 1));
    save();
    return true;
  }

  /** Remove all roster entries whose checkOutAt has passed. Returns removed count. */
  function pruneExpiredFromRoster(now = Date.now()) {
    const before = _state.guests.roster.length;
    _state.guests.roster = _state.guests.roster.filter(g => g.checkOutAt > now);
    const removed = before - _state.guests.roster.length;
    if (removed > 0) save();
    return removed;
  }

  /** Read-only roster snapshot. */
  function getRoster() {
    return _state.guests.roster.slice();
  }

  /** Number of named guests currently in the hotel. */
  function getRosterCount() {
    return _state.guests.roster.length;
  }

  /* ─────────────── CHECK-IN BOOST ─────────────── */

  // Boost is capped so repeated grinding can't make population explode.
  const CHECK_IN_BOOST_CAP = 30;

  /** Add N extra arrival rolls to the next several ticks. */
  function applyCheckInBoost(n) {
    if (!Number.isFinite(n) || n <= 0) return 0;
    const current = _state.guests.checkInBoostRemaining ?? 0;
    const next    = Math.min(CHECK_IN_BOOST_CAP, current + Math.round(n));
    _state.guests.checkInBoostRemaining = next;
    save();
    return next;
  }

  /** Consume one boost charge if available. Returns 1 or 0. */
  function consumeCheckInBoost() {
    const c = _state.guests.checkInBoostRemaining ?? 0;
    if (c <= 0) return 0;
    _state.guests.checkInBoostRemaining = c - 1;
    save();
    return 1;
  }

  /** Current boost remaining (read-only). */
  function getCheckInBoost() {
    return _state.guests.checkInBoostRemaining ?? 0;
  }


/* ── PATCH 5 ────────────────────────────────────────────────
   ANCHOR: the `return { init, get, save, ... };` block at
   the bottom of the IIFE.

   ADD the new method names to the returned object. Append to
   the existing list:                                         */
  return {
    init, get, save, resetSave, createNewSave,
    getDept, getCash, getReputation, getSatisfaction,
    addHotelCash, spendHotelCash,
    setReputation, setSatisfaction, setSatisfactionComponents, setTrend,
    upgradeDept, unlockDept, updateTicker,
    updateCasinoBridge, setHighRollerFlag, clearHighRollerFlag,
    setGuestData, setVipPresent,
    unlockAchievement, tickAchievementProgress,

    // ── NEW IN v2 ──
    addGuestToRoster, removeGuestFromRoster, pruneExpiredFromRoster,
    getRoster, getRosterCount,
    applyCheckInBoost, consumeCheckInBoost, getCheckInBoost,
  };
