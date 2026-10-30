import { OWNER_SPRITE } from './owner-sprite.js';
import { NpcSprite, preloadNpcSprite } from './npc-sprite.js';

export const TRAVELER_SPRITE = Object.freeze({ key: 'casual-traveler', name: 'casual-traveler', fallbackColor: 0x5879a0,
  loadTimeout: 5000, loadRetries: 0,
  frameWidth: 256, frameHeight: 384, footBaseline: 368, scale: OWNER_SPRITE.scale / 4,
  frameRate: OWNER_SPRITE.frameRate, position: Object.freeze({ x: 520, y: 562 }),
  rows: Object.freeze({ down: 0, left: 4, right: 8, up: 12 }),
  idle: Object.freeze({ down: 0, left: 4, right: 8, up: 12 }),
});
const url = new URL('./assets/guests/casual-traveler/casual-traveler.png', import.meta.url).href;
export function preloadTravelerSprite(scene) { preloadNpcSprite(scene, TRAVELER_SPRITE, url); }
export class CasualTravelerSprite extends NpcSprite {
  constructor(scene) { super(scene, TRAVELER_SPRITE); this.setVisible(false); }
}
