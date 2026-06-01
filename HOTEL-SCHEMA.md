# Hotel Manager — Game State Schema
## Phase 1: Hotel Foundation · Phase 2: Guest System

> **Reading guide**
>
> Two distinct categories appear throughout this document:
>
> - **`SAVE STATE`** — mutable player data written to `localStorage` on every meaningful action. This is the game's memory.
> - **`CONFIG`** — static constants defined in code. Never persisted. Changing config doesn't require a migration.
>
> Mixing these up is the most common early mistake in idle game architecture.
> Keep them in separate files from day one.

---

## 1. Unified Save Object

One `localStorage` key (`hotelGameState`) holds everything. Load it on boot,
save it on every meaningful action, calculate offline income from the timestamp diff.

```js
// localStorage key: 'hotelGameState'
{
  meta:         HotelMeta,         // identity + versioning
  currencies:   Currencies,        // hotel cash, crowns, reputation
  departments:  Departments,       // all department states
  ticker:       Ticker,            // income timer + active multipliers
  satisfaction: Satisfaction,      // [Phase 2] satisfaction state
  guests:       Guests,            // [Phase 2] population + mix
  stats:        Stats,             // lifetime counters
  achievements: Achievements,      // unlock flags + progress trackers
  casinoBridge: CasinoBridge,      // pointers to casino-side state
}
```

> **Casino chips** live in the existing `casinoBalance` key (managed by
> `CasinoWallet`). Do not move them into this object. The separation is the
> point. `casinoBridge` holds read-only pointers and event history only.

---

## 2. `HotelMeta` — Identity + Versioning

```js
meta: {
  version:      1,                          // schema version (bump on breaking changes)
  saveId:       'uuid-v4',                  // unique save identifier
  hotelName:    'Grand Casino Resort',      // player-editable
  hotelTier:    1,                          // 1–5 (motel → luxury resort)
  createdAt:    1234567890000,              // timestamp ms
  lastSaved:    1234567890000,              // timestamp ms
  lastOpened:   1234567890000,             // for "welcome back" messages
}
```

**Hotel tiers** (gate prestige content and UI themes):

| Tier | Label | Unlocks |
|---|---|---|
| 1 | Roadside Motel | Rooms, Casino |
| 2 | Budget Hotel | Restaurant, Bar |
| 3 | Boutique Hotel | Spa, Entertainment |
| 4 | Resort | Full dept suite, VIP access |
| 5 | Luxury Resort | High Rollers, prestige features |

---

## 3. `Currencies` — The Four-Currency System

```js
currencies: {
  hotelCash:   5000,    // primary management currency
  crowns:      0,       // prestige / cosmetic (never lost on reset)
  reputation:  1,       // derived value — set by formula, not directly spent
  // chips: lives in CasinoWallet — NOT here
}
```

**Why reputation is in currencies, not computed on the fly:**
It's used as a gating value in the UI constantly (guest unlocks, dept unlocks,
feature gates). Cache the computed value here; recalculate and update it after
any action that could change it (dept upgrade, mission complete, achievement unlock).

**Reputation formula (Phase 1):**
```
reputation = sum(dept.level for all unlocked departments)
           + achievements.reputationBonus
```

**Reputation formula (Phase 2 addition):**
```
reputation += floor(satisfaction.rollingAverage / 20)   // 0–5 bonus
```

---

## 4. `Departments` — Hotel Operations

### 4a. Save State (per department)

```js
departments: {
  rooms: {
    unlocked:    true,
    level:       1,
    lastCollected: 1234567890000,   // timestamp — used for offline calc
  },
  casino: {
    unlocked:    true,
    level:       1,
    lastCollected: 1234567890000,
  },
  restaurant: {
    unlocked:    false,
    level:       0,
    lastCollected: null,
  },
  bar: {
    unlocked:    false,
    level:       0,
    lastCollected: null,
  },
  entertainment: {
    unlocked:    false,
    level:       0,
    lastCollected: null,
  },
  spa: {
    unlocked:    false,
    level:       0,
    lastCollected: null,
  },
  security: {
    unlocked:    false,
    level:       0,
    lastCollected: null,
  },
  maintenance: {
    unlocked:    false,
    level:       0,
    lastCollected: null,
  },
}
```

> The save state is intentionally minimal — just `unlocked`, `level`, and
> `lastCollected`. Everything else (income rate, bonuses, upgrade cost) is
> derived from the level via the upgrade catalog config at runtime.

