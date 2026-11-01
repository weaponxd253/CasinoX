const {test,expect}=require('@playwright/test');
const {openTraffic,traffic,storage}=require('./helpers/traffic-world');
const {POINTS}=require('./helpers/lobby-world');
const {MAIN_POINTS,snapshot,mainReady,enterMain,enterLounge,returnToLobby,walkMainTo}=require('./helpers/main-casino-world');
test('repeated room loops keep one owner, bounded resources and the same sleeping lobby guests',async({page})=>{
 test.setTimeout(120000);const seed=await openTraffic(page,{profile:'busy',position:POINTS.casino});
 await expect.poll(async()=>(await traffic(page)).stats.created,{timeout:15000}).toBeGreaterThanOrEqual(3);
 await enterMain(page);const frozen=await traffic(page),resources=(await snapshot(page)).mainCasino.resources;
 expect(frozen.suspended).toBe(true);expect(frozen.movingCount).toBe(0);
 for(let i=0;i<3;i++){
  await enterLounge(page);expect(await traffic(page)).toEqual(frozen);
  await page.locator('#world-return').click();await expect.poll(async()=>(await snapshot(page)).scene).toBe('MainCasinoFloor');await mainReady(page);
  expect((await snapshot(page)).mainCasino.resources).toEqual(resources);expect((await snapshot(page)).player).toEqual(MAIN_POINTS.northSpawn);
  expect(await traffic(page)).toEqual(frozen);
 }
 await returnToLobby(page);await expect.poll(async()=>(await traffic(page)).activeMs).toBeGreaterThan(frozen.activeMs);
 expect((await traffic(page)).guests.map(g=>g.id)).toEqual(frozen.guests.map(g=>g.id));expect(await storage(page)).toEqual(seed);
});
test('Main floor direction animations, feet anchoring and 190-speed movement use the shared owner',async({page})=>{
 await openTraffic(page,{position:POINTS.casino});await enterMain(page);
 for(const[key,direction,idle]of [['w','up',15],['s','down',0],['a','left',4],['d','right',8]]){
  await page.keyboard.down(key);await expect.poll(async()=>(await snapshot(page)).ownerVisual.animation).toBe(`owner-walk-${direction}`);
  const moving=await snapshot(page);expect(Math.hypot(moving.velocity.x,moving.velocity.y)).toBeCloseTo(190,5);
  await page.keyboard.up(key);await expect.poll(async()=>(await snapshot(page)).velocity).toEqual({x:0,y:0});
  const stopped=await snapshot(page);expect(stopped.ownerVisual.frame).toBe(idle);expect(stopped.ownerVisual.x).toBe(Math.round(stopped.player.x));expect(stopped.ownerVisual.y).toBe(Math.round(stopped.player.y+14));
 }
});
test('actual pressure against a slot stool stops outside the footprint with no invalid contact',async({page})=>{
 test.setTimeout(45000);await openTraffic(page,{position:POINTS.casino});await enterMain(page);await walkMainTo(page,MAIN_POINTS.slots);
 await page.keyboard.down('w');await page.waitForTimeout(700);await page.keyboard.up('w');
 const s=await snapshot(page);expect(s.failed).toBe(false);
 const contact=await page.evaluate(async()=>{const {walkable,MAIN_SOLIDS}=await import('/world/main-casino-layout.js'),p=CasinoWorldDebug.snapshot().player;return {safe:walkable(p),gap:Math.min(...MAIN_SOLIDS.filter(o=>o.id.startsWith('slot-stool-')).map(o=>Math.hypot(p.x-o.x,p.y-o.y)-o.radius-14))};});
 expect(contact.safe).toBe(true);expect(contact.gap).toBeLessThan(1);
 expect(s.player.y).toBeGreaterThan(MAIN_POINTS.slots.y-40);expect(s.player.y).toBeLessThan(MAIN_POINTS.slots.y+1);
});
test('management from Main floor uses the existing full-page UI and returns to the lobby checkpoint',async({page})=>{
 test.setTimeout(60000);const seed=await openTraffic(page,{position:POINTS.casino});await enterMain(page);await expect(page.locator('#world-return')).toBeEnabled();await page.keyboard.press('m');
 await expect(page).toHaveURL(/\/hotel\/index.html$/);await expect(page.locator('#hotel-name-display')).toContainText('Existing Resort');
 await page.getByRole('link',{name:'Return to Central Lobby'}).click();await expect(page.locator('#floor-canvas')).toHaveAttribute('aria-busy','false');
 expect(JSON.parse((await storage(page)).casinoWorldState)).toEqual(JSON.parse(seed.casinoWorldState));
});

test('diagonal pressure at a column and a rounded table corner stays clear and permits retreat',async({page})=>{
 test.setTimeout(90000);await openTraffic(page,{position:POINTS.casino});await enterMain(page);
 await page.keyboard.down('w');await page.keyboard.down('d');
 await expect.poll(async()=>{const v=(await snapshot(page)).velocity;return Math.hypot(v.x,v.y);}).toBeCloseTo(190,5);
 await page.keyboard.up('w');await page.keyboard.up('d');
 for(const [point,keys,retreat]of [[{x:480,y:280},['a','s'],'d'],[{x:340,y:230},['a','s'],'d']]){
  await walkMainTo(page,point);for(const key of keys)await page.keyboard.down(key);
  const invalid=await page.evaluate(async()=>{
   const {walkable}=await import('/world/main-casino-layout.js'),bad=[],end=performance.now()+1000;
   await new Promise(resolve=>{const check=()=>{const s=CasinoWorldDebug.snapshot();if(!walkable(s.player)||s.failed)bad.push(s.player);if(performance.now()>=end)resolve();else requestAnimationFrame(check);};requestAnimationFrame(check);});return bad;
  });for(const key of keys)await page.keyboard.up(key);expect(invalid).toEqual([]);
  const before=(await snapshot(page)).player;await page.keyboard.down(retreat);await page.waitForTimeout(250);await page.keyboard.up(retreat);
  expect((await snapshot(page)).player.x).toBeGreaterThan(before.x+20);
 }
});

test('foreground silhouettes cover the owner behind furniture and release in front',async({page},info)=>{
 test.setTimeout(90000);await openTraffic(page,{position:POINTS.casino});await enterMain(page);
 for(const [id,back,front]of [
  ['roulette-rail',{x:240.9375,y:198.046875},MAIN_POINTS.roulette],
  ['cabinet-2',{x:761.25,y:195.703125},MAIN_POINTS.slots],
  ['coin-sculpture',{x:733.125,y:308.203125},{x:733.125,y:445.3125}],
  ['roulette-east-lamp',{x:351.6796875,y:304.6875},{x:351.6796875,y:414.84375}],
 ]){
  await walkMainTo(page,back);expect((await snapshot(page)).mainCasino.foregrounds.find(f=>f.id===id).depth).toBeGreaterThan(10);
  await page.locator('canvas').screenshot({path:info.outputPath(`main-casino-${id}-behind.png`)});
  await walkMainTo(page,front);expect((await snapshot(page)).mainCasino.foregrounds.find(f=>f.id===id).depth).toBeLessThan(10);
  await page.locator('canvas').screenshot({path:info.outputPath(`main-casino-${id}-front.png`)});
 }
});
