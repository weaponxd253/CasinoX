const {test,expect}=require('@playwright/test');
const {simulate,openVariety,traffic,snap,storage}=require('./helpers/variety-world');
const {POINTS}=require('./helpers/lobby-world');

for(const personality of ['relaxed','excited','reserved','impatient','discerning']){
  test(`${personality} independently completes all four purposes with every registered appearance`,async({page})=>{
    test.setTimeout(90000);
    const source=({GuestTrafficController,GUEST_APPEARANCES,GUEST_PERSONALITIES,seededGuestRandom})=>{
      const personality=PERSONALITY,results=[];
      for(const [appearance,definition]of Object.entries(GUEST_APPEARANCES))for(const purpose of ['checkIn','casino','relaxing','hotelDeparture']){
        const t=new GuestTrafficController({rng:seededGuestRandom(19),personalities:{[personality]:GUEST_PERSONALITIES[personality]},
          appearances:{[appearance]:definition},config:{minArrivalMs:100,maxArrivalMs:100,
            weights:{checkIn:0,casino:0,relaxing:0,hotelDeparture:0,[purpose]:1}}});
        while(!t.stats.created)t.update(50,{x:206,y:220,radius:14});
        const initial=t.guestSnapshot(t.guests[0]);t.stopArrivals();let changed=false;
        for(let i=0;i<1800&&t.guests.length;i++){
          t.update(50,{x:206,y:220,radius:14});
          if(t.guests.some(g=>g.personality!==personality||g.controller.speed!==initial.speed))changed=true;
        }
        results.push({appearance,purpose,initial,changed,left:t.guests.length,done:t.completedHistory[0],
          entries:t.queue.entries.size,permits:t.permits.size,idle:t.idleSlots.some(s=>s.reservedBy||s.clearingBy)});
      }return results;
    };
    const results=await simulate(page,source.toString().replace('PERSONALITY',JSON.stringify(personality)));
    expect(results).toHaveLength(32);
    for(const r of results){
      expect(r.changed).toBe(false);expect(r.left).toBe(0);expect(r.entries).toBe(0);expect(r.permits).toBe(0);expect(r.idle).toBe(false);
      expect(r.initial.personality).toBe(personality);expect(r.initial.speed).toBeGreaterThanOrEqual(78);expect(r.initial.speed).toBeLessThanOrEqual(92);
      expect(r.done).toMatchObject({appearance:r.appearance,personality,purpose:r.purpose});
      if(r.purpose==='checkIn')expect(r.done.serviceEndedMs-r.done.serviceStartedMs).toBe(8000);
      if(r.purpose==='relaxing'){expect(r.done.idleElapsedMs).toBeGreaterThanOrEqual(10000);expect(r.done.idleElapsedMs).toBeLessThanOrEqual(25000);
        expect(r.done.idleElapsedMs).toBeCloseTo(r.done.idleDurationMs,6);}
    }
  });
}

test('personality sampling is independent, reproducible and clamped to current traffic limits',async({page})=>{
  const r=await simulate(page,({GuestTrafficController,GUEST_PERSONALITIES,chooseGuestPersonality,personalityRangeValue,seededGuestRandom,guestRandomStreams})=>{
    const a=guestRandomStreams(19),b=guestRandomStreams(19),same=[];
    for(let i=0;i<100;i++){a.dialogue();a.dialogue();same.push(a.traffic()===b.traffic()&&a.personality()===b.personality());}
    const rng=seededGuestRandom(41),counts={};for(let i=0;i<10000;i++){const id=chooseGuestPersonality(GUEST_PERSONALITIES,rng).id;counts[id]=(counts[id]??0)+1;}
    const make=()=>new GuestTrafficController({rng:seededGuestRandom(19),config:{minArrivalMs:1000,maxArrivalMs:2000,minSpeed:88,maxSpeed:89,minIdleMs:24000,maxIdleMs:24001}});
    const one=make(),two=make();for(let i=0;i<2000;i++){one.update(50,{x:206,y:220,radius:14});two.update(50,{x:206,y:220,radius:14});}
    return{same,counts,one:one.snapshot(),two:two.snapshot(),clamps:[0,1,.5].map(roll=>personalityRangeValue([-10,20],78,92,roll))};
  });
  expect(r.same.every(Boolean)).toBe(true);expect(r.one).toEqual(r.two);expect(Object.keys(r.counts)).toHaveLength(5);
  for(const value of Object.values(r.counts))expect(Math.abs(value/100-20)).toBeLessThan(2);
  expect(r.clamps).toEqual([78,92,85]);
  for(const g of r.one.history){expect(g.speed).toBeGreaterThanOrEqual(88);expect(g.speed).toBeLessThanOrEqual(89);}
  expect(r.one.registeredPersonalityCount).toBe(5);
});

test('impatient waiting turns stay on the reserved anchor and never bypass FCFS or shorten service',async({page})=>{
  const r=await simulate(page,({GuestTrafficController,GUEST_PERSONALITIES,seededGuestRandom})=>{
    const t=new GuestTrafficController({rng:seededGuestRandom(19),personalities:{impatient:GUEST_PERSONALITIES.impatient},
      config:{minArrivalMs:500,maxArrivalMs:1000,weights:{checkIn:1,casino:0,relaxing:0,hotelDeparture:0}}});
    let turns=0,bad=0;
    for(let i=0;i<1200;i++){
      t.update(50,{x:252,y:220,radius:14});
      for(const g of t.guests)if(g.presentationFacing){turns++;const e=t.queue.entries.get(g.id),s=t.queue.slots[e.slot].position;
        if(e.state!=='WAITING'||g.controller.moving||Math.hypot(s.x-g.controller.position.x,s.y-g.controller.position.y)>.01)bad++;}
    }
    const admitted=[...t.queue.arrivalOrder];t.stopArrivals();
    for(let i=0;i<3000&&t.guests.length;i++)t.update(50,{x:206,y:220,radius:14});
    return{turns,bad,admitted,final:t.snapshot()};
  });
  expect(r.turns).toBeGreaterThan(0);expect(r.bad).toBe(0);expect(r.final.activeCount).toBe(0);
  expect(r.final.queue.serviceOrder).toEqual(r.admitted);
  for(const g of r.final.completedHistory)expect(g.serviceEndedMs-g.serviceStartedMs).toBe(8000);
});

test('sleep and wake preserve live personality identities, preferences, animations and saved data',async({page})=>{
  test.setTimeout(45000);const values=await openVariety(page,{position:POINTS.hotel});
  await expect.poll(async()=>(await traffic(page)).stats.created,{timeout:15000}).toBeGreaterThanOrEqual(3);
  await page.keyboard.press('e');await expect.poll(async()=>(await snap(page)).scene).toBe('HotelInterior');
  const frozen=await traffic(page);await page.waitForTimeout(250);expect(await traffic(page)).toEqual(frozen);
  expect(frozen.guests.every(g=>g.personality&&!g.visual.playing)).toBe(true);
  await page.keyboard.press('Escape');await expect.poll(async()=>(await snap(page)).scene).toBe('CentralLobby');
  const resumed=await traffic(page);expect(resumed.guests.map(g=>[g.id,g.personality,g.speed])).toEqual(frozen.guests.map(g=>[g.id,g.personality,g.speed]));
  expect(await storage(page)).toEqual(values);
});
