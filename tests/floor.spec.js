const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('shellBonusPrompted', '1'));
  // Real local Phaser and real blackjack code, with only remote assets/API mocked.
  await page.route(/https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com|cdnjs\.cloudflare\.com)\//, route => route.abort());
  await page.route('https://deckofcardsapi.com/api/deck/**', route => {
    const url = new URL(route.request().url());
    if (url.pathname.includes('/shuffle/')) {
      return route.fulfill({ json: { success: true, deck_id: 'floor-test' } });
    }
    const cards = url.searchParams.get('count') === '4'
      ? [card('10', 'HEARTS'), card('9', 'CLUBS'), card('8', 'SPADES'), card('7', 'DIAMONDS')]
      : [card('6', 'CLUBS')];
    return route.fulfill({ json: { success: true, cards } });
  });
});

test('casino lobby links to the room and the normal page starts without diagnostics', async ({ page }, testInfo) => {
  await page.goto('/casino.html');
  await page.locator('a[href="floor/index.html"]').click();
  await expect(page).toHaveURL(/\/floor\/index\.html$/);
  await expect(page.locator('#floor-canvas')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('#floor-canvas canvas')).toBeFocused();
  expect(await page.evaluate(() => typeof CasinoFloorDebug)).toBe('undefined');
  await expect(page.locator('#floor-balance')).toHaveText('100.00');
  await page.screenshot({ path: testInfo.outputPath('room.png'), fullPage: true });
});

test('WASD moves in all four directions and diagonals keep a consistent speed', async ({ page }) => {
  await openRoom(page);
  const start = (await snapshot(page)).player;
  await moveUntil(page, 'd', state => state.player.x > start.x + 65);
  await moveUntil(page, 'a', state => state.player.x < start.x + 5);
  await moveUntil(page, 's', state => state.player.y > start.y + 45);
  await moveUntil(page, 'w', state => state.player.y < start.y + 5);
  await moveUntil(page, 'ArrowRight', state => state.player.x > start.x + 35);
  await moveUntil(page, 'ArrowLeft', state => state.player.x < start.x + 5);
  await page.keyboard.down('d');
  await expect.poll(async () => (await snapshot(page)).velocity.x).toBeGreaterThan(0);
  const straight = (await snapshot(page)).velocity;
  await page.keyboard.down('w');
  await expect.poll(async () => (await snapshot(page)).velocity.y).toBeLessThan(0);
  const diagonal = (await snapshot(page)).velocity;
  expect(Math.hypot(diagonal.x, diagonal.y)).toBeCloseTo(Math.hypot(straight.x, straight.y), 3);
  expect(diagonal.x).toBeCloseTo(-diagonal.y, 3);
  await page.keyboard.up('d');
  await page.keyboard.up('w');
});

test('outer walls stop the player and moving away still works', async ({ page }) => {
  test.setTimeout(45_000);
  await openRoom(page);
  await moveUntil(page, 's', state => state.player.y >= 554);
  await hold(page, ['s'], 150);
  expect((await snapshot(page)).player.y).toBeCloseTo(554, 0);
  await moveUntil(page, 'd', state => state.player.x >= 914);
  await hold(page, ['d'], 150);
  expect((await snapshot(page)).player.x).toBeCloseTo(914, 0);
  await moveUntil(page, 'w', state => state.player.y <= 46);
  await hold(page, ['w'], 150);
  expect((await snapshot(page)).player.y).toBeCloseTo(46, 0);
  await moveUntil(page, 'a', state => state.player.x <= 46);
  await hold(page, ['a'], 150);
  expect((await snapshot(page)).player.x).toBeCloseTo(46, 0);
  await moveUntil(page, 's', state => state.player.y > 100);
});

test('the interior partition is solid', async ({ page }) => {
  await openRoom(page);
  await moveUntil(page, 'a', state => state.player.x <= 260);
  await hold(page, ['a'], 150);
  expect((await snapshot(page)).player.x).toBeCloseTo(260, 0);
  await moveUntil(page, 'd', state => state.player.x > 300);
});

