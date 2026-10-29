import { clearOf } from './collision-geometry.js';

// Frozen v1 geometry. Never validate an old save against a newer room layout.
const solids = [
  { x: 480, y: 16, width: 960, height: 32 },
  { x: 480, y: 584, width: 960, height: 32 },
  { x: 16, y: 300, width: 32, height: 600 },
  { x: 944, y: 300, width: 32, height: 600 },
  { x: 210, y: 280, width: 240, height: 110 },
  { x: 480, y: 140, width: 180, height: 70 },
];
export function validLegacyPosition(position) {
  return Number.isFinite(position?.x) && Number.isFinite(position?.y)
    && position.x >= 0 && position.x <= 960 && position.y >= 0 && position.y <= 600
    && clearOf(position, solids, 14);
}
