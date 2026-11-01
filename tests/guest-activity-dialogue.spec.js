const { test, expect } = require('@playwright/test');
const { activitySimulation } = require('./helpers/management-world');

test('satisfaction.current uses percent scale, three-point hysteresis and independent fallback', async ({ page }) => {
  const result = await activitySimulation(page, ({ GuestActivityDirector }, scores) => {
    const d = new GuestActivityDirector();
    return scores.map(score => d.derive({ occupancy: { available: false }, reception: { available: false },
      satisfaction: { available: score !== null, score } }));
  }, [0, 1, 39, 40, 42, 43, 79, 80, 82, 83, 80, 77, 76, 40, 37, 36, null, 80]);
  expect(result.map(r => r.dialogueMood)).toEqual(['low', 'low', 'low', 'low', 'low', 'average', 'average', 'average', 'average', 'high', 'high', 'high', 'average', 'average', 'average', 'low', null, 'high']);
  expect(result.every(r => r.profile === 'fallback' && r.serviceMs === 8000)).toBe(true);
});

for (const personality of ['relaxed', 'excited', 'reserved', 'impatient', 'discerning']) test(`${personality} mood selects future speech without changing active bubbles, cooldowns or priority`, async ({ page }) => {
  const result = await activitySimulation(page, ({ GuestDialogueController, guestDialogueLines }, personality) => {
    const d = new GuestDialogueController({ rng: () => 0 }), g = { id: 'mood-test', personality, spawned: true, complete: false,
      position: { x: 300, y: 252 }, purpose: 'checkIn', state: 'QUEUEING', queueState: 'WAITING', arrived: true, moving: false, spawnedAtMs: 0 };
    d.setSatisfactionMood('low'); d.update(0, [g]); d.update(2000, [g]);
    const before = d.snapshot(), state = JSON.stringify(d.guestSnapshot(g.id));
    d.setSatisfactionMood('high'); const same = JSON.stringify(d.guestSnapshot(g.id)) === state;
    d.update(2100, [g], { priority: true }); const priority = d.snapshot();
    d.update(5000, [g]); d.update(30000, [g]); const cooldown = d.snapshot(); d.update(32000, [g]); const high = d.snapshot();
    d.setSatisfactionMood(null); const fallback = guestDialogueLines(personality, 'waiting', null);
    d.update(33000, []); const empty = d.snapshot(); d.destroy();
    return { before, same, priority, cooldown, high, fallback, empty,
      lowLines: guestDialogueLines(personality, 'waiting', 'low'), highLines: guestDialogueLines(personality, 'waiting', 'high') };
  }, personality);
  expect(result.before.bubbles).toHaveLength(1); expect(result.lowLines).toContain(result.before.bubbles[0].text); expect(result.same).toBe(true);
  expect(result.priority.visibleCount).toBe(0); expect(result.priority.bubbles[0].text).toBe(result.before.bubbles[0].text);
  expect(result.cooldown.stats.spoken).toBe(1); expect(result.high.stats.spoken).toBe(2);
  expect(result.highLines).toContain(result.high.bubbles[0].text); expect(result.high.bubbles[0]).toMatchObject({ mood: 'high', personality });
  expect(result.fallback.length).toBe(2); expect(result.empty.trackedCount).toBe(0); expect(result.empty.visibleCount).toBe(0);
});
