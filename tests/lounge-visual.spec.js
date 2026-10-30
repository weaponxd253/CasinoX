const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { savedResort } = require('./helpers/saved-resort');
const { POINTS, currentWorld } = require('./helpers/lobby-world');
const { LOUNGE_POINTS, loungeReady, loungeSnapshot: snapshot, walkLoungeTo } = require('./helpers/lounge-world');

const asset = path.resolve(__dirname, '../floor/assets/lounge/blackjack-lounge.png');
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('shellBonusPrompted', '1'));
});

test('south-open lounge uses the original artwork at lobby scale and captures the four review views', async ({ page }, info) => {
  expect(createHash('sha256').update(fs.readFileSync(asset)).digest('hex')).toBe('c84b3780798110d2be28ee19d039a4b3565bdd6aeb7d96fa8a1d47c7a6209f39');
  const seed = await openWorldLounge(page);
  expect((await snapshot(page)).loungeArtwork).toEqual({ x: 30, y: 0, width: 900, height: 600, sourceWidth: 1536, sourceHeight: 1024, scaleMode: 1 });
  expect((await snapshot(page)).player).toEqual({ x: 480, y: 480, facing: 'up' });
  expect((await snapshot(page)).ownerBody).toEqual({ radius: 14, width: 28, height: 28, isCircle: true, placeholderVisible: false });
  await page.screenshot({ path: info.outputPath('blackjack-lounge.png'), fullPage: true });
  await page.locator('#world-collisions').click();
  expect((await snapshot(page)).collisionsVisible).toBe(true);
  await page.screenshot({ path: info.outputPath('blackjack-lounge-collisions.png'), fullPage: true });
  await page.locator('#world-collisions').click();
  await walkLoungeTo(page, LOUNGE_POINTS.table);
  await expect(page.locator('#world-interact')).toHaveText('E · Play blackjack');
  await page.screenshot({ path: info.outputPath('blackjack-lounge-table.png'), fullPage: true });
  await walkLoungeTo(page, LOUNGE_POINTS.exit);
  await expect(page.locator('#world-interact')).toHaveText('E · Return to Central Lobby');
  await page.screenshot({ path: info.outputPath('blackjack-lounge-exit.png'), fullPage: true });
  await page.keyboard.press('e');
  await expect.poll(async () => (await snapshot(page)).scene).toBe('CentralLobby');
  expect((await snapshot(page)).player).toEqual(POINTS.casino);
  expect(await storage(page)).toEqual(seed);
  await page.reload(); await loungeReady(page);
  expect((await snapshot(page)).player).toEqual(POINTS.casino);
});

test('standalone background pixels remain sharp and the separate table is never requested', async ({ page }) => {
  const pngs = []; page.on('request', r => { if (r.url().endsWith('.png')) pngs.push(r.url()); });
  await page.goto('/floor/index.html');
  await expect(page.locator('#floor-canvas')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('canvas')).toBeFocused();
  expect(await page.evaluate(() => typeof CasinoFloorDebug)).toBe('undefined');
  await expect(page.locator('#floor-collisions')).not.toBeVisible();
  const pixels = await page.evaluate(async () => {
    const img = new Image(); img.src = '/floor/assets/lounge/blackjack-lounge.png'; await img.decode();
    const expected = document.createElement('canvas'); expected.width = 960; expected.height = 600;
    const ctx = expected.getContext('2d'); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 960, 600);
    ctx.imageSmoothingEnabled = false; ctx.drawImage(img, 30, 0, 900, 600);
    const actual = document.querySelector('canvas').getContext('2d');
    return [[4, 300], [950, 300], [480, 40], [480, 250], [480, 560], [200, 300]].map(([x, y]) => ({
      expected: [...ctx.getImageData(x, y, 1, 1).data], actual: [...actual.getImageData(x, y, 1, 1).data],
    }));
  });
  for (const p of pixels) expect(p.actual).toEqual(p.expected);
  expect(pngs.every(url => /owner\.png$|blackjack-lounge\.png$|dealer\.png$/.test(url))).toBe(true);
});