test('the table is solid and E only opens inside its interaction range', async ({ page }) => {
  await openRoom(page);
  await page.keyboard.press('e');
  await expect(page.locator('#blackjack-overlay')).not.toBeVisible();
  await expect(page.locator('#interact-button')).toBeDisabled();
  await moveUntil(page, 'w', state => state.player.y <= 314);
  await hold(page, ['w'], 150);
  expect((await snapshot(page)).player.y).toBeCloseTo(314, 0);
  await expect(page.locator('#interact-button')).toBeEnabled();
  await page.keyboard.press('e');
  await expect(page.locator('#blackjack-overlay')).toBeVisible();
});

test('E opens the existing game, pauses movement, retains a hand and shares its payout', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await openRoom(page);
  await approachTable(page);
  // Open while a movement key is still held: no drift or stuck key after return.
  await page.keyboard.down('w');
  await page.keyboard.press('e');
  await expect(page.locator('#blackjack-overlay')).toBeVisible();
  await page.keyboard.up('w');
  await expect.poll(async () => (await snapshot(page)).paused).toBe(true);
  const parked = (await snapshot(page)).player;
  await hold(page, ['a', 's'], 250);
  expect((await snapshot(page)).player).toEqual(parked);

  const table = await blackjackUI(page);
  await expect(table.locator('#deal-button')).toBeVisible();
  await table.locator('#speed-range').fill('2');
  await table.locator('.chip-btn[data-value="1"]').click();
  await table.locator('#deal-button').click();
  await expect(page.locator('#floor-balance')).toHaveText('99.00');
  await expect(table.locator('#result-message')).toHaveText('Your move…');
  await page.screenshot({ path: testInfo.outputPath('blackjack-overlay.png'), fullPage: true });
  await expect(table.locator('#shell-balance-amt')).toHaveText('99.00');
  await table.locator('body').evaluate(body => { body.dataset.frameLifetime = 'same-hand'; });

  await page.getByRole('button', { name: 'Return to floor' }).click();
  await expect(page.locator('#blackjack-overlay')).not.toBeVisible();
  await expect.poll(async () => (await snapshot(page)).paused).toBe(false);
  await expect(page.locator('#floor-canvas canvas')).toBeFocused();
  expect((await snapshot(page)).player).toEqual(parked);
  await page.waitForTimeout(200);
  expect((await snapshot(page)).player).toEqual(parked);

  await page.keyboard.press('e');
  await expect(table.locator('body')).toHaveAttribute('data-frame-lifetime', 'same-hand');
  await expect(table.locator('#player-cards .card')).toHaveCount(2);
  await expect(table.locator('#deal-button')).toBeDisabled();
  await expect(table.locator('#stand-button')).toBeEnabled();
  await table.locator('#stand-button').click();
  await expect(table.locator('#result-message')).toHaveText('Dealer busts — you win!');
  await expect(table.locator('#shell-balance-amt')).toHaveText('101.00');
  await expect(page.locator('#floor-balance')).toHaveText('101.00');
  expect(await page.evaluate(() => localStorage.getItem('casinoBalance'))).toBe('101');

  // Escape from inside the iframe reaches the host and restores movement/focus.
  await table.locator('#speed-range').focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('#blackjack-overlay')).not.toBeVisible();
  expect((await snapshot(page)).player).toEqual(parked);
  await expect(page.locator('#floor-canvas canvas')).toBeFocused();
  await moveUntil(page, 's', state => state.player.y > parked.y + 35);
  expect(errors).toEqual([]);
});

