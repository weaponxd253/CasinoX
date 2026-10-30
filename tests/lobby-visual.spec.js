const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { savedResort } = require('./helpers/saved-resort');
const { POINTS, currentWorld, walkTo } = require('./helpers/lobby-world');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('shellBonusPrompted', '1'));
  await page.route(/https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com|cdnjs\.cloudflare\.com|randomuser\.me)\//, route => route.abort());
});

test('artwork keeps its aspect ratio and collision map connects the four destinations', async ({ page }, testInfo) => {
  await page.goto('/world/index.html?debug=1');
  await expect(page.locator('#floor-canvas')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('canvas')).toBeVisible();
  const result = await page.evaluate(async () => {
    const nav = await import('/world/lobby-navigation.js');
    const points = { spawn: { x: 480, y: 498 }, reception: { x: 206, y: 223 },
      casino: { x: 480, y: 195 }, office: { x: 717, y: 243 }, hotel: { x: 856, y: 318 } };
    return { snapshot: CasinoWorldDebug.snapshot(), points: Object.fromEntries(Object.entries(points).map(([id, p]) => [id, {
      ...p, walkable: nav.walkable(p), reachable: nav.reachable(p),
      path: nav.reachable(p) ? nav.lobbyPath(points.spawn, p) : null,
    }])) };
  });
  fs.writeFileSync(testInfo.outputPath('geometry.json'), JSON.stringify(result, null, 2));
  expect(result.snapshot.failed).toBe(false);
  expect(result.snapshot.lobbyArtwork).toEqual({ x: 30, y: 0, width: 900, height: 600, sourceWidth: 1536, sourceHeight: 1024, scaleMode: 1 });
  await page.screenshot({ path: testInfo.outputPath('central-lobby.png'), fullPage: true });
  await page.locator('#world-collisions').click();
  expect(await page.evaluate(() => CasinoWorldDebug.snapshot().collisionsVisible)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('collision-debug.png'), fullPage: true });
  for (const [id, point] of Object.entries(result.points)) { expect(point.walkable, id).toBe(true); expect(point.reachable, id).toBe(true); }
});

test('blocked v1 position migrates once with its exact payload and a relocation notice', async ({ page }) => {
  const original = ' { "version": 1, "lobby": {"x":480,"y":340,"facing":"left","custom":"keep"}, "updatedAt":1700000000000,"unknown":true } ';
  await page.addInitScript(seed => {
    if (!sessionStorage.getItem('migrationSeeded')) {
      Object.entries(seed).forEach(([key, value]) => localStorage.setItem(key, value));
      sessionStorage.setItem('migrationSeeded', '1');
    }
  }, { ...savedResort(), casinoWorldState: original });
  await page.goto('/');
  await expect(page.locator('#continue-resort')).toBeEnabled();
  expect(await page.evaluate(() => localStorage.getItem('casinoWorldState'))).toBe(original);
  await page.locator('#continue-resort').click();
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('#world-migration')).toBeVisible();
  const result = await page.evaluate(async () => {
    const state = JSON.parse(localStorage.getItem('casinoWorldState'));
    const nav = await import('/world/lobby-navigation.js');
    return { state, reachable: nav.reachable(state.lobby) };
  });
  expect(result.state.version).toBe(2); expect(result.reachable).toBe(true);
  expect(result.state.lobby.facing).toBe('left'); expect(result.state.lobby.custom).toBe('keep');
  expect(result.state.migrationReceipt.originalRaw).toBe(original);
  const receipt = result.state.migrationReceipt;
  await page.reload(); await expect(page.locator('canvas')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('casinoWorldState')).migrationReceipt)).toEqual(receipt);
});

test('real WASD movement reaches all four interactions around the fountain and furniture', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/world/index.html?debug=1'); await expect(page.locator('canvas')).toBeVisible();
  for (const [id, point] of [['receptionist', POINTS.reception], ['casino', POINTS.casino], ['office', POINTS.office], ['hotel', POINTS.hotel]]) {
    await walkTo(page, point);
    expect(await page.evaluate(() => CasinoWorldDebug.snapshot().interaction)).toBe(id);
  }
});

