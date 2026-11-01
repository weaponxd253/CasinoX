import { GuestController, clipOwnerStep } from './guest-controller.js';
import { ReceptionQueueManager, RECEPTION_QUEUE } from './reception-queue-manager.js';
import { GUEST_APPEARANCES } from './guest-appearances.js';
import { trafficConfig, seededGuestRandom } from './guest-traffic-config.js';
import { GUEST_PERSONALITIES, chooseGuestPersonality, personalityRangeValue } from './guest-personalities.js';
import { clearSegment, lobbyPath, reachable, walkable } from './lobby-navigation.js';

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Coordinates visual traffic only. Movement and reception remain delegated to
// the same controllers used in Phases 5A/5B. No saved/business state is read.
export class GuestTrafficController {
  constructor({ config = {}, rng = Math.random, schedule = null, queue = RECEPTION_QUEUE,
    appearances = GUEST_APPEARANCES, personalities = GUEST_PERSONALITIES, personalityRng = null } = {}) {
    this.config = trafficConfig(config);
    this.admissionCeiling = this.config.maxVisible;
    this.rng = rng;
    this.appearances = appearances;
    this.personalities = personalities;
    this.legacy = schedule !== null;
    this.queue = new ReceptionQueueManager({ ...queue,
      historyLimit: this.legacy ? Infinity : this.config.historyLimit, softVia: !this.legacy,
      departureReady: () => this.legacy || this.canTravelToHotel() });
    this.guests = [];
    this.idleSlots = this.config.idlePositions.map(p => ({ ...p, position: { ...p.position }, reservedBy: null, clearingBy: null }));
    this.activeMs = 0;
    this.suspended = false;
    this.arrivalsEnabled = true;
    this.nextId = 1;
    this.pending = null;
    this.nextArrivalMs = this.legacy ? null : this.interval();
    // Reuse the already sampled initial draw to fork a deterministic stream.
    // Adding personality sampling consumes no additional traffic RNG values.
    this.personalityRng = personalityRng ?? seededGuestRandom(Math.floor((this.lastRandomValue ?? 0) * 4294967296) ^ 0x9e3779b9);
    this.lastAppearance = null;
    this.appearanceLastUsed = new Map();
    this.permits = new Map();
    this.history = [];
    this.completedHistory = [];
    this.stats = { created: 0, completed: 0, despawned: 0, recoveries: 0,
      totalReplans: 0, navigationCalls: 0, maxPopulation: 0, maxMovingObserved: 0 };
    this.movedThisStep = [];
    this.admissionBlocked = null;
    if (this.legacy) {
      this.guests.push(...schedule.map((item, sequence) => this.makeGuest({ ...item, sequence,
        purpose: 'checkIn', spawn: this.config.points.southSpawn })));
    } else this.validateDestinations();
  }

  random() {
    const value = this.rng();
    if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error('Guest RNG must return a number in [0,1]');
    this.lastRandomValue = value;
    return value;
  }
  range(min, max) { return min + this.random() * (max - min); }
  interval() { this.arrivalIntervalMs = this.range(this.config.minArrivalMs, this.config.maxArrivalMs); return this.arrivalIntervalMs; }
  applyActivitySettings({ minArrivalMs, maxArrivalMs, admissionCeiling, weights }) {
    if (this.legacy) return;
    if (!Number.isInteger(admissionCeiling) || admissionCeiling < 1 || admissionCeiling > this.config.maxVisible) throw Error('Invalid activity admission ceiling');
    const next = trafficConfig({ ...this.config, minArrivalMs, maxArrivalMs, weights });
    const changed = minArrivalMs !== this.config.minArrivalMs || maxArrivalMs !== this.config.maxArrivalMs;
    const remaining = this.arrivalIntervalMs > 0 ? Math.max(0, Math.min(1, this.nextArrivalMs / this.arrivalIntervalMs)) : 0;
    this.config.minArrivalMs = next.minArrivalMs; this.config.maxArrivalMs = next.maxArrivalMs;
    this.config.weights = next.weights; this.admissionCeiling = admissionCeiling;
    // Preserve elapsed progress; unchanged refreshes consume no random draws.
    // A due, blocked arrival retains its one pending purpose until admitted.
    if (changed && !this.pending) this.nextArrivalMs = remaining * this.interval();
  }
  remember(list, event) {
    list.push(event);
    if (list.length > this.config.historyLimit) list.splice(0, list.length - this.config.historyLimit);
  }

