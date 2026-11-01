const { enterLounge, returnToLobby } = require('./helpers/main-casino-world');
const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { savedResort } = require('./helpers/saved-resort');
const { POINTS, currentWorld } = require('./helpers/lobby-world');
const { LOUNGE_POINTS, loungeReady: focusLounge, loungeSnapshot: snapshot, walkLoungeTo } = require('./helpers/lounge-world');
const { dealerBustDeck } = require('./helpers/blackjack-deck');

const folder = path.resolve(__dirname, '../floor/assets/dealer');
const metadata = JSON.parse(fs.readFileSync(path.join(folder, 'dealer-frames.json'), 'utf8'));

test('all sixteen dealer poses retain source pixels, direction order, padding and common feet', async ({ page }) => {
  for (const [name, hash] of [['dealer-source.png', metadata.sourceSha256], ['dealer.png', metadata.preparedSha256]]) {
    expect(createHash('sha256').update(fs.readFileSync(path.join(folder, name))).digest('hex')).toBe(hash);
  }
  expect(metadata.sourceSha256).toBe('371025339f4245120c39899bb70974353e0c8f5d5fce84138d7b79f50be85b55');
  expect(metadata.frames.map(frame => frame.direction)).toEqual(['down', 'left', 'right', 'up'].flatMap(direction => Array(4).fill(direction)));
  for (const [index, frame] of metadata.frames.entries()) {
    expect(frame.frame).toBe(index);
    expect(Math.floor(frame.sourceBounds[0] / 256)).toBe(index % 4);
    const band = [[24, 355], [375, 719], [751, 1093], [1116, 1473]][Math.floor(index / 4)];
    expect(frame.sourceBounds[1]).toBeGreaterThanOrEqual(band[0]); expect(frame.sourceBounds[3]).toBeLessThanOrEqual(band[1]);
  }
  await openLounge(page, 'floor');
  const result = await page.evaluate(async meta => {
    const pixels = async name => {
      const image = new Image(); image.src = `/floor/assets/dealer/${name}`; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
      return { width: image.width, height: image.height, data: ctx.getImageData(0, 0, image.width, image.height).data };
    };
    const source = await pixels('dealer-source.png'), prepared = await pixels('dealer.png');
    const frames = [];
    for (const record of meta.frames) {
      const [left, top, right, bottom] = record.sourceBounds, [dx, dy] = record.preparedBounds;
      let mismatch = 0, minX = 256, minY = 384, maxX = -1, maxY = -1;
      for (let y = 0; y < 384; y++) for (let x = 0; x < 256; x++) {
        const out = ((Math.floor(record.frame / 4) * 384 + y) * prepared.width + record.frame % 4 * 256 + x) * 4;
        let expected = [0, 0, 0, 0];
        if (x >= dx && x < dx + right - left && y >= dy && y < dy + bottom - top) {
          const input = ((top + y - dy) * source.width + left + x - dx) * 4;
          if (source.data[input + 3] >= meta.alphaThreshold) expected = source.data.slice(input, input + 4);
        }
        if ([0, 1, 2, 3].some(c => prepared.data[out + c] !== expected[c])) mismatch++;
        if (prepared.data[out + 3]) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
      }
      frames.push({ mismatch, bounds: [minX, minY, maxX + 1, maxY + 1] });
    }
    let sourcePixels = 0, packedPixels = 0;
    for (let i = 3; i < source.data.length; i += 4) if (source.data[i] >= meta.alphaThreshold) sourcePixels++;
    for (let i = 3; i < prepared.data.length; i += 4) if (prepared.data[i]) packedPixels++;
    return { sourceSize: [source.width, source.height], size: [prepared.width, prepared.height], frames, sourcePixels, packedPixels };
  }, metadata);
  expect(result.sourceSize).toEqual([1024, 1536]); expect(result.size).toEqual([1024, 1536]);
  expect(result.frames).toHaveLength(16); expect(result.packedPixels).toBe(result.sourcePixels);
  for (const [index, frame] of result.frames.entries()) {
    expect(frame.mismatch, `pose ${index}`).toBe(0); expect(frame.bounds).toEqual(metadata.frames[index].preparedBounds);
    expect(frame.bounds[0]).toBeGreaterThanOrEqual(16); expect(frame.bounds[2]).toBeLessThanOrEqual(240);
    expect(frame.bounds[1]).toBeGreaterThanOrEqual(8); expect(frame.bounds[3]).toBe(368);
    expect(Math.abs((frame.bounds[0] + frame.bounds[2]) / 2 - 128)).toBeLessThanOrEqual(0.5);
  }
});