test('oblique column contacts remain clear and autosave never stops owner movement', async ({ page }) => {
  await seed(page, currentWorld({ x: 740, y: 329, facing: 'right' }));
  await world(page);
  await page.keyboard.down('d');
  let invalid;
  try {
    invalid = await page.evaluate(async () => {
      const { walkable } = await import('/world/lobby-navigation.js');
      const invalid = [], deadline = performance.now() + 1100;
      await new Promise(resolve => {
        const sample = () => {
          const player = CasinoWorldDebug.snapshot().player;
          if (!walkable(player)) invalid.push(player);
          if (performance.now() >= deadline) resolve();
          else requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      });
      return invalid;
    });
  } finally { await page.keyboard.up('d'); }
  expect(invalid).toEqual([]);
  expect((await snap(page)).failed).toBe(false);
  expect((await snap(page)).player.x).toBeGreaterThan(850);
  const saved = await page.evaluate(async () => {
    const { walkable } = await import('/world/lobby-navigation.js');
    const state = JSON.parse(localStorage.getItem('casinoWorldState'));
    return { valid: walkable(state.lobby), version: state.version };
  });
  expect(saved).toEqual({ valid: true, version: 2 });
});

test('the background is the exact supplied PNG and renders sharp, undistorted source pixels', async ({ page }) => {
  expect(createHash('sha256').update(fs.readFileSync(path.resolve(__dirname, '../world/assets/lobby/central-lobby.png'))).digest('hex'))
    .toBe('4fa44e549d01cdd1fe8e2a424335129653456e19bbb8a67d03187958a0f9af7d');
  await page.goto('/world/index.html'); await expect(page.locator('#floor-canvas')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('canvas')).toBeVisible();
  expect(await page.evaluate(() => typeof CasinoWorldDebug)).toBe('undefined');
  await expect(page.locator('#world-collisions')).not.toBeVisible();
  const comparisons = await page.evaluate(async () => {
    const image = new Image(); image.src = '/world/assets/lobby/central-lobby.png'; await image.decode();
    const expected = document.createElement('canvas'); expected.width = 960; expected.height = 600;
    const ctx = expected.getContext('2d'); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 960, 600);
    ctx.imageSmoothingEnabled = false; ctx.drawImage(image, 30, 0, 900, 600);
    const actual = document.querySelector('#floor-canvas canvas').getContext('2d');
    return [[4, 300], [950, 300], [480, 50], [250, 220], [850, 390], [450, 470]].map(([x, y]) => ({
      expected: [...ctx.getImageData(x, y, 1, 1).data], actual: [...actual.getImageData(x, y, 1, 1).data],
    }));
  });
  for (const sample of comparisons) expect(sample.actual).toEqual(sample.expected);
});

test('the fountain basin blocks the original radius-14 body while rugs and routes remain walkable', async ({ page }) => {
  await seed(page, currentWorld({ x: 480, y: 430, facing: 'up' }));
  await world(page);
  await page.keyboard.down('w'); await page.waitForTimeout(450); await page.keyboard.up('w');
  await expect.poll(async () => (await snap(page)).velocity).toEqual({ x: 0, y: 0 });
  expect((await snap(page)).player.y).toBeCloseTo(405.9921875, 1);
  expect((await snap(page)).failed).toBe(false);
  expect((await snap(page)).ownerBody.radius).toBe(14);
  await walkTo(page, { x: 480, y: 280 });
  expect((await snap(page)).lobbyForegrounds[0].depth).toBeGreaterThan(10);
  await walkTo(page, { x: 480, y: 430 });
  expect((await snap(page)).lobbyForegrounds[0].depth).toBeLessThan(10);
});

test('coffee-table and office-wall footprints stop the owner at the visible obstacles', async ({ page }) => {
  await seed(page, currentWorld({ x: 148.359375, y: 370, facing: 'up' })); await world(page);
  await page.keyboard.down('w'); await page.waitForTimeout(450); await page.keyboard.up('w');
  await expect.poll(async () => (await snap(page)).velocity).toEqual({ x: 0, y: 0 });
  const parked = (await snap(page)).player;
  const tableY = 547 * 600 / 1024, clearance = 33 * 600 / 1024 + 14;
  expect(parked.y).toBeGreaterThan(tableY);
  expect(Math.hypot(parked.x - 148.359375, parked.y - tableY)).toBeGreaterThanOrEqual(clearance - 0.05);
  expect(Math.hypot(parked.x - 148.359375, parked.y - tableY)).toBeLessThan(clearance + 1);
  await walkTo(page, POINTS.office);
  await page.keyboard.down('w'); await page.waitForTimeout(250); await page.keyboard.up('w');
  await expect.poll(async () => (await snap(page)).velocity).toEqual({ x: 0, y: 0 });
  expect((await snap(page)).player.y).toBeCloseTo(382 * 600 / 1024 + 14, 1);
  expect((await snap(page)).interaction).toBe('office');
});

