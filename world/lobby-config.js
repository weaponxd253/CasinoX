import { LOBBY_SOLIDS, LOBBY_INTERACTIONS } from './lobby-layout.js';
import { LOBBY_SPAWN } from './lobby-navigation.js';
export { walkable } from './lobby-navigation.js';
export { distanceFromRect } from './collision-geometry.js';

export const LOBBY = {
  width: 960, height: 600, speed: 190, playerRadius: 14,
  spawn: LOBBY_SPAWN, entrance: LOBBY_INTERACTIONS.casino, solids: LOBBY_SOLIDS,
};
