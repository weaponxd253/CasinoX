const { enterLounge, returnToLobby } = require('./helpers/main-casino-world');
const {test,expect}=require('@playwright/test');
const {simulate,openVariety,traffic,snap,storage,walkTo}=require('./helpers/variety-world');
const {POINTS}=require('./helpers/lobby-world');

test('all personalities select valid short lines from their actual lifecycle context',async({page})=>{
  const r=await simulate(page,({GuestDialogueController,GUEST_PERSONALITIES,GUEST_DIALOGUE_LINES,guestDialogueContext,dialogueConfig})=>{
    const cases={entering:{spawnedAtMs:19999},waiting:{queueState:'WAITING',arrived:true,moving:false},
      casino:{purpose:'casino',position:{x:480,y:200}},relaxing:{state:'IDLING',arrived:true,moving:false},departing:{state:'DEPARTING'}};
    const results=[];
    for(const personality of Object.keys(GUEST_PERSONALITIES))for(const [context,props]of Object.entries(cases)){
      const g={id:'test',spawned:true,complete:false,spawnedAtMs:0,position:{x:340,y:460},moving:true,state:'WALKING',purpose:'checkIn',personality,...props};
      const d=new GuestDialogueController({rng:()=>0,config:{minInitialMs:0,maxInitialMs:0}});d.update(20000,[g]);
      results.push({context,detected:guestDialogueContext(g,20000),bubble:d.activeBubbles()[0],allowed:GUEST_DIALOGUE_LINES[personality][context]});
    }
    const invalid=[];for(const c of [{maxVisible:0},{minDurationMs:0},{minCooldownMs:-1},{walkingChanceMultiplier:2}]){
      try{dialogueConfig(c);invalid.push(false)}catch(_){invalid.push(true)}}
    return{results,invalid,clamped:dialogueConfig({maxVisible:100}).maxVisible};
  });
  expect(r.results).toHaveLength(25);expect(r.invalid.every(Boolean)).toBe(true);expect(r.clamped).toBe(2);
  for(const x of r.results){expect(x.detected).toBe(x.context);expect(x.bubble.context).toBe(x.context);
    expect(x.allowed).toContain(x.bubble.text);expect(x.bubble.text.length).toBeLessThan(50);}
});

test('active-time expiration, cooldowns, one/two-bubble caps, priority and pause are deterministic',async({page})=>{
  const r=await simulate(page,({GuestDialogueController})=>{
    const g={id:'one',spawned:true,complete:false,spawnedAtMs:0,position:{x:626,y:350},moving:false,arrived:true,state:'IDLING',purpose:'relaxing',personality:'relaxed'};
    const config={minInitialMs:0,maxInitialMs:0,minDurationMs:3000,maxDurationMs:3000,minCooldownMs:30000,maxCooldownMs:30000,minGlobalGapMs:0,maxGlobalGapMs:0};
    const d=new GuestDialogueController({rng:()=>0,config});d.update(0,[g]);const first=d.snapshot();
    d.update(2999,[g]);const almost=d.snapshot();d.update(3000,[g]);const expired=d.snapshot();
    d.update(29999,[g]);const cooling=d.snapshot();d.update(30000,[g]);const next=d.snapshot();
    d.suspend();const frozen=d.snapshot();for(let i=0;i<100;i++)d.update(900000,[g]);const afterPause=d.snapshot();
    d.resume();d.update(30050,[g],{priority:true});const hidden=d.snapshot();d.update(33000,[g],{priority:true});const hiddenExpired=d.snapshot();
    d.update(33050,[]);const empty=d.snapshot();
    const guests=[g,{...g,id:'two'},{...g,id:'three'}];
    const one=new GuestDialogueController({rng:()=>0,config}),two=new GuestDialogueController({rng:()=>0,config:{...config,maxVisible:2}});
    one.update(0,guests);two.update(0,guests);
    return{first,almost,expired,cooling,next,frozen,afterPause,hidden,hiddenExpired,empty,one:one.snapshot(),two:two.snapshot()};
  });
  expect(r.first.activeCount).toBe(1);expect(r.first.bubbles[0].remainingMs).toBe(3000);expect(r.almost.bubbles[0].remainingMs).toBe(1);
  expect(r.expired.activeCount).toBe(0);expect(r.cooling.activeCount).toBe(0);expect(r.next.activeCount).toBe(1);
  expect(r.next.bubbles[0].lineId).not.toBe(r.first.bubbles[0].lineId);expect(r.afterPause).toEqual(r.frozen);
  expect(r.hidden.activeCount).toBe(1);expect(r.hidden.visibleCount).toBe(0);expect(r.hidden.bubbles[0].remainingMs).toBe(2950);
  expect(r.hiddenExpired.activeCount).toBe(0);expect(r.empty.trackedCount).toBe(0);
  expect(r.one.activeCount).toBe(1);expect(r.two.activeCount).toBe(2);
});

