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
    return route.fulfill({ json: url.pathname.includes('/shuffle/')
      ? { success: true, deck_id: 'world-test' }
      : { success: true, cards: url.searchParams.get('count') === '4' ? ['10', '9', '8', '7'].map(card) : [card('6')] } });
  });
});

test('fresh title, New Game cancellation and Settings cancellation never create saves', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'The resort is yours.' })).toBeVisible();
  await expect(page.locator('#continue-resort')).toBeDisabled();
  await expect(page.locator('#new-game')).toBeEnabled();
  expect(await storage(page)).toEqual({});
  await page.locator('#new-game').click();
  await expect(page.locator('#new-game-dialog')).toContainText('New resort creation is not available');
  await page.locator('#new-game-dialog').getByRole('button', { name: 'Cancel' }).click();
  await page.locator('#settings-button').click();
  await page.locator('#settings-dialog').getByRole('button', { name: 'Cancel' }).click();
  expect(await storage(page)).toEqual({});
  await page.screenshot({ path: testInfo.outputPath('title.png'), fullPage: true });
});

test('Continue detects existing data without loading hotel state or changing any stored bytes', async ({ page }) => {
  const seed = savedResort();
  await seedStorage(page, seed);
  await page.goto('/');
  await expect(page.locator('#continue-resort')).toBeEnabled();
  expect(await page.evaluate(() => typeof HotelState)).toBe('undefined');
  expect(await storage(page)).toEqual(seed);
  await page.locator('#continue-resort').click();
  await worldReady(page);
  await expect(page).toHaveURL(/\/world\/index\.html$/);
  expect(await page.evaluate(() => typeof HotelState)).toBe('undefined');
  await expectLegacyUnchanged(page, seed);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('casinoWorldState')).version)).toBe(2);
});

test('New Game explores nondestructively, including an existing world location', async ({ page }) => {
  const seed = { ...savedResort(), casinoWorldState: worldSave({ x: 600, y: 480, facing: 'left' }) };
  await seedStorage(page, seed);
  await page.goto('/');
  await page.locator('#new-game').click();
  await page.locator('#explore-resort').click();
  await worldReady(page);
  await expectLegacyUnchanged(page, seed);
  expect((await storage(page)).casinoWorldState).toBe(seed.casinoWorldState);
});

test('fresh exploration creates only world metadata and the existing default chip wallet', async ({ page }) => {
  await page.goto('/');
  await page.locator('#new-game').click();
  await page.locator('#explore-resort').click();
  await worldReady(page);
  expect(Object.keys(await storage(page)).sort()).toEqual(['casinoBalance', 'casinoWorldState']);
  expect(await page.evaluate(() => localStorage.getItem('hotelGameState'))).toBeNull();
});