  validateDestinations() {
    const p = this.config.points;
    for (const point of [...Object.values(p), ...this.idleSlots.map(s => s.position), ...this.queue.slots.map(s => s.position)]) {
      if (!walkable(point, this.config.radius) || !reachable(point)) throw new Error('Guest destination is not reachable lobby floor');
    }
    const pairs = [[p.southSpawn, p.casinoExit], [p.hotelSpawn, p.southExit], [p.southSpawn, this.queue.slots[0].position]];
    for (const slot of this.idleSlots) pairs.push([p.southSpawn, slot.position], [slot.position, p.hotelExit], [slot.position, p.southExit]);
    for (const [from, to] of pairs) {
      let previous = from;
      for (const next of lobbyPath(from, to, { smooth: true })) {
        if (!clearSegment(previous, next, this.config.radius)) throw new Error('Invalid guest journey route');
        previous = next;
      }
    }
  }

  makeGuest(options) {
    const c = this.config;
    const controller = new GuestController({ spawn: options.spawn, speed: options.speed, radius: c.radius,
      replanMs: c.replanMs, stuckMs: c.stuckMs, stops: [],
      path: (a, b, blockers) => { this.stats.navigationCalls++; return lobbyPath(a, b, { blockers, smooth: true }); },
      clear: (a, b, blockers = []) => clearSegment(a, b, c.radius, blockers),
      walkable: p => walkable(p, c.radius) });
    controller.goTo({ id: 'entrance', position: options.spawn });
    return { ...options, controller, ownerContactHolds: 0, state: 'ARRIVING',
      spawnedAtMs: null, lastGrantMs: -Infinity, probeAfterMs: 0, idleSlot: null,
      idleRemainingMs: null, idleElapsedMs: 0, idleTurns: 0, recoveredBlocked: false,
      waitingElapsedMs: 0, presentationFacing: null };
  }

  activeGuests() { return this.guests.filter(g => g.controller.spawned && !g.controller.complete); }
  observeQueue() {
    this.queue.observe(this.activeGuests().map(g => ({ id: g.id, ...g.controller.position, radius: g.controller.radius })));
  }
  freeIdleSlots() {
    return this.idleSlots.filter(slot => !slot.reservedBy && !slot.clearingBy
      && this.activeGuests().every(g => distance(g.controller.position, slot.position) >= g.controller.radius * 2 + this.config.spacing));
  }
  hotelDeparturesInPassage() {
    const boundary = this.config.points.eastRoute.x + this.config.radius + this.config.spacing;
    return this.activeGuests().filter(g => g.purpose === 'hotelDeparture' && g.controller.position.x > boundary);
  }
  canTravelToHotel() { return !this.hotelDeparturesInPassage().length; }
  canSpawnHotelDeparture() {
    return this.canTravelToHotel() && !this.activeGuests().some(g =>
      (g.purpose === 'checkIn' && this.queue.entries.get(g.id)?.state === 'DEPARTING')
      || (g.purpose === 'relaxing' && g.exit === 'hotel' && g.state === 'DEPARTING'));
  }
  choosePurpose() {
    const available = Object.entries(this.config.weights).filter(([purpose, weight]) => weight > 0
      && (purpose !== 'checkIn' || this.queue.canAdmit())
      && (purpose !== 'relaxing' || this.freeIdleSlots().length)
      && (purpose !== 'hotelDeparture' || this.canSpawnHotelDeparture()));
    const total = available.reduce((sum, [, w]) => sum + w, 0);
    if (!total) return null;
    let value = this.random() * total;
    return available.find(([, weight]) => (value -= weight) < 0)?.[0] ?? available.at(-1)[0];
  }
  chooseAppearance(spawn, purpose, idlePosition = null) {
    const ids = Object.keys(this.appearances);
    if (!ids.length) throw new Error('No guest appearances registered');
    const preceding = purpose === 'checkIn' ? this.guests.find(g => g.id === this.queue.order.at(-1)) : null;
    const scored = ids.map(id => ({ id, score: (ids.length > 1 && id === this.lastAppearance ? 1000 : 0)
      + (preceding?.appearance === id ? 20 : 0)
      + this.activeGuests().filter(g => g.appearance === id && (distance(g.controller.position, spawn) < 160
        || (idlePosition && distance(g.controller.position, idlePosition) < 160))).length * 10
      - Math.min(16, this.stats.created + 1 - (this.appearanceLastUsed.get(id) ?? 0)) * 1.5 }));
    const lowest = Math.min(...scored.map(s => s.score));
    const candidates = scored.filter(s => s.score === lowest);
    return candidates[Math.min(candidates.length - 1, Math.floor(this.random() * candidates.length))].id;
  }
  entranceClear(spawn, owner) {
    if (!walkable(spawn, this.config.radius)) return false;
    if (owner && [0, 0.125, 0.25].some(t => distance(spawn,
      { x: owner.x + (owner.vx ?? 0) * t, y: owner.y + (owner.vy ?? 0) * t })
      < this.config.radius + (owner.radius ?? 14) + this.config.ownerMargin)) return false;
    return this.activeGuests().every(g => [0, 0.125, 0.25].every(t => distance(spawn,
      { x: g.controller.position.x + g.controller.velocity.x * t, y: g.controller.position.y + g.controller.velocity.y * t })
      >= this.config.radius + g.controller.radius + this.config.spacing));
  }

