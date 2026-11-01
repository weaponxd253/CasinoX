const { test, expect } = require('@playwright/test');
const path = require('path');
async function setup(page, { delay = false, timeoutMs = 10000 } = {}) {
  let release; const gate = new Promise(r => { release = r; });
  await page.route('**/roulette/index.html?*', async r => { if (delay) await gate; await r.fulfill({ path: path.join(__dirname,'fixtures/casino-host-game.html') }); });
  await page.goto('/');
  await page.evaluate(async timeoutMs => {
    const { CasinoGameHost } = await import('/world/casino-game-host.js');
    document.body.insertAdjacentHTML('beforeend','<dialog id="test-game"><h2 data-game-title></h2><p role="status"></p><button data-game-close>Return</button><div data-game-content></div></dialog>');
    window.fixtureEvents = [];
    window.fixtureHost = new CasinoGameHost({ dialog:document.getElementById('test-game'),timeoutMs,
      onOpen:()=>fixtureEvents.push('open'),onClose:()=>fixtureEvents.push('close') });
    fixtureHost.open('roulette','roulette');
  }, timeoutMs);
  return release;
}
const snap = page => page.evaluate(() => fixtureHost.snapshot());

test('one host locks loading, rejects duplicate opens and waits for the correct document', async ({ page }) => {
  const release = await setup(page,{delay:true});
  expect((await snap(page)).phase).toBe('loading');
  expect(await page.evaluate(()=>fixtureHost.open('slots','slot-2'))).toBe(false);
  await page.evaluate(()=>dispatchEvent(new MessageEvent('message',{origin:location.origin,source:window,data:{channel:'casino-world:game',version:1,type:'ready',gameId:'roulette',visit:fixtureHost.visit,state:{known:true,storageHealthy:true}}})));
  expect((await snap(page)).ready).toBe(false); release();
  await expect.poll(async()=>(await snap(page)).ready).toBe(true);
  expect((await snap(page)).liveFrames).toBe(1);
});

test('a fresh busy check rejects close and Escape; a later safe close releases exactly one document', async ({ page }) => {
  await setup(page);await expect.poll(async()=>(await snap(page)).ready).toBe(true);
  await page.frameLocator('#casino-game-frame').locator('body').evaluate(()=>{fixtureBusy=true;});
  expect(await page.evaluate(()=>fixtureHost.requestClose())).toBe(false);
  await page.locator('[data-game-close]').focus();await page.keyboard.press('Escape');
  await expect(page.locator('#test-game')).toBeVisible();expect((await snap(page)).destroyed).toBe(0);
  await page.frameLocator('#casino-game-frame').locator('body').evaluate(()=>{fixtureBusy=false;});
  expect(await page.evaluate(()=>fixtureHost.requestClose())).toBe(true);
  expect((await snap(page))).toMatchObject({open:false,created:1,destroyed:1,liveFrames:0});
  expect(await page.evaluate(()=>fixtureEvents)).toEqual(['open','close']);
});

test('load timeout and early cancellation release an unplayed inert document', async ({ page }) => {
  const release=await setup(page,{delay:true,timeoutMs:100});
  await expect.poll(async()=>(await snap(page)).phase).toBe('failed');
  expect(await page.evaluate(()=>fixtureHost.requestClose())).toBe(true);release();
  expect((await snap(page)).liveFrames).toBe(0);expect((await snap(page)).loadTimerActive).toBe(false);
});

test('repeated safe visits keep resources bounded and disposal removes parent listeners', async ({ page }) => {
  await setup(page);
  for(let i=0;i<5;i++){
    await expect.poll(async()=>(await snap(page)).ready).toBe(true);
    await page.evaluate(()=>fixtureHost.requestClose());
    if(i<4)await page.evaluate(()=>fixtureHost.open('roulette','roulette'));
  }
  expect((await snap(page))).toMatchObject({created:5,destroyed:5,liveFrames:0,parentListeners:4});
  await page.evaluate(()=>fixtureHost.dispose());expect((await snap(page)).parentListeners).toBe(0);
});

test('disposal waits for a busy document instead of discarding it', async ({ page }) => {
  await setup(page);await expect.poll(async()=>(await snap(page)).ready).toBe(true);
  await page.frameLocator('#casino-game-frame').locator('body').evaluate(()=>{fixtureBusy=true;});
  expect(await page.evaluate(()=>fixtureHost.dispose())).toBe(false);
  expect((await snap(page))).toMatchObject({open:true,disposing:true,liveFrames:1,destroyed:0});
  await page.frameLocator('#casino-game-frame').locator('body').evaluate(()=>{fixtureBusy=false;send('state',{state:state()});});
  await expect.poll(async()=>(await snap(page)).open).toBe(false);
  expect((await snap(page))).toMatchObject({liveFrames:0,destroyed:1,parentListeners:0});
});
