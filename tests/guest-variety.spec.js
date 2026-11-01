const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spriteLab,simulate,openVariety,traffic,storage }=require('./helpers/variety-world');

const sources = {
  'conference-attendee': 'c43303ba1c6bc926b1e557abfe81eaa260146b29ed198f4251638080d827990f',
  'vacation-tourist': 'cb4d1b94ab56775df600d025b62ea957999e097734764cf81f1694d3904a7652',
  'luxury-hotel-guest': '0f2b53aab4111af5f957d49dc6558b3ef9e0fde72bc2fce6b344f33661d41f9d',
  'young-casino-visitor': '9b7600d11a542f5ef9fd709cfd5ccdf9fd5839e2117d553e4b7301d63e852093',
  'high-roller': 'd3ab3d9a0292b4c91158b0c2d9d8a4e2123c61faa34c7b2a3c5d252d15acc572',
};

for (const [name, originalHash] of Object.entries(sources)) {
  test(`${name} supplied artwork retains silhouette and faint edges in sixteen safely packed frames`, async ({ page }) => {
    const folder = path.resolve(__dirname, '../world/assets/guests', name);
    const meta = JSON.parse(fs.readFileSync(path.join(folder, `${name}-frames.json`)));
    const hash = file => createHash('sha256').update(fs.readFileSync(path.join(folder, file))).digest('hex');
    expect(hash(`${name}-source.png`)).toBe(originalHash);
    expect(meta.sourceSha256).toBe(originalHash);
    expect(hash(`${name}.png`)).toBe(meta.preparedSha256);
    expect(meta.frames.map(f => f.direction)).toEqual(['down','left','right','up'].flatMap(d => Array(4).fill(d)));
    expect(meta.cleanup.retainedFaintEdgePixels).toBeGreaterThan(30000);
    if (name === 'luxury-hotel-guest') expect(meta.cleanup.removedBackgroundPixels).toBeGreaterThan(890000);
    await page.goto('/');
    const decoded = await page.evaluate(async ({ name, meta }) => {
      const load = async suffix => {
        const image = new Image(); image.src = `/world/assets/guests/${name}/${name}${suffix}.png`; await image.decode();
        const c = document.createElement('canvas'); c.width=image.width; c.height=image.height;
        const ctx=c.getContext('2d');ctx.drawImage(image,0,0);
        return {width:image.width,height:image.height,pixels:ctx.getImageData(0,0,c.width,c.height).data};
      };
      const source=await load('-source'),packed=await load('');
      const seed=(x,y)=>x>=0&&x<1024&&y>=0&&y<1536&&source.pixels[(y*1024+x)*4+3]>=32;
      let mismatch=0,sourceCore=0,packedCore=0,packedPixels=0;const frames=[];
      for(let i=3;i<source.pixels.length;i+=4)if(source.pixels[i]>=32)sourceCore++;
      for(const frame of meta.frames){
        const [left,top,right,bottom]=frame.sourceWindow,[dx,dy]=frame.translation;
        let minX=256,minY=384,maxX=-1,maxY=-1;
        for(let y=0;y<384;y++)for(let x=0;x<256;x++){
          const out=((Math.floor(frame.frame/4)*384+y)*1024+frame.frame%4*256+x)*4;
          const sx=left+x-dx,sy=top+y-dy;let input=-1;
          if(sx>=left&&sx<right&&sy>=top&&sy<bottom){
            const offset=(sy*1024+sx)*4,a=source.pixels[offset+3];let retain=a>=32;
            if(a>0&&!retain)for(let oy=-2;oy<=2&&!retain;oy++)for(let ox=-2;ox<=2&&!retain;ox++)retain=Boolean(seed(sx+ox,sy+oy));
            if(retain)input=offset;
          }
          for(let c=0;c<4;c++)if(packed.pixels[out+c] !== (input<0?0:source.pixels[input+c]))mismatch++;
          const a=packed.pixels[out+3];if(a)packedPixels++;
          if(a>=32){packedCore++;minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
        }
        frames.push([minX,minY,maxX+1,maxY+1]);
      }
      return {sourceSize:[source.width,source.height],size:[packed.width,packed.height],mismatch,sourceCore,packedCore,packedPixels,frames};
    }, {name,meta});
    expect(decoded.sourceSize).toEqual([1024,1536]);expect(decoded.size).toEqual([1024,1536]);
    expect(decoded.mismatch).toBe(0);expect(decoded.packedCore).toBe(decoded.sourceCore);
    expect(decoded.packedPixels).toBe(meta.cleanup.retainedPixels);
    for(const [i,b] of decoded.frames.entries()){
      expect(b).toEqual(meta.frames[i].preparedCoreBounds);expect(b[3]).toBe(368);
      expect(b[0]).toBeGreaterThanOrEqual(16);expect(b[2]).toBeLessThanOrEqual(240);expect(b[1]).toBeGreaterThanOrEqual(8);
      expect(Math.abs((b[0]+b[2])/2-128)).toBeLessThanOrEqual(.5);
    }
  });
}

test('eight registered appearances use shared renderer mappings, idle frames and advancing animations in all four directions',async({page},info)=>{
  await spriteLab(page);
  for(const [direction,start] of [['down',0],['left',4],['right',8],['up',12]]){
    await page.evaluate(direction=>spriteLab.visuals.forEach((v,i)=>v.sync(spriteLab.positions[i],direction,true)),direction);
    const seen=Array.from({length:8},()=>new Set());
    await expect.poll(async()=>{
      const values=await page.evaluate(()=>spriteLab.visuals.map(v=>({id:v.config.id,...v.snapshot()})));
      expect(values).toHaveLength(8);
      values.forEach((v,i)=>{
        expect(v).toMatchObject({mode:'sprite',width:48,height:72,scaleMode:1,hasPhysicsBody:false,playing:true,facing:direction});
        expect(v.walkingAnimations.map(a=>a.frames)).toEqual([[0,1,2,3],[4,5,6,7],[8,9,10,11],[12,13,14,15]]);
        expect(v.frame).toBeGreaterThanOrEqual(start);expect(v.frame).toBeLessThan(start+4);seen[i].add(v.frame);
      });return Math.min(...seen.map(s=>s.size));
    },{intervals:[30]}).toBe(4);
    await page.evaluate(direction=>spriteLab.visuals.forEach((v,i)=>v.sync(spriteLab.positions[i],direction,false)),direction);
    const stopped=await page.evaluate(()=>spriteLab.visuals.map(v=>v.snapshot()));
    expect(stopped.every(v=>v.frame===start&&!v.playing)).toBe(true);
  }
  await page.locator('#sprite-lab canvas').screenshot({path:info.outputPath('variety-calibration.png')});
  await page.evaluate(()=>spriteLab.game.destroy(true));
});

for(const name of Object.keys(sources))test(`${name} missing artwork has a safe shared cosmetic fallback`,async({page})=>{
  await spriteLab(page,{missing:name});
  const values=await page.evaluate(()=>spriteLab.visuals.map(v=>({id:v.config.id,...v.snapshot()})));
  expect(values.find(v=>v.id===name)).toMatchObject({mode:'circle',placeholderVisible:true,hasPhysicsBody:false});
  expect(values.filter(v=>v.mode==='sprite')).toHaveLength(7);
  await page.evaluate(()=>spriteLab.game.destroy(true));
});

test('bounded appearance scoring retains all eight choices and avoids consecutive and nearby idle duplicates',async({page})=>{
  const result=await simulate(page,({GuestTrafficController,seededGuestRandom})=>{
    const t=new GuestTrafficController({rng:seededGuestRandom(19)}),counts={};let previous=null,duplicates=0;
    for(let i=0;i<1000;i++){
      const id=t.chooseAppearance({x:520,y:548},'casino');if(id===previous)duplicates++;
      counts[id]=(counts[id]??0)+1;t.stats.created++;t.appearanceLastUsed.set(id,t.stats.created);t.lastAppearance=id;previous=id;
    }
    const near=new GuestTrafficController({rng:seededGuestRandom(19)});
    const g=near.makeGuest({id:'selection-fixture',appearance:'luxury-hotel-guest',speed:85,spawn:{x:626,y:350}});
    g.controller.spawned=true;near.guests.push(g);
    const idlePicks=Array.from({length:100},()=>near.chooseAppearance({x:520,y:548},'relaxing',{x:626,y:350}));
    return{counts,duplicates,idlePicks,size:t.appearanceLastUsed.size};
  });
  expect(Object.keys(result.counts)).toHaveLength(8);expect(Math.min(...Object.values(result.counts))).toBeGreaterThan(80);
  expect(result.duplicates).toBe(0);expect(result.size).toBe(8);expect(result.idlePicks).not.toContain('luxury-hotel-guest');
});

test('live eight-appearance registry keeps scale, anchoring, depth and saved data intact',async({page})=>{
  const seed=await openVariety(page);
  await expect.poll(async()=>(await traffic(page)).stats.created,{timeout:15000}).toBeGreaterThanOrEqual(3);
  const s=await traffic(page);expect(s.registeredAppearanceCount).toBe(8);
  for(const g of s.guests){
    expect(g.visual).toMatchObject({mode:'sprite',width:48,height:72,hasPhysicsBody:false});
    expect(g.visual.x).toBe(Math.round(g.position.x));expect(g.visual.y).toBe(Math.round(g.position.y+g.radius));
  }
  expect(s.appearanceHistory.length).toBeLessThanOrEqual(64);expect(await storage(page)).toEqual(seed);
});
