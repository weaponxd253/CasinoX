import { OwnerSprite } from './owner-sprite.js';

// Shared owner controls for the original lounge and the new central lobby.
export class OwnerController {
  constructor(scene, { spawn, radius, speed, label = 'OWNER' }) {
    this.scene = scene;
    this.speed = speed;
    this.facing = spawn.facing ?? 'up';
    this.player = scene.add.circle(spawn.x, spawn.y, radius, 0xf0d699)
      .setStrokeStyle(3, 0x392b33).setDepth(10);
    scene.physics.add.existing(this.player);
    this.player.body.setCircle(radius).setCollideWorldBounds(true);
    this.label = scene.add.text(spawn.x, spawn.y + 28, label, {
      fontFamily: 'Georgia, serif', fontSize: 11, color: '#e9ce98',
    }).setOrigin(0.5).setDepth(10);
    this.heading = scene.add.circle(spawn.x, spawn.y - 6, 3, 0x392b33).setDepth(11);
    this.visual = new OwnerSprite(scene, radius);
    if (this.visual.sprite) {
      this.player.setVisible(false);
      this.heading.setVisible(false);
    }
    this.drawLabels();
    this.visual.sync(this.player, this.facing, false);
    // Arcade copies its body position to the circle during postupdate. Follow
    // that result before rendering so artwork never trails physics by a frame.
    this.afterPhysics = () => this.visual.place(this.player);
    scene.events.on('postupdate', this.afterPhysics);
    this.keys = scene.input.keyboard.addKeys({
      up: 'W', left: 'A', down: 'S', right: 'D',
      arrowUp: 'UP', arrowLeft: 'LEFT', arrowDown: 'DOWN', arrowRight: 'RIGHT',
    }, false);
    scene.input.keyboard.addCapture(['UP', 'DOWN', 'LEFT', 'RIGHT', 'SPACE']);

    const canvas = scene.game.canvas;
    canvas.tabIndex = 0;
    // create() runs before Phaser marks the scene RUNNING. Explicit lifecycle
    // focus must work there; pointer listeners only act for the active scene.
    this.focus = () => canvas.focus({ preventScroll: true });
    this.focusOnPointer = () => { if (scene.sys.isActive()) this.focus(); };
    this.stop = () => {
      this.player.body.setVelocity(0, 0);
      scene.input.keyboard.resetKeys();
      this.visual.sync(this.player, this.facing, false);
    };
    canvas.addEventListener('pointerdown', this.focusOnPointer);
    canvas.addEventListener('blur', this.stop);
    window.addEventListener('blur', this.stop);
    scene.events.on('sleep', this.stop);
    scene.events.on('pause', this.stop);
    scene.events.once('shutdown', () => {
      canvas.removeEventListener('pointerdown', this.focusOnPointer);
      canvas.removeEventListener('blur', this.stop);
      window.removeEventListener('blur', this.stop);
      scene.events.off('sleep', this.stop);
      scene.events.off('pause', this.stop);
      scene.events.off('postupdate', this.afterPhysics);
    });
  }

  hasFocus() { return document.activeElement === this.scene.game.canvas; }

  snapshot() { return { x: this.player.x, y: this.player.y, facing: this.facing }; }

  restore(position) {
    this.stop();
    this.player.body.reset(position.x, position.y);
    this.facing = position.facing;
    this.drawLabels();
    this.visual.sync(this.player, this.facing, false);
  }

  drawLabels() {
    const offsets = { up: [0, -6], down: [0, 6], left: [-6, 0], right: [6, 0] };
    const [dx, dy] = offsets[this.facing];
    this.label.setPosition(this.player.x, this.player.y + 28);
    this.heading.setPosition(this.player.x + dx, this.player.y + dy);
  }

  update() {
    const keys = this.keys;
    let dx = 0;
    let dy = 0;
    if (this.hasFocus()) {
      dx = Number(keys.right.isDown || keys.arrowRight.isDown) - Number(keys.left.isDown || keys.arrowLeft.isDown);
      dy = Number(keys.down.isDown || keys.arrowDown.isDown) - Number(keys.up.isDown || keys.arrowUp.isDown);
    }
    this.player.body.velocity.set(dx, dy).normalize().scale(this.speed);
    if (dx || dy) this.facing = dy ? (dy < 0 ? 'up' : 'down') : (dx < 0 ? 'left' : 'right');
    this.drawLabels();
    this.visual.sync(this.player, this.facing, Boolean(dx || dy));
  }
}
