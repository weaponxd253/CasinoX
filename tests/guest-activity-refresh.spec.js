const { test, expect } = require('@playwright/test');
const { managementFixture, seedManagement, traffic, snap, storage, readyTraffic, POINTS } = require('./helpers/management-world');
const { walkTo } = require('./helpers/lobby-world');

async function open(page, values, query = '') {
  await seedManagement(page, values); await page.goto(`/world/index.html?debug=1&trafficSeed=19${query}`); await readyTraffic(page);
}

test('live activity polls on active time, reuses unchanged data and preserves every saved byte', async ({ page }) => {
  test.setTimeout(40000);
  const values = managementFixture(); await open(page, values);
  const initial = await traffic(page);
  expect(initial.activity.cache).toEqual({ reads: 1, parses: 1, cacheHits: 0 });
  await expect.poll(async () => (await traffic(page)).activity.cache.reads, { timeout: 15000 }).toBe(2);
  expect((await traffic(page)).activity.cache).toEqual({ reads: 2, parses: 1, cacheHits: 1 });
  expect(await storage(page)).toEqual(values); expect((await snap(page)).failed).toBe(false);
});

test('storage bursts coalesce without reinitializing guests, while partial metrics fall back independently', async ({ page, context }) => {
  test.setTimeout(40000);
  const values = managementFixture(); await open(page, values, '&trafficProfile=busy');
  await expect.poll(async () => (await traffic(page)).stats.created).toBeGreaterThan(0);
  const before = await traffic(page), actor = await context.newPage(); await actor.goto('/');
  // Explicit external fixture source, separate from genuine UI acceptance tests.
  const changed = await actor.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('hotelGameState')); delete state.staff.roster;
    state.guests.population = 20; state.satisfaction.current = 0;
    for (let i = 0; i < 100; i++) { state.fixtureRevision = i; localStorage.setItem('hotelGameState', JSON.stringify(state)); }
    return localStorage.getItem('hotelGameState');
  });
  await actor.close(); await page.bringToFront();
  await expect.poll(async () => (await traffic(page)).activity.snapshot.satisfaction.score).toBe(0);
  const after = await traffic(page);
  expect(after.activity.snapshot.occupancy).toMatchObject({ available: true, percentage: 200 });
  expect(after.activity.snapshot.reception.available).toBe(false); expect(after.queue.nextServiceMs).toBe(8000);
  expect(after.activity.policy).toMatchObject({ profile: 'high', nearFull: true, dialogueMood: 'low' });
  expect(after.activity.cache.parses - before.activity.cache.parses).toBe(1);
  expect(after.activity.cache.reads - before.activity.cache.reads).toBeLessThanOrEqual(2);
  const retained = after.guests.find(g => g.id === before.guests[0].id);
  expect(retained).toMatchObject({ personality: before.guests[0].personality, purpose: before.guests[0].purpose });
  expect((await storage(page)).hotelGameState).toBe(changed);
});

test('sleep freezes refresh and guest clocks; wake refreshes management before future admissions and keeps listeners balanced', async ({ page, context }) => {
  test.setTimeout(50000);
  await open(page, managementFixture(() => {}, POINTS.hotel), '&trafficProfile=busy');
  await expect.poll(async () => (await traffic(page)).stats.created).toBeGreaterThan(0);
  const resources = (await traffic(page)).resources;
  expect(Object.values(resources.gameListeners)).toEqual([1, 1, 1, 1, 1, 1]);
  await page.keyboard.press('e'); await expect.poll(async () => (await snap(page)).scene).toBe('HotelInterior');
  const sleeping = await traffic(page), actor = await context.newPage(); await actor.goto('/');
  await actor.evaluate(() => { const s = JSON.parse(localStorage.getItem('hotelGameState')); s.guests.population = 0; s.satisfaction.current = 100;
    localStorage.setItem('hotelGameState', JSON.stringify(s)); });
  await actor.close(); await page.bringToFront();
  const still = await traffic(page); expect(still.activeMs).toBe(sleeping.activeMs); expect(still.activity.cache).toEqual(sleeping.activity.cache);
  expect(still.guests).toEqual(sleeping.guests);
  await page.locator('#world-return').click(); await expect.poll(async () => (await snap(page)).scene).toBe('CentralLobby');
  await expect.poll(async () => (await traffic(page)).activity.policy.profile).toBe('low');
  const awake = await traffic(page);
  expect(awake.activity.policy.dialogueMood).toBe('high'); expect(awake.resources.sceneListeners).toEqual(resources.sceneListeners);
  expect(awake.resources.worldStepListeners).toBe(resources.worldStepListeners);
  expect(awake.resources.gameListeners).toEqual(resources.gameListeners);
  expect(awake.guests.map(g => g.id)).toEqual(sleeping.guests.map(g => g.id));
});

test('debug unavailable fixture is explicit and ignored without debug opt-in; corrupt saves retain their existing protection', async ({ page, context }) => {
  const values = managementFixture(s => { s.guests.population = 0; }); await open(page, values, '&activityFixture=unavailable');
  expect((await traffic(page)).activity).toMatchObject({ fixture: 'unavailable', policy: { profile: 'fallback', serviceMs: 8000, dialogueMood: null } });
  await page.goto('/world/index.html?activityFixture=unavailable');
  await expect(page.locator('#floor-canvas')).toHaveAttribute('aria-busy', 'false');
  expect(await page.evaluate(() => typeof CasinoWorldDebug)).toBe('undefined'); expect(await storage(page)).toEqual(values);
  await page.goto('/world/index.html?debug=1'); await readyTraffic(page);
  expect((await traffic(page)).activity.policy.profile).toBe('low');
  const actor = await context.newPage(); await actor.goto('/');
  const bad = '{not-json'; await actor.evaluate(raw => localStorage.setItem('hotelGameState', raw), bad); await actor.close();
  await expect(page.locator('#world-errors')).toBeVisible(); expect((await snap(page)).failed).toBe(true);
  expect((await storage(page)).hotelGameState).toBe(bad); expect((await storage(page))['hotelGameState.corruptBackup']).toBeUndefined();
});

test('management activity preserves northeast owner passage and existing checkpoint metadata', async ({ page }, info) => {
  test.setTimeout(50000);
  const values = managementFixture(s => { s.guests.population = 10; }, { x: 620, y: 460, facing: 'up' });
  await open(page, values, '&trafficProfile=busy');
  await expect.poll(async () => (await traffic(page)).stats.created, { timeout: 15000 }).toBeGreaterThan(2);
  await walkTo(page, POINTS.hotel);
  const world = await snap(page), t = world.guestTraffic;
  expect(Math.hypot(world.player.x - POINTS.hotel.x, world.player.y - POINTS.hotel.y)).toBeLessThanOrEqual(6);
  for (const g of t.guests) expect(Math.hypot(g.position.x - world.player.x, g.position.y - world.player.y)).toBeGreaterThanOrEqual(27.99);
  expect(t.movingCount).toBeLessThanOrEqual(4); expect(t.activeCount).toBeLessThanOrEqual(6);
  await page.screenshot({ path: info.outputPath('activity-owner-passage.png'), fullPage: true });
  const current = await storage(page); expect(current.hotelGameState).toBe(values.hotelGameState);
  expect(JSON.parse(current.casinoWorldState).phase5eSentinel).toBe('preserve');
});
