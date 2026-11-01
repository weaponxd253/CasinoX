const { enterLounge, returnToLobby } = require('./helpers/main-casino-world');
const { test, expect } = require('@playwright/test');
const { openTraffic, traffic, snap, readyTraffic, storage } = require('./helpers/traffic-world');
const { POINTS } = require('./helpers/lobby-world');

async function simulate(page, body) {
  await page.goto('/');
  return page.evaluate(async source => {
    const { GuestTrafficController } = await import('/world/guest-traffic-controller.js');
    const { seededGuestRandom, trafficConfig, GUEST_TRAFFIC_CONFIG } = await import('/world/guest-traffic-config.js');
    const { GUEST_APPEARANCES } = await import('/world/guest-appearances.js');
    const nav = await import('/world/lobby-navigation.js');
    const { LOBBY_SOLIDS } = await import('/world/lobby-layout.js');
    const { constrainFootprintMovement } = await import('/world/collision-geometry.js');
    return (0,eval)(`(${source})`)({ GuestTrafficController, seededGuestRandom, trafficConfig,
      GUEST_TRAFFIC_CONFIG, GUEST_APPEARANCES, LOBBY_SOLIDS, constrainFootprintMovement, ...nav });
  },body.toString());
}

test('defaults start quiet, use active 15-30s intervals and preserve read-only settings', async ({ page }) => {
  const result=await simulate(page,({GuestTrafficController,seededGuestRandom,trafficConfig})=>{
    const t=new GuestTrafficController({rng:seededGuestRandom(19)}), initial=t.snapshot(), due=t.nextArrivalMs;
    while(t.activeMs+50<due)t.update(50,{x:206,y:220,radius:14});
    const quiet=t.snapshot();t.update(50,{x:206,y:220,radius:14});const arrived=t.snapshot();
    const copy=t.snapshot();copy.settings.points.southSpawn.x=-1;copy.settings.weights.casino=-1;
    const errors=[];
    for(const config of [{minArrivalMs:-1},{minArrivalMs:30001},{hardCap:0},{maxMoving:0},{weights:{casino:-2}},
      {weights:{unknown:1}},{maxSpeed:NaN}]){try{trafficConfig(config);errors.push('accepted')}catch(_){errors.push('rejected')}}
    return{initial,quiet,arrived,errors,config:t.snapshot().settings,clamped:trafficConfig({maxVisible:100,hardCap:8})};
  });
  expect(result.initial.activeCount).toBe(0);expect(result.initial.nextArrivalMs).toBeGreaterThanOrEqual(15000);
  expect(result.initial.nextArrivalMs).toBeLessThanOrEqual(30000);expect(result.quiet.activeCount).toBe(0);
  expect(result.arrived.stats.created).toBe(1);expect(result.arrived.nextArrivalMs).toBeGreaterThanOrEqual(15000);
  expect(result.arrived.guests[0].id).toBe('guest-000001');expect(result.config.points.southSpawn.x).toBe(520);
  expect(result.config.weights.casino).toBe(30);expect(result.errors.every(e=>e==='rejected')).toBe(true);
  expect(result.clamped.maxVisible).toBe(8);
});

for(const purpose of ['casino','hotelDeparture'])test(`occupied ${purpose} entrance retains one pending arrival without duplicates or catch-up bursts`,async({page})=>{
  const source=({GuestTrafficController,seededGuestRandom})=>{
    const purpose=PURPOSE;
    const t=new GuestTrafficController({rng:seededGuestRandom(2),config:{minArrivalMs:200,maxArrivalMs:200,
      weights:{checkIn:0,casino:0,relaxing:0,hotelDeparture:0,[purpose]:1}}});
    const entrance=purpose==='hotelDeparture'?t.config.points.hotelSpawn:t.config.points.southSpawn;
    for(let i=0;i<200;i++)t.update(50,{...entrance,radius:14});
    const blocked=t.snapshot(),nextId=t.nextId;
    t.update(50,{x:206,y:220,radius:14});const created=t.snapshot();
    return{blocked,nextId,created};
  };
  const result=await simulate(page,source.toString().replace('PURPOSE',JSON.stringify(purpose)));
  expect(result.blocked.stats.created).toBe(0);expect(result.blocked.pending).toMatchObject({state:'SPAWNING',reason:'entrance-occupied'});
  expect(result.nextId).toBe(1);expect(result.created.stats.created).toBe(1);expect(result.created.guests[0].id).toBe('guest-000001');
  expect(result.created.nextArrivalMs).toBe(200);
});

