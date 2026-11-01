const { test, expect } = require('@playwright/test');
const { activitySimulation } = require('./helpers/management-world');
const { savedResort } = require('./helpers/saved-resort');

for (const cap of [6, 8]) for (const scenario of ['low', 'moderate', 'high', 'partial', 'unavailable', 'transition', 'busy-cap']) {
  test(`600 active seconds of ${scenario} management activity at configured cap ${cap}`, async ({ page }, info) => {
    test.setTimeout(120000);
    const result = await activitySimulation(page, ({ GuestTrafficController, GuestActivityDirector, projectHotelState, seededGuestRandom, walkable, clearSegment, lobbyPath, GuestDialogueController }, { cap, scenario, state }) => {
      const originalState = JSON.stringify(state), originalPath = lobbyPath({ x: 340, y: 300 }, { x: 252, y: 220 });
      const d = new GuestActivityDirector({ maxVisible: cap }), dialogue = new GuestDialogueController({ rng: seededGuestRandom(42) });
      const fixture = structuredClone(state);
      if (scenario === 'low') { fixture.guests.population = 1; fixture.satisfaction.current = 0; }
      if (scenario === 'moderate') { fixture.guests.population = 5; fixture.staff.roster[0].assignment = 'rest'; fixture.staff.roster[2].assignment = 'lobby'; }
      if (['high', 'transition', 'busy-cap'].includes(scenario)) { fixture.guests.population = 20; fixture.staff.roster = []; fixture.satisfaction.current = 100; }
      if (scenario === 'partial') { delete fixture.departments.rooms.level; delete fixture.satisfaction.current; }
      const get = () => projectHotelState(scenario === 'unavailable' ? null : fixture);
      let policy = d.derive(get());
      const stress = scenario === 'busy-cap', initial = policy.traffic;
      const t = new GuestTrafficController({ rng: seededGuestRandom(19), config: { maxVisible: cap, hardCap: 8,
        minArrivalMs: stress ? 500 : initial.minArrivalMs, maxArrivalMs: stress ? 1000 : initial.maxArrivalMs,
        weights: initial.weights, historyLimit: 32 } });
      const apply = () => { policy = d.derive(get()); t.applyActivitySettings({ ...policy.traffic,
        ...(stress ? { minArrivalMs: 500, maxArrivalMs: 1000 } : {}) }); t.queue.setPresentationServiceMs(policy.serviceMs); dialogue.setSatisfactionMood(policy.dialogueMood); };
      apply();
      const owner = { x: 206, y: 220, radius: 14 }, invalid = [], seen = new Set(); let preserved = true;
      for (let i = 0; i < 12000; i++) {
        if (scenario === 'transition' && [4000, 8000].includes(i)) {
          const before = t.guests.map(g => t.guestSnapshot(g)), queue = JSON.stringify(t.queue.snapshot());
          fixture.guests.population = i === 4000 ? 0 : 8; fixture.satisfaction.current = i === 4000 ? 0 : 90;
          fixture.staff.roster = i === 4000 ? structuredClone(state.staff.roster) : [];
          apply(); preserved &&= JSON.stringify(before) === JSON.stringify(t.guests.map(g => t.guestSnapshot(g))) && queue === JSON.stringify({ ...t.queue.snapshot(), nextServiceMs: JSON.parse(queue).nextServiceMs });
        } else if (i % 200 === 0) apply();
        const before = new Map(t.guests.map(g => [g.id, { ...g.controller.position }]));
        t.update(50, owner);
        const guests = t.activeGuests();
        dialogue.update(t.activeMs, guests.map(g => ({ id: g.id, personality: g.personality, spawned: true, complete: false,
          position: g.controller.position, radius: g.controller.radius, moving: g.controller.moving, arrived: g.controller.arrived,
          purpose: g.purpose, state: g.state, spawnedAtMs: g.spawnedAtMs, queueState: t.queue.entries.get(g.id)?.state })));
        if (guests.length > cap || t.movedThisStep.length > 4 || dialogue.activeBubbles().length > 1) invalid.push('cap');
        for (const g of guests) { const c = g.controller, p = c.position, previous = before.get(g.id); seen.add(g.purpose);
          if (!walkable(p) || Math.hypot(p.x - owner.x, p.y - owner.y) < 27.999) invalid.push('static/owner');
          if (previous && (!clearSegment(previous, p) || Math.hypot(p.x - previous.x, p.y - previous.y) > c.speed * .05 + .001)) invalid.push('sweep/jump');
          for (const other of guests) if (other !== g && Math.hypot(p.x - other.controller.position.x, p.y - other.controller.position.y) < 27.999) invalid.push('peer'); }
        const reserved = [...t.queue.slots, ...t.idleSlots].map(s => s.reservedBy).filter(Boolean);
        if (new Set(reserved).size !== reserved.length) invalid.push('duplicate reservation');
        if (t.history.length > 32 || t.completedHistory.length > 32 || dialogue.history.length > 64) invalid.push('history');
        if (invalid.length) break;
      }
      const at600 = t.snapshot(); t.stopArrivals(); for (let i = 0; i < 6000 && t.guests.length; i++) t.update(50, owner);
      dialogue.update(t.activeMs, []);
      return { invalid, preserved, at600, final: t.snapshot(), seen: [...seen], entries: t.queue.entries.size, permits: t.permits.size,
        dialogue: dialogue.snapshot(), pathUnchanged: JSON.stringify(originalPath) === JSON.stringify(lobbyPath({ x: 340, y: 300 }, { x: 252, y: 220 })), stateUnchanged: originalState === JSON.stringify(state) };
    }, { cap, scenario, state: JSON.parse(savedResort().hotelGameState) });
    expect(result.invalid).toEqual([]); expect(result.preserved).toBe(true); expect(result.at600.activeMs).toBe(600000);
    expect(result.at600.stats.maxMovingObserved).toBeLessThanOrEqual(4); expect(result.at600.stats.maxPopulation).toBeLessThanOrEqual(cap);
    if (scenario === 'busy-cap') expect(result.at600.stats.maxPopulation).toBe(cap);
    expect(result.final.activeCount).toBe(0); expect(result.final.stats.completed).toBe(result.final.stats.created);
    expect(result.final.queue.serviceOrder).toEqual(result.final.queue.arrivalOrder); expect(result.final.queue.completedOrder).toEqual(result.final.queue.serviceOrder);
    expect(result.entries).toBe(0); expect(result.permits).toBe(0); expect(result.dialogue.trackedCount).toBe(0);
    expect(result.final.queue.slots.every(s => !s.reservedBy && !s.clearingBy)).toBe(true);
    expect(result.final.idleSlots.every(s => !s.reservedBy && !s.clearingBy)).toBe(true);
    expect(result.pathUnchanged).toBe(true); expect(result.stateUnchanged).toBe(true);
    await info.attach('management-traffic-stress', { body: JSON.stringify({ cap, scenario, maximumVisible: result.at600.stats.maxPopulation,
      maximumMoving: result.at600.stats.maxMovingObserved, created: result.final.stats.created, completed: result.final.stats.completed,
      invalid: result.invalid, stateUnchanged: result.stateUnchanged, pathUnchanged: result.pathUnchanged }), contentType: 'application/json' });
  });
}