### 4b. Config — Upgrade Catalog

This is static configuration, not saved. Each entry is the stat block for a
department at a given level.

```js
// CONFIG — never persisted
const UPGRADE_CATALOG = {

  rooms: [
    //  level  cost    label                    income/min  sat+   capacity
    {   level: 1, cost: 0,     label: 'Basic Rooms',       ipm: 50,   sat: 5,  capacity: 10  },
    {   level: 2, cost: 500,   label: 'Comfortable Rooms', ipm: 120,  sat: 10, capacity: 15  },
    {   level: 3, cost: 1500,  label: 'Modern Rooms',      ipm: 280,  sat: 16, capacity: 22  },
    {   level: 4, cost: 4000,  label: 'Luxury Rooms',      ipm: 600,  sat: 24, capacity: 32  },
    {   level: 5, cost: 10000, label: 'Suite Level',       ipm: 1200, sat: 35, capacity: 45  },
  ],

  casino: [
    {   level: 1, cost: 0,     label: 'Basic Floor',       ipm: 75,   chipBonus: 0,   betMult: 1.0, repBonus: 0 },
    {   level: 2, cost: 750,   label: 'Expanded Floor',    ipm: 180,  chipBonus: 5,   betMult: 1.5, repBonus: 1 },
    {   level: 3, cost: 2000,  label: 'Premium Floor',     ipm: 420,  chipBonus: 10,  betMult: 2.0, repBonus: 2 },
    {   level: 4, cost: 5000,  label: 'High Stakes Room',  ipm: 900,  chipBonus: 15,  betMult: 3.0, repBonus: 3 },
    {   level: 5, cost: 12000, label: 'VIP Casino Suite',  ipm: 2000, chipBonus: 25,  betMult: 5.0, repBonus: 5 },
  ],

  restaurant: [
    {   level: 1, cost: 300,   label: 'Café',              ipm: 40,   sat: 8,  foodQuality: 1 },
    {   level: 2, cost: 1000,  label: 'Bistro',            ipm: 100,  sat: 16, foodQuality: 2 },
    {   level: 3, cost: 2500,  label: 'Restaurant',        ipm: 240,  sat: 25, foodQuality: 3 },
    {   level: 4, cost: 6000,  label: 'Fine Dining',       ipm: 520,  sat: 35, foodQuality: 4 },
    {   level: 5, cost: 15000, label: 'Michelin Star',     ipm: 1100, sat: 50, foodQuality: 5 },
  ],

  bar: [
    {   level: 1, cost: 400,   label: 'Hotel Bar',         ipm: 30,   vipAttract: 0.05 },
    {   level: 2, cost: 1200,  label: 'Cocktail Lounge',   ipm: 80,   vipAttract: 0.10 },
    {   level: 3, cost: 3000,  label: 'Sky Lounge',        ipm: 200,  vipAttract: 0.18 },
    {   level: 4, cost: 7000,  label: 'Members Club',      ipm: 440,  vipAttract: 0.28 },
    {   level: 5, cost: 18000, label: 'Exclusive Club',    ipm: 950,  vipAttract: 0.40 },
  ],

  entertainment: [
    {   level: 1, cost: 600,   label: 'Events Space',      ipm: 35,   repBonus: 1 },
    {   level: 2, cost: 1800,  label: 'Show Lounge',       ipm: 90,   repBonus: 2 },
    {   level: 3, cost: 4500,  label: 'Theatre',           ipm: 220,  repBonus: 4 },
    {   level: 4, cost: 11000, label: 'Concert Hall',      ipm: 500,  repBonus: 7 },
    {   level: 5, cost: 25000, label: 'Grand Arena',       ipm: 1100, repBonus: 12 },
  ],

  spa: [
    {   level: 1, cost: 800,   label: 'Wellness Room',     ipm: 60,   sat: 10, highPayerAttract: 0.05 },
    {   level: 2, cost: 2400,  label: 'Day Spa',           ipm: 160,  sat: 20, highPayerAttract: 0.12 },
    {   level: 3, cost: 6000,  label: 'Full-Service Spa',  ipm: 380,  sat: 32, highPayerAttract: 0.22 },
    {   level: 4, cost: 14000, label: 'Resort Spa',        ipm: 800,  sat: 45, highPayerAttract: 0.35 },
    {   level: 5, cost: 30000, label: 'World-Class Spa',   ipm: 1700, sat: 60, highPayerAttract: 0.50 },
  ],

  security: [
    {   level: 1, cost: 250,   label: 'Security Desk',     ipm: 0,  lossReduction: 0.05 },
    {   level: 2, cost: 800,   label: 'Security Team',     ipm: 0,  lossReduction: 0.12 },
    {   level: 3, cost: 2000,  label: 'Full Security',     ipm: 0,  lossReduction: 0.22 },
    {   level: 4, cost: 5000,  label: 'Elite Security',    ipm: 0,  lossReduction: 0.35 },
    {   level: 5, cost: 12000, label: 'Private Security',  ipm: 0,  lossReduction: 0.50,
                                                                     unlocksHighRollerTable: true },
  ],

  maintenance: [
    {   level: 1, cost: 200,   label: 'Handyman',          ipm: 0,  decayReduction: 0.10 },
    {   level: 2, cost: 600,   label: 'Maintenance Crew',  ipm: 0,  decayReduction: 0.22 },
    {   level: 3, cost: 1600,  label: 'Full Team',         ipm: 0,  decayReduction: 0.38 },
    {   level: 4, cost: 4000,  label: 'Expert Team',       ipm: 0,  decayReduction: 0.55 },
    {   level: 5, cost: 10000, label: 'Concierge Standard',ipm: 0,  decayReduction: 0.75 },
  ],

};
```

