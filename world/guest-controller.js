const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const direction = (dx, dy) => Math.abs(dy) >= Math.abs(dx) ? (dy < 0 ? 'up' : 'down') : (dx < 0 ? 'left' : 'right');

const pointSegmentDistance = (p, a, b) => {
  const dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length)) : 0;
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
};

// Last-resort contact guard, after the guest has tried its bounded yielding
// step. Clip only attempted forward travel; never push the owner backwards.
export function clipOwnerStep(previous, next, guestFrom, guestTo, minimum, walkable) {
  const at = t => ({ x: previous.x + (next.x - previous.x) * t, y: previous.y + (next.y - previous.y) * t });
  const clear = p => walkable(p) && pointSegmentDistance(p, guestFrom, guestTo) >= minimum - 0.001;
  const steps = Math.max(1, Math.ceil(distance(previous, next)));
  const initialGap = pointSegmentDistance(previous, guestFrom, guestTo);
  // A tiny contact-margin deficit must never pin a valid retreat. Accept only
  // travel that increases clearance without reducing it anywhere along the way.
  if (initialGap > 0 && initialGap < minimum && pointSegmentDistance(next, guestFrom, guestTo) > initialGap
    && Array.from({ length: steps }, (_, i) => at((i + 1) / steps))
      .every(p => walkable(p) && pointSegmentDistance(p, guestFrom, guestTo) >= initialGap)) {
    return { position: { ...next }, held: false };
  }
  for (let i = 1; i <= steps; i++) {
    // Static contact sliding already belongs to the existing owner resolver.
    // Do not constrain it again unless this step actually contacts the guest.
    if (pointSegmentDistance(at(i / steps), guestFrom, guestTo) >= minimum - 0.001) continue;
    let low = (i - 1) / steps, high = i / steps;
    for (let j = 0; j < 20; j++) {
      const mid = (low + high) / 2;
      if (clear(at(mid))) low = mid; else high = mid;
    }
    const position = at(Math.max(0, low - 0.0001));
    // Retain the last safe position if the clipping margin meets another
    // footprint. Contact handling must never introduce an invalid save point.
    return { position: clear(position) ? position : { ...previous }, held: true };
  }
  return { position: { ...next }, held: false };
}

// Kinematic presentation only. Receives geometry and owner observations; never
// touches a Phaser body, hotel record, wallet, world save or wall clock.
export class GuestController {
  constructor({ spawn, stops, path, clear, walkable, speed = 85, radius = 14, replanMs = 1000, stuckMs = 2000 }) {
    Object.assign(this, { stops, path, clear, walkable, speed, radius, replanMs, stuckMs });
    this.position = { ...spawn };
    this.stage = 0;
    this.spawned = false;
    this.complete = false;
    this.suspended = false;
    this.facing = 'up';
    this.moving = false;
    this.route = [];
    this.goals = [];
    this.activeMs = 0;
    this.blockedMs = 0;
    this.lastPlanMs = -Infinity;
    this.replans = 0;
    this.waitRemainingMs = 0;
    this.waiting = false;
    this.velocity = { x: 0, y: 0 };
    this.peers = [];
    this.intent = { x: 0, y: 0 };
  }

  get stop() { return this.managedStop ?? this.stops[this.stage]; }
  get arrived() { return this.spawned && !this.complete && !this.goals.length && distance(this.position, this.stop.position) < 0.01; }
  // Queue mode controls destinations and holds; the same movement code still
  // handles every step. The original autonomous Phase 5A stops remain supported.
  goTo(stop) {
    this.managedStop = { ...stop, hold: !stop.exit, position: { ...stop.position } };
    this.waitRemainingMs = 0;
    this.beginStop();
  }
  get state() {
    if (this.complete) return 'COMPLETE';
    if (!this.spawned) return 'WAITING_TO_SPAWN';
    if (this.blockedMs > 0) return 'YIELDING';
    return `${this.waiting ? 'WAITING_AT' : 'WALKING_TO'}_${this.stop.id.toUpperCase()}`;
  }
  suspend() { this.suspended = true; this.moving = false; this.velocity = { x: 0, y: 0 }; this.intent = { x: 0, y: 0 }; }
  resume() { this.suspended = false; }

