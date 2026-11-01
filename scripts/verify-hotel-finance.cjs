const fs = require('fs'), vm = require('vm'), assert = require('assert/strict');
const results = [], writes = [];
const context = vm.createContext({ console, Date, Math, crypto: { randomUUID: () => 'finance-baseline' },
  localStorage: { getItem: () => null, setItem: (...args) => writes.push(args) }, queueMicrotask() { throw Error('Save attempted'); }, addEventListener() {} });
context.window = context;
for (const file of ['hotel-config.js', 'hotel-state.js', 'hotel-engine.js']) {
  let text = fs.readFileSync(`hotel/${file}`, 'utf8');
  if (file === 'hotel-state.js') text = text.replace('init, get, save, saveNow,', 'testSetState: s => { _state = s; }, init, get, save, saveNow,');
  vm.runInContext(text, context);
}
const run = code => vm.runInContext(code, context);
run(`HotelState.setSatisfaction = value => calls.push(['satisfaction',value]);
HotelState.setTrend = value => calls.push(['trend',value]);
HotelState.setSatisfactionComponents = value => calls.push(['components',value]);`);
const base = JSON.parse(run('JSON.stringify(HotelState.createNewSave())'));
function freeze(obj) { if (obj && typeof obj === 'object') { Object.values(obj).forEach(freeze); Object.freeze(obj); } return obj; }
for (const level of [1, 2, 3, 4, 5]) for (const population of [0, 4, 10, 18, 48, 200]) for (const stamina of [0, 45, 100]) for (const promotionTier of [0, 3]) for (const morale of [0, 100]) {
  const state = structuredClone(base);
  for (const dept of Object.values(state.departments)) { dept.level = level; dept.unlocked = true; }
  state.guests.population = population; state.ticker.lastTick = 0; state.staff.morale = morale;
  state.staff.roster.forEach(m => { m.stamina = stamina; m.promotionTier = promotionTier; });
  context.fixture = freeze(state); context.calls = []; run('HotelState.testSetState(fixture)');
  const before = JSON.stringify(state);
  const output = JSON.parse(run('JSON.stringify({income:HotelEngine.calculateIncome(fixture,60000),ipm:HotelEngine.currentIpm(fixture),satisfaction:HotelEngine.recalculateSatisfaction(fixture),payroll:HotelState.calculatePayrollPerDay(fixture.staff.roster),calls})'));
  assert.equal(JSON.stringify(state), before);
  results.push({ level, population, stamina, promotionTier, morale, output });
}
const cryptoHash=require('crypto');
const hashes=results.map(c=>({level:c.level,population:c.population,stamina:c.stamina,promotionTier:c.promotionTier,morale:c.morale,sha256:cryptoHash.createHash('sha256').update(JSON.stringify(c.output)).digest('hex')}));
assert.deepEqual(hashes,JSON.parse(fs.readFileSync('tests/fixtures/hotel-finance-baseline.json','utf8')));
assert.equal(writes.length,0);
console.log(JSON.stringify({cases:results.length,writes:writes.length,parity:'exact'}));