test('owner can circle the table through both aisles and collide with the actual curved base and stools', async ({ page }) => {
  test.setTimeout(90000);
  await openWorldLounge(page);
  await walkLoungeTo(page, LOUNGE_POINTS.table);
  await hold(page, 'w', 450);
  expect((await snapshot(page)).player.y).toBeCloseTo(389.5859375, 1);
  expect((await snapshot(page)).loungeForegrounds[0].depth).toBe(5);
  await walkLoungeTo(page, LOUNGE_POINTS.west);
  await walkLoungeTo(page, LOUNGE_POINTS.north);
  expect((await snapshot(page)).loungeForegrounds[0].depth).toBe(20);
  await hold(page, 's', 450);
  expect((await snapshot(page)).player.y).toBeCloseTo(189.90625, 1);
  await page.keyboard.press('e'); await expect(page.locator('#blackjack-overlay')).not.toBeVisible();
  await walkLoungeTo(page, LOUNGE_POINTS.east);
  await walkLoungeTo(page, LOUNGE_POINTS.table);
  expect((await snapshot(page)).failed).toBe(false);
  await page.keyboard.press('e'); await expect(page.locator('#blackjack-overlay')).toBeVisible();
  const parked = (await snapshot(page)).player;
  await hold(page, 'a', 180); expect((await snapshot(page)).player).toEqual(parked);
  await page.getByRole('button', { name: 'Return to floor' }).click();
  await expect(page.locator('canvas')).toBeFocused(); expect((await snapshot(page)).player).toEqual(parked);
});

test('pillar, corner furniture and opposing stool contacts stop movement and allow retreat', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto('/floor/index.html?debug=1'); await loungeReady(page);
  await walkLoungeTo(page, { x: 340, y: 550 }); await hold(page, 'a', 500);
  expect((await snapshot(page)).player.x).toBeCloseTo(321.734375, 1);
  await hold(page, 'd', 220); expect((await snapshot(page)).player.x).toBeGreaterThan(350);
  await walkLoungeTo(page, { x: 138.3984375, y: 200 }); await hold(page, 'w', 500);
  const corner = (await snapshot(page)).player;
  const separation = Math.hypot(corner.x - 138.3984375, corner.y - 138.28125);
  expect(separation).toBeGreaterThanOrEqual(33.3359375 - 0.01);
  expect(separation).toBeLessThan(34);
  await walkLoungeTo(page, { x: 390, y: 410 });
  await page.keyboard.down('w'); await page.keyboard.down('d');
  const bad = await page.evaluate(async () => {
    const { walkable } = await import('/floor/lounge-layout.js');
    const invalid = [], end = performance.now() + 1600;
    await new Promise(resolve => {
      const check = () => {
        const state = CasinoFloorDebug.snapshot();
        if (!walkable(state.player)) invalid.push(state.player);
        if (performance.now() > end || state.failed) resolve(); else requestAnimationFrame(check);
      }; requestAnimationFrame(check);
    }); return invalid;
  });
  await page.keyboard.up('w'); await page.keyboard.up('d');
  expect(bad).toEqual([]); expect((await snapshot(page)).failed).toBe(false);
  const parked = (await snapshot(page)).player;
  await hold(page, 's', 300); expect((await snapshot(page)).player.y).toBeGreaterThan(parked.y + 25);
});

test('the lounge keeps all directional walk and idle animations and the existing movement speed', async ({ page }) => {
  await page.goto('/floor/index.html?debug=1'); await loungeReady(page);
  for (const [key, direction, idle] of [['d', 'right', 8], ['a', 'left', 4], ['s', 'down', 0], ['w', 'up', 15]]) {
    await page.keyboard.down(key);
    await expect.poll(async () => (await snapshot(page)).ownerVisual.animation).toBe(`owner-walk-${direction}`);
    expect((await snapshot(page)).ownerVisual.playing).toBe(true);
    const velocity = (await snapshot(page)).velocity;
    expect(Math.hypot(velocity.x, velocity.y)).toBeCloseTo(190, 5);
    await page.waitForTimeout(100); await page.keyboard.up(key);
    await expect.poll(async () => (await snapshot(page)).velocity).toEqual({ x: 0, y: 0 });
    expect((await snapshot(page)).ownerVisual).toMatchObject({ playing: false, frame: idle, width: 48, height: 72 });
    expect((await snapshot(page)).ownerFacing).toBe(direction);
  }
});

