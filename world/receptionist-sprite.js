import { OWNER_SPRITE } from './owner-sprite.js';
import { toWorld } from './lobby-layout.js';
import { NpcSprite, preloadNpcSprite } from './npc-sprite.js';

// Presentation only: this NPC owns no physics, hotel record, clock or save data.
export const RECEPTIONIST_SPRITE = Object.freeze({ key: 'lobby-receptionist',
  name: 'receptionist', fallbackColor: 0x467365,
  frameWidth: 256, frameHeight: 384, footBaseline: 368,
  scale: OWNER_SPRITE.scale / 4, frameRate: OWNER_SPRITE.frameRate,
  position: Object.freeze({ ...toWorld(300, 296) }),
  rows: Object.freeze({ down: 0, left: 4, right: 8, up: 12 }),
  idle: Object.freeze({ down: 0, left: 4, right: 8, up: 12 }),
});

// Painted counter pixels are drawn through the lobby's existing depth/mask path.
// This adds presentation geometry only; LOBBY_SOLIDS is unchanged.
export const RECEPTION_COUNTER_FOREGROUND = Object.freeze({ id: 'reception-counter', baseline: 336,
  points: [[104, 260], [498, 260], [498, 294], [456, 337], [153, 337], [104, 302]] });

const assetUrl = new URL('./assets/receptionist/receptionist.png', import.meta.url).href;
export function preloadReceptionistSprite(scene) {
  preloadNpcSprite(scene, RECEPTIONIST_SPRITE, assetUrl);
}

export class ReceptionistSprite extends NpcSprite {
  constructor(scene) {
    super(scene, RECEPTIONIST_SPRITE);
  }
}
