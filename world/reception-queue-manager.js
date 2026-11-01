const point = (x, y) => Object.freeze({ x, y });
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const RECEPTION_QUEUE = Object.freeze({
  slots: Object.freeze([
    Object.freeze({ id: 'service', position: point(252, 220) }),
    Object.freeze({ id: 'waiting-1', position: point(300, 252) }),
    Object.freeze({ id: 'waiting-2', position: point(348, 252) }),
  ]),
  entrance: point(340, 300), clearance: point(340, 212),
  approach: Object.freeze([point(520, 460), point(340, 460), point(340, 300)]),
  departure: Object.freeze([point(340, 212), point(620, 220)]),
  hotel: point(856, 314), serviceMs: 8000, spacing: 4,
});

// Visual-only scheduling. Controllers own movement; this manager never assigns
// a position, renders artwork, invokes the hotel engine, or writes saved data.
export class ReceptionQueueManager {
  constructor(config = RECEPTION_QUEUE) {
    this.config = { ...RECEPTION_QUEUE, ...config };
    this.nextServiceMs = this.config.serviceMs;
    this.slots = this.config.slots.map(slot => ({ id: slot.id, position: { ...slot.position }, reservedBy: null, clearingBy: null }));
    this.entries = new Map();
    this.order = [];
    this.arrivalOrder = [];
    this.serviceOrder = [];
    this.completedOrder = [];
    this.activeMs = 0;
    this.suspended = false;
    this.occupants = [];
    this.historyLimit = config.historyLimit ?? Infinity;
    this.totals = { admitted: 0, served: 0, completed: 0 };
  }

  free(index, exceptId) {
    const slot = this.slots[index];
    return !slot.reservedBy && !slot.clearingBy && this.occupants.every(p => p.id === exceptId
      || distance(p, slot.position) >= p.radius * 2 + this.config.spacing)
      && [...this.entries.values()].every(e =>
      e.id === exceptId || e.controller.complete || distance(e.controller.position, slot.position)
        >= e.controller.radius * 2 + this.config.spacing);
  }

  canAdmit() { return this.slots.some((_, index) => this.free(index)); }
  setPresentationServiceMs(value) {
    if (![6000, 8000, 12000].includes(value)) throw Error('Invalid reception presentation duration');
    this.nextServiceMs = value;
  }
  observe(occupants) { this.occupants = occupants; }
  record(list, id, counter) {
    list.push(id);
    if (list.length > this.historyLimit) list.splice(0, list.length - this.historyLimit);
    this.totals[counter]++;
  }

  register(id, controller) {
    if (this.entries.has(id) || !controller.spawned || controller.complete) return false;
    const index = this.slots.findIndex((_, i) => this.free(i, id));
    if (index < 0) return false;
    const entry = { id, controller, slot: null, state: 'APPROACHING_QUEUE',
      serviceRemainingMs: this.config.serviceMs, serviceStartedMs: null, serviceEndedMs: null };
    this.entries.set(id, entry);
    this.order.push(id);
    this.record(this.arrivalOrder, id, 'admitted');
    this.assign(entry, index, this.config.approach);
    return true;
  }

  assign(entry, index, via = []) {
    const old = this.slots[entry.slot];
    if (old) {
      old.reservedBy = null;
      old.clearingBy = entry.id;
      entry.state = 'ADVANCING';
    }
    const slot = this.slots[index];
    slot.reservedBy = entry.id;
    entry.slot = index;
    entry.controller.goTo({ id: index === 0 ? 'reception' : slot.id, position: slot.position, via, facing: 'up', softVia: this.config.softVia });
  }

