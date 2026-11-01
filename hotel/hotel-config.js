/* ============================================================
   HOTEL MANAGER — CONFIG  (hotel-config.js)
   ------------------------------------------------------------
   Pure static data. Never persisted. Never mutated at runtime.
   Change these values to tune the economy; no migration needed.
   ============================================================ */

/* ── Floor order: bottom (index 0) → top ── */
const FLOOR_ORDER = [
  'lobby', 'casino', 'rooms', 'restaurant',
  'bar', 'entertainment', 'spa',
];

/* ── Department display metadata ── */
const DEPT_META = {
  lobby:         { label: 'Lobby & Reception', icon: '🏨', color: '#0d2218', accent: '#1a3d2a' },
  casino:        { label: 'Casino Floor',       icon: '🎰', color: '#0a1a0a', accent: '#162e16' },
  rooms:         { label: 'Guest Rooms',        icon: '🛏️', color: '#1a1a2e', accent: '#252545' },
  restaurant:    { label: 'Restaurant',         icon: '🍽️', color: '#1a0d0d', accent: '#2e1616' },
  bar:           { label: 'Bar & Lounge',       icon: '🍸', color: '#0d0d1a', accent: '#16162e' },
  entertainment: { label: 'Entertainment',      icon: '🎭', color: '#1a0a1a', accent: '#2e1a2e' },
  spa:           { label: 'Spa & Wellness',     icon: '🧖', color: '#0d1a1a', accent: '#162e2e' },
};

/* ── Reputation required to unlock each dept ── */
const DEPT_UNLOCK_REP = {
  lobby:         1,   // always open
  casino:        1,   // always open
  rooms:         1,   // always open
  restaurant:    3,
  bar:           4,
  entertainment: 6,
  spa:           9,
  security:      2,
  maintenance:   2,
};

/* ── Upgrade catalog ──────────────────────────────────────────
   Each array entry is the stat block for that department at
   that level (index 0 = level 1, index 1 = level 2, etc.).

   ipm        = hotel cash income per minute at this level
   sat        = satisfaction points added (used in formula)
   cost       = hotel cash to upgrade TO this level
   label      = display name for this tier
   unlockDesc = shown when dept is locked / first unlocked
   ─────────────────────────────────────────────────────────── */
