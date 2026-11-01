const { test, expect } = require('@playwright/test');
const { managementFixture, seedManagement, traffic, snap, storage, readyTraffic } = require('./helpers/management-world');

test.use({ video: { mode: 'on', size: { width: 1280, height: 1000 } }, viewport: { width: 1280, height: 1000 } });
async function caption(page, text) {
  await page.evaluate(text => {
    const label = document.createElement('p'); label.id = 'activity-evidence-source'; label.textContent = text;
    label.style.cssText = 'color:#ffe29a;background:#10211f;padding:10px 16px;font:14px Georgia;border:1px solid #a38239;border-radius:8px';
    (document.querySelector('#floor-canvas') ?? document.body.firstElementChild).before(label);
  }, text);
}

test('labelled hotel fixtures record low moderate high activity, all service categories and satisfaction speech', async ({ page }, info) => {
  test.setTimeout(240000);
  const cases = [
    { name: 'low', population: 1, satisfaction: 0, service: 'covered', duration: 6000 },
    { name: 'moderate', population: 5, satisfaction: 60, service: 'thin', duration: 8000 },
    { name: 'high', population: 10, satisfaction: 100, service: 'short', duration: 12000 },
  ];
  const observations = [];
  for (const c of cases) {
    const values = managementFixture(s => { s.guests.population = c.population; s.satisfaction.current = c.satisfaction;
      if (c.service === 'thin') { s.staff.roster[0].assignment = 'rest'; s.staff.roster[2].assignment = 'lobby'; }
      if (c.service === 'short') s.staff.roster = []; });
    await seedManagement(page, values);
    await page.goto('/world/index.html?debug=1&trafficSeed=1&trafficProfile=busy'); await readyTraffic(page);
    await caption(page, `SEEDED HOTEL FIXTURE · ${c.name} activity · ${c.population}/10 guest capacity · ${c.service} reception · satisfaction ${c.satisfaction}% · DEBUG arrivals 1.5–2.5s`);
    await page.locator('canvas').scrollIntoViewIfNeeded();
    await expect.poll(async () => (await traffic(page)).queue.guests.some(g => g.state === 'BEING_SERVED'), { timeout: 60000, intervals: [50] }).toBe(true);
    const served = (await traffic(page)).queue.guests.find(g => g.state === 'BEING_SERVED'); expect(served.serviceDurationMs).toBe(c.duration);
    await page.screenshot({ path: info.outputPath(`activity-service-${c.service}.png`), fullPage: true });
    await expect.poll(async () => (await traffic(page)).activeCount, { timeout: 40000 }).toBeGreaterThanOrEqual(c.name === 'low' ? 3 : c.name === 'moderate' ? 4 : 5);
    await page.screenshot({ path: info.outputPath(`activity-${c.name}.png`), fullPage: true });
    if (c.name !== 'moderate') {
      await expect.poll(async () => (await traffic(page)).dialogue.visibleCount, { timeout: 60000, intervals: [50] }).toBe(1);
      const bubble = (await traffic(page)).dialogue.bubbles[0]; expect(bubble.mood).toBe(c.name === 'low' ? 'low' : 'high');
      await page.screenshot({ path: info.outputPath(`activity-satisfaction-${c.name}.png`), fullPage: true });
    }
    if (c.name === 'high') { await page.locator('#world-collisions').click(); await page.screenshot({ path: info.outputPath('activity-debug.png'), fullPage: true }); }
    const t = await traffic(page); observations.push({ source: 'seeded-hotel-fixture-with-explicit-busy-timing', name: c.name,
      activity: t.activity, maximumVisible: t.stats.maxPopulation, maximumMoving: t.stats.maxMovingObserved });
    expect(await storage(page)).toEqual(values); expect((await snap(page)).failed).toBe(false);
  }
  await info.attach('labelled-fixture-captures', { body: JSON.stringify(observations, null, 2), contentType: 'application/json' });
});

test('actual management UI recording shows Rooms purchase and the fresh lobby return using authoritative capacity', async ({ page }, info) => {
  test.setTimeout(120000);
  await seedManagement(page, managementFixture(s => { s.guests.population = 4; }));
  await page.addInitScript(() => {
    if (location.pathname === '/world/index.html' && !location.search) history.replaceState(null, '', `${location.pathname}?debug=1&trafficSeed=19`);
    const original = Storage.prototype.setItem; window.activityCaptureWrites = [];
    Storage.prototype.setItem = function (key, value) { if (this === localStorage) activityCaptureWrites.push({ page: location.pathname, key }); return original.call(this, key, value); };
  });
  await page.goto('/hotel/index.html'); await expect(page.locator('#hotel-name-display')).toContainText('Existing Resort');
  await caption(page, 'ACTUAL HOTEL MANAGEMENT UI · Rooms upgrade purchase · authoritative hotel engine owns all writes');
  await page.locator('.upgrade-btn[data-dept="rooms"]:visible').first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('activity-management-before.png'), fullPage: true });
  await page.waitForTimeout(1000); // Keep the actual purchase control legible in the recording.
  await page.locator('.upgrade-btn[data-dept="rooms"]:visible').first().click();
  await expect.poll(() => page.evaluate(() => HotelState.get().departments.rooms.level)).toBe(2);
  const afterUi = await storage(page);
  await page.screenshot({ path: info.outputPath('activity-management-after.png'), fullPage: true });
  await page.waitForTimeout(1000);
  await page.getByRole('link', { name: 'Return to Central Lobby' }).click(); await readyTraffic(page);
  // Hotel UI achievement presentation can legitimately save metadata after the
  // click and flush on pagehide. Measure NPC byte preservation after that UI
  // document has finished leaving, and audit the world document's own writes.
  const afterReturn = await storage(page);
  expect(JSON.parse(afterReturn.hotelGameState).currencies).toEqual(JSON.parse(afterUi.hotelGameState).currencies);
  await caption(page, 'ACTUAL MANAGEMENT RETURN · Rooms level 2 / capacity 16 · Low activity · production arrival timing');
  await page.locator('canvas').scrollIntoViewIfNeeded();
  expect((await traffic(page)).activity.snapshot.occupancy.guestCapacity).toBe(16);
  expect((await traffic(page)).activity.policy.profile).toBe('low');
  await page.screenshot({ path: info.outputPath('activity-transition.png'), fullPage: true });
  await expect.poll(async () => (await traffic(page)).stats.created, { timeout: 55000 }).toBeGreaterThan(0);
  await page.screenshot({ path: info.outputPath('activity-actual-management-arrival.png'), fullPage: true });
  const final = await storage(page); for (const [key, value] of Object.entries(afterReturn)) if (key !== 'casinoWorldState') expect(final[key], key).toBe(value);
  expect(await page.evaluate(() => activityCaptureWrites.filter(e => e.key !== 'casinoWorldState'))).toEqual([]);
});