test('seeded selection keeps weighted purposes configurable and avoids consecutive appearance duplication',async({page})=>{
  const result=await simulate(page,({GuestTrafficController,seededGuestRandom})=>{
    const picker=new GuestTrafficController({rng:seededGuestRandom(88)}), counts={checkIn:0,casino:0,relaxing:0,hotelDeparture:0};
    for(let i=0;i<10000;i++)counts[picker.choosePurpose()]++;
    const t=new GuestTrafficController({rng:seededGuestRandom(19),config:{minArrivalMs:1000,maxArrivalMs:2000}});
    const arrivals=[];let previous=0;
    for(let i=0;i<6000;i++){t.update(50,{x:206,y:220,radius:14});if(t.stats.created>previous){arrivals.push(t.history.at(-1));previous=t.stats.created;}}
    return{counts,arrivals};
  });
  for(const [purpose,weight] of Object.entries({checkIn:40,casino:30,relaxing:15,hotelDeparture:15}))expect(Math.abs(result.counts[purpose]/100-weight)).toBeLessThan(2);
  expect(new Set(result.arrivals.map(g=>g.id)).size).toBe(result.arrivals.length);
  expect(new Set(result.arrivals.map(g=>g.appearance)).size).toBe(8);
  expect(result.arrivals.every((g,i)=>i===0||g.appearance!==result.arrivals[i-1].appearance)).toBe(true);
});

test('every registered appearance can complete every purpose with physical exits, correct service and eligible idle time',async({page})=>{
  const result=await simulate(page,({GuestTrafficController,seededGuestRandom,GUEST_APPEARANCES})=>{
    const results=[];
    for(const [appearance,definition] of Object.entries(GUEST_APPEARANCES))for(const purpose of ['checkIn','casino','relaxing','hotelDeparture']){
      const t=new GuestTrafficController({rng:seededGuestRandom(19),appearances:{[appearance]:definition},config:{minArrivalMs:100,maxArrivalMs:100,
        weights:{checkIn:0,casino:0,relaxing:0,hotelDeparture:0,[purpose]:1}}});
      while(!t.stats.created)t.update(50,{x:206,y:220,radius:14});
      const created=t.guestSnapshot(t.guests[0]);t.stopArrivals();
      for(let i=0;i<1500&&t.guests.length;i++)t.update(50,{x:206,y:220,radius:14});
      results.push({appearance,purpose,created,completed:t.completedHistory[0]??null,left:t.guests.length,
        reservations:t.queue.slots.filter(s=>s.reservedBy||s.clearingBy).length+t.idleSlots.filter(s=>s.reservedBy||s.clearingBy).length});
    }return results;
  });
  expect(result).toHaveLength(32);
  for(const r of result){expect(r.left,r.purpose).toBe(0);expect(r.reservations).toBe(0);expect(r.completed.appearance).toBe(r.appearance);
    expect(r.completed.purpose).toBe(r.purpose);expect(r.completed.position).toEqual(r.purpose==='casino'?{x:480,y:174}:
      r.purpose==='hotelDeparture'?{x:480,y:548}:r.purpose==='checkIn'?{x:856,y:314}:r.completed.position);
    if(r.purpose==='checkIn')expect(r.completed.serviceEndedMs-r.completed.serviceStartedMs).toBe(8000);
    if(r.purpose==='relaxing'){expect(r.completed.idleElapsedMs).toBeGreaterThanOrEqual(10000);expect(r.completed.idleElapsedMs).toBeLessThanOrEqual(25000);
      expect(r.completed.idleElapsedMs).toBeCloseTo(r.completed.idleDurationMs,6);}}
});

