import { TRAVELER_SPRITE } from './casual-traveler-sprite.js';
import { NpcSprite, preloadNpcSprite } from './npc-sprite.js';

// Appearance is independent of arrivals, movement and reception service.
const appearance = (name, fallbackColor, tags = []) => Object.freeze({ ...TRAVELER_SPRITE,
  id: name, key: name, name, fallbackColor, tags: Object.freeze(['hotel-guest', ...tags]),
  url: new URL(`./assets/guests/${name}/${name}.png`, import.meta.url).href });
export const GUEST_APPEARANCES = Object.freeze({
  'casual-traveler': appearance('casual-traveler', TRAVELER_SPRITE.fallbackColor),
  'business-traveler': appearance('business-traveler', 0xd8c9a8),
  'older-leisure-traveler': appearance('older-leisure-traveler', 0x287d7c),
  'conference-attendee': appearance('conference-attendee', 0x9d3034, ['professional-attire']),
  'vacation-tourist': appearance('vacation-tourist', 0x7c8c4d, ['casual-attire']),
  'luxury-hotel-guest': appearance('luxury-hotel-guest', 0x642d60, ['evening-attire']),
  'young-casino-visitor': appearance('young-casino-visitor', 0x204ba8, ['casual-attire']),
  'high-roller': appearance('high-roller', 0x702839, ['evening-attire']),
});
export function preloadGuestAppearances(scene) {
  for (const config of Object.values(GUEST_APPEARANCES)) preloadNpcSprite(scene, config, config.url);
}
export function createGuestVisual(scene, appearanceId, runtimeId = appearanceId) {
  const config = GUEST_APPEARANCES[appearanceId];
  if (!config) throw new Error(`Unknown guest appearance: ${appearanceId}`);
  const visual = new NpcSprite(scene, config);
  visual.sprite?.setName(`${runtimeId}-sprite`);
  visual.fallback.setName(`${runtimeId}-placeholder`);
  visual.setVisible(false);
  return visual;
}
