const { test, expect } = require('@playwright/test');
const { savedResort } = require('./helpers/saved-resort');
const { currentWorld } = require('./helpers/lobby-world');

// Narrow gaps visible in the user's screenshots: a table against a chair,
// and a planter against the casino arch. Hold into both contacts past autosave.
for (const spot of [
  { name: 'east seating table and chair', start: { x: 725, y: 377, facing: 'left' }, into: 'a', away: 'd' },
  { name: 'planter beside casino stairs', start: { x: 620, y: 172.5, facing: 'right' }, into: 'd', away: 'a' },
]) {
  test(`${spot.name} stays clear while pressed and permits retreat, reload and Continue`, async ({ page }) => {
    const legacy = savedResort();
    await page.addInitScript(seed => {
      if (!sessionStorage.getItem('contactTestSeeded')) {
        Object.entries(seed).forEach(([key, raw]) => localStorage.setItem(key, raw));
        sessionStorage.setItem('contactTestSeeded', '1');
      }
    }, { ...legacy, casinoWorldState: currentWorld(spot.start, { contactSentinel: 'preserve' }) });
    await page.goto('/world/index.html?debug=1');
    await ready(page);
    const start = await snapshot(page);
    expect(start.failed).toBe(false);
    await page.keyboard.down(spot.into);
    let result;
    try { result = await sampleClearance(page, 2200); }
    finally { await page.keyboard.up(spot.into); }
    await expect.poll(async () => (await snapshot(page)).velocity).toEqual({ x: 0, y: 0 });
    expect(result.invalid, JSON.stringify(result)).toEqual([]);
    expect(result.failed).toBe(false);
    await expect(page.locator('#world-errors')).not.toBeVisible();
    const contact = (await snapshot(page)).player;
    await page.keyboard.down(spot.away);
    try { result = await sampleClearance(page, 350); }
    finally { await page.keyboard.up(spot.away); }
    await expect.poll(async () => (await snapshot(page)).velocity).toEqual({ x: 0, y: 0 });
    expect(result.invalid).toEqual([]); expect(result.failed).toBe(false);
    const parked = (await snapshot(page)).player;
    expect(Math.hypot(parked.x - contact.x, parked.y - contact.y)).toBeGreaterThan(30);
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('casinoWorldState')).lobby)).toEqual(parked);
    await page.reload(); await ready(page);
    expect((await snapshot(page)).player).toEqual(parked);
    await page.getByRole('link', { name: 'Title', exact: true }).click();
    await page.locator('#continue-resort').click(); await ready(page);
    // Continue uses the normal URL, which intentionally exposes no debug API.
    // Scene readiness includes its initial persistence attempt: it must retain
    // the checkpoint rather than replace it with a default or invalid spawn.
    await expect(page).toHaveURL(/\/world\/index\.html$/);
    await expect(page.locator('#world-errors')).not.toBeVisible();
    expect(await page.evaluate(() => typeof CasinoWorldDebug)).toBe('undefined');
    const saved = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
    for (const [key, raw] of Object.entries(legacy)) expect(saved[key], key).toBe(raw);
    expect(JSON.parse(saved.casinoWorldState).lobby).toEqual(parked);
    expect(JSON.parse(saved.casinoWorldState).contactSentinel).toBe('preserve');
  });
}

async function ready(page) {
  await expect(page.locator('#floor-canvas')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('canvas')).toBeVisible();
  await page.locator('canvas').focus();
}
async function snapshot(page) { return page.evaluate(() => CasinoWorldDebug.snapshot()); }
async function sampleClearance(page, duration) {
  return page.evaluate(async duration => {
    const { walkable } = await import('/world/lobby-navigation.js');
    const invalid = [], deadline = performance.now() + duration;
    let failed = false;
    await new Promise(resolve => {
      const sample = () => {
        const state = CasinoWorldDebug.snapshot();
        if (!walkable(state.player) && invalid.length < 5) invalid.push(state.player);
        failed ||= state.failed;
        if (performance.now() >= deadline || failed) resolve();
        else requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    return { invalid, failed, player: CasinoWorldDebug.snapshot().player };
  }, duration);
}