  scheduleArrival(dt, owner) {
    if (this.legacy || !this.arrivalsEnabled) return;
    if (!this.pending) {
      this.nextArrivalMs = Math.max(0, this.nextArrivalMs - dt);
      if (this.nextArrivalMs > 0) return;
      this.pending = { state: 'SPAWNING', purpose: this.choosePurpose() };
    }
    const blocked = reason => { this.admissionBlocked = reason; };
    if (this.guests.length >= this.config.maxVisible) return blocked('population-cap');
    if (this.guests.length >= this.admissionCeiling) return blocked('activity-ceiling');
    if (this.guests.filter(g => !g.controller.arrived).length >= this.config.maxMoving) return blocked('movement-cap');
    this.pending.purpose ??= this.choosePurpose();
    const purpose = this.pending.purpose;
    if (!purpose || (purpose === 'checkIn' && !this.queue.canAdmit())) return blocked('reception-capacity');
    if (purpose === 'hotelDeparture' && !this.canSpawnHotelDeparture()) return blocked('hotel-passage');
    const idleCandidates = purpose === 'relaxing' ? this.freeIdleSlots() : [];
    if (purpose === 'relaxing' && !idleCandidates.length) return blocked('idle-capacity');
    const spawn = purpose === 'hotelDeparture' ? this.config.points.hotelSpawn : this.config.points.southSpawn;
    if (!this.entranceClear(spawn, owner)) return blocked('entrance-occupied');
    const idle = purpose === 'relaxing' ? idleCandidates[Math.min(idleCandidates.length - 1, Math.floor(this.random() * idleCandidates.length))] : null;
    const sequence = this.nextId++;
    const profile = chooseGuestPersonality(this.personalities, this.personalityRng);
    const guest = this.makeGuest({ id: `guest-${String(sequence).padStart(6, '0')}`, sequence, purpose,
      appearance: this.chooseAppearance(spawn, purpose, idle?.position),
      personality: profile.id, personalityProfile: profile,
      speed: personalityRangeValue(profile.speed, this.config.minSpeed, this.config.maxSpeed, this.random()),
      spawn, arrivalMs: this.activeMs, routeVariant: this.random() < 0.5 ? 'west' : 'east' });
    guest.controller.spawned = true;
    guest.spawnedAtMs = this.activeMs;
    this.guests.push(guest);
    this.startJourney(guest, idle);
    this.lastAppearance = guest.appearance;
    this.stats.created++;
    this.appearanceLastUsed.set(guest.appearance, this.stats.created);
    this.stats.maxPopulation = Math.max(this.stats.maxPopulation, this.guests.length);
    this.remember(this.history, { type: 'arrival', id: guest.id, appearance: guest.appearance, personality: guest.personality, purpose,
      atMs: this.activeMs, speed: guest.speed, routeVariant: guest.routeVariant });
    this.pending = null;
    this.admissionBlocked = null;
    this.nextArrivalMs = this.interval();
  }

