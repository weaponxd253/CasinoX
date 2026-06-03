/* ============================================================
   HOTEL MANAGER — STATE  (hotel-state.js)
   ------------------------------------------------------------
   Single source of truth for all mutable hotel data.
   One localStorage key: 'hotelGameState'.
   Auto-saves on every mutation via the proxy setters.
   ============================================================ */

const HotelState = (() => {
  const STORAGE_KEY = 'hotelGameState';
  const SCHEMA_VERSION = 2;

  let _state = null;

  /* ── Default save (new game) ─────────────────────────────── */
  function createNewSave(hotelName = 'Grand Casino Resort') {
    const now = Date.now();
    return {
      meta: {
        version:    SCHEMA_VERSION,
        saveId:     typeof crypto !== 'undefined'
                      ? crypto.randomUUID()
                      : `save_${now}`,
        hotelName,
        hotelTier:  1,
        createdAt:  now,
        lastSaved:  now,
        lastOpened: now,
      },
      currencies: {
        hotelCash:  HotelConfig.ECONOMY.STARTING_CASH,
        crowns:     0,
        reputation: 1,
      },
      departments: {
        lobby:         { unlocked:true,  level:1, lastCollected:now },
        casino:        { unlocked:true,  level:1, lastCollected:now },
        rooms:         { unlocked:true,  level:1, lastCollected:now },
        restaurant:    { unlocked:false, level:0, lastCollected:null },
        bar:           { unlocked:false, level:0, lastCollected:null },
        entertainment: { unlocked:false, level:0, lastCollected:null },
        spa:           { unlocked:false, level:0, lastCollected:null },
      },
      ticker: {
        lastTick:              now,
        offlineCapHours:       HotelConfig.ECONOMY.OFFLINE_CAP_HOURS,
        activeMultiplier:      1.0,
        activeMultiplierExpiry: null,
        totalMinutesActive:    0,
      },
      calendar: {
        day:            1,
        weekday:        0,
        phase:          'morning',
        lastAdvancedAt: now,
        reports:        [],
      },
      satisfaction: {
        current:        75,
        rollingAverage: 75,
        trend:          'stable',
        lastUpdated:    now,
        components: {
          roomComfort:        10,
          foodQuality:         0,
          entertainment:       0,
          overcrowdingPenalty: 0,
          maintenancePenalty:  0,
          securityPenalty:     0,
        },
      },
      // Phase 2 — guests stubbed out but present so the schema is complete
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
        roster:              [],
        checkInBoostRemaining: 0,
        rosterIdCounter:     0,
        stats: { totalHosted:0, vipsHosted:0, highRollersHosted:0, totalSpent:0 },
      },
      entertainment: {
        schedule: {
          bookings: [],
        },
        stats: {
          showsBooked: 0,
          showsCancelled: 0,
        },
      },
      stats: {
        hotelCashEarned: { total:0, fromRooms:0, fromCasino:0 },
        hotelCashSpent:  { total:0, onUpgrades:0 },
        totalTicksElapsed:   0,
        peakReputation:      1,
        peakSatisfaction:    75,
        upgradeCount:        0,
      },
      achievements: {
        reputationBonus: 0,
        unlocked:        [],
        progress: {
          'first_upgrade':      { current:0, required:1  },
          'five_upgrades':      { current:0, required:5  },
          'satisfaction_80':    { current:0, required:1  },
          'first_vip':          { current:0, required:1  },
          'ten_blackjack_wins': { current:0, required:10 },
          'jackpot_hit':        { current:0, required:1  },
          'full_house':         { current:0, required:1  },
          'all_depts_unlocked': { current:0, required:7  },
        },
      },
      casinoBridge: {
        activeMultiplier:  1.0,
        multiplierExpiry:  null,
        events: {
          blackjackWins:0, blackjackLosses:0, slotsSpun:0,
          jackpotsHit:0, coinFlipsWon:0, totalChipsWagered:0,
        },
        snapshot: {
          casinoLevel:1, chipBalance:100, playerLevel:1, lastSnapshot:null,
        },
      },
    };
  }

  /* ── Migration ───────────────────────────────────────────── */
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
    const fresh = createNewSave();
    state.guests = state.guests ?? fresh.guests;
    state.guests.mix = state.guests.mix ?? fresh.guests.mix;
    state.guests.stats = state.guests.stats ?? fresh.guests.stats;
    if (!Array.isArray(state.guests.roster)) state.guests.roster = [];
    if (typeof state.guests.checkInBoostRemaining !== 'number') state.guests.checkInBoostRemaining = 0;
    if (typeof state.guests.rosterIdCounter !== 'number') {
      state.guests.rosterIdCounter = state.guests.roster.length;
    }
    state.entertainment = state.entertainment ?? fresh.entertainment;
    state.entertainment.schedule = state.entertainment.schedule ?? fresh.entertainment.schedule;
    state.entertainment.schedule.bookings = state.entertainment.schedule.bookings ?? [];
    state.entertainment.stats = state.entertainment.stats ?? fresh.entertainment.stats;
    state.calendar = state.calendar ?? fresh.calendar;
    state.calendar.reports = state.calendar.reports ?? [];
    state.meta.version = SCHEMA_VERSION;
    return state;
  }

  /* ── Persistence ─────────────────────────────────────────── */
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return createNewSave();
      const parsed = JSON.parse(raw);
      return migrate(parsed);
    } catch (e) {
      console.warn('[HotelState] Corrupt save — starting fresh.', e);
      return createNewSave();
    }
  }

  function save() {
    if (!_state) return;
    _state.meta.lastSaved = Date.now();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(_state));
    } catch (e) {
      console.error('[HotelState] Save failed:', e);
    }
  }

  /* ── Init ────────────────────────────────────────────────── */
  function init() {
    _state = load();
    _state.meta.lastOpened = Date.now();
    save();
    return _state;
  }

  /* ── Getters ─────────────────────────────────────────────── */
  function get()               { return _state; }
  function getDept(id)         { return _state.departments[id]; }
  function getCash()           { return _state.currencies.hotelCash; }
  function getReputation()     { return _state.currencies.reputation; }
  function getSatisfaction()   { return _state.satisfaction.current; }

  /* ── Mutators (all auto-save) ────────────────────────────── */
  function addHotelCash(amount) {
    _state.currencies.hotelCash = round(_state.currencies.hotelCash + amount);
    _state.stats.hotelCashEarned.total = round(_state.stats.hotelCashEarned.total + amount);
    save();
  }

  function spendHotelCash(amount) {
    if (_state.currencies.hotelCash < amount) return false;
    _state.currencies.hotelCash = round(_state.currencies.hotelCash - amount);
    _state.stats.hotelCashSpent.total = round(_state.stats.hotelCashSpent.total + amount);
    save();
    return true;
  }

  function setReputation(value) {
    _state.currencies.reputation = Math.max(1, Math.round(value));
    if (_state.currencies.reputation > _state.stats.peakReputation) {
      _state.stats.peakReputation = _state.currencies.reputation;
    }
    save();
  }

  function setSatisfaction(value) {
    const clamped = Math.max(0, Math.min(100, Math.round(value)));
    _state.satisfaction.current = clamped;
    if (clamped > _state.stats.peakSatisfaction) {
      _state.stats.peakSatisfaction = clamped;
    }
    save();
  }

  function upgradeDept(deptId) {
    const dept    = _state.departments[deptId];
    const catalog = HotelConfig.UPGRADE_CATALOG[deptId];
    if (!dept || !catalog) return false;
    if (dept.level >= catalog.length) return false;   // already max
    const nextLevel = dept.level + 1;
    const cost      = catalog[nextLevel - 1].cost;
    if (!spendHotelCash(cost)) return false;
    dept.level = nextLevel;
    dept.unlocked = true;
    _state.stats.upgradeCount++;
    _state.stats.hotelCashSpent.onUpgrades = round(
      _state.stats.hotelCashSpent.onUpgrades + cost
    );
    save();
    return true;
  }

  function unlockDept(deptId) {
    if (_state.departments[deptId]) {
      _state.departments[deptId].unlocked = true;
      _state.departments[deptId].lastCollected = Date.now();
    }
    save();
  }

  function updateTicker(now) {
    _state.ticker.lastTick = now;
    _state.ticker.totalMinutesActive++;
    save();
  }

  function setSatisfactionComponents(components) {
    Object.assign(_state.satisfaction.components, components);
    save();
  }

  function setTrend(trend) {
    _state.satisfaction.trend = trend;
    save();
  }

  function updateCasinoBridge(events) {
    Object.assign(_state.casinoBridge.events, events);
    save();
  }

  function unlockAchievement(id) {
    if (_state.achievements.unlocked.includes(id)) return;
    const entry = HotelConfig.ACHIEVEMENT_CATALOG.find(a => a.id === id);
    if (!entry) return;
    _state.achievements.unlocked.push(id);
    _state.achievements.reputationBonus += entry.repBonus;
    save();
    return entry;
  }

  function tickAchievementProgress(id, increment = 1) {
    const prog = _state.achievements.progress[id];
    if (!prog || _state.achievements.unlocked.includes(id)) return null;
    prog.current = Math.min(prog.required, prog.current + increment);
    if (prog.current >= prog.required) return unlockAchievement(id);
    save();
    return null;
  }

  function setHighRollerFlag() {
    _state.guests.highRollerPresent = true;
    save();
  }

  /** Batch-update all guest simulation outputs from a single tick result. */
  function setGuestData({ population, checkInRate, checkOutRate, mix, rollingAverage }) {
    const g = _state.guests;
    if (population     !== undefined) g.population    = Math.max(0, Math.round(population));
    if (checkInRate    !== undefined) g.checkInRate   = checkInRate;
    if (checkOutRate   !== undefined) g.checkOutRate  = checkOutRate;
    if (mix)                          g.mix            = mix;
    if (rollingAverage !== undefined) _state.satisfaction.rollingAverage = rollingAverage;
    save();
  }

  function setVipPresent(present, departsAt = null) {
    _state.guests.vipPresent  = !!present;
    _state.guests.vipDepartsAt = departsAt;
    if (present) _state.guests.stats.vipsHosted++;
    save();
  }

  function clearHighRollerFlag() {
    _state.guests.highRollerPresent = false;
    save();
  }

  function bookEntertainmentShow(booking) {
    _state.entertainment = _state.entertainment ?? createNewSave().entertainment;
    _state.entertainment.schedule.bookings.push(booking);
    _state.entertainment.stats.showsBooked++;
    save();
  }

  function cancelEntertainmentShow(bookingId) {
    const bookings = _state.entertainment?.schedule?.bookings ?? [];
    const next = bookings.filter(b => b.id !== bookingId);
    if (next.length === bookings.length) return false;
    _state.entertainment.schedule.bookings = next;
    _state.entertainment.stats.showsCancelled++;
    save();
    return true;
  }

  function setCalendar(calendar) {
    Object.assign(_state.calendar, calendar);
    save();
  }

  function addCalendarReport(report) {
    _state.calendar.reports = _state.calendar.reports ?? [];
    _state.calendar.reports.unshift(report);
    _state.calendar.reports = _state.calendar.reports.slice(0, 8);
    save();
  }

  function addGuestToRoster(guest) {
    if (!guest || !guest.type) return null;

    const now = Date.now();
    const cfg = HotelConfig.GUEST_TYPES[guest.type];
    const ipm = guest.incomePerMin ?? cfg?.incomePerGuestPerMin ?? 2;
    const total = guest.totalIncome ?? Math.round((20 + Math.random() * 20) * ipm);
    const stayMs = Math.max(60_000, Math.round((total / Math.max(0.1, ipm)) * 60_000));

    _state.guests.roster = _state.guests.roster ?? [];
    _state.guests.rosterIdCounter = (_state.guests.rosterIdCounter ?? _state.guests.roster.length) + 1;

    const entry = {
      id:            guest.id ?? `guest_${String(_state.guests.rosterIdCounter).padStart(5, '0')}`,
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
      checkOutAt:    guest.checkOutAt ?? now + stayMs,
      incomePerMin:  ipm,
      totalIncome:   total,
      incomeCollected: 0,
      source:        guest.source ?? 'checkin_game',
    };

    _state.guests.roster.push(entry);
    _state.guests.stats.totalHosted++;
    _state.guests.population = Math.max(_state.guests.population, _state.guests.roster.length);
    save();
    return entry;
  }

  function removeGuestFromRoster(guestId) {
    const roster = _state.guests.roster ?? [];
    const idx = roster.findIndex(g => g.id === guestId);
    if (idx === -1) return false;
    roster.splice(idx, 1);
    _state.guests.population = Math.max(0, Math.min(_state.guests.population, roster.length + 1));
    save();
    return true;
  }

  function pruneExpiredFromRoster(now = Date.now()) {
    const roster = _state.guests.roster ?? [];
    const before = roster.length;
    _state.guests.roster = roster.filter(g => g.checkOutAt > now);
    const removed = before - _state.guests.roster.length;
    if (removed > 0) save();
    return removed;
  }

  function getRoster() {
    return [...(_state.guests.roster ?? [])];
  }

  function getRosterCount() {
    return (_state.guests.roster ?? []).length;
  }

  const CHECK_IN_BOOST_CAP = 30;

  function applyCheckInBoost(n) {
    if (!Number.isFinite(n) || n <= 0) return _state.guests.checkInBoostRemaining ?? 0;
    const current = _state.guests.checkInBoostRemaining ?? 0;
    const next = Math.min(CHECK_IN_BOOST_CAP, current + Math.round(n));
    _state.guests.checkInBoostRemaining = next;
    save();
    return next;
  }

  function consumeCheckInBoost() {
    const current = _state.guests.checkInBoostRemaining ?? 0;
    if (current <= 0) return 0;
    _state.guests.checkInBoostRemaining = current - 1;
    save();
    return 1;
  }

  function getCheckInBoost() {
    return _state.guests.checkInBoostRemaining ?? 0;
  }

  function resetSave() {
    _state = createNewSave();
    save();
  }

  /* ── Helpers ─────────────────────────────────────────────── */
  function round(n) {
    return Math.max(0, parseFloat(Number(n).toFixed(2)));
  }

  return {
    init, get, save, resetSave, createNewSave,
    getDept, getCash, getReputation, getSatisfaction,
    addHotelCash, spendHotelCash,
    setReputation, setSatisfaction, setSatisfactionComponents, setTrend,
    upgradeDept, unlockDept, updateTicker,
    updateCasinoBridge, setHighRollerFlag, clearHighRollerFlag,
    setGuestData, setVipPresent,
    bookEntertainmentShow, cancelEntertainmentShow,
    setCalendar, addCalendarReport,
    addGuestToRoster, removeGuestFromRoster, pruneExpiredFromRoster,
    getRoster, getRosterCount,
    applyCheckInBoost, consumeCheckInBoost, getCheckInBoost,
    unlockAchievement, tickAchievementProgress,
  };
})();

if (typeof window !== 'undefined') window.HotelState = HotelState;
