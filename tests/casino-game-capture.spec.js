const {test,expect}=require('@playwright/test');
const {openCasino,approach,launchGame,closeGame,snapshot,storage,auditWrites,balance,moneyWrites}=require('./helpers/casino-world');
const {MAIN_POINTS,enterLounge,mainReady,walkMainTo}=require('./helpers/main-casino-world');
const {LOUNGE_POINTS,walkLoungeTo}=require('./helpers/lounge-world');
const {dealerBustDeck}=require('./helpers/blackjack-deck');

test.use({video:{mode:'on',size:{width:1280,height:1000}}});

test('recorded original-game wagers and complete Lobby Casino Blackjack return route',async({page,isMobile},info)=>{
 test.setTimeout(210000);if(!isMobile)await page.setViewportSize({width:1280,height:1000});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));await auditWrites(page);const seed=await openCasino(page);
 const shot=async name=>{await page.screenshot({path:info.outputPath(`casino-games-${name}.png`)});};
 const floorShot=async name=>{await page.locator('canvas').scrollIntoViewIfNeeded();await shot(name);};
 const restore=async pose=>{await closeGame(page);expect((await snapshot(page)).player).toEqual(pose);};
 const panelFits=async()=>{
  const box=await page.locator('#casino-game-overlay').boundingBox(),viewport=page.viewportSize();
  expect(box.x).toBeGreaterThanOrEqual(0);expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x+box.width).toBeLessThanOrEqual(viewport.width+1);expect(box.y+box.height).toBeLessThanOrEqual(viewport.height+1);
 };
 await approach(page,'roulette');await floorShot('roulette-prompt');
 await page.locator('#world-collisions').click();await floorShot('interaction-debug');await page.locator('#world-collisions').click();
 let {frame,pose}=await launchGame(page,'roulette');await panelFits();await shot('roulette-open');
 await frame.locator('body').evaluate(()=>{Math.random=()=>17/37+.001;});
 await frame.locator('.rt-spot[data-bet="odd"]').click();await shot('roulette-board');await frame.locator('#rt-spin').click();
 await expect(frame.locator('#rt-result')).toContainText('17 black',{timeout:6000});await expect(page.locator('#casino-game-balance')).toHaveText('251.25');
 await frame.locator('#rt-result').scrollIntoViewIfNeeded();await shot('roulette-result');
 await frame.locator('#shell-menu-link').click();await expect(frame.locator('#shell-info-modal')).toHaveClass(/open/);
 await frame.locator('#shell-info-modal .shell-info-close').click();
 await restore(pose);await floorShot('roulette-return');

 for(const id of ['slot-1','slot-5']){
  await approach(page,id);await floorShot(`${id}-prompt`);({frame,pose}=await launchGame(page,id));await panelFits();await shot(`${id}-open`);
  await frame.locator('body').evaluate((_,win)=>{let i=0;window.getRandomSymbol=()=>win?'🍒':['🍒','🍋','🍉'][Math.floor(i++/21)%3];},id==='slot-5');
  await frame.locator('.spin-button').click();await expect(frame.locator('#history-list .history-item')).toHaveCount(1,{timeout:6000});
  await expect.poll(()=>frame.locator('.icon-container').evaluateAll(strips=>strips.every(strip=>{
   const symbol=strip.firstElementChild.getBoundingClientRect(),window=strip.parentElement.getBoundingClientRect();
   const visible=Math.min(symbol.bottom,window.bottom)-Math.max(symbol.top,window.top);
   return visible>=symbol.height*.85;
  }))).toBe(true);
  await expect(frame.locator('.spin-button')).toBeEnabled({timeout:6000});
  await shot(`${id}-result`);await restore(pose);await floorShot(`${id}-return`);
 }
 expect(await balance(page)).toBe(251.25);
 await approach(page,'coin-flip');await floorShot('coinflip-prompt');({frame,pose}=await launchGame(page,'coin-flip'));await panelFits();await shot('coinflip-open');
 await frame.locator('body').evaluate(()=>{Math.random=()=>.1;});await frame.locator('#flip-heads').click();await expect(frame.locator('#ride-pot')).toHaveText('$10.00');
 await page.locator('[data-game-close]').click();await expect(page.locator('#casino-game-status')).toContainText('Cash out');await shot('coinflip-pot');
 await frame.locator('#cash-out').click();await restore(pose);await floorShot('coinflip-return');expect(await balance(page)).toBe(256.25);

 await enterLounge(page);await walkLoungeTo(page,LOUNGE_POINTS.table);await floorShot('blackjack-prompt');await page.keyboard.press('e');
 const bj=page.frameLocator('#blackjack-frame');await expect(page.locator('#blackjack-frame')).not.toHaveAttribute('inert','');
 await dealerBustDeck(bj);await bj.locator('#speed-range').fill('2');await bj.locator('.chip-btn[data-value="1"]').click();await bj.locator('#deal-button').click();
 await expect(bj.locator('#result-message')).toHaveText('Your move…');await bj.locator('#stand-button').click();
 await expect.poll(()=>balance(page),{timeout:8000}).toBe(257.25);await shot('blackjack-result');
 await page.getByRole('button',{name:'Return to floor'}).click();await page.locator('#world-return').click();await mainReady(page);
 expect((await snapshot(page)).scene).toBe('MainCasinoFloor');await walkMainTo(page,MAIN_POINTS.south);await floorShot('casino-south-return');await page.keyboard.press('e');
 await expect.poll(async()=>(await snapshot(page)).scene).toBe('CentralLobby');await floorShot('lobby-return');
 const after=await storage(page);for(const k of ['hotelGameState','hotelGuestPool','casinoWorldState'])expect(after[k]).toBe(seed[k]);
 const ledger=await moneyWrites(page);expect(ledger.map(w=>w.value)).toEqual(['249.25','251.25','250.65','250.05','251.25','246.25','256.25','255.25','257.25']);
 expect(ledger.every(w=>/^\/(roulette|slots|coinflip|blackjack)\/index\.html$/.test(w.source))).toBe(true);
 expect((await snapshot(page)).casinoGameHost).toMatchObject({created:4,destroyed:4,liveFrames:0,parentListeners:4});expect(errors).toEqual([]);
 await info.attach('casino-game-acceptance',{body:JSON.stringify({actualGameSettlement:true,initialBalance:250.25,finalBalance:257.25,ledger,
  hotelGuestAndCheckpointBytesPreserved:true,exactOwnerReturns:4,errors}),contentType:'application/json'});
});
