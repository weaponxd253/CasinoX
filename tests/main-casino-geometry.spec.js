const {test,expect}=require('@playwright/test');
const fs=require('fs'),crypto=require('crypto');
test('Main floor preserves the exact supplied artwork',()=>{
 const b=fs.readFileSync('world/assets/casino/main-casino-floor.png');
 expect([b.readUInt32BE(16),b.readUInt32BE(20)]).toEqual([1536,1024]);
 expect(crypto.createHash('sha256').update(b).digest('hex')).toBe('143498d10180471a83e1a7eef4bbf89dc40fe7bc45f3f2e7011932fc85e6ca0b');
});
test('all Main floor guides, spawns and metadata anchors are clear with unchanged owner dimensions',async({page})=>{
 await page.goto('/');const r=await page.evaluate(async()=>{
  const l=await import('/world/main-casino-layout.js'),{MAIN_CASINO}=await import('/world/main-casino-config.js'),{distanceFromRect}=await import('/world/collision-geometry.js');
  return {size:[MAIN_CASINO.width,MAIN_CASINO.height,MAIN_CASINO.speed,MAIN_CASINO.playerRadius],
   guides:Object.values(l.MAIN_APPROACHES).every(ps=>ps.every((p,i)=>!i||l.clearSegment(ps[i-1],p,14.25))),
   anchors:Object.values(l.MAIN_FUTURE_ANCHORS).every(p=>l.walkable(p,14.25)),
   portals:Object.values(l.MAIN_PORTALS).map(p=>({clear:l.walkable(p.spawn,14.25)&&l.walkable(p.approach,14.25),spawnEligible:distanceFromRect(p.spawn,p)<=p.reach,approachEligible:distanceFromRect(p.approach,p)<=p.reach})),
   unique:new Set(l.MAIN_SOLIDS.map(s=>s.id)).size===l.MAIN_SOLIDS.length,
   outside:[{x:15,y:300},{x:945,y:300},{x:480,y:20}].map(p=>l.walkable(p))};
 });
 expect(r.size).toEqual([960,600,190,14]);expect(r.guides).toBe(true);expect(r.anchors).toBe(true);expect(r.unique).toBe(true);
 expect(r.portals).toEqual([{clear:true,spawnEligible:false,approachEligible:true},{clear:true,spawnEligible:false,approachEligible:true}]);expect(r.outside).toEqual([false,false,false]);
});
test('all portal entries and future anchors share the south spawn connected component',async({page})=>{
 await page.goto('/');const r=await page.evaluate(async()=>{
  const {walkable,MAIN_PORTALS,MAIN_FUTURE_ANCHORS}=await import('/world/main-casino-layout.js');
  const step=4,cols=241,nodes=new Uint8Array(cols*151),point=k=>({x:k%cols*step,y:Math.floor(k/cols)*step});
  for(let k=0;k<nodes.length;k++)if(walkable(point(k),14.25))nodes[k]=1;
  const start=Math.round(MAIN_PORTALS.south.spawn.y/step)*cols+120,queue=[start];nodes[start]=2;
  for(let h=0;h<queue.length;h++)for(const n of [queue[h]-1,queue[h]+1,queue[h]-cols,queue[h]+cols])if(nodes[n]===1){nodes[n]=2;queue.push(n);}
  const targets=[...Object.values(MAIN_FUTURE_ANCHORS),...Object.values(MAIN_PORTALS).flatMap(p=>[p.spawn,p.approach])];
  return {reachable:targets.map(p=>nodes[Math.round(p.y/step)*cols+Math.round(p.x/step)]===2),count:queue.length};
 });expect(r.reachable.every(Boolean)).toBe(true);expect(r.count).toBeGreaterThan(5000);
});
test('route graph is bidirectional, preserves existing room IDs and validates every arrival',async({page})=>{
 await page.goto('/');const r=await page.evaluate(async()=>{
  const m=await import('/world/room-routes.js'),checkpoint={x:480,y:190,facing:'left'},entries=m.ROOM_ROUTES.map(r=>({from:r.from,to:r.to,entry:m.routeEntry(r,checkpoint)}));
  let rejected=false;try{m.routeEntry({from:'CentralLobby',to:'CasinoRoom'},checkpoint);}catch(_){rejected=true;}
  return {entries,rejected,parents:Object.fromEntries(Object.keys(m.WORLD_ROOMS).map(k=>[k,m.backRoute(k)?.to??null]))};
 });expect(r.entries).toHaveLength(6);expect(r.rejected).toBe(true);expect(r.parents).toEqual({CentralLobby:null,MainCasinoFloor:'CentralLobby',CasinoRoom:'MainCasinoFloor',HotelInterior:'CentralLobby'});
 for(const e of r.entries)expect(r.entries.some(other=>other.from===e.to&&other.to===e.from)).toBe(true);
 expect(r.entries.find(e=>e.from==='MainCasinoFloor'&&e.to==='CentralLobby').entry).toEqual({x:480,y:190,facing:'left'});
});
