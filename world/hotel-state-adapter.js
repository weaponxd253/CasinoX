import '../hotel/hotel-config.js';

const { selectors, UPGRADE_CATALOG } = window.HotelConfig;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const populationValid = value => Number.isSafeInteger(value) && value >= 0;
const numberIn = (value, low, high) => typeof value === 'number' && Number.isFinite(value) && value >= low && value <= high;
const freeze = value => { if (object(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const unavailable = (fields, reason) => ({ available: false, ...Object.fromEntries(fields.map(key => [key, null])), reason });

// The dashboard's occupancy is guest population / upgrade capacity, not a room ledger.
// Validation intentionally precedes the canonical selectors: engine defaults must
// never turn an absent presentation input into an invented measurement.
export function projectHotelState(state, source = {}) {
  const version = state?.meta?.version ?? 0;
  const supported = object(state) && Number.isInteger(version) && version >= 0 && version <= 9;
  const reason = !object(state) ? 'missing-state' : 'unsupported-version';
  let occupancy = unavailable(['guestPopulation', 'guestCapacity', 'percentage'], reason);
  let reception = unavailable(['assignedCount', 'coverageScore', 'coverageStatus'], reason);
  let satisfaction = unavailable(['score', 'normalizedScore'], reason);
  if (supported) {
    const population = state.guests?.population, level = state.departments?.rooms?.level;
    const capacity = Number.isInteger(level) && level >= 1 ? UPGRADE_CATALOG.rooms[level - 1]?.capacity : null;
    if (populationValid(population) && Number.isFinite(capacity) && capacity > 0) {
      occupancy = { available: true, guestPopulation: population, guestCapacity: selectors.getRoomCapacity(state),
        percentage: selectors.getOccupancyPercentage(population, capacity), reason: null };
    } else occupancy.reason = populationValid(population) ? 'unavailable-capacity' : 'unavailable-population';

    const roster = state.staff?.roster;
    const assignmentsKnown = Array.isArray(roster) && roster.every(member => object(member) && typeof member.assignment === 'string');
    const assigned = assignmentsKnown ? roster.filter(member => member.assignment === 'lobby') : [];
    const inputsKnown = assigned.every(member => typeof member.specialty === 'string' && typeof member.trait === 'string'
      && ['speed', 'service', 'discipline'].every(key => numberIn(member[key], 1, 13))
      && numberIn(member.stamina, 0, 100) && Number.isInteger(member.promotionTier) && numberIn(member.promotionTier, 0, 3));
    if (populationValid(population) && assignmentsKnown && inputsKnown) {
      const coverage = selectors.getStaffCoverage('lobby', state);
      reception = { available: true, assignedCount: coverage.assignedCount, coverageScore: coverage.score,
        coverageStatus: coverage.status, reason: null };
    } else reception.reason = !populationValid(population) ? 'unavailable-population' : 'unavailable-staff-inputs';

    if (numberIn(state.satisfaction?.current, 0, 100)) {
      satisfaction = { available: true, score: state.satisfaction.current, normalizedScore: state.satisfaction.current / 100, reason: null };
    } else satisfaction.reason = 'unavailable-satisfaction';
  }
  return freeze({ source: { kind: 'hotel-save', present: state !== null, readable: object(state),
    schemaVersion: object(state) ? version : null, savedAt: numberIn(state?.meta?.lastSaved, 0, Number.MAX_VALUE) ? state.meta.lastSaved : null,
    ...source }, occupancy: { metric: 'guest-capacity-utilization', ...occupancy },
  reception: { assignment: 'lobby', ...reception }, satisfaction });
}

// No HotelState import, initialization, migration, repair, mutation or writer API.
// Retain only one raw string and the immutable numeric projection, never the model.
export class HotelStateAdapter {
  constructor({ readRaw = () => localStorage.getItem('hotelGameState'), now = Date.now } = {}) {
    this.readRaw = readRaw; this.now = now; this.lastRaw = undefined; this.value = null;
    this.stats = { reads: 0, parses: 0, cacheHits: 0 };
  }
  read() {
    this.stats.reads++;
    let raw;
    try { raw = this.readRaw(); }
    catch (_) { return projectHotelState(null, { kind: 'unreadable', present: null, readable: false, capturedAt: this.now() }); }
    if (raw === this.lastRaw && this.value) { this.stats.cacheHits++; return this.value; }
    let state = null, readable = raw === null;
    try { if (raw !== null) { this.stats.parses++; state = JSON.parse(raw); readable = object(state); } }
    catch (_) { readable = false; }
    this.lastRaw = raw;
    this.value = projectHotelState(state, { present: raw !== null, readable, capturedAt: this.now() });
    return this.value;
  }
  snapshot() { return { ...this.stats }; }
}