test('full reception delays check-in admission while unrelated visitors continue, then FCFS service recovers',async({page})=>{
  const result=await simulate(page,({GuestTrafficController,seededGuestRandom})=>{
    const t=new GuestTrafficController({rng:seededGuestRandom(19),config:{minArrivalMs:500,maxArrivalMs:1000}});
    for(let i=0;i<1200;i++)t.update(50,{x:252,y:220,radius:14});
    const blocked=t.snapshot(),admitted=blocked.queue.arrivalOrder.slice();t.stopArrivals();
    for(let i=0;i<3000&&t.guests.length;i++)t.update(50,{x:206,y:220,radius:14});
    return{blocked,admitted,final:t.snapshot()};
  });
  expect(result.blocked.queue.order).toHaveLength(3);expect(result.blocked.queue.slots.filter(s=>s.reservedBy)).toHaveLength(3);
  expect(result.blocked.stats.completed).toBeGreaterThan(0);expect(result.blocked.guests.length).toBeLessThanOrEqual(6);
  expect(result.final.activeCount).toBe(0);expect(result.final.queue.serviceOrder).toEqual(result.admitted);
});

for(const purpose of ['checkIn','relaxing'])test(`${purpose} active timer and arrival countdown freeze and resume with the same IDs`,async({page})=>{
  const source=({GuestTrafficController,seededGuestRandom})=>{
    const purpose=PURPOSE,t=new GuestTrafficController({rng:seededGuestRandom(3),config:{minArrivalMs:1000,maxArrivalMs:1000,
      weights:{checkIn:0,casino:0,relaxing:0,hotelDeparture:0,[purpose]:1}}});
    for(let i=0;i<240;i++)t.update(50,{x:206,y:220,radius:14});
    t.suspend();const before=t.snapshot();for(let i=0;i<300;i++)t.update(50,{x:206,y:220,radius:14});const frozen=t.snapshot();
    t.resume();t.update(50,{x:206,y:220,radius:14});return{before,frozen,resumed:t.snapshot()};
  };
  const r=await simulate(page,source.toString().replace('PURPOSE',JSON.stringify(purpose)));
  expect(r.frozen).toEqual(r.before);expect(r.before.guests.every(g=>!g.moving)).toBe(true);expect(r.resumed.activeMs).toBe(r.before.activeMs+50);
  expect(r.resumed.guests.map(g=>g.id)).toEqual(r.before.guests.map(g=>g.id));
  const timer=purpose==='checkIn'?'serviceRemainingMs':'idleRemainingMs';
  expect(r.resumed.guests[0][timer]).toBeCloseTo(r.before.guests[0][timer]-50,5);
});

