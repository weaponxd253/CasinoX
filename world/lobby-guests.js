import { GuestController, clipOwnerStep } from './guest-controller.js';
import { createGuestVisual } from './guest-appearances.js';
import { clearSegment, lobbyPath, walkable } from './lobby-navigation.js';
import { ReceptionQueueManager, RECEPTION_QUEUE } from './reception-queue-manager.js';

// Retain the autonomous Phase 5A journey for controller regression/use elsewhere.
export const TRAVELER_JOURNEY = Object.freeze({ spawn: Object.freeze({ x: 520, y: 548 }), speed: 85, radius: 14,
  stops: Object.freeze([
    { id: 'reception', via: [{ x: 520, y: 460 }, { x: 340, y: 460 }, { x: 340, y: 240 }],
      position: { x: 252, y: 220 }, waitMs: 8000, facing: 'up' },
    { id: 'hotel', via: [{ x: 620, y: 220 }], position: { x: 856, y: 314 }, exit: true },
  ]) });
export const LOBBY_GUESTS = Object.freeze([
  Object.freeze({ id: 'casual-traveler', appearance: 'casual-traveler', arrivalMs: 0, speed: 85 }),
  Object.freeze({ id: 'business-traveler', appearance: 'business-traveler', arrivalMs: 4000, speed: 82 }),
  Object.freeze({ id: 'older-leisure-traveler', appearance: 'older-leisure-traveler', arrivalMs: 8000, speed: 88 }),
]);

// Pure orchestration also runs in deterministic navigation tests. Phaser only
// supplies active physics time and the owner observation through LobbyGuests.
export class LobbyGuestTraffic {
  constructor({ guests = LOBBY_GUESTS, queue = RECEPTION_QUEUE } = {}) {
    this.queue = new ReceptionQueueManager(queue);
    this.activeMs = 0;
    this.suspended = false;
    this.guests = guests.map(config => {
      const controller = new GuestController({ ...TRAVELER_JOURNEY, speed: config.speed,
        path: (a, b, blockers) => lobbyPath(a, b, { blockers, smooth: true }),
        clear: (a, b, blockers = []) => clearSegment(a, b, 14, blockers), walkable });
      controller.goTo({ id: 'entrance', position: TRAVELER_JOURNEY.spawn });
      return { ...config, controller, ownerContactHolds: 0 };
    });
  }
  priority(guest) {
    return this.queue.entries.get(guest.id)?.state === 'DEPARTING' ? 0 : this.guests.indexOf(guest) + 1;
  }
  update(deltaMs, owner) {
    if (this.suspended || this.guests.every(g => g.controller.complete)) return { position: { ...owner }, held: false };
    const dt = Math.max(0, Math.min(deltaMs, 50));
    if (!dt) return { position: { ...owner }, held: false };
    this.activeMs += dt;
    const before = new Map(this.guests.map(g => [g.id, { ...g.controller.position }]));
    const pending = this.guests.find(g => !g.controller.spawned);
    const ordered = [...this.guests].sort((a, b) => this.priority(a) - this.priority(b));
    for (const guest of ordered) {
      const c = guest.controller;
      if (c.complete || (!c.spawned && (guest !== pending || this.activeMs < guest.arrivalMs))) continue;
      const peers = this.guests.filter(g => g !== guest && g.controller.spawned && !g.controller.complete).map(g => {
        const p = g.controller;
        return { id: g.id, ...p.position, previous: before.get(g.id), radius: p.radius,
          vx: p.goals.length ? p.intent.x : 0, vy: p.goals.length ? p.intent.y : 0, priority: this.priority(g) };
      });
      // Reservations protect the destination even before its guest gets there.
      // These stationary request-local circles never enter cached navigation.
      for (const slot of this.queue.slots) {
        const occupant = slot.reservedBy ?? slot.clearingBy;
        if (occupant && occupant !== guest.id) peers.push({ ...slot.position, radius: 14 });
      }
      c.priority = this.priority(guest);
      const spawned = c.spawned;
      c.update(dt, owner, peers);
      if (!spawned && c.spawned) this.queue.register(guest.id, c);
    }
    this.queue.update(dt);
    // Each guard constrains the same attempted owner segment. Retain the nearest
    // forward bound so a later guard cannot reintroduce an earlier collision.
    const previous = owner.previous ?? owner;
    let position = { x: owner.x, y: owner.y }, held = false;
    for (const guest of this.guests) {
      const c = guest.controller;
      if (!c.spawned || c.complete) continue;
      const result = clipOwnerStep(previous, position, before.get(guest.id), c.position,
        (owner.radius ?? 14) + c.radius + 0.05, p => walkable(p, owner.radius ?? 14));
      if (result.held) { position = result.position; held = true; guest.ownerContactHolds++; }
    }
    return { position, held };
  }
  suspend() { this.suspended = true; this.queue.suspend(); for (const g of this.guests) g.controller.suspend(); }
  resume() { this.suspended = false; this.queue.resume(); for (const g of this.guests) g.controller.resume(); }
  guestSnapshot(guest) {
    const entry = this.queue.entries.get(guest.id), c = guest.controller;
    return { ...c.snapshot(), id: guest.id, appearance: guest.appearance, arrivalMs: guest.arrivalMs,
      behavior: entry?.state ?? 'ARRIVING', reservedSlot: entry?.slot === null || !entry ? null : this.queue.slots[entry.slot].id,
      serviceRemainingMs: entry?.serviceRemainingMs ?? this.queue.config.serviceMs,
      ownerContactHolds: guest.ownerContactHolds };
  }
  snapshot() { return { activeMs: this.activeMs, suspended: this.suspended,
    guests: this.guests.map(g => this.guestSnapshot(g)), queue: this.queue.snapshot() }; }
}

