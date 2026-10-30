const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { savedResort } = require('./helpers/saved-resort');
const { POINTS, currentWorld, walkTo } = require('./helpers/lobby-world');

const folder = path.resolve(__dirname, '../world/assets/receptionist');
const metadata = JSON.parse(fs.readFileSync(path.join(folder, 'receptionist-frames.json'), 'utf8'));

test('all sixteen normalized poses retain their source pixels, transparent margins and common feet', async ({ page }) => {
  for (const [name, hash] of [['receptionist-source.png', metadata.sourceSha256], ['receptionist.png', metadata.preparedSha256]]) {
    expect(createHash('sha256').update(fs.readFileSync(path.join(folder, name))).digest('hex')).toBe(hash);
  }
  expect(metadata.sourceSha256).toBe('d58c5be75256b004e0da681bc282c7296d3f7bf12aa608e58a5c0c9f1b60a19a');
  expect(metadata.frames.map(frame => frame.direction)).toEqual(['down', 'left', 'right', 'up'].flatMap(direction => Array(4).fill(direction)));
  for (const [index, frame] of metadata.frames.entries()) {
    expect(Math.floor(frame.sourceBounds[0] / 256)).toBe(index % 4);
    const band = [[48, 388], [409, 747], [774, 1107], [1126, 1458]][Math.floor(index / 4)];
    expect(frame.sourceBounds[1]).toBeGreaterThanOrEqual(band[0]); expect(frame.sourceBounds[3]).toBeLessThanOrEqual(band[1]);
  }
  await openWorld(page);
  const result = await page.evaluate(async meta => {
    const pixels = async name => {
      const image = new Image(); image.src = `/world/assets/receptionist/${name}`; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
      return { width: image.width, height: image.height, data: ctx.getImageData(0, 0, image.width, image.height).data };
    };
    const source = await pixels('receptionist-source.png'), prepared = await pixels('receptionist.png');
    const frames = [];
    for (const record of meta.frames) {
      const [left, top, right, bottom] = record.sourceBounds;
      const [dx, dy] = record.preparedBounds;
      let mismatch = 0, minX = 256, minY = 384, maxX = -1, maxY = -1, minAlpha = 255;
      for (let y = 0; y < 384; y++) for (let x = 0; x < 256; x++) {
        const out = ((Math.floor(record.frame / 4) * 384 + y) * prepared.width + record.frame % 4 * 256 + x) * 4;
        let expected = [0, 0, 0, 0];
        if (x >= dx && x < dx + right - left && y >= dy && y < dy + bottom - top) {
          const input = ((top + y - dy) * source.width + left + x - dx) * 4;
          if (source.data[input + 3] >= meta.alphaThreshold) expected = source.data.slice(input, input + 4);
        }
        if ([0, 1, 2, 3].some(c => prepared.data[out + c] !== expected[c])) mismatch++;
        const alpha = prepared.data[out + 3];
        if (alpha) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); minAlpha = Math.min(minAlpha, alpha); }
      }
      frames.push({ mismatch, bounds: [minX, minY, maxX + 1, maxY + 1], minAlpha });
    }
    let sourcePixels = 0, packedPixels = 0;
    for (let i = 3; i < source.data.length; i += 4) if (source.data[i] >= meta.alphaThreshold) sourcePixels++;
    for (let i = 3; i < prepared.data.length; i += 4) if (prepared.data[i]) packedPixels++;
    return { size: [prepared.width, prepared.height], frames, sourcePixels, packedPixels };
  }, metadata);
  expect(result.size).toEqual([1024, 1536]); expect(result.frames).toHaveLength(16);
  expect(result.packedPixels, 'No retained source pixels may be clipped or dropped').toBe(result.sourcePixels);
  for (const [index, frame] of result.frames.entries()) {
    expect(frame.mismatch, `pose ${index}`).toBe(0);
    expect(frame.bounds).toEqual(metadata.frames[index].preparedBounds);
    expect(frame.bounds[0]).toBeGreaterThan(16); expect(frame.bounds[2]).toBeLessThan(240);
    expect(frame.bounds[1]).toBeGreaterThanOrEqual(16); expect(frame.bounds[3]).toBe(368);
    expect(Math.abs((frame.bounds[0] + frame.bounds[2]) / 2 - 128)).toBeLessThanOrEqual(0.5);
    expect(frame.minAlpha).toBeGreaterThanOrEqual(32);
  }
});