const UPGRADE_CATALOG = {

  lobby: [
    { level:1, cost:0,     label:'Reception Desk',     ipm:0,    sat:5,  desc:'Greet guests. Core operations.' },
    { level:2, cost:800,   label:'Concierge Service',  ipm:20,   sat:10, desc:'Dedicated concierge desk.' },
    { level:3, cost:2500,  label:'Luxury Reception',   ipm:50,   sat:18, desc:'Grand marble reception.' },
    { level:4, cost:7000,  label:'Five-Star Lobby',    ipm:110,  sat:28, desc:'Award-winning entrance.' },
    { level:5, cost:18000, label:'Grand Atrium',       ipm:240,  sat:40, desc:'Sky-lit atrium. Iconic.' },
  ],

  casino: [
    { level:1, cost:0,     label:'Basic Floor',        ipm:75,   chipBonus:0,  betMult:1.0, repBonus:0,
      desc:'A few slots and a blackjack table.' },
    { level:2, cost:750,   label:'Expanded Floor',     ipm:180,  chipBonus:5,  betMult:1.5, repBonus:1,
      desc:'Expanded floor. Higher limits.' },
    { level:3, cost:2200,  label:'Premium Casino',     ipm:420,  chipBonus:10, betMult:2.0, repBonus:2,
      desc:'Premium tables. Draws high rollers.' },
    { level:4, cost:6000,  label:'High Stakes Room',   ipm:900,  chipBonus:15, betMult:3.0, repBonus:3,
      desc:'High-stakes room unlocked.' },
    { level:5, cost:14000, label:'VIP Casino Suite',   ipm:2000, chipBonus:25, betMult:5.0, repBonus:5,
      desc:'Private VIP gaming suite.' },
  ],

  rooms: [
    { level:1, cost:0,     label:'Standard Rooms',     ipm:50,   sat:10, capacity:10,
      desc:'Clean, functional rooms.' },
    { level:2, cost:500,   label:'Comfortable Rooms',  ipm:120,  sat:16, capacity:16,
      desc:'Updated furnishings and beds.' },
    { level:3, cost:1600,  label:'Modern Rooms',       ipm:280,  sat:24, capacity:24,
      desc:'Stylish modern décor.' },
    { level:4, cost:4500,  label:'Deluxe Rooms',       ipm:600,  sat:34, capacity:34,
      desc:'Premium bedding and views.' },
    { level:5, cost:11000, label:'Suite Collection',   ipm:1200, sat:48, capacity:48,
      desc:'Full suite floor. Luxury.' },
  ],

  restaurant: [
    { level:1, cost:300,   label:'Café',               ipm:40,   sat:8,  foodQuality:1,
      desc:'Coffee and light bites.' },
    { level:2, cost:1000,  label:'Bistro',             ipm:100,  sat:16, foodQuality:2,
      desc:'Full-service bistro.' },
    { level:3, cost:2800,  label:'Restaurant',         ipm:240,  sat:26, foodQuality:3,
      desc:'Full dining menu.' },
    { level:4, cost:7000,  label:'Fine Dining',        ipm:520,  sat:38, foodQuality:4,
      desc:'White-tablecloth dining.' },
    { level:5, cost:17000, label:'Michelin Star',      ipm:1100, sat:55, foodQuality:5,
      desc:'Award-winning cuisine.' },
  ],

  bar: [
    { level:1, cost:400,   label:'Hotel Bar',          ipm:30,   vipAttract:0.05,
      desc:'Classic hotel bar.' },
    { level:2, cost:1200,  label:'Cocktail Lounge',    ipm:80,   vipAttract:0.10,
      desc:'Craft cocktails. Mood lighting.' },
    { level:3, cost:3200,  label:'Sky Lounge',         ipm:200,  vipAttract:0.18,
      desc:'Rooftop bar with views.' },
    { level:4, cost:8000,  label:'Members Club',       ipm:440,  vipAttract:0.28,
      desc:'Exclusive members-only lounge.' },
    { level:5, cost:20000, label:'Private Club',       ipm:950,  vipAttract:0.40,
      desc:'The most exclusive address.' },
  ],

  entertainment: [
    { level:1, cost:600,   label:'Events Space',       ipm:35,   repBonus:1,
      desc:'Multipurpose events room.' },
    { level:2, cost:1800,  label:'Show Lounge',        ipm:90,   repBonus:2,
      desc:'Live music and shows nightly.' },
    { level:3, cost:4800,  label:'Theatre',            ipm:220,  repBonus:4,
      desc:'Full theatre productions.' },
    { level:4, cost:12000, label:'Concert Hall',       ipm:500,  repBonus:7,
      desc:'Major acts. National attention.' },
    { level:5, cost:28000, label:'Grand Arena',        ipm:1100, repBonus:12,
      desc:'World-class entertainment venue.' },
  ],

  spa: [
    { level:1, cost:800,   label:'Wellness Room',      ipm:60,   sat:10, highPayerAttract:0.05,
      desc:'Basic massage and wellness.' },
    { level:2, cost:2500,  label:'Day Spa',            ipm:160,  sat:20, highPayerAttract:0.12,
      desc:'Full day spa treatments.' },
    { level:3, cost:6500,  label:'Resort Spa',         ipm:380,  sat:32, highPayerAttract:0.22,
      desc:'Full resort spa experience.' },
    { level:4, cost:15000, label:'Luxury Spa',         ipm:800,  sat:45, highPayerAttract:0.35,
      desc:'Destination spa. Famous guests.' },
    { level:5, cost:32000, label:'World-Class Spa',    ipm:1700, sat:62, highPayerAttract:0.50,
      desc:'Rated one of the world\'s best.' },
  ],

};

