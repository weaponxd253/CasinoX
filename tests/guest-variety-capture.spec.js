const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const {openVariety,traffic,snap,storage,walkTo}=require('./helpers/variety-world');

test.use({video:{mode:'on',size:{width:1280,height:1000}},viewport:{width:1280,height:1000}});

test('seeded actual-time variety showcase captures supplied appearances, personalities, speech and owner passage',async({page},info)=>{
  test.setTimeout(210000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const values=await openVariety(page,{seed:1}),base=(await traffic(page)).resources;
  await page.locator('canvas').scrollIntoViewIfNeeded();
  await page.evaluate(async initialObjects=>{
    const {walkable}=await import('/world/lobby-navigation.js');
    const {GUEST_DIALOGUE_LINES}=await import('/world/guest-dialogue-config.js');
    const o=window.varietyEvidence={captures:{},requested:{},invalid:[],running:true,walkingOwner:false,
      maxPopulation:0,maxMoving:0,maxBubbles:0,looks:[],personalities:[],directions:[]};
    const looks=new Set(),personalities=new Set(),directions=new Set();
    const bad=message=>{if(o.invalid.length<20)o.invalid.push(message)};
    const capture=name=>{if(o.requested[name])return;o.requested[name]=true;
      requestAnimationFrame(()=>{o.captures[name]=document.querySelector('canvas').toDataURL('image/png')})};
    const frame=()=>{
      const world=CasinoWorldDebug.snapshot(),s=world.guestTraffic,gs=s.guests;
      o.maxPopulation=Math.max(o.maxPopulation,gs.length);o.maxMoving=Math.max(o.maxMoving,s.movingCount);
      o.maxBubbles=Math.max(o.maxBubbles,s.dialogueUI.visibleCount);
      if(gs.length>6||s.movingCount>4||s.dialogue.activeCount>1||s.dialogueUI.visibleCount>1)bad('cap');
      if(s.dialogue.trackedCount!==gs.length||s.dialogueUI.created-s.dialogueUI.destroyed!==s.resources.dialogueObjects)bad('dialogue cleanup');
      if(s.resources.displayObjects!==o.baseObjects+gs.reduce((n,g)=>n+(g.visual.mode==='sprite'?2:1),0)+s.resources.dialogueObjects)bad('display objects');
      for(const g of gs){
        looks.add(g.appearance);personalities.add(g.personality);
        if(!walkable(g.position)||Math.hypot(g.position.x-world.player.x,g.position.y-world.player.y)<27.999)bad('static/owner');
        if(g.moving){directions.add(g.facing);if(!g.visual.playing||g.visual.animation!==`${g.appearance}-walk-${g.facing}`)bad('walk animation');}
        else if(g.visual.playing)bad('idle animation');
        if(g.visual.x!==Math.round(g.position.x)||g.visual.y!==Math.round(g.position.y+g.radius))bad('foot anchor');
        const q=s.queue.guests.find(e=>e.id===g.id);
        if(g.appearance==='high-roller'&&s.activeMs-g.spawnedAtMs<3000)capture('variety-high-roller-entry.png');
        if(g.appearance==='young-casino-visitor'&&g.purpose==='casino'&&g.position.y<300)capture('variety-young-casino.png');
        if(g.appearance==='conference-attendee'&&['WAITING','BEING_SERVED'].includes(q?.state))capture('variety-conference-reception.png');
        if(g.appearance==='vacation-tourist'&&g.behavior==='IDLING')capture('variety-tourist-seating.png');
        if(g.appearance==='luxury-hotel-guest'&&g.destinationName==='hotel'&&g.position.x>780)capture('variety-luxury-hotel.png');
        if(g.personality==='impatient'&&q?.state==='WAITING')capture('variety-impatient-queue.png');
      }
      for(let a=0;a<gs.length;a++)for(let b=a+1;b<gs.length;b++)if(Math.hypot(gs[a].position.x-gs[b].position.x,gs[a].position.y-gs[b].position.y)<27.999)bad('peer overlap');
      for(const b of s.dialogue.bubbles)if(!GUEST_DIALOGUE_LINES[b.personality][b.context].includes(b.text))bad('speech text');
      for(const b of s.dialogueUI.bubbles){const r=b.bounds;if(b.hasInput||r.x<0||r.y<0||r.x+r.width>960||r.y+r.height>600)bad('bubble bounds/input');}
      if(new Set(gs.map(g=>g.appearance)).size>=5)capture('variety-appearances.png');
      if(gs.length===6)capture('variety-busy.png');
      if(s.dialogue.bubbles.some(b=>b.personality==='relaxed')&&s.dialogueUI.visibleCount)capture('variety-relaxed-dialogue.png');
      if(s.dialogue.stats.expired>0&&s.dialogueUI.visibleCount===0)capture('variety-speech-expired.png');
      if(o.walkingOwner&&Math.hypot(world.velocity.x,world.velocity.y)>100&&gs.length>=3)capture('variety-owner-passage.png');
      o.looks=[...looks];o.personalities=[...personalities];o.directions=[...directions];
      if(o.running)requestAnimationFrame(frame);
    };o.baseObjects=initialObjects;
    requestAnimationFrame(frame);
  },base.displayObjects);
  try {
    await expect.poll(()=>page.evaluate(()=>Object.keys(varietyEvidence.captures).length),{timeout:150000,intervals:[100]}).toBe(10);
  } catch(error) {
    const partial=await page.evaluate(()=>({...varietyEvidence,captures:Object.keys(varietyEvidence.captures),world:CasinoWorldDebug.snapshot()}));
    fs.writeFileSync(info.outputPath('variety-observed.json'),JSON.stringify(partial,null,2));throw error;
  }
  expect(await storage(page)).toEqual(values);
  await page.evaluate(()=>{varietyEvidence.walkingOwner=true});
  await walkTo(page,{x:340,y:460});await walkTo(page,{x:380,y:210});
  await expect.poll(()=>page.evaluate(()=>Boolean(varietyEvidence.captures['variety-owner-passage.png']))).toBe(true);
  await page.locator('#world-collisions').click();
  await page.locator('canvas').screenshot({path:info.outputPath('variety-debug.png')});
  await page.locator('#world-collisions').click();
  await page.evaluate(()=>{varietyEvidence.running=false});
  const observed=await page.evaluate(()=>varietyEvidence);
  for(const [name,url]of Object.entries(observed.captures))fs.writeFileSync(info.outputPath(name),Buffer.from(url.split(',')[1],'base64'));
  expect(observed.invalid).toEqual([]);expect(observed.maxPopulation).toBe(6);expect(observed.maxMoving).toBeLessThanOrEqual(4);
  expect(observed.maxBubbles).toBe(1);expect(observed.looks).toHaveLength(8);expect(observed.personalities).toHaveLength(5);
  expect(observed.directions.sort()).toEqual(['down','left','right','up']);
  const s=await traffic(page);expect(s.stats.completed).toBeGreaterThan(8);
  expect(s.resources.worldStepListeners).toBe(base.worldStepListeners);expect(s.resources.sceneListeners).toEqual(base.sceneListeners);
  const saved=await storage(page);for(const [key,value]of Object.entries(values))if(key!=='casinoWorldState')expect(saved[key]).toBe(value);
  const world=JSON.parse(saved.casinoWorldState);expect(world.version).toBe(2);expect(world.phase5cSentinel).toBe('preserve');
  expect(Object.keys(world).sort()).toEqual(Object.keys(JSON.parse(values.casinoWorldState)).sort());
  expect(errors).toEqual([]);expect((await snap(page)).failed).toBe(false);
});

test('normal production traffic intervals show supplied guest variety without a busy profile or save changes',async({page},info)=>{
  test.setTimeout(50000);const values=await openVariety(page,{profile:null,seed:1});
  const initial=await traffic(page);expect(initial.activeCount).toBe(0);expect(initial.profile).toBe(null);
  expect(initial.settings.minArrivalMs).toBe(15000);expect(initial.settings.maxArrivalMs).toBe(30000);
  expect(initial.registeredAppearanceCount).toBe(8);expect(initial.registeredPersonalityCount).toBe(5);
  await expect.poll(async()=>(await traffic(page)).stats.created,{timeout:35000}).toBe(1);
  await page.locator('canvas').screenshot({path:info.outputPath('variety-normal.png')});
  expect(await storage(page)).toEqual(values);expect((await snap(page)).failed).toBe(false);
});
