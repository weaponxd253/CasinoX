const { enterLounge } = require('./helpers/main-casino-world');
const { test, expect } = require('@playwright/test');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { savedResort } = require('./helpers/saved-resort');
const { POINTS, currentWorld } = require('./helpers/lobby-world');
const { loungeReady, loungeSnapshot, walkLoungeTo, LOUNGE_POINTS } = require('./helpers/lounge-world');
const { dealerBustDeck } = require('./helpers/blackjack-deck');

// VS Code's integrated browser can run local ES modules. Permit that only in
// these isolated test browsers to reproduce its file:// launch environment.
test.use({ launchOptions: { args: ['--allow-file-access-from-files'] } });

for (const host of ['floor', 'world']) {
  test(`${host} file URL makes the rendered blackjack iframe clickable and retains its paid hand`, async ({ page }) => {
    const seed = await seedStorage(page);
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    let url = pathToFileURL(path.resolve(__dirname, `../${host}/index.html`)).href;
    // Match VS Code's encoded drive-letter form as well as a standard file URL.
    if (host === 'world') url = url.replace(/^file:\/\/\/([a-z]):/i, (_, drive) => `file:///${drive.toLowerCase()}%3A`);
    await page.goto(url + '?debug=1');
    await openTable(page, host);
    expect(await page.evaluate(() => location.protocol)).toBe('file:');
    await exerciseHand(page, host);
    expect(errors).toEqual([]);
    const saved = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
    for (const key of ['hotelGameState', 'hotelGuestPool', 'casinoWorldState', 'customLegacyKey']) expect(saved[key], key).toBe(seed[key]);
  });
}

test('a bridge that starts after DOMContentLoaded still enables the loaded frame', async ({ page }) => {
  await seedStorage(page);
  const source = fs.readFileSync(path.resolve(__dirname, '../blackjack/floor-bridge.js'), 'utf8');
  await page.route('**/blackjack/floor-bridge.js', r => r.fulfill({ contentType: 'text/javascript',
    body: `document.addEventListener('DOMContentLoaded', () => setTimeout(() => {\n${source}\n}, 0), {once:true});` }));
  await page.goto('/floor/index.html?debug=1'); await openTable(page, 'floor');
  await exerciseHand(page, 'floor');
});

test('a dropped initial ready message is recovered by the host load probe without reloading the hand', async ({ page }) => {
  await seedStorage(page);
  await page.addInitScript(() => {
    window.addEventListener('message', event => {
      if (!window.bridgeReadyDropped && event.data?.channel === 'casino-floor:blackjack' && event.data.type === 'ready') {
        window.bridgeReadyDropped = true; event.stopImmediatePropagation();
      }
    }, true);
  });
  await page.goto('/floor/index.html?debug=1'); await openTable(page, 'floor');
  await exerciseHand(page, 'floor');
  expect(await page.evaluate(() => window.bridgeReadyDropped)).toBe(true);
});

test('an unexpected local document in the same frame cannot send host close commands', async ({ page }) => {
  await seedStorage(page);
  await page.goto(pathToFileURL(path.resolve(__dirname, '../floor/index.html')).href + '?debug=1');
  await openTable(page, 'floor');
  await expect(page.locator('#blackjack-status')).toContainText('Your hand stays');
  const frame = page.frameLocator('#blackjack-frame');
  await frame.locator('body').evaluate(() => { location.href = '../index.html'; });
  await expect(frame.locator('#new-game')).toBeVisible();
  await frame.locator('body').evaluate(() => parent.postMessage({ channel: 'casino-floor:blackjack', type: 'close' }, '*'));
  await page.waitForTimeout(80);
  await expect(page.locator('#blackjack-overlay')).toBeVisible();
  expect((await loungeSnapshot(page)).paused).toBe(true);
  await page.getByRole('button', { name: 'Return to floor' }).click();
  await expect(page.locator('canvas')).toBeFocused();
});

async function seedStorage(page) {
  const seed = { ...savedResort(), casinoWorldState: currentWorld(POINTS.casino) };
  await page.addInitScript(values => {
    if (!sessionStorage.getItem('bridgeTestSeeded')) {
      Object.entries(values).forEach(([k, v]) => localStorage.setItem(k, v));
      sessionStorage.setItem('bridgeTestSeeded', '1');
    }
  }, seed); return seed;
}
async function openTable(page, host) {
  await loungeReady(page);
  if (host === 'world') { await enterLounge(page); await expect.poll(async () => (await loungeSnapshot(page)).scene).toBe('CasinoRoom'); await loungeReady(page); }
  await walkLoungeTo(page, LOUNGE_POINTS.table); await page.keyboard.press('e');
  await expect(page.locator('#blackjack-overlay')).toBeVisible();
}
async function exerciseHand(page, host) {
  const table = page.frameLocator('#blackjack-frame');
  await expect(table.locator('.chip-btn[data-value="5"]')).toBeVisible();
  await expect(page.locator('#blackjack-status')).toContainText('Your hand stays');
  await expect(page.locator('#blackjack-frame')).not.toHaveAttribute('inert', '');
  await dealerBustDeck(table); await table.locator('#speed-range').fill('2');
  await table.locator('.chip-btn[data-value="5"]').click();
  await expect(table.locator('#bet-amount')).toHaveText('$5.00');
  await table.locator('#deal-button').click(); await expect(table.locator('#result-message')).toHaveText('Your move…');
  const wallet = page.locator(host === 'world' ? '#world-balance' : '#floor-balance');
  await expect(wallet).toHaveText('245.25');
  await table.locator('body').evaluate(body => { body.dataset.bridgeHand = 'retained'; });
  const parked = (await loungeSnapshot(page)).player;
  await page.getByRole('button', { name: 'Return to floor' }).click();
  await expect(page.locator('canvas')).toBeFocused();
  expect((await loungeSnapshot(page)).player).toEqual(parked);
  await expect(page.locator(host === 'world' ? '#world-interact' : '#interact-button')).toBeEnabled();
  await page.keyboard.press('e');
  await expect(table.locator('body')).toHaveAttribute('data-bridge-hand', 'retained');
  await expect(wallet).toHaveText('245.25');
  await table.locator('#stand-button').click();
  await expect(table.locator('#result-message')).toHaveText('Dealer busts — you win!');
  await expect(wallet).toHaveText('255.25'); await expect(table.locator('#leaderboard-list li')).toHaveCount(1);
  await table.locator('#speed-range').focus(); await page.keyboard.press('Escape');
  await expect(page.locator('#blackjack-overlay')).not.toBeVisible(); await expect(page.locator('canvas')).toBeFocused();
}
