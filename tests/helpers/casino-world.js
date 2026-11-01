const { expect } = require('@playwright/test');
const { savedResort } = require('./saved-resort');
const { currentWorld, POINTS } = require('./lobby-world');
const { enterMain, walkMainTo, snapshot, mainReady } = require('./main-casino-world');

async function openCasino(page, { xp = 17, unlocked = true } = {}) {
  const seed = { ...savedResort(), casinoWorldState: currentWorld(POINTS.casino, { phase6bSentinel: 'keep' }) };
  const hotel = JSON.parse(seed.hotelGameState);
  if (unlocked) { hotel.departments.casino.level = 2; hotel.currencies.reputation = 6; }
  seed.hotelGameState = JSON.stringify(hotel);
  seed.casinoProfile = JSON.stringify({ ...JSON.parse(seed.casinoProfile), xp });
  await page.addInitScript(values => {
    if (!sessionStorage.getItem('phase6bSeeded')) {
      for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value);
      sessionStorage.setItem('phase6bSeeded', '1');
    }
    sessionStorage.setItem('shellBonusPrompted', '1');
  }, seed);
  await page.goto('/world/index.html?debug=1&trafficSeed=19');
  await mainReady(page); await enterMain(page);
  await page.evaluate(() => { if (window.phase6bWrites) window.phase6bWrites.length = 0; });
  return seed;
}
async function approach(page, id) {
  const p = await page.evaluate(async id => (await import('/world/casino-attractions.js'))
    .CASINO_ATTRACTIONS.find(a => a.id === id).approach, id);
  await walkMainTo(page, p);
  await expect.poll(async () => (await snapshot(page)).interaction).toBe(id);
  await expect(page.locator('#world-interact')).toBeEnabled();
}
const storage = page => page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
async function launchGame(page, id) {
  await approach(page, id); const pose = (await snapshot(page)).player;
  await page.keyboard.press('e'); await expect(page.locator('#casino-game-overlay')).toBeVisible();
  await expect.poll(async () => (await snapshot(page)).casinoGameHost.ready, { timeout: 15000 }).toBe(true);
  return { frame: page.frameLocator('#casino-game-frame'), pose };
}
async function closeGame(page) {
  await page.locator('[data-game-close]').click();
  await expect(page.locator('#casino-game-overlay')).not.toBeVisible();
  await expect(page.locator('canvas')).toBeFocused();
  await expect.poll(async () => (await snapshot(page)).paused).toBe(false);
}
async function auditWrites(page) {
  await page.addInitScript(() => {
    window.phase6bWrites = [];
    const native = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      const result = native.call(this, key, value);
      const record = { source: location.pathname, key, value: key === 'casinoBalance' ? String(value) : null };
      try { (parent.phase6bWrites ?? window.phase6bWrites).push(record); } catch (_) { window.phase6bWrites.push(record); }
      return result;
    };
  });
}
const balance = page => page.evaluate(() => CasinoWallet.get());
const moneyWrites = page => page.evaluate(() => phase6bWrites.filter(w => w.key === 'casinoBalance'));
module.exports = { openCasino, approach, storage, snapshot, launchGame, closeGame, auditWrites, balance, moneyWrites };
