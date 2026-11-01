const {test,expect}=require('@playwright/test');
const {savedResort}=require('./helpers/saved-resort');
const {currentWorld,POINTS}=require('./helpers/lobby-world');
const {MAIN_POINTS,snapshot,mainReady,walkMainTo,enterMain,enterLounge,returnToLobby}=require('./helpers/main-casino-world');
async function open(page){const seed={...savedResort(),casinoWorldState:currentWorld(POINTS.casino,{phase6aSentinel:'preserve'})};await page.addInitScript(values=>{if(!sessionStorage.getItem('mainSeeded')){for(const[k,v]of Object.entries(values))localStorage.setItem(k,v);sessionStorage.setItem('mainSeeded','1');}sessionStorage.setItem('shellBonusPrompted','1');},seed);await page.goto('/world/index.html?debug=1');await mainReady(page);return seed;}
const storage=page=>page.evaluate(()=>Object.fromEntries(Object.entries(localStorage)));
test('both doors work in both directions, with safe spawns and the exact lobby checkpoint',async({page})=>{
 test.setTimeout(60000);const seed=await open(page),entry=(await snapshot(page)).player;
 await enterMain(page);expect((await snapshot(page)).player).toEqual(MAIN_POINTS.southSpawn);
 expect((await snapshot(page)).mainCasinoArtwork).toEqual({x:30,y:0,width:900,height:600,sourceWidth:1536,sourceHeight:1024,scaleMode:1});
 expect((await snapshot(page)).interaction).toBeNull();expect((await snapshot(page)).ownerBody).toMatchObject({radius:14,width:28,height:28,isCircle:true});
 await enterLounge(page);expect((await snapshot(page)).player).toEqual({x:480,y:480,facing:'up'});
 await page.keyboard.down('s');await expect.poll(async()=>(await snapshot(page)).interaction).toBe('lobby');await page.keyboard.up('s');
 await expect(page.locator('#world-interact')).toHaveText('E · Return to Main Casino Floor');await page.keyboard.press('e');
 await expect.poll(async()=>(await snapshot(page)).scene).toBe('MainCasinoFloor');expect((await snapshot(page)).player).toEqual(MAIN_POINTS.northSpawn);
 await walkMainTo(page,MAIN_POINTS.south);await page.keyboard.press('e');await expect.poll(async()=>(await snapshot(page)).scene).toBe('CentralLobby');
 expect((await snapshot(page)).player).toEqual(entry);expect(await storage(page)).toEqual(seed);
});
test('holding and repeating E cannot bounce through a doorway or skip the floor',async({page})=>{
 await open(page);await page.keyboard.down('e');await expect.poll(async()=>(await snapshot(page)).scene).toBe('MainCasinoFloor');
 await page.waitForTimeout(450);await page.keyboard.down('e');expect((await snapshot(page)).scene).toBe('MainCasinoFloor');expect((await snapshot(page)).awaitingRelease).toBe(true);
 await page.keyboard.up('e');await expect.poll(async()=>(await snapshot(page)).awaitingRelease).toBe(false);
 await page.keyboard.press('e');expect((await snapshot(page)).scene).toBe('MainCasinoFloor');await returnToLobby(page);
});
for(const where of ['MainCasinoFloor','CasinoRoom'])test(`reload from ${where} preserves version 2 lobby metadata and financial saves`,async({page})=>{
 test.setTimeout(45000);const seed=await open(page);if(where==='CasinoRoom')await enterLounge(page);else await enterMain(page);
 await page.reload();await mainReady(page);expect((await snapshot(page)).scene).toBe('CentralLobby');expect(await storage(page)).toEqual(seed);
 expect(JSON.parse((await storage(page)).casinoWorldState)).toMatchObject({version:2,layout:'luxury-lobby-1',phase6aSentinel:'preserve'});
 expect(await page.evaluate(()=>[typeof HotelState,typeof HotelEngine])).toEqual(['undefined','undefined']);
});
for(const failure of ['abort','wrong-size','decode'])test(`Main floor ${failure} fails safely without a replacement image or owner`,async({page})=>{
 const seed=await open(page);await page.route('**/assets/casino/main-casino-floor.png',r=>failure==='abort'?r.abort():failure==='decode'?r.fulfill({contentType:'image/png',body:'not png'}):r.fulfill({path:require('path').resolve('world/assets/owner/owner.png'),contentType:'image/png'}));
 await page.keyboard.press('e');await expect(page.locator('#world-errors')).toContainText('Main Casino Floor artwork');
 expect((await snapshot(page)).failed).toBe(true);expect((await snapshot(page)).player).toBeNull();expect(await storage(page)).toEqual(seed);
});
test('all side approaches use real input and keep the circular footprint clear',async({page},info)=>{
 test.setTimeout(90000);const seed=await open(page);await enterMain(page);
 for(const name of ['roulette','slots','coin']){await walkMainTo(page,MAIN_POINTS[name]);
  const clear=await page.evaluate(async()=>{const {walkable}=await import('/world/main-casino-layout.js');return walkable(CasinoWorldDebug.snapshot().player);});expect(clear).toBe(true);
  await page.screenshot({path:info.outputPath(`main-casino-${name}.png`),fullPage:true});}
 await page.locator('#world-collisions').click();await page.screenshot({path:info.outputPath('main-casino-debug.png'),fullPage:true});
 expect((await snapshot(page)).mainCasino.anchors).toHaveProperty('coinFlip');expect(await storage(page)).toEqual(seed);
});

