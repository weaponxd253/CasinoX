/* ============================================================
   HOTEL SHIFT TWISTS
   ------------------------------------------------------------
   One twist per shift, chosen by the hotel calendar (weekday +
   phase) or by a show that's on right now. Games read
   HotelTwists.active(deptId) when a shift starts and apply the
   twist's effects; the briefing strip and the dashboard show it.

   Effects (all optional, games use the ones that fit):
     extraGuests   more guests / tables / requests this shift
     arrivalMult   < 1 means guests arrive faster
     patienceMult  < 1 means guests are less patient
     cashMult      multiplies what each guest pays
     need          (spa) a need every guest has
     cleaningShare (floor ops) share of requests that are cleaning
     bigTable      (restaurant) one table mid-service is a big party
     extraSeconds  (check-in) longer session

   No twists on day 1. Dev/testing: localStorage.hotelTwistForce =
   '<twist id>' forces that twist on whatever the calendar says
   ('off' disables all twists); the dev panel cycles through them.
   ============================================================ */

const HotelTwists = (() => {
  const FORCE_KEY = 'hotelTwistForce';
  const WEEKEND = [5, 6];          // Saturday, Sunday (calendar.weekday: 0 = Monday)
  const WEEKNIGHTS = [0, 1, 2, 3]; // Monday–Thursday
  const FIRST_TWIST_DAY = 2;        // day 1 stays plain while the player learns the shifts

  // Order matters: the first twist whose condition holds wins.
  const TWISTS = [
    {
      id: 'showNightBar', dept: 'bar', emoji: '🎭', title: 'Show Night Crowd',
      when: ctx => ctx.shows.length > 0,
      summary: ctx => `${ctx.shows[0]?.label ?? 'Tonight\'s show'} just let out. Busier bar, bigger tips.`,
      effects: { extraGuests: 2, arrivalMult: 0.65, cashMult: 1.3 },
    },
    {
      id: 'happyHour', dept: 'bar', emoji: '🍸', title: 'Happy Hour',
      when: ctx => ctx.phase === 'evening',
      summary: () => 'Guests arrive faster and there are more of them. Tips are up 25%.',
      effects: { extraGuests: 2, arrivalMult: 0.6, cashMult: 1.25 },
    },
    {
      id: 'weddingParty', dept: 'restaurant', emoji: '💍', title: 'Wedding Party',
      when: ctx => WEEKEND.includes(ctx.weekday) && ctx.phase !== 'night',
      summary: () => 'A wedding party books a table mid-service. They want comfort and sparkle, and pay 2.5×.',
      effects: { extraGuests: 1, bigTable: 'wedding' },
    },
    {
      id: 'showNightDining', dept: 'restaurant', emoji: '🎭', title: 'Pre-Show Dinner',
      when: ctx => ctx.shows.length > 0,
      summary: ctx => `Guests are dining before ${ctx.shows[0]?.label ?? 'the show'}. One more table, 20% more per table.`,
      effects: { extraGuests: 1, cashMult: 1.2 },
    },
    {
      id: 'morningAfter', dept: 'spa', emoji: '🥱', title: 'Morning After',
      when: ctx => ctx.phase === 'morning' && WEEKEND.includes(ctx.weekday),
      summary: () => 'Every guest needs recovery after last night. Shorter patience, 25% more cash.',
      effects: { need: 'tired', patienceMult: 0.85, cashMult: 1.25 },
    },
    {
      id: 'executiveUnwind', dept: 'spa', emoji: '💼', title: 'Executive Unwind',
      when: ctx => ctx.phase === 'evening' && WEEKNIGHTS.includes(ctx.weekday),
      summary: () => 'Business guests come in stressed after work. Two extra guests, 20% more cash.',
      effects: { need: 'stressed', extraGuests: 2, cashMult: 1.2 },
    },
    {
      id: 'checkoutRush', dept: 'rooms', emoji: '🧳', title: 'Checkout Rush',
      when: ctx => ctx.phase === 'morning',
      summary: () => 'Checkouts flood housekeeping: half the requests are room resets. Miss them and Check-In inherits dirty rooms.',
      effects: { extraGuests: 2, cleaningShare: 0.5, cashMult: 1.2 },
    },
    {
      id: 'conference', dept: 'lobby', emoji: '🪪', title: 'Conference Arrivals',
      when: ctx => ctx.phase === 'afternoon' && WEEKNIGHTS.includes(ctx.weekday),
      summary: () => 'A conference checks in at once. Three extra guests with less patience, 30% more cash.',
      effects: { extraGuests: 3, patienceMult: 0.85, cashMult: 1.3 },
    },
    {
      id: 'fridayArrivals', dept: 'lobby', emoji: '🧳', title: 'Friday Getaway',
      when: ctx => ctx.weekday === 4 && (ctx.phase === 'evening' || ctx.phase === 'afternoon'),
      summary: () => 'Weekenders pour in. Four extra guests and ten more seconds on the clock.',
      effects: { extraGuests: 4, extraSeconds: 10, cashMult: 1.15 },
    },
  ];

  function context(state = window.HotelState?.get?.()) {
    const calendar = state?.calendar ?? {};
    const shows = window.HotelEngine?.activeEntertainmentBookings?.(state) ?? [];
    return {
      weekday: Number.isInteger(calendar.weekday) ? calendar.weekday : 0,
      phase: calendar.phase ?? 'morning',
      day: calendar.day ?? 1,
      shows,
    };
  }

  function forced() {
    try { return localStorage.getItem(FORCE_KEY); } catch (_) { return null; }
  }

  function materialize(twist, ctx) {
    return {
      id: twist.id,
      dept: twist.dept,
      emoji: twist.emoji,
      title: twist.title,
      summary: twist.summary(ctx),
      effects: { ...twist.effects },
    };
  }

  /** The twist on for this department right now, or null. */
  function active(deptId, state) {
    const force = forced();
    if (force === 'off') return null;
    const ctx = context(state);
    if (force) {
      const pick = TWISTS.find(t => t.id === force && t.dept === deptId);
      if (pick) return materialize(pick, { ...ctx, shows: ctx.shows.length ? ctx.shows : [{ label: 'Tonight\'s show' }] });
    }
    if (ctx.day < FIRST_TWIST_DAY) return null;
    const twist = TWISTS.find(t => t.dept === deptId && t.when(ctx));
    return twist ? materialize(twist, ctx) : null;
  }

  /** Dev mode: step through every twist (then back to the calendar). */
  function cycleForced() {
    const ids = TWISTS.map(t => t.id);
    const next = ids[ids.indexOf(forced()) + 1] ?? null;
    try {
      if (next) localStorage.setItem(FORCE_KEY, next);
      else localStorage.removeItem(FORCE_KEY);
    } catch (_) { /* storage unavailable */ }
    return next ? TWISTS.find(t => t.id === next) : null;
  }

  return { active, cycleForced, TWISTS, FORCE_KEY };
})();

if (typeof window !== 'undefined') window.HotelTwists = HotelTwists;