for(const cap of [6,8])for(const seed of [1,19,42])test(`600 active seconds at cap ${cap}, seed ${seed}: bounded traffic, collision safety and complete cleanup`,async({page})=>{
  test.setTimeout(120000);
  const source=({GuestTrafficController,seededGuestRandom,walkable,clearSegment,lobbyPath})=>{
    const t=new GuestTrafficController({rng:seededGuestRandom(SEED),config:{minArrivalMs:1500,maxArrivalMs:2500,maxVisible:CAP,
      hardCap:8,minIdleMs:20000,maxIdleMs:25000,historyLimit:32}});
    const original=lobbyPath({x:340,y:300},{x:252,y:220}),invalid=[];
    for(let i=0;i<12000;i++){
      const before=new Map(t.guests.map(g=>[g.id,{...g.controller.position}]));
      t.update(50,{x:206,y:220,radius:14});const gs=t.activeGuests();
      if(gs.length>CAP||t.movedThisStep.length>4)invalid.push('cap');
      if(t.queue.slots.map(s=>s.reservedBy).filter(Boolean).length>3)invalid.push('queue capacity');
      for(const g of gs){const c=g.controller,p=c.position,b=before.get(g.id);
        if(!walkable(p)||Math.hypot(p.x-206,p.y-220)<28)invalid.push('static/owner');
        if(b&&(!clearSegment(b,p)||Math.hypot(p.x-b.x,p.y-b.y)>c.speed*0.05+0.001))invalid.push('jump/sweep');
        for(const other of gs)if(other!==g&&Math.hypot(p.x-other.controller.position.x,p.y-other.controller.position.y)<27.999)invalid.push('peer');}
      if(i===1000){t.suspend();const frozen=JSON.stringify(t.snapshot());for(let j=0;j<40;j++)t.update(50,{x:206,y:220,radius:14});
        if(JSON.stringify(t.snapshot())!==frozen)invalid.push('pause');t.resume();}
      if(invalid.length)break;
    }
    const at600=t.snapshot();t.stopArrivals();for(let i=0;i<3000&&t.guests.length;i++)t.update(50,{x:206,y:220,radius:14});
    return{invalid,at600,final:t.snapshot(),entries:t.queue.entries.size,permits:t.permits.size,
      original,after:lobbyPath({x:340,y:300},{x:252,y:220})};
  };
  const r=await simulate(page,source.toString().replaceAll('CAP',String(cap)).replace('SEED',String(seed)));
  expect(r.invalid).toEqual([]);expect(r.at600.activeMs).toBe(600000);expect(r.at600.stats.maxPopulation).toBe(cap);
  expect(r.at600.stats.maxMovingObserved).toBeLessThanOrEqual(4);expect(r.at600.stats.completed).toBeGreaterThan(20);
  expect(r.final.activeCount).toBe(0);expect(r.final.stats.created).toBe(r.final.stats.completed);
  expect(r.final.stats.despawned).toBe(r.final.stats.completed);expect(r.entries).toBe(0);expect(r.permits).toBe(0);
  expect(r.final.queue.slots.every(s=>!s.reservedBy&&!s.clearingBy)).toBe(true);
  expect(r.final.idleSlots.every(s=>!s.reservedBy&&!s.clearingBy)).toBe(true);
  expect(r.final.history.length).toBeLessThanOrEqual(32);expect(r.final.completedHistory.length).toBeLessThanOrEqual(32);
  expect(r.final.queue.arrivalOrder.length).toBeLessThanOrEqual(32);expect(r.final.stats.navigationCalls).toBeLessThan(20000);
  expect(r.after).toEqual(r.original);
});

test('six-guest owner pursuit keeps priority, valid retreat, bounded steps and no overlaps',async({page})=>{
  test.setTimeout(60000);
  const result=await simulate(page,({GuestTrafficController,seededGuestRandom,LOBBY_SOLIDS,constrainFootprintMovement,walkable})=>{
    const t=new GuestTrafficController({rng:seededGuestRandom(19),config:{minArrivalMs:1500,maxArrivalMs:2500}});
    let owner={x:480,y:498,radius:14},bad=0,held=0,travel=0;
    for(let i=0;i<3000;i++){
      const previous={...owner};let next={...owner};const active=t.activeGuests();
      if(i>200&&active.length){const target=i%160<80?active[0].controller.position:{x:340,y:460};
        const d=Math.hypot(target.x-owner.x,target.y-owner.y);if(d>10)next=constrainFootprintMovement(owner,
          {x:owner.x+(target.x-owner.x)/d*190*.05,y:owner.y+(target.y-owner.y)/d*190*.05},LOBBY_SOLIDS,14);}
      const guard=t.update(50,{...next,previous,radius:14,vx:(next.x-previous.x)/.05,vy:(next.y-previous.y)/.05});
      owner={...guard.position,radius:14};if(guard.held)held++;travel+=Math.hypot(owner.x-previous.x,owner.y-previous.y);
      // The unchanged static resolver can slide/project a corner contact. The
      // guest guard must only shorten that already-corrected attempted segment.
      if(!walkable(owner)||t.movedThisStep.length>4||Math.hypot(owner.x-previous.x,owner.y-previous.y)
        >Math.hypot(next.x-previous.x,next.y-previous.y)+0.001)bad++;
      if((owner.x-previous.x)*(next.x-previous.x)+(owner.y-previous.y)*(next.y-previous.y)<-0.00001)bad++;
      for(const g of t.activeGuests()){const p=g.controller.position;if(Math.hypot(p.x-owner.x,p.y-owner.y)<27.999)bad++;}
    }
    return{bad,held,travel,stats:t.stats};
  });
  expect(result.bad).toBe(0);expect(result.held).toBeGreaterThan(0);expect(result.travel).toBeGreaterThan(1000);
});

