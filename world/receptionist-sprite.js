import { OWNER_SPRITE } from './owner-sprite.js';
import { toWorld } from './lobby-layout.js';

// Presentation only: this NPC owns no physics, hotel record, clock or save data.
export const RECEPTIONIST_SPRITE = Object.freeze({ key: 'lobby-receptionist',
  frameWidth: 256, frameHeight: 384, footBaseline: 368,
  scale: OWNER_SPRITE.scale / 4, frameRate: OWNER_SPRITE.frameRate,
  position: Object.freeze({ ...toWorld(300, 296) }),
  rows: Object.freeze({ down: 0, left: 4, right: 8, up: 12 }),
  idle: Object.freeze({ down: 0, left: 4, right: 8, up: 12 }),
});

// Painted counter pixels are drawn through the lobby's existing depth/mask path.
// This adds presentation geometry only; LOBBY_SOLIDS is unchanged.
export const RECEPTION_COUNTER_FOREGROUND = Object.freeze({ id: 'reception-counter', baseline: 336,
  points: [[104, 260], [498, 260], [498, 294], [456, 337], [153, 337], [104, 302]] });

const requestedGames = new WeakSet();
const assetUrl = new URL('./assets/receptionist/receptionist.png', import.meta.url).href;
export function preloadReceptionistSprite(scene) {
  if (requestedGames.has(scene.game)) return;
  requestedGames.add(scene.game);
  scene.load.spritesheet(RECEPTIONIST_SPRITE.key, assetUrl, {
    frameWidth: RECEPTIONIST_SPRITE.frameWidth, frameHeight: RECEPTIONIST_SPRITE.frameHeight,
  });
}

export class ReceptionistSprite {
  constructor(scene) {
    this.scene = scene;
    const config = RECEPTIONIST_SPRITE;
    const x = Math.round(config.position.x), y = Math.round(config.position.y);
    this.fallback = scene.add.circle(x, y - 35, 12, 0x467365).setStrokeStyle(2, 0xe9ce98).setDepth(4);
    this.fallback.setName('receptionist-placeholder');
    if (!scene.textures.exists(config.key)) return;
    const texture = scene.textures.get(config.key), source = texture.getSourceImage();
    if (source.width !== config.frameWidth * 4 || source.height !== config.frameHeight * 4
      || Array.from({ length: 16 }, (_, i) => i).some(i => !texture.has(i))) return;
    texture.setFilter(window.Phaser.Textures.FilterMode.NEAREST);
    // Keep CSS scaling sharp even if the owner's own artwork uses its fallback.
    scene.game.canvas.style.imageRendering = 'pixelated';
    for (const [direction, start] of Object.entries(config.rows)) {
      const key = `receptionist-walk-${direction}`;
      if (!scene.anims.exists(key)) scene.anims.create({ key,
        frames: scene.anims.generateFrameNumbers(config.key, { start, end: start + 3 }),
        frameRate: config.frameRate, repeat: -1 });
    }
    this.sprite = scene.add.sprite(x, y, config.key, config.idle.down)
      .setOrigin(0.5, config.footBaseline / config.frameHeight).setScale(config.scale).setDepth(4);
    this.sprite.setName('receptionist-sprite');
    this.fallback.setVisible(false);
  }

  snapshot() {
    const sprite = this.sprite;
    return { mode: sprite ? 'sprite' : 'circle', facing: 'down',
      x: sprite?.x ?? this.fallback.x, y: sprite?.y ?? Math.round(RECEPTIONIST_SPRITE.position.y),
      frame: sprite ? Number(sprite.frame.name) : null, playing: sprite?.anims.isPlaying ?? false,
      width: sprite?.displayWidth ?? null, height: sprite?.displayHeight ?? null,
      scaleMode: sprite?.frame.source.scaleMode ?? null, depth: sprite?.depth ?? this.fallback.depth,
      hasPhysicsBody: Boolean(sprite?.body), placeholderVisible: this.fallback.visible,
      walkingAnimations: sprite ? Object.keys(RECEPTIONIST_SPRITE.rows).map(direction => {
        const animation = this.scene.anims.get(`receptionist-walk-${direction}`);
        return { key: animation.key, frames: animation.frames.map(frame => Number(frame.textureFrame)),
          frameRate: animation.frameRate, repeat: animation.repeat };
      }) : [] };
  }
}