> **Unlock gates** (which reputation level unlocks each department):
>
> | Department | Reputation to Unlock |
> |---|---|
> | Rooms | 1 (default open) |
> | Casino | 1 (default open) |
> | Restaurant | 3 |
> | Bar | 4 |
> | Entertainment | 6 |
> | Spa | 9 |
> | Security | 2 |
> | Maintenance | 2 |

---

## 5. `Ticker` — Income Timer

```js
ticker: {
  lastTick:              1234567890000,   // ms timestamp of last income calculation
  offlineCapHours:       4,               // max offline income in hours
  activeMultiplier:      1.0,             // temporary boost (from casino wins)
  activeMultiplierExpiry: null,           // ms timestamp when boost ends (null = none)
  totalMinutesActive:    0,               // lifetime stat
}
```

### Income Calculation Formula

Run this on app open (offline income) and on a 60-second interval (active income).

```js
function calculateIncome(saveState, now = Date.now()) {
  const config = UPGRADE_CATALOG;

  // 1. Sum base income from all unlocked departments
  let baseIpm = 0;
  for (const [deptId, dept] of Object.entries(saveState.departments)) {
    if (!dept.unlocked || dept.level === 0) continue;
    const stats = config[deptId][dept.level - 1];
    baseIpm += stats.ipm ?? 0;
  }

  // 2. Apply satisfaction multiplier [Phase 2]
  const satMult = satisfactionMultiplier(saveState.satisfaction?.current ?? 75);

  // 3. Apply guest multiplier [Phase 2]
  const guestMult = guestIncomeMultiplier(saveState.guests);

  // 4. Apply active multiplier (casino win boost)
  const now = Date.now();
  const activeMult = (saveState.ticker.activeMultiplierExpiry > now)
    ? saveState.ticker.activeMultiplier
    : 1.0;

  const totalIpm = baseIpm * satMult * guestMult * activeMult;

  // 5. Calculate minutes elapsed (capped for offline)
  const elapsedMs  = now - saveState.ticker.lastTick;
  const elapsedMin = elapsedMs / 60000;
  const capMin     = saveState.ticker.offlineCapHours * 60;
  const billableMin = Math.min(elapsedMin, capMin);

  return {
    amount:       Math.floor(totalIpm * billableMin),
    minutesBilled: billableMin,
    breakdown: { baseIpm, satMult, guestMult, activeMult, totalIpm },
  };
}
```

### Satisfaction Multiplier (Phase 2)

```js
function satisfactionMultiplier(sat) {
  if (sat >= 90) return 1.50;
  if (sat >= 75) return 1.25;
  if (sat >= 60) return 1.00;   // baseline
  if (sat >= 40) return 0.75;
  return 0.50;
}
```

---

## 6. `Satisfaction` — Phase 2

