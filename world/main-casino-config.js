import { MAIN_ART, MAIN_PORTALS, MAIN_SOLIDS, walkable } from './main-casino-layout.js';
export { walkable } from './main-casino-layout.js';
export const MAIN_CASINO = Object.freeze({ width:960, height:600, speed:190, playerRadius:14,
  label:'Main Casino Floor', spawn:MAIN_PORTALS.south.spawn, solids:MAIN_SOLIDS, art:MAIN_ART });
