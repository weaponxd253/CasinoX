const { expect } = require('@playwright/test');
const { savedResort } = require('./saved-resort');
const { POINTS, currentWorld } = require('./lobby-world');
const snap = page => page.evaluate(() => CasinoWorldDebug.snapshot());
const traffic = async page => (await snap(page)).guestTraffic;
async function openTraffic(page, { position = POINTS.reception, profile = null, seed = 19 } = {}) {
  const values = { ...savedResort(), casinoWorldState: currentWorld(position, { phase5cSentinel: 'preserve' }) };
  await page.addInitScript(values => {
    if (!sessionStorage.getItem('trafficTestSeeded')) {
      for (const [k,v] of Object.entries(values)) localStorage.setItem(k,v);
      sessionStorage.setItem('trafficTestSeeded','1');
    }
    sessionStorage.setItem('shellBonusPrompted','1');
  }, values);
  await page.goto(`/world/index.html?debug=1&activityFixture=unavailable&trafficSeed=${seed}${profile ? `&trafficProfile=${profile}` : ''}`);
  await readyTraffic(page);
  return values;
}
async function readyTraffic(page) {
  await expect(page.locator('#floor-canvas')).toHaveAttribute('aria-busy','false',{timeout:15000});
  await expect.poll(async()=>Boolean(await traffic(page))).toBe(true);
  await page.locator('canvas').focus();
}
async function storage(page) { return page.evaluate(()=>Object.fromEntries(Object.entries(localStorage))); }
module.exports = { snap, traffic, openTraffic, readyTraffic, storage };