test('speech checks are infrequent, Reserved and walking guests are quieter, and histories/models remain bounded',async({page})=>{
  const r=await simulate(page,({GuestDialogueController,seededGuestRandom})=>{
    const run=(personality,moving)=>{
      const rng=seededGuestRandom(19);let calls=0;
      const d=new GuestDialogueController({rng:()=>{calls++;return rng()},config:{minInitialMs:0,maxInitialMs:0,
        minDurationMs:1,maxDurationMs:1,minCooldownMs:0,maxCooldownMs:0,minGlobalGapMs:0,maxGlobalGapMs:0,minCheckMs:1000,maxCheckMs:1000,historyLimit:8}});
      const g={id:'one',personality,spawned:true,complete:false,spawnedAtMs:0,position:{x:480,y:200},moving,arrived:!moving,
        state:moving?'WALKING':'IDLING',purpose:moving?'casino':'relaxing'};
      for(let i=0;i<12000;i++)d.update(i*50,[g]);const before=d.snapshot();d.update(600000,[]);
      return{spoken:before.stats.spoken,calls,history:before.history.length,final:d.snapshot()};
    };return{standing:run('excited',false),walking:run('excited',true),reserved:run('reserved',false)};
  });
  expect(r.standing.spoken).toBeGreaterThan(200);expect(r.walking.spoken).toBeLessThan(r.standing.spoken*.25);
  expect(r.reserved.spoken).toBeLessThan(r.standing.spoken*.35);
  for(const x of Object.values(r)){expect(x.calls).toBeLessThan(4000);expect(x.history).toBeLessThanOrEqual(8);expect(x.final.trackedCount).toBe(0);
    expect(x.final.stats.spoken).toBe(x.final.stats.expired+x.final.stats.removed);}
});

