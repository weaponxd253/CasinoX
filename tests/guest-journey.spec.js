const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { POINTS } = require('./helpers/lobby-world');
const { walkLoungeTo, LOUNGE_POINTS } = require('./helpers/lounge-world');

const folder = path.resolve(__dirname, '../world/assets/guests/casual-traveler');
const metadata = JSON.parse(fs.readFileSync(path.join(folder, 'casual-traveler-frames.json'), 'utf8'));
const { snap, guest, openWorld, ready, storage } = require('./helpers/guest-world');

test('all sixteen traveler poses retain source pixels, common feet and directional frame mapping', async ({ page }) => {
  for (const [name, hash] of [['casual-traveler-source.png', metadata.sourceSha256], ['casual-traveler.png', metadata.preparedSha256]]) {
    expect(createHash('sha256').update(fs.readFileSync(path.join(folder, name))).digest('hex')).toBe(hash);
  }
  expect(metadata.sourceSha256).toBe('ac3f8472093cb16cdbf62e950e3755fa4e3aaf103b37667589ac3e087381cbcf');
  expect(metadata.frames.map(f => f.direction)).toEqual(['down', 'left', 'right', 'up'].flatMap(d => Array(4).fill(d)));
  await openWorld(page);
  const result = await page.evaluate(async meta => {
    const load = async name => {
      const image = new Image(); image.src = `/world/assets/guests/casual-traveler/${name}`; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
      return { width: canvas.width, height: canvas.height, pixels: ctx.getImageData(0, 0, canvas.width, canvas.height).data };
    };
    const source = await load('casual-traveler-source.png'), prepared = await load('casual-traveler.png');
    let mismatch = 0, sourcePixels = 0, preparedPixels = 0;
    for (const frame of meta.frames) {
      const [left, top, right, bottom] = frame.sourceBounds, [dx, dy] = frame.preparedBounds;
      for (let y = 0; y < 384; y++) for (let x = 0; x < 256; x++) {
        const out = ((Math.floor(frame.frame / 4) * 384 + y) * prepared.width + frame.frame % 4 * 256 + x) * 4;
        let expected = [0, 0, 0, 0];
        if (x >= dx && x < dx + right - left && y >= dy && y < dy + bottom - top) {
          const input = ((top + y - dy) * source.width + left + x - dx) * 4;
          if (source.pixels[input + 3] >= meta.alphaThreshold) expected = source.pixels.slice(input, input + 4);
        }
        if ([0, 1, 2, 3].some(c => prepared.pixels[out + c] !== expected[c])) mismatch++;
      }
    }
    for (let i = 3; i < source.pixels.length; i += 4) if (source.pixels[i] >= meta.alphaThreshold) sourcePixels++;
    for (let i = 3; i < prepared.pixels.length; i += 4) if (prepared.pixels[i]) preparedPixels++;
    return { sourceSize: [source.width, source.height], preparedSize: [prepared.width, prepared.height], mismatch, sourcePixels, preparedPixels };
  }, metadata);
  expect(result.sourceSize).toEqual([1024, 1536]); expect(result.preparedSize).toEqual([1024, 1536]);
  expect(result.mismatch).toBe(0); expect(result.preparedPixels).toBe(result.sourcePixels);
  for (const [i, frame] of metadata.frames.entries()) {
    expect(Math.floor(frame.sourceBounds[0] / 256)).toBe(i % 4);
    const [left, top, right, bottom] = frame.preparedBounds;
    expect(left).toBeGreaterThanOrEqual(16); expect(right).toBeLessThanOrEqual(240);
    expect(top).toBeGreaterThanOrEqual(8); expect(bottom).toBe(368);
    expect(Math.abs((left + right) / 2 - 128)).toBeLessThanOrEqual(0.5);
  }
  expect((await guest(page)).visual).toMatchObject({ width: 48, height: 72, scaleMode: 1, hasPhysicsBody: false });
  expect((await guest(page)).visual.walkingAnimations).toEqual(['down', 'left', 'right', 'up'].map((d, i) => ({
    key: `casual-traveler-walk-${d}`, frames: [0, 1, 2, 3].map(n => i * 4 + n), frameRate: 8, repeat: -1,
  })));
});

test('reception stays accessible and dialogue freezes the guest and its remaining reception wait', async ({ page }) => {
  test.setTimeout(60000);
  const seed = await openWorld(page, POINTS.reception);
  await expect.poll(async () => (await guest(page)).state, { timeout: 30000 }).toBe('WAITING_AT_RECEPTION');
  expect(Math.hypot(252 - POINTS.reception.x, 220 - POINTS.reception.y)).toBeGreaterThan(28);
  await expect(page.locator('#world-interact')).toHaveText('E · Talk to receptionist');
  await page.keyboard.press('e'); await expect(page.locator('#world-dialogue')).toBeVisible();
  const frozen = await guest(page);
  expect(frozen).toMatchObject({ suspended: true, moving: false, facing: 'up' });
  expect(frozen.visual).toMatchObject({ playing: false, frame: 12 });
  await page.waitForTimeout(300); expect(await guest(page)).toEqual(frozen);
  expect((await snap(page)).player).toEqual(POINTS.reception);
  await page.keyboard.press('Escape'); await expect(page.locator('canvas')).toBeFocused();
  await expect.poll(async () => (await guest(page)).waitRemainingMs).toBeLessThan(frozen.waitRemainingMs);
  expect((await snap(page)).player).toEqual(POINTS.reception); expect(await storage(page)).toEqual(seed);
});

