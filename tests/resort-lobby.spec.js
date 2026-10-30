const { test, expect } = require('@playwright/test');
const { savedResort } = require('./helpers/saved-resort');
const { dealerBustDeck } = require('./helpers/blackjack-deck');
const { POINTS, currentWorld, walkTo } = require('./helpers/lobby-world');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('shellBonusPrompted', '1'));
  await page.route(/https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com|cdnjs\.cloudflare\.com|randomuser\.me)\//, route => route.abort());
  await page.route('https://deckofcardsapi.com/api/deck/**', route => {
    const url = new URL(route.request().url());
    const card = value => ({ value, suit: 'HEARTS', image: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="80" height="112"></svg>' });
    return route.fulfill({ json: url.pathname.includes('/shuffle/') ? { success: true, deck_id: 'phase2' }
      : { success: true, cards: (url.searchParams.get('count') === '4' ? ['10', '9', '8', '7'] : ['6']).map(card) } });
  });
});

test('HUD reads the hotel snapshot and shared chips without starting a second simulation', async ({ page }) => {
  const seed = await openWorld(page);
  await expect(page.locator('#world-resort')).toHaveText('Existing Resort');
  await expect(page.locator('#world-hotel-cash')).toHaveText('4321.00');
  await expect(page.locator('#world-balance')).toHaveText('250.25');
  expect(await page.evaluate(() => [typeof HotelState, typeof HotelEngine, Phaser.VERSION])).toEqual(['undefined', 'undefined', '3.90.0']);
  expect(await storage(page)).toEqual(seed);
});

test('receptionist requires proximity, offers contextual dialogue, pauses movement and restores keyboard focus', async ({ page }, testInfo) => {
  const seed = await openWorld(page, POINTS.beforeReception);
  await page.keyboard.press('e');
  await expect(page.locator('#world-dialogue')).not.toBeVisible();
  await moveUntil(page, 'w', s => s.interaction === 'receptionist');
  await expect(page.locator('#world-interact')).toHaveText('E · Talk to receptionist');
  const parked = (await snapshot(page)).player;
  await page.keyboard.press('e');
  const dialogue = page.locator('#world-dialogue');
  await expect(dialogue).toBeVisible();
  await expect(dialogue).toContainText('Welcome back, owner of Existing Resort');
  await expect(dialogue.getByRole('button', { name: 'Back to exploring' })).toBeFocused();
  expect((await snapshot(page)).paused).toBe(true);
  await expect(page.locator('#world-interact')).toBeDisabled();
  await hold(page, 'w', 200); await page.keyboard.press('m');
  expect((await snapshot(page)).player).toEqual(parked);
  await expect(page).toHaveURL(/\/world\/index.html\?debug=1$/);
  await dialogue.getByRole('button', { name: 'How do I manage the resort?' }).click();
  await expect(dialogue.locator('#dialogue-text')).toContainText('existing Hotel Management dashboard');
  await dialogue.getByRole('button', { name: 'About hotel cash and chips' }).click();
  await expect(dialogue.locator('#dialogue-text')).toContainText('separate balance');
  await page.screenshot({ path: testInfo.outputPath('receptionist.png'), fullPage: true });
  await page.keyboard.press('Escape');
  await expect(dialogue).not.toBeVisible();
  await expect(page.locator('canvas')).toBeFocused();
  expect((await snapshot(page)).player).toEqual(parked);
  await expect(page.locator('#world-interact')).toBeEnabled();
  await page.locator('#world-interact').click();
  await dialogue.getByRole('button', { name: 'Where can I go?' }).click();
  await expect(dialogue.locator('#dialogue-text')).toContainText('hotel interior preview');
  await dialogue.getByRole('button', { name: 'Back to exploring' }).click();
  await moveUntil(page, 's', s => s.player.y > parked.y + 25);
  await expectLegacyUnchanged(page, seed);
});

