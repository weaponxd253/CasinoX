// Owner artwork is a presentation layer over the original circle physics body.
export const OWNER_SPRITE = Object.freeze({
  key: 'resort-owner', frameWidth: 64, frameHeight: 96,
  scale: 0.75, footBaseline: 92, frameRate: 8,
  rows: Object.freeze({ down: 0, left: 4, right: 8, up: 12 }),
  idle: Object.freeze({ down: 0, left: 4, right: 8, up: 15 }),
});

const requestedGames = new WeakSet();
const assetUrl = new URL('./assets/owner/owner.png', import.meta.url).href;

export function preloadOwnerSprite(scene) {
  // One queued load per game. A failed initial load must not add an asynchronous
  // loader delay to later sleep/wake room transitions; reload can retry.
  if (requestedGames.has(scene.game)) return;
  requestedGames.add(scene.game);
  scene.load.spritesheet(OWNER_SPRITE.key, assetUrl, {
    frameWidth: OWNER_SPRITE.frameWidth, frameHeight: OWNER_SPRITE.frameHeight,
  });
}

export class OwnerSprite {
  constructor(scene, radius) {
    this.radius = radius;
    if (!scene.textures.exists(OWNER_SPRITE.key)) return;
    const texture = scene.textures.get(OWNER_SPRITE.key);
    const source = texture.getSourceImage();
    if (source.width !== 256 || source.height !== 384
      || Array.from({ length: 16 }, (_, frame) => frame).some(frame => !texture.has(frame))) return;
    texture.setFilter(window.Phaser.Textures.FilterMode.NEAREST);
    for (const [direction, start] of Object.entries(OWNER_SPRITE.rows)) {
      const key = `owner-walk-${direction}`;
      if (!scene.anims.exists(key)) scene.anims.create({
        key, frames: scene.anims.generateFrameNumbers(OWNER_SPRITE.key, { start, end: start + 3 }),
        frameRate: OWNER_SPRITE.frameRate, repeat: -1,
      });
    }
    this.sprite = scene.add.sprite(0, 0, OWNER_SPRITE.key)
      .setOrigin(0.5, OWNER_SPRITE.footBaseline / OWNER_SPRITE.frameHeight)
      .setScale(OWNER_SPRITE.scale).setDepth(10);
    this.sprite.setName('owner-sprite');
    // Phaser texture filtering handles sprite scaling; CSS handles FIT canvas scaling.
    scene.game.canvas.style.imageRendering = 'pixelated';
  }

  place(position) {
    if (!this.sprite) return;
    this.sprite.setPosition(Math.round(position.x), Math.round(position.y + this.radius));
  }

  sync(position, facing, moving) {
    if (!this.sprite) return;
    this.place(position);
    if (moving) this.sprite.play(`owner-walk-${facing}`, true);
    else {
      this.sprite.anims.stop();
      this.sprite.setFrame(OWNER_SPRITE.idle[facing]);
    }
  }

  snapshot() {
    const sprite = this.sprite;
    return sprite ? {
      mode: 'sprite', frame: Number(sprite.frame.name), animation: sprite.anims.currentAnim?.key ?? null,
      playing: sprite.anims.isPlaying, x: sprite.x, y: sprite.y,
      width: sprite.displayWidth, height: sprite.displayHeight,
      scaleMode: sprite.frame.source.scaleMode,
    } : { mode: 'circle' };
  }
}