test('Settings changes only the two explicitly chosen preferences', async ({ page }) => {
  const seed = savedResort();
  await seedStorage(page, seed);
  await page.goto('/');
  await page.locator('#settings-button').click();
  await page.locator('#theme-setting').selectOption('light');
  await page.locator('#sound-setting').selectOption('on');
  await page.getByRole('button', { name: 'Save settings' }).click();
  expect(await storage(page)).toEqual({ ...seed, theme: 'light', casinoMuted: '0' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.locator('#continue-resort').click(); await worldReady(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expectLegacyUnchanged(page, { ...seed, theme: 'light', casinoMuted: '0' });
});

const badSaves = [
  ['malformed hotel JSON', 'hotelGameState', () => '{broken'],
  ['malformed hotel structure', 'hotelGameState', () => JSON.stringify({ meta: { version: 9 } })],
  ['future hotel version', 'hotelGameState', raw => { const s = JSON.parse(raw); s.meta.version = 99; return JSON.stringify(s); }],
  ['invalid chips', 'casinoBalance', () => 'not a balance'],
  ['malformed casino profile', 'casinoProfile', () => '{broken'],
  ['future casino profile', 'casinoProfile', raw => JSON.stringify({ ...JSON.parse(raw), version: 99 })],
  ['future guest pool', 'hotelGuestPool', raw => { const s = JSON.parse(raw); s.version = 99; return JSON.stringify(s); }],
  ['malformed world JSON', 'casinoWorldState', () => '{broken'],
  ['future world version', 'casinoWorldState', () => JSON.stringify({ version: 99 })],
  ['world position inside reception', 'casinoWorldState', () => worldSave({ x: 206, y: 180, facing: 'up' })],
];
for (const [label, key, corrupt] of badSaves) {
  test(`${label} is reported and never replaced by title or world`, async ({ page }) => {
    const seed = savedResort(); seed[key] = corrupt(seed[key]);
    await seedStorage(page, seed);
    await page.goto('/');
    await expect(page.locator('#save-errors')).toContainText(key);
    await expect(page.locator('#continue-resort')).toBeDisabled();
    await expect(page.locator('#new-game')).toBeDisabled();
    expect(await storage(page)).toEqual(seed);
    await page.goto('/world/index.html');
    await expect(page.locator('#world-errors')).toContainText(key);
    expect(await storage(page)).toEqual(seed);
  });
}

test('valid older hotel data is adopted without running its migration on Continue', async ({ page }) => {
  const seed = savedResort();
  const old = JSON.parse(seed.hotelGameState);
  old.meta.version = 1;
  for (const key of ['staff', 'calendar', 'shifts', 'onboarding']) delete old[key];
  seed.hotelGameState = JSON.stringify(old);
  await seedStorage(page, seed);
  await page.goto('/');
  await page.locator('#continue-resort').click();
  await worldReady(page);
  await expectLegacyUnchanged(page, seed);
});

for (const version of ['malformed', 99]) {
  test(`legacy hotel page also preserves a ${version} save`, async ({ page }) => {
    const seed = savedResort();
    if (version === 'malformed') seed.hotelGameState = '{broken';
    else { const s = JSON.parse(seed.hotelGameState); s.meta.version = version; seed.hotelGameState = JSON.stringify(s); }
    await seedStorage(page, seed);
    await page.goto('/hotel/index.html');
    await expect(page.locator('#save-error-dialog')).toBeVisible();
    expect(await page.evaluate(() => HotelState.get())).toBeNull();
    expect(await storage(page)).toEqual(seed);
  });
}

test('legacy casino pages preserve corrupt wallets instead of resetting them', async ({ page }) => {
  const seed = { ...savedResort(), casinoBalance: 'bad chips' };
  await seedStorage(page, seed);
  await page.goto('/blackjack/index.html');
  await expect(page.locator('#save-error-dialog')).toBeVisible();
  expect(await storage(page)).toEqual(seed);
});

test('owner moves with WASD and arrows; diagonal movement stays normalized', async ({ page }) => {
  await openWorld(page);
  const start = (await snapshot(page)).player;
  await moveUntil(page, 'd', s => s.player.x > start.x + 50);
  await moveUntil(page, 'a', s => s.player.x < start.x + 5);
  await moveUntil(page, 's', s => s.player.y > start.y + 35);
  await moveUntil(page, 'w', s => s.player.y < start.y + 5);
  await moveUntil(page, 'ArrowRight', s => s.player.x > start.x + 30);
  await moveUntil(page, 'ArrowLeft', s => s.player.x < start.x + 5);
  await page.keyboard.down('d');
  await expect.poll(async () => (await snapshot(page)).velocity.x).toBeGreaterThan(0);
  const straight = (await snapshot(page)).velocity;
  await page.keyboard.down('w');
  await expect.poll(async () => (await snapshot(page)).velocity.y).toBeLessThan(0);
  const diagonal = (await snapshot(page)).velocity;
  expect(Math.hypot(diagonal.x, diagonal.y)).toBeCloseTo(Math.hypot(straight.x, straight.y), 3);
  await page.keyboard.up('d'); await page.keyboard.up('w');
});

test('lobby walls and reception desk stop the owner', async ({ page }) => {
  test.setTimeout(60000);
  await openWorld(page);
  await moveUntil(page, 's', s => s.player.y >= 586);
  await hold(page, 's', 160);
  expect((await snapshot(page)).player.y).toBeCloseTo(586, 0);
  await walkTo(page, POINTS.reception);
  await hold(page, 'w', 250);
  expect((await snapshot(page)).player.y).toBeCloseTo(210.875, 0);
});

test('E enters only near the casino and the south exit restores the exact lobby point', async ({ page }, testInfo) => {
  await openWorld(page);
  await page.keyboard.press('e');
  expect((await snapshot(page)).scene).toBe('CentralLobby');
  await approachEntrance(page);
  const entry = (await snapshot(page)).player;
  await page.screenshot({ path: testInfo.outputPath('central-lobby.png'), fullPage: true });
  await page.keyboard.press('e');
  await expect.poll(async () => (await snapshot(page)).scene).toBe('CasinoRoom');
  await expect(page.locator('#world-return')).toBeEnabled();
  await moveUntil(page, 's', s => s.interaction === 'lobby');
  await page.keyboard.press('e');
  await expect.poll(async () => (await snapshot(page)).scene).toBe('CentralLobby');
  expect((await snapshot(page)).player).toEqual(entry);
  await expect(page.locator('#floor-canvas canvas')).toBeFocused();
});

test('reload and Continue restore the saved lobby location and preserve hotel data', async ({ page }) => {
  const seed = savedResort();
  await seedStorage(page, seed);
  await openWorld(page);
  await moveUntil(page, 'd', s => s.player.x > 600);
  const saved = (await snapshot(page)).player;
  await expect.poll(async () => JSON.parse((await storage(page)).casinoWorldState).lobby).toEqual(saved);
  await page.reload(); await worldReady(page);
  expect((await snapshot(page)).player).toEqual(saved);
  await page.getByRole('link', { name: 'Title', exact: true }).click();
  await page.locator('#continue-resort').click(); await worldReady(page);
  await expectLegacyUnchanged(page, seed);
  expect(JSON.parse((await storage(page)).casinoWorldState).lobby).toEqual(saved);
});

test('the same blackjack hand survives scene visits and settles exactly once', async ({ page }) => {
  const seed = savedResort();
  await seedStorage(page, seed);
  await openWorld(page); await approachEntrance(page);
  const entry = (await snapshot(page)).player;
  await page.keyboard.press('e');
  await expect(page.locator('#world-return')).toBeEnabled();
  await moveUntil(page, 'w', s => s.interaction === 'blackjack');
  await page.keyboard.press('e');
  const table = await blackjackUI(page);
  const parked = (await snapshot(page)).player;
  await table.locator('#speed-range').fill('2');
  await table.locator('.chip-btn[data-value="5"]').click();
  await table.locator('#deal-button').click();
  await expect(table.locator('#result-message')).toHaveText('Your move…');
  await expect(page.locator('#world-balance')).toHaveText('245.25');
  await table.locator('body').evaluate(body => { body.dataset.handLifetime = 'retained'; });
  expect((await snapshot(page)).paused).toBe(true);
  await hold(page, 'a', 160);
  expect((await snapshot(page)).player).toEqual(parked);
  await page.getByRole('button', { name: 'Return to floor' }).click();
  await page.locator('#world-return').click();
  expect((await snapshot(page)).player).toEqual(entry);
  await expect(page.locator('#world-interact')).toBeEnabled();
  await page.keyboard.press('e');
  await expect(page.locator('#world-interact')).toBeEnabled();
  await page.keyboard.press('e');
  await expect(table.locator('body')).toHaveAttribute('data-hand-lifetime', 'retained');
  await expect(table.locator('#player-cards .card')).toHaveCount(2);
  await expect(table.locator('#deal-button')).toBeDisabled();
  await expect(page.locator('#world-balance')).toHaveText('245.25');
  await table.locator('#stand-button').click();
  await expect(table.locator('#result-message')).toHaveText('Dealer busts — you win!');
  await expect(page.locator('#world-balance')).toHaveText('255.25');
  await expect(table.locator('#leaderboard-list li')).toHaveCount(1);
  await table.locator('#speed-range').focus(); await page.keyboard.press('Escape');
  await page.locator('#world-return').click();
  expect((await snapshot(page)).player).toEqual(entry);
  await expect(page.locator('#world-balance')).toHaveText('255.25');
  expect(JSON.parse((await storage(page)).hotelGameState).currencies.hotelCash).toBe(4321);
});

test('hard reload still loses an unfinished hand and never refunds or replays its wager', async ({ page }) => {
  await seedStorage(page, savedResort());
  await openWorld(page); await approachEntrance(page);
  const entry = (await snapshot(page)).player;
  await page.keyboard.press('e');
  await expect(page.locator('#world-return')).toBeEnabled();
  await moveUntil(page, 'w', s => s.interaction === 'blackjack');
  await page.keyboard.press('e');
  let table = await blackjackUI(page);
  await table.locator('#speed-range').fill('2');
  await table.locator('.chip-btn[data-value="5"]').click();
  await table.locator('#deal-button').click();
  await expect(table.locator('#result-message')).toHaveText('Your move…');
  await expect(page.locator('#world-balance')).toHaveText('245.25');
  page.once('dialog', prompt => prompt.accept());
  await page.reload(); await worldReady(page);
  expect((await snapshot(page)).player).toEqual(entry);
  await expect(page.locator('#world-balance')).toHaveText('245.25');
  await expect(page.locator('#world-interact')).toBeEnabled();
  await page.keyboard.press('e');
  await expect(page.locator('#world-return')).toBeEnabled();
  await moveUntil(page, 'w', s => s.interaction === 'blackjack');
  await page.keyboard.press('e');
  table = await blackjackUI(page);
  await expect(table.locator('#player-cards .card')).toHaveCount(0);
  await expect(table.locator('#deal-button')).toBeDisabled();
  await expect(page.locator('#world-balance')).toHaveText('245.25');
});

test('a failed world write reports an error without replacing existing saves', async ({ page }) => {
  const seed = savedResort();
  await seedStorage(page, seed);
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'casinoWorldState') throw new Error('World persistence denied');
      return original.call(this, key, value);
    };
  });
  await page.goto('/world/index.html?debug=1');
  await expect(page.locator('#world-errors')).toContainText('World persistence denied');
  await expect.poll(async () => (await snapshot(page)).paused).toBe(true);
  expect(await storage(page)).toEqual(seed);
  const parked = (await snapshot(page)).player;
  await hold(page, 'w', 150);
  expect((await snapshot(page)).player).toEqual(parked);
});