test('fresh reception and hotel preview do not create a hotel save or guest simulation', async ({ page }) => {
  test.setTimeout(60000);
  await openWorld(page, POINTS.reception, {});
  await page.keyboard.press('e');
  await expect(page.locator('#dialogue-text')).toContainText('ready to set up the hotel');
  await page.keyboard.press('Escape');
  await walkTo(page, POINTS.hotel);
  await page.locator('#world-interact').click();
  await expectScene(page, 'HotelInterior');
  await expect(page.locator('#world-hotel-cash')).toHaveText('Not created');
  expect(Object.keys(await storage(page)).sort()).toEqual(['casinoBalance', 'casinoWorldState']);
});

test('hotel door, directory object and E exit share prompts and return to the exact lobby point', async ({ page }, testInfo) => {
  const seed = await openWorld(page, { x: 856, y: 355, facing: 'up' });
  await page.keyboard.press('e'); expect((await snapshot(page)).scene).toBe('CentralLobby');
  await moveUntil(page, 'w', s => s.interaction === 'hotel');
  const entry = (await snapshot(page)).player;
  await expect(page.locator('#world-interact')).toHaveText('E · Enter hotel interior');
  await page.keyboard.press('e'); await expectScene(page, 'HotelInterior');
  await expect(page.locator('canvas')).toBeFocused();
  await moveUntil(page, 'w', s => s.interaction === 'directory');
  await expect(page.locator('#world-interact')).toHaveText('E · Read hotel directory');
  const parked = (await snapshot(page)).player;
  await page.keyboard.press('e');
  await expect(page.locator('#world-dialogue')).toContainText('not available here yet');
  expect((await snapshot(page)).paused).toBe(true);
  await page.keyboard.press('Escape');
  expect((await snapshot(page)).scene).toBe('HotelInterior');
  expect((await snapshot(page)).player).toEqual(parked);
  await moveUntil(page, 's', s => s.interaction === 'hotel-lobby');
  await page.screenshot({ path: testInfo.outputPath('hotel-interior.png'), fullPage: true });
  await page.keyboard.press('e'); await expectScene(page, 'CentralLobby');
  expect((await snapshot(page)).player).toEqual(entry);
  await expect(page.locator('canvas')).toBeFocused();
  await expectLegacyUnchanged(page, seed);
});

test('hotel collision and repeated return via Escape or button leave no stuck movement or duplicate handlers', async ({ page }) => {
  const seed = await openWorld(page, POINTS.hotel);
  const entry = (await snapshot(page)).player;
  for (let visit = 0; visit < 3; visit++) {
    await expect(page.locator('#world-interact')).toBeEnabled();
    await page.keyboard.press('e'); await expectScene(page, 'HotelInterior');
    if (visit === 0) {
      await moveUntil(page, 's', s => s.player.y >= 554); await hold(page, 's', 150);
      expect((await snapshot(page)).player.y).toBeCloseTo(554, 0);
    }
    if (visit % 2) await page.locator('#world-return').click();
    else await page.keyboard.press('Escape');
    await expectScene(page, 'CentralLobby');
    expect((await snapshot(page)).player).toEqual(entry);
    await expect(page.locator('canvas')).toBeFocused();
    await expect(page.locator('#world-return')).not.toBeVisible();
  }
  await moveUntil(page, 's', s => s.player.y > entry.y + 25);
  await expectLegacyUnchanged(page, seed);
});

test('reload from the hotel and title Continue preserve the lobby checkpoint and unknown metadata', async ({ page }) => {
  const seed = await openWorld(page, POINTS.hotel);
  const entry = (await snapshot(page)).player;
  await page.keyboard.press('e'); await expectScene(page, 'HotelInterior');
  await moveUntil(page, 'a', s => s.player.x < 420);
  await page.reload(); await ready(page);
  expect((await snapshot(page)).scene).toBe('CentralLobby');
  expect((await snapshot(page)).player).toEqual(entry);
  await page.getByRole('link', { name: 'Title', exact: true }).click();
  await page.locator('#continue-resort').click();
  await ready(page);
  expect(JSON.parse((await storage(page)).casinoWorldState)).toEqual(JSON.parse(seed.casinoWorldState));
  await expectLegacyUnchanged(page, seed);
});

