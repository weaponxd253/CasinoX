const { test, expect } = require('@playwright/test');
const { activitySimulation } = require('./helpers/management-world');
const metrics = percentage => ({ occupancy: { available: percentage !== null, percentage }, reception: { available: false }, satisfaction: { available: false } });

for (const cap of [6, 8]) test(`activity profiles at configured cap ${cap} use only bounded future-admission policy`, async ({ page }) => {
  const rows = await activitySimulation(page, ({ GuestActivityDirector }, { cap, inputs }) => inputs.map(s => new GuestActivityDirector({ maxVisible: cap }).derive(s)),
    { cap, inputs: [0, 29, 30, 69, 70, 94, 95, 130, 200, null].map(metrics) });
  expect(rows.map(r => r.profile)).toEqual(['low', 'low', 'moderate', 'moderate', 'high', 'high', 'high', 'high', 'high', 'fallback']);
  expect(rows.map(r => r.traffic.admissionCeiling)).toEqual(cap === 6 ? [3, 3, 5, 5, 6, 6, 6, 6, 6, 6] : [4, 4, 7, 7, 8, 8, 8, 8, 8, 8]);
  expect(rows[0].traffic).toMatchObject({ minArrivalMs: 30000, maxArrivalMs: 50000 });
  expect(rows[2].traffic).toMatchObject({ minArrivalMs: 20000, maxArrivalMs: 35000 });
  expect(rows[4].traffic).toMatchObject({ minArrivalMs: 12000, maxArrivalMs: 22000 });
  expect(rows[6]).toMatchObject({ nearFull: true, traffic: { weights: { checkIn: 20, hotelDeparture: 35 } } });
  expect(rows[9].traffic).toMatchObject({ minArrivalMs: 15000, maxArrivalMs: 30000 });
  rows.forEach(r => expect(Object.values(r.traffic.weights).reduce((a, b) => a + b, 0)).toBe(100));
});

test('occupancy hysteresis avoids boundary oscillation and unavailable data resets only its policy', async ({ page }) => {
  const rows = await activitySimulation(page, ({ GuestActivityDirector }, inputs) => { const d = new GuestActivityDirector(); return inputs.map(s => d.derive(s)); },
    [29, 30, 32, 33, 70, 72, 73, 69, 67, 66, 28, 27, 26, 96, 94, 90, 89, null, 30].map(metrics));
  expect(rows.map(r => r.profile)).toEqual(['low', 'low', 'low', 'moderate', 'moderate', 'moderate', 'high', 'high', 'high', 'moderate', 'moderate', 'moderate', 'low', 'high', 'high', 'high', 'high', 'fallback', 'moderate']);
  expect(rows.slice(13, 17).map(r => r.nearFull)).toEqual([true, true, true, false]);
});

test('profile changes retain exact live journeys, reservations and pending purpose while excess guests drain naturally', async ({ page }) => {
  const result = await activitySimulation(page, ({ GuestTrafficController, seededGuestRandom, GuestActivityDirector }, input) => {
    const t = new GuestTrafficController({ rng: seededGuestRandom(19), config: { minArrivalMs: 1500, maxArrivalMs: 2500, minIdleMs: 20000, maxIdleMs: 25000 } });
    const owner = { x: 206, y: 220, radius: 14 };
    while (t.guests.length < 6 && t.activeMs < 120000) t.update(50, owner);
    // Exercise a due arrival held at the old ceiling before the policy changes.
    t.scheduleArrival(t.nextArrivalMs, owner);
    const before = t.guests.map(g => t.guestSnapshot(g)), queue = t.queue.snapshot(), pending = t.pending && { ...t.pending };
    const settings = new GuestActivityDirector().derive(input).traffic;
    t.applyActivitySettings({ ...settings, maxMoving: 100, maxVisible: 100 });
    const after = t.guests.map(g => t.guestSnapshot(g)), changed = t.snapshot();
    const violations = []; let blocked = false;
    for (let i = 0; i < 12000; i++) { const created = t.stats.created, count = t.guests.length; t.update(50, owner);
      if (t.stats.created > created && count >= 3) violations.push('admitted above lower ceiling');
      if (t.movedThisStep.length > 4) violations.push('movement cap');
      if (t.admissionBlocked === 'activity-ceiling') blocked = true;
    }
    t.stopArrivals(); for (let i = 0; i < 4000 && t.guests.length; i++) t.update(50, owner);
    return { before, after, queue, changedQueue: changed.queue, pending, afterPending: changed.pending, changed, violations, blocked, final: t.snapshot() };
  }, metrics(0));
  expect(result.before).toHaveLength(6); expect(result.after).toEqual(result.before); expect(result.changedQueue).toEqual(result.queue);
  if (result.pending) expect(result.afterPending).toMatchObject(result.pending);
  expect(result.changed).toMatchObject({ populationCap: 6, admissionCeiling: 3, drainingCount: 3, maxMoving: 4 });
  expect(result.violations).toEqual([]); expect(result.blocked).toBe(true); expect(result.final.activeCount).toBe(0);
  expect(result.final.stats.completed).toBe(result.final.stats.created);
});

test('arrival refresh preserves remaining fraction and unchanged settings consume no random draws', async ({ page }) => {
  const result = await activitySimulation(page, ({ GuestTrafficController, seededGuestRandom, GuestActivityDirector }, input) => {
    let draws = 0; const rng = seededGuestRandom(19), t = new GuestTrafficController({ rng: () => { draws++; return rng(); } });
    const owner = { x: 206, y: 220, radius: 14 }; for (let i = 0; i < 100; i++) t.update(50, owner);
    const fraction = t.nextArrivalMs / t.arrivalIntervalMs, settings = new GuestActivityDirector().derive(input).traffic;
    t.applyActivitySettings(settings); const changedDraws = draws, changed = t.nextArrivalMs / t.arrivalIntervalMs;
    for (let i = 0; i < 1000; i++) t.applyActivitySettings(settings);
    return { fraction, changed, changedDraws, draws, moving: t.config.maxMoving, cap: t.config.maxVisible };
  }, metrics(0));
  expect(result.changed).toBeCloseTo(result.fraction, 12); expect(result.changedDraws).toBe(2); expect(result.draws).toBe(2);
  expect(result).toMatchObject({ moving: 4, cap: 6 });
});
