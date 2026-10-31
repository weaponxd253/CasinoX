import { TRAVELER_SPRITE, preloadTravelerSprite } from './casual-traveler-sprite.js';
import { NpcSprite, preloadNpcSprite } from './npc-sprite.js';

// Appearance is independent of arrivals, movement and reception service.
const appearance = (name, fallbackColor) => Object.freeze({ ...TRAVELER_SPRITE,
  key: name, name, fallbackColor });
export const GUEST_APPEARANCES = Object.freeze({
  'casual-traveler': TRAVELER_SPRITE,
  'business-traveler': appearance('business-traveler', 0xd8c9a8),
  'older-leisure-traveler': appearance('older-leisure-traveler', 0x287d7c),
});
export function preloadGuestAppearances(scene) {
  preloadTravelerSprite(scene);
  for (const name of ['business-traveler', 'older-leisure-traveler']) {
    preloadNpcSprite(scene, GUEST_APPEARANCES[name],
      new URL(`./assets/guests/${name}/${name}.png`, import.meta.url).href);
  }
}
export function createGuestVisual(scene, appearanceId) {
  const config = GUEST_APPEARANCES[appearanceId];
  if (!config) throw new Error(`Unknown guest appearance: ${appearanceId}`);
  const visual = new NpcSprite(scene, config);
  visual.setVisible(false);
  return visual;
}