test('migration preserves a clear v1 position and facing exactly without a relocation notice', async ({ page }) => {
  const original = ' {"version":1,"lobby":{"x":480.125,"y":480.25,"facing":"down","extra":42},"updatedAt":1700000000000,"sentinel":{"keep":true}}\n';
  const originalSeed = await seed(page, original); await world(page);
  expect((await snap(page)).player).toEqual({ x: 480.125, y: 480.25, facing: 'down' });
  expect((await snap(page)).ownerVisual.frame).toBe(0);
  await expect(page.locator('#world-migration')).not.toBeVisible();
  const state = JSON.parse((await storage(page)).casinoWorldState);
  expect(state.lobby).toEqual(JSON.parse(original).lobby); expect(state.sentinel).toEqual({ keep: true });
  expect(state.migrationReceipt).toMatchObject({ originalRaw: original, relocated: false, sourceVersion: 1 });
  await legacyUnchanged(page, originalSeed);
});

test('all sampled valid v1 coordinates remain exact when clear, otherwise relocation is reachable and deterministic', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { WorldState } = await import('/world/world-state.js');
    const { validLegacyPosition } = await import('/world/legacy-lobby-layout.js');
    const nav = await import('/world/lobby-navigation.js');
    const cases = [];
    for (let y = 60; y <= 540; y += 60) for (let x = 60; x <= 900; x += 60) {
      const p = { x, y, facing: 'right' };
      if (!validLegacyPosition(p)) continue;
      const raw = JSON.stringify({ version: 1, lobby: p, updatedAt: 1 });
      const memory = { getItem: key => key === 'casinoWorldState' ? raw : null };
      const a = new WorldState(memory), b = new WorldState(memory);
      cases.push({ p, clear: nav.walkable(p), resolved: a.lobby, duplicate: b.lobby, reachable: nav.reachable(a.lobby) });
    }
    return cases;
  });
  expect(result.length).toBeGreaterThan(80);
  expect(result.filter(entry => entry.clear && !entry.reachable), 'Clear legacy positions must not become trapped').toEqual([]);
  for (const entry of result) {
    expect(entry.resolved).toEqual(entry.duplicate); expect(entry.resolved.facing).toBe(entry.p.facing);
    if (entry.clear) expect(entry.resolved).toEqual(entry.p);
    else expect(entry.reachable).toBe(true);
  }
});

for (const failure of ['abort', 'wrong dimensions', 'decode failure']) {
  test(`artwork ${failure} preserves every existing save and never commits migration`, async ({ page }) => {
    const raw = JSON.stringify({ version: 1, lobby: { x: 800, y: 140, facing: 'left' }, updatedAt: 1 });
    const originalSeed = await seed(page, raw);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('**/world/assets/lobby/central-lobby.png', route => failure === 'abort' ? route.abort()
      : failure === 'wrong dimensions' ? route.fulfill({ path: path.resolve(__dirname, '../world/assets/owner/owner.png'), contentType: 'image/png' })
        : route.fulfill({ body: 'This is not a PNG', contentType: 'image/png' }));
    await page.goto('/world/index.html?debug=1');
    await expect(page.locator('#world-errors')).toContainText('artwork could not load');
    await expect.poll(async () => (await snap(page)).paused).toBe(true);
    expect((await snap(page)).player).toBeNull(); expect(await storage(page)).toEqual(originalSeed);
    await page.getByRole('link', { name: 'Title', exact: true }).click();
    await expect(page.locator('#continue-resort')).toBeEnabled();
    expect(await storage(page)).toEqual(originalSeed); expect(errors).toEqual([]);
  });
}

test('a failed migration write preserves v1 and can be safely retried after persistence recovers', async ({ page }) => {
  const raw = JSON.stringify({ version: 1, lobby: { x: 800, y: 140, facing: 'left' }, updatedAt: 1 });
  const originalSeed = await seed(page, raw);
  await page.addInitScript(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'casinoWorldState' && sessionStorage.getItem('denyMigration')) throw new Error('Migration write denied');
      return set.call(this, key, value);
    };
    if (!sessionStorage.getItem('migrationFailureTestStarted')) {
      sessionStorage.setItem('denyMigration', '1'); sessionStorage.setItem('migrationFailureTestStarted', '1');
    }
  });
  await world(page);
  await expect(page.locator('#world-errors')).toContainText('Migration write denied');
  expect(await storage(page)).toEqual(originalSeed);
  expect((await snap(page)).paused).toBe(true);
  await page.evaluate(() => sessionStorage.removeItem('denyMigration'));
  await page.reload(); await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('#world-migration')).toBeVisible();
  const saved = JSON.parse((await storage(page)).casinoWorldState);
  expect(saved.version).toBe(2); expect(saved.migrationReceipt.originalRaw).toBe(raw);
  await legacyUnchanged(page, originalSeed);
});