```js
satisfaction: {
  current:        75,           // 0–100, recalculated on each tick
  rollingAverage: 75,           // 7-day weighted average (for reputation bonus)
  trend:          'stable',     // 'rising' | 'falling' | 'stable'
  lastUpdated:    timestamp,

  // Component breakdown (useful for debugging + player-facing "why" UI)
  components: {
    roomComfort:           10,   // from rooms.level
    foodQuality:           0,    // from restaurant.level
    entertainment:         0,    // from entertainment.level
    overcrowdingPenalty:   0,    // negative — guests > capacity
    maintenancePenalty:    0,    // negative — maintenance.level = 0
    securityPenalty:       0,    // negative — security.level = 0
    pricePenalty:          0,    // [future] if room rates too high
  },
}
```

### Satisfaction Formula

```js
function recalculateSatisfaction(saveState) {
  const depts = saveState.departments;
  const guests = saveState.guests;
  const catalog = UPGRADE_CATALOG;

  const get = (id, key) => {
    const dept = depts[id];
    if (!dept.unlocked || dept.level === 0) return 0;
    return catalog[id][dept.level - 1][key] ?? 0;
  };

  const roomComfort      = get('rooms',         'sat');
  const foodQuality      = get('restaurant',    'sat');
  const entertainment    = get('entertainment', 'sat') * 0.5;  // partial effect
  const spaBonus         = get('spa',           'sat') * 0.5;

  const capacity         = catalog.rooms[depts.rooms.level - 1]?.capacity ?? 10;
  const overcrowding     = Math.max(0, guests.population - capacity) * 2;

  const noMaintenance    = (!depts.maintenance.unlocked || depts.maintenance.level === 0) ? -10 : 0;
  const noSecurity       = (!depts.security.unlocked   || depts.security.level   === 0) ? -5  : 0;

  const raw = 50                      // base
    + roomComfort
    + foodQuality
    + entertainment
    + spaBonus
    - overcrowding
    + noMaintenance
    + noSecurity;

  return Math.max(0, Math.min(100, Math.round(raw)));
}
```

> **Design note:** 50 is the base — a hotel with one room tier and nothing
> else sits at 60 (50 + 10 from rooms). Adding more departments pushes it up.
> Neglecting maintenance or overcrowding pushes it down. Players should never
> be able to max satisfaction at Phase 1 — they need restaurants and spas for that.

---

## 7. `Guests` — Phase 2

### 7a. Save State

```js
guests: {
  population:           8,           // current guest count
  checkInRate:          3,           // guests arriving per hour (derived from reputation)
  checkOutRate:         2,           // guests leaving per hour (derived from satisfaction)

  // Proportional mix — always sums to 1.0
  // Only types unlocked at current reputation appear
  mix: {
    budgetTraveler:     0.70,
    tourist:            0.25,
    gambler:            0.05,
    businessGuest:      0,
    vip:                0,
    highRoller:         0,
  },

  // One-at-a-time special guest flags
  vipPresent:           false,
  highRollerPresent:    false,
  vipDepartsAt:         null,        // timestamp — VIP visit has a duration

  // Lifetime counters
  stats: {
    totalHosted:        0,
    vipsHosted:         0,
    highRollersHosted:  0,
    totalSpent:         0,           // hotel cash generated by all guests
  },
}
```

### 7b. Config — Guest Type Definitions