/* ── Achievement catalog ── */
const ACHIEVEMENT_CATALOG = [
  { id:'first_upgrade',       label:'Room Service',     icon:'🔨', repBonus:1, required:1,
    desc:'Upgrade any department for the first time.' },
  { id:'five_upgrades',       label:'Expansion Mode',   icon:'📐', repBonus:2, required:5,
    desc:'Perform 5 department upgrades total.' },
  { id:'satisfaction_80',     label:'Guest Favourite',  icon:'😊', repBonus:2, required:1,
    desc:'Reach 80% guest satisfaction.' },
  { id:'first_vip',           label:'Red Carpet',       icon:'⭐', repBonus:3, required:1,
    desc:'Host your first VIP guest.' },
  { id:'ten_blackjack_wins',  label:'House Advantage',  icon:'🂡', repBonus:1, required:10,
    desc:'Win 10 blackjack hands (tracked from casino).' },
  { id:'jackpot_hit',         label:'Lucky Resort',     icon:'🎰', repBonus:2, required:1,
    desc:'Hit a slot jackpot (tracked from casino).' },
  { id:'full_house',          label:'No Vacancy',       icon:'🏨', repBonus:2, required:1,
    desc:'Fill all room capacity.' },
  { id:'all_depts_unlocked',  label:'Full Service',     icon:'🏆', repBonus:5, required:7,
    desc:'Unlock every department.' },
  { id:'ten_shifts',          label:'Floor Manager',    icon:'📋', repBonus:2, required:10,
    desc:'Complete 10 hotel shifts.' },
  { id:'high_roller_host',    label:'Whale Watching',   icon:'💎', repBonus:2, required:1,
    desc:'Host a high roller (they open the high-stakes table).' },
  { id:'first_chest',         label:'Goal Getter',      icon:'🎁', repBonus:1, required:1,
    desc:'Finish a day of goals and open the reward chest.' },
];

/* ── Economy constants ── */
const ECONOMY = {
  STARTING_CASH:       3000,    // tuned: first upgrade at ~6min idle
  OFFLINE_CAP_HOURS:   4,
  INCOME_TICK_MS:      60_000,  // income calculated every 60s
  SAT_TICK_MS:         30_000,  // satisfaction recalculated every 30s
  SAT_BASE:            50,      // base satisfaction before dept bonuses
  ADVANCE_COOLDOWN_MS: 10 * 60_000, // real time between manual Advance Time clicks
  SHIFT_SAT_MAX:       20,      // cap on stacked mini-game satisfaction bonus
  SHIFT_SAT_DECAY_PER_HOUR: 10, // bonus points that wear off per real hour
  ADVANCE_PHASE_INCOME_MINUTES: 20, // income paid by one Advance Time (dev mode: 360)
  // Reward share for the 1st, 2nd, 3rd+ run of the same shift in one phase
  SHIFT_REPEAT_REWARD: [1, 0.5, 0.25],
  // High-roller visits open a high-stakes casino table for this long
  HIGH_ROLLER_VISIT_MS: 45 * 60_000,
  // A high roller pampered at the bar or spa stays this much longer; a botched one checks out
  HIGH_ROLLER_SERVICE_BONUS_MS: 15 * 60_000,
  // Rooms Floor Ops leaves uncleaned; Check-In can't use them until they're cleaned
  DIRTY_ROOM_CAP:      6,
};

/* ── Dev mode ── (?dev=1 / ?dev=0 — defined in wallet.js)
   Skips the Advance Time cooldown, pays full shift and phase rewards,
   and lets the Cashier refill at any balance. */
function isDevMode() {
  return !!window.CasinoWallet?.devMode?.();
}

