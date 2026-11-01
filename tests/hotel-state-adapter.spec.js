const { test, expect } = require('@playwright/test');
const { savedResort } = require('./helpers/saved-resort');
const fixture = () => JSON.parse(savedResort().hotelGameState);

test('adapter projects canonical capacities, genuine zero and unrestricted over-capacity values', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async state => {
    const { projectHotelState } = await import('/world/hotel-state-adapter.js');
    const results = [];
    for (let level = 1; level <= 5; level++) for (const population of [0, 1, 13, 48, 200]) {
      state.departments.rooms.level = level; state.guests.population = population;
      state.satisfaction.current = population === 0 ? 0 : 1;
      results.push(projectHotelState(state));
    }
    return results;
  }, fixture());
  const capacities = [10, 16, 24, 34, 48];
  result.forEach((value, index) => {
    const pop = [0, 1, 13, 48, 200][index % 5], capacity = capacities[Math.floor(index / 5)];
    expect(value.occupancy).toMatchObject({ available: true, guestPopulation: pop, guestCapacity: capacity, percentage: Math.round(pop / capacity * 100) });
    expect(value.satisfaction).toMatchObject({ available: true, score: pop === 0 ? 0 : 1, normalizedScore: pop === 0 ? 0 : .01 });
  });
});

test('adapter validates each feature independently without substituting missing values', async ({ page }) => {
  await page.goto('/');
  const cases = await page.evaluate(async original => {
    const { projectHotelState } = await import('/world/hotel-state-adapter.js');
    const results = [];
    const add = (name, edit) => { const s = structuredClone(original); edit(s); results.push({ name, value: projectHotelState(s) }); };
    for (const value of [undefined, null, NaN, Infinity, -1, '5', .5]) add(`population:${value}`, s => { s.guests.population = value; });
    for (const value of [undefined, null, 0, 6, -1, '1', 1.5]) add(`level:${value}`, s => { s.departments.rooms.level = value; });
    for (const value of [undefined, null, NaN, Infinity, -1, 101, '75']) add(`satisfaction:${value}`, s => { s.satisfaction.current = value; });
    for (const field of ['speed', 'service', 'discipline', 'stamina', 'promotionTier', 'trait', 'specialty', 'assignment']) add(`staff:${field}`, s => { delete s.staff.roster[0][field]; });
    add('no-roster', s => { delete s.staff.roster; });
    add('empty-roster', s => { s.staff.roster = []; });
    add('resting', s => { s.staff.roster[0].assignment = 'rest'; });
    add('thin', s => { s.staff.roster[0].assignment = 'rest'; s.staff.roster[2].assignment = 'lobby'; });
    add('zero-stamina', s => { s.staff.roster[0].stamina = 0; });
    add('zero-morale', s => { s.staff.morale = 0; });
    add('rolling-average-only', s => { delete s.satisfaction.current; s.satisfaction.rollingAverage = 100; });
    for (const version of [0, 1, 8, 9, 10, '9', -1]) add(`version:${typeof version}:${version}`, s => { s.meta.version = version; });
    return results;
  }, fixture());
  for (const { name, value } of cases) {
    if (name.startsWith('population:')) { expect(value.occupancy.available).toBe(false); expect(value.reception.available).toBe(false); expect(value.satisfaction.available).toBe(true); }
    if (name.startsWith('level:')) { expect(value.occupancy.available).toBe(false); expect(value.reception.available).toBe(true); expect(value.satisfaction.available).toBe(true); }
    if (name.startsWith('satisfaction:') || name === 'rolling-average-only') { expect(value.satisfaction.available).toBe(false); expect(value.occupancy.available).toBe(true); expect(value.reception.available).toBe(true); }
    if (name.startsWith('staff:') || name === 'no-roster') { expect(value.reception.available).toBe(false); expect(value.occupancy.available).toBe(true); expect(value.satisfaction.available).toBe(true); }
    for (const feature of ['occupancy', 'reception', 'satisfaction']) if (!value[feature].available) expect(value[feature].reason).toEqual(expect.any(String));
  }
  const get = name => cases.find(c => c.name === name).value;
  expect(get('empty-roster').reception).toMatchObject({ available: true, assignedCount: 0, coverageScore: 0, coverageStatus: 'short' });
  expect(get('resting').reception.coverageStatus).toBe('short'); expect(get('thin').reception.coverageStatus).toBe('thin');
  expect(get('zero-stamina').reception.coverageStatus).toBe('short'); expect(get('zero-morale').reception.coverageStatus).toBe('covered');
  for (const version of [0, 1, 8, 9]) expect(get(`version:number:${version}`).occupancy.available).toBe(true);
  for (const version of [10, '9', -1]) expect(Object.values(get(`version:${typeof version}:${version}`)).filter(x => x?.available).length).toBe(0);
});

test('adapter caches raw saves, freezes projections, tolerates unreadable data and never writes or starts engines', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async state => {
    const writes = [], originalSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function (...args) { writes.push(args); return originalSet.apply(this, args); };
    const before = JSON.stringify(state), freeze = o => { if (o && typeof o === 'object') { Object.values(o).forEach(freeze); Object.freeze(o); } return o; };
    const { HotelStateAdapter, projectHotelState } = await import('/world/hotel-state-adapter.js');
    projectHotelState(freeze(state));
    let raw = JSON.stringify(state), now = 1;
    const adapter = new HotelStateAdapter({ readRaw: () => raw, now: () => now });
    const first = adapter.read(); now++; const cached = adapter.read();
    const frozen = Object.isFrozen(first) && Object.isFrozen(first.source) && Object.isFrozen(first.occupancy);
    raw = null; const missing = adapter.read(); raw = '{bad'; const corrupt = adapter.read(); adapter.read();
    raw = 'null'; const nullValue = adapter.read();
    const unreadable = new HotelStateAdapter({ readRaw() { throw Error('Denied'); } }).read();
    Storage.prototype.setItem = originalSet;
    return { same: first === cached, frozen, unchanged: before === JSON.stringify(state), stats: adapter.snapshot(),
      missing, corrupt, nullValue, unreadable, writes, globals: [typeof HotelState, typeof HotelEngine] };
  }, fixture());
  expect(result.same).toBe(true); expect(result.frozen).toBe(true); expect(result.unchanged).toBe(true);
  expect(result.stats).toEqual({ reads: 6, parses: 3, cacheHits: 2 });
  expect(result.missing.source.present).toBe(false); expect(result.corrupt.source).toMatchObject({ present: true, readable: false });
  expect(result.nullValue.source).toMatchObject({ present: true, readable: false }); expect(result.unreadable.source.kind).toBe('unreadable');
  expect(result.writes).toEqual([]); expect(result.globals).toEqual(['undefined', 'undefined']);
});
