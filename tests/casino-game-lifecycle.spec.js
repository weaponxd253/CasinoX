const {test,expect}=require('@playwright/test');
const {openCasino,launchGame,closeGame,snapshot,balance,storage}=require('./helpers/casino-world');
const {enterMain,mainReady}=require('./helpers/main-casino-world');

test('every cabinet opens the same original Slots URL with bounded resources and a fresh document',async({page})=>{
 test.setTimeout(90000);const seed=await openCasino(page),resources=(await snapshot(page)).mainCasino.resources;
 for(let i=1;i<=5;i++){
  const {frame,pose}=await launchGame(page,`slot-${i}`);expect(await frame.locator('body').evaluate(()=>location.pathname)).toBe('/slots/index.html');
  expect(await frame.locator('body').evaluate(()=>document.getElementById('history-list').children.length)).toBe(1);
  await closeGame(page);expect((await snapshot(page)).player).toEqual(pose);expect((await snapshot(page)).mainCasino.resources).toEqual(resources);
  expect((await snapshot(page)).casinoGameHost).toMatchObject({created:i,destroyed:i,liveFrames:0,parentListeners:4,loadTimerActive:false,closeRequestPending:false});
 }
 expect(await balance(page)).toBe(250.25);expect(await storage(page)).toEqual(seed);
});

test('one held E cannot create a second host, and sleeping lobby identities and journeys stay intact',async({page})=>{
 test.setTimeout(90000);const seed=await openCasino(page);await page.goto('/world/index.html?debug=1&trafficProfile=busy&trafficSeed=19&activityFixture=unavailable');await mainReady(page);
 await expect.poll(async()=>(await snapshot(page)).guestTraffic.stats.created,{timeout:15000}).toBeGreaterThanOrEqual(3);await enterMain(page);
 const frozen=(await snapshot(page)).guestTraffic;const {approach}=require('./helpers/casino-world');await approach(page,'slot-4');
 await page.keyboard.down('e');await expect.poll(async()=>(await snapshot(page)).casinoGameHost.ready).toBe(true);await page.waitForTimeout(350);await page.keyboard.down('e');
 expect((await snapshot(page)).casinoGameHost).toMatchObject({created:1,liveFrames:1});await page.keyboard.up('e');
 const after=(await snapshot(page)).guestTraffic;expect(after.activeMs).toBe(frozen.activeMs);expect(after.guests).toEqual(frozen.guests);expect(after.queue).toEqual(frozen.queue);
 await closeGame(page);expect((await snapshot(page)).guestTraffic.guests).toEqual(frozen.guests);expect(await storage(page)).toEqual(seed);
});