test('office opens the original dashboard; a staff change persists after the exact lobby return', async ({ page }) => {
  const seed = await openWorld(page, POINTS.office);
  const entry = (await snapshot(page)).player;
  await expect(page.locator('#world-interact')).toContainText('manager’s office');
  await page.keyboard.press('e');
  await expect(page).toHaveURL(/\/hotel\/index.html$/);
  await expect(page.locator('#hotel-name-display')).toContainText('Existing Resort');
  await page.locator('.mgmt-tab[data-tab="staff"]').click();
  await page.locator('[data-staff-view="roster"]').first().click();
  const rest = page.locator('[data-staff-action="rest"]').first();
  const memberId = await rest.getAttribute('data-staff-id');
  await rest.click();
  await expect.poll(() => page.evaluate(id => HotelState.get().staff.roster.find(member => member.id === id).assignment, memberId)).toBe('rest');
  const hotelAfter = await page.evaluate(() => localStorage.getItem('hotelGameState'));
  await page.getByRole('link', { name: 'Return to Central Lobby' }).click(); await ready(page);
  expect(JSON.parse((await storage(page)).casinoWorldState).lobby).toMatchObject(entry);
  expect((await storage(page)).hotelGameState).toBe(hotelAfter);
  expect((await storage(page)).casinoBalance).toBe(seed.casinoBalance);
  expect(JSON.parse((await storage(page)).hotelGameState).staff.roster.find(member => member.id === memberId).assignment).toBe('rest');
  await expect(page.locator('canvas')).toBeFocused();
});

test('M from the hotel uses the existing management route and returns to the same lobby checkpoint', async ({ page }) => {
  const seed = await openWorld(page, POINTS.hotel);
  await page.keyboard.press('e'); await expectScene(page, 'HotelInterior');
  await page.keyboard.press('m');
  await expect(page).toHaveURL(/\/hotel\/index.html$/);
  await page.getByRole('link', { name: 'Return to Central Lobby' }).click(); await ready(page);
  expect((await storage(page)).casinoWorldState).toBe(seed.casinoWorldState);
  await expect(page.locator('canvas')).toBeFocused();
});

test('HUD follows external hotel saves read-only and a save error during dialogue cannot resume the world', async ({ page, context }) => {
  const seed = await openWorld(page, POINTS.reception);
  const other = await context.newPage(); await other.goto('/');
  const updated = JSON.parse(seed.hotelGameState); updated.currencies.hotelCash = 4987;
  await other.evaluate(raw => localStorage.setItem('hotelGameState', raw), JSON.stringify(updated));
  await expect(page.locator('#world-hotel-cash')).toHaveText('4987.00');
  await page.bringToFront(); await page.locator('canvas').focus(); await page.keyboard.press('e');
  await expect(page.locator('#world-dialogue')).toBeVisible();
  const corrupt = JSON.stringify({ version: 99 });
  await other.evaluate(raw => localStorage.setItem('casinoWorldState', raw), corrupt);
  await expect(page.locator('#world-errors')).toContainText('unsupported');
  await page.locator('[data-dialogue-close]').click();
  expect((await snapshot(page)).paused).toBe(true);
  await expect(page.locator('#world-interact')).toBeDisabled();
  expect((await storage(page)).casinoWorldState).toBe(corrupt);
  expect((await storage(page)).hotelGameState).toBe(JSON.stringify(updated));
  await other.close();
});

test('walking across mapped door approaches preserves valid current lobby coordinates', async ({ page }) => {
  const seed = await openWorld(page, POINTS.office);
  expect((await snapshot(page)).failed).toBe(false);
  expect((await storage(page)).casinoWorldState).toBe(seed.casinoWorldState);
  await moveUntil(page, 's', s => s.player.y > 265);
  await page.reload(); await ready(page);
  expect((await snapshot(page)).failed).toBe(false);
  await expectLegacyUnchanged(page, seed);
});

