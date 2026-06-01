/* ============================================================
   HOTEL MANAGER — ENGINE  (hotel-engine.js)
   ------------------------------------------------------------
   Pure calculation functions. Read from HotelState/HotelConfig.
   Never touch the DOM. Never save directly (call HotelState).
   ============================================================ */

const HotelEngine = (() => {

  /* ── Income ──────────────────────────────────────────────── */

  /**
   * Calculate hotel cash earned between lastTick and now.
   * Used both for the live 60s tick and on-boot offline calc.
   */
  function calculateIncome(state, now = Date.now()) {
    const { UPGRADE_CATALOG, ECONOMY } = HotelConfig;

    // 1. Sum base income per minute from all active departments
    let baseIpm = 0;
    const breakdown = {};
    for (const [id, dept] of Object.entries(state.departments)) {
      if (!dept.unlocked || dept.level === 0) continue;
      const stats = UPGRADE_CATALOG[id]?.[dept.level - 1];
      if (!stats) continue;
      const ipm = stats.ipm ?? 0;
      baseIpm += ipm;
      breakdown[id] = ipm;
    }

    // 2. Satisfaction multiplier
    const satMult = satisfactionMultiplier(state.satisfaction.current);

    // 3. Active multiplier (casino win boost)
    const activeMult = (state.ticker.activeMultiplierExpiry > now)
      ? state.ticker.activeMultiplier
      : 1.0;

    // 4. Casino bridge multiplier
    const bridgeMult = (state.casinoBridge.multiplierExpiry > now)
      ? state.casinoBridge.activeMultiplier
      : 1.0;

    const totalIpm = baseIpm * satMult * activeMult * bridgeMult;

    // 5. Minutes elapsed, capped for offline
    const elapsedMs  = now - state.ticker.lastTick;
    const elapsedMin = elapsedMs / 60_000;
    const capMin     = ECONOMY.OFFLINE_CAP_HOURS * 60;
    const billable   = Math.min(elapsedMin, capMin);

    return {
      amount:       Math.floor(totalIpm * billable),
      minutes:      billable,
      isOffline:    elapsedMin > 2,   // > 2 min = treat as offline return
      baseIpm,
      totalIpm,
      satMult,
      activeMult,
      bridgeMult,
      breakdown,
    };
  }

  function satisfactionMultiplier(sat) {
    if (sat >= 90) return 1.50;
    if (sat >= 75) return 1.25;
    if (sat >= 60) return 1.00;
    if (sat >= 40) return 0.75;
    return 0.50;
  }

  /* ── Satisfaction ─────────────────────────────────────────── */

  function recalculateSatisfaction(state) {
    const { UPGRADE_CATALOG } = HotelConfig;

    const get = (id, key, fallback = 0) => {
      const dept = state.departments[id];
      if (!dept?.unlocked || dept.level === 0) return fallback;
      return UPGRADE_CATALOG[id]?.[dept.level - 1]?.[key] ?? fallback;
    };

    const roomComfort      = get('rooms',         'sat');
    const foodQuality      = get('restaurant',    'sat');
    const entertainBonus   = get('entertainment', 'repBonus') * 1.5;  // rep → partial sat
    const spaBonus         = get('spa',           'sat') * 0.6;

    // Overcrowding: guests above room capacity hurt satisfaction
    const roomCapacity     = get('rooms', 'capacity', 10);
    const guestCount       = state.guests?.population ?? 5;
    const overcrowd        = Math.max(0, guestCount - roomCapacity) * 2.5;

    // Missing support departments hurt satisfaction
    const noMaintenance    = !state.departments.maintenance?.unlocked ? -8 : 0;
    const noSecurity       = !state.departments.security?.unlocked    ? -4 : 0;

    const raw = HotelConfig.ECONOMY.SAT_BASE
      + roomComfort
      + foodQuality
      + entertainBonus
      + spaBonus
      - overcrowd
      + noMaintenance
      + noSecurity;

    const clamped = Math.max(0, Math.min(100, Math.round(raw)));

    const prev = state.satisfaction.current;
    const trend = clamped > prev + 1 ? 'rising'
                : clamped < prev - 1 ? 'falling'
                : 'stable';

    HotelState.setSatisfaction(clamped);
    HotelState.setTrend(trend);
    HotelState.setSatisfactionComponents({
      roomComfort, foodQuality, entertainBonus, spaBonus,
      overcrowdingPenalty: -overcrowd,
      maintenancePenalty:  noMaintenance,
      securityPenalty:     noSecurity,
    });

    return clamped;
  }

  /* ── Reputation ──────────────────────────────────────────── */

  function recalculateReputation(state) {
    const { UPGRADE_CATALOG } = HotelConfig;

    // Base: sum of all department levels
    let base = 0;
    for (const [id, dept] of Object.entries(state.departments)) {
      if (!dept.unlocked || dept.level === 0) continue;
      base += dept.level;
      // Casino dept grants extra rep per level
      const stats = UPGRADE_CATALOG[id]?.[dept.level - 1];
      if (stats?.repBonus) base += stats.repBonus;
    }

    // Achievement bonus
    const achBonus = state.achievements.reputationBonus;

    // Satisfaction rolling bonus (Phase 2 will set rolling average)
    const satBonus = Math.floor((state.satisfaction.rollingAverage ?? 75) / 20);

    const rep = Math.max(1, base + achBonus + satBonus);
    HotelState.setReputation(rep);

    // Unlock departments whose reputation gate is now met
    checkDeptUnlocks(state, rep);

    return rep;
  }

  function checkDeptUnlocks(state, rep) {
    const { DEPT_UNLOCK_REP } = HotelConfig;
    for (const [id, reqRep] of Object.entries(DEPT_UNLOCK_REP)) {
      if (!state.departments[id]) continue;
      if (!state.departments[id].unlocked && rep >= reqRep) {
        HotelState.unlockDept(id);
        HotelBridge?.emit('dept_unlocked', { deptId: id });
      }
    }
  }

  /* ── On-boot offline tick ────────────────────────────────── */

  /**
   * Called once when the page loads.
   * Applies offline income and returns a summary for the UI
   * to display ("Welcome back! You earned $X while away").
   */
  function processBootTick() {
    const state  = HotelState.get();
    const now    = Date.now();
    const result = calculateIncome(state, now);

    if (result.amount > 0) {
      HotelState.addHotelCash(result.amount);
      HotelState.updateTicker(now);
    }

    // Restore guest population from offline absence
    if (window.HotelGuests) {
      const elapsed = now - (state.ticker.lastTick || now);
      const gResult = HotelGuests.restoreFromOffline(state, elapsed)
                   ?? HotelGuests.tick(state);
      HotelState.setGuestData(gResult);
    }

    recalculateSatisfaction(state);
    recalculateReputation(state);
    checkAchievements(state);

    return result;
  }

  /* ── Live tick (called by setInterval every 60s) ─────────── */

  function processLiveTick() {
    const state  = HotelState.get();
    const now    = Date.now();
    const result = calculateIncome(state, now);

    // Department passive income
    if (result.amount > 0) {
      HotelState.addHotelCash(result.amount);
      HotelBridge?.emit('income', { amount: result.amount, breakdown: result.breakdown });
    }

    // Guest system tick
    if (window.HotelGuests) {
      const gResult = HotelGuests.tick(state);
      HotelState.setGuestData(gResult);

      // Guest spending income (separate from dept income)
      if (gResult.guestIncome > 0) {
        HotelState.addHotelCash(gResult.guestIncome);
        HotelBridge?.emit('guest_income', { amount: gResult.guestIncome });
      }

      // Process special guest events
      gResult.specialEvents.forEach(ev => {
        if (ev.type === 'vip_arrival') {
          HotelState.setVipPresent(true, ev.departAt);
          HotelState.tickAchievementProgress('first_vip', 1);
          HotelBridge?.emit('vip_arrival', { typeId: 'vip' });
          CasinoShell?.toast('⭐ A VIP guest has arrived at the hotel!');
        } else if (ev.type === 'vip_departure') {
          HotelState.setVipPresent(false, null);
          CasinoShell?.toast('⭐ The VIP guest has checked out.');
        } else if (ev.type === 'high_roller_arrival') {
          HotelState.setHighRollerFlag();
          HotelBridge?.emit('high_roller_arrival', {});
          CasinoShell?.toast('💎 A High Roller has arrived — head to the casino!');
        } else if (ev.type === 'high_roller_departure') {
          HotelState.clearHighRollerFlag();
        }
      });
    }

    HotelState.updateTicker(now);
    recalculateSatisfaction(state);
    recalculateReputation(state);
    checkAchievements(state);

    return result;
  }

  /* ── Achievement checks ──────────────────────────────────── */

  function checkAchievements(state) {
    // Upgrade count
    if (state.stats.upgradeCount >= 1)
      HotelState.tickAchievementProgress('first_upgrade',  0);
    if (state.stats.upgradeCount >= 5)
      HotelState.tickAchievementProgress('five_upgrades',  0);

    // Satisfaction
    if (state.satisfaction.current >= 80)
      HotelState.tickAchievementProgress('satisfaction_80', 1);

    // All depts unlocked
    const allUnlocked = Object.values(state.departments).every(d => d.unlocked);
    if (allUnlocked) {
      HotelState.tickAchievementProgress('all_depts_unlocked', 7);
    }

    // Full house
    const cap = HotelConfig.UPGRADE_CATALOG.rooms?.[state.departments.rooms.level - 1]?.capacity ?? 0;
    if (state.guests.population >= cap && cap > 0)
      HotelState.tickAchievementProgress('full_house', 1);
  }

  /* ── Helpers ─────────────────────────────────────────────── */

  /** Combined income rate (dept + guest spending) shown in header */
  function currentIpm(state) {
    const { UPGRADE_CATALOG } = HotelConfig;
    let deptTotal = 0;
    for (const [id, dept] of Object.entries(state.departments)) {
      if (!dept.unlocked || dept.level === 0) continue;
      deptTotal += UPGRADE_CATALOG[id]?.[dept.level - 1]?.ipm ?? 0;
    }
    const satMult    = satisfactionMultiplier(state.satisfaction.current);
    const activeMult = (state.ticker.activeMultiplierExpiry > Date.now())
      ? state.ticker.activeMultiplier : 1.0;
    const deptIpm = Math.round(deptTotal * satMult * activeMult);

    // Guest spending income (1 min interval)
    const guestIpm = window.HotelGuests
      ? HotelGuests.calculateGuestIncome(state.guests, 1)
      : 0;

    return deptIpm + guestIpm;
  }

  /** Cost to upgrade deptId to the next level */
  function nextUpgradeCost(state, deptId) {
    const dept    = state.departments[deptId];
    const catalog = HotelConfig.UPGRADE_CATALOG[deptId];
    if (!dept || !catalog) return null;
    if (dept.level >= catalog.length) return null;   // max
    return catalog[dept.level].cost;                 // next = current level index
  }

  /** Stats block for the next upgrade level (or null if maxed) */
  function nextUpgradeStats(state, deptId) {
    const dept    = state.departments[deptId];
    const catalog = HotelConfig.UPGRADE_CATALOG[deptId];
    if (!dept || !catalog || dept.level >= catalog.length) return null;
    return catalog[dept.level];
  }

  return {
    calculateIncome, satisfactionMultiplier,
    recalculateSatisfaction, recalculateReputation,
    processBootTick, processLiveTick,
    checkAchievements, checkDeptUnlocks,
    currentIpm, nextUpgradeCost, nextUpgradeStats,
  };
})();

if (typeof window !== 'undefined') window.HotelEngine = HotelEngine;