  update(deltaMs) {
    if (this.suspended) return;
    const dt = Math.max(0, Math.min(deltaMs, 50));
    if (!dt) return;
    this.activeMs += dt;
    for (const slot of this.slots) {
      const leaving = this.entries.get(slot.clearingBy);
      if (leaving && (leaving.controller.complete || distance(leaving.controller.position, slot.position)
        >= leaving.controller.radius * 2 + this.config.spacing)) slot.clearingBy = null;
    }
    for (const entry of this.entries.values()) {
      const c = entry.controller;
      if (entry.state === 'COMPLETED') continue;
      if (entry.state === 'DEPARTING') {
        // Timer expiry is too early: retain service until the guest physically
        // walks through the separate departure lane.
        if (entry.slot !== null && c.waypointsReached >= 1) {
          this.slots[entry.slot].reservedBy = null;
          entry.slot = null;
        }
        if (c.complete) {
          this.removeReservations(entry.id);
          entry.slot = null;
          entry.state = 'COMPLETED';
          this.record(this.completedOrder, entry.id, 'completed');
        }
        continue;
      }
      if (entry.state === 'BEING_SERVED') {
        if (c.arrived && !c.moving) entry.serviceRemainingMs = Math.max(0, entry.serviceRemainingMs - dt);
        c.waitRemainingMs = entry.serviceRemainingMs;
        if (entry.serviceRemainingMs === 0 && entry.serviceEndedMs === null) entry.serviceEndedMs = this.activeMs;
        if (entry.serviceRemainingMs === 0 && (this.config.departureReady?.() ?? true)) {
          entry.state = 'DEPARTING';
          this.order = this.order.filter(id => id !== entry.id);
          c.stage = 1; // Existing first-traveler diagnostic contract.
          c.goTo({ id: 'hotel', via: this.config.departure.map((p, i) => ({ ...p, required: i === 0 })),
            position: this.config.hotel, exit: true, softVia: this.config.softVia });
        }
      } else if (c.arrived) {
        entry.state = entry.slot === 0 && this.order[0] === entry.id ? 'BEING_SERVED' : 'WAITING';
        if (entry.state === 'BEING_SERVED') {
          entry.serviceDurationMs = this.nextServiceMs;
          entry.serviceRemainingMs = entry.serviceDurationMs;
          entry.serviceStartedMs = this.activeMs;
          this.record(this.serviceOrder, entry.id, 'served');
          c.waitRemainingMs = entry.serviceRemainingMs;
        }
      }
    }
    // A delayed guest retains seniority. Source occupancy remains a separate
    // clearing guard when its reservation transfers to the next destination.
    this.order.forEach((id, rank) => {
      const entry = this.entries.get(id);
      const target = entry.slot - 1;
      if (entry.slot > rank && this.free(target, id)) {
        const via = entry.state === 'APPROACHING_QUEUE' ? entry.controller.goals.slice(0, -1) : [];
        this.assign(entry, target, via);
      }
    });
  }

  removeReservations(id) {
    for (const slot of this.slots) {
      if (slot.reservedBy === id) slot.reservedBy = null;
      if (slot.clearingBy === id) slot.clearingBy = null;
    }
  }
  unregister(id) {
    this.removeReservations(id);
    this.order = this.order.filter(value => value !== id);
    this.entries.delete(id);
  }
  suspend() { this.suspended = true; }
  resume() { this.suspended = false; }
  destroy() { this.entries.clear(); this.occupants = []; this.order = []; for (const s of this.slots) { s.reservedBy = null; s.clearingBy = null; } }
  snapshot() {
    return { activeMs: this.activeMs, suspended: this.suspended, serviceMs: this.config.serviceMs, nextServiceMs: this.nextServiceMs,
      totals: { ...this.totals },
      order: [...this.order], arrivalOrder: [...this.arrivalOrder], serviceOrder: [...this.serviceOrder],
      completedOrder: [...this.completedOrder],
      slots: this.slots.map(s => ({ ...s, position: { ...s.position } })),
      guests: [...this.entries.values()].map(({ controller, ...entry }) => ({ ...entry,
        reservedSlot: entry.slot === null ? null : this.slots[entry.slot].id })) };
  }
}