  startJourney(guest, idle) {
    const c = guest.controller, p = this.config.points;
    if (guest.purpose === 'checkIn') {
      if (!this.queue.register(guest.id, c)) throw new Error('Guest reception admission changed during spawn');
      guest.state = 'QUEUEING';
    } else if (guest.purpose === 'casino') {
      c.goTo({ id: 'casino', via: [p.southApproach, guest.routeVariant === 'west' ? p.westRoute : p.eastRoute], position: p.casinoExit, exit: true, softVia: true });
      guest.state = 'WALKING';
    } else if (guest.purpose === 'relaxing') {
      idle.reservedBy = guest.id;
      guest.idleSlot = idle.id;
      guest.idleRemainingMs = personalityRangeValue(guest.personalityProfile.idle,
        this.config.minIdleMs, this.config.maxIdleMs, this.random());
      guest.idleDurationMs = guest.idleRemainingMs;
      guest.exit = this.random() < this.config.hotelExitWeight ? 'hotel' : 'south';
      c.goTo({ id: idle.id, via: [p.southApproach, idle.position.x < p.southApproach.x ? p.westRoute : p.eastRoute],
        position: idle.position, facing: idle.facing, softVia: true });
      guest.state = 'WALKING';
    } else {
      c.goTo({ id: 'south-exit', via: [p.eastRoute, p.southExitApproach], position: p.southExit, exit: true, softVia: true });
      guest.state = 'DEPARTING';
    }
  }

  priority(guest) {
    const queue = this.queue.entries.get(guest.id);
    return queue?.state === 'DEPARTING' && queue.slot !== null ? 0 : guest.sequence + 1;
  }
  allocatePermits(owner, candidates) {
    const eligible = candidates.filter(g => !g.controller.complete && (g.controller.goals.length
      || !g.controller.arrived || g.controller.needsOwnerYield(owner)));
    const urgency = g => {
      if (g.controller.needsOwnerYield(owner)) return 0;
      const e = this.queue.entries.get(g.id);
      if (e?.state === 'DEPARTING' && e.slot !== null) return 1;
      if (e?.state === 'ADVANCING') return 2;
      return 3;
    };
    const probing = eligible.filter(g => urgency(g) === 0 || g.controller.blockedMs < this.config.stuckMs || this.activeMs >= g.probeAfterMs);
    probing.sort((a, b) => urgency(a) - urgency(b)
      || Number((this.permits.get(b.id) ?? 0) > this.activeMs) - Number((this.permits.get(a.id) ?? 0) > this.activeMs)
      || a.lastGrantMs - b.lastGrantMs || a.sequence - b.sequence);
    const selected = probing.slice(0, this.config.maxMoving);
    const next = new Map();
    for (const g of selected) {
      const expires = this.permits.get(g.id) ?? 0;
      if (expires <= this.activeMs) g.lastGrantMs = this.activeMs;
      next.set(g.id, expires > this.activeMs ? expires : this.activeMs + this.config.permitMs);
      if (g.controller.blockedMs >= this.config.stuckMs) g.probeAfterMs = this.activeMs + this.config.replanMs;
    }
    this.permits = next;
  }

  blockers(guest, before) {
    const peers = this.activeGuests().filter(g => g !== guest).map(g => ({ id: g.id,
      ...g.controller.position, previous: before.get(g.id), radius: g.controller.radius,
      vx: g.controller.goals.length ? g.controller.intent.x : 0,
      vy: g.controller.goals.length ? g.controller.intent.y : 0,
      priority: this.priority(g) }));
    for (const slot of [...this.queue.slots, ...this.idleSlots]) {
      const occupant = slot.reservedBy ?? slot.clearingBy;
      if (occupant && occupant !== guest.id) peers.push({ ...slot.position, radius: this.config.radius });
    }
    return peers;
  }

  updateIdle(dt) {
    for (const slot of this.idleSlots) {
      const leaving = this.guests.find(g => g.id === slot.clearingBy);
      if (leaving && distance(leaving.controller.position, slot.position) >= this.config.radius * 2 + this.config.spacing) slot.clearingBy = null;
    }
    for (const g of this.guests) {
      if (g.purpose !== 'relaxing' || g.state === 'DEPARTING' || g.controller.complete) continue;
      const c = g.controller, slot = this.idleSlots.find(s => s.id === g.idleSlot);
      if (!c.arrived || c.moving) continue;
      if (g.state !== 'IDLING') { g.state = 'IDLING'; g.idleStartedMs = this.activeMs; continue; }
      const consumed = Math.min(dt, g.idleRemainingMs);
      g.idleRemainingMs -= consumed;
      g.idleElapsedMs += consumed;
      const turnMs = g.personalityProfile?.idleTurnMs ?? this.config.idleTurnMs;
      const turns = turnMs > 0 ? Math.floor(g.idleElapsedMs / turnMs) : 0;
      if (turns > g.idleTurns && g.idleRemainingMs > 0) {
        g.idleTurns = turns;
        c.stop.facing = turns % 2 ? 'up' : slot.facing;
        c.facing = c.stop.facing;
      }
      if (g.idleRemainingMs === 0 && (g.exit !== 'hotel' || this.canTravelToHotel())) {
        slot.reservedBy = null; slot.clearingBy = g.id;
        const p = this.config.points;
        c.goTo({ id: g.exit === 'hotel' ? 'hotel' : 'south-exit',
          via: g.exit === 'hotel' ? [] : [p.southExitApproach],
          position: g.exit === 'hotel' ? p.hotelExit : p.southExit, exit: true, softVia: true });
        g.state = 'DEPARTING';
      }
    }
  }

