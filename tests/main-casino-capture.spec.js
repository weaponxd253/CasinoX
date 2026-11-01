const {test,expect}=require('@playwright/test');
const {openTraffic,traffic,storage}=require('./helpers/traffic-world');
const {POINTS}=require('./helpers/lobby-world');
const {MAIN_POINTS,snapshot,mainReady,enterMain,enterLounge,returnToLobby,walkMainTo}=require('./helpers/main-casino-world');
test.use({video:{mode:'on',size:{width:1280,height:1000}},viewport:{width:1280,height:1000}});
test('actual-input floor tour records both connections, side approaches and foreground ordering',async({page},info)=>{
 test.setTimeout(150000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const seed=await openTraffic(page,{position:POINTS.casino,profile:'busy'});
 await page.locator('canvas').screenshot({path:info.outputPath('main-casino-lobby-stairs.png')});await enterMain(page);
 await page.locator('canvas').scrollIntoViewIfNeeded();await page.locator('canvas').screenshot({path:info.outputPath('main-casino-south-arrival.png')});
 const frozen=await traffic(page);
 for(const name of ['roulette','slots','coin']){await walkMainTo(page,MAIN_POINTS[name]);await page.locator('canvas').screenshot({path:info.outputPath(`main-casino-${name}.png`)});}
 await page.locator('#world-collisions').click();await page.locator('canvas').screenshot({path:info.outputPath('main-casino-debug.png')});await page.locator('#world-collisions').click();
 await enterLounge(page);await page.locator('canvas').screenshot({path:info.outputPath('main-casino-lounge-arrival.png')});
 await page.locator('#world-return').click();await expect.poll(async()=>(await snapshot(page)).scene).toBe('MainCasinoFloor');await mainReady(page);
 await page.locator('canvas').screenshot({path:info.outputPath('main-casino-north-arrival.png')});expect(await traffic(page)).toEqual(frozen);
 await walkMainTo(page,MAIN_POINTS.south);await page.locator('canvas').screenshot({path:info.outputPath('main-casino-south-exit.png')});await page.keyboard.press('e');
 await expect.poll(async()=>(await snapshot(page)).scene).toBe('CentralLobby');expect((await snapshot(page)).player).toEqual(POINTS.casino);
 expect(await storage(page)).toEqual(seed);expect(errors).toEqual([]);
 await info.attach('main-casino-evidence',{body:JSON.stringify({source:'genuine keyboard and interaction input; original supplied PNG',sceneKeys:['CentralLobby','MainCasinoFloor','CasinoRoom'],savedBytesPreserved:true,errors}),contentType:'application/json'});
});
