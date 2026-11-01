const { test, expect } = require('@playwright/test');
const { openCasino, approach, launchGame, closeGame, snapshot, balance, storage, auditWrites, moneyWrites } = require('./helpers/casino-world');
const { mainReady } = require('./helpers/main-casino-world');

for(const failure of ['document','game-script','bridge'])test(`${failure} loading failure is unplayed, preserves saves and allows a fresh retry`,async({page})=>{
 test.setTimeout(60000);await auditWrites(page);const seed=await openCasino(page);await approach(page,'roulette');const pose=(await snapshot(page)).player;
 const pattern=failure==='document'?'**/roulette/index.html?*':failure==='game-script'?'**/roulette/script.js?*':'**/casino-game-bridge.js';
 const abort=r=>r.abort();await page.route(pattern,abort);await page.keyboard.press('e');
 await expect.poll(async()=>(await snapshot(page)).casinoGameHost.phase,{timeout:15000}).toBe('failed');
 expect((await snapshot(page)).casinoGameHost.ready).toBe(false);expect(await balance(page)).toBe(250.25);await closeGame(page);
 expect((await snapshot(page)).player).toEqual(pose);expect(await storage(page)).toEqual(seed);expect(await moneyWrites(page)).toEqual([]);
 await page.unroute(pattern,abort);await launchGame(page,'roulette');await closeGame(page);expect(await balance(page)).toBe(250.25);
});

test('a nonpersistent child wallet is rejected before play instead of becoming another bankroll',async({page})=>{
 test.setTimeout(45000);await page.addInitScript(()=>{
  if(location.pathname.endsWith('/coinflip/index.html'))Object.defineProperty(window,'localStorage',{configurable:true,get(){throw new DOMException('Blocked','SecurityError');}});
 });
 const seed=await openCasino(page);await approach(page,'coin-flip');await page.keyboard.press('e');
 await expect.poll(async()=>(await snapshot(page)).casinoGameHost.phase).toBe('failed');
 await expect(page.locator('#casino-game-status')).toContainText('shared wallet');expect(await balance(page)).toBe(250.25);await closeGame(page);
 expect(await storage(page)).toEqual(seed);
});

test('quota failure during a real payout retains its original document and never copies a divergent balance',async({page})=>{
 test.setTimeout(60000);await page.addInitScript(()=>{
  if(!location.pathname.endsWith('/roulette/index.html'))return;
  const native=Storage.prototype.setItem;
  Storage.prototype.setItem=function(k,v){if(k==='casinoBalance'&&window.simulateQuota)throw new DOMException('Full','QuotaExceededError');return native.call(this,k,v);};
 });
 await openCasino(page);const {frame}=await launchGame(page,'roulette');
 await frame.locator('body').evaluate(()=>{
  Math.random=()=>17/37+.001;const real=window.setTimeout;window.pendingPayout=null;
  window.setTimeout=(fn,ms,...args)=>{if(ms===3300){window.pendingPayout=()=>fn(...args);return 90001;}return real(fn,ms,...args);};
 });
 await frame.locator('.rt-spot[data-bet="odd"]').click();await frame.locator('#rt-spin').click();expect(await balance(page)).toBe(249.25);
 await frame.locator('body').evaluate(()=>{window.simulateQuota=true;window.pendingPayout();});
 await expect.poll(async()=>(await snapshot(page)).casinoGameHost.storageHealthy).toBe(false);
 expect(await frame.locator('body').evaluate(()=>CasinoWallet.get())).toBe(251.25);expect(await balance(page)).toBe(249.25);
 await page.locator('[data-game-close]').click();await expect(page.locator('#casino-game-status')).toContainText('shared wallet');
 expect((await snapshot(page)).casinoGameHost).toMatchObject({open:true,liveFrames:1,destroyed:0});
 await frame.locator('#shell-menu-link').click();await expect(frame.locator('[data-menu="import"]')).toBeDisabled();
 await expect(frame.locator('[data-menu="export"]')).toBeVisible();
});

for(const [id,game,delay,betButton,expected]of [
 ['roulette','roulette',3300,'#rt-spin',249.25],['slot-4','slots',600,'.spin-button',249.65],['coin-flip','coinflip',850,'#flip-heads',245.25],
])test(`${game} forced hard reload keeps the existing wager-loss boundary and version 2 lobby checkpoint`,async({page})=>{
 test.setTimeout(45000);const seed=await openCasino(page);const {frame}=await launchGame(page,id);
 await frame.locator('body').evaluate((_,game)=>{
  const real=window.setTimeout;window.setTimeout=(fn,ms,...args)=>{
   if((game==='roulette'&&ms===3300)||(game==='coinflip'&&ms===850)||(game==='slots'&&[600,900,1200].includes(ms)))return 99000+ms;
   return real(fn,ms,...args);
  };if(game==='slots')window.gsap=undefined;
 },game);
 if(game==='roulette')await frame.locator('.rt-spot[data-bet="odd"]').click();await frame.locator(betButton).click();
 expect(await balance(page)).toBe(expected);let warned=false;page.once('dialog',async d=>{warned=d.type()==='beforeunload';await d.accept();});
 await page.reload();await mainReady(page);expect(warned).toBe(true);expect((await snapshot(page)).scene).toBe('CentralLobby');expect(await balance(page)).toBe(expected);
 const after=await storage(page);for(const k of ['casinoWorldState','hotelGameState','hotelGuestPool'])expect(after[k]).toBe(seed[k]);expect(JSON.parse(after.casinoWorldState).version).toBe(2);
});

test('Coin Flip idle-pot hard reload uses only its existing pagehide cash-out',async({page})=>{
 test.setTimeout(45000);await openCasino(page);const {frame}=await launchGame(page,'coin-flip');await frame.locator('body').evaluate(()=>{Math.random=()=>.1;});
 await frame.locator('#flip-heads').click();await expect(frame.locator('#ride-pot')).toHaveText('$10.00');expect(await balance(page)).toBe(245.25);
 page.once('dialog',d=>d.accept());await page.reload();await mainReady(page);expect(await balance(page)).toBe(255.25);
});
