import { clearOf } from './collision-geometry.js';
import { LOBBY_SOLIDS, toWorld } from './lobby-layout.js';

export const LOBBY_SPAWN = { ...toWorld(768, 850), facing: 'up' };
export function walkable(position, radius = 14) {
  return Number.isFinite(position?.x) && Number.isFinite(position?.y)
    && position.x >= radius && position.x <= 960 - radius
    && position.y >= radius && position.y <= 600 - radius
    && clearOf(position, LOBBY_SOLIDS, radius);
}
export function clearSegment(a, b, radius = 14) {
  const steps = Math.ceil(Math.hypot(a.x - b.x, a.y - b.y));
  for (let i = 0; i <= steps; i++) {
    const t = steps ? i / steps : 0;
    if (!walkable({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, radius)) return false;
  }
  return true;
}

let cached;
function navigation() {
  if (cached) return cached;
  const step = 4, columns = 241, rows = 151;
  const nodes = new Uint8Array(columns * rows);
  for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
    if (walkable({ x: x * step, y: y * step }, 14.25)) nodes[y * columns + x] = 1;
  }
  const start = Math.round(LOBBY_SPAWN.y / step) * columns + Math.round(LOBBY_SPAWN.x / step);
  if (!nodes[start]) throw new Error('Lobby spawn is obstructed.');
  const queue = [start]; nodes[start] = 2;
  for (let head = 0; head < queue.length; head++) {
    const index = queue[head];
    for (const next of [index - 1, index + 1, index - columns, index + columns]) {
      if (nodes[next] === 1) { nodes[next] = 2; queue.push(next); }
    }
  }
  cached = { nodes, columns, step, connected: queue.map(index => ({ x: index % columns * step, y: Math.floor(index / columns) * step })) };
  return cached;
}

export function reachable(position) {
  if (!walkable(position)) return false;
  const { nodes, columns, step } = navigation();
  const gx = Math.round(position.x / step), gy = Math.round(position.y / step);
  for (let y = gy - 1; y <= gy + 1; y++) for (let x = gx - 1; x <= gx + 1; x++) {
    if (nodes[y * columns + x] === 2 && clearSegment(position, { x: x * step, y: y * step })) return true;
  }
  return false;
}

export function nearestReachable(position) {
  let best, distance = Infinity;
  // Sort for deterministic tie-breaking independently of flood traversal order.
  for (const point of navigation().connected) {
    const d = (point.x - position.x) ** 2 + (point.y - position.y) ** 2;
    if (d < distance || (d === distance && (point.y < best.y || (point.y === best.y && point.x < best.x)))) {
      best = point; distance = d;
    }
  }
  if (!best) throw new Error('No reachable lobby floor is available.');
  return { ...position, ...best };
}

// Read-only path calculation is also used by journey tests to drive real keys.
export function lobbyPath(from, to) {
  if (!reachable(from) || !reachable(to)) throw new Error('Path endpoints must be reachable lobby floor.');
  if ((from.x === to.x || from.y === to.y) && clearSegment(from, to)) return [{ ...to }];
  const { nodes, columns, step, connected } = navigation();
  const endpoint = p => connected.filter(n => Math.abs(n.x - p.x) <= 8 && Math.abs(n.y - p.y) <= 8 && clearSegment(p, n))
    .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
  const start = endpoint(from), end = endpoint(to);
  const key = p => p.y / step * columns + p.x / step;
  const initial = key(start), target = key(end), queue = [initial], previous = new Map([[initial, null]]);
  for (let head = 0; head < queue.length && !previous.has(target); head++) {
    const index = queue[head];
    for (const next of [index - 1, index + 1, index - columns, index + columns]) {
      if (nodes[next] === 2 && !previous.has(next)) { previous.set(next, index); queue.push(next); }
    }
  }
  if (!previous.has(target)) throw new Error('No lobby route found.');
  const points = [{ ...to }];
  for (let index = target; index !== null; index = previous.get(index)) points.push({ x: index % columns * step, y: Math.floor(index / columns) * step });
  points.reverse();
  const simplified = [];
  for (const point of points) {
    const a = simplified[simplified.length - 2], b = simplified[simplified.length - 1];
    if (a && ((a.x === b.x && b.x === point.x) || (a.y === b.y && b.y === point.y))) simplified[simplified.length - 1] = point;
    else simplified.push(point);
  }
  return simplified;
}
