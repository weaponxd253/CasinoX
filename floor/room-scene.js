import { ROOM } from './room-config.js';
import { OwnerController } from '../world/owner-controller.js';
import { InteractionSystem } from '../world/interaction-system.js';
import { INTERACTABLES } from '../world/interactables.js';
import { preloadOwnerSprite } from '../world/owner-sprite.js';
import { constrainFootprintMovement, distanceFromRect } from '../world/collision-geometry.js';
import { LOUNGE_ART, LOUNGE_FOREGROUNDS, toWorld } from './lounge-layout.js';

const Phaser = window.Phaser;
const imageUrl = new URL('./assets/lounge/blackjack-lounge.png', import.meta.url).href;

export class CasinoRoom extends Phaser.Scene {
  constructor(host) {
    super('CasinoRoom');
    this.host = host;
  }

  preload() {
    preloadOwnerSprite(this);
    this.load.image(LOUNGE_ART.key, imageUrl, { timeout: 5000 });
  }

  create() {
    if (this.host.hasFailed?.()) {
      this.events.once('create', () => this.game.scene.pause(this));
      return;
    }
    const texture = this.textures.exists(LOUNGE_ART.key) && this.textures.get(LOUNGE_ART.key);
    const source = texture && texture.getSourceImage();
    if (!source || source.width !== LOUNGE_ART.sourceWidth || source.height !== LOUNGE_ART.sourceHeight) {
      this.host.onError(new Error('Blackjack Lounge artwork could not load or has invalid dimensions.'));
      return;
    }
    texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.drawRoom();
    this.solids = this.physics.add.staticGroup();
    for (const shape of ROOM.solids) this.addSolid(shape);

    this.owner = new OwnerController(this, { spawn: ROOM.spawn, radius: ROOM.playerRadius, speed: ROOM.speed, label: 'YOU' });
    this.player = this.owner.player;
    this.physics.add.collider(this.player, this.solids);
    const finishContacts = () => {
      const body = this.player.body;
      const previous = { x: body.prev.x + body.halfWidth, y: body.prev.y + body.halfHeight };
      try {
        const corrected = constrainFootprintMovement(previous, body.center, ROOM.solids, ROOM.playerRadius);
        body.position.x += corrected.x - body.center.x;
        body.position.y += corrected.y - body.center.y;
        body.updateCenter();
      } catch (error) { this.host.onError(error); }
    };
    this.physics.world.on('worldstep', finishContacts);
    this.events.once('shutdown', () => this.physics.world.off('worldstep', finishContacts));
    this.events.on('postupdate', this.drawCollisions, this);
    this.events.once('shutdown', () => this.events.off('postupdate', this.drawCollisions, this));
    this.interactions = new InteractionSystem(this, {
      definitions: INTERACTABLES,
      context: () => ({ canReturn: Boolean(this.host.onExit || this.host.onAction) }),
      blocked: () => this.host.isBlocked?.() ?? false,
      dispatch: definition => {
        if (this.host.onAction) this.host.onAction(definition);
        else if (definition.action.type === 'blackjack') this.host.onInteract();
        else this.host.onExit?.();
      },
    });
    this.input.keyboard.on('keydown-M', event => {
      if (!event.repeat && this.hasFocus() && !this.host.isBlocked?.()) this.host.onManagement?.();
    });
    this.input.keyboard.on('keydown-ESC', event => {
      if (!event.repeat && this.hasFocus() && !this.host.isBlocked?.()) this.host.onBack?.();
    });

    const canvas = this.game.canvas;
    canvas.setAttribute('aria-label', 'Casino room. Move with WASD or arrow keys; press E near the blackjack table.');
    this.focusCanvas = () => {
      canvas.setAttribute('aria-label', 'Blackjack Lounge. Move with WASD or arrows; E to interact.');
      this.owner.focus();
    };
    this.events.on('wake', this.focusCanvas);
    this.interaction = null;
    this.nearTable = false;
    this.host.onReady();
  }