test('pointer doors and Escape return through each adjacent room',async({page})=>{
 test.setTimeout(45000);await open(page);await page.locator('#world-interact').click();await mainReady(page);
 expect((await snapshot(page)).scene).toBe('MainCasinoFloor');await walkMainTo(page,MAIN_POINTS.north);
 await page.locator('#world-interact').click();await mainReady(page);expect((await snapshot(page)).scene).toBe('CasinoRoom');
 await expect(page.locator('#world-return')).toBeEnabled();await page.keyboard.press('Escape');await expect.poll(async()=>(await snapshot(page)).scene).toBe('MainCasinoFloor');
 await expect(page.locator('#world-return')).toBeEnabled();await page.keyboard.press('Escape');await expect.poll(async()=>(await snapshot(page)).scene).toBe('CentralLobby');
});

test('delayed Main artwork keeps arrival input locked until owner creation',async({page})=>{
 await open(page);let release,requested=false;const gate=new Promise(resolve=>{release=resolve;});
 await page.route('**/assets/casino/main-casino-floor.png',async r=>{requested=true;await gate;await r.continue();});
 await page.keyboard.press('e');await expect.poll(()=>requested).toBe(true);await expect(page.locator('#floor-canvas')).toHaveAttribute('aria-busy','true');
 await expect(page.locator('#world-interact')).toBeDisabled();await expect(page.locator('#world-return')).toBeDisabled();await page.keyboard.press('Escape');
 expect((await snapshot(page)).player).toBeNull();release();await mainReady(page);expect((await snapshot(page)).player).toEqual(MAIN_POINTS.southSpawn);
});

test('a stale save detected during Main loading prevents owner creation and preserves the newer payload',async({page,context})=>{
 const seed=await open(page);let release,requested=false;const gate=new Promise(resolve=>{release=resolve;});
 await page.route('**/assets/casino/main-casino-floor.png',async r=>{requested=true;await gate;await r.continue();});
 await page.keyboard.press('e');await expect.poll(()=>requested).toBe(true);
 const actor=await context.newPage();await actor.goto('/');const replacement=currentWorld(POINTS.spawn,{otherTab:'preserve'});
 await actor.evaluate(raw=>localStorage.setItem('casinoWorldState',raw),replacement);await expect(page.locator('#world-errors')).toContainText('changed in another tab');
 release();await expect.poll(async()=>(await snapshot(page)).paused).toBe(true);expect((await snapshot(page)).player).toBeNull();
 expect(await storage(page)).toEqual({...seed,casinoWorldState:replacement});await actor.close();
});
