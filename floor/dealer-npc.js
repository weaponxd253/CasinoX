import { OWNER_SPRITE } from '../world/owner-sprite.js';
import { NpcSprite, preloadNpcSprite } from '../world/npc-sprite.js';
import { toWorld } from './lounge-layout.js';

export const DEALER_SPRITE = Object.freeze({ key: 'blackjack-dealer', name: 'dealer', fallbackColor: 0x34323b,
  frameWidth: 256, frameHeight: 384, footBaseline: 368,
  scale: OWNER_SPRITE.scale / 4, frameRate: OWNER_SPRITE.frameRate,
  position: Object.freeze(toWorld(768, 340)),
  rows: Object.freeze({ down: 0, left: 4, right: 8, up: 12 }),
  idle: Object.freeze({ down: 0, left: 4, right: 8, up: 12 }),
});

const assetUrl = new URL('./assets/dealer/dealer.png', import.meta.url).href;
const GREETING = 'Welcome to the Blackjack Lounge, boss. Ready for a hand?';
export function preloadDealerSprite(scene) { preloadNpcSprite(scene, DEALER_SPRITE, assetUrl); }

// Transient presentation states only. The existing iframe owns the entire hand.
export class DealerNPC extends NpcSprite {
  constructor(scene) {
    super(scene, DEALER_SPRITE);
    this.state = 'IDLE';
    this.greetingArmed = true;
    this.greetingCount = 0;
  }

  updateProximity(near) {
    if (this.state === 'PLAYING') return;
    if (!near) {
      this.state = 'IDLE';
      this.greetingArmed = true;
    } else if (this.greetingArmed) {
      this.state = 'GREETING';
      this.greetingArmed = false;
      this.greetingCount++;
    }
  }

  setPlaying(open) { this.state = open ? 'PLAYING' : 'IDLE'; }
  get greeting() { return this.state === 'GREETING' ? GREETING : null; }
  snapshot() { return { ...super.snapshot(), state: this.state, greeting: this.greeting, greetingCount: this.greetingCount }; }
}
