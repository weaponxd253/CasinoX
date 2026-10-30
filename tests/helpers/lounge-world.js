const { expect } = require('@playwright/test');

const LOUNGE_POINTS = { spawn: { x: 480, y: 480 }, table: { x: 480, y: 410 }, exit: { x: 480, y: 535 },
  west: { x: 221, y: 410 }, east: { x: 739, y: 410 }, north: { x: 480, y: 174 } };
async function loungeSnapshot(page) { return page.evaluate(() => (window.CasinoWorldDebug ?? window.CasinoFloorDebug).snapshot()); }
async function loungeReady(page) {
  await expect(page.locator('#floor-canvas')).toHaveAttribute('aria-busy', 'false');
  await expect.poll(async () => Boolean((await loungeSnapshot(page)).player)).toBe(true);
  await page.locator('canvas').focus();
}

// Test-only navigation: compute a safe route from the artwork geometry and feed
// normal keyboard events. No teleport, physics overrides or product navigation AI.
async function walkLoungeTo(page, target) {
  await loungeReady(page);
  await page.evaluate(async to => {
    const { walkable } = await import(new URL('../floor/lounge-layout.js', location.href).href);
    const snap = () => (window.CasinoWorldDebug ?? window.CasinoFloorDebug).snapshot();
    const from = snap().player;
    const clear = (a, b) => {
      const n = Math.ceil(Math.hypot(a.x - b.x, a.y - b.y));
      for (let i = 0; i <= n; i++) {
        const t = n ? i / n : 0;
        if (!walkable({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })) return false;
      }
      return true;
    };
    let points;
    if ((from.x === to.x || from.y === to.y) && clear(from, to)) points = [to];
    else {
      const step = 4, cols = 241, nodes = new Uint8Array(cols * 151);
      const point = key => ({ x: key % cols * step, y: Math.floor(key / cols) * step });
      for (let key = 0; key < nodes.length; key++) if (walkable(point(key), 18)) nodes[key] = 1;
      const endpoint = p => {
        const candidates = [];
        for (let y = Math.round(p.y / step) - 3; y <= Math.round(p.y / step) + 3; y++) {
          for (let x = Math.round(p.x / step) - 3; x <= Math.round(p.x / step) + 3; x++) {
            const key = y * cols + x;
            if (nodes[key] && clear(p, point(key))) candidates.push(key);
          }
        }
        return candidates.sort((a, b) => Math.hypot(point(a).x - p.x, point(a).y - p.y) - Math.hypot(point(b).x - p.x, point(b).y - p.y))[0];
      };
      const start = endpoint(from), end = endpoint(to);
      if (start === undefined || end === undefined) throw new Error('Lounge endpoint is not reachable: ' + JSON.stringify({ from, to }));
      const queue = [start], previous = new Map([[start, null]]);
      for (let head = 0; head < queue.length && !previous.has(end); head++) {
        const key = queue[head];
        for (const next of [key - 1, key + 1, key - cols, key + cols]) {
          if (nodes[next] && !previous.has(next)) { previous.set(next, key); queue.push(next); }
        }
      }
      if (!previous.has(end)) throw new Error('No lounge route found');
      points = [to];
      for (let key = end; key !== null; key = previous.get(key)) points.push(point(key));
      points.reverse();
      const simplified = [];
      for (const p of points) {
        const a = simplified.at(-2), b = simplified.at(-1);
        if (a && ((a.x === b.x && b.x === p.x) || (a.y === b.y && b.y === p.y))) simplified[simplified.length - 1] = p;
        else simplified.push(p);
      }
      points = simplified;
    }
    const canvas = document.querySelector('canvas'), held = new Set();
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
        const state = snap();
        if (state.failed || performance.now() > deadline) {
          setKeys([]); reject(new Error('Lounge walk stopped: ' + JSON.stringify({ player: state.player, target: points[index], failed: state.failed }))); return;
        }
        while (index < points.length && Math.hypot(points[index].x - state.player.x, points[index].y - state.player.y) <= 4) index++;
        if (index >= points.length) { setKeys([]); requestAnimationFrame(() => requestAnimationFrame(resolve)); return; }
        const dx = points[index].x - state.player.x, dy = points[index].y - state.player.y;
        setKeys(Math.abs(dx) > Math.abs(dy) ? [dx > 0 ? 'd' : 'a'] : [dy > 0 ? 's' : 'w']);
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }, target);
  await expect.poll(async () => (await loungeSnapshot(page)).velocity).toEqual({ x: 0, y: 0 });
}
module.exports = { LOUNGE_POINTS, loungeReady, loungeSnapshot, walkLoungeTo };
