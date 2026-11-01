import { ExplorableScene } from './explorable-scene.js';
import { MAIN_CASINO } from './main-casino-config.js';
import { MAIN_ART, MAIN_PORTALS, MAIN_APPROACHES, MAIN_FUTURE_ANCHORS, MAIN_FOREGROUNDS, toWorld } from './main-casino-layout.js';
import { constrainFootprintMovement } from './collision-geometry.js';
import { CASINO_ATTRACTIONS } from './casino-attractions.js';

const imageUrl=new URL('./assets/casino/main-casino-floor.png',import.meta.url).href;
export class MainCasinoFloorScene extends ExplorableScene {
  constructor(host){super('MainCasinoFloor',host,MAIN_CASINO);}
  preload(){super.preload();this.load.image(MAIN_ART.key,imageUrl,{timeout:5000});}
  create(){
    if(this.host.hasFailed()){this.events.once('create',()=>this.game.scene.pause(this));return;}
    const texture=this.textures.exists(MAIN_ART.key)&&this.textures.get(MAIN_ART.key),source=texture&&texture.getSourceImage();
    if(!source||source.width!==1536||source.height!==1024){this.host.onError(new Error('Main Casino Floor artwork could not load or has invalid dimensions. Your saved data has not been replaced.'));return;}
    texture.setFilter(window.Phaser.Textures.FilterMode.NEAREST);
    super.create();
    this.finishContacts=()=>{
      const b=this.player.body,previous={x:b.prev.x+b.halfWidth,y:b.prev.y+b.halfHeight};
      try{const p=constrainFootprintMovement(previous,b.center,this.config.solids,14);b.position.x+=p.x-b.center.x;b.position.y+=p.y-b.center.y;b.updateCenter();}
      catch(error){this.host.onError(error);}
    };
    this.physics.world.on('worldstep',this.finishContacts);
    this.finishFrame=()=>{
      const feet=this.player.y+14;
      for(const layer of this.foregrounds)layer.foreground.setDepth(10+(layer.baseline-feet)/1000);
      this.drawCollisions();
    };
    this.events.on('postupdate',this.finishFrame);
    this.events.once('shutdown',()=>{this.physics.world.off('worldstep',this.finishContacts);this.events.off('postupdate',this.finishFrame);});
  }
  drawRoom(){
    this.add.rectangle(480,300,960,600,0x000000);
    const image=()=>this.add.image(30,0,MAIN_ART.key).setOrigin(0).setDisplaySize(900,600);
    this.background=image().setDepth(0);
    this.foregrounds=MAIN_FOREGROUNDS.map(d=>{
      const graphics=this.make.graphics({x:0,y:0},false);graphics.fillStyle(0xffffff).fillPoints(d.points.map(p=>toWorld(...p)),true);
      const mask=graphics.createGeometryMask(),foreground=image().setMask(mask).setDepth(5);
      this.events.once('shutdown',()=>{mask.destroy();graphics.destroy();});
      return {id:d.id,foreground,baseline:toWorld(0,d.baseline).y};
    });
    this.halos=new Map(Object.entries(MAIN_PORTALS).map(([key,p])=>['main-'+key,this.add.rectangle(p.x,p.y,p.width+8,p.height+8).setStrokeStyle(2,0xf0d699).setDepth(25).setVisible(false)]));
    for (const a of CASINO_ATTRACTIONS) this.halos.set(a.id, this.add.rectangle(a.position.x, a.position.y,
      a.position.width, a.position.height).setStrokeStyle(2, 0xf0d699).setDepth(25).setVisible(false));
    this.collisionOverlay=this.add.graphics().setDepth(100).setVisible(new URLSearchParams(location.search).has('collisions'));
    this.debugLabel=this.add.text(40,8,'',{fontFamily:'monospace',fontSize:'12px',color:'#a8ffe3',backgroundColor:'#10211f'}).setDepth(101).setVisible(false);
  }
  toggleCollisions(){this.collisionOverlay.setVisible(!this.collisionOverlay.visible);this.drawCollisions();}
  drawCollisions(){
    const visible=this.collisionOverlay.visible;this.debugLabel.setVisible(visible);if(!visible)return;
    const g=this.collisionOverlay.clear();
    for(const s of this.config.solids){g.fillStyle(0xff5268,.3).lineStyle(1,0xff6375,.85);
      if(s.radius!==undefined)g.fillCircle(s.x,s.y,s.radius).strokeCircle(s.x,s.y,s.radius);else g.fillRect(s.x-s.width/2,s.y-s.height/2,s.width,s.height).strokeRect(s.x-s.width/2,s.y-s.height/2,s.width,s.height);}
    for(const p of Object.values(MAIN_PORTALS)){g.lineStyle(2,0x5de8ed).strokeRoundedRect(p.x-p.width/2-p.reach,p.y-p.height/2-p.reach,p.width+p.reach*2,p.height+p.reach*2,p.reach);g.lineStyle(2,0x6dffd0).strokeCircle(p.spawn.x,p.spawn.y,14);}
    g.lineStyle(2,0xffd36d);for(const path of Object.values(MAIN_APPROACHES))g.strokePoints(path,false);
    for(const p of Object.values(MAIN_FUTURE_ANCHORS))g.strokeCircle(p.x,p.y,5);
    for (const a of CASINO_ATTRACTIONS) {
      const p = a.position;
      g.lineStyle(1, 0xf0d699).strokeRoundedRect(p.x-p.width/2-a.radius, p.y-p.height/2-a.radius,
        p.width+a.radius*2, p.height+a.radius*2, a.radius);
      g.lineStyle(1, 0x70fbe1).strokeCircle(a.approach.x, a.approach.y, 14);
      if (this.getInteraction() === a.id) g.strokePoints([this.player, a.approach], false);
    }
    g.lineStyle(2,0xffffff).strokeCircle(this.player.x,this.player.y,14);
    this.debugLabel.setText(`MainCasinoFloor | owner ${this.player.x.toFixed(1)},${this.player.y.toFixed(1)} | radius 14 | speed 190\n${this.config.solids.length} bodies | cyan portals / green spawns / gold attraction regions\nSelected: ${this.getInteraction() ?? 'none'} | 7 attractions | casino NPCs: none`);
  }
  artworkSnapshot(){return this.background?{x:30,y:0,width:900,height:600,sourceWidth:this.background.texture.getSourceImage().width,sourceHeight:this.background.texture.getSourceImage().height,scaleMode:this.background.frame.source.scaleMode}:null;}
  geometrySnapshot(){return {solids:this.config.solids.map(s=>({...s})),portals:structuredClone(MAIN_PORTALS),approaches:structuredClone(MAIN_APPROACHES),anchors:structuredClone(MAIN_FUTURE_ANCHORS),foregrounds:this.foregrounds.map(l=>({id:l.id,baseline:l.baseline,depth:l.foreground.depth})),resources:{displayObjects:this.children.list.length,worldStepListeners:this.physics.world.listenerCount('worldstep'),postUpdateListeners:this.events.listenerCount('postupdate'),colliders:this.physics.world.colliders.getActive().length}};}
}
