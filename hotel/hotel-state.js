/* ============================================================
   HOTEL MANAGER — STATE  (hotel-state.js)
   ------------------------------------------------------------
   Single source of truth for all mutable hotel data.
   One localStorage key: 'hotelGameState'.
   Auto-saves on every mutation via the proxy setters.
   ============================================================ */

const HotelState = (() => {
  const STORAGE_KEY = 'hotelGameState';
  const SCHEMA_VERSION = 6;

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
      staff: {
        morale: 78,
        payrollPerDay: 0,
        payrollPaidTotal: 0,
        applicantIdCounter: 0,
        lastApplicationDay: 0,
        applications: [],
        reports: [],
        moraleHistory: [],
        events: [],
        lastEventKey: '',
        quietEventShifts: 0,
        market: {
          terminations: 0,
          lastTerminationDay: 0,
        },
        roster: [
          { id:'front_desk_maya', name:'Maya Chen', role:'Front Desk', specialty:'lobby', assignment:'lobby', speed:7, service:8, discipline:7, stamina:92, trait:'Warm Welcome', level:1, xp:0, wage:42, trainingCount:0, promotionTier:0 },
          { id:'housekeeping_rosa', name:'Rosa Bell', role:'Housekeeping', specialty:'rooms', assignment:'rooms', speed:8, service:7, discipline:8, stamina:88, trait:'Fast Turnover', level:1, xp:0, wage:38, trainingCount:0, promotionTier:0 },
          { id:'runner_eli', name:'Eli Grant', role:'Room Service', specialty:'rooms', assignment:'rest', speed:9, service:6, discipline:6, stamina:84, trait:'Quick Runner', level:1, xp:0, wage:34, trainingCount:0, promotionTier:0 },
          { id:'host_nadia', name:'Nadia Vale', role:'Casino Host', specialty:'casino', assignment:'casino', speed:6, service:9, discipline:7, stamina:86, trait:'VIP Whisperer', level:1, xp:0, wage:58, trainingCount:0, promotionTier:0 },
          { id:'chef_marco', name:'Marco Reyes', role:'Restaurant Crew', specialty:'restaurant', assignment:'rest', speed:7, service:8, discipline:6, stamina:82, trait:'Tasting Notes', level:1, xp:0, wage:46, trainingCount:0, promotionTier:0 },
          { id:'security_owen', name:'Owen Price', role:'Security', specialty:'casino', assignment:'rest', speed:6, service:5, discipline:9, stamina:90, trait:'Calm Floor', level:1, xp:0, wage:44, trainingCount:0, promotionTier:0 },
          { id:'engineer_ivy', name:'Ivy Stone', role:'Maintenance', specialty:'rooms', assignment:'rest', speed:6, service:5, discipline:9, stamina:96, trait:'Quiet Fixes', level:1, xp:0, wage:48, trainingCount:0, promotionTier:0 },
          { id:'spa_lina', name:'Lina Park', role:'Spa Attendant', specialty:'spa', assignment:'rest', speed:6, service:9, discipline:7, stamina:91, trait:'Guest Recovery', level:1, xp:0, wage:40, trainingCount:0, promotionTier:0 },
        ],
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
    state.staff = state.staff ?? fresh.staff;
    if (!Array.isArray(state.staff.roster) || state.staff.roster.length === 0) {
      state.staff.roster = fresh.staff.roster;
    }
    if (typeof state.staff.morale !== 'number') state.staff.morale = fresh.staff.morale;
    if (typeof state.staff.payrollPerDay !== 'number') state.staff.payrollPerDay = fresh.staff.payrollPerDay;
    if (typeof state.staff.payrollPaidTotal !== 'number') state.staff.payrollPaidTotal = 0;
    if (typeof state.staff.applicantIdCounter !== 'number') state.staff.applicantIdCounter = 0;
    if (typeof state.staff.lastApplicationDay !== 'number') state.staff.lastApplicationDay = 0;
    if (!Array.isArray(state.staff.applications)) state.staff.applications = [];
    if (!Array.isArray(state.staff.reports)) state.staff.reports = [];
    if (!Array.isArray(state.staff.moraleHistory)) state.staff.moraleHistory = [];
    if (!Array.isArray(state.staff.events)) state.staff.events = [];
    if (typeof state.staff.lastEventKey !== 'string') state.staff.lastEventKey = '';
    if (typeof state.staff.quietEventShifts !== 'number') state.staff.quietEventShifts = 0;
    state.staff.market = state.staff.market ?? {};
    if (typeof state.staff.market.terminations !== 'number') state.staff.market.terminations = 0;
    if (typeof state.staff.market.lastTerminationDay !== 'number') state.staff.market.lastTerminationDay = 0;
    state.staff.roster = state.staff.roster.map((member, idx) => ({
      ...fresh.staff.roster[idx % fresh.staff.roster.length],
      ...member,
      assignment: member.assignment ?? member.specialty ?? 'rest',
      stamina: Math.max(0, Math.min(100, Math.round(member.stamina ?? 85))),
      speed: Math.max(1, Math.min(10, Math.round(member.speed ?? 5))),
      service: Math.max(1, Math.min(10, Math.round(member.service ?? 5))),
      discipline: Math.max(1, Math.min(10, Math.round(member.discipline ?? 5))),
      level: Math.max(1, Math.round(member.level ?? 1)),
      xp: Math.max(0, Math.round(member.xp ?? 0)),
      wage: Math.max(20, Math.round(member.wage ?? fresh.staff.roster[idx % fresh.staff.roster.length].wage ?? 36)),
      trainingCount: Math.max(0, Math.round(member.trainingCount ?? 0)),
      promotionTier: Math.max(0, Math.min(3, Math.round(member.promotionTier ?? 0))),
    }));
    normalizeStaffAssignments(state);
    ensureStaffApplications(state);
    state.staff.payrollPerDay = calculatePayrollPerDay(state.staff.roster);
    if (state.staff.moraleHistory.length === 0) {
      state.staff.moraleHistory.push({
        id: `morale_${Date.now()}`,
        createdAt: Date.now(),
        day: state.calendar?.day ?? 1,
        phase: state.calendar?.phase ?? 'morning',
        value: clampPct(state.staff.morale ?? fresh.staff.morale),
        delta: 0,
        reason: 'Baseline',
        tone: 'neutral',
      });
    }
    state.staff.moraleHistory = state.staff.moraleHistory.slice(0, 10);
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
    ensureStaffApplications(_state);
    ensureMoraleHistory(_state);
    _state.staff.payrollPerDay = calculatePayrollPerDay(_state.staff.roster);
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

  function getStaffRoster() {
    return [...(_state.staff?.roster ?? [])];
  }

  function getStaffReports() {
    return [...(_state.staff?.reports ?? [])];
  }

  function getStaffMoraleHistory() {
    return [...(_state.staff?.moraleHistory ?? [])];
  }

  function getStaffEvents() {
    return [...(_state.staff?.events ?? [])];
  }

  function calculatePayrollPerDay(roster = _state.staff?.roster ?? []) {
    return roster.reduce((sum, member) => sum + Math.round(member.wage ?? 36), 0);
  }

  function getTrainingCost(member) {
    if (!member) return 0;
    const level = Math.max(1, member.level ?? 1);
    const count = Math.max(0, member.trainingCount ?? 0);
    return Math.round(120 + level * 55 + count * 35);
  }

  const PROMOTION_LADDER = [
    { tier:0, label:'Associate', next:'Senior', reqLevel:2, reqBestStat:8, cost:650, wage:14, coverageBoost:0 },
    { tier:1, label:'Senior', next:'Lead', reqLevel:4, reqBestStat:9, cost:1600, wage:24, coverageBoost:0.10 },
    { tier:2, label:'Lead', next:'Manager', reqLevel:6, reqBestStat:10, cost:3600, wage:42, coverageBoost:0.22 },
    { tier:3, label:'Manager', next:null, reqLevel:null, reqBestStat:null, cost:null, wage:0, coverageBoost:0.38 },
  ];

  const DEPARTMENT_TITLE_TRACKS = {
    frontDesk: ['Front Desk Agent', 'Concierge', 'Guest Relations Lead', 'Lobby Manager'],
    housekeeping: ['Room Attendant', 'Floor Captain', 'Rooms Supervisor', 'Executive Housekeeper'],
    roomService: ['Service Runner', 'Suite Runner', 'Guest Services Lead', 'Rooms Service Manager'],
    casinoHost: ['Casino Host', 'VIP Host', 'Player Development Lead', 'Casino Floor Manager'],
    security: ['Security Officer', 'Floor Control Officer', 'Security Lead', 'Risk Manager'],
    restaurant: ['Dining Server', 'Dining Captain', 'Maître d’', 'Dining Director'],
    bar: ['Bartender', 'Mixologist', 'Bar Lead', 'Lounge Manager'],
    entertainment: ['Stage Liaison', 'Stage Manager', 'Production Lead', 'Entertainment Director'],
    spa: ['Spa Attendant', 'Therapist', 'Wellness Lead', 'Spa Director'],
    rooms: ['Rooms Associate', 'Rooms Specialist', 'Rooms Lead', 'Rooms Manager'],
    lobby: ['Lobby Associate', 'Concierge', 'Guest Relations Lead', 'Lobby Manager'],
    casino: ['Casino Associate', 'Casino Specialist', 'Pit Lead', 'Casino Manager'],
  };

  const APPLICANT_BLUEPRINTS = [
    { role:'Front Desk', specialty:'lobby', desiredDepartment:'lobby', names:['Avery Holt', 'Nora Kim', 'Theo Marsh'], traits:['Polished Welcome', 'Fast Check-In', 'Guest Memory'], stats:{ speed:6, service:8, discipline:6 }, wage:38 },
    { role:'Housekeeping', specialty:'rooms', desiredDepartment:'rooms', names:['June Patel', 'Miles Reed', 'Clara Vos'], traits:['Sharp Turnover', 'Quiet Detail', 'Linen Lead'], stats:{ speed:8, service:6, discipline:8 }, wage:36 },
    { role:'Room Service', specialty:'rooms', desiredDepartment:'rooms', names:['Sam Ortega', 'Leah Ford', 'Noel Banks'], traits:['Fast Runner', 'Tray Balance', 'Late Shift'], stats:{ speed:8, service:7, discipline:6 }, wage:34 },
    { role:'Casino Host', specialty:'casino', desiredDepartment:'casino', names:['Bianca Stone', 'Drew Vale', 'Rina Cole'], traits:['VIP Read', 'Table Charm', 'Comp Sense'], stats:{ speed:6, service:8, discipline:7 }, wage:52 },
    { role:'Security', specialty:'casino', desiredDepartment:'casino', names:['Grant Pike', 'Tessa Ward', 'Malik Cross'], traits:['Calm Floor', 'Risk Watch', 'Steady Post'], stats:{ speed:6, service:5, discipline:9 }, wage:44 },
    { role:'Restaurant Crew', specialty:'restaurant', desiredDepartment:'restaurant', names:['Ana Silva', 'Bennett Shaw', 'Mina Frost'], traits:['Table Rhythm', 'Menu Memory', 'Warm Service'], stats:{ speed:7, service:8, discipline:6 }, wage:42 },
    { role:'Bar Crew', specialty:'bar', desiredDepartment:'bar', names:['Iris Quinn', 'Cal West', 'Sofia Lane'], traits:['Fast Pour', 'Regulars Know', 'Clean Close'], stats:{ speed:8, service:7, discipline:6 }, wage:40 },
    { role:'Entertainment Crew', specialty:'entertainment', desiredDepartment:'entertainment', names:['Rafi Moon', 'Elena Fox', 'Jules Penn'], traits:['Stage Timing', 'Crowd Pulse', 'Show Runner'], stats:{ speed:7, service:6, discipline:7 }, wage:46 },
    { role:'Spa Attendant', specialty:'spa', desiredDepartment:'spa', names:['Priya Wells', 'Omar Lin', 'Mae Rivers'], traits:['Quiet Luxury', 'Guest Recovery', 'Wellness Notes'], stats:{ speed:5, service:9, discipline:7 }, wage:39 },
  ];

  const TRAIT_EFFECTS = {
    'Warm Welcome': { department:'lobby', patience:0.07, satisfaction:1, copy:'+7% lobby patience, +1 satisfaction' },
    'Polished Welcome': { department:'lobby', patience:0.06, quality:0.25, copy:'+6% lobby patience, cleaner check-ins' },
    'Fast Check-In': { department:'lobby', speed:-0.05, copy:'Lobby service runs 5% faster' },
    'Guest Memory': { department:'lobby', income:0.03, satisfaction:1, copy:'+3% lobby income, +1 satisfaction' },
    'Fast Turnover': { department:'rooms', speed:-0.06, copy:'Room service runs 6% faster' },
    'Sharp Turnover': { department:'rooms', speed:-0.05, copy:'Room requests run 5% faster' },
    'Quiet Detail': { department:'rooms', quality:0.3, satisfaction:1, copy:'Better room quality, +1 satisfaction' },
    'Linen Lead': { department:'rooms', satisfaction:1, stamina:0.04, copy:'+1 satisfaction, lighter fatigue' },
    'Quick Runner': { department:'rooms', speed:-0.05, income:0.02, copy:'Rooms run 5% faster, +2% income' },
    'Fast Runner': { department:'rooms', speed:-0.05, copy:'Room service runs 5% faster' },
    'Tray Balance': { department:'rooms', quality:0.25, copy:'Fewer room-service mistakes' },
    'Late Shift': { department:'rooms', stamina:0.06, copy:'Lighter fatigue on room shifts' },
    'VIP Whisperer': { department:'casino', income:0.06, satisfaction:1, copy:'+6% casino income, +1 satisfaction' },
    'VIP Read': { department:'casino', income:0.05, copy:'+5% casino income' },
    'Table Charm': { department:'casino', patience:0.04, income:0.03, copy:'+4% patience, +3% casino income' },
    'Comp Sense': { department:'casino', quality:0.25, income:0.03, copy:'Better casino quality, +3% income' },
    'Calm Floor': { department:'casino', quality:0.35, satisfaction:1, copy:'Calmer casino floor, +1 satisfaction' },
    'Risk Watch': { department:'casino', quality:0.4, copy:'Stronger casino discipline' },
    'Steady Post': { department:'casino', stamina:0.05, copy:'Lighter fatigue on casino shifts' },
    'Tasting Notes': { department:'restaurant', quality:0.35, satisfaction:1, copy:'Better food quality, +1 satisfaction' },
    'Table Rhythm': { department:'restaurant', speed:-0.04, quality:0.2, copy:'Restaurant runs 4% faster' },
    'Menu Memory': { department:'restaurant', quality:0.3, copy:'Better restaurant quality' },
    'Warm Service': { department:'restaurant', patience:0.04, satisfaction:1, copy:'+4% patience, +1 satisfaction' },
    'Fast Pour': { department:'bar', speed:-0.05, income:0.02, copy:'Bar runs 5% faster, +2% income' },
    'Regulars Know': { department:'bar', income:0.04, satisfaction:1, copy:'+4% bar income, +1 satisfaction' },
    'Clean Close': { department:'bar', quality:0.25, stamina:0.04, copy:'Cleaner bar shifts, lighter fatigue' },
    'Stage Timing': { department:'entertainment', speed:-0.04, quality:0.25, copy:'Shows resolve faster with better timing' },
    'Crowd Pulse': { department:'entertainment', income:0.04, satisfaction:1, copy:'+4% show income, +1 satisfaction' },
    'Show Runner': { department:'entertainment', speed:-0.05, copy:'Entertainment work runs 5% faster' },
    'Quiet Luxury': { department:'spa', patience:0.05, quality:0.25, copy:'+5% spa patience, better quality' },
    'Guest Recovery': { department:'spa', satisfaction:2, copy:'+2 satisfaction from spa coverage' },
    'Wellness Notes': { department:'spa', quality:0.3, stamina:0.04, copy:'Better spa quality, lighter fatigue' },
    'Quiet Fixes': { department:'rooms', quality:0.25, satisfaction:1, copy:'Subtle room fixes, +1 satisfaction' },
  };

  function availableApplicationBlueprints(state = _state) {
    return APPLICANT_BLUEPRINTS.filter(bp =>
      bp.desiredDepartment === 'lobby' || state.departments?.[bp.desiredDepartment]?.unlocked
    );
  }

  function generateStaffApplicant(state = _state) {
    state.staff.applicantIdCounter = (state.staff.applicantIdCounter ?? 0) + 1;
    const pool = availableApplicationBlueprints(state);
    const bp = pool[(state.staff.applicantIdCounter - 1) % Math.max(1, pool.length)] ?? APPLICANT_BLUEPRINTS[0];
    const market = getStaffMarket(state);
    const repBoost = Math.min(3, Math.floor((state.currencies?.reputation ?? 1) / 20));
    const marketBoost = market.qualityShift;
    const variation = ((state.staff.applicantIdCounter * 7) % 3) - 1;
    const level = Math.max(1, 1 + (state.staff.applicantIdCounter % 5 === 0 ? 1 : 0) + (marketBoost >= 2 && state.staff.applicantIdCounter % 4 === 0 ? 1 : 0));
    const name = bp.names[(state.staff.applicantIdCounter - 1) % bp.names.length];
    const trait = bp.traits[(state.staff.applicantIdCounter + 1) % bp.traits.length];
    const stats = {
      speed: Math.max(3, Math.min(10, bp.stats.speed + variation + repBoost + marketBoost)),
      service: Math.max(3, Math.min(10, bp.stats.service + ((variation + 1) % 3 - 1) + repBoost + marketBoost)),
      discipline: Math.max(3, Math.min(10, bp.stats.discipline - variation + repBoost + marketBoost)),
    };
    const wagePressure = market.wagePressure;
    const wage = Math.round(bp.wage + repBoost * 5 + level * 4 + Math.max(...Object.values(stats)) + wagePressure);
    return {
      id: `applicant_${String(state.staff.applicantIdCounter).padStart(4, '0')}`,
      name,
      role: bp.role,
      specialty: bp.specialty,
      desiredDepartment: bp.desiredDepartment,
      speed: stats.speed,
      service: stats.service,
      discipline: stats.discipline,
      stamina: Math.max(70, Math.min(100, 82 + ((state.staff.applicantIdCounter * 11) % 17))),
      trait,
      level,
      wage,
      onboardingCost: Math.round(wage * (level + 5)),
      status: 'new',
      appliedAtDay: state.calendar?.day ?? 1,
      marketLabel: market.label,
      marketNote: market.applicantNote,
      reviewNote: '',
    };
  }

  function normalizeStaffApplicant(applicant) {
    const fallback = APPLICANT_BLUEPRINTS[0];
    return {
      id: applicant.id ?? `applicant_${Date.now()}`,
      name: applicant.name ?? 'New Applicant',
      role: applicant.role ?? fallback.role,
      specialty: applicant.specialty ?? fallback.specialty,
      desiredDepartment: applicant.desiredDepartment ?? fallback.desiredDepartment,
      trait: applicant.trait ?? fallback.traits[0],
      appliedAtDay: applicant.appliedAtDay ?? 1,
      ...applicant,
      speed: Math.max(1, Math.min(10, Math.round(applicant.speed ?? fallback.stats.speed))),
      service: Math.max(1, Math.min(10, Math.round(applicant.service ?? fallback.stats.service))),
      discipline: Math.max(1, Math.min(10, Math.round(applicant.discipline ?? fallback.stats.discipline))),
      stamina: Math.max(0, Math.min(100, Math.round(applicant.stamina ?? 84))),
      level: Math.max(1, Math.round(applicant.level ?? 1)),
      wage: Math.max(20, Math.round(applicant.wage ?? 36)),
      onboardingCost: Math.max(80, Math.round(applicant.onboardingCost ?? 220)),
      status: ['new', 'reviewed', 'shortlisted'].includes(applicant.status) ? applicant.status : 'new',
      marketLabel: applicant.marketLabel ?? '',
      marketNote: applicant.marketNote ?? '',
      reviewNote: applicant.reviewNote ?? '',
    };
  }

  function ensureStaffApplications(state = _state) {
    state.staff = state.staff ?? createNewSave().staff;
    state.staff.applications = (state.staff.applications ?? []).map(normalizeStaffApplicant).slice(0, 6);
    const currentDay = state.calendar?.day ?? 1;
    const shouldRefresh = state.staff.applications.length === 0 || state.staff.lastApplicationDay !== currentDay;
    if (!shouldRefresh) return state.staff.applications;

    const keep = state.staff.applications.filter(app => app.status === 'shortlisted');
    state.staff.applications = keep.slice(0, 2);
    while (state.staff.applications.length < 4) {
      state.staff.applications.push(generateStaffApplicant(state));
    }
    state.staff.lastApplicationDay = currentDay;
    return state.staff.applications;
  }

  function staffTitleTrack(member) {
    if (!member) return DEPARTMENT_TITLE_TRACKS.lobby;
    const role = String(member.role ?? '').toLowerCase();
    if (role.includes('front')) return DEPARTMENT_TITLE_TRACKS.frontDesk;
    if (role.includes('housekeeping')) return DEPARTMENT_TITLE_TRACKS.housekeeping;
    if (role.includes('room service')) return DEPARTMENT_TITLE_TRACKS.roomService;
    if (role.includes('casino host')) return DEPARTMENT_TITLE_TRACKS.casinoHost;
    if (role.includes('security')) return DEPARTMENT_TITLE_TRACKS.security;
    if (role.includes('restaurant')) return DEPARTMENT_TITLE_TRACKS.restaurant;
    if (role.includes('bar')) return DEPARTMENT_TITLE_TRACKS.bar;
    if (role.includes('entertainment')) return DEPARTMENT_TITLE_TRACKS.entertainment;
    if (role.includes('spa')) return DEPARTMENT_TITLE_TRACKS.spa;
    return DEPARTMENT_TITLE_TRACKS[member.specialty] ?? DEPARTMENT_TITLE_TRACKS.lobby;
  }

  function getPromotionTitle(member) {
    const tier = Math.max(0, Math.min(3, member?.promotionTier ?? 0));
    return staffTitleTrack(member)[tier] ?? `${PROMOTION_LADDER[tier].label} ${member?.role ?? 'Staff'}`;
  }

  function getStaffStatCap(member) {
    return 10 + Math.max(0, Math.min(3, member?.promotionTier ?? 0));
  }

  function getPromotionInfo(member) {
    if (!member) return { eligible:false, reason:'Missing staff' };
    const tier = Math.max(0, Math.min(3, member.promotionTier ?? 0));
    const current = PROMOTION_LADDER[tier];
    const next = PROMOTION_LADDER[tier + 1];
    if (!next) {
      return { eligible:false, maxed:true, title:getPromotionTitle(member), label:current.label, reason:'Max promotion' };
    }
    const bestStat = Math.max(member.speed ?? 0, member.service ?? 0, member.discipline ?? 0);
    const levelOk = (member.level ?? 1) >= current.reqLevel;
    const statOk = bestStat >= current.reqBestStat;
    const cost = current.cost;
    const eligible = levelOk && statOk;
    return {
      eligible,
      tier,
      nextTier:tier + 1,
      label:current.label,
      nextLabel:next.label,
      title:getPromotionTitle(member),
      nextTitle:staffTitleTrack(member)[tier + 1] ?? `${next.label} ${member.role}`,
      cost,
      reqLevel:current.reqLevel,
      reqBestStat:current.reqBestStat,
      bestStat,
      levelOk,
      statOk,
      coverageBoost:next.coverageBoost,
      reason: eligible ? 'Ready' : `Requires Lv ${current.reqLevel} and one stat ${current.reqBestStat}+`,
    };
  }

  function getStaffForAssignment(assignment) {
    return (_state.staff?.roster ?? []).filter(member => member.assignment === assignment);
  }

  function getStaffSlotLimit(assignment, state = _state) {
    if (!assignment || assignment === 'rest') return Infinity;
    const dept = state.departments?.[assignment];
    if (assignment !== 'lobby' && (!dept?.unlocked || (dept.level ?? 0) <= 0)) return 0;
    const level = Math.max(1, dept?.level ?? 1);
    if (assignment === 'lobby') return Math.min(3, 1 + Math.floor(level / 3) + Math.max(0, (state.meta?.hotelTier ?? 1) - 1));
    return Math.min(3, 1 + Math.floor((level - 1) / 2));
  }

  function getStaffSlotInfo(assignment, state = _state) {
    const limit = getStaffSlotLimit(assignment, state);
    const used = assignment === 'rest'
      ? (_state.staff?.roster ?? []).filter(member => member.assignment === 'rest').length
      : (state.staff?.roster ?? []).filter(member => member.assignment === assignment).length;
    const available = limit === Infinity ? Infinity : Math.max(0, limit - used);
    return { assignment, used, limit, available, full: limit !== Infinity && used >= limit };
  }

  function normalizeStaffAssignments(state = _state) {
    const used = {};
    (state.staff?.roster ?? []).forEach(member => {
      const assignment = member.assignment ?? 'rest';
      if (assignment === 'rest') {
        member.assignment = 'rest';
        return;
      }
      const limit = getStaffSlotLimit(assignment, state);
      const count = used[assignment] ?? 0;
      if (limit <= 0 || count >= limit) {
        member.assignment = 'rest';
        return;
      }
      used[assignment] = count + 1;
    });
  }

  function getStaffTraitEffect(member, assignment = member?.assignment ?? member?.desiredDepartment ?? member?.specialty) {
    const trait = member?.trait ?? '';
    const base = TRAIT_EFFECTS[trait] ?? null;
    const target = assignment ?? member?.assignment ?? member?.specialty;
    const applies = !!base && (!base.department || base.department === target);
    const fallbackCopy = trait ? 'Reliable personality fit' : 'No trait bonus';
    return {
      trait,
      department: base?.department ?? member?.specialty ?? target,
      applies,
      patience: applies ? base?.patience ?? 0 : 0,
      speed: applies ? base?.speed ?? 0 : 0,
      income: applies ? base?.income ?? 0 : 0,
      quality: applies ? base?.quality ?? 0 : 0,
      satisfaction: applies ? base?.satisfaction ?? 0 : 0,
      stamina: applies ? base?.stamina ?? 0 : 0,
      copy: base?.copy ?? fallbackCopy,
    };
  }

  function getStaffTraitSummary(assignment, state = _state) {
    const assigned = (state.staff?.roster ?? []).filter(member => member.assignment === assignment);
    const totals = assigned.reduce((sum, member) => {
      const effect = getStaffTraitEffect(member, assignment);
      if (!effect.applies) return sum;
      sum.patience += effect.patience;
      sum.speed += effect.speed;
      sum.income += effect.income;
      sum.quality += effect.quality;
      sum.satisfaction += effect.satisfaction;
      sum.stamina += effect.stamina;
      sum.active.push({ staffId:member.id, name:member.name, trait:effect.trait, copy:effect.copy });
      return sum;
    }, { patience:0, speed:0, income:0, quality:0, satisfaction:0, stamina:0, active:[] });
    return {
      ...totals,
      label: totals.active.length ? totals.active.map(item => item.trait).join(', ') : 'No active trait bonuses',
    };
  }

  function getStaffCoverage(assignment, state = _state) {
    const staff = state.staff?.roster ?? [];
    const assigned = staff.filter(member => member.assignment === assignment);
    const deptLevel = Math.max(1, state.departments?.[assignment]?.level ?? 1);
    const demand = assignment === 'lobby'
      ? Math.max(1, Math.ceil((state.guests?.population ?? 0) / 18))
      : Math.max(1, Math.ceil(deptLevel / 2));
    const raw = assigned.reduce((sum, member) => {
      const specialtyBonus = member.specialty === assignment ? 1.25 : 1;
      const staminaMult = Math.max(0.45, (member.stamina ?? 80) / 100);
      const baseScore = ((member.speed ?? 5) + (member.service ?? 5) + (member.discipline ?? 5)) / 3;
      const promotion = PROMOTION_LADDER[Math.max(0, Math.min(3, member.promotionTier ?? 0))]?.coverageBoost ?? 0;
      return sum + baseScore * specialtyBonus * staminaMult * (1 + promotion);
    }, 0);
    const ratio = raw / Math.max(1, demand * 8);
    const traitSummary = getStaffTraitSummary(assignment, state);
    const score = Math.max(0, Math.min(100, Math.round(ratio * 100 + traitSummary.quality * 10)));
    const status = score >= 85 ? 'covered' : score >= 55 ? 'thin' : 'short';
    const slots = getStaffSlotInfo(assignment, state);
    return { assignment, assigned, assignedCount: assigned.length, demand, raw, ratio, score, status, slots, traitSummary };
  }

  function getStaffEffect(assignment, state = _state) {
    const coverage = getStaffCoverage(assignment, state);
    const ratio = Math.max(0, Math.min(1.25, coverage.ratio));
    const moraleMult = 0.9 + Math.max(0, Math.min(100, state.staff?.morale ?? 75)) / 500;
    return {
      ...coverage,
      label: coverage.status === 'covered' ? 'Covered' : coverage.status === 'thin' ? 'Thin' : 'Short',
      moraleMult,
      patienceMult: 1 + Math.min(0.42, ratio * 0.28 * moraleMult + (coverage.traitSummary?.patience ?? 0)),
      speedMult: Math.max(0.65, 1 - Math.min(0.28, ratio * 0.18 * moraleMult - (coverage.traitSummary?.speed ?? 0))),
      incomeMult: 1 + Math.min(0.24, ratio * 0.12 * moraleMult + (coverage.traitSummary?.income ?? 0)),
      qualityBonus: (coverage.score >= 85 ? 1 : coverage.score >= 55 ? 0.5 : 0) + (coverage.traitSummary?.quality ?? 0),
      satisfactionBonus: (coverage.score >= 85 ? 2 : coverage.score >= 55 ? 1 : 0) + Math.round(coverage.traitSummary?.satisfaction ?? 0),
      fatigueRelief: Math.min(0.18, coverage.traitSummary?.stamina ?? 0),
    };
  }

  function assignStaff(staffId, assignment) {
    const member = _state.staff?.roster?.find(s => s.id === staffId);
    if (!member) return { ok:false, reason:'missing_staff' };
    const target = assignment || 'rest';
    if (target !== 'rest' && member.assignment !== target) {
      const slots = getStaffSlotInfo(target);
      if (slots.full) return { ok:false, reason:'slots_full', slots };
    }
    member.assignment = target;
    save();
    return { ok:true, member };
  }

  function restStaff(staffId) {
    const member = _state.staff?.roster?.find(s => s.id === staffId);
    if (!member) return { ok:false, reason:'missing_staff' };
    member.assignment = 'rest';
    member.stamina = Math.min(100, Math.round((member.stamina ?? 80) + 8));
    save();
    return { ok:true, member };
  }

  function adjustStaffStamina(staffId, delta) {
    const member = _state.staff?.roster?.find(s => s.id === staffId);
    if (!member || !Number.isFinite(delta)) return false;
    member.stamina = Math.max(0, Math.min(100, Math.round((member.stamina ?? 80) + delta)));
    save();
    return true;
  }

  function trainStaff(staffId, stat) {
    const allowed = ['speed', 'service', 'discipline'];
    if (!allowed.includes(stat)) return { ok:false, reason:'invalid_stat' };
    const member = _state.staff?.roster?.find(s => s.id === staffId);
    if (!member) return { ok:false, reason:'missing_staff' };
    const cap = getStaffStatCap(member);
    if ((member[stat] ?? 0) >= cap) return { ok:false, reason:'maxed' };

    const cost = getTrainingCost(member);
    if (!spendHotelCash(cost)) return { ok:false, reason:'cash', cost };

    member[stat] = Math.min(cap, Math.round((member[stat] ?? 1) + 1));
    member.trainingCount = (member.trainingCount ?? 0) + 1;
    member.xp = (member.xp ?? 0) + 18;
    const required = staffXpRequired(member.level ?? 1);
    if (member.xp >= required) {
      member.xp -= required;
      member.level = (member.level ?? 1) + 1;
      member.wage = Math.round((member.wage ?? 36) + 6);
    } else {
      member.wage = Math.round((member.wage ?? 36) + 2);
    }
    adjustStaffMorale(1, `${member.name} trained`, 'good');
    _state.staff.payrollPerDay = calculatePayrollPerDay();
    addStaffReport({
      type: 'training',
      title: `${member.name} trained ${stat}`,
      detail: `${statLabel(stat)} increased to ${member[stat]}. Payroll is now $${_state.staff.payrollPerDay}/day.`,
      tone: 'good',
    }, false);
    save();
    return { ok:true, member, cost };
  }

  function staffXpRequired(level = 1) {
    return 36 + Math.max(1, level) * 14;
  }

  function promoteStaff(staffId) {
    const member = _state.staff?.roster?.find(s => s.id === staffId);
    if (!member) return { ok:false, reason:'missing_staff' };
    const info = getPromotionInfo(member);
    if (!info.eligible) return { ok:false, reason:'requirements', info };
    if (!spendHotelCash(info.cost)) return { ok:false, reason:'cash', cost:info.cost, info };

    member.promotionTier = info.nextTier;
    member.wage = Math.round((member.wage ?? 36) + (PROMOTION_LADDER[info.tier]?.wage ?? 0));
    member.xp = (member.xp ?? 0) + 12;
    adjustStaffMorale(3, `${member.name} promoted`, 'good');
    _state.staff.payrollPerDay = calculatePayrollPerDay();
    addStaffReport({
      type: 'promotion',
      title: `${member.name} promoted`,
      detail: `${member.name} is now ${getPromotionTitle(member)}. Stat cap ${getStaffStatCap(member)}. Payroll is now $${_state.staff.payrollPerDay}/day.`,
      tone: 'good',
    }, false);
    save();
    return { ok:true, member, info:getPromotionInfo(member) };
  }

  function getFireStaffImpact(member, state = _state) {
    if (!member) return { moraleDelta:0, label:'No staff selected' };
    const day = state.calendar?.day ?? 1;
    const tenure = Math.max(0, day - (member.hiredAtDay ?? 1));
    const avgStat = ((member.speed ?? 5) + (member.service ?? 5) + (member.discipline ?? 5)) / 3;
    const stamina = member.stamina ?? 80;
    const promoted = Math.max(0, member.promotionTier ?? 0);
    let moraleDelta = -3;

    if (tenure <= 1) moraleDelta -= 2;
    else if (tenure >= 7) moraleDelta -= 1;
    if (member.assignment && member.assignment !== 'rest' && member.assignment === member.specialty) moraleDelta -= 1;
    if (promoted > 0) moraleDelta -= promoted;
    if (avgStat >= 8) moraleDelta -= 1;
    if (stamina < 35 || avgStat < 5) moraleDelta += 2;

    moraleDelta = Math.max(-10, Math.min(-1, Math.round(moraleDelta)));
    const label = moraleDelta <= -7 ? 'Severe morale hit' : moraleDelta <= -4 ? 'Morale hit' : 'Small morale hit';
    return { moraleDelta, label };
  }

  function fireStaff(staffId) {
    const roster = _state.staff?.roster ?? [];
    const idx = roster.findIndex(s => s.id === staffId);
    if (idx === -1) return { ok:false, reason:'missing_staff' };
    if (roster.length <= 1) return { ok:false, reason:'last_staff' };

    const [member] = roster.splice(idx, 1);
    const impact = getFireStaffImpact(member);
    adjustStaffMorale(impact.moraleDelta, `${member.name} let go`, impact.moraleDelta <= -6 ? 'bad' : 'warn');
    _state.staff.market = _state.staff.market ?? {};
    _state.staff.market.terminations = (_state.staff.market.terminations ?? 0) + 1;
    _state.staff.market.lastTerminationDay = _state.calendar?.day ?? 1;
    _state.staff.payrollPerDay = calculatePayrollPerDay();
    normalizeStaffAssignments(_state);
    ensureStaffApplications(_state);
    addStaffReport({
      type: 'termination',
      title: `${member.name} let go`,
      detail: `${getPromotionTitle(member)} left ${deptLabel(member.assignment ?? member.specialty)}. Morale ${impact.moraleDelta}. Applicant market is now ${getStaffMarket(_state).label.toLowerCase()}. Payroll is now $${_state.staff.payrollPerDay}/day.`,
      tone: impact.moraleDelta <= -6 ? 'bad' : 'warn',
      moraleDelta: impact.moraleDelta,
      staffId: member.id,
      day: _state.calendar?.day ?? 1,
      phase: _state.calendar?.phase ?? 'morning',
    }, false);
    save();
    return { ok:true, member, impact };
  }

  function departmentFitScore(person, department = person?.desiredDepartment ?? person?.specialty ?? 'lobby') {
    if (!person) return 0;
    const weights = {
      lobby: { speed:0.3, service:0.45, discipline:0.25 },
      rooms: { speed:0.35, service:0.25, discipline:0.4 },
      casino: { speed:0.2, service:0.38, discipline:0.42 },
      restaurant: { speed:0.35, service:0.4, discipline:0.25 },
      bar: { speed:0.42, service:0.38, discipline:0.2 },
      entertainment: { speed:0.35, service:0.35, discipline:0.3 },
      spa: { speed:0.18, service:0.52, discipline:0.3 },
    }[department] ?? { speed:0.33, service:0.34, discipline:0.33 };
    const raw = (person.speed ?? 5) * weights.speed + (person.service ?? 5) * weights.service + (person.discipline ?? 5) * weights.discipline;
    const specialtyBonus = person.specialty === department ? 8 : 0;
    return Math.max(0, Math.min(100, Math.round(raw * 10 + specialtyBonus)));
  }

  function fitLabel(score) {
    if (score >= 88) return 'Excellent Fit';
    if (score >= 75) return 'Good Fit';
    if (score >= 62) return 'Workable Fit';
    return 'Risky Fit';
  }

  function applicationReviewNote(applicant) {
    const score = departmentFitScore(applicant, applicant.desiredDepartment);
    const trait = getStaffTraitEffect(applicant, applicant.desiredDepartment);
    const bestStat = [
      ['speed', applicant.speed ?? 0],
      ['service', applicant.service ?? 0],
      ['discipline', applicant.discipline ?? 0],
    ].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'service';
    const marketNote = applicant.marketNote ? ` ${applicant.marketNote}` : '';
    const traitNote = trait.applies ? ` Trait: ${trait.copy}.` : '';
    return `${fitLabel(score)} for ${deptLabel(applicant.desiredDepartment)}. Strongest area: ${statLabel(bestStat)}.${traitNote}${marketNote}`;
  }

  function getStaffApplications() {
    ensureStaffApplications(_state);
    save();
    return [...(_state.staff?.applications ?? [])];
  }

  function reviewStaffApplication(applicantId) {
    const applicant = _state.staff?.applications?.find(app => app.id === applicantId);
    if (!applicant) return { ok:false, reason:'missing_applicant' };
    applicant.status = applicant.status === 'shortlisted' ? 'shortlisted' : 'reviewed';
    applicant.reviewNote = applicationReviewNote(applicant);
    save();
    return { ok:true, applicant };
  }

  function shortlistStaffApplication(applicantId) {
    const applicant = _state.staff?.applications?.find(app => app.id === applicantId);
    if (!applicant) return { ok:false, reason:'missing_applicant' };
    applicant.status = applicant.status === 'shortlisted' ? 'reviewed' : 'shortlisted';
    if (!applicant.reviewNote) applicant.reviewNote = applicationReviewNote(applicant);
    save();
    return { ok:true, applicant };
  }

  function rejectStaffApplication(applicantId) {
    const applications = _state.staff?.applications ?? [];
    const idx = applications.findIndex(app => app.id === applicantId);
    if (idx === -1) return { ok:false, reason:'missing_applicant' };
    const [applicant] = applications.splice(idx, 1);
    save();
    return { ok:true, applicant };
  }

  function hireStaffApplication(applicantId) {
    const applications = _state.staff?.applications ?? [];
    const idx = applications.findIndex(app => app.id === applicantId);
    if (idx === -1) return { ok:false, reason:'missing_applicant' };
    const applicant = applications[idx];
    if (applicant.status === 'new') return { ok:false, reason:'needs_review', applicant };

    const assignment = applicant.desiredDepartment ?? applicant.specialty ?? 'rest';
    const dept = _state.departments?.[assignment];
    if (assignment !== 'lobby' && (!dept?.unlocked || (dept.level ?? 0) <= 0)) {
      return { ok:false, reason:'department_locked', applicant };
    }
    const slots = getStaffSlotInfo(assignment);
    if (slots.full) return { ok:false, reason:'slots_full', applicant, slots };
    if (!spendHotelCash(applicant.onboardingCost ?? 0)) {
      return { ok:false, reason:'cash', applicant, cost:applicant.onboardingCost ?? 0 };
    }

    const member = {
      id: `staff_${String(Date.now()).slice(-6)}_${String(Math.random()).slice(2, 5)}`,
      name: applicant.name,
      role: applicant.role,
      specialty: applicant.specialty,
      assignment,
      speed: applicant.speed,
      service: applicant.service,
      discipline: applicant.discipline,
      stamina: applicant.stamina,
      trait: applicant.trait,
      level: applicant.level ?? 1,
      xp: 0,
      wage: applicant.wage,
      trainingCount: 0,
      promotionTier: 0,
      hiredAtDay: _state.calendar?.day ?? 1,
      source: 'application',
    };
    applications.splice(idx, 1);
    _state.staff.roster = _state.staff.roster ?? [];
    _state.staff.roster.push(member);
    adjustStaffMorale(1, `${member.name} joined the team`, 'good');
    _state.staff.payrollPerDay = calculatePayrollPerDay();
    addStaffReport({
      type: 'hiring',
      title: `${member.name} hired`,
      detail: `${getPromotionTitle(member)} joined ${deptLabel(assignment)}. Payroll is now $${_state.staff.payrollPerDay}/day.`,
      tone: 'good',
    }, false);
    ensureStaffApplications(_state);
    save();
    return { ok:true, member, cost:applicant.onboardingCost ?? 0 };
  }

  function processStaffPayroll(context = {}) {
    const payroll = Math.round(calculatePayrollPerDay() / 4);
    const paid = payroll <= 0 || spendHotelCash(payroll);
    const coverage = staffCoverageSummary(_state);
    const avgStamina = averageStaffStamina(_state.staff?.roster ?? []);
    const shortCount = coverage.filter(item => item.status === 'short').length;
    const thinCount = coverage.filter(item => item.status === 'thin').length;
    const coverageScore = coverage.length
      ? Math.round(coverage.reduce((sum, item) => sum + item.score, 0) / coverage.length)
      : 0;

    let moraleDelta = 0;
    if (paid) moraleDelta += 1; else moraleDelta -= 8;
    if (coverageScore >= 80) moraleDelta += 1;
    if (shortCount > 0) moraleDelta -= shortCount;
    if (avgStamina < 45) moraleDelta -= 2;
    if (avgStamina > 78) moraleDelta += 1;

    adjustStaffMorale(moraleDelta, paid ? 'Shift settled' : 'Payroll missed', paid && moraleDelta >= 0 ? 'good' : paid ? 'warn' : 'bad', {
      payroll,
      coverageScore,
      shortCount,
      thinCount,
      avgStamina,
    });
    _state.staff.payrollPerDay = calculatePayrollPerDay();
    if (paid) _state.staff.payrollPaidTotal = (_state.staff.payrollPaidTotal ?? 0) + payroll;

    const report = {
      id: `staff_report_${Date.now()}`,
      createdAt: Date.now(),
      type: 'shift',
      title: paid ? 'Staff shift settled' : 'Payroll missed',
      detail: paid
        ? `Payroll $${payroll}. Coverage ${coverageScore}%. Morale ${moraleDelta >= 0 ? '+' : ''}${moraleDelta}.`
        : `Could not cover $${payroll} payroll. Morale ${moraleDelta}.`,
      tone: paid && moraleDelta >= 0 ? 'good' : paid ? 'warn' : 'bad',
      payroll,
      paid,
      moraleDelta,
      coverageScore,
      shortCount,
      thinCount,
      avgStamina,
      day: context.day,
      phase: context.phase,
    };
    addStaffReport(report, false);
    const staffEvent = processStaffEvent({ ...context, paid, coverageScore, shortCount, thinCount, avgStamina });
    if (staffEvent) report.staffEvent = staffEvent;
    save();
    return report;
  }

  function addStaffReport(report, shouldSave = true) {
    _state.staff.reports = _state.staff.reports ?? [];
    _state.staff.reports.unshift({
      id: report.id ?? `staff_report_${Date.now()}`,
      createdAt: report.createdAt ?? Date.now(),
      ...report,
    });
    _state.staff.reports = _state.staff.reports.slice(0, 8);
    if (shouldSave) save();
  }

  function processStaffEvent(context = {}) {
    const roster = _state.staff?.roster ?? [];
    if (!roster.length) return null;
    const day = context.day ?? _state.calendar?.day ?? 1;
    const phase = context.phase ?? _state.calendar?.phase ?? 'morning';
    const eventKey = `${day}-${phase}`;
    _state.staff.lastEventKey = _state.staff.lastEventKey ?? '';
    if (_state.staff.lastEventKey === eventKey) return null;

    const event = chooseStaffEvent(context);
    _state.staff.lastEventKey = eventKey;
    if (!event) {
      _state.staff.quietEventShifts = (_state.staff.quietEventShifts ?? 0) + 1;
      return null;
    }
    _state.staff.quietEventShifts = 0;

    event.id = event.id ?? `staff_event_${Date.now()}`;
    event.createdAt = Date.now();
    event.day = day;
    event.phase = phase;
    _state.staff.events = _state.staff.events ?? [];
    _state.staff.events.unshift(event);
    _state.staff.events = _state.staff.events.slice(0, 8);
    addStaffReport({
      id: `staff_report_event_${Date.now()}`,
      type: 'staff_event',
      title: event.title,
      detail: event.detail,
      tone: event.tone,
      eventType: event.type,
      staffId: event.staffId,
      day,
      phase,
    }, false);
    return event;
  }

  function chooseStaffEvent(context = {}) {
    const roster = _state.staff?.roster ?? [];
    const active = roster.filter(member => member.assignment && member.assignment !== 'rest');
    const tired = roster.filter(member => (member.stamina ?? 80) <= 35);
    const excellent = active.filter(member => ((member.speed ?? 5) + (member.service ?? 5) + (member.discipline ?? 5)) / 3 >= 8);
    const bestActive = active
      .slice()
      .sort((a, b) => ((b.speed ?? 5) + (b.service ?? 5) + (b.discipline ?? 5)) - ((a.speed ?? 5) + (a.service ?? 5) + (a.discipline ?? 5)))[0];
    const trained = roster.filter(member => (member.trainingCount ?? 0) >= 2);
    const sameDeptPairs = active.flatMap((member, idx) =>
      active.slice(idx + 1).filter(other => other.assignment === member.assignment).map(other => [member, other])
    );
    const highValue = roster.filter(member => (member.level ?? 1) >= 3 || (member.promotionTier ?? 0) >= 1);

    const candidates = [];
    if (tired.length) candidates.push({ weight: context.avgStamina < 45 ? 6 : 3, fn: () => staffBurnoutEvent(tired[0]) });
    if (tired.length >= 2) candidates.push({ weight: 3, fn: () => staffSickDayEvent(tired[tired.length - 1]) });
    if ((context.coverageScore ?? 0) >= 75 && excellent.length) candidates.push({ weight: 4, fn: () => staffPraiseEvent(excellent[0]) });
    if (bestActive) candidates.push({ weight: 2, fn: () => staffServiceMomentEvent(bestActive) });
    if (trained.length) candidates.push({ weight: 2, fn: () => staffBreakthroughEvent(trained[(context.day ?? 1) % trained.length]) });
    if (sameDeptPairs.length && (_state.staff?.morale ?? 75) < 70) candidates.push({ weight: 2, fn: () => staffConflictEvent(sameDeptPairs[0]) });
    if (highValue.length && (_state.staff?.morale ?? 75) < 65) candidates.push({ weight: 2, fn: () => staffPoachingEvent(highValue[0]) });
    if (!candidates.length) return null;

    const chance = Math.min(0.86, 0.35 + candidates.reduce((sum, item) => sum + item.weight, 0) / 26);
    if ((_state.staff?.quietEventShifts ?? 0) < 3 && Math.random() > chance) return null;
    const total = candidates.reduce((sum, item) => sum + item.weight, 0);
    let roll = Math.random() * total;
    for (const candidate of candidates) {
      roll -= candidate.weight;
      if (roll <= 0) return candidate.fn();
    }
    return candidates[0].fn();
  }

  function staffPraiseEvent(member) {
    member.xp = (member.xp ?? 0) + 10;
    adjustStaffMorale(2, `${member.name} praised by guests`, 'good');
    return {
      type: 'praise',
      tone: 'good',
      staffId: member.id,
      title: `${member.name} earned guest praise`,
      detail: `${getPromotionTitle(member)} created a memorable ${deptLabel(member.assignment)} moment. Morale +2 and +10 growth.`,
    };
  }

  function staffServiceMomentEvent(member) {
    member.xp = (member.xp ?? 0) + 6;
    return {
      type: 'service_moment',
      tone: 'good',
      staffId: member.id,
      title: `${member.name} made the shift smoother`,
      detail: `${getPromotionTitle(member)} handled a ${deptLabel(member.assignment)} rush with poise. +6 growth.`,
    };
  }

  function staffBreakthroughEvent(member) {
    const stat = ['speed', 'service', 'discipline'].sort((a, b) => (member[a] ?? 0) - (member[b] ?? 0))[0];
    const cap = getStaffStatCap(member);
    if ((member[stat] ?? 0) < cap) member[stat] = Math.min(cap, (member[stat] ?? 1) + 1);
    member.xp = (member.xp ?? 0) + 14;
    return {
      type: 'breakthrough',
      tone: 'good',
      staffId: member.id,
      title: `${member.name} had a breakthrough`,
      detail: `${statLabel(stat)} improved to ${member[stat]}. Training is starting to show on shift.`,
    };
  }

  function staffBurnoutEvent(member) {
    member.assignment = 'rest';
    member.stamina = Math.max(10, Math.round((member.stamina ?? 35) - 8));
    adjustStaffMorale(-2, `${member.name} burned out`, 'warn');
    normalizeStaffAssignments(_state);
    return {
      type: 'burnout',
      tone: 'warn',
      staffId: member.id,
      title: `${member.name} burned out`,
      detail: `${getPromotionTitle(member)} was moved to rest after an exhausting shift. Morale -2.`,
    };
  }

  function staffSickDayEvent(member) {
    member.assignment = 'rest';
    member.stamina = Math.max(20, Math.round((member.stamina ?? 35) + 12));
    return {
      type: 'sick_day',
      tone: 'warn',
      staffId: member.id,
      title: `${member.name} called out sick`,
      detail: `${getPromotionTitle(member)} is resting this phase. Coverage may need a quick reassignment.`,
    };
  }

  function staffConflictEvent(pair) {
    const [a, b] = pair;
    a.stamina = Math.max(0, Math.round((a.stamina ?? 80) - 5));
    b.stamina = Math.max(0, Math.round((b.stamina ?? 80) - 5));
    adjustStaffMorale(-3, `${a.name} and ${b.name} clashed`, 'bad');
    return {
      type: 'conflict',
      tone: 'bad',
      staffId: a.id,
      title: `${a.name} and ${b.name} clashed`,
      detail: `Tension on ${deptLabel(a.assignment)} cost both staff stamina. Morale -3.`,
    };
  }

  function staffPoachingEvent(member) {
    const raise = Math.max(8, Math.round((member.wage ?? 36) * 0.12));
    member.wage = Math.round((member.wage ?? 36) + raise);
    _state.staff.payrollPerDay = calculatePayrollPerDay();
    adjustStaffMorale(-1, `${member.name} received an outside offer`, 'warn');
    return {
      type: 'poaching',
      tone: 'warn',
      staffId: member.id,
      title: `${member.name} received an outside offer`,
      detail: `You matched it with a $${raise}/day raise to keep ${getPromotionTitle(member)}. Morale -1.`,
    };
  }

  function ensureMoraleHistory(state = _state) {
    state.staff = state.staff ?? createNewSave().staff;
    state.staff.moraleHistory = Array.isArray(state.staff.moraleHistory) ? state.staff.moraleHistory : [];
    if (state.staff.moraleHistory.length) return state.staff.moraleHistory;
    state.staff.moraleHistory.push({
      id: `morale_${Date.now()}`,
      createdAt: Date.now(),
      day: state.calendar?.day ?? 1,
      phase: state.calendar?.phase ?? 'morning',
      value: clampPct(state.staff.morale ?? 75),
      delta: 0,
      reason: 'Baseline',
      tone: 'neutral',
    });
    return state.staff.moraleHistory;
  }

  function adjustStaffMorale(delta, reason = 'Staff morale changed', tone = 'neutral', context = {}) {
    if (!Number.isFinite(delta)) return _state.staff?.morale ?? 75;
    _state.staff = _state.staff ?? createNewSave().staff;
    ensureMoraleHistory(_state);
    const previous = clampPct(_state.staff.morale ?? 75);
    const next = clampPct(previous + delta);
    _state.staff.morale = next;
    _state.staff.moraleHistory.unshift({
      id: `morale_${Date.now()}_${Math.abs(Math.round(delta))}`,
      createdAt: Date.now(),
      day: _state.calendar?.day ?? 1,
      phase: _state.calendar?.phase ?? 'morning',
      value: next,
      previous,
      delta: Math.round(delta),
      reason,
      tone,
      ...context,
    });
    _state.staff.moraleHistory = _state.staff.moraleHistory.slice(0, 10);
    return next;
  }

  function getStaffMarket(state = _state) {
    const staff = state.staff ?? {};
    const morale = clampPct(staff.morale ?? 75);
    const reports = staff.reports ?? [];
    const recentFirings = reports.filter(report => report.type === 'termination').length;
    const missedPayroll = reports.filter(report => report.type === 'shift' && report.paid === false).length;
    const recentShortReports = reports.filter(report => report.type === 'shift' && (report.shortCount ?? 0) > 0).length;
    const reputation = state.currencies?.reputation ?? 1;

    let score = 0;
    if (reputation >= 60) score += 2;
    else if (reputation >= 30) score += 1;
    if (morale >= 85) score += 2;
    else if (morale >= 70) score += 1;
    else if (morale < 45) score -= 2;
    else if (morale < 60) score -= 1;
    score -= Math.min(3, recentFirings);
    score -= Math.min(2, missedPayroll);
    if (recentShortReports >= 2) score -= 1;

    const qualityShift = score >= 4 ? 2 : score >= 2 ? 1 : score <= -3 ? -2 : score <= -1 ? -1 : 0;
    const wagePressure = Math.max(0, recentFirings * 4 + missedPayroll * 8 - Math.max(0, morale - 75) / 5);
    const label = score >= 4 ? 'Hot Market' : score >= 2 ? 'Healthy Market' : score >= 0 ? 'Stable Market' : score >= -2 ? 'Cautious Market' : 'Cold Market';
    const applicantNote = score >= 2
      ? 'Strong workplace reputation is attracting better applicants.'
      : score < 0
        ? 'Recent staff concerns are weakening applicant quality and raising wage pressure.'
        : 'Applicant quality is steady.';

    return {
      label,
      score,
      morale,
      qualityShift,
      wagePressure: Math.round(wagePressure),
      recentFirings,
      missedPayroll,
      recentShortReports,
      applicantNote,
    };
  }

  function getStaffWarnings(state = _state) {
    return staffCoverageSummary(state)
      .filter(item => item.status !== 'covered')
      .map(item => {
        const severe = item.status === 'short';
        return {
          id: item.assignment,
          assignment: item.assignment,
          label: deptLabel(item.assignment),
          status: item.status,
          tone: severe ? 'bad' : 'warn',
          score: item.score,
          slots: item.slots,
          title: severe ? `${deptLabel(item.assignment)} is short staffed` : `${deptLabel(item.assignment)} is thin`,
          detail: severe
            ? `Coverage is ${item.score}%. Guests will feel slower service until this department gets help.`
            : `Coverage is ${item.score}%. Service is holding, but there is little slack.`,
        };
      });
  }

  function applyStaffFatigue(assignment, amount = 3) {
    if (!assignment || !Number.isFinite(amount)) return [];
    const changed = [];
    const traitSummary = getStaffTraitSummary(assignment, _state);
    const relief = Math.min(0.18, traitSummary.stamina ?? 0);
    const activeAmount = Math.max(1, Math.round(amount * (1 - relief)));
    (_state.staff?.roster ?? []).forEach(member => {
      if (member.assignment === assignment) {
        member.stamina = Math.max(0, Math.min(100, Math.round((member.stamina ?? 80) - activeAmount)));
        changed.push(member.id);
      } else if (member.assignment === 'rest') {
        member.stamina = Math.max(0, Math.min(100, Math.round((member.stamina ?? 80) + Math.max(1, Math.round(amount / 2)))));
        changed.push(member.id);
      }
    });
    if (changed.length) save();
    return changed;
  }

  function resetSave() {
    _state = createNewSave();
    save();
  }

  /* ── Helpers ─────────────────────────────────────────────── */
  function round(n) {
    return Math.max(0, parseFloat(Number(n).toFixed(2)));
  }

  function clampPct(value) {
    return Math.max(0, Math.min(100, Math.round(value)));
  }

  function averageStaffStamina(roster) {
    if (!roster.length) return 0;
    return Math.round(roster.reduce((sum, member) => sum + (member.stamina ?? 80), 0) / roster.length);
  }

  function staffCoverageSummary(state = _state) {
    const ids = ['lobby', 'rooms', 'casino', 'restaurant', 'bar', 'entertainment', 'spa']
      .filter(id => id === 'lobby' || state.departments?.[id]?.unlocked);
    return ids.map(id => getStaffCoverage(id, state));
  }

  function statLabel(stat) {
    return { speed:'Speed', service:'Service', discipline:'Discipline' }[stat] ?? stat;
  }

  function deptLabel(id) {
    return {
      lobby: 'Lobby',
      rooms: 'Guest Rooms',
      casino: 'Casino Floor',
      restaurant: 'Restaurant',
      bar: 'Bar & Lounge',
      entertainment: 'Entertainment',
      spa: 'Spa',
      rest: 'Resting',
    }[id] ?? 'Hotel';
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
    getStaffRoster, getStaffReports, getStaffMoraleHistory, getStaffEvents, getStaffMarket, getStaffWarnings,
    getStaffTraitEffect, getStaffTraitSummary,
    getStaffForAssignment, getStaffSlotLimit, getStaffSlotInfo, getStaffCoverage, getStaffEffect,
    calculatePayrollPerDay, getTrainingCost, getPromotionInfo, getPromotionTitle, getStaffStatCap, staffXpRequired,
    assignStaff, restStaff, adjustStaffStamina, trainStaff, promoteStaff, getFireStaffImpact, fireStaff, processStaffPayroll, applyStaffFatigue,
    getStaffApplications, reviewStaffApplication, shortlistStaffApplication, rejectStaffApplication, hireStaffApplication,
    departmentFitScore,
    unlockAchievement, tickAchievementProgress,
  };
})();

if (typeof window !== 'undefined') window.HotelState = HotelState;