for(const cap of [6,8])test(`dialogue and personality traffic remain bounded for ten active minutes at cap ${cap}`,async({page})=>{
  test.setTimeout(120000);
  const source=({GuestTrafficController,GuestDialogueController,guestRandomStreams,GUEST_DIALOGUE_LINES,walkable,clearSegment})=>{
    const streams=guestRandomStreams(19),t=new GuestTrafficController({rng:streams.traffic,personalityRng:streams.personality,
      config:{minArrivalMs:1500,maxArrivalMs:2500,maxVisible:CAP,minIdleMs:20000,maxIdleMs:25000,historyLimit:16}});
    const d=new GuestDialogueController({rng:streams.dialogue,config:{historyLimit:16}}),looks=new Set(),personalities=new Set(),bad=[];
    const step=()=>{
      const before=new Map(t.guests.map(g=>[g.id,{...g.controller.position}]));t.update(50,{x:206,y:220,radius:14});
      const guests=t.activeGuests().map(g=>({id:g.id,personality:g.personality,spawned:true,complete:false,spawnedAtMs:g.spawnedAtMs,
        purpose:g.purpose,position:g.controller.position,moving:g.controller.moving,arrived:g.controller.arrived,
        queueState:t.queue.entries.get(g.id)?.state,state:t.queue.entries.get(g.id)?.state==='DEPARTING'?'DEPARTING':g.state}));
      d.update(t.activeMs,guests);
      if(d.states.size>guests.length||d.activeBubbles().length>1||t.movedThisStep.length>4)bad.push('cap');
      for(const g of t.activeGuests()){
        looks.add(g.appearance);personalities.add(g.personality);const p=g.controller.position,b=before.get(g.id);
        if(!walkable(p)||(b&&(!clearSegment(b,p)||Math.hypot(p.x-b.x,p.y-b.y)>g.speed*.05+.001)))bad.push('movement');
        for(const other of t.activeGuests())if(other!==g&&Math.hypot(p.x-other.controller.position.x,p.y-other.controller.position.y)<27.999)bad.push('peer');
      }
      for(const b of d.activeBubbles())if(!GUEST_DIALOGUE_LINES[b.personality][b.context].includes(b.text))bad.push('line');
    };
    for(let i=0;i<12000;i++)step();const peak=t.stats.maxPopulation,spoken=d.stats.spoken;t.stopArrivals();
    for(let i=0;i<3000&&t.guests.length;i++)step();d.update(t.activeMs,[]);
    return{bad,peak,spoken,looks:[...looks],personalities:[...personalities],traffic:t.snapshot(),dialogue:d.snapshot()};
  };
  const r=await simulate(page,source.toString().replace('CAP',String(cap)));
  expect(r.bad).toEqual([]);expect(r.peak).toBe(cap);expect(r.spoken).toBeGreaterThan(3);
  expect(r.looks).toHaveLength(8);expect(r.personalities).toHaveLength(5);
  expect(r.traffic.activeCount).toBe(0);expect(r.dialogue.trackedCount).toBe(0);expect(r.dialogue.activeCount).toBe(0);
  expect(r.dialogue.history.length).toBeLessThanOrEqual(16);
  expect(r.dialogue.stats.spoken).toBe(r.dialogue.stats.expired+r.dialogue.stats.removed);
});

test('dialogue activity cannot perturb seeded traffic arrivals, purposes, routes or personality assignment',async({page})=>{
  const r=await simulate(page,({GuestTrafficController,GuestDialogueController,guestRandomStreams})=>{
    const make=()=>{const s=guestRandomStreams(19);return{t:new GuestTrafficController({rng:s.traffic,personalityRng:s.personality,
      config:{minArrivalMs:1500,maxArrivalMs:2500}}),d:new GuestDialogueController({rng:s.dialogue})}};
    const a=make(),b=make();
    for(let i=0;i<3000;i++){
      a.t.update(50,{x:206,y:220,radius:14});b.t.update(50,{x:206,y:220,radius:14});
      a.d.update(a.t.activeMs,a.t.guests.map(g=>({id:g.id,personality:g.personality,spawned:true,spawnedAtMs:g.spawnedAtMs,
        purpose:g.purpose,position:g.controller.position,arrived:g.controller.arrived,moving:g.controller.moving,state:g.state})));
    }return{a:a.t.snapshot(),b:b.t.snapshot()};
  });
  expect(r.a).toEqual(r.b);
});

