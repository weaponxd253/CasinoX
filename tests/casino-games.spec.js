const { test, expect } = require('@playwright/test');
const { openCasino, launchGame, closeGame, storage, snapshot, auditWrites, balance, moneyWrites } = require('./helpers/casino-world');

for (const [id, game] of [['roulette','roulette'],['slot-1','slots'],['coin-flip','coinflip']]) {
  test(`${game} opens the original page without charging and returns to the identical owner pose`, async ({ page }) => {
    test.setTimeout(60000);await auditWrites(page);const seed=await openCasino(page),before=(await snapshot(page)).mainCasino.resources;
    const {frame,pose}=await launchGame(page,id);
    await expect(frame.locator('#shell-balance-amt')).toHaveText('250.25');
    const s=await snapshot(page);expect(s.scene).toBe('MainCasinoFloor');expect(s.paused).toBe(true);
    expect(s.ownerInput).toMatchObject({keyboardEnabled:false,blocked:true});
    await page.keyboard.down('w');await page.waitForTimeout(100);await page.keyboard.up('w');
    expect((await snapshot(page)).player).toEqual(pose);expect(await balance(page)).toBe(250.25);
    expect(await moneyWrites(page)).toEqual([]);await closeGame(page);
    expect((await snapshot(page)).player).toEqual(pose);expect((await snapshot(page)).mainCasino.resources).toEqual(before);
    expect(await storage(page)).toEqual(seed);expect((await snapshot(page)).casinoGameHost).toMatchObject({created:1,destroyed:1,liveFrames:0});
  });
}

test('Roulette original win and loss charge and credit once, preserving hotel/guest/checkpoint bytes', async ({ page }) => {
  test.setTimeout(60000);await auditWrites(page);const seed=await openCasino(page);const {frame}=await launchGame(page,'roulette');
  await frame.locator('body').evaluate(()=>{Math.random=()=>17/37+.001;});
  await frame.locator('.rt-chip[data-chip="5"]').click();await frame.locator('.rt-spot[data-bet="n17"]').click();
  expect(await balance(page)).toBe(250.25);await frame.locator('#rt-spin').click();
  await expect(frame.locator('#rt-result')).toContainText('17 black',{timeout:6000});await expect.poll(()=>balance(page)).toBe(425.25);
  await frame.locator('.rt-spot[data-bet="red"]').click();await frame.locator('#rt-spin').click();
  await expect(frame.locator('#rt-result')).toContainText('no winning bets',{timeout:6000});expect(await balance(page)).toBe(420.25);
  await closeGame(page);await expect(page.locator('#world-balance')).toHaveText('420.25');
  expect((await moneyWrites(page)).map(w=>w.value)).toEqual(['245.25','425.25','420.25']);
  expect((await moneyWrites(page)).every(w=>w.source==='/roulette/index.html')).toBe(true);
  const after=await storage(page);for(const k of ['hotelGameState','hotelGuestPool','casinoWorldState'])expect(after[k]).toBe(seed[k]);
});

test('Slots original cherry win settles once and another cabinet launches the same game without another charge', async ({ page }) => {
  test.setTimeout(60000);await auditWrites(page);await openCasino(page);let {frame}=await launchGame(page,'slot-1');
  await frame.locator('body').evaluate(()=>{window.getRandomSymbol=()=>'🍒';});await frame.locator('.spin-button').click();
  await expect(frame.locator('#history-list .history-item')).toHaveCount(1,{timeout:6000});await expect.poll(()=>balance(page)).toBe(250.85);
  await closeGame(page);({frame}=await launchGame(page,'slot-5'));await expect(frame.locator('#shell-balance-amt')).toHaveText('250.85');
  await expect(page.locator('[data-game-title]')).toContainText('Machine 5');await closeGame(page);
  expect((await moneyWrites(page)).map(w=>w.value)).toEqual(['249.65','250.85']);
  expect((await moneyWrites(page)).every(w=>w.source==='/slots/index.html')).toBe(true);
  expect((await snapshot(page)).casinoGameHost).toMatchObject({created:2,destroyed:2,liveFrames:0});
});

test('Coin Flip preserves its unbanked pot, original cash-out and loss without host transactions', async ({ page }) => {
  test.setTimeout(60000);await auditWrites(page);await openCasino(page);let {frame}=await launchGame(page,'coin-flip');
  await frame.locator('body').evaluate(()=>{Math.random=()=>.1;});await frame.locator('#flip-heads').click();
  await expect(frame.locator('#ride-pot')).toHaveText('$10.00');expect(await balance(page)).toBe(245.25);
  await page.locator('[data-game-close]').click();await expect(page.locator('#casino-game-status')).toContainText('Cash out');
  expect((await snapshot(page)).casinoGameHost.liveFrames).toBe(1);await frame.locator('#cash-out').click();await closeGame(page);
  ({frame}=await launchGame(page,'coin-flip'));await frame.locator('body').evaluate(()=>{Math.random=()=>.9;});
  await frame.locator('#flip-heads').click();await expect(frame.locator('#cf-result')).toContainText('You lose');await closeGame(page);
  expect(await balance(page)).toBe(250.25);expect((await moneyWrites(page)).map(w=>w.value)).toEqual(['245.25','255.25','250.25']);
  expect((await moneyWrites(page)).every(w=>w.source==='/coinflip/index.html')).toBe(true);
});
