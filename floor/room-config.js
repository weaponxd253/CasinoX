import { LOUNGE_SOLIDS, LOUNGE_TABLE, LOUNGE_WALLS } from './lounge-layout.js';

// World coordinates stay fixed; Phaser scales the canvas to fit the page.
export const ROOM = Object.freeze({
  width: 960,
  height: 600,
  speed: 190,
  playerRadius: 14,
  spawn: { x: 480, y: 480 },
  exit: { x: 480, y: 535, reach: 44 },
  table: LOUNGE_TABLE,
  walls: LOUNGE_WALLS,
  solids: LOUNGE_SOLIDS,
});