test('wallet syncs both directions and across tabs; only the hosted frame can request close', async ({ page, context }) => {
  await openRoom(page);
  await approachTable(page);
  await page.locator('#interact-button').click();
  const table = await blackjackUI(page);
  await expect(table.locator('#shell-balance-amt')).toHaveText('100.00');
  await page.evaluate(() => CasinoWallet.add(7));
  await expect(table.locator('#shell-balance-amt')).toHaveText('107.00');
  await table.locator('body').evaluate(() => CasinoWallet.deduct(2));
  await expect(page.locator('#floor-balance')).toHaveText('105.00');

  // A same-origin message from another source must not control this dialog.
  await page.evaluate(() => window.postMessage({ channel: 'casino-floor:blackjack', type: 'close' }, location.origin));
  await page.waitForTimeout(80);
  await expect(page.locator('#blackjack-overlay')).toBeVisible();
  const other = await context.newPage();
  await other.goto('/coinflip/index.html');
  await other.evaluate(() => CasinoWallet.add(3));
  await expect(page.locator('#floor-balance')).toHaveText('108.00');
  await expect(table.locator('#shell-balance-amt')).toHaveText('108.00');
  await other.close();

  await page.getByRole('button', { name: 'Return to floor' }).click();
  await page.locator('#interact-button').click();
  // The pre-existing out-of-chips return link is adapted to leave the overlay.
  await table.locator('body').evaluate(() => CasinoShell.gameOver());
  await table.locator('#shell-modal a').click();
  await expect(page.locator('#blackjack-overlay')).not.toBeVisible();
  await expect(page).toHaveURL(/\/floor\/index\.html\?debug=1$/);
  expect((await snapshot(page)).balance).toBe(108);
});

test('rapid closing and reopening keeps the world paused for the new visit', async ({ page }) => {
  await openRoom(page);
  await approachTable(page);
  await page.locator('#interact-button').click();
  await blackjackUI(page);
  const parked = (await snapshot(page)).player;
  await page.evaluate(() => {
    document.querySelector('#blackjack-overlay [data-close]').click();
    document.getElementById('interact-button').click();
  });
  await page.waitForTimeout(150);
  await expect(page.locator('#blackjack-overlay')).toBeVisible();
  expect((await snapshot(page)).paused).toBe(true);
  expect((await snapshot(page)).player).toEqual(parked);
  await page.getByRole('button', { name: 'Return to floor' }).click();
  await moveUntil(page, 's', state => state.player.y > parked.y + 25);
});

test('a deck connection failure uses the existing blackjack refund behavior', async ({ page }) => {
  await page.route('https://deckofcardsapi.com/api/deck/**', route => route.abort());
  await openRoom(page);
  await approachTable(page);
  await page.keyboard.press('e');
  const table = await blackjackUI(page);
  await table.locator('.chip-btn[data-value="1"]').click();
  await table.locator('#deal-button').click();
  await expect(table.locator('#result-message')).toHaveText('Could not connect. Returning your bet.');
  await expect(table.locator('#deal-button')).toBeEnabled();
  await expect(page.locator('#floor-balance')).toHaveText('100.00');
  await page.getByRole('button', { name: 'Return to floor' }).click();
  await expect.poll(async () => (await snapshot(page)).paused).toBe(false);
});

async function openRoom(page) {
  await page.goto('/floor/index.html?debug=1');
  await expect(page.locator('#floor-canvas')).toHaveAttribute('aria-busy', 'false');
  await expect.poll(async () => (await snapshot(page))?.ready).toBe(true);
  await page.locator('#floor-canvas canvas').focus();
}

async function blackjackUI(page) {
  await expect(page.locator('#blackjack-status')).toHaveText('Your hand stays at this table when you return to the floor.');
  await expect(page.locator('#blackjack-frame')).not.toHaveAttribute('inert', '');
  return page.frameLocator('#blackjack-frame');
}

async function snapshot(page) {
  return page.evaluate(() => window.CasinoFloorDebug?.snapshot());
}

async function approachTable(page) {
  await moveUntil(page, 'w', state => state.nearTable);
  await expect(page.locator('#interact-button')).toBeEnabled();
}

async function moveUntil(page, key, predicate) {
  await page.keyboard.down(key);
  try {
    await expect.poll(async () => predicate(await snapshot(page)), { intervals: [30], timeout: 10_000 }).toBe(true);
  } finally {
    await page.keyboard.up(key);
  }
  await page.waitForTimeout(60);
}

async function hold(page, keys, duration) {
  for (const key of keys) await page.keyboard.down(key);
  await page.waitForTimeout(duration);
  for (const key of keys) await page.keyboard.up(key);
  await page.waitForTimeout(60);
}

function card(value, suit) {
  return { value, suit, image: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="80" height="112"></svg>' };
}