test('the stationary receptionist matches owner scale and the counter occludes her lower body', async ({ page }, info) => {
  const seed = await openWorld(page);
  const state = await snapshot(page);
  expect(state.receptionist).toMatchObject({ mode: 'sprite', frame: 0, facing: 'down', playing: false,
    x: 206, y: 173, width: 48, height: 72, scaleMode: 1, depth: 4,
    hasPhysicsBody: false, placeholderVisible: false });
  expect(state.ownerVisual).toMatchObject({ width: 48, height: 72 });
  expect(state.receptionCounter).toHaveLength(1);
  expect(state.receptionCounter[0].baseline).toBe(196.875);
  expect(state.receptionCounter[0].depth).toBeGreaterThan(state.receptionist.depth);
  expect(state.receptionCounter[0].depth).toBeLessThan(10);
  expect(state.receptionist.walkingAnimations).toEqual(['down', 'left', 'right', 'up'].map((direction, row) => ({
    key: `receptionist-walk-${direction}`, frames: [0, 1, 2, 3].map(i => row * 4 + i), frameRate: 8, repeat: -1,
  })));
  const samples = await page.evaluate(async () => {
    const image = new Image(); image.src = '/world/assets/lobby/central-lobby.png'; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = 960; canvas.height = 600;
    const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false; ctx.drawImage(image, 30, 0, 900, 600);
    const actual = document.querySelector('#floor-canvas canvas').getContext('2d');
    return [[206, 136], [206, 165], [206, 171]].map(([x, y]) => ({
      background: [...ctx.getImageData(x, y, 1, 1).data], actual: [...actual.getImageData(x, y, 1, 1).data],
    }));
  });
  expect(samples[0].actual).not.toEqual(samples[0].background);
  expect(samples[1].actual).toEqual(samples[1].background); expect(samples[2].actual).toEqual(samples[2].background);
  await page.locator('#floor-canvas canvas').screenshot({ path: info.outputPath('receptionist-lobby.png') });
  await page.keyboard.down('w'); await page.waitForTimeout(200); await page.keyboard.up('w');
  await expect.poll(async () => (await snapshot(page)).velocity).toEqual({ x: 0, y: 0 });
  expect((await snapshot(page)).player.y).toBeCloseTo(210.875, 1);
  expect((await snapshot(page)).receptionist).toEqual(state.receptionist);
  await legacyUnchanged(page, seed);
  await page.route('**/world/assets/owner/owner.png', r => r.abort());
  await page.reload(); await ready(page);
  expect((await snapshot(page)).ownerVisual.mode).toBe('circle');
  expect((await snapshot(page)).receptionist.mode).toBe('sprite');
  expect(await page.locator('canvas').evaluate(canvas => getComputedStyle(canvas).imageRendering)).toBe('pixelated');
  await legacyUnchanged(page, seed);
});

