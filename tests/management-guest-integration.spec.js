const { test, expect } = require('@playwright/test');
const { managementFixture, seedManagement, traffic, snap, storage, readyTraffic, POINTS } = require('./helpers/management-world');

async function watchWrites(context) {
  await context.addInitScript(() => {
    const set = Storage.prototype.setItem;
    window.managementWriteAudit = [];
    Storage.prototype.setItem = function (key, value) {
      if (this === localStorage) managementWriteAudit.push({ page: location.pathname, key, value: String(value) });
      return set.call(this, key, value);
    };
  });
}
async function warmManagement(context) {
  const manager = await context.newPage(); await manager.goto('/hotel/index.html');
  await expect(manager.locator('#hotel-name-display')).toContainText('Existing Resort');
  await manager.evaluate(() => new Promise(resolve => queueMicrotask(resolve)));
  return manager;
}
const financial = values => Object.fromEntries(Object.entries(values).filter(([key]) => key !== 'casinoWorldState'));
const guestIdentity = guest => ({ id: guest.id, appearance: guest.appearance, personality: guest.personality, purpose: guest.purpose, routeVariant: guest.routeVariant, speed: guest.speed });
const worldHotelWrites = page => page.evaluate(() => managementWriteAudit.filter(e => e.key !== 'casinoWorldState'));

test('retained lobby reflects an actual Rooms UI purchase, retains its live guest and makes zero hotel or financial writes', async ({ page, context }, info) => {
  test.setTimeout(180000);
  await seedManagement(page, managementFixture(s => { s.guests.population = 4; })); await watchWrites(context);
  const manager = await warmManagement(context), warmed = await storage(manager);
  const authoritativeBefore = await manager.evaluate(() => ({ population: HotelState.get().guests.population, capacity: HotelGuests.getRoomCapacity(HotelState.get()), cash: HotelState.getCash() }));
  await page.goto('/world/index.html?debug=1&trafficSeed=19'); await readyTraffic(page); await page.bringToFront();
  const initial = await traffic(page); expect(initial.activity.policy.profile).toBe('moderate');
  await expect.poll(async () => (await traffic(page)).stats.created, { timeout: 40000 }).toBeGreaterThanOrEqual(1);
  const before = await traffic(page), first = before.guests[0];
  await manager.bringToFront(); await manager.locator('.upgrade-btn[data-dept="rooms"]:visible').first().click();
  await expect.poll(() => manager.evaluate(() => HotelState.get().departments.rooms.level)).toBe(2);
  const authoritativeAfter = await manager.evaluate(() => ({ population: HotelState.get().guests.population, capacity: HotelGuests.getRoomCapacity(HotelState.get()), cash: HotelState.getCash() }));
  const managementWrites = await manager.evaluate(() => managementWriteAudit), savedAfterUi = await storage(manager);
  await manager.close(); await page.bringToFront();
  await expect.poll(async () => (await traffic(page)).activity.snapshot.occupancy.guestCapacity, { timeout: 15000 }).toBe(16);
  const refreshed = await traffic(page), retained = refreshed.guests.find(g => g.id === first.id);
  expect(retained).toBeTruthy(); expect(guestIdentity(retained)).toEqual(guestIdentity(first));
  expect(Math.hypot(retained.position.x - first.position.x, retained.position.y - first.position.y)).toBeLessThanOrEqual(first.speed * (refreshed.activeMs - before.activeMs) / 1000 + .1);
  expect(refreshed.activity.policy.profile).toBe('low'); expect(refreshed.admissionCeiling).toBe(3);
  expect(refreshed.settings).toMatchObject({ minArrivalMs: 30000, maxArrivalMs: 50000, maxVisible: 6, maxMoving: 4 });
  expect(authoritativeAfter.cash).toBe(authoritativeBefore.cash - 500); expect(authoritativeAfter.capacity).toBe(16);
  expect(refreshed.activity.snapshot.occupancy.percentage).toBe(Math.round(authoritativeAfter.population / 16 * 100));
  await page.screenshot({ path: info.outputPath('activity-live-management.png'), fullPage: true });
  await expect.poll(async () => (await traffic(page)).stats.created, { timeout: 55000 }).toBeGreaterThan(before.stats.created);
  expect(financial(await storage(page))).toEqual(financial(savedAfterUi)); expect(await worldHotelWrites(page)).toEqual([]);
  expect(managementWrites.some(e => e.page === '/hotel/index.html' && e.key === 'hotelGameState')).toBe(true);
  expect(await page.evaluate(() => [typeof HotelState, typeof HotelEngine])).toEqual(['undefined', 'undefined']);
  await info.attach('actual-management-rooms', { body: JSON.stringify({ authoritativeBefore, authoritativeAfter, initial, before, refreshed,
    legitimateManagementWriteKeys: managementWrites.map(e => e.key), worldWrites: await worldHotelWrites(page),
    initialCash: JSON.parse(warmed.hotelGameState).currencies.hotelCash, saveUnchangedAfterManagementClosed: true }, null, 2), contentType: 'application/json' });
});

