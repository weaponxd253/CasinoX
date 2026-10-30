// Build fixtures through the real default-save API, without initializing it.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function savedResort() {
  const context = vm.createContext({ Date, Math, queueMicrotask, addEventListener() {}, crypto: { randomUUID: () => 'existing-resort' } });
  context.window = context;
  const root = path.resolve(__dirname, '../..');
  for (const name of ['hotel-config.js', 'hotel-state.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, 'hotel', name), 'utf8'), context);
  }
  const hotel = JSON.parse(JSON.stringify(context.HotelState.createNewSave('Existing Resort')));
  hotel.currencies.hotelCash = 4321;
  hotel.auditSentinel = { preserved: true };
  return {
    hotelGameState: JSON.stringify(hotel), casinoBalance: '250.25',
    casinoProfile: JSON.stringify({ xp: 17, lastClaim: null, streak: 2, auditSentinel: true }),
    hotelGuestPool: JSON.stringify({ version: 1, pool: [], activeGuests: [], guestHistory: [], poolFetchedAt: Date.now() }),
    theme: 'dark', casinoMuted: '1', slotToastShown: 'true', casinoWelcomed: '1',
    checkinGameCooldown: '12345', customLegacyKey: 'leave this alone',
  };
}

module.exports = { savedResort };
