/* ============================================================
   HOTEL MANAGER — DAILY GOALS  (hotel-goals.js)
   ------------------------------------------------------------
   Three goals per in-game day — one hotel shift, one casino,
   one management goal — and a reward chest when all three are
   done. Progress is measured against counters the game already
   keeps (shifts completed, casino bridge events, upgrades, cash
   earned), compared with a baseline taken when the day's goals
   are created, so nothing else needs to report progress.

   Load after hotel-engine.js; used by hotel-ui.js.
   ============================================================ */

const HotelGoals = (() => {
  const SHIFT_GOALS = {
    lobby: 'Check-In Rush', rooms: 'Floor Ops', restaurant: 'Tasting Room', bar: 'Bar Shift', spa: 'Spa Rush',
  };

  function counters(state) {
    const ev = state.casinoBridge?.events ?? {};
    return {
      shifts: state.stats?.shiftsCompleted ?? 0,
      byDept: { ...(state.stats?.shiftsByDept ?? {}) },
      upgrades: state.stats?.upgradeCount ?? 0,
      cashEarned: state.stats?.hotelCashEarned?.total ?? 0,
      bjWins: ev.blackjackWins ?? 0,
      spins: ev.slotsSpun ?? 0,
      wagered: ev.totalChipsWagered ?? 0,
    };
  }

  const pick = list => list[Math.floor(Math.random() * list.length)];

  function builtShiftDepts(state) {
    return Object.keys(SHIFT_GOALS).filter(id => id === 'lobby'
      || (state.departments?.[id]?.unlocked && (state.departments[id].level ?? 0) > 0));
  }

  function generate(state) {
    const day = state.calendar?.day ?? 1;
    const tier = 1 + Math.floor((day - 1) / 5);          // a little harder every 5 days
    const ipm = HotelEngine.currentIpm(state);
    const built = builtShiftDepts(state);

    const shiftCount = Math.min(4, 1 + tier);
    const hotelGoal = Math.random() < 0.5
      ? (() => { const dept = pick(built); return { id: 'dept_shift', kind: 'hotel', dept, label: `Run ${SHIFT_GOALS[dept]}`, target: 1 }; })()
      : { id: 'run_shifts', kind: 'hotel', label: `Run ${shiftCount} hotel shifts`, target: shiftCount };

    const casinoGoal = pick([
      { id: 'bj_wins', kind: 'casino', label: `Win ${1 + tier} blackjack hands`, target: 1 + tier, href: '../blackjack/index.html' },
      { id: 'spins', kind: 'casino', label: `Spin Lucky Reels ${10 * tier} times`, target: 10 * tier, href: '../slots/index.html' },
      { id: 'wagered', kind: 'casino', label: `Wager $${40 * tier} in the casino`, target: 40 * tier, href: '../casino.html' },
    ]);

    const sat = state.satisfaction?.current ?? 50;
    const satTarget = Math.min(95, Math.ceil((sat + 6) / 5) * 5);
    const cashTarget = Math.max(500, Math.round((ipm * 20) / 100) * 100);
    const mgmtGoal = pick([
      { id: 'satisfaction', kind: 'manage', label: `Reach ${satTarget}% satisfaction`, target: satTarget },
      { id: 'earn_cash', kind: 'manage', label: `Earn $${cashTarget.toLocaleString()} hotel cash`, target: cashTarget },
      { id: 'upgrade', kind: 'manage', label: 'Buy a department upgrade', target: 1 },
    ]);

    return {
      day,
      createdAt: Date.now(),
      baseline: counters(state),
      items: [hotelGoal, casinoGoal, mgmtGoal].map(goal => ({ ...goal, progress: 0, done: false })),
      reward: {
        cash: Math.max(300, Math.round((ipm * 15) / 50) * 50),
        chips: 25 + 25 * tier,
      },
      claimed: false,
    };
  }

  function rawProgress(goal, state, base) {
    const now = counters(state);
    switch (goal.id) {
      case 'run_shifts':   return now.shifts - base.shifts;
      case 'dept_shift':   return (now.byDept[goal.dept] ?? 0) - (base.byDept[goal.dept] ?? 0);
      case 'bj_wins':      return now.bjWins - base.bjWins;
      case 'spins':        return now.spins - base.spins;
      case 'wagered':      return now.wagered - base.wagered;
      case 'satisfaction': return Math.max(goal.progress ?? 0, state.satisfaction?.current ?? 0);  // best reached
      case 'earn_cash':    return now.cashEarned - base.cashEarned;
      case 'upgrade':      return now.upgrades - base.upgrades;
      default:             return 0;
    }
  }

  /* Today's goals, created when the in-game day changes. */
  function ensure(state = HotelState.get()) {
    const day = state.calendar?.day ?? 1;
    if (!state.goals || state.goals.day !== day) {
      state.goals = generate(state);
      HotelState.save();
    }
    return state.goals;
  }

  /* Refresh progress; returns goals completed by this call (for toasts). */
  function update(state = HotelState.get()) {
    const goals = ensure(state);
    const completed = [];
    let changed = false;
    goals.items.forEach(goal => {
      const progress = Math.max(0, Math.min(goal.target, Math.floor(rawProgress(goal, state, goals.baseline))));
      if (progress !== goal.progress) { goal.progress = progress; changed = true; }
      if (!goal.done && progress >= goal.target) { goal.done = true; changed = true; completed.push(goal); }
    });
    if (changed) HotelState.save();
    return completed;
  }

  function allDone(goals = HotelState.get().goals) {
    return !!goals?.items?.length && goals.items.every(goal => goal.done);
  }

  /* Open the chest: hotel cash plus a few casino chips. */
  function claim(state = HotelState.get()) {
    const goals = state.goals;
    if (!goals || goals.claimed || !allDone(goals)) return null;
    goals.claimed = true;
    HotelState.tickAchievementProgress('first_chest', 1);
    HotelState.addHotelCash(goals.reward.cash);
    window.CasinoWallet?.add?.(goals.reward.chips);
    HotelState.save();
    return goals.reward;
  }

  return { ensure, update, claim, allDone, SHIFT_GOALS };
})();

if (typeof window !== 'undefined') window.HotelGoals = HotelGoals;
