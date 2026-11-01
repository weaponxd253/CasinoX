const { expect } = require('@playwright/test');
const { savedResort } = require('./saved-resort');
const { currentWorld, POINTS } = require('./lobby-world');
const { traffic, snap, storage, readyTraffic } = require('./traffic-world');

async function activitySimulation(page, body, args = null) {
  await page.goto('/');
  return page.evaluate(async ({ source, args }) => {
    const modules = await Promise.all([
      import('/world/hotel-state-adapter.js'), import('/world/guest-activity-director.js'),
      import('/world/guest-traffic-controller.js'), import('/world/guest-traffic-config.js'),
      import('/world/lobby-navigation.js'), import('/world/guest-dialogue-controller.js'), import('/world/guest-dialogue-config.js'),
    ]);
    return (0, eval)(`(${source})`)(Object.assign({}, ...modules), args);
  }, { source: body.toString(), args });
}

function managementFixture(edit = () => {}, position = { x: 380, y: 210, facing: 'down' }) {
  const values = savedResort(), state = JSON.parse(values.hotelGameState); edit(state);
  values.hotelGameState = JSON.stringify(state); values.casinoWorldState = currentWorld(position, { phase5eSentinel: 'preserve' });
  return values;
}

async function seedManagement(page, values) {
  await page.context().route(/https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com|cdnjs\.cloudflare\.com|randomuser\.me)\//, route => route.abort());
  await page.goto('/');
  await page.evaluate(values => { localStorage.clear(); for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value);
    sessionStorage.setItem('shellBonusPrompted', '1'); }, values);
}

module.exports = { activitySimulation, managementFixture, seedManagement, traffic, snap, storage, readyTraffic, expect, POINTS };
