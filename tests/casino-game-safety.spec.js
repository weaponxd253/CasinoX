const { test, expect } = require('@playwright/test');
const { openCasino, launchGame, closeGame, snapshot, balance, moneyWrites, auditWrites, storage } = require('./helpers/casino-world');
const { enterLounge, mainReady } = require('./helpers/main-casino-world');
const { walkLoungeTo, LOUNGE_POINTS } = require('./helpers/lounge-world');
const { dealerBustDeck } = require('./helpers/blackjack-deck');

async function holdSettlement(frame, delay) {
  await frame.locator('body').evaluate((_, delay) => {
    const original = window.setTimeout;
    window.heldSettlements = [];
    window.setTimeout = (fn, ms, ...args) => {
      if (ms === delay) { heldSettlements.push(() => fn(...args)); return 900000 + heldSettlements.length; }
      return original(fn, ms, ...args);
    };
    window.releaseSettlement = () => { window.setTimeout = original; heldSettlements.splice(0).forEach(fn => fn()); };
  }, delay);
}

test('Roulette close checks fresh state during a paid spin and Escape cannot unload it', async ({ page }) => {
  test.setTimeout(60000);await auditWrites(page);await openCasino(page);const {frame,pose}=await launchGame(page,'roulette');
  await holdSettlement(frame,3300);await frame.locator('body').evaluate(()=>{Math.random=()=>17/37+.001;});
  await frame.locator('.rt-spot[data-bet="odd"]').click();await frame.locator('#rt-spin').click();
  await page.locator('[data-game-close]').click();await expect(page.locator('#casino-game-status')).toContainText('current round');
  await page.locator('[data-game-close]').focus();await page.keyboard.press('Escape');
  await frame.locator('body').focus();await page.keyboard.press('Escape');
  expect((await snapshot(page)).casinoGameHost).toMatchObject({open:true,roundActive:true,destroyed:0});expect(await balance(page)).toBe(249.25);
  await frame.locator('body').evaluate(()=>releaseSettlement());await expect.poll(()=>balance(page)).toBe(251.25);await closeGame(page);
  expect((await snapshot(page)).player).toEqual(pose);expect((await moneyWrites(page)).map(w=>w.value)).toEqual(['249.25','251.25']);
});

test('Coin Flip blocks mid-flip and idle-pot returns until the original Cash out completes', async ({ page }) => {
  test.setTimeout(60000);await openCasino(page);const {frame}=await launchGame(page,'coin-flip');await holdSettlement(frame,850);
  await frame.locator('body').evaluate(()=>{Math.random=()=>.1;});await frame.locator('#flip-heads').click();await page.locator('[data-game-close]').click();
  await expect(page.locator('#casino-game-status')).toContainText('current round');expect(await balance(page)).toBe(245.25);
  await frame.locator('body').evaluate(()=>releaseSettlement());await expect(frame.locator('#ride-pot')).toHaveText('$10.00');
  await frame.locator('body').focus();await page.keyboard.press('Escape');await expect(page.locator('#casino-game-status')).toContainText('Cash out');
  expect((await snapshot(page)).casinoGameHost.liveFrames).toBe(1);await frame.locator('#cash-out').click();await closeGame(page);expect(await balance(page)).toBe(255.25);
});

test('Slots auto-run cannot be hidden by Return; original Stop finishes it and no hidden bets follow', async ({ page }) => {
  test.setTimeout(60000);await page.emulateMedia({reducedMotion:'reduce'});await auditWrites(page);await openCasino(page);const {frame}=await launchGame(page,'slot-2');
  await frame.locator('body').evaluate(()=>{let n=0;window.getRandomSymbol=()=>['🍒','🍋','🍉'][Math.floor(n++/21)%3];});
  await frame.locator('.autospin-btn[data-auto="10"]').click();await page.locator('[data-game-close]').click();
  await expect(page.locator('#casino-game-status')).toContainText('Auto-spin');expect((await snapshot(page)).casinoGameHost.autoActive).toBe(true);
  await frame.locator('#autospin-stop').click();await expect.poll(async()=>(await snapshot(page)).casinoGameHost.roundActive).toBe(false);await closeGame(page);
  const stopped=await balance(page);await page.waitForTimeout(1000);expect(await balance(page)).toBe(stopped);
  expect((await moneyWrites(page)).every(w=>w.source==='/slots/index.html')).toBe(true);
});