  blockers(owner, margin = 6) {
    const blockers = [];
    if (owner) {
      const vx = owner.vx ?? 0, vy = owner.vy ?? 0;
      blockers.push(...[0, 0.125, 0.25].map(t => ({ x: owner.x + vx * t, y: owner.y + vy * t,
        radius: (owner.radius ?? 14) + margin })));
    }
    for (const peer of this.peers) {
      // A close contact may reduce the comfort margin, never the footprint.
      const gap = distance(this.position, peer) - this.radius - peer.radius;
      const padding = Math.min(margin, 4, Math.max(0.05, gap - 0.1));
      blockers.push({ ...peer, radius: peer.radius + padding });
      if (peer.previous) blockers.push({ ...peer.previous, radius: peer.radius + padding });
    }
    return blockers;
  }

  plan(owner) {
    if (this.activeMs - this.lastPlanMs < this.replanMs) return;
    this.lastPlanMs = this.activeMs;
    this.replans++;
    try { this.route = this.path(this.position, this.goals[0], this.blockers(owner)); }
    catch (_) { this.route = []; } // A temporarily occupied route is not a save/game error.
  }

  beginStop() {
    this.goals = [...(this.stop.via ?? []), this.stop.position].map(p => ({ ...p }));
    this.route = [];
    this.lastPlanMs = -Infinity;
    this.waiting = false;
    this.waypointsReached = 0;
    this.intent = { x: 0, y: 0 };
  }

  yieldStep(owner, budget, passing = false, extraBlockers = []) {
    if (!owner || !((owner.vx ?? 0) || (owner.vy ?? 0))) return false;
    const future = { x: owner.x + owner.vx * 0.25, y: owner.y + owner.vy * 0.25 };
    const minimum = this.radius + (owner.radius ?? 14);
    if (distance(this.position, owner) > minimum + 52 || pointSegmentDistance(this.position, owner, future) >= minimum + 12) return false;
    let best, score = -Infinity;
    const away = Math.atan2(this.position.y - owner.y, this.position.x - owner.x);
    for (let i = 0; i < 16; i++) {
      const angle = away + i * Math.PI / 8;
      const p = { x: this.position.x + Math.cos(angle) * budget, y: this.position.y + Math.sin(angle) * budget };
      if (!this.clear(this.position, p, [{ ...owner, radius: (owner.radius ?? 14) + 0.05 },
        ...this.blockers(null, 0.05), ...extraBlockers])
        || distance(p, owner) < minimum + 0.05) continue;
      // Lower-priority opposing traffic consistently passes on one side of the
      // incoming direction, rather than backing away forever or zigzagging.
      const length = Math.hypot(owner.vx, owner.vy);
      const value = passing ? ((p.x - owner.x) * -owner.vy + (p.y - owner.y) * owner.vx) / length
        : pointSegmentDistance(p, owner, future) + distance(p, owner) * 0.001;
      if (value > score) { best = p; score = value; }
    }
    if (!best) return false;
    this.position = best;
    this.route = [];
    return true;
  }