/* ── Guest types (Phase 2 — defined now, activated in Phase 2) ── */
const GUEST_TYPES = {
  budgetTraveler: {
    id:'budgetTraveler', label:'Budget Traveler', icon:'🎒',
    reputationRequired:1, likes:['rooms'],
    incomePerGuestPerMin:1.5, satisfactionWeight:0.5,
    casinoVisitChance:0.10, casinoSpendMult:0.5, spendingMult:0.7,
  },
  tourist: {
    id:'tourist', label:'Tourist', icon:'📸',
    reputationRequired:3, likes:['restaurant','entertainment'],
    incomePerGuestPerMin:3.0, satisfactionWeight:0.8,
    casinoVisitChance:0.25, casinoSpendMult:1.0, spendingMult:1.0,
  },
  gambler: {
    id:'gambler', label:'Gambler', icon:'🎲',
    reputationRequired:5, likes:['casino'],
    incomePerGuestPerMin:1.0, satisfactionWeight:0.4,
    casinoVisitChance:0.90, casinoSpendMult:2.5, spendingMult:0.8,
    casinoDeptBonus:0.08,
  },
  businessGuest: {
    id:'businessGuest', label:'Business Guest', icon:'💼',
    reputationRequired:8, likes:['rooms','bar'],
    incomePerGuestPerMin:6.0, satisfactionWeight:1.2,
    casinoVisitChance:0.15, casinoSpendMult:1.0, spendingMult:1.5,
  },
  vip: {
    id:'vip', label:'VIP Guest', icon:'⭐',
    reputationRequired:12, likes:['spa','casino','bar'],
    incomePerGuestPerMin:15.0, satisfactionWeight:1.5,
    casinoVisitChance:0.60, casinoSpendMult:3.0, spendingMult:3.0,
    isSpecialEvent:true, visitDurationHours:{ min:2, max:8 },
  },
  highRoller: {
    id:'highRoller', label:'High Roller', icon:'💎',
    reputationRequired:20, likes:['casino'],
    incomePerGuestPerMin:8.0, satisfactionWeight:0.8,
    casinoVisitChance:1.00, casinoSpendMult:8.0, spendingMult:5.0,
    requiresCasinoLevel:3, isSpecialEvent:true,
    visitDurationHours:{ min:1, max:4 },
  },
};

/* ── Named guest system config ─────────────────────────────
   Used by hotel-guest-pool.js to turn fetched/fallback profiles
   into game guests. Keep this static; saved guests store the
   resolved values they were assigned at check-in time.
─────────────────────────────────────────────────────────── */
const ROOM_TYPES = {
  standard: {
    id:'standard', label:'Standard Room', reqRoomsLevel:1,
    capacity:2, beds:'1 queen', ratePerNight:80,
  },
  double: {
    id:'double', label:'Double Room', reqRoomsLevel:2,
    capacity:4, beds:'2 queens', ratePerNight:130,
  },
  deluxe: {
    id:'deluxe', label:'Deluxe Room', reqRoomsLevel:3,
    capacity:3, beds:'1 king', ratePerNight:210,
  },
  suite: {
    id:'suite', label:'Suite', reqRoomsLevel:4,
    capacity:4, beds:'1 king + lounge', ratePerNight:360,
  },
  penthouse: {
    id:'penthouse', label:'Penthouse', reqRoomsLevel:5,
    capacity:6, beds:'private suite', ratePerNight:700,
  },
};

const GUEST_ROOM_PREFS = {
  budgetTraveler: ['standard', 'double'],
  tourist:        ['double', 'standard', 'deluxe'],
  gambler:        ['deluxe', 'suite', 'standard'],
  businessGuest:  ['deluxe', 'suite'],
  vip:            ['suite', 'penthouse', 'deluxe'],
  highRoller:     ['penthouse', 'suite'],
};

