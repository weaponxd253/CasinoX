import { ROOM } from './room-config.js';
import { OwnerController } from '../world/owner-controller.js';
import { InteractionSystem } from '../world/interaction-system.js';
import { INTERACTABLES } from '../world/interactables.js';
import { preloadOwnerSprite } from '../world/owner-sprite.js';

const Phaser = window.Phaser;

export class CasinoRoom extends Phaser.Scene {
  constructor(host) {
    super('CasinoRoom');
    this.host = host;
  }

  preload() { preloadOwnerSprite(this); }

  create() {
    this.drawRoom();
    this.solids = this.physics.add.staticGroup();
    for (const wall of ROOM.walls) this.addSolid(wall);
    this.addSolid(ROOM.table);

    this.owner = new OwnerController(this, { spawn: ROOM.spawn, radius: ROOM.playerRadius, speed: ROOM.speed, label: 'YOU' });
    this.player = this.owner.player;
    this.physics.add.collider(this.player, this.solids);
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

  addSolid({ x, y, width, height }) {
    const solid = this.add.zone(x, y, width, height);
    this.solids.add(solid);
  }

  hasFocus() {
    return this.owner.hasFocus();
  }

  isNearTable() {
    const table = ROOM.table;
    const dx = Math.max(Math.abs(this.player.x - table.x) - table.width / 2, 0);
    const dy = Math.max(Math.abs(this.player.y - table.y) - table.height / 2, 0);
    return Math.hypot(dx, dy) <= table.reach;
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
    this.owner.update();
    const near = this.isNearTable();
    const interaction = this.getInteraction();
    if (interaction !== this.interaction) {
      this.interaction = interaction;
      this.tableHalo.setVisible(near);
      this.host.onProximity(Boolean(interaction), interaction);
    }
    this.nearTable = near;
  }

  drawRoom() {
    const g = this.add.graphics();
    g.fillStyle(0x291e35).fillRect(0, 0, ROOM.width, ROOM.height);
    g.fillStyle(0x38283c).fillRoundedRect(54, 54, 852, 492, 12);
    g.lineStyle(1, 0x9b7950, 0.22);
    for (let x = 80; x < 920; x += 40) {
      for (let y = 80; y < 560; y += 40) {
        g.strokeRect(x, y, 6, 6);
      }
    }
    g.lineStyle(2, 0xad8b55, 0.65).strokeRoundedRect(62, 62, 836, 476, 10);
    for (const wall of ROOM.walls) {
      g.fillStyle(0x131d27).fillRect(wall.x - wall.width / 2, wall.y - wall.height / 2, wall.width, wall.height);
      g.lineStyle(2, 0xa28251).strokeRect(wall.x - wall.width / 2, wall.y - wall.height / 2, wall.width, wall.height);
    }
    const text = (x, y, value, size, color = '#e9ce98') => this.add.text(x, y, value, {
      fontFamily: 'Georgia, serif', fontSize: size, color, align: 'center',
    }).setOrigin(0.5);
    text(480, 92, 'THE BLACKJACK LOUNGE', 25);
    text(480, 122, 'C A S I N O   X   /   R O Y A L E   C O L L E C T I O N', 11, '#b6a5ae');

    this.tableHalo = this.add.rectangle(480, 240, 268, 148)
      .setStrokeStyle(2, 0xf0d699, 0.8).setVisible(false);
    g.fillStyle(0x12151c, 0.5).fillRoundedRect(354, 190, 252, 126, 26);
    g.fillStyle(0x8c693e).fillRoundedRect(360, 180, 240, 120, 24);
    g.fillStyle(0x15584e).fillRoundedRect(370, 190, 220, 100, 18);
    g.lineStyle(1, 0xb5a578, 0.6).strokeRoundedRect(379, 198, 202, 83, 14);
    text(480, 224, 'BLACKJACK', 20);
    text(480, 252, '3:2  /  MIN 1 CHIP', 11);
    text(480, 340, 'APPROACH TO PLAY', 12, '#b6a5ae');
    text(130, 390, 'PRIVATE\nLOUNGE', 13, '#b6a5ae');
    text(790, 480, 'W A S D\nto explore', 15, '#b6a5ae');
    if (this.host.onExit || this.host.onAction) text(ROOM.exit.x, ROOM.exit.y, 'E · CENTRAL LOBBY', 13);
  }
}
