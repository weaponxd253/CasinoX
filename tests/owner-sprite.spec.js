const { enterLounge, returnToLobby } = require('./helpers/main-casino-world');
const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { savedResort } = require('./helpers/saved-resort');
const { POINTS, currentWorld, walkTo } = require('./helpers/lobby-world');

const assetFolder = path.resolve(__dirname, '../world/assets/owner');
const metadata = JSON.parse(fs.readFileSync(path.join(assetFolder, 'owner-frames.json'), 'utf8'));

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('shellBonusPrompted', '1'));
  await page.route(/https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com|cdnjs\.cloudflare\.com|randomuser\.me)\//, route => route.abort());
  await page.route('https://deckofcardsapi.com/api/deck/**', route => route.fulfill({ json: { success: true, deck_id: 'owner-test' } }));
});

test('all sixteen prepared frames have transparency, intact margins and aligned feet', async ({ page }, testInfo) => {
  await openWorld(page, { x: 480, y: 480, facing: 'down' });
  for (const [file, hash] of [['owner-source.png', metadata.sourceSha256], ['owner.png', metadata.preparedSha256]]) {
    expect(createHash('sha256').update(fs.readFileSync(path.join(assetFolder, file))).digest('hex')).toBe(hash);
  }
  const decoded = await page.evaluate(async () => {
    const image = new Image(); image.src = '/world/assets/owner/owner.png'; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
    const frames = [];
    for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) {
      const pixels = context.getImageData(col * 64, row * 96, 64, 96).data;
      let minX = 64, minY = 96, maxX = -1, maxY = -1, minAlpha = 255;
      for (let y = 0; y < 96; y++) for (let x = 0; x < 64; x++) {
        const alpha = pixels[(y * 64 + x) * 4 + 3];
        if (alpha) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); minAlpha = Math.min(minAlpha, alpha); }
      }
      frames.push({ bounds: [minX, minY, maxX + 1, maxY + 1], minAlpha });
    }
    return { width: image.width, height: image.height, frames };
  });
  expect([decoded.width, decoded.height]).toEqual([256, 384]);
  expect(decoded.frames).toHaveLength(16);
  for (const frame of decoded.frames) {
    expect(frame.bounds[0]).toBeGreaterThan(0); expect(frame.bounds[2]).toBeLessThan(64);
    expect(frame.bounds[1]).toBeGreaterThan(0); expect(frame.bounds[3]).toBe(92);
    expect(frame.bounds[2] - frame.bounds[0]).toBeGreaterThan(40);
    expect(frame.bounds[3] - frame.bounds[1]).toBeGreaterThan(75);
    // Odd pixel widths can only be centred within half a source pixel.
    expect(Math.abs((frame.bounds[0] + frame.bounds[2]) / 2 - 32)).toBeLessThanOrEqual(0.5);
    expect(frame.minAlpha).toBeGreaterThanOrEqual(32);
  }
  const state = await snapshot(page);
  expect(state.ownerVisual).toMatchObject({ mode: 'sprite', frame: 0, width: 48, height: 72, scaleMode: 1, playing: false });
  expect(state.ownerBody).toEqual({ radius: 14, width: 28, height: 28, isCircle: true, placeholderVisible: false });
  expect(await page.locator('canvas').evaluate(canvas => getComputedStyle(canvas).imageRendering)).toBe('pixelated');
  await page.screenshot({ path: testInfo.outputPath('owner-central-lobby.png'), fullPage: true });
});

test('four walking rows animate, release selects the directional idle, and speed stays 190', async ({ page }) => {
  await openWorld(page);
  for (const [key, facing, start, idle] of [['w', 'up', 12, 15], ['a', 'left', 4, 4], ['s', 'down', 0, 0], ['d', 'right', 8, 8]]) {
    await page.keyboard.down(key);
    await expect.poll(async () => (await snapshot(page)).ownerVisual.playing).toBe(true);
    const frames = new Set();
    await expect.poll(async () => {
      const state = await snapshot(page);
      expect(state.ownerVisual.animation).toBe(`owner-walk-${facing}`);
      expect(state.ownerVisual.frame).toBeGreaterThanOrEqual(start); expect(state.ownerVisual.frame).toBeLessThan(start + 4);
      expect(Math.hypot(state.velocity.x, state.velocity.y)).toBeCloseTo(190, 4);
      frames.add(state.ownerVisual.frame); return frames.size;
    }, { intervals: [30] }).toBe(4);
    await page.keyboard.up(key);
    await expect.poll(async () => (await snapshot(page)).ownerVisual.playing).toBe(false);
    const stopped = await snapshot(page);
    expect(stopped.player.facing).toBe(facing); expect(stopped.ownerVisual.frame).toBe(idle);
    expect(stopped.ownerVisual.x).toBe(Math.round(stopped.player.x));
    expect(stopped.ownerVisual.y).toBe(Math.round(stopped.player.y + 14));
  }
});