test('another tab cannot silently replace an active world session', async ({ page, context }) => {
  await openWorld(page);
  const parked = (await snapshot(page)).player;
  const other = await context.newPage(); await other.goto('/');
  const future = JSON.stringify({ version: 99 });
  await other.evaluate(raw => localStorage.setItem('casinoWorldState', raw), future);
  await expect(page.locator('#world-errors')).toContainText('unsupported');
  await hold(page, 'w', 250);
  expect((await snapshot(page)).player).toEqual(parked);
  expect((await storage(page)).casinoWorldState).toBe(future);
  await other.close();
});

test('all six minigame shell return links still open hotel management', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('casinoWelcomed', '1'));
  for (const operation of ['checkin', 'rooms', 'restaurant', 'bar', 'entertainment', 'spa']) {
    await page.goto(`/hotel/${operation}/index.html`);
    const link = page.locator('.shell-header').getByRole('link', { name: 'Hotel Lobby', exact: true });
    await expect(link).toHaveAttribute('href', '../index.html');
    // Check-In intentionally covers its header with an idle briefing overlay.
    // Exercise that overlay's visible exit as well as asserting the shell URL.
    if (operation === 'checkin') await page.locator('#overlay-idle .ci-back-link').click();
    else await link.click();
    await expect(page).toHaveURL(/\/hotel\/index\.html$/);
    await expect(page.locator('#hotel-name-display')).toBeVisible();
  }
  await page.getByRole('link', { name: 'Return to Central Lobby' }).click();
  await worldReady(page);
});