test('actual staff Rest UI updates retained reception while active service keeps six seconds and the next queued guest gets twelve', async ({ page, context }, info) => {
  test.setTimeout(120000);
  await seedManagement(page, managementFixture(s => { s.guests.population = 4; })); await watchWrites(context);
  const manager = await warmManagement(context);
  await manager.locator('.mgmt-tab[data-tab="staff"]').click(); await manager.locator('[data-staff-view="roster"]').first().click();
  await page.goto('/world/index.html?debug=1&trafficSeed=19&trafficProfile=busy'); await readyTraffic(page); await page.bringToFront();
  await expect.poll(async () => (await traffic(page)).queue.guests.some(g => g.state === 'BEING_SERVED'), { timeout: 40000, intervals: [50] }).toBe(true);
  const before = await traffic(page), active = before.queue.guests.find(g => g.state === 'BEING_SERVED');
  expect(active.serviceDurationMs).toBe(6000);
  await manager.bringToFront(); await manager.locator('[data-staff-action="rest"][data-staff-id="front_desk_maya"]').click();
  const coverage = await manager.evaluate(() => HotelState.getStaffCoverage('lobby').status); expect(coverage).toBe('short');
  const managementWrites = await manager.evaluate(() => managementWriteAudit), afterUi = await storage(manager);
  await manager.close(); await page.bringToFront();
  await expect.poll(async () => (await traffic(page)).queue.nextServiceMs, { timeout: 15000 }).toBe(12000);
  const refreshed = await traffic(page), retained = refreshed.queue.guests.find(g => g.id === active.id);
  expect(retained).toMatchObject({ serviceDurationMs: 6000, serviceStartedMs: active.serviceStartedMs });
  expect(retained.serviceRemainingMs).toBeLessThanOrEqual(active.serviceRemainingMs);
  await expect.poll(async () => (await traffic(page)).queue.guests.some(g => g.id !== active.id && g.state === 'BEING_SERVED' && g.serviceDurationMs === 12000), { timeout: 40000 }).toBe(true);
  await page.screenshot({ path: info.outputPath('activity-service-live-short.png'), fullPage: true });
  expect(financial(await storage(page))).toEqual(financial(afterUi)); expect(await worldHotelWrites(page)).toEqual([]);
  await info.attach('actual-management-staff', { body: JSON.stringify({ before, refreshed, coverage,
    legitimateManagementWriteKeys: managementWrites.map(e => e.key), worldWrites: await worldHotelWrites(page), saveUnchangedAfterManagementClosed: true }, null, 2), contentType: 'application/json' });
});

test('full-page management return reads an actual Eli assignment as thin coverage and starts a fresh transient population', async ({ page, context }, info) => {
  test.setTimeout(60000);
  // Keep the explicitly opted-in diagnostic surface on the real return link's
  // new document; no second navigation or production save operation is added.
  await page.addInitScript(() => {
    if (location.pathname === '/world/index.html' && !new URLSearchParams(location.search).has('debug')) history.replaceState(null, '', `${location.pathname}?debug=1`);
  });
  await seedManagement(page, managementFixture(s => { s.guests.population = 4; }, POINTS.office)); await watchWrites(context);
  await page.goto('/world/index.html?debug=1&trafficSeed=19&trafficProfile=busy'); await readyTraffic(page);
  await page.bringToFront(); await page.locator('canvas').focus();
  // Arrival time follows active physics time; cold mobile startup can consume
  // the default five wall-clock seconds before that clock has advanced enough.
  await expect.poll(async () => (await traffic(page)).stats.created, { timeout: 15000 }).toBeGreaterThan(0);
  const checkpoint = (await snap(page)).player;
  await page.keyboard.press('e'); await expect(page).toHaveURL(/\/hotel\/index.html$/);
  await page.locator('.mgmt-tab[data-tab="staff"]').click(); await page.locator('[data-staff-view="roster"]').first().click();
  await page.locator('[data-staff-action="rest"][data-staff-id="front_desk_maya"]').click();
  await page.locator('[data-staff-action="assign"][data-staff-id="runner_eli"][data-assignment="lobby"]').click();
  const coverage = await page.evaluate(() => { const c = HotelState.getStaffCoverage('lobby'); return { score: c.score, status: c.status }; });
  expect(coverage).toEqual({ score: 74, status: 'thin' });
  const afterUi = await storage(page), managementWrites = await page.evaluate(() => managementWriteAudit);
  await page.getByRole('link', { name: 'Return to Central Lobby' }).click(); await readyTraffic(page);
  const returned = await traffic(page);
  expect(returned.activity.snapshot.reception).toMatchObject({ available: true, coverageScore: 74, coverageStatus: 'thin' });
  expect(returned.queue.nextServiceMs).toBe(8000); expect(returned.stats.created).toBe(0); expect(returned.activeCount).toBe(0);
  expect((await snap(page)).player).toEqual(checkpoint); expect(financial(await storage(page))).toEqual(financial(afterUi));
  expect(await worldHotelWrites(page)).toEqual([]);
  await page.screenshot({ path: info.outputPath('activity-full-page-return.png'), fullPage: true });
  await info.attach('actual-full-page-management', { body: JSON.stringify({ coverage, returned, checkpoint,
    legitimateManagementWriteKeys: managementWrites.map(e => e.key), worldWrites: await worldHotelWrites(page) }, null, 2), contentType: 'application/json' });
});
