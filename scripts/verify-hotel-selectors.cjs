const fs = require('fs');
const vm = require('vm');
const assert = require('assert/strict');
const path = require('path');
const cryptoHash = require('crypto');
const root = process.cwd();
const writes = [];
const context = vm.createContext({ console, window: { addEventListener() {} },
  localStorage: { getItem() { return null; }, setItem(...args) { writes.push(args); } },
  queueMicrotask() { throw Error('Unexpected save'); }, Date, Math, crypto: require('crypto').webcrypto });
context.window = context; context.addEventListener = () => {};
for (const file of ['hotel-config.js', 'hotel-state.js', 'hotel-guests.js']) {
  let source = fs.readFileSync(path.join(root, 'hotel', file), 'utf8');
  // Test-only seam: exercise the existing rest-slot getter with explicit frozen fixtures.
  if (file === 'hotel-state.js') source = source.replace('init, get, save, saveNow,', 'testSetState: s => { _state = s; }, init, get, save, saveNow,');
  vm.runInContext(source, context, { filename: file });
}
const run = code => vm.runInContext(code, context);
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const initial = JSON.parse(run('JSON.stringify(HotelState.createNewSave())'));
initial.meta.createdAt = initial.meta.lastSaved = initial.meta.lastOpened = 0;
initial.meta.saveId = 'selector-fixture';
const traits = [...new Set([...fs.readFileSync('hotel/hotel-config.js', 'utf8').matchAll(/^\s*'([^']+)': \{ department:/gm),
  ...fs.readFileSync('hotel/hotel-state.js', 'utf8').matchAll(/^\s*'([^']+)': \{ department:/gm)].map(m => m[1]))];
const cases = [];
function add(label, edit, assignment = 'lobby') {
  const state = structuredClone(initial); edit(state); cases.push({ label, assignment, state });
}
const assignments = ['lobby', 'rooms', 'casino', 'restaurant', 'bar', 'entertainment', 'spa', 'rest'];
for (const assignment of assignments) for (const level of [0, 1, 2, 3, 4, 5]) for (const population of [0, 4, 18, 19, 36, 130, 500]) {
  add(`level/${assignment}/${level}/${population}`, s => { s.departments[assignment] = { level, unlocked: level > 0 }; s.guests.population = population; }, assignment);
}
for (const assignment of assignments) for (const trait of [...traits, '', 'Unknown trait']) for (const promotionTier of [0, 1, 2, 3]) {
  add(`traits/${assignment}/${trait}/${promotionTier}`, s => {
    s.staff.roster = [{ ...s.staff.roster[0], assignment, specialty: assignment, trait, promotionTier }];
  }, assignment);
}
for (const stamina of [0, 1, 44, 45, 80, 100, undefined]) for (const skill of [1, 5, 8, 10, 13, undefined]) for (const morale of [0, 75, 100, undefined]) for (const specialty of ['lobby', 'rooms']) {
  add(`skills/${stamina}/${skill}/${morale}/${specialty}`, s => {
    s.staff.morale = morale; s.staff.roster = [{ ...s.staff.roster[0], stamina, speed: skill, service: skill, discipline: skill, specialty }];
  });
}
add('empty', s => { s.staff.roster = []; });
add('mixed', s => { s.guests.population = 80; s.staff.roster = [...s.staff.roster, ...s.staff.roster.map((m, i) => ({ ...m, id: `extra-${i}`, assignment: 'lobby', promotionTier: i % 4 }))]; });
add('missing-optional', s => { s.staff = {}; s.guests = {}; s.departments = {}; });
const outputs = cases.map(({ label, assignment, state }) => {
  context.fixture = freeze(state); context.assignment = assignment;
  run('HotelState.testSetState(fixture)');
  const before = JSON.stringify(state);
  const output = JSON.parse(run('JSON.stringify({coverage:HotelState.getStaffCoverage(assignment,fixture),effect:HotelState.getStaffEffect(assignment,fixture),traits:HotelState.getStaffTraitSummary(assignment,fixture),payroll:HotelState.calculatePayrollPerDay(fixture.staff.roster ?? [])})'));
  assert.equal(JSON.stringify(state), before);
  return { label, output };
});
const capacities = [];
for (const level of [undefined, 0, 1, 2, 3, 4, 5, 6]) for (const population of [0, 1, 13, 48, 100, 500]) {
  context.fixture = freeze({ ...structuredClone(initial), departments: { rooms: { level } }, guests: { ...initial.guests, population } });
  capacities.push({ level: level ?? null, population, capacity: run('HotelGuests.getRoomCapacity(fixture)'), pct: run('HotelGuests.uiSummary(fixture).pct') });
}
const baseline = JSON.parse(fs.readFileSync('tests/fixtures/hotel-selector-baseline.json', 'utf8'));
const hashes = outputs.map(c => ({ label: c.label, sha256: cryptoHash.createHash('sha256').update(JSON.stringify(c.output)).digest('hex') }));
assert.deepEqual(hashes, baseline.cases, 'Original staffing / coverage / effects / payroll parity');
assert.deepEqual(capacities, baseline.capacities, 'Original room capacity / occupancy parity');
assert.deepEqual(writes, baseline.writes);
console.log(JSON.stringify({ cases: outputs.length, capacities: capacities.length, writes: writes.length, parity: 'exact' }));