test('M reaches the original management page from either world room', async ({ page }) => {
  await seedStorage(page, savedResort());
  for (const room of ['CentralLobby', 'CasinoRoom']) {
    await openWorld(page);
    if (room === 'CasinoRoom') {
      await approachEntrance(page); await page.keyboard.press('e');
      await expect(page.locator('#world-return')).toBeEnabled();
    }
    await page.keyboard.press('m');
    await expect(page).toHaveURL(/\/hotel\/index\.html$/);
    await expect(page.locator('#hotel-name-display')).toContainText('Existing Resort');
    await page.getByRole('link', { name: 'Return to Central Lobby' }).click();
    await worldReady(page);
  }
});

async function seedStorage(page, seed) {
  await page.addInitScript(values => {
    if (!sessionStorage.getItem('worldTestSeeded')) {
      for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value);
      sessionStorage.setItem('worldTestSeeded', '1');
    }
  }, seed);
}
async function storage(page) { return page.evaluate(() => Object.fromEntries(Object.entries(localStorage))); }
async function expectLegacyUnchanged(page, seed) {
  const current = await storage(page);
  for (const [key, value] of Object.entries(seed)) if (key !== 'casinoWorldState') expect(current[key], key).toBe(value);
}
function worldSave(lobby) { return currentWorld(lobby, { customMetadata: 'preserved' }); }
async function worldReady(page) { await expect(page.locator('#floor-canvas')).toHaveAttribute('aria-busy', 'false'); await expect(page.locator('#floor-canvas canvas')).toBeVisible(); }
async function openWorld(page) { await page.goto('/world/index.html?debug=1'); await worldReady(page); await page.locator('#floor-canvas canvas').focus(); }
async function snapshot(page) { return page.evaluate(() => CasinoWorldDebug.snapshot()); }
async function moveUntil(page, key, predicate) {
  await page.keyboard.down(key);
  try { await expect.poll(async () => predicate(await snapshot(page)), { intervals: [30], timeout: 10_000 }).toBe(true); }
  finally { await page.keyboard.up(key); }
  await expect.poll(async () => (await snapshot(page)).velocity).toEqual({ x: 0, y: 0 });
}
async function hold(page, key, duration) { await page.keyboard.down(key); await page.waitForTimeout(duration); await page.keyboard.up(key); await page.waitForTimeout(60); }
async function approachEntrance(page) { await walkTo(page, POINTS.casino); await expect(page.locator('#world-interact')).toBeEnabled(); }
async function blackjackUI(page) {
  await expect(page.locator('#blackjack-status')).toContainText('Your hand stays');
  await expect(page.locator('#blackjack-frame')).not.toHaveAttribute('inert', '');
  const table = page.frameLocator('#blackjack-frame');
  await dealerBustDeck(table);
  return table;
}
