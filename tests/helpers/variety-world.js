const { expect } = require('@playwright/test');
const { openTraffic, traffic, snap, storage, readyTraffic } = require('./traffic-world');
const { walkTo } = require('./lobby-world');

const openVariety = (page, options = {}) => openTraffic(page, {
  position: { x:380,y:210,facing:'down' }, profile:'busy', seed:19, ...options,
});

async function simulate(page, body) {
  await page.goto('/');
  return page.evaluate(async source => {
    const traffic = await import('/world/guest-traffic-controller.js');
    const config = await import('/world/guest-traffic-config.js');
    const appearances = await import('/world/guest-appearances.js');
    const nav = await import('/world/lobby-navigation.js');
    const personalities = await import('/world/guest-personalities.js');
    const dialogue = await import('/world/guest-dialogue-controller.js');
    const lines = await import('/world/guest-dialogue-config.js');
    return (0,eval)(`(${source})`)({ ...traffic,...config,...appearances,...nav,...personalities,...dialogue,...lines });
  },body.toString());
}

// Isolated visual calibration, never used as evidence of a gameplay journey.
// It uses the production renderer and real lobby artwork without moving live guests.
async function spriteLab(page, { missing = null } = {}) {
  if (missing) await page.route(`**/world/assets/guests/${missing}/${missing}.png`, r => r.abort());
  await page.goto('/');
  await page.evaluate(() => { document.body.innerHTML='<p>Sprite calibration only · no traffic simulation</p><div id="sprite-lab"></div>'; });
  await page.addScriptTag({url:'/floor/vendor/phaser.min.js'});
  await page.evaluate(async () => {
    const { GUEST_APPEARANCES,preloadGuestAppearances,createGuestVisual }=await import('/world/guest-appearances.js');
    const { LOBBY_ART }=await import('/world/lobby-layout.js');
    const positions=[{x:252,y:220},{x:300,y:252},{x:348,y:252},{x:340,y:300},
      {x:340,y:460},{x:620,y:460},{x:626,y:350},{x:480,y:174}];
    await new Promise(resolve=>{
      window.spriteLab={visuals:[],positions};
      spriteLab.game=new Phaser.Game({type:Phaser.CANVAS,parent:'sprite-lab',width:960,height:600,
        banner:false,audio:{noAudio:true},scene:{
          preload(){preloadGuestAppearances(this);this.load.image('lab-lobby','/world/assets/lobby/central-lobby.png');},
          create(){
            this.add.image(LOBBY_ART.x,LOBBY_ART.y,'lab-lobby').setOrigin(0).setDisplaySize(LOBBY_ART.width,LOBBY_ART.height);
            spriteLab.visuals=Object.keys(GUEST_APPEARANCES).map((id,i)=>{
              const v=createGuestVisual(this,id,`calibration-${id}`);v.setVisible(true);v.sync(positions[i],'down',false);return v;
            });
            resolve();
          },
        }});
    });
  });
  await expect(page.locator('#sprite-lab canvas')).toBeVisible();
}

module.exports={openVariety,traffic,snap,storage,readyTraffic,walkTo,simulate,spriteLab};
