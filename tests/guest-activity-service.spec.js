const { test, expect } = require('@playwright/test');
const { activitySimulation } = require('./helpers/management-world');
const { savedResort } = require('./helpers/saved-resort');

test('actual canonical reception categories map to 6/8/12 seconds with independent fallback', async ({ page }) => {
  const rows = await activitySimulation(page, ({ projectHotelState, GuestActivityDirector }, original) => {
    const results = [], add = edit => { const s = structuredClone(original); edit(s); const snapshot = projectHotelState(s);
      results.push({ snapshot, activity: new GuestActivityDirector().derive(snapshot) }); };
    add(() => {}); add(s => { s.staff.roster[0].assignment = 'rest'; s.staff.roster[2].assignment = 'lobby'; });
    add(s => { s.staff.roster = []; }); add(s => { s.staff.roster[0].stamina = 0; });
    add(s => { delete s.staff.roster; }); add(s => { delete s.departments.rooms.level; });
    return results;
  }, JSON.parse(savedResort().hotelGameState));
  expect(rows.map(r => r.activity.serviceMs)).toEqual([6000, 8000, 12000, 12000, 8000, 6000]);
  expect(rows.slice(0, 4).map(r => r.snapshot.reception.coverageStatus)).toEqual(['covered', 'thin', 'short', 'short']);
  expect(rows[5].activity.profile).toBe('fallback');
});

for (const initial of [6000, 8000, 12000]) test(`reception captures ${initial}ms at service start, retaining active service and FCFS across staffing changes`, async ({ page }) => {
  const result = await activitySimulation(page, ({ GuestTrafficController, seededGuestRandom }, initial) => {
    const t = new GuestTrafficController({ rng: seededGuestRandom(19), config: { minArrivalMs: 1000, maxArrivalMs: 1000,
      weights: { checkIn: 100, casino: 0, relaxing: 0, hotelDeparture: 0 } } });
    t.queue.setPresentationServiceMs(initial);
    const owner = { x: 206, y: 220, radius: 14 };
    while (!t.queue.serviceOrder.length && t.activeMs < 120000) t.update(50, owner);
    const id = t.queue.serviceOrder[0], entry = t.queue.entries.get(id);
    const before = { ...entry, controller: null }, queued = [...t.queue.entries.keys()].filter(key => key !== id);
    const next = initial === 12000 ? 6000 : 12000;
    t.queue.setPresentationServiceMs(next);
    const unchanged = JSON.stringify({ ...entry, controller: null }) === JSON.stringify(before);
    while (t.queue.serviceOrder.length < 2 && t.activeMs < 180000) t.update(50, owner);
    const second = t.queue.entries.get(t.queue.serviceOrder[1]);
    t.stopArrivals(); for (let i = 0; i < 8000 && t.guests.length; i++) t.update(50, owner);
    return { before, unchanged, queued, second: second && { id: second.id, serviceDurationMs: second.serviceDurationMs },
      next, history: t.completedHistory, final: t.snapshot(), entries: t.queue.entries.size };
  }, initial);
  expect(result.unchanged).toBe(true); expect(result.before).toMatchObject({ serviceDurationMs: initial, serviceRemainingMs: initial });
  expect(result.queued.length).toBeGreaterThan(0); expect(result.second).toMatchObject({ id: result.queued[0], serviceDurationMs: result.next });
  expect(result.history.find(g => g.id === result.before.id).serviceEndedMs - result.before.serviceStartedMs).toBe(initial);
  expect(result.final.queue.serviceOrder).toEqual(result.final.queue.arrivalOrder);
  expect(result.final.queue.completedOrder).toEqual(result.final.queue.serviceOrder); expect(result.final.activeCount).toBe(0);
  expect(result.entries).toBe(0); expect(result.final.queue.slots.every(s => !s.reservedBy && !s.clearingBy)).toBe(true);
});