  addSolid({ x, y, width, height, radius }) {
    const solid = this.add.zone(x, y, width ?? radius * 2, height ?? radius * 2);
    this.solids.add(solid);
    if (radius !== undefined) { solid.body.setCircle(radius); solid.body.updateFromGameObject(); }
  }

  hasFocus() {
    return this.owner.hasFocus();
  }

  isNearTable() {
    return Boolean(this.player) && distanceFromRect(this.player, ROOM.table) <= ROOM.table.reach;
  }

  stopMovement() {
    this.owner.stop();
  }

  getInteraction() {
    return this.interactions.current()?.id ?? null;
  }

  pauseWorld() {
    this.stopMovement();
    this.input.keyboard.enabled = false;
    // DOM overlays need an immediate transition. ScenePlugin.pause/resume
    // queue until the next tick and can discard an immediate movement key.
    this.game.scene.pause(this);
  }

  resumeWorld() {
    this.stopMovement();
    this.input.keyboard.enabled = true;
    this.game.scene.resume(this);
    this.focusCanvas();
  }

  update() {
    if (!this.owner) return;
    this.owner.update();
    const near = this.isNearTable();
    const interaction = this.getInteraction();
    if (interaction !== this.interaction) {
      this.interaction = interaction;
      this.host.onProximity(Boolean(interaction), interaction);
    }
    this.nearTable = near;
    for (const layer of this.foregrounds) layer.foreground.setDepth(this.player.y + ROOM.playerRadius < layer.baseline ? 20 : 5);
  }

  drawRoom() {
    this.add.rectangle(480, 300, 960, 600, 0x000000);
    const image = () => this.add.image(LOUNGE_ART.x, LOUNGE_ART.y, LOUNGE_ART.key)
      .setOrigin(0).setDisplaySize(LOUNGE_ART.width, LOUNGE_ART.height);
    this.background = image().setDepth(0);
    this.foregrounds = LOUNGE_FOREGROUNDS.map(definition => {
      const graphics = this.make.graphics({ x: 0, y: 0 }, false);
      graphics.fillStyle(0xffffff).fillPoints(definition.points.map(([x, y]) => toWorld(x, y)), true);
      const mask = graphics.createGeometryMask();
      const foreground = image().setMask(mask).setDepth(5);
      this.events.once('shutdown', () => { mask.destroy(); graphics.destroy(); });
      return { foreground, baseline: toWorld(0, definition.baseline).y };
    });
    this.collisionOverlay = this.add.graphics().setDepth(100)
      .setVisible(new URLSearchParams(location.search).has('collisions'));
  }

  toggleCollisions() { this.collisionOverlay.setVisible(!this.collisionOverlay.visible); this.drawCollisions(); }

  drawCollisions() {
    if (!this.collisionOverlay?.visible || !this.player) return;
    const g = this.collisionOverlay.clear();
    for (const shape of ROOM.solids) {
      g.fillStyle(0xff5268, 0.3).lineStyle(1, 0xff6375, 0.85);
      if (shape.radius !== undefined) g.fillCircle(shape.x, shape.y, shape.radius).strokeCircle(shape.x, shape.y, shape.radius);
      else g.fillRect(shape.x - shape.width / 2, shape.y - shape.height / 2, shape.width, shape.height);
    }
    g.lineStyle(2, 0x5de8ed);
    const t = ROOM.table;
    g.strokeRoundedRect(t.x - t.width / 2 - t.reach, t.y - t.height / 2 - t.reach,
      t.width + t.reach * 2, t.height + t.reach * 2, t.reach);
    if (this.host.onAction || this.host.onExit) g.strokeCircle(ROOM.exit.x, ROOM.exit.y, ROOM.exit.reach);
    g.lineStyle(2, 0xffffff).strokeCircle(this.player.x, this.player.y, ROOM.playerRadius);
  }

  artworkSnapshot() {
    return this.background ? { x: this.background.x, y: this.background.y,
      width: this.background.displayWidth, height: this.background.displayHeight,
      sourceWidth: this.background.texture.getSourceImage().width, sourceHeight: this.background.texture.getSourceImage().height,
      scaleMode: this.background.frame.source.scaleMode } : null;
  }
}
