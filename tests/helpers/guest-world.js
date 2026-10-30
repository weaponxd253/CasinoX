const { expect } = require('@playwright/test');
const { savedResort } = require('./saved-resort');
const { POINTS, currentWorld } = require('./lobby-world');

const snap = page => page.evaluate(() => CasinoWorldDebug.snapshot());
const guest = async page => (await snap(page)).guest;
async function openWorld(page, position = POINTS.spawn) {
  const seed = { ...savedResort(), casinoWorldState: currentWorld(position, { phase5aSentinel: 'preserve' }) };
  await page.addInitScript(values => {
    if (!sessionStorage.getItem('guestTestSeeded')) {
      Object.entries(values).forEach(([k, v]) => localStorage.setItem(k, v)); sessionStorage.setItem('guestTestSeeded', '1');
    }
    sessionStorage.setItem('shellBonusPrompted', '1');
  }, seed);
  await page.goto('/world/index.html?debug=1'); await ready(page); return seed;
}
async function ready(page) {
  await expect(page.locator('#floor-canvas')).toHaveAttribute('aria-busy', 'false', { timeout: 15000 });
  await expect.poll(async () => Boolean((await snap(page)).guest)).toBe(true); await page.locator('canvas').focus();
}
async function storage(page) { return page.evaluate(() => Object.fromEntries(Object.entries(localStorage))); }
module.exports = { snap, guest, openWorld, ready, storage };