for (const host of ['world', 'floor']) {
  test(`${host} dealer matches owner scale and is visibly occluded by the original table`, async ({ page }, info) => {
    const seed = await openLounge(page, host);
    const state = await snapshot(page);
    expect(state.dealer).toMatchObject({ mode: 'sprite', x: 480, y: 199, frame: 0, facing: 'down',
      width: 48, height: 72, playing: false, depth: 4, scaleMode: 1,
      hasPhysicsBody: false, placeholderVisible: false, state: 'IDLE', greetingCount: 0 });
    expect(state.ownerVisual).toMatchObject({ width: 48, height: 72 });
    expect(state.ownerBody).toMatchObject({ radius: 14, width: 28, height: 28 });
    expect(state.dealer.walkingAnimations).toEqual(['down', 'left', 'right', 'up'].map((direction, row) => ({
      key: `dealer-walk-${direction}`, frames: [0, 1, 2, 3].map(i => row * 4 + i), frameRate: 8, repeat: -1,
    })));
    expect(state.loungeForegrounds[0].depth).toBeGreaterThan(state.dealer.depth);
    const samples = await page.evaluate(async () => {
      const image = new Image(); image.src = '/floor/assets/lounge/blackjack-lounge.png'; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = 960; canvas.height = 600;
      const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false; ctx.drawImage(image, 30, 0, 900, 600);
      const actual = document.querySelector('canvas').getContext('2d');
      return [[480, 158], [480, 190], [480, 196]].map(([x, y]) => ({
        background: [...ctx.getImageData(x, y, 1, 1).data], actual: [...actual.getImageData(x, y, 1, 1).data],
      }));
    });
    expect(samples[0].actual).not.toEqual(samples[0].background);
    expect(samples[1].actual).toEqual(samples[1].background); expect(samples[2].actual).toEqual(samples[2].background);
    expect(await page.locator('canvas').evaluate(canvas => getComputedStyle(canvas).imageRendering)).toBe('pixelated');
    const canvas = page.locator('canvas');
    await canvas.screenshot({ path: info.outputPath(`dealer-${host}-lounge.png`) });
    const box = await canvas.boundingBox();
    await page.screenshot({ path: info.outputPath(`dealer-${host}-table.png`), clip: {
      x: box.x + 280 * box.width / 960, y: box.y + 110 * box.height / 600,
      width: 400 * box.width / 960, height: 300 * box.height / 600,
    } });
    expect(await storage(page)).toEqual(seed);
  });

  test(`${host} greets once per approach, opens with one E and retains one paid hand through close/reopen`, async ({ page }) => {
    test.setTimeout(60000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const seed = await openLounge(page, host);
    const original = (await snapshot(page)).dealer;
    await walkLoungeTo(page, LOUNGE_POINTS.table);
    await expect.poll(async () => (await snapshot(page)).dealer.state).toBe('GREETING');
    const status = page.locator(host === 'world' ? '#world-status' : '#floor-status');
    await expect(status).toContainText('Welcome to the Blackjack Lounge, boss. Ready for a hand?');
    await expect(page.locator(host === 'world' ? '#world-interact' : '#interact-button')).toBeEnabled();
    await page.waitForTimeout(150); expect((await snapshot(page)).dealer.greetingCount).toBe(1);
    await expect(page.locator('#world-dialogue')).not.toBeVisible();
    await page.keyboard.press('e'); await expect(page.locator('#blackjack-overlay')).toBeVisible();
    await expect.poll(async () => (await snapshot(page)).paused).toBe(true);
    expect((await snapshot(page)).dealer).toMatchObject({ state: 'PLAYING', x: original.x, y: original.y, frame: 0, playing: false });
    const parked = (await snapshot(page)).player;
    await hold(page, 'a', 180); expect((await snapshot(page)).player).toEqual(parked);
    const table = page.frameLocator('#blackjack-frame');
    await expect(page.locator('#blackjack-status')).toContainText('Your hand stays');
    await dealerBustDeck(table); await table.locator('#speed-range').fill('2');
    await table.locator('.chip-btn[data-value="5"]').click(); await table.locator('#deal-button').click();
    await expect(table.locator('#result-message')).toHaveText('Your move…');
    expect((await storage(page)).casinoBalance).toBe('245.25');
    await table.locator('body').evaluate(body => { body.dataset.dealerHand = 'retained'; });
    await page.getByRole('button', { name: 'Return to floor' }).click();
    await expect(page.locator('canvas')).toBeFocused();
    expect((await snapshot(page)).player).toEqual(parked);
    expect((await snapshot(page)).dealer).toMatchObject({ state: 'IDLE', greetingCount: 1, x: original.x, y: original.y });
    await page.waitForTimeout(280); await page.keyboard.press('e');
    await expect(table.locator('body')).toHaveAttribute('data-dealer-hand', 'retained');
    expect((await storage(page)).casinoBalance).toBe('245.25');
    await expect(table.locator('#player-cards .card')).toHaveCount(2);
    await table.locator('#stand-button').click(); await expect(table.locator('#result-message')).toHaveText('Dealer busts — you win!');
    expect((await storage(page)).casinoBalance).toBe('255.25');
    await expect(table.locator('#leaderboard-list li')).toHaveCount(1);
    await table.locator('#speed-range').focus(); await page.keyboard.press('Escape');
    await expect(page.locator('canvas')).toBeFocused();
    expect((await snapshot(page)).dealer).toMatchObject({ state: 'IDLE', greetingCount: 1 });
    expect((await snapshot(page)).player).toEqual(parked);
    await walkLoungeTo(page, LOUNGE_POINTS.spawn);
    expect((await snapshot(page)).dealer.state).toBe('IDLE');
    await walkLoungeTo(page, LOUNGE_POINTS.table);
    expect((await snapshot(page)).dealer).toMatchObject({ state: 'GREETING', greetingCount: 2 });
    expect((await storage(page)).casinoBalance).toBe('255.25');
    await preserved(page, seed); expect(errors).toEqual([]);
  });

  for (const failure of ['abort', 'decode failure', 'wrong dimensions']) {
    test(`${host} dealer ${failure} falls back without blocking the table or modifying saves`, async ({ page }) => {
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.route('**/floor/assets/dealer/dealer.png', route => failure === 'abort' ? route.abort()
        : failure === 'wrong dimensions' ? route.fulfill({ path: path.resolve(__dirname, '../world/assets/owner/owner.png'), contentType: 'image/png' })
          : route.fulfill({ contentType: 'image/png', body: 'not a PNG' }));
      const seed = await openLounge(page, host);
      expect((await snapshot(page)).dealer).toMatchObject({ mode: 'circle', placeholderVisible: true, hasPhysicsBody: false });
      expect((await snapshot(page)).failed).toBe(false);
      await walkLoungeTo(page, LOUNGE_POINTS.table); await page.keyboard.press('e');
      await expect(page.locator('#blackjack-overlay')).toBeVisible();
      await expect(page.locator('#blackjack-status')).toContainText('Your hand stays');
      await page.getByRole('button', { name: 'Return to floor' }).click(); await expect(page.locator('canvas')).toBeFocused();
      expect(await storage(page)).toEqual(seed); expect(errors).toEqual([]);
    });
  }
}

test('dealer survives scene sleep/wake, remains nonblocking behind the table and preserves lobby return and reload', async ({ page }) => {
  test.setTimeout(90000);
  let requests = 0; page.on('request', request => { if (request.url().endsWith('/dealer.png')) requests++; });
  const seed = await openLounge(page, 'world');
  const npc = (await snapshot(page)).dealer;
  await walkLoungeTo(page, LOUNGE_POINTS.west); await walkLoungeTo(page, LOUNGE_POINTS.north);
  expect((await snapshot(page)).dealer).toEqual(npc);
  expect((await snapshot(page)).loungeForegrounds[0].depth).toBeGreaterThan(npc.depth);
  await hold(page, 's', 220); expect((await snapshot(page)).player.y).toBeCloseTo(189.90625, 1);
  await walkLoungeTo(page, LOUNGE_POINTS.east); await walkLoungeTo(page, LOUNGE_POINTS.exit);
  // The route around the east aisle passes the approach strip once.
  const sleeping = { ...npc, greetingCount: 1 };
  expect((await snapshot(page)).dealer).toEqual(sleeping);
  await page.keyboard.press('e'); await expect.poll(async () => (await snapshot(page)).scene).toBe('MainCasinoFloor'); await returnToLobby(page); await expect.poll(async () => (await snapshot(page)).scene).toBe('CentralLobby');
  expect((await snapshot(page)).player).toEqual(POINTS.casino);
  expect((await snapshot(page)).dealer).toEqual(sleeping);
  await page.waitForTimeout(280); await enterLounge(page); await loungeReady(page);
  await expect.poll(async () => (await snapshot(page)).scene).toBe('CasinoRoom');
  expect((await snapshot(page)).dealer).toEqual(sleeping); expect(requests).toBe(1);
  await page.waitForTimeout(280); await returnToLobby(page);
  await expect.poll(async () => (await snapshot(page)).scene).toBe('CentralLobby');
  expect((await snapshot(page)).player).toEqual(POINTS.casino); expect(await storage(page)).toEqual(seed);
  await page.reload(); await loungeReady(page);
  expect((await snapshot(page)).player).toEqual(POINTS.casino);
  await enterLounge(page); await loungeReady(page);
  await expect.poll(async () => (await snapshot(page)).scene).toBe('CasinoRoom');
  expect((await snapshot(page)).dealer).toEqual(npc); expect(await storage(page)).toEqual(seed);
});

async function openLounge(page, host) {
  const seed = { ...savedResort(), casinoWorldState: currentWorld(POINTS.casino, { dealerTest: 'preserve' }) };
  await page.addInitScript(values => {
    if (!sessionStorage.getItem('dealerTestSeeded')) {
      Object.entries(values).forEach(([key, value]) => localStorage.setItem(key, value));
      sessionStorage.setItem('dealerTestSeeded', '1');
    }
    sessionStorage.setItem('shellBonusPrompted', '1');
  }, seed);
  await page.goto(`/${host}/index.html?debug=1`); await loungeReady(page);
  if (host === 'world') {
    await enterLounge(page); await expect.poll(async () => (await snapshot(page)).scene).toBe('CasinoRoom'); await loungeReady(page);
  }
  return seed;
}
async function storage(page) { return page.evaluate(() => Object.fromEntries(Object.entries(localStorage))); }
async function loungeReady(page) {
  // Initial PNG decoding can take longer under the full two-browser workload.
  // Wait for real readiness, then use the shared normal focus/player checks.
  await expect(page.locator('#floor-canvas')).toHaveAttribute('aria-busy', 'false', { timeout: 15000 });
  await focusLounge(page);
}
async function preserved(page, seed) {
  const data = await storage(page);
  for (const [key, value] of Object.entries(seed)) if (!['casinoBalance', 'casinoProfile'].includes(key)) expect(data[key], key).toBe(value);
}
async function hold(page, key, duration) { await page.keyboard.down(key); await page.waitForTimeout(duration); await page.keyboard.up(key); }