test('inner help Escape closes only help; a fresh Escape then returns and held E cannot reopen', async ({ page }) => {
  test.setTimeout(60000);await openCasino(page);const {frame}=await launchGame(page,'roulette');
  await frame.locator('#rt-help').click();await expect(frame.locator('#shell-info-modal')).toHaveClass(/open/);
  await page.keyboard.press('Escape');await expect(frame.locator('#shell-info-modal')).not.toHaveClass(/open/);expect((await snapshot(page)).casinoGameHost.open).toBe(true);
  await page.waitForTimeout(400);await frame.locator('body').focus();await page.keyboard.press('Escape');await expect(page.locator('#casino-game-overlay')).not.toBeVisible();
  await page.keyboard.down('e');await page.waitForTimeout(400);await page.keyboard.down('e');expect((await snapshot(page)).casinoGameHost.liveFrames).toBe(0);await page.keyboard.up('e');
});

test('retained paid Blackjack hand refreshes XP before Double without repeating the level reward', async ({ page }) => {
  test.setTimeout(120000);await auditWrites(page);const seed=await openCasino(page,{xp:48});await enterLounge(page);await walkLoungeTo(page,LOUNGE_POINTS.table);await page.keyboard.press('e');
  const bj=page.frameLocator('#blackjack-frame');await expect(page.locator('#blackjack-frame')).not.toHaveAttribute('inert','');
  await dealerBustDeck(bj);await bj.locator('#speed-range').fill('2');await bj.locator('.chip-btn[data-value="1"]').click();await bj.locator('#deal-button').click();
  await expect(bj.locator('#result-message')).toHaveText('Your move…');await bj.locator('body').evaluate(b=>{b.dataset.phase6bHand='keep';});
  expect(await balance(page)).toBe(249.25);await page.getByRole('button',{name:'Return to floor'}).click();await page.locator('#world-return').click();await mainReady(page);
  const {frame}=await launchGame(page,'roulette');await frame.locator('body').evaluate(()=>{Math.random=()=>17/37+.001;});await frame.locator('.rt-spot[data-bet="odd"]').click();await frame.locator('#rt-spin').click();
  await expect(frame.locator('#rt-result')).toContainText('17 black',{timeout:6000});expect(await balance(page)).toBe(300.25);await closeGame(page);
  await enterLounge(page);await expect(page.locator('#world-interact')).toBeEnabled();await page.keyboard.press('e');await expect(page.locator('#blackjack-frame')).not.toHaveAttribute('inert','');
  await expect(bj.locator('body')).toHaveAttribute('data-phase6b-hand','keep');expect(await bj.locator('body').evaluate(()=>CasinoShell.profile.xp)).toBe(50);
  await bj.locator('#double-button').click();await expect(bj.locator('#result-message')).toContainText('Bust');
  expect(await balance(page)).toBe(299.25);expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('casinoProfile')).xp)).toBe(51);
  expect((await moneyWrites(page)).map(w=>w.value)).toEqual(['249.25','248.25','298.25','300.25','299.25']);
  const after=await storage(page);for(const k of ['hotelGameState','hotelGuestPool','casinoWorldState'])expect(after[k]).toBe(seed[k]);
});

test('profile refresh reads legitimate zero and absent defaults without saving or changing chips', async ({ page }) => {
  await page.goto('/slots/index.html');
  const r=await page.evaluate(()=>{
    const money=localStorage.getItem('casinoBalance');localStorage.setItem('casinoProfile',JSON.stringify({xp:0,auditSentinel:'keep'}));
    const raw=localStorage.getItem('casinoProfile'),profile=CasinoShell.refreshProfile();
    return {money,afterMoney:localStorage.getItem('casinoBalance'),raw,afterRaw:localStorage.getItem('casinoProfile'),profile};
  });expect(r.afterMoney).toBe(r.money);expect(r.afterRaw).toBe(r.raw);expect(r.profile).toMatchObject({xp:0,level:1,streak:0});
});