export class LobbyGuests {
  constructor(scene) {
    this.scene = scene;
    this.traffic = new LobbyGuestTraffic();
    this.guests = this.traffic.guests;
    for (const guest of this.guests) guest.visual = createGuestVisual(scene, guest.appearance);
    this.label = scene.add.text(40, 8, '', { fontFamily: 'monospace', fontSize: '11px', color: '#a8ffe3',
      backgroundColor: '#10211f' }).setDepth(101).setVisible(false);
    this.slotLabels = this.traffic.queue.slots.map((s, i) => scene.add.text(s.position.x, s.position.y + 17,
      i ? `Q${i}` : 'SERVICE', { fontFamily: 'monospace', fontSize: '10px', color: '#ffe2a0', backgroundColor: '#10211f' })
      .setOrigin(0.5, 0).setDepth(101).setVisible(false));
    this.step = seconds => {
      if (seconds <= 0) return;
      const body = scene.player.body;
      const previous = { x: body.prev.x + body.halfWidth, y: body.prev.y + body.halfHeight };
      const guarded = this.traffic.update(seconds * 1000, { x: body.center.x, y: body.center.y,
        vx: (body.center.x - previous.x) / seconds, vy: (body.center.y - previous.y) / seconds,
        radius: scene.config.playerRadius, previous });
      if (guarded.held) {
        body.position.x += guarded.position.x - body.center.x;
        body.position.y += guarded.position.y - body.center.y;
        body.updateCenter();
      }
      this.sync();
    };
    this.suspend = () => { this.traffic.suspend(); this.sync(); };
    this.resume = () => this.traffic.resume();
    scene.physics.world.on('worldstep', this.step);
    for (const event of ['sleep', 'pause']) scene.events.on(event, this.suspend);
    for (const event of ['wake', 'resume']) scene.events.on(event, this.resume);
    scene.events.once('shutdown', () => {
      scene.physics.world.off('worldstep', this.step);
      for (const event of ['sleep', 'pause']) scene.events.off(event, this.suspend);
      for (const event of ['wake', 'resume']) scene.events.off(event, this.resume);
      for (const guest of this.guests) guest.visual?.destroy();
      this.traffic.queue.destroy(); this.label.destroy(); this.slotLabels.forEach(label => label.destroy());
    });
  }
  get controller() { return this.guests[0].controller; }
  get visual() { return this.guests[0].visual; }
  sync() {
    for (const guest of this.guests) {
      const c = guest.controller;
      if (c.complete) { guest.visual?.destroy(); guest.visual = null; continue; }
      guest.visual?.setVisible(c.spawned);
      guest.visual?.sync({ x: c.position.x, y: c.position.y + c.radius }, c.facing, c.moving);
    }
  }
  drawDebug(graphics, visible) {
    this.label.setVisible(visible);
    this.slotLabels.forEach(label => label.setVisible(visible));
    if (!visible) return;
    const queue = this.traffic.queue;
    this.label.setText([`Queue: ${queue.order.join(' > ') || 'empty'}`,
      ...this.guests.map(g => {
        const s = this.traffic.guestSnapshot(g), d = s.destination;
        return `${g.id}: ${s.behavior} | ${s.reservedSlot ?? '-'} | target ${d.x},${d.y} | service ${(s.serviceRemainingMs / 1000).toFixed(1)}s`
          + ` | blocked ${(s.blockedMs / 1000).toFixed(1)}s | replans ${s.replans}`;
      })]);
    graphics.lineStyle(2, 0xffd36d);
    for (const slot of queue.slots) graphics.strokeCircle(slot.position.x, slot.position.y, 14);
    this.guests.forEach((guest, index) => {
      const c = guest.controller;
      graphics.lineStyle(2, [0x6dffd0, 0xffd36d, 0x7ebcff][index]);
      graphics.strokeCircle(c.stop.position.x, c.stop.position.y, 5);
      if (c.spawned && !c.complete) {
        graphics.strokeCircle(c.position.x, c.position.y, c.radius);
        graphics.strokePoints([c.position, ...c.route], false);
      }
    });
  }
  visualSnapshot(guest) {
    return guest.visual ? { ...guest.visual.snapshot(), texture: guest.visual.config.key,
      animation: guest.visual.sprite?.anims.currentAnim?.key ?? null,
      visible: guest.visual.sprite?.visible ?? guest.visual.fallback.visible } : null;
  }
  snapshot() { const g = this.guests[0]; return { ...this.traffic.guestSnapshot(g), visual: this.visualSnapshot(g) }; }
  snapshotAll() { return { ...this.traffic.snapshot(), guests: this.guests.map(g => ({
    ...this.traffic.guestSnapshot(g), visual: this.visualSnapshot(g) })) }; }
}
