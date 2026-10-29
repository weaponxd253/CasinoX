import { OwnerController } from './owner-controller.js';
import { InteractionSystem } from './interaction-system.js';
import { INTERACTABLES } from './interactables.js';
import { preloadOwnerSprite } from './owner-sprite.js';

export class ExplorableScene extends window.Phaser.Scene {
  constructor(key, host, config, spawn = config.spawn) {
    super(key);
    Object.assign(this, { host, config, spawn });
  }

  preload() { preloadOwnerSprite(this); }

  create() {
    this.drawRoom();
    const solids = this.physics.add.staticGroup();
    for (const shape of this.config.solids) {
      const zone = this.add.zone(shape.x, shape.y, shape.width ?? shape.radius * 2, shape.height ?? shape.radius * 2);
      solids.add(zone);
      if (shape.radius !== undefined) {
        zone.body.setCircle(shape.radius);
        // Phaser setCircle floors fractional half-extents. Refresh from the
        // zone so scaled circles match validation and overlay coordinates.
        zone.body.updateFromGameObject();
      }
    }
    this.owner = new OwnerController(this, { spawn: this.spawn, radius: this.config.playerRadius, speed: this.config.speed });
    this.player = this.owner.player;
    this.physics.add.collider(this.player, solids);
    this.interactions = new InteractionSystem(this, {
      definitions: INTERACTABLES, dispatch: definition => this.host.onAction(definition), blocked: this.host.isBlocked,
    });
    this.input.keyboard.on('keydown-M', event => {
      if (!event.repeat && this.owner.hasFocus() && !this.host.isBlocked()) this.host.onManagement();
    });
    this.input.keyboard.on('keydown-ESC', event => {
      if (!event.repeat && this.owner.hasFocus() && !this.host.isBlocked()) this.host.onBack();
    });
    this.events.on('wake', () => this.focusCanvas());
    this.host.onReady(this);
  }

  getInteraction() { return this.interactions.current()?.id ?? null; }
  stopMovement() { this.owner.stop(); }
  focusCanvas() {
    this.game.canvas.setAttribute('aria-label', `${this.config.label}. Move with WASD or arrows; E to interact; M for management.`);
    this.owner.focus();
  }
  pauseWorld() { this.owner.stop(); this.input.keyboard.enabled = false; this.game.scene.pause(this); }
  resumeWorld() { this.owner.stop(); this.input.keyboard.enabled = true; this.game.scene.resume(this); this.focusCanvas(); }

  update() {
    this.owner.update();
    const selected = this.getInteraction();
    this.halos?.forEach((halo, id) => halo.setVisible(selected === id));
  }
}
