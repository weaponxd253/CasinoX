import { RECEPTION_QUEUE } from './reception-queue-manager.js';

const point = (x, y) => Object.freeze({ x, y });
export const GUEST_POINTS = Object.freeze({
  southSpawn: point(520, 548), southExit: point(480, 548), southApproach: point(520, 460),
  southExitApproach: point(480, 460), hotelSpawn: point(856, 350), hotelExit: point(856, 314),
  casinoExit: point(480, 174), westRoute: point(340, 460), eastRoute: point(620, 460),
});
export const IDLE_POSITIONS = Object.freeze([
  Object.freeze({ id: 'west-seating', position: point(286, 344), facing: 'left' }),
  Object.freeze({ id: 'east-seating', position: point(626, 350), facing: 'right' }),
]);
export const GUEST_TRAFFIC_CONFIG = Object.freeze({
  minArrivalMs: 15000, maxArrivalMs: 30000, maxVisible: 6, hardCap: 8, maxMoving: 4,
  minSpeed: 78, maxSpeed: 92, minIdleMs: 10000, maxIdleMs: 25000,
  hotelExitWeight: 0.5, radius: 14, spacing: 4, ownerMargin: 6,
  replanMs: 1000, stuckMs: 2000, permitMs: 2000, idleTurnMs: 8000, historyLimit: 64,
  weights: Object.freeze({ checkIn: 40, casino: 30, relaxing: 15, hotelDeparture: 15 }),
  idlePositions: IDLE_POSITIONS, points: GUEST_POINTS,
});

export function trafficConfig(overrides = {}) {
  const c = { ...GUEST_TRAFFIC_CONFIG, ...overrides,
    weights: { ...GUEST_TRAFFIC_CONFIG.weights, ...overrides.weights } };
  for (const key of ['minArrivalMs', 'maxArrivalMs', 'minIdleMs', 'maxIdleMs', 'permitMs']) {
    if (!Number.isFinite(c[key]) || c[key] < 0) throw new Error(`Invalid traffic setting: ${key}`);
  }
  for (const key of ['hardCap', 'maxVisible', 'maxMoving', 'historyLimit']) {
    if (!Number.isInteger(c[key]) || c[key] < 1) throw new Error(`Invalid traffic setting: ${key}`);
  }
  for (const key of ['minSpeed', 'maxSpeed', 'radius', 'replanMs', 'stuckMs', 'idleTurnMs']) {
    if (!Number.isFinite(c[key]) || c[key] <= 0) throw new Error(`Invalid traffic setting: ${key}`);
  }
  if (c.minArrivalMs > c.maxArrivalMs || c.minIdleMs > c.maxIdleMs || c.minSpeed > c.maxSpeed
    || !Number.isFinite(c.spacing) || c.spacing < 0 || !Number.isFinite(c.ownerMargin) || c.ownerMargin < 0
    || !Number.isFinite(c.hotelExitWeight) || c.hotelExitWeight < 0 || c.hotelExitWeight > 1
    || Object.keys(c.weights).some(key => !Object.hasOwn(GUEST_TRAFFIC_CONFIG.weights, key))
    || Object.values(c.weights).some(w => !Number.isFinite(w) || w < 0)
    || !Object.values(c.weights).some(w => w > 0)) throw new Error('Invalid traffic ranges or weights');
  c.maxVisible = Math.min(c.maxVisible, c.hardCap);
  c.maxMoving = Math.min(c.maxMoving, c.maxVisible);
  return c;
}

// Test/debug injection only; normal scenes use Math.random and default settings.
export function seededGuestRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let n = Math.imul(state ^ state >>> 15, 1 | state);
    n ^= n + Math.imul(n ^ n >>> 7, 61 | n);
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
}

export const DEBUG_TRAFFIC_PROFILES = Object.freeze({
  busy: Object.freeze({ minArrivalMs: 1500, maxArrivalMs: 2500, minIdleMs: 20000, maxIdleMs: 25000 }),
});

// The original Phase 5A/5B fixtures remain explicit, not production arrivals.
export const TRAVELER_JOURNEY = Object.freeze({ spawn: GUEST_POINTS.southSpawn, speed: 85, radius: 14,
  stops: Object.freeze([
    { id: 'reception', via: [point(520, 460), point(340, 460), point(340, 240)],
      position: RECEPTION_QUEUE.slots[0].position, waitMs: 8000, facing: 'up' },
    { id: 'hotel', via: [point(620, 220)], position: GUEST_POINTS.hotelExit, exit: true },
  ]) });
export const LOBBY_GUESTS = Object.freeze([
  Object.freeze({ id: 'casual-traveler', appearance: 'casual-traveler', arrivalMs: 0, speed: 85 }),
  Object.freeze({ id: 'business-traveler', appearance: 'business-traveler', arrivalMs: 4000, speed: 82 }),
  Object.freeze({ id: 'older-leisure-traveler', appearance: 'older-leisure-traveler', arrivalMs: 8000, speed: 88 }),
]);
