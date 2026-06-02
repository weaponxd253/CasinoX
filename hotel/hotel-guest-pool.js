/* ============================================================
   HOTEL MANAGER — GUEST POOL  (hotel-guest-pool.js)
   ------------------------------------------------------------
   Fetches real guest profiles from randomuser.me and manages
   the full guest lifecycle: arriving → checked-in → staying
   → checking-out → history.

   Depends on: hotel-config.js
   Used by:    hotel-engine.js (tick), hotel-ui.js (guest panel),
               Check-In mini-game (future)
   ============================================================ */

const HotelGuestPool = (() => {

  /* ── Constants ──────────────────────────────────────────── */
  const STORAGE_KEY          = 'hotelGuestPool';
  const POOL_TARGET          = 15;    // profiles to keep pre-fetched
  const REFETCH_THRESHOLD    = 5;     // fetch more when pool drops below this
  const POOL_TTL_MS          = 24 * 60 * 60 * 1000;  // 24 h before cache expires
  const MINS_PER_NIGHT       = 20;    // 1 in-game night = 20 real minutes
  const MAX_ACTIVE           = 30;    // cap on simultaneously tracked named guests
  const MAX_HISTORY          = 50;    // guest history kept in storage

  /* ── Nationalities for diverse guest roster ─────────────── */
  const NAT_LIST = 'us,gb,fr,de,au,ca,jp,kr,br,mx,in,za,se,no,nl,es,it,nz,dk,fi';

  /* ── API endpoint ───────────────────────────────────────── */
  const API_URL = (n) =>
    `https://randomuser.me/api/?results=${n}` +
    `&inc=name,location,dob,picture,nat,gender` +
    `&nat=${NAT_LIST}`;

  /* ── Fallback profiles (used when API is unavailable) ───── */
  const FALLBACKS = [
    { firstName:'Alex',    lastName:'Morgan',    gender:'female', age:34, city:'Chicago',      country:'United States', nat:'US', photo:null },
    { firstName:'James',   lastName:'Chen',      gender:'male',   age:28, city:'San Francisco', country:'United States', nat:'US', photo:null },
    { firstName:'Sarah',   lastName:'Williams',  gender:'female', age:42, city:'London',        country:'United Kingdom',nat:'GB', photo:null },
    { firstName:'David',   lastName:'Kim',       gender:'male',   age:39, city:'Seoul',         country:'South Korea',   nat:'KR', photo:null },
    { firstName:'Maria',   lastName:'Santos',    gender:'female', age:31, city:'São Paulo',     country:'Brazil',        nat:'BR', photo:null },
    { firstName:'Robert',  lastName:'Taylor',    gender:'male',   age:55, city:'New York',      country:'United States', nat:'US', photo:null },
    { firstName:'Yuki',    lastName:'Tanaka',    gender:'female', age:27, city:'Tokyo',         country:'Japan',         nat:'JP', photo:null },
    { firstName:'Ahmed',   lastName:'Hassan',    gender:'male',   age:45, city:'Cairo',         country:'Egypt',         nat:'EG', photo:null },
    { firstName:'Emma',    lastName:'Johnson',   gender:'female', age:23, city:'Sydney',        country:'Australia',     nat:'AU', photo:null },
    { firstName:'Carlos',  lastName:'Mendez',    gender:'male',   age:38, city:'Mexico City',   country:'Mexico',        nat:'MX', photo:null },
    { firstName:'Priya',   lastName:'Sharma',    gender:'female', age:33, city:'Mumbai',        country:'India',         nat:'IN', photo:null },
    { firstName:'Luca',    lastName:'Ferrari',   gender:'male',   age:47, city:'Milan',         country:'Italy',         nat:'IT', photo:null },
    { firstName:'Sophie',  lastName:'Leblanc',   gender:'female', age:29, city:'Paris',         country:'France',        nat:'FR', photo:null },
    { firstName:'Michael', lastName:'Anderson',  gender:'male',   age:61, city:'Dallas',        country:'United States', nat:'US', photo:null },
    { firstName:'Hana',    lastName:'Nguyen',    gender:'female', age:36, city:'Ho Chi Minh',   country:'Vietnam',       nat:'VN', photo:null },
  ];

  /* ── Internal state ─────────────────────────────────────── */
  let _data = null;           // in-memory mirror of STORAGE_KEY
  let _fetching = false;      // prevent concurrent fetches

  /* ────────────────────────────────────────────────────────────
     PERSISTENCE
     ─────────────────────────────────────────────────────────── */

  function _blank() {
    return {
      version:       1,
      pool:          [],       // pre-fetched profiles not yet assigned
      activeGuests:  [],       // currently checked in
      guestHistory:  [],       // last MAX_HISTORY checked-out guests
      poolFetchedAt: 0,
    };
  }

  function _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return _blank();
      return JSON.parse(raw);
    } catch (_) { return _blank(); }
  }

  function _save() {
    if (!_data) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_data)); }
    catch (_) { /* storage full — trim history and retry */ _data.guestHistory = _data.guestHistory.slice(0, 20); }
  }

  function init() {
    _data = _load();
    // Expire old pool entries (older than TTL)
    const now = Date.now();
    if (now - _data.poolFetchedAt > POOL_TTL_MS) {
      _data.pool = [];
      _data.poolFetchedAt = 0;
    }
    
    // Process any check-outs that happened while offline
    _processOfflineCheckouts();
    _save();
    // Kick off background fetch if pool is low
    if (_data.pool.length < REFETCH_THRESHOLD) maybeRefetch().catch(() => {});
    return _data;
  }

  /* ────────────────────────────────────────────────────────────
     API FETCH
     ─────────────────────────────────────────────────────────── */

  async function maybeRefetch() {
    if (_fetching) return;
    if (!_data) return;
    const needed = POOL_TARGET - _data.pool.length;
    if (needed <= 0) return;
    _fetching = true;
    try {
      const profiles = await _fetchFromApi(Math.min(needed, 15));
      _data.pool.push(...profiles);
      _data.poolFetchedAt = Date.now();
      _save();
    } catch (_) {
      // API unavailable — top up from fallbacks
      const shuffled = [...FALLBACKS].sort(() => Math.random() - 0.5);
      const usable   = shuffled.slice(0, needed).map(_normaliseFallback);
      _data.pool.push(...usable);
      _save();
    } finally {
      _fetching = false;
    }
  }

  async function _fetchFromApi(count) {
    const res  = await fetch(API_URL(count));
    if (!res.ok) throw new Error(`randomuser API ${res.status}`);
    const json = await res.json();
    return json.results.map(r => ({
      firstName: r.name.first,
      lastName:  r.name.last,
      gender:    r.gender,
      age:       r.dob.age,
      city:      r.location.city,
      country:   r.location.country,
      nat:       r.nat,
      photo:     r.picture.medium,   // ~70px HTTPS URL
    }));
  }

  function _normaliseFallback(fb) {
    return { ...fb };   // already in correct shape
  }

  /* ────────────────────────────────────────────────────────────
     PROFILE → GUEST CONVERSION
     ─────────────────────────────────────────────────────────── */

  /**
   * Turn a raw API profile into a full game guest record.
   * hotelState is read-only here — we never write to it.
   */
  function _profileToGuest(profile, hotelState) {
    const { ROOM_TYPES, GUEST_ROOM_PREFS, GUEST_PARTY_SIZE,
            STAY_PREFERENCES, SPECIAL_REQUESTS, GUEST_TYPES } = HotelConfig;

    const rep        = hotelState?.currencies?.reputation ?? 1;
    const roomsLevel = hotelState?.departments?.rooms?.level ?? 1;
    const guestMix   = hotelState?.guests?.mix ?? { budgetTraveler: 1 };

    // ── Assign guest type ──────────────────────────────────
    const type = _assignType(profile.age, rep, guestMix);

    // ── Available room types at current rooms level ────────
    const available  = Object.entries(ROOM_TYPES)
      .filter(([, rt]) => rt.reqRoomsLevel <= roomsLevel)
      .map(([id]) => id);

    // ── Preferred room type for this guest ─────────────────
    const prefs    = GUEST_ROOM_PREFS[type] ?? ['standard'];
    const roomType = prefs.find(r => available.includes(r)) ?? available[0] ?? 'standard';
    const roomCfg  = ROOM_TYPES[roomType];

    // ── Party size ─────────────────────────────────────────
    const sizeRange  = GUEST_PARTY_SIZE[type] ?? { min:1, max:2 };
    const rawParty   = sizeRange.min + Math.floor(Math.random() * (sizeRange.max - sizeRange.min + 1));
    const partySize  = Math.min(rawParty, roomCfg.capacity);

    // ── Stay preferences (1–2 items) ───────────────────────
    const shuffledPrefs = [...STAY_PREFERENCES].sort(() => Math.random() - 0.5);
    const prefCount     = Math.random() < 0.55 ? 1 : 2;
    const stayPrefs     = shuffledPrefs.slice(0, prefCount);

    // ── Special request ────────────────────────────────────
    const specialRequest = SPECIAL_REQUESTS[
      Math.floor(Math.random() * SPECIAL_REQUESTS.length)
    ];

    // ── Duration (nights) — weighted toward shorter stays ──
    const duration = _weightedRandom([
      { v:1, w:4 }, { v:2, w:3 }, { v:3, w:2 },
      { v:4, w:1 }, { v:5, w:0.5 }, { v:7, w:0.3 },
    ]);

    // ── Financials ─────────────────────────────────────────
    const tipMultiplier  = type === 'vip' ? 1.2 : type === 'highRoller' ? 1.4 : 1.0;
    const ratePerNight   = roomCfg.ratePerNight;
    const totalIncome    = Math.round(ratePerNight * duration * tipMultiplier);

    // ── Returning guest check ──────────────────────────────
    const fullName    = `${profile.firstName} ${profile.lastName}`;
    const isReturning = _data.guestHistory.some(h => h.name === fullName);

    // ── Timestamps ─────────────────────────────────────────
    const checkInTime  = Date.now();
    const checkOutTime = checkInTime + duration * MINS_PER_NIGHT * 60_000;

    const typeInfo = GUEST_TYPES[type] ?? {};

    return {
      id:           `g_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
      // Profile (from API)
      name:         fullName,
      firstName:    profile.firstName,
      lastName:     profile.lastName,
      photo:        profile.photo,        // null for fallbacks
      age:          profile.age,
      nat:          profile.nat,
      gender:       profile.gender,
      from:         `${profile.city}, ${profile.country}`,
      origin:       _originLabel(profile.nat, profile.city, profile.country),
      // Game data
      type,
      typeLabel:    typeInfo.label  ?? type,
      typeIcon:     typeInfo.icon   ?? '👤',
      partySize,
      roomType,
      roomTypeLabel:roomCfg.label,
      roomTypeBeds: roomCfg.beds,
      roomAssigned: null,              // set during check-in mini-game
      preferences:  stayPrefs,
      specialRequest,
      duration,
      isReturning,
      // Status
      status:       'arriving',        // arriving → checked_in → checking_out → departed
      checkInTime,
      checkOutTime,
      // Financials
      ratePerNight,
      totalIncome,
      incomeCollected: false,
      // Satisfaction (updated as they stay)
      satisfaction: 80,
    };
  }

  /* ── Guest type assignment ─────────────────────────────── */

  /**
   * Weight the hotel's current guest mix against an age-based
   * bias so the assigned type both fits the hotel's reputation
   * and makes loose demographic sense.
   */
  function _assignType(age, rep, currentMix) {
    const { GUEST_TYPES } = HotelConfig;

    // Age bias weights
    const ageBias = age < 25 ? { budgetTraveler:4, tourist:2, gambler:1 }
                  : age < 35 ? { tourist:3, businessGuest:2, gambler:2, budgetTraveler:1 }
                  : age < 50 ? { businessGuest:3, tourist:2, vip:1, gambler:1 }
                  :            { vip:2, businessGuest:3, tourist:1 };

    // Only include types available at current reputation
    const eligible = Object.keys(GUEST_TYPES)
      .filter(id => {
        const g = GUEST_TYPES[id];
        return !g.isSpecialEvent && rep >= g.reputationRequired;
      });

    if (eligible.length === 0) return 'budgetTraveler';

    // Combine mix weight + age bias (50/50 blend)
    const scores = {};
    eligible.forEach(id => {
      const mixWeight = (currentMix?.[id] ?? 0) * 2;
      const ageWeight = (ageBias[id] ?? 0.1);
      scores[id] = mixWeight + ageWeight;
    });

    return _weightedPick(scores);
  }

  /* ────────────────────────────────────────────────────────────
     LIFECYCLE
     ─────────────────────────────────────────────────────────── */

  /**
   * Pop a profile from the pool and convert it to a game guest.
   * Returns the guest record, or null if pool and fallbacks both empty.
   */
  function nextArrival(hotelState) {
    if (!_data) return null;

    let profile = _data.pool.shift();

    // If pool is empty, use a random fallback
    if (!profile) {
      profile = _normaliseFallback(
        FALLBACKS[Math.floor(Math.random() * FALLBACKS.length)]
      );
    }

    const guest = _profileToGuest(profile, hotelState);

    // Cap active list
    if (_data.activeGuests.length < MAX_ACTIVE) {
      _data.activeGuests.push(guest);
    }

    _save();

    // Silently refetch if pool is running low
    if (_data.pool.length < REFETCH_THRESHOLD) {
      maybeRefetch().catch(() => {});
    }

    return guest;
  }

  /** Mark a guest as checked-in (room assigned). */
  function checkIn(guestId, roomAssigned) {
    const guest = _data.activeGuests.find(g => g.id === guestId);
    if (!guest) return null;
    guest.status       = 'checked_in';
    guest.roomAssigned = roomAssigned;
    _save();
    return guest;
  }

  /** Process a check-out: collect income, move to history, remove from active. */
  function checkOut(guestId, satisfactionOverride) {
    const idx   = _data.activeGuests.findIndex(g => g.id === guestId);
    if (idx === -1) return null;
    const guest = _data.activeGuests[idx];
    guest.status           = 'departed';
    guest.incomeCollected  = true;
    if (satisfactionOverride !== undefined) guest.satisfaction = satisfactionOverride;

    // Move to history
    _data.guestHistory.unshift({
      id:           guest.id,
      name:         guest.name,
      photo:        guest.photo,
      type:         guest.type,
      typeLabel:    guest.typeLabel,
      typeIcon:     guest.typeIcon,
      roomType:     guest.roomType,
      duration:     guest.duration,
      totalIncome:  guest.totalIncome,
      satisfaction: guest.satisfaction,
      nat:          guest.nat,
      departedAt:   Date.now(),
    });
    if (_data.guestHistory.length > MAX_HISTORY) _data.guestHistory.pop();

    // Remove from active list
    _data.activeGuests.splice(idx, 1);
    _save();

    return { guest, income: guest.totalIncome };
  }

  /**
   * Scan active guests and check out anyone whose checkOutTime has passed.
   * Called by hotel-engine processLiveTick.
   * Returns array of { guest, income } for processed check-outs.
   */
  function processCheckOuts() {
    if (!_data) return [];
    const now      = Date.now();
    const expired  = _data.activeGuests.filter(
      g => g.status === 'checked_in' && g.checkOutTime <= now && !g.incomeCollected
    );
    return expired.map(g => checkOut(g.id));
  }

  function _processOfflineCheckouts() {
    const now = Date.now();
    _data.activeGuests
      .filter(g => g.checkOutTime <= now && !g.incomeCollected)
      .forEach(g => checkOut(g.id));
  }

  /* ────────────────────────────────────────────────────────────
     GETTERS
     ─────────────────────────────────────────────────────────── */

  function getPool()          { return _data?.pool          ?? []; }
  function getActiveGuests()  { return _data?.activeGuests  ?? []; }
  function getGuestHistory()  { return _data?.guestHistory  ?? []; }
  function poolSize()         { return _data?.pool.length   ?? 0; }

  /**
   * Returns all data needed to render a single guest's check-in card.
   * This is the interface the mini-game will call.
   */
  function guestCardData(guestOrId) {
    const guest = typeof guestOrId === 'string'
      ? _data?.activeGuests.find(g => g.id === guestOrId)
      : guestOrId;
    if (!guest) return null;

    const { ROOM_TYPES, STAY_PREFERENCES } = HotelConfig;
    const checkOutDate = new Date(guest.checkOutTime);
    const timeLeft     = Math.max(0, guest.checkOutTime - Date.now());
    const nightsLeft   = Math.ceil(timeLeft / (MINS_PER_NIGHT * 60_000));

    return {
      // Identity
      id:            guest.id,
      name:          guest.name,
      photo:         guest.photo,
      age:           guest.age,
      from:          guest.from,
      origin:        guest.origin,
      nat:           guest.nat,
      flagEmoji:     _natToFlag(guest.nat),
      isReturning:   guest.isReturning,
      // Room
      type:          guest.type,
      typeLabel:     guest.typeLabel,
      typeIcon:      guest.typeIcon,
      partySize:     guest.partySize,
      partySizeLabel:guest.partySize === 1 ? 'Solo' : `Party of ${guest.partySize}`,
      roomType:      guest.roomType,
      roomTypeLabel: guest.roomTypeLabel,
      roomTypeBeds:  guest.roomTypeBeds,
      roomAssigned:  guest.roomAssigned,
      // Stay
      preferences:   guest.preferences.map(_prefLabel),
      specialRequest:guest.specialRequest ? _requestLabel(guest.specialRequest) : null,
      duration:      guest.duration,
      durationLabel: `${guest.duration} night${guest.duration > 1 ? 's' : ''}`,
      nightsLeft,
      // Status
      status:        guest.status,
      satisfaction:  guest.satisfaction,
      // Financials
      ratePerNight:  guest.ratePerNight,
      totalIncome:   guest.totalIncome,
    };
  }

  /** All active guests formatted as card data. */
  function activeGuestCards() {
    return (_data?.activeGuests ?? []).map(guestCardData);
  }

  /** Recent check-out summary for the guest history panel. */
  function recentDepartures(limit = 10) {
    return (_data?.guestHistory ?? []).slice(0, limit);
  }

  /* ────────────────────────────────────────────────────────────
     HELPERS
     ─────────────────────────────────────────────────────────── */

  function _originLabel(nat, city, country) {
    const domestic = ['us', 'US'];
    return domestic.includes(nat)
      ? `Domestic · ${city}`
      : `International · ${city}, ${country}`;
  }

  /** Convert ISO 3166-1 alpha-2 to a flag emoji. */
  function _natToFlag(nat) {
    try {
      return [...(nat?.toUpperCase() ?? 'US')]
        .map(c => String.fromCodePoint(0x1F1E6 - 65 + c.charCodeAt(0)))
        .join('');
    } catch (_) { return '🌐'; }
  }

  /** Human-readable preference label. */
  function _prefLabel(pref) {
    return {
      quiet_room:     'Quiet room',
      high_floor:     'High floor',
      low_floor:      'Low floor',
      near_elevator:  'Near elevator',
      view:           'Room with view',
      large_bathroom: 'Large bathroom',
    }[pref] ?? pref;
  }

  /** Human-readable special request label. */
  function _requestLabel(req) {
    return {
      late_checkout:  'Late check-out',
      early_checkin:  'Early check-in',
      extra_pillows:  'Extra pillows',
      extra_towels:   'Extra towels',
      champagne:      'Champagne on arrival',
      crib:           'Baby crib',
      no_disturbance: 'Do not disturb',
    }[req] ?? req;
  }

  /** Weighted random pick from { key: weight } object. */
  function _weightedPick(weights) {
    const total = Object.values(weights).reduce((s, w) => s + w, 0);
    let rand = Math.random() * total;
    for (const [key, w] of Object.entries(weights)) {
      rand -= w;
      if (rand <= 0) return key;
    }
    return Object.keys(weights)[0];
  }

  /** Weighted random number from [{ v, w }] array. */
  function _weightedRandom(options) {
    const total = options.reduce((s, o) => s + o.w, 0);
    let rand = Math.random() * total;
    for (const o of options) {
      rand -= o.w;
      if (rand <= 0) return o.v;
    }
    return options[options.length - 1].v;
  }

  /* ────────────────────────────────────────────────────────────
     INTEGRATION HELPERS  (called by hotel-engine)
     ─────────────────────────────────────────────────────────── */

  /**
   * Generate a guest for the mini-game WITHOUT adding to activeGuests.
   * Pops a profile from the pool (consumed) but the guest record is
   * returned to the caller to manage — commit with commitGuest() on success,
   * or just discard on miss.
   */
  function previewArrival(hotelState) {
    if (!_data) return null;
    let profile = _data.pool.shift();
    if (!profile) {
      profile = _normaliseFallback(
        FALLBACKS[Math.floor(Math.random() * FALLBACKS.length)]
      );
    }
    const guest = _profileToGuest(profile, hotelState);
    _save();
    if (_data.pool.length < REFETCH_THRESHOLD) maybeRefetch().catch(() => {});
    return guest; // caller decides whether to commit
  }

  /**
   * Commit a mini-game guest to the active list after a successful check-in.
   */
  function commitGuest(guest) {
    if (!_data || _data.activeGuests.length >= MAX_ACTIVE) return;
    _data.activeGuests.push({ ...guest, status: 'checked_in' });
    _save();
  }

  /**
   * Silently discard a guest who was never checked in (mini-game timeout).
   * Also removes from activeGuests if they were accidentally added.
   */
  function dismissGuest(guestId) {
    if (!_data) return;
    const idx = _data.activeGuests.findIndex(g => g.id === guestId);
    if (idx >= 0) { _data.activeGuests.splice(idx, 1); _save(); }
  }

  /**
   * Decide whether a new guest should arrive this tick.
   * Uses the hotel's check-in rate and current population vs capacity.
   */
  function shouldArriveTick(hotelState) {
    const pop      = _data?.activeGuests.length ?? 0;
    const capacity = HotelConfig.UPGRADE_CATALOG.rooms?.[
      (hotelState?.departments?.rooms?.level ?? 1) - 1
    ]?.capacity ?? 10;

    if (pop >= capacity * 1.1) return false;   // at capacity

    const rate = hotelState?.guests?.checkInRate ?? 2;   // per hour
    const chancePerTick = rate / 60;                      // tick = ~1 min
    return Math.random() < chancePerTick;
  }

  /**
   * Summary counts for the hotel-ui guest panel.
   */
  function poolStatus() {
    return {
      poolSize:    poolSize(),
      activeCount: _data?.activeGuests.length ?? 0,
      fetching:    _fetching,
      lastFetch:   _data?.poolFetchedAt ?? 0,
    };
  }

  return {
    // Lifecycle
    init, maybeRefetch,
    nextArrival, checkIn, checkOut, processCheckOuts,
    // Mini-game interface
    previewArrival, commitGuest, dismissGuest,
    // Getters
    getPool, getActiveGuests, getGuestHistory,
    guestCardData, activeGuestCards, recentDepartures,
    poolSize, poolStatus,
    // Engine helpers
    shouldArriveTick,
  };
})();

if (typeof window !== 'undefined') window.HotelGuestPool = HotelGuestPool;