test('delayed first entry blocks interaction until the lounge is ready and restores focus', async ({ page }) => {
  const seed = await seedWorld(page);
  let release, requested = false;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/floor/assets/lounge/blackjack-lounge.png', async route => { requested = true; await gate; await route.continue(); });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/world/index.html?debug=1'); await loungeReady(page); await page.keyboard.press('e');
  await expect.poll(() => requested).toBe(true);
  await expect(page.locator('#floor-canvas')).toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('#world-interact')).toBeDisabled(); await expect(page.locator('#world-return')).toBeDisabled();
  await page.keyboard.press('e'); await page.keyboard.press('Escape');
  expect((await snapshot(page)).player).toBeNull(); expect(await storage(page)).toEqual(seed);
  release(); await loungeReady(page); expect((await snapshot(page)).scene).toBe('CasinoRoom');
  await expect(page.locator('canvas')).toBeFocused(); expect(errors).toEqual([]);
});

for (const route of ['world', 'floor']) for (const failure of ['abort', 'wrong dimensions', 'decode failure']) {
  test(`${route} handles lounge artwork ${failure} without modifying saves or creating an owner`, async ({ page }) => {
    const seed = await seedWorld(page);
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.route('**/floor/assets/lounge/blackjack-lounge.png', r => failure === 'abort' ? r.abort()
      : failure === 'wrong dimensions' ? r.fulfill({ path: path.resolve(__dirname, '../world/assets/owner/owner.png'), contentType: 'image/png' })
        : r.fulfill({ contentType: 'image/png', body: 'not an image' }));
    await page.goto(`/${route}/index.html?debug=1`);
    if (route === 'world') { await loungeReady(page); await page.keyboard.press('e'); }
    await expect(page.locator(route === 'world' ? '#world-errors' : '#floor-status')).toContainText('artwork could not load');
    await expect.poll(async () => (await snapshot(page)).paused).toBe(true);
    expect((await snapshot(page)).player).toBeNull(); expect((await snapshot(page)).failed).toBe(true);
    expect(await storage(page)).toEqual(seed); expect(errors).toEqual([]);
    if (route === 'floor') await expect(page.getByRole('link', { name: 'Open Blackjack X' })).toBeVisible();
  });
}

test('another tab changing the save during lounge loading stops stale creation and keeps its payload', async ({ page, context }) => {
  const seed = await seedWorld(page);
  let release, requested = false; const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/floor/assets/lounge/blackjack-lounge.png', async r => { requested = true; await gate; await r.continue(); });
  await page.goto('/world/index.html?debug=1'); await loungeReady(page); await page.keyboard.press('e');
  await expect.poll(() => requested).toBe(true);
  const other = await context.newPage(); await other.goto('/'); const replacement = currentWorld(POINTS.spawn, { otherTab: true });
  await other.evaluate(raw => localStorage.setItem('casinoWorldState', raw), replacement);
  await expect(page.locator('#world-errors')).toContainText('changed in another tab');
  release(); await expect.poll(async () => (await snapshot(page)).paused).toBe(true);
  expect((await snapshot(page)).player).toBeNull(); expect((await storage(page)).casinoWorldState).toBe(replacement);
  for (const [key, raw] of Object.entries(seed)) if (key !== 'casinoWorldState') expect((await storage(page))[key]).toBe(raw);
  await other.close();
});

async function seedWorld(page) {
  const seed = { ...savedResort(), casinoWorldState: currentWorld(POINTS.casino, { phase4Sentinel: true }) };
  await page.addInitScript(values => {
    if (!sessionStorage.getItem('loungeTestSeeded')) {
      Object.entries(values).forEach(([k, v]) => localStorage.setItem(k, v)); sessionStorage.setItem('loungeTestSeeded', '1');
    }
  }, seed); return seed;
}
async function openWorldLounge(page) {
  const seed = await seedWorld(page); await page.goto('/world/index.html?debug=1'); await loungeReady(page);
  await page.keyboard.press('e'); await expect.poll(async () => (await snapshot(page)).scene).toBe('CasinoRoom');
  await loungeReady(page); return seed;
}
async function hold(page, key, ms) {
  await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key);
  await expect.poll(async () => (await snapshot(page)).velocity).toEqual({ x: 0, y: 0 });
}
async function storage(page) { return page.evaluate(() => Object.fromEntries(Object.entries(localStorage))); }
