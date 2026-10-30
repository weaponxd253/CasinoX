import { GuestController, clipOwnerStep } from './guest-controller.js';
import { CasualTravelerSprite } from './casual-traveler-sprite.js';
import { clearSegment, lobbyPath, walkable } from './lobby-navigation.js';

export const TRAVELER_JOURNEY = Object.freeze({ spawn: Object.freeze({ x: 520, y: 548 }), speed: 85, radius: 14,
  stops: Object.freeze([
    { id: 'reception', via: [{ x: 520, y: 460 }, { x: 340, y: 460 }, { x: 340, y: 240 }],
      position: { x: 252, y: 220 }, waitMs: 8000, facing: 'up' },
    { id: 'hotel', via: [{ x: 620, y: 220 }], position: { x: 856, y: 314 }, exit: true },
  ]) });

export class LobbyGuests {
  constructor(scene) {
    this.scene = scene;
    this.controller = new GuestController({ ...TRAVELER_JOURNEY,
      path: (a, b, blockers) => lobbyPath(a, b, { blockers, smooth: true }),
      clear: (a, b, blockers = []) => clearSegment(a, b, TRAVELER_JOURNEY.radius, blockers),
      walkable: p => walkable(p, TRAVELER_JOURNEY.radius),
    });
    this.visual = new CasualTravelerSprite(scene);
    this.ownerContactHolds = 0;
    this.label = scene.add.text(40, 8, '', { fontFamily: 'monospace', fontSize: '12px', color: '#a8ffe3',
      backgroundColor: '#10211f' }).setDepth(101).setVisible(false);
    this.step = seconds => {
      const body = scene.player.body;
      const previous = { x: body.prev.x + body.halfWidth, y: body.prev.y + body.halfHeight };
      const guestFrom = { ...this.controller.position };
      this.controller.update(seconds * 1000, { x: body.center.x, y: body.center.y,
        vx: (body.center.x - previous.x) / seconds, vy: (body.center.y - previous.y) / seconds,
        radius: scene.config.playerRadius, previous });
      if (this.controller.spawned && !this.controller.complete) {
        const guarded = clipOwnerStep(previous, body.center, guestFrom, this.controller.position,
          scene.config.playerRadius + this.controller.radius + 0.05, p => walkable(p, scene.config.playerRadius));
        if (guarded.held) {
          body.position.x += guarded.position.x - body.center.x;
          body.position.y += guarded.position.y - body.center.y;
          body.updateCenter();
          this.ownerContactHolds++;
        }
      }
      this.sync();
    };
    this.suspend = () => { this.controller.suspend(); this.sync(); };
    this.resume = () => this.controller.resume();
    scene.physics.world.on('worldstep', this.step);
    for (const event of ['sleep', 'pause']) scene.events.on(event, this.suspend);
    for (const event of ['wake', 'resume']) scene.events.on(event, this.resume);
    scene.events.once('shutdown', () => {
      scene.physics.world.off('worldstep', this.step);
      for (const event of ['sleep', 'pause']) scene.events.off(event, this.suspend);
      for (const event of ['wake', 'resume']) scene.events.off(event, this.resume);
      this.visual?.destroy(); this.label.destroy();
    });
  }

  sync() {
    const c = this.controller;
    if (c.complete) { this.visual?.destroy(); this.visual = null; return; }
    this.visual?.setVisible(c.spawned);
    this.visual?.sync({ x: c.position.x, y: c.position.y + c.radius }, c.facing, c.moving);
  }

  drawDebug(graphics, visible) {
    this.label.setVisible(visible);
    if (!visible) return;
    const c = this.controller, destination = c.stop.position;
    this.label.setText(`Casual Traveler: ${c.state} | target ${destination.x},${destination.y}\n`
      + `blocked ${(c.blockedMs / 1000).toFixed(1)}s | ${c.blockedMs >= c.stuckMs ? 'STUCK · waiting/replanning' : 'route clear'} | replans ${c.replans} | contact holds ${this.ownerContactHolds}`);
    graphics.lineStyle(2, 0x6dffd0);
    graphics.strokeCircle(destination.x, destination.y, 7);
    if (c.spawned && !c.complete) {
      graphics.strokeCircle(c.position.x, c.position.y, c.radius);
      graphics.strokePoints([c.position, ...c.route], false);
    }
  }

  snapshot() {
    return { ...this.controller.snapshot(), ownerContactHolds: this.ownerContactHolds, visual: this.visual ? { ...this.visual.snapshot(),
      animation: this.visual.sprite?.anims.currentAnim?.key ?? null,
      visible: this.visual.sprite?.visible ?? this.visual.fallback.visible } : null };
  }
}
