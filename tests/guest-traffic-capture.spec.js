const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const { openTraffic, traffic, snap, storage } = require('./helpers/traffic-world');

test.use({ video: { mode:'on',size:{width:1280,height:1000} },viewport:{width:1280,height:1000} });
test('seeded busy showcase records mixed traffic, safe passing, all destinations and balanced cleanup',async({page},info)=>{
  test.setTimeout(150000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const seed=await openTraffic(page,{profile:'busy',seed:19}),initial=(await traffic(page)).resources;
  await page.locator('canvas').scrollIntoViewIfNeeded();
  await page.evaluate(async()=>{
    const {walkable}=await import('/world/lobby-navigation.js');
    const o=window.trafficEvidence={captures:{},requested:{},invalid:[],animationErrors:[],running:true,maxPopulation:0,maxMoving:0};
    const capture=name=>{if(o.requested[name])return;o.requested[name]=true;
      requestAnimationFrame(()=>{o.captures[name]=document.querySelector('canvas').toDataURL('image/png')});};
    const frame=()=>{
      const world=CasinoWorldDebug.snapshot(),s=world.guestTraffic,active=s.guests.filter(g=>g.spawned&&!g.complete);
      o.maxPopulation=Math.max(o.maxPopulation,active.length);o.maxMoving=Math.max(o.maxMoving,s.movingCount);
      if(active.length>s.populationCap||s.movingCount>s.maxMoving)o.invalid.push('population/movement cap');
      for(const g of active){if(!walkable(g.position)||Math.hypot(g.position.x-world.player.x,g.position.y-world.player.y)<28)o.invalid.push(g.id);
        if(g.moving?(!g.visual.playing||g.visual.animation!==`${g.appearance}-walk-${g.facing}`):g.visual.playing)o.animationErrors.push(g.id);
        if(Math.hypot(g.velocity.x,g.velocity.y)>g.speed+0.001)o.invalid.push('speed');}
      let passing=false;
      for(let a=0;a<active.length;a++)for(let b=a+1;b<active.length;b++){
        const p=active[a],q=active[b],d=Math.hypot(p.position.x-q.position.x,p.position.y-q.position.y);
        if(d<27.999)o.invalid.push('peer overlap');
        if(p.moving&&q.moving&&d<100&&p.velocity.x*q.velocity.x+p.velocity.y*q.velocity.y<0)passing=true;
      }
      if(active.length>0&&active.length<=2)capture('traffic-quiet.png');
      if(s.stats.created>=3)capture('traffic-staggered.png');
      if(new Set(active.map(g=>g.appearance)).size===3)capture('traffic-appearances.png');
      if(s.queue.order.length>=2&&s.queue.guests.some(g=>g.state==='BEING_SERVED'))capture('traffic-reception.png');
      if(active.some(g=>g.purpose==='casino'&&g.position.y<260))capture('traffic-casino.png');
      if(active.some(g=>g.behavior==='IDLING'))capture('traffic-relaxing.png');
      if(passing)capture('traffic-passing.png');
      if(active.some(g=>g.destination.x===480&&g.destination.y===548&&g.position.y>500))capture('traffic-main-exit.png');
      if(active.length===6)capture('traffic-busy.png');
      if(o.running)requestAnimationFrame(frame);
    };requestAnimationFrame(frame);
  });
  await expect.poll(async()=>(await traffic(page)).activeCount,{timeout:45000,intervals:[50]}).toBe(6);
  await page.locator('#world-collisions').click();
  await page.locator('canvas').screenshot({path:info.outputPath('traffic-debug.png')});
  await page.locator('#world-collisions').click();
  await expect.poll(()=>page.evaluate(()=>Object.keys(trafficEvidence.captures).length),{timeout:90000,intervals:[100]}).toBe(9);
  await expect.poll(async()=>(await traffic(page)).stats.completed,{timeout:60000}).toBeGreaterThanOrEqual(8);
  await page.evaluate(()=>{trafficEvidence.running=false});
  const observed=await page.evaluate(()=>trafficEvidence);
  for(const [name,url] of Object.entries(observed.captures))fs.writeFileSync(info.outputPath(name),Buffer.from(url.split(',')[1],'base64'));
  expect(observed.invalid).toEqual([]);expect(observed.animationErrors).toEqual([]);expect(observed.maxPopulation).toBe(6);expect(observed.maxMoving).toBeLessThanOrEqual(4);
  const s=await traffic(page);expect(s.stats.completed).toBe(s.stats.despawned);expect(s.resources.visualCount).toBe(s.activeCount);
  expect(s.resources.displayObjects).toBe(initial.displayObjects+s.activeCount*2+s.resources.dialogueObjects);
  expect(s.dialogueUI.created-s.dialogueUI.destroyed).toBe(s.resources.dialogueObjects);
  expect(s.resources.worldStepListeners).toBe(initial.worldStepListeners);expect(s.resources.sceneListeners).toEqual(initial.sceneListeners);
  expect(new Set(s.guests.map(g=>g.visual.name)).size).toBe(s.guests.length);
  expect(await storage(page)).toEqual(seed);expect(errors).toEqual([]);expect((await snap(page)).failed).toBe(false);
});
