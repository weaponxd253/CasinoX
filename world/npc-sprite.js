// Shared presentation only. NPCs have no physics, hotel records or saved state.
const requestedGames = new WeakMap();

export function preloadNpcSprite(scene, config, url) {
  let requested = requestedGames.get(scene.game);
  if (!requested) requestedGames.set(scene.game, requested = new Set());
  if (requested.has(config.key)) return;
  requested.add(config.key);
  scene.load.spritesheet(config.key, url, {
    frameWidth: config.frameWidth, frameHeight: config.frameHeight,
  }, config.loadTimeout ? { timeout: config.loadTimeout } : undefined);
  if (config.loadRetries !== undefined) {
    // Phaser File exposes retryAttempts per file; leave stationary NPC defaults alone.
    const file = scene.load.list.get('key', config.key);
    if (file) file.retryAttempts = config.loadRetries;
  }
}

export class NpcSprite {
  constructor(scene, config) {
    this.scene = scene;
    this.config = config;
    const x = Math.round(config.position.x), y = Math.round(config.position.y);
    this.fallback = scene.add.circle(x, y - 35, 12, config.fallbackColor)
      .setStrokeStyle(2, 0xe9ce98).setDepth(4).setName(`${config.name}-placeholder`);
    if (!scene.textures.exists(config.key)) return;
    const texture = scene.textures.get(config.key), source = texture.getSourceImage();
    if (source.width !== config.frameWidth * 4 || source.height !== config.frameHeight * 4
      || Array.from({ length: 16 }, (_, i) => i).some(i => !texture.has(i))) return;
    texture.setFilter(window.Phaser.Textures.FilterMode.NEAREST);
    // Keep CSS scaling sharp even if the owner's artwork uses its fallback.
    scene.game.canvas.style.imageRendering = 'pixelated';
    for (const [direction, start] of Object.entries(config.rows)) {
      const key = `${config.name}-walk-${direction}`;
      if (!scene.anims.exists(key)) scene.anims.create({ key,
        frames: scene.anims.generateFrameNumbers(config.key, { start, end: start + 3 }),
        frameRate: config.frameRate, repeat: -1 });
    }
    this.sprite = scene.add.sprite(x, y, config.key, config.idle.down)
      .setOrigin(0.5, config.footBaseline / config.frameHeight).setScale(config.scale).setDepth(4)
      .setName(`${config.name}-sprite`);
    this.fallback.setVisible(false);
  }

  snapshot() {
    const sprite = this.sprite, config = this.config;
    return { mode: sprite ? 'sprite' : 'circle', facing: this.facing ?? 'down',
      x: sprite?.x ?? this.fallback.x, y: sprite?.y ?? this.fallback.y + 35,
      frame: sprite ? Number(sprite.frame.name) : null, playing: sprite?.anims.isPlaying ?? false,
      width: sprite?.displayWidth ?? null, height: sprite?.displayHeight ?? null,
      scaleMode: sprite?.frame.source.scaleMode ?? null, depth: sprite?.depth ?? this.fallback.depth,
      hasPhysicsBody: Boolean(sprite?.body), placeholderVisible: this.fallback.visible,
      walkingAnimations: sprite ? Object.keys(config.rows).map(direction => {
        const animation = this.scene.anims.get(`${config.name}-walk-${direction}`);
        return { key: animation.key, frames: animation.frames.map(frame => Number(frame.textureFrame)),
          frameRate: animation.frameRate, repeat: animation.repeat };
      }) : [] };
  }

  // Position is a foot anchor, independent of any movement/physics controller.
  sync(position, facing, moving) {
    this.facing = facing;
    const x = Math.round(position.x), y = Math.round(position.y);
    this.fallback.setPosition(x, y - 35);
    if (!this.sprite) return;
    this.sprite.setPosition(x, y);
    if (moving) this.sprite.play(`${this.config.name}-walk-${facing}`, true);
    else {
      this.sprite.anims.stop();
      this.sprite.setFrame(this.config.idle[facing]);
    }
  }

  setVisible(visible) {
    this.sprite?.setVisible(visible);
    this.fallback.setVisible(visible && !this.sprite);
  }
  setDepth(depth) { this.sprite?.setDepth(depth); this.fallback.setDepth(depth); }
  destroy() { this.sprite?.destroy(); this.fallback.destroy(); }
}
