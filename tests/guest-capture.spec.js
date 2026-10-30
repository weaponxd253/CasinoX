const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const { snap, guest, openWorld, storage } = require('./helpers/guest-world');

test.use({ video: { mode: 'on', size: { width: 1280, height: 1000 } }, viewport: { width: 1280, height: 1000 } });
test('one traveler enters, waits at reception and departs with four synchronized animations and no saved-data changes', async ({ page }, info) => {
  test.setTimeout(90000);
  const seed = await openWorld(page); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.locator('canvas').scrollIntoViewIfNeeded();
  await page.locator('canvas').screenshot({ path: info.outputPath('traveler-entering.png') });
  // Observe the real scene continuously; do not teleport or accelerate time.
  await page.evaluate(async () => {
    const { walkable } = await import('/world/lobby-navigation.js');
    window.guestObservation = { invalid: [], directions: [], maxSpeed: 0, animationErrors: [], waitStarted: null, waitEnded: null };
    const observation = window.guestObservation;
    const frame = () => {
      const state = CasinoWorldDebug.snapshot(), g = state.guest;
      if (g.state === 'WAITING_AT_RECEPTION' && observation.waitStarted === null) observation.waitStarted = g.activeMs;
      if (g.stage === 1 && observation.waitEnded === null) observation.waitEnded = g.activeMs;
      if (g?.spawned && !g.complete) {
        if (!walkable(g.position) || Math.hypot(g.position.x - state.player.x, g.position.y - state.player.y) < 28) observation.invalid.push(g);
        if (g.moving) {
          if (!observation.directions.includes(g.facing)) observation.directions.push(g.facing);
          observation.maxSpeed = Math.max(observation.maxSpeed, Math.hypot(g.velocity.x, g.velocity.y));
          if (!g.visual.playing || g.visual.animation !== `casual-traveler-walk-${g.facing}`) observation.animationErrors.push(g);
        } else if (g.visual.playing) observation.animationErrors.push(g);
      }
      if (!g?.complete) requestAnimationFrame(frame);
    }; requestAnimationFrame(frame);
  });
  await expect.poll(async () => (await guest(page)).state, { timeout: 30000 }).toBe('WAITING_AT_RECEPTION');
  const waiting = await guest(page);
  expect(waiting).toMatchObject({ position: { x: 252, y: 220 }, speed: 85, radius: 14, facing: 'up', moving: false });
  expect(waiting.visual).toMatchObject({ facing: 'up', frame: 12, playing: false, width: 48, height: 72 });
  await page.locator('canvas').screenshot({ path: info.outputPath('traveler-reception.png') });
  await page.locator('#world-collisions').click();
  await page.locator('canvas').screenshot({ path: info.outputPath('traveler-debug.png') });
  await page.locator('#world-collisions').click();
  await expect.poll(async () => (await guest(page)).stage, { timeout: 15000 }).toBe(1);
  await expect.poll(() => page.evaluate(() => guestObservation.waitEnded)).not.toBeNull();
  const duration = await page.evaluate(() => guestObservation.waitEnded - guestObservation.waitStarted);
  expect(duration).toBeGreaterThanOrEqual(7950); expect(duration).toBeLessThanOrEqual(8050);
  // Capture the rendered arrival approach at a frame boundary, before despawn.
  const arrival = await page.evaluate(() => new Promise(resolve => {
    const check = () => {
      const g = CasinoWorldDebug.snapshot().guest;
      if (g.stage === 1 && g.position.x > 780 && !g.complete) {
        requestAnimationFrame(() => resolve(document.querySelector('canvas').toDataURL('image/png')));
      } else requestAnimationFrame(check);
    }; requestAnimationFrame(check);
  }));
  fs.writeFileSync(info.outputPath('traveler-hotel.png'), Buffer.from(arrival.split(',')[1], 'base64'));
  await expect.poll(async () => (await guest(page)).complete, { timeout: 10000 }).toBe(true);
  expect(await guest(page)).toMatchObject({ state: 'COMPLETE', position: { x: 856, y: 314 }, moving: false, visual: null });
  const observed = await page.evaluate(() => guestObservation);
  expect(observed.invalid).toEqual([]); expect(observed.animationErrors).toEqual([]);
  expect(observed.directions.sort()).toEqual(['down', 'left', 'right', 'up']); expect(observed.maxSpeed).toBeCloseTo(85, 5);
  const completed = await guest(page); await page.waitForTimeout(250);
  expect(await guest(page)).toEqual(completed); expect(await storage(page)).toEqual(seed); expect(errors).toEqual([]);
});