for (const [label, raw] of [
  ['invalid v1 coordinate', JSON.stringify({ version: 1, lobby: { x: 210, y: 280, facing: 'up' }, updatedAt: 1 })],
  ['obstructed v2 coordinate', currentWorld({ x: 480, y: 340, facing: 'up' })],
  ['future version', JSON.stringify({ version: 3 })],
  ['unknown layout', JSON.stringify({ version: 2, layout: 'future-room', lobby: POINTS.spawn, updatedAt: 1 })],
  ['invalid receipt', currentWorld(POINTS.spawn, { migrationReceipt: { originalRaw: '{broken' } })],
]) {
  test(`${label} is reported without relocation or replacement`, async ({ page }) => {
    const originalSeed = await seed(page, raw);
    await page.goto('/'); await expect(page.locator('#save-errors')).toContainText('casinoWorldState');
    await expect(page.locator('#continue-resort')).toBeDisabled(); expect(await storage(page)).toEqual(originalSeed);
    await page.goto('/world/index.html'); await expect(page.locator('#world-errors')).toContainText('casinoWorldState');
    expect(await storage(page)).toEqual(originalSeed);
  });
}

test('another tab changing world state while artwork loads prevents migration and remains authoritative', async ({ page, context }) => {
  const original = JSON.stringify({ version: 1, lobby: { x: 800, y: 140, facing: 'left' }, updatedAt: 1 });
  const originalSeed = await seed(page, original);
  let release, requested = false;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/world/assets/lobby/central-lobby.png', async route => {
    requested = true; await gate; await route.continue();
  });
  await page.goto('/world/index.html?debug=1', { waitUntil: 'commit' });
  await expect.poll(() => requested).toBe(true);
  const other = await context.newPage(); await other.goto('/');
  const replacement = currentWorld(POINTS.spawn, { otherTab: true });
  await other.evaluate(raw => localStorage.setItem('casinoWorldState', raw), replacement);
  await expect(page.locator('#world-errors')).toContainText('changed in another tab');
  release();
  await expect.poll(async () => (await snap(page)).paused).toBe(true);
  expect((await snap(page)).player).toBeNull(); expect((await storage(page)).casinoWorldState).toBe(replacement);
  await legacyUnchanged(page, originalSeed); await other.close();
});

test('Hotel Interior keeps its original seven collider rectangles independent of the new lobby', async ({ page }) => {
  await page.goto('/');
  const geometry = await page.evaluate(async () => (await import('/world/hotel-config.js')).HOTEL.solids);
  expect(geometry).toEqual([
    { x: 480, y: 16, width: 960, height: 32 }, { x: 480, y: 584, width: 960, height: 32 },
    { x: 16, y: 300, width: 32, height: 600 }, { x: 944, y: 300, width: 32, height: 600 },
    { x: 260, y: 280, width: 200, height: 90 }, { x: 700, y: 280, width: 200, height: 90 },
    { x: 480, y: 180, width: 180, height: 60 },
  ]);
});

async function seed(page, raw) {
  const values = { ...savedResort(), casinoWorldState: raw };
  await page.addInitScript(data => {
    if (!sessionStorage.getItem('lobbyVisualSeeded')) {
      Object.entries(data).forEach(([key, value]) => localStorage.setItem(key, value));
      sessionStorage.setItem('lobbyVisualSeeded', '1');
    }
  }, values);
  return values;
}
async function world(page) {
  await page.goto('/world/index.html?debug=1');
  await expect(page.locator('#floor-canvas')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('canvas')).toBeVisible(); await page.locator('canvas').focus();
}
async function snap(page) { return page.evaluate(() => CasinoWorldDebug.snapshot()); }
async function storage(page) { return page.evaluate(() => Object.fromEntries(Object.entries(localStorage))); }
async function legacyUnchanged(page, values) {
  const current = await storage(page);
  for (const [key, value] of Object.entries(values)) if (key !== 'casinoWorldState') expect(current[key], key).toBe(value);
}