  updatePersonality(dt) {
    for (const g of this.guests) {
      const interval = g.personalityProfile?.waitingTurnMs ?? 0;
      const waiting = this.queue.entries.get(g.id)?.state === 'WAITING'
        && g.controller.arrived && !g.controller.moving;
      g.presentationFacing = null;
      if (!waiting) { g.waitingElapsedMs = 0; continue; }
      g.waitingElapsedMs += dt;
      if (interval > 0 && g.waitingElapsedMs >= interval && g.waitingElapsedMs % interval < 1500) {
        g.presentationFacing = g.sequence % 2 ? 'left' : 'right';
      }
    }
  }

  cleanup() {
    for (let i = this.guests.length - 1; i >= 0; i--) {
      const g = this.guests[i], c = g.controller;
      if (!c.complete || this.legacy) continue;
      const queue = this.queue.entries.get(g.id);
      this.remember(this.completedHistory, { id: g.id, appearance: g.appearance, personality: g.personality ?? null, purpose: g.purpose,
        atMs: this.activeMs, spawnedAtMs: g.spawnedAtMs, position: { ...c.position }, speed: c.speed,
        idleElapsedMs: g.idleElapsedMs, idleDurationMs: g.idleDurationMs ?? null,
        serviceStartedMs: queue?.serviceStartedMs ?? null, serviceEndedMs: queue?.serviceEndedMs ?? null,
        replans: c.replans });
      this.queue.unregister(g.id);
      for (const slot of this.idleSlots) {
        if (slot.reservedBy === g.id) slot.reservedBy = null;
        if (slot.clearingBy === g.id) slot.clearingBy = null;
      }
      this.permits.delete(g.id);
      g.visual?.destroy(); g.visual = null;
      this.guests.splice(i, 1);
      this.stats.completed++; this.stats.despawned++; this.stats.totalReplans += c.replans;
    }
    this.observeQueue();
  }

  update(deltaMs, owner) {
    if (this.suspended || (this.legacy && this.guests.every(g => g.controller.complete))) return { position: { ...owner }, held: false };
    const dt = Math.max(0, Math.min(deltaMs, 50));
    if (!dt) return { position: { ...owner }, held: false };
    this.activeMs += dt;
    this.observeQueue();
    this.scheduleArrival(dt, owner);
    const before = new Map(this.guests.map(g => [g.id, { ...g.controller.position }]));
    const pending = this.legacy ? this.guests.find(g => !g.controller.spawned) : null;
    const candidates = this.guests.filter(g => !g.controller.complete && (g.controller.spawned
      || (g === pending && this.activeMs >= g.arrivalMs)));
    this.allocatePermits(owner, candidates);
    this.movedThisStep = [];
    for (const g of [...candidates].sort((a, b) => this.priority(a) - this.priority(b))) {
      const c = g.controller, spawned = c.spawned;
      const wasBlocked = c.blockedMs >= c.stuckMs;
      c.priority = this.priority(g);
      c.update(dt, owner, this.blockers(g, before), { allowMovement: this.permits.has(g.id) });
      if (distance(before.get(g.id), c.position) > 0.0001) this.movedThisStep.push(g.id);
      if (wasBlocked && c.moving && !g.recoveredBlocked) { this.stats.recoveries++; g.recoveredBlocked = true; }
      if (!c.blockedMs) g.recoveredBlocked = false;
      if (this.legacy && !spawned && c.spawned) { g.spawnedAtMs = this.activeMs; this.queue.register(g.id, c); }
    }
    this.observeQueue();
    this.queue.update(dt);
    this.updateIdle(dt);
    this.updatePersonality(dt);
    this.stats.maxMovingObserved = Math.max(this.stats.maxMovingObserved, this.movedThisStep.length);
    const previous = owner.previous ?? owner;
    let position = { x: owner.x, y: owner.y }, held = false;
    for (const g of this.activeGuests()) {
      const c = g.controller;
      const result = clipOwnerStep(previous, position, before.get(g.id), c.position,
        (owner.radius ?? 14) + c.radius + 0.05, p => walkable(p, owner.radius ?? 14));
      if (result.held) { position = result.position; held = true; g.ownerContactHolds++; }
    }
    this.cleanup();
    return { position, held };
  }