test('live speech expires, follows guests, stays inside the canvas and releases noninteractive UI objects',async({page})=>{
  test.setTimeout(65000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const values=await openVariety(page),base=(await traffic(page)).resources.displayObjects;
  await expect.poll(async()=>(await traffic(page)).dialogueUI.visibleCount,{timeout:50000,intervals:[50]}).toBe(1);
  const s=await traffic(page),bubble=s.dialogue.bubbles[0],ui=s.dialogueUI.bubbles.find(b=>b.id===bubble.id);
  expect(ui.hasInput).toBe(false);expect(ui.bounds.x).toBeGreaterThanOrEqual(0);expect(ui.bounds.y).toBeGreaterThanOrEqual(0);
  expect(ui.bounds.x+ui.bounds.width).toBeLessThanOrEqual(960);expect(ui.bounds.y+ui.bounds.height).toBeLessThanOrEqual(600);
  expect(s.resources.displayObjects).toBe(base+s.activeCount*2+s.resources.dialogueObjects);
  expect(s.dialogueUI.created-s.dialogueUI.destroyed).toBe(s.resources.dialogueObjects);
  await expect.poll(async()=>(await traffic(page)).dialogue.bubbles.some(b=>b.id===bubble.id&&b.startedAtMs===bubble.startedAtMs),{timeout:5500}).toBe(false);
  expect(await storage(page)).toEqual(values);expect(errors).toEqual([]);
});

test('owner prompts and conversations take priority while lobby sleep preserves dialogue clocks',async({page})=>{
  test.setTimeout(70000);const values=await openVariety(page,{position:POINTS.reception});
  await expect.poll(async()=>(await traffic(page)).stats.created,{timeout:15000}).toBeGreaterThanOrEqual(3);
  const before=await traffic(page);expect(before.dialogue.priority).toBe(true);expect(before.dialogueUI.visibleCount).toBe(0);
  await page.keyboard.press('e');const frozen=await traffic(page);expect(frozen.dialogue.suspended).toBe(true);
  await page.waitForTimeout(300);expect(await traffic(page)).toEqual(frozen);
  await page.keyboard.press('Escape');await expect.poll(async()=>(await traffic(page)).activeMs).toBeGreaterThan(frozen.activeMs);
  expect(await storage(page)).toEqual(values);
  await walkTo(page,{x:380,y:210});
  await expect.poll(async()=>(await traffic(page)).dialogue.priority).toBe(false);
  const p=(await snap(page)).player;await page.keyboard.down('d');await page.waitForTimeout(160);await page.keyboard.up('d');
  expect((await snap(page)).player.x).toBeGreaterThan(p.x+10);
  const after=await storage(page);for(const [key,value]of Object.entries(values))if(key!=='casinoWorldState')expect(after[key]).toBe(value);
});

test('an active speech instance hides and freezes through an actual lounge visit without restarting',async({page})=>{
  test.setTimeout(90000);const values=await openVariety(page,{seed:1});
  await expect.poll(async()=>{
    const s=await traffic(page);return s.dialogueUI.visibleCount===1&&s.dialogue.bubbles.some(b=>b.context==='waiting'&&b.remainingMs>3000);
  },{timeout:60000,intervals:[50]}).toBe(true);
  const speaking=(await traffic(page)).dialogue.bubbles[0];
  await walkTo(page,POINTS.casino);await enterLounge(page);
  await expect.poll(async()=>(await snap(page)).scene).toBe('CasinoRoom');
  const frozen=await traffic(page),bubble=frozen.dialogue.bubbles.find(b=>b.id===speaking.id&&b.startedAtMs===speaking.startedAtMs);
  expect(bubble).toBeTruthy();expect(frozen.dialogue.suspended).toBe(true);expect(frozen.dialogueUI.visibleCount).toBe(0);
  await page.waitForTimeout(400);expect(await traffic(page)).toEqual(frozen);
  await returnToLobby(page);await expect.poll(async()=>(await snap(page)).scene).toBe('CentralLobby');
  await expect.poll(async()=>(await traffic(page)).activeMs).toBeGreaterThan(frozen.activeMs);
  const resumed=await traffic(page),continued=resumed.dialogue.bubbles.find(b=>b.id===speaking.id);
  expect(continued.startedAtMs).toBe(speaking.startedAtMs);expect(continued.lineId).toBe(speaking.lineId);
  expect(continued.remainingMs).toBeGreaterThan(bubble.remainingMs-350);expect(continued.remainingMs).toBeLessThanOrEqual(bubble.remainingMs);
  expect(resumed.dialogueUI.created).toBe(frozen.dialogueUI.created);
  const saved=await storage(page);for(const [key,value]of Object.entries(values))if(key!=='casinoWorldState')expect(saved[key]).toBe(value);
});