test('hotel visits retain each room position and facing, and reload preserves the lobby save', async ({ page }, testInfo) => {
  const seed = await openWorld(page, POINTS.hotel);
  const entry = (await snapshot(page)).player;
  await page.keyboard.press('e'); await roomReady(page, 'HotelInterior');
  expect((await snapshot(page)).ownerVisual).toMatchObject({ mode: 'sprite', frame: 15 });
  await moveUntil(page, 's', state => state.player.y > 470);
  const interior = (await snapshot(page)).player;
  await page.screenshot({ path: testInfo.outputPath('owner-hotel-interior.png'), fullPage: true });
  await page.keyboard.press('Escape'); await roomReady(page, 'CentralLobby');
  expect((await snapshot(page)).player).toEqual(entry);
  expect((await snapshot(page)).ownerVisual.frame).toBe(8);
  await page.keyboard.press('e'); await roomReady(page, 'HotelInterior');
  expect((await snapshot(page)).player).toEqual(interior);
  expect((await snapshot(page)).ownerVisual.frame).toBe(0);
  await page.reload(); await ready(page);
  expect((await snapshot(page)).player).toEqual(entry);
  expect((await snapshot(page)).ownerVisual.frame).toBe(8);
  expect((await storage(page)).casinoWorldState).toBe(seed.casinoWorldState);
  await expectLegacyUnchanged(page, seed);
});

test('lounge sprite and blackjack pause preserve owner facing, position, focus and the original body', async ({ page }, testInfo) => {
  const seed = await openWorld(page, { ...POINTS.casino, facing: 'left' });
  const entry = (await snapshot(page)).player;
  await enterLounge(page); await roomReady(page, 'CasinoRoom');
  await moveUntil(page, 's', state => state.player.y > 495);
  await page.screenshot({ path: testInfo.outputPath('owner-blackjack-lounge.png'), fullPage: true });
  await moveUntil(page, 'w', state => state.interaction === 'blackjack');
  const parked = (await snapshot(page)).player;
  await page.keyboard.press('e');
  await expect(page.locator('#blackjack-status')).toContainText('Your hand stays');
  const paused = await snapshot(page);
  expect(paused.paused).toBe(true); expect(paused.ownerVisual).toMatchObject({ playing: false, frame: 15 });
  await hold(page, 'a', 250);
  expect((await snapshot(page)).ownerVisual).toEqual(paused.ownerVisual);
  expect((await snapshot(page)).player).toEqual(parked);
  await page.getByRole('button', { name: 'Return to floor' }).click();
  await expect(page.locator('canvas')).toBeFocused();
  await returnToLobby(page); await roomReady(page, 'CentralLobby');
  expect((await snapshot(page)).player).toEqual(entry); expect((await snapshot(page)).ownerVisual.frame).toBe(4);
  expect((await snapshot(page)).ownerBody).toEqual(paused.ownerBody);
  await expectLegacyUnchanged(page, seed);
});

test('reception dialogue and focus loss stop sprite animation and keep the same idle orientation', async ({ page }) => {
  const seed = await openWorld(page, POINTS.reception);
  const parked = (await snapshot(page)).player;
  await page.keyboard.press('e'); await expect(page.locator('#world-dialogue')).toBeVisible();
  const paused = (await snapshot(page)).ownerVisual;
  await hold(page, 'd', 180);
  expect((await snapshot(page)).ownerVisual).toEqual(paused);
  await page.keyboard.press('Escape'); await expect(page.locator('canvas')).toBeFocused();
  expect((await snapshot(page)).player).toEqual(parked);
  await page.keyboard.down('s');
  await expect.poll(async () => (await snapshot(page)).ownerVisual.playing).toBe(true);
  await page.locator('#management-link').focus();
  await page.keyboard.up('s');
  await expect.poll(async () => (await snapshot(page)).ownerVisual.playing).toBe(false);
  expect((await snapshot(page)).ownerVisual.frame).toBe(0);
  await page.locator('canvas').focus(); await moveUntil(page, 'd', state => state.player.x > parked.x + 25);
  await expectLegacyUnchanged(page, seed);
});