```js
// CONFIG — never persisted
const GUEST_TYPES = {

  budgetTraveler: {
    id:                   'budgetTraveler',
    label:                'Budget Traveler',
    icon:                 '🎒',
    reputationRequired:   1,
    likes:                ['rooms'],
    // Income contribution: hotel cash per minute per guest of this type
    incomePerGuestPerMin: 1.5,
    // How much satisfaction affects their decision to stay / check out
    satisfactionWeight:   0.5,        // low — they're forgiving
    casinoVisitChance:    0.10,       // 10% chance to visit casino per hour
    casinoSpendMult:      0.5,        // spends less in casino
    spendingMult:         0.7,
  },

  tourist: {
    id:                   'tourist',
    label:                'Tourist',
    icon:                 '📸',
    reputationRequired:   3,
    likes:                ['restaurant', 'entertainment'],
    incomePerGuestPerMin: 3.0,
    satisfactionWeight:   0.8,
    casinoVisitChance:    0.25,
    casinoSpendMult:      1.0,
    spendingMult:         1.0,
  },

  gambler: {
    id:                   'gambler',
    label:                'Gambler',
    icon:                 '🎰',
    reputationRequired:   5,
    likes:                ['casino'],
    incomePerGuestPerMin: 1.0,        // low hotel spend — they're here for chips
    satisfactionWeight:   0.4,        // mostly don't care about hotel quality
    casinoVisitChance:    0.90,
    casinoSpendMult:      2.5,        // heavy casino spender
    spendingMult:         0.8,
    // Gamblers boost casino dept income directly
    casinoDeptBonus:      0.08,       // +8% to casino dept income per gambler
  },

  businessGuest: {
    id:                   'businessGuest',
    label:                'Business Guest',
    icon:                 '💼',
    reputationRequired:   8,
    likes:                ['rooms', 'bar'],
    incomePerGuestPerMin: 6.0,
    satisfactionWeight:   1.2,        // very demanding
    casinoVisitChance:    0.15,
    casinoSpendMult:      1.0,
    spendingMult:         1.5,
    // Requires quiet — penalised by entertainment noise [future]
  },

  vip: {
    id:                   'vip',
    label:                'VIP Guest',
    icon:                 '⭐',
    reputationRequired:   12,
    likes:                ['spa', 'casino', 'bar'],
    incomePerGuestPerMin: 15.0,
    satisfactionWeight:   1.5,
    casinoVisitChance:    0.60,
    casinoSpendMult:      3.0,
    spendingMult:         3.0,
    // VIPs are special events, not constant population
    isSpecialEvent:       true,
    visitDurationHours:   { min: 2, max: 8 },
  },

  highRoller: {
    id:                   'highRoller',
    label:                'High Roller',
    icon:                 '💎',
    reputationRequired:   20,
    likes:                ['casino'],
    incomePerGuestPerMin: 8.0,
    satisfactionWeight:   0.8,
    casinoVisitChance:    1.00,       // always visits casino
    casinoSpendMult:      8.0,
    spendingMult:         5.0,
    // Hard requirements beyond reputation
    requiresCasinoLevel:  3,
    requiresSecurityLevel: 1,
    isSpecialEvent:       true,
    visitDurationHours:   { min: 1, max: 4 },
  },

};
```

### 7c. Guest Population Formula

```js
function updateGuestMix(reputation, departments) {
  // Which guest types are currently unlocked?
  const unlocked = Object.values(GUEST_TYPES)
    .filter(g => reputation >= g.reputationRequired && !g.isSpecialEvent)
    .sort((a, b) => a.reputationRequired - b.reputationRequired);

  // Weight distribution — higher types are rarer but grow with reputation
  // Simple version: first type gets 60%, second 25%, third 12%, fourth 3%
  const weights = [0.60, 0.25, 0.12, 0.03];
  const mix = {};
  Object.keys(GUEST_TYPES).forEach(id => mix[id] = 0);
  unlocked.forEach((type, i) => {
    mix[type.id] = weights[i] ?? 0.01;
  });
  return mix;
}

function guestIncomeMultiplier(guests) {
  if (!guests || guests.population === 0) return 0.5;
  // More guests = more income, diminishing returns above capacity
  const capacity = 10; // read from rooms config in practice
  const occupancy = guests.population / capacity;
  if (occupancy >= 1.0) return 1.3;   // overbooked bonus, but satisfaction drops
  if (occupancy >= 0.8) return 1.1;
  if (occupancy >= 0.5) return 1.0;   // baseline
  if (occupancy >= 0.2) return 0.8;
  return 0.6;                          // nearly empty hotel
}
```

---

## 8. `Stats` — Lifetime Counters

These are display-only totals. Never used in income calculations.

```js
stats: {
  hotelCashEarned:   { total: 0, fromRooms: 0, fromCasino: 0 },
  hotelCashSpent:    { total: 0, onUpgrades: 0 },
  totalTicksElapsed: 0,
  peakReputation:    1,
  peakSatisfaction:  75,
  // [Phase 2]
  guestsHosted:      { total: 0, vips: 0, highRollers: 0 },
  satisfactionAvg:   75,            // rolling average
}
```

---

## 9. `Achievements` — Unlock Flags + Reputation Bonuses