test('scene sleep and blackjack overlay keep one guest frozen, then wake the same journey and preserve the lobby checkpoint', async ({ page }) => {
  test.setTimeout(90000);
  let requests = 0; page.on('request', r => { if (r.url().endsWith('/casual-traveler.png')) requests++; });
  const seed = await openWorld(page, POINTS.casino);
  await page.keyboard.press('e'); await expect.poll(async () => (await snap(page)).scene).toBe('CasinoRoom');
  await expect(page.locator('#floor-canvas')).toHaveAttribute('aria-busy', 'false');
  const sleeping = await guest(page);
  expect(sleeping).toMatchObject({ suspended: true, moving: false }); expect(sleeping.visual.playing).toBe(false);
  await walkLoungeTo(page, LOUNGE_POINTS.table); await page.keyboard.press('e');
  await expect(page.locator('#blackjack-overlay')).toBeVisible(); await page.waitForTimeout(180);
  expect(await guest(page)).toEqual(sleeping);
  await page.getByRole('button', { name: 'Return to floor' }).click();
  expect(await guest(page)).toEqual(sleeping);
  await page.waitForTimeout(280); await page.keyboard.press('Escape');
  await expect.poll(async () => (await snap(page)).scene).toBe('CentralLobby');
  await expect.poll(async () => (await guest(page)).activeMs).toBeGreaterThan(sleeping.activeMs);
  expect((await snap(page)).player).toEqual(POINTS.casino); expect(requests).toBe(1);
  expect(await storage(page)).toEqual(seed);
  await page.reload(); await ready(page);
  expect((await snap(page)).player).toEqual(POINTS.casino);
  expect((await guest(page)).activeMs).toBeLessThan(500);
  expect(await storage(page)).toEqual(seed);
});

for (const failure of ['abort', 'decode failure', 'wrong dimensions', 'timeout']) {
  test(`traveler ${failure} keeps the lobby, receptionist, owner controls and saved data usable`, async ({ page }) => {
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    let release;
    await page.route('**/world/assets/guests/casual-traveler/casual-traveler.png', r => failure === 'timeout'
      ? new Promise(resolve => { release = () => r.abort().catch(() => {}).finally(resolve); })
      : failure === 'abort' ? r.abort()
        : failure === 'wrong dimensions' ? r.fulfill({ path: path.resolve(__dirname, '../world/assets/owner/owner.png'), contentType: 'image/png' })
          : r.fulfill({ contentType: 'image/png', body: 'not a PNG' }));
    const seed = await openWorld(page, POINTS.reception);
    release?.();
    expect((await guest(page)).visual).toMatchObject({ mode: 'circle', hasPhysicsBody: false });
    await page.keyboard.press('e'); await expect(page.locator('#world-dialogue')).toBeVisible();
    await page.keyboard.press('Escape'); await expect(page.locator('canvas')).toBeFocused();
    expect((await snap(page)).failed).toBe(false); expect(await storage(page)).toEqual(seed); expect(errors).toEqual([]);
  });
}

test('the owner crosses the guest approach with real keys without overlap or guest jumps', async ({ page }) => {
  const seed = await openWorld(page);
  await page.evaluate(async () => {
    const { walkable } = await import('/world/lobby-navigation.js');
    window.contactObservation = { bad: [], maxSpeed: 0, running: true };
    const frame = () => {
      const state = CasinoWorldDebug.snapshot(), g = state.guest, o = window.contactObservation;
      if (g.spawned && !g.complete) {
        if (Math.hypot(g.position.x - state.player.x, g.position.y - state.player.y) < 28
          || !walkable(g.position) || !walkable(state.player)) o.bad.push({ guest: g, player: state.player });
        o.maxSpeed = Math.max(o.maxSpeed, Math.hypot(g.velocity.x, g.velocity.y));
      }
      if (o.running) requestAnimationFrame(frame);
    }; requestAnimationFrame(frame);
  });
  for (const key of ['d', 'w', 'a', 's']) {
    await page.keyboard.down(key); await page.waitForTimeout(400); await page.keyboard.up(key);
  }
  await page.evaluate(() => { contactObservation.running = false; });
  const result = await page.evaluate(() => contactObservation);
  expect(result.bad).toEqual([]); expect(result.maxSpeed).toBeLessThanOrEqual(85.001);
  expect((await snap(page)).ownerBody).toMatchObject({ radius: 14, width: 28, height: 28 });
  expect((await snap(page)).failed).toBe(false);
  const data = await storage(page);
  for (const [key, raw] of Object.entries(seed)) if (key !== 'casinoWorldState') expect(data[key], key).toBe(raw);
});