  update(deltaMs, owner, peers = []) {
    if (this.suspended || this.complete) return;
    this.peers = peers;
    const dt = Math.max(0, Math.min(deltaMs, 50));
    if (!dt) return;
    this.activeMs += dt;
    const previous = { ...this.position };
    this.moving = false;
    this.velocity = { x: 0, y: 0 };
    if (!this.spawned) {
      if (!this.walkable(this.position) || this.blockers(owner).some(b => distance(this.position, b) < this.radius + b.radius)) {
        this.blockedMs += dt; return;
      }
      this.spawned = true;
      this.blockedMs = 0;
      this.beginStop();
    }
    // If this physics step would enter the guest, yield from the owner's last
    // safe position. The scene then guards any remaining attempted contact.
    if (owner?.previous && distance(this.position, owner) < this.radius + (owner.radius ?? 14) + 0.1) {
      owner = { ...owner, ...owner.previous };
    }
    const yielded = this.yieldStep(owner, this.speed * dt / 1000)
      || this.peers.some(peer => peer.priority < this.priority && this.yieldStep(peer, this.speed * dt / 1000, true,
        owner ? [{ ...owner, radius: (owner.radius ?? 14) + 0.05 }] : []));
    let blocked = yielded;
    if (!blocked && this.waiting && distance(this.position, this.stop.position) < 0.01) {
      this.facing = this.stop.facing ?? this.facing;
      if (!this.stop.hold) {
        this.waitRemainingMs = Math.max(0, this.waitRemainingMs - dt);
        if (!this.waitRemainingMs) { this.stage++; this.beginStop(); }
      }
    } else if (!blocked) {
      if (this.waiting && !this.goals.length) this.goals = [{ ...this.stop.position }];
      let budget = this.speed * dt / 1000;
      while (budget > 0.0001 && this.goals.length) {
        if (distance(this.position, this.goals[0]) < 0.00001) {
          this.goals.shift(); this.route = []; this.lastPlanMs = -Infinity; this.waypointsReached++; continue;
        }
        if (!this.route.length) this.plan(owner);
        if (!this.route.length) { blocked = true; break; }
        const next = this.route[0], d = distance(this.position, next);
        if (d < 0.00001) { this.route.shift(); continue; }
        this.intent = { x: (next.x - this.position.x) * this.speed / d, y: (next.y - this.position.y) * this.speed / d };
        const step = Math.min(1, budget, d);
        const p = { x: this.position.x + (next.x - this.position.x) * step / d,
          y: this.position.y + (next.y - this.position.y) * step / d };
        if (!this.clear(this.position, p, this.blockers(owner))) { this.route = []; blocked = true; break; }
        this.position = p; budget -= step;
        if (distance(this.position, this.goals[0]) < 0.00001) {
          this.goals.shift(); this.route = []; this.lastPlanMs = -Infinity;
          this.waypointsReached++;
        }
      }
      if (!this.goals.length && !blocked) {
        if (this.waiting) this.facing = this.stop.facing ?? this.facing;
        else if (this.stop.waitMs || this.stop.hold) {
          this.waiting = true;
          this.waitRemainingMs = this.stop.waitMs ?? 0;
          this.facing = this.stop.facing ?? this.facing;
        } else if (this.stop.exit) { this.complete = true; this.route = []; }
        else { this.stage++; this.beginStop(); }
      }
    }
    const dx = this.position.x - previous.x, dy = this.position.y - previous.y;
    this.moving = Math.hypot(dx, dy) > 0.0001;
    if (this.moving) {
      this.velocity = { x: dx * 1000 / dt, y: dy * 1000 / dt };
      this.facing = direction(dx, dy);
    }
    // Reception idle always looks toward the desk, including its arrival frame.
    if (this.waiting && !this.goals.length && !blocked) this.facing = this.stop.facing ?? this.facing;
    if (this.complete || (this.waiting && !this.goals.length && !blocked)) {
      this.moving = false;
      this.velocity = { x: 0, y: 0 };
      this.intent = { x: 0, y: 0 };
    }
    this.blockedMs = blocked ? this.blockedMs + dt : 0;
  }

  snapshot() {
    return { state: this.state, stage: this.stage, position: { ...this.position }, facing: this.facing,
      moving: this.moving, spawned: this.spawned, complete: this.complete, suspended: this.suspended,
      speed: this.speed, radius: this.radius, velocity: { ...this.velocity }, activeMs: this.activeMs,
      waitRemainingMs: this.waitRemainingMs, blockedMs: this.blockedMs, stuck: this.blockedMs >= this.stuckMs,
      replans: this.replans,
      destination: { ...this.stop.position }, route: this.route.map(p => ({ ...p })) };
  }
}