```js
achievements: {
  reputationBonus:  0,          // sum of rep granted by unlocked achievements
  unlocked:         [],         // array of achievement IDs

  // Progress trackers for achievements not yet unlocked
  progress: {
    'first_upgrade':        { current: 0, required: 1  },
    'five_upgrades':        { current: 0, required: 5  },
    'satisfaction_80':      { current: 0, required: 1  },  // sustained 80%+ for 1 hour
    'first_vip':            { current: 0, required: 1  },
    'ten_blackjack_wins':   { current: 0, required: 10 },  // casino → hotel bridge
    'jackpot_hit':          { current: 0, required: 1  },  // casino → hotel bridge
    'full_house':           { current: 0, required: 1  },  // all room capacity filled
  },
}
```

**Achievement → Reputation grants** (config):

```js
const ACHIEVEMENT_CATALOG = [
  { id: 'first_upgrade',      label: 'Room Service',      repBonus: 1, icon: '🔨' },
  { id: 'five_upgrades',      label: 'Expansion Mode',    repBonus: 2, icon: '📐' },
  { id: 'satisfaction_80',    label: 'Guest Favourite',   repBonus: 2, icon: '😊' },
  { id: 'first_vip',         label: 'Red Carpet',         repBonus: 3, icon: '⭐' },
  { id: 'ten_blackjack_wins', label: 'House Advantage',   repBonus: 1, icon: '🂡' },
  { id: 'jackpot_hit',        label: 'Lucky Resort',      repBonus: 2, icon: '🎰' },
  { id: 'full_house',         label: 'No Vacancy',        repBonus: 2, icon: '🏨' },
];
```

---

## 10. `CasinoBridge` — Casino ↔ Hotel Integration

This is a *read-only pointer layer*. The casino code never touches the hotel
state directly. The hotel code fires events; `CasinoBridge` logs what came through.

```js
casinoBridge: {
  // Multiplier applied to hotel income after a casino event
  activeMultiplier:      1.0,
  multiplierExpiry:      null,      // ms timestamp

  // Lifetime casino event counts (for mission + achievement progress)
  events: {
    blackjackWins:        0,
    blackjackLosses:      0,
    slotsSpun:            0,
    jackpotsHit:          0,
    coinFlipsWon:         0,
    totalChipsWagered:    0,
  },

  // Last known casino-side state (snapshots, not live values)
  snapshot: {
    casinoLevel:          1,        // read from dept.casino.level
    chipBalance:          100,      // read from CasinoWallet.get()
    playerLevel:          1,        // read from casinoProfile
    lastSnapshot:         null,
  },
}
```

**Integration event types** (fired by casino code, handled by hotel):

| Casino Event | Hotel Effect |
|---|---|
| `blackjack_win` | +1 mission progress, small rep tick |
| `blackjack_win` × 5 in session | +reputation, unlock "House Advantage" |
| `jackpot_hit` | +2 reputation, attract High Roller flag |
| `slots_spun` × 25 | +casino dept XP |
| `all_chips_lost` | Hotel offers 50 comp chips (drawn from hotel cash) |
| `casino_level_up` | Unlocks higher bet limits, new guest types |

**Hotel upgrade → Casino effects:**

| Hotel Upgrade | Casino Effect |
|---|---|
| Casino Lv 2 | Bet limit × 1.5 |
| Casino Lv 3 | Unlocks High Roller tables |
| Casino Lv 4 | Daily chip bonus +50 |
| Casino Lv 5 | Jackpot payout × 1.2 |
| Bar Lv 1 | Guest spending bonus in casino +5% |
| Security Lv 1 | Unlocks High Roller access |
| VIP Lounge (Bar Lv 3+) | Daily bonus +100 chips |

---

## 11. Default Save — New Game