test('normal page stays quiet; debug tuning is opt-in and title/scene saves remain unchanged',async({page},info)=>{
  test.setTimeout(50000);
  const seed=await openTraffic(page);const initial=await traffic(page);
  expect(initial.mode).toBe('dynamic');expect(initial.activeCount).toBe(0);expect(initial.settings.minArrivalMs).toBe(15000);
  expect(initial.nextArrivalMs).toBeGreaterThan(14000);expect(await storage(page)).toEqual(seed);
  await expect.poll(async()=>(await traffic(page)).stats.created,{timeout:35000}).toBe(1);
  await page.locator('canvas').screenshot({path:info.outputPath('traffic-normal-quiet.png')});
  await page.reload();await readyTraffic(page);expect((await traffic(page)).stats.created).toBe(0);expect(await storage(page)).toEqual(seed);
});

test('a missing dynamic appearance uses the cosmetic fallback with independent runtime IDs and balanced visuals',async({page})=>{
  test.setTimeout(35000);
  await page.route('**/world/assets/guests/business-traveler/business-traveler.png',r=>r.abort());
  const seed=await openTraffic(page,{profile:'busy'}),base=(await traffic(page)).resources.displayObjects;
  await expect.poll(async()=>(await traffic(page)).guests.some(g=>g.appearance==='business-traveler'),{timeout:25000}).toBe(true);
  const s=await traffic(page),business=s.guests.find(g=>g.appearance==='business-traveler');
  expect(business.visual).toMatchObject({mode:'circle',hasPhysicsBody:false,visible:true});
  expect(business.id).not.toBe(business.appearance);expect(new Set(s.guests.map(g=>g.id)).size).toBe(s.guests.length);
  expect(s.resources.displayObjects).toBe(base+s.guests.reduce((n,g)=>n+(g.visual.mode==='sprite'?2:1),0)+s.resources.dialogueObjects);
  expect(await storage(page)).toEqual(seed);expect((await snap(page)).failed).toBe(false);
});

for(const room of ['CasinoRoom','HotelInterior'])test(`${room} sleep/wake preserves live dynamic guests, timers and resource counts`,async({page})=>{
  test.setTimeout(60000);const seed=await openTraffic(page,{profile:'busy',position:room==='CasinoRoom'?POINTS.casino:POINTS.hotel});
  const initial=(await traffic(page)).resources;
  await expect.poll(async()=>(await traffic(page)).stats.created,{timeout:15000}).toBeGreaterThanOrEqual(3);
  if(room==='CasinoRoom')await enterLounge(page);else await page.keyboard.press('e');await expect.poll(async()=>(await snap(page)).scene).toBe(room);
  const frozen=await traffic(page);await page.waitForTimeout(250);expect(await traffic(page)).toEqual(frozen);
  expect(frozen.movingCount).toBe(0);expect(frozen.guests.every(g=>!g.visual.playing&&!g.moving)).toBe(true);
  if(room==='CasinoRoom')await returnToLobby(page);else await page.keyboard.press('Escape');await expect.poll(async()=>(await snap(page)).scene).toBe('CentralLobby');
  await expect.poll(async()=>(await traffic(page)).activeMs).toBeGreaterThan(frozen.activeMs);
  const resumed=await traffic(page);expect(resumed.guests.map(g=>g.id)).toEqual(frozen.guests.map(g=>g.id));
  expect(resumed.resources.worldStepListeners).toBe(initial.worldStepListeners);expect(resumed.resources.sceneListeners).toEqual(initial.sceneListeners);
  expect(await storage(page)).toEqual(seed);
});
