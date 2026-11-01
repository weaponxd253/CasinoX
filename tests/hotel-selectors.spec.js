const { test, expect } = require('@playwright/test');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const vm = require('node:vm');

for (const script of ['verify-hotel-selectors.cjs', 'verify-hotel-finance.cjs']) {
  test(`original hotel calculations retain exact parity: ${script}`, () => {
    const result = execFileSync(process.execPath, ['--preserve-symlinks', '--preserve-symlinks-main', `scripts/${script}`], { encoding: 'utf8' });
    expect(JSON.parse(result)).toMatchObject({ writes: 0, parity: 'exact' });
  });
}

test('shared hotel configuration has no state, storage, initialization or event side effects', () => {
  const events = [], reads = [], writes = [];
  const context = vm.createContext({ addEventListener: (...args) => events.push(args),
    localStorage: { getItem: key => reads.push(key), setItem: (...args) => writes.push(args) } });
  context.window = context;
  vm.runInContext(fs.readFileSync('hotel/hotel-config.js', 'utf8'), context);
  expect(events).toEqual([]); expect(reads).toEqual([]); expect(writes).toEqual([]);
  expect(context.HotelState).toBeUndefined(); expect(context.HotelEngine).toBeUndefined();
});