const GUEST_PARTY_SIZE = {
  budgetTraveler: { min:1, max:2 },
  tourist:        { min:1, max:4 },
  gambler:        { min:1, max:2 },
  businessGuest:  { min:1, max:2 },
  vip:            { min:1, max:3 },
  highRoller:     { min:1, max:4 },
};

const STAY_PREFERENCES = [
  'quiet_room',
  'high_floor',
  'low_floor',
  'near_elevator',
  'view',
  'large_bathroom',
];

const SPECIAL_REQUESTS = [
  'late_checkout',
  'early_checkin',
  'extra_pillows',
  'extra_towels',
  'champagne',
  'crib',
  'no_disturbance',
];

/* ── Casino game unlock gates ─────────────────────────────
   casinoLevel = Casino Floor dept level required to unlock.
   repRequired = minimum hotel reputation required.
   href        = path from casino/ root.
   Existing games are always level 1 (never locked).
   Future games unlock through hotel progression.          */
const CASINO_GAME_UNLOCKS = {
  slots:       { casinoLevel:1, repRequired:1,  label:'Lucky Reels',      href:'slots/index.html' },
  blackjack:   { casinoLevel:1, repRequired:1,  label:'Blackjack X',      href:'blackjack/index.html' },
  coinflip:    { casinoLevel:1, repRequired:1,  label:'Coin Flip',        href:'coinflip/index.html' },
  roulette:    { casinoLevel:2, repRequired:5,  label:'Roulette Royale',  href:'roulette/index.html' },
  mines:       { casinoLevel:2, repRequired:6,  label:'Mines',            href:'mines/index.html' },
  videoPoker:  { casinoLevel:3, repRequired:10, label:'Video Poker',      href:'videopoker/index.html' },
  crash:       { casinoLevel:3, repRequired:12, label:'Crash',            href:'crash/index.html' },
  texasHoldem: { casinoLevel:5, repRequired:20, label:"Texas Hold'em",    href:'holdem/index.html' },
};

// Canonical read-only selectors shared by management and world presentation.
const PROMOTION_LADDER = [
  { tier:0, label:'Associate', next:'Senior', reqLevel:2, reqBestStat:8, cost:650, wage:14, coverageBoost:0 },
  { tier:1, label:'Senior', next:'Lead', reqLevel:4, reqBestStat:9, cost:1600, wage:24, coverageBoost:0.10 },
  { tier:2, label:'Lead', next:'Manager', reqLevel:6, reqBestStat:10, cost:3600, wage:42, coverageBoost:0.22 },
  { tier:3, label:'Manager', next:null, reqLevel:null, reqBestStat:null, cost:null, wage:0, coverageBoost:0.38 },
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

function getStaffTraitSummary(assignment, state) {
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

function getStaffCoverage(assignment, state) {
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
  return { assignment, assigned, assignedCount: assigned.length, demand, raw, ratio, score, status, traitSummary };
}

function getRoomCapacity(state) {
  const lvl = state.departments.rooms?.level ?? 1;
  return UPGRADE_CATALOG.rooms?.[lvl - 1]?.capacity ?? 10;
}

function getOccupancyPercentage(population, capacity) {
  return capacity > 0 ? Math.round((population / capacity) * 100) : 0;
}

if (typeof window !== 'undefined') {
  window.HotelConfig = {
    FLOOR_ORDER, DEPT_META, DEPT_UNLOCK_REP,
    UPGRADE_CATALOG, ACHIEVEMENT_CATALOG,
    ECONOMY, GUEST_TYPES,
    ROOM_TYPES, GUEST_ROOM_PREFS, GUEST_PARTY_SIZE,
    STAY_PREFERENCES, SPECIAL_REQUESTS,
    CASINO_GAME_UNLOCKS,
    isDevMode, PROMOTION_LADDER, TRAIT_EFFECTS,
    selectors: Object.freeze({ getStaffTraitEffect, getStaffTraitSummary, getStaffCoverage, getRoomCapacity, getOccupancyPercentage }),
  };
}