  stopArrivals() { this.arrivalsEnabled = false; this.pending = null; this.admissionBlocked = null; }
  suspend() { this.suspended = true; this.movedThisStep = []; this.queue.suspend(); for (const g of this.guests) g.controller.suspend(); }
  resume() { this.suspended = false; this.queue.resume(); for (const g of this.guests) g.controller.resume(); }
  destroy() {
    for (const g of this.guests) g.visual?.destroy();
    this.guests.length = 0; this.pending = null; this.permits.clear(); this.queue.destroy();
    for (const slot of this.idleSlots) { slot.reservedBy = null; slot.clearingBy = null; }
  }
  guestSnapshot(g) {
    const entry = this.queue.entries.get(g.id), c = g.controller;
    const behavior = this.legacy ? entry?.state ?? 'ARRIVING'
      : c.complete ? 'COMPLETED' : !c.spawned ? 'SPAWNING'
        : c.blockedMs > 0 || (c.movementHeld && !c.arrived) ? 'YIELDING'
          : entry ? entry.state === 'BEING_SERVED' ? 'BEING_SERVED' : entry.state === 'DEPARTING' ? 'DEPARTING' : 'QUEUEING'
            : g.state;
    return { ...c.snapshot(), id: g.id, appearance: g.appearance, personality: g.personality ?? null,
      personalityLabel: g.personalityProfile?.label ?? null, presentationFacing: g.presentationFacing,
      waitingElapsedMs: g.waitingElapsedMs, purpose: g.purpose,
      arrivalMs: g.arrivalMs, spawnedAtMs: g.spawnedAtMs, behavior,
      destinationName: c.stop.id, routeVariant: g.routeVariant ?? null,
      reservedSlot: entry?.slot === null || !entry ? null : this.queue.slots[entry.slot].id,
      idleSlot: g.idleSlot, idleRemainingMs: g.idleRemainingMs,
      serviceRemainingMs: entry?.serviceRemainingMs ?? this.queue.config.serviceMs,
      ownerContactHolds: g.ownerContactHolds, movementPermit: this.permits.has(g.id) };
  }
  snapshot() {
    const guests = this.guests.map(g => this.guestSnapshot(g));
    return { activeMs: this.activeMs, suspended: this.suspended, mode: this.legacy ? 'phase5b' : 'dynamic',
      activeCount: this.activeGuests().length, populationCap: this.config.maxVisible, hardCap: this.config.hardCap,
      admissionCeiling: this.admissionCeiling, drainingCount: Math.max(0, this.activeGuests().length - this.admissionCeiling),
      movingCount: this.movedThisStep.length, maxMoving: this.config.maxMoving,
      waitingCount: guests.filter(g => g.spawned && !g.complete && !g.moving).length,
      nextArrivalMs: this.nextArrivalMs, pending: this.pending ? { ...this.pending, reason: this.admissionBlocked } : null,
      hotelPassage: { departures: this.hotelDeparturesInPassage().map(g => g.id),
        hotelBoundAllowed: this.canTravelToHotel() },
      settings: { ...this.config, weights: { ...this.config.weights },
        idlePositions: this.idleSlots.map(s => ({ id: s.id, position: { ...s.position }, facing: s.facing })),
        points: Object.fromEntries(Object.entries(this.config.points).map(([k, p]) => [k, { ...p }])) },
      stats: { ...this.stats }, registeredAppearanceCount: Object.keys(this.appearances).length,
      registeredPersonalityCount: Object.keys(this.personalities).length,
      appearanceHistory: this.history.map(e => ({ id: e.id, appearance: e.appearance, atMs: e.atMs })),
      guests, queue: this.queue.snapshot(),
      idleSlots: this.idleSlots.map(s => ({ ...s, position: { ...s.position } })),
      history: this.history.map(e => ({ ...e })), completedHistory: this.completedHistory.map(e => ({ ...e, position: { ...e.position } })) };
  }
}