test('missing sprite falls back in all rooms, keeps navigation synchronous, and recovers on reload', async ({ page }) => {
  let requests = 0;
  const failure = route => { requests++; return route.abort(); };
  await page.route('**/world/assets/owner/owner.png', failure);
  const seed = await openWorld(page, POINTS.hotel);
  expect((await snapshot(page)).ownerVisual.mode).toBe('circle');
  expect((await snapshot(page)).ownerBody.placeholderVisible).toBe(true);
  const initialRequests = requests; // Phaser may retry the initial failed file.
  await page.keyboard.press('e'); await roomReady(page, 'HotelInterior');
  expect((await snapshot(page)).ownerVisual.mode).toBe('circle');
  await page.keyboard.press('Escape'); await roomReady(page, 'CentralLobby');
  await walkTo(page, POINTS.casino);
  await enterLounge(page); await roomReady(page, 'CasinoRoom');
  expect((await snapshot(page)).ownerVisual.mode).toBe('circle');
  expect(requests).toBe(initialRequests);
  await expectLegacyUnchanged(page, seed);
  await page.unroute('**/world/assets/owner/owner.png', failure);
  await page.reload(); await ready(page);
  expect((await snapshot(page)).ownerVisual.mode).toBe('sprite');
  expect((await snapshot(page)).ownerBody.placeholderVisible).toBe(false);
});

test('a valid image with the wrong sheet dimensions also uses the circle fallback', async ({ page }) => {
  await page.route('**/world/assets/owner/owner.png', route => route.fulfill({ path: path.join(assetFolder, 'owner-source.png'), contentType: 'image/png' }));
  await openWorld(page);
  expect((await snapshot(page)).ownerVisual.mode).toBe('circle');
  await moveUntil(page, 's', state => state.player.y >= 586);
  await hold(page, 's', 150);
  expect((await snapshot(page)).player.y).toBeCloseTo(586, 0);
  expect((await snapshot(page)).ownerBody.radius).toBe(14);
});

for (const fails of [false, true]) {
  test(`standalone lounge keeps movement, focus and collision with ${fails ? 'fallback' : 'sprite'} artwork`, async ({ page }) => {
    if (fails) await page.route('**/world/assets/owner/owner.png', route => route.abort());
    await page.goto('/floor/index.html?debug=1'); await ready(page); await page.locator('canvas').focus();
    expect((await snapshot(page)).ownerVisual.mode).toBe(fails ? 'circle' : 'sprite');
    expect((await snapshot(page)).ownerBody).toEqual({ radius: 14, width: 28, height: 28, isCircle: true, placeholderVisible: fails });
    await moveUntil(page, 's', state => state.player.y >= 585); await hold(page, 's', 150);
    expect((await snapshot(page)).player.y).toBeCloseTo(586, 0);
    await moveUntil(page, 'w', state => state.player.y < 520);
    await expect(page.locator('canvas')).toBeFocused();
  });
}

async function openWorld(page, position = { x: 480, y: 540, facing: 'up' }) {
  const seed = { ...savedResort(), casinoWorldState: currentWorld(position, { retainedOwnerTest: true }) };
  await page.addInitScript(values => {
    if (!sessionStorage.getItem('ownerTestSeeded')) {
      for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value);
      sessionStorage.setItem('ownerTestSeeded', '1');
    }
  }, seed);
  await page.goto('/world/index.html?debug=1'); await ready(page); await page.locator('canvas').focus();
  return seed;
}
async function ready(page) { await expect(page.locator('#floor-canvas')).toHaveAttribute('aria-busy', 'false'); await expect(page.locator('canvas')).toBeVisible(); }
async function snapshot(page) { return page.evaluate(() => (window.CasinoWorldDebug ?? window.CasinoFloorDebug).snapshot()); }
async function storage(page) { return page.evaluate(() => Object.fromEntries(Object.entries(localStorage))); }
async function roomReady(page, key) {
  await expect.poll(async () => (await snapshot(page)).scene).toBe(key);
  await expect(page.locator(key === 'CentralLobby' ? '#world-interact' : '#world-return')).toBeEnabled();
}
async function expectLegacyUnchanged(page, seed) {
  const current = await storage(page);
  for (const [key, value] of Object.entries(seed)) if (key !== 'casinoWorldState') expect(current[key], key).toBe(value);
}
async function moveUntil(page, key, predicate) {
  await page.keyboard.down(key);
  try { await expect.poll(async () => predicate(await snapshot(page)), { intervals: [30], timeout: 7000 }).toBe(true); }
  finally { await page.keyboard.up(key); }
  await expect.poll(async () => (await snapshot(page)).velocity).toEqual({ x: 0, y: 0 });
}
async function hold(page, key, duration) { await page.keyboard.down(key); await page.waitForTimeout(duration); await page.keyboard.up(key); }
