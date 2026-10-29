const { expect } = require('@playwright/test');

const POINTS = {
  spawn: { x: 480, y: 498, facing: 'up' },
  reception: { x: 206, y: 220, facing: 'up' },
  beforeReception: { x: 206, y: 242, facing: 'up' },
  casino: { x: 480, y: 190, facing: 'up' },
  office: { x: 717, y: 243, facing: 'up' },
  hotel: { x: 856, y: 314, facing: 'right' },
};
function currentWorld(lobby = POINTS.spawn, extra = {}) {
  return JSON.stringify({ version: 2, layout: 'luxury-lobby-1', lobby, updatedAt: 1700000000000, ...extra });
}

async function walkTo(page, target) {
  await expect(page.locator('#floor-canvas')).toHaveAttribute('aria-busy', 'false');
  await expect.poll(() => page.evaluate(() => Boolean(CasinoWorldDebug.snapshot().player))).toBe(true);
  await page.locator('canvas').focus();
  // Dispatch keyboard events through Phaser's normal input target at frame
  // boundaries. No body, position, speed or game state is changed by the driver.
  await page.evaluate(async to => {
    const { lobbyPath } = await import('/world/lobby-navigation.js');
    const points = lobbyPath(CasinoWorldDebug.snapshot().player, to);
    const canvas = document.querySelector('#floor-canvas canvas');
    const held = new Set();
    const codes = { w: ['KeyW', 87], a: ['KeyA', 65], s: ['KeyS', 83], d: ['KeyD', 68] };
    const emit = (key, down) => canvas.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', {
      key, code: codes[key][0], keyCode: codes[key][1], which: codes[key][1], bubbles: true, cancelable: true,
    }));
    const setKeys = keys => {
      for (const key of [...held]) if (!keys.includes(key)) { emit(key, false); held.delete(key); }
      for (const key of keys) if (!held.has(key)) { emit(key, true); held.add(key); }
    };
    await new Promise((resolve, reject) => {
      const deadline = performance.now() + 25000;
      let index = 0;
      const step = () => {
        const state = CasinoWorldDebug.snapshot();
        if (state.failed || performance.now() > deadline) {
          setKeys([]); reject(new Error('Keyboard route stopped at ' + JSON.stringify({ player: state.player, target: points[index], failed: state.failed }))); return;
        }
        while (index < points.length && Math.hypot(points[index].x - state.player.x, points[index].y - state.player.y) <= 4) index++;
        if (index >= points.length) {
          setKeys([]); requestAnimationFrame(() => requestAnimationFrame(resolve)); return;
        }
        const point = points[index], dx = point.x - state.player.x, dy = point.y - state.player.y;
        // Cardinal runs keep the clearance proof meaningful; tiny endpoint
        // corrections are handled on the dominant axis.
        setKeys(Math.abs(dx) > Math.abs(dy) ? [dx > 0 ? 'd' : 'a'] : [dy > 0 ? 's' : 'w']);
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }, target);
  await expect.poll(() => page.evaluate(() => CasinoWorldDebug.snapshot().velocity)).toEqual({ x: 0, y: 0 });
}
module.exports = { POINTS, currentWorld, walkTo };