```js
function createNewSave(hotelName = 'Grand Casino Resort') {
  return {
    meta: {
      version: 1,
      saveId: crypto.randomUUID(),
      hotelName,
      hotelTier: 1,
      createdAt: Date.now(),
      lastSaved: Date.now(),
      lastOpened: Date.now(),
    },
    currencies: {
      hotelCash: 5000,      // starter cash — enough to buy one upgrade
      crowns: 0,
      reputation: 1,
    },
    departments: {
      rooms:         { unlocked: true,  level: 1, lastCollected: Date.now() },
      casino:        { unlocked: true,  level: 1, lastCollected: Date.now() },
      restaurant:    { unlocked: false, level: 0, lastCollected: null },
      bar:           { unlocked: false, level: 0, lastCollected: null },
      entertainment: { unlocked: false, level: 0, lastCollected: null },
      spa:           { unlocked: false, level: 0, lastCollected: null },
      security:      { unlocked: false, level: 0, lastCollected: null },
      maintenance:   { unlocked: false, level: 0, lastCollected: null },
    },
    ticker: {
      lastTick: Date.now(),
      offlineCapHours: 4,
      activeMultiplier: 1.0,
      activeMultiplierExpiry: null,
      totalMinutesActive: 0,
    },
    satisfaction: {
      current: 75,
      rollingAverage: 75,
      trend: 'stable',
      lastUpdated: Date.now(),
      components: {
        roomComfort: 10, foodQuality: 0, entertainment: 0,
        overcrowdingPenalty: 0, maintenancePenalty: 0,
        securityPenalty: 0, pricePenalty: 0,
      },
    },
    guests: {
      population: 5,
      checkInRate: 2,
      checkOutRate: 1,
      mix: { budgetTraveler: 1.0, tourist: 0, gambler: 0,
             businessGuest: 0, vip: 0, highRoller: 0 },
      vipPresent: false,
      highRollerPresent: false,
      vipDepartsAt: null,
      stats: { totalHosted: 0, vipsHosted: 0, highRollersHosted: 0, totalSpent: 0 },
    },
    stats: {
      hotelCashEarned: { total: 0, fromRooms: 0, fromCasino: 0 },
      hotelCashSpent: { total: 0, onUpgrades: 0 },
      totalTicksElapsed: 0,
      peakReputation: 1,
      peakSatisfaction: 75,
      guestsHosted: { total: 0, vips: 0, highRollers: 0 },
      satisfactionAvg: 75,
    },
    achievements: {
      reputationBonus: 0,
      unlocked: [],
      progress: {
        'first_upgrade': { current: 0, required: 1 },
        'five_upgrades': { current: 0, required: 5 },
        'satisfaction_80': { current: 0, required: 1 },
        'first_vip': { current: 0, required: 1 },
        'ten_blackjack_wins': { current: 0, required: 10 },
        'jackpot_hit': { current: 0, required: 1 },
        'full_house': { current: 0, required: 1 },
      },
    },
    casinoBridge: {
      activeMultiplier: 1.0,
      multiplierExpiry: null,
      events: {
        blackjackWins: 0, blackjackLosses: 0, slotsSpun: 0,
        jackpotsHit: 0, coinFlipsWon: 0, totalChipsWagered: 0,
      },
      snapshot: { casinoLevel: 1, chipBalance: 100, playerLevel: 1, lastSnapshot: null },
    },
  };
}
```

---

## 12. Economy Targets — Tuning Reference

Use these to stay calibrated while building Phase 1.

| Goal | Target Time (idle only) | Notes |
|---|---|---|
| First upgrade (any dept) | 5–8 minutes | Rooms Lv2 = 500 cash, start = 125/min |
| Unlock first new dept | 20–30 minutes | Restaurant unlock at rep 3 |
| Dept 2 Lv2 upgrade | 45–60 minutes | Compounding income by now |
| First VIP guest | 2–3 hours | Rep 12 — meaningful milestone |
| Hotel Tier 2 | 4–6 hours first session | Feel like real progress |

> Starting income: Rooms Lv1 (50/min) + Casino Lv1 (75/min) = **125 hotel cash/min**.
> At baseline satisfaction (75, ×1.0 mult) and 5 guests (×1.0 mult): **125/min**.
> Rooms Lv2 costs 500 → **4 minutes idle**. That's slightly fast.
> Consider starting with **3,000 hotel cash** (not 5,000) so the first upgrade
> takes a satisfying 6–7 minutes, not a trivial 4.

---

## 13. Files to Create

```
casino/
├── hotel/
│   ├── hotel-state.js        ← save/load, createNewSave(), migration
│   ├── hotel-config.js       ← UPGRADE_CATALOG, GUEST_TYPES, ACHIEVEMENT_CATALOG
│   ├── hotel-engine.js       ← calculateIncome(), recalculateSatisfaction(),
│   │                            updateGuestMix(), tick()
│   ├── hotel-bridge.js       ← casino ↔ hotel event integration
│   └── hotel-ui.js           ← DOM updates, dept cards, satisfaction meter
│
├── index.html                ← lobby transforms into hotel overview (Phase 3 UI)
└── hotel.css                 ← hotel management UI styles
```

> Build and test `hotel-state.js` + `hotel-engine.js` first with `console.log`
> before touching any UI. The engine is the foundation — get the numbers right
> before you add DOM.
