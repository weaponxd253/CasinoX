const { test, expect } = require('@playwright/test');
const { openWorld, snap, storage } = require('./helpers/guest-world');
const { POINTS } = require('./helpers/lobby-world');
const ids = ['casual-traveler', 'business-traveler', 'older-leisure-traveler'];

test.use({ video: { mode: 'on', size: { width: 1280, height: 1000 } }, viewport: { width: 1280, height: 1000 } });
test('three rendered travelers check in and leave once with queue captures and no business-state changes', async ({ page }, info) => {
  test.setTimeout(90000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const seed = await openWorld(page, POINTS.reception);
  await page.locator('canvas').scrollIntoViewIfNeeded();
  await page.evaluate(async () => {
    const { walkable, clearSegment } = await import('/world/lobby-navigation.js');
    const observation = window.queueObservation = { invalid: [], animationErrors: [], maxSpeed: {},
      states: {}, serviceSamples: [], completed: false };
    const previous = {};
    const frame = () => {
      const state = CasinoWorldDebug.snapshot(), traffic = state.guestTraffic;
      const active = traffic.guests.filter(g => g.spawned && !g.complete);
      for (const g of active) {
        if (!walkable(g.position) || Math.hypot(g.position.x-state.player.x,g.position.y-state.player.y) < 28
          || (previous[g.id] && !clearSegment(previous[g.id],g.position))) observation.invalid.push(g);
        previous[g.id] = g.position;
        (observation.states[g.id] ??= []);
        if (!observation.states[g.id].includes(g.behavior)) observation.states[g.id].push(g.behavior);
        observation.maxSpeed[g.id] = Math.max(observation.maxSpeed[g.id] ?? 0, Math.hypot(g.velocity.x,g.velocity.y));
        if (g.moving ? (!g.visual.playing || g.visual.animation !== `${g.appearance}-walk-${g.facing}`) : g.visual.playing)
          observation.animationErrors.push(g);
      }
      for(let a=0;a<active.length;a++)for(let b=a+1;b<active.length;b++)if(Math.hypot(active[a].position.x-active[b].position.x,active[a].position.y-active[b].position.y)<28)
        observation.invalid.push({pair:[active[a].id,active[b].id]});
      if(traffic.guests.filter(g=>g.behavior==='BEING_SERVED').length>1)observation.invalid.push('multiple service');
      if(traffic.guests.every(g=>g.complete)) observation.completed=true;
      else requestAnimationFrame(frame);
    }; requestAnimationFrame(frame);
  });
  const traffic = async () => (await snap(page)).guestTraffic;
  const capture = name => page.locator('canvas').screenshot({ path: info.outputPath(name) });
  await expect.poll(async () => (await traffic()).guests[0].behavior, { timeout: 25000, intervals: [50] }).toBe('BEING_SERVED');
  await capture('queue-first-service.png');
  await expect.poll(async () => (await traffic()).guests.every(g => ['WAITING','BEING_SERVED'].includes(g.behavior)),
    { timeout: 15000, intervals: [50] }).toBe(true);
  await capture('queue-all-three.png');
  await capture('queue-two-waiting.png');
  await capture('queue-owner-access.png');
  expect((await snap(page)).interaction).toBe('receptionist');
  await expect.poll(async () => (await traffic()).guests[1].behavior, { timeout: 10000, intervals: [50] }).toBe('ADVANCING');
  await capture('queue-second-advancing.png');
  await page.locator('#world-collisions').click();
  await capture('queue-debug.png');
  await page.locator('#world-collisions').click();
  await expect.poll(async () => (await traffic()).guests.every(g=>g.complete), { timeout: 60000, intervals: [100] }).toBe(true);
  const finished = await traffic();
  expect(finished.queue.arrivalOrder).toEqual(ids);expect(finished.queue.serviceOrder).toEqual(ids);expect(finished.queue.completedOrder).toEqual(ids);
  expect(finished.guests.every(g=>g.visual===null&&g.reservedSlot===null)).toBe(true);
  const observed = await page.evaluate(() => queueObservation);
  expect(observed.invalid).toEqual([]);expect(observed.animationErrors).toEqual([]);expect(observed.completed).toBe(true);
  for(const g of finished.guests)expect(observed.maxSpeed[g.id]).toBeLessThanOrEqual(g.speed+0.001);
  await page.waitForTimeout(300);expect(await traffic()).toEqual(finished);
  expect(await storage(page)).toEqual(seed);expect(errors).toEqual([]);
});