test('a paid blackjack hand survives a hotel visit without another deduction or payout', async ({ page }) => {
  test.setTimeout(90000);
  await openWorld(page, POINTS.casino);
  await page.keyboard.press('e'); await expectScene(page, 'CasinoRoom');
  await moveUntil(page, 'w', s => s.interaction === 'blackjack');
  await page.keyboard.press('e');
  const table = page.frameLocator('#blackjack-frame');
  await expect(page.locator('#blackjack-status')).toContainText('Your hand stays');
  await dealerBustDeck(table);
  await table.locator('#speed-range').fill('2');
  await table.locator('.chip-btn[data-value="5"]').click(); await table.locator('#deal-button').click();
  await expect(table.locator('#result-message')).toHaveText('Your move…');
  await expect(page.locator('#world-balance')).toHaveText('245.25');
  await table.locator('body').evaluate(body => { body.dataset.phase2Hand = 'kept'; });
  await page.getByRole('button', { name: 'Return to floor' }).click();
  await page.locator('#world-return').click(); await expectScene(page, 'CentralLobby');
  await walkTo(page, POINTS.hotel);
  await page.keyboard.press('e'); await expectScene(page, 'HotelInterior');
  await page.keyboard.press('Escape'); await expectScene(page, 'CentralLobby');
  await walkTo(page, POINTS.casino);
  await page.keyboard.press('e'); await expectScene(page, 'CasinoRoom');
  await expect(page.locator('#world-interact')).toBeEnabled(); await page.keyboard.press('e');
  await expect(table.locator('body')).toHaveAttribute('data-phase2-hand', 'kept');
  await expect(page.locator('#world-balance')).toHaveText('245.25');
  await table.locator('#stand-button').click();
  await expect(table.locator('#result-message')).toHaveText('Dealer busts — you win!');
  await expect(page.locator('#world-balance')).toHaveText('255.25');
  await expect(table.locator('#leaderboard-list li')).toHaveCount(1);
  expect(JSON.parse((await storage(page)).hotelGameState).currencies.hotelCash).toBe(4321);
});

async function openWorld(page, position = POINTS.spawn, legacy = savedResort()) {
  const seed = { ...legacy, casinoWorldState: currentWorld({ ...position, futureLabel: 'keep this metadata' }, { customMetadata: 'preserved' }) };
  await page.addInitScript(values => {
    if (!sessionStorage.getItem('resortTestSeeded')) {
      Object.entries(values).forEach(([key, value]) => localStorage.setItem(key, value));
      sessionStorage.setItem('resortTestSeeded', '1');
    }
  }, seed);
  await page.goto('/world/index.html?debug=1'); await ready(page); await page.locator('canvas').focus();
  return seed;
}
async function ready(page) { await expect(page.locator('#floor-canvas')).toHaveAttribute('aria-busy', 'false'); await expect(page.locator('canvas')).toBeVisible(); }
async function snapshot(page) { return page.evaluate(() => CasinoWorldDebug.snapshot()); }
async function storage(page) { return page.evaluate(() => Object.fromEntries(Object.entries(localStorage))); }
async function expectLegacyUnchanged(page, seed) {
  const current = await storage(page);
  for (const [key, value] of Object.entries(seed)) if (key !== 'casinoWorldState') expect(current[key], key).toBe(value);
}
async function expectScene(page, scene) {
  await expect.poll(async () => (await snapshot(page)).scene).toBe(scene);
  // Interior spawns need not be within interaction range. Return remains available.
  await expect(page.locator(scene === 'CentralLobby' ? '#world-interact' : '#world-return')).toBeEnabled();
}
async function moveUntil(page, key, predicate) {
  await page.keyboard.down(key);
  try { await expect.poll(async () => predicate(await snapshot(page)), { intervals: [30], timeout: 7000 }).toBe(true); }
  finally { await page.keyboard.up(key); }
  await expect.poll(async () => (await snapshot(page)).velocity).toEqual({ x: 0, y: 0 });
}
async function hold(page, key, duration) { await page.keyboard.down(key); await page.waitForTimeout(duration); await page.keyboard.up(key); }