test('reception dialogue and both scene returns keep a single stationary receptionist and preserve saves', async ({ page }) => {
  test.setTimeout(90000);
  let requests = 0; page.on('request', r => { if (r.url().endsWith('/receptionist.png')) requests++; });
  const seed = await openWorld(page);
  const npc = (await snapshot(page)).receptionist;
  await page.keyboard.press('e');
  await expect(page.locator('#world-dialogue')).toContainText('Welcome back, owner of Existing Resort');
  await expect(page.locator('#world-dialogue')).toBeVisible();
  const parked = (await snapshot(page)).player;
  await page.keyboard.down('d'); await page.waitForTimeout(160); await page.keyboard.up('d');
  expect((await snapshot(page)).paused).toBe(true); expect((await snapshot(page)).player).toEqual(parked);
  expect((await snapshot(page)).receptionist).toEqual(npc);
  await page.keyboard.press('Escape'); await expect(page.locator('canvas')).toBeFocused();
  for (const [point, scene] of [[POINTS.casino, 'CasinoRoom'], [POINTS.hotel, 'HotelInterior']]) {
    await walkTo(page, point); const entry = (await snapshot(page)).player;
    await page.keyboard.press('e'); await expect.poll(async () => (await snapshot(page)).scene).toBe(scene);
    await expect(page.locator('#world-return')).toBeEnabled(); await page.keyboard.press('Escape');
    await expect.poll(async () => (await snapshot(page)).scene).toBe('CentralLobby');
    await expect(page.locator('canvas')).toBeFocused();
    expect((await snapshot(page)).player).toEqual(entry); expect((await snapshot(page)).receptionist).toEqual(npc);
  }
  expect(requests).toBe(1); await legacyUnchanged(page, seed);
  const saved = (await snapshot(page)).player;
  await page.reload(); await ready(page);
  expect((await snapshot(page)).player).toEqual(saved); expect((await snapshot(page)).receptionist).toEqual(npc);
  await legacyUnchanged(page, seed);
});

for (const failure of ['abort', 'decode', 'wrong dimensions']) {
  test(`receptionist ${failure} uses a visual fallback while dialogue and saves keep working`, async ({ page }) => {
    const seed = await seedWorld(page); const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.route('**/world/assets/receptionist/receptionist.png', r => failure === 'abort' ? r.abort()
      : failure === 'decode' ? r.fulfill({ contentType: 'image/png', body: 'not an image' })
        : r.fulfill({ contentType: 'image/png', path: path.resolve(__dirname, '../world/assets/owner/owner.png') }));
    await page.goto('/world/index.html?debug=1'); await ready(page);
    expect((await snapshot(page)).receptionist).toMatchObject({ mode: 'circle', playing: false, placeholderVisible: true, hasPhysicsBody: false });
    expect((await snapshot(page)).failed).toBe(false); await expect(page.locator('#world-errors')).not.toBeVisible();
    await page.keyboard.press('e'); await expect(page.locator('#world-dialogue')).toContainText('Welcome back, owner');
    await page.keyboard.press('Escape'); await expect(page.locator('canvas')).toBeFocused();
    expect(await storage(page)).toEqual(seed); expect(errors).toEqual([]);
  });
}

async function seedWorld(page) {
  const seed = { ...savedResort(), casinoWorldState: currentWorld(POINTS.reception, { receptionistTest: 'preserve' }) };
  await page.addInitScript(values => {
    if (!sessionStorage.getItem('receptionistTestSeeded')) {
      Object.entries(values).forEach(([key, value]) => localStorage.setItem(key, value));
      sessionStorage.setItem('receptionistTestSeeded', '1');
    }
  }, seed); return seed;
}
async function openWorld(page) { const seed = await seedWorld(page); await page.goto('/world/index.html?debug=1'); await ready(page); return seed; }
async function ready(page) { await expect(page.locator('#floor-canvas')).toHaveAttribute('aria-busy', 'false'); await expect(page.locator('canvas')).toBeVisible(); await page.locator('canvas').focus(); }
async function snapshot(page) { return page.evaluate(() => CasinoWorldDebug.snapshot()); }
async function storage(page) { return page.evaluate(() => Object.fromEntries(Object.entries(localStorage))); }
async function legacyUnchanged(page, seed) { const data = await storage(page); for (const [key, value] of Object.entries(seed)) if (key !== 'casinoWorldState') expect(data[key], key).toBe(value); }
