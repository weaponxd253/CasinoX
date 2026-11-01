import { seededGuestRandom } from './guest-traffic-config.js';

const personality = (id, label, speed, idle, speechRate, idleTurnMs, waitingTurnMs = 0) => Object.freeze({
  id, label, weight: 1, speed: Object.freeze(speed), idle: Object.freeze(idle),
  speechRate, idleTurnMs, waitingTurnMs,
});

// Fractions of traffic's authoritative ranges, never new movement or queue rules.
export const GUEST_PERSONALITIES = Object.freeze({
  relaxed: personality('relaxed', 'Relaxed', [0, .35], [.65, 1], .55, 20000),
  excited: personality('excited', 'Excited', [.65, 1], [0, .35], .65, 10000),
  reserved: personality('reserved', 'Reserved', [.35, .65], [.25, .6], .12, 0),
  impatient: personality('impatient', 'Impatient', [.65, .95], [0, .3], .45, 8000, 9000),
  discerning: personality('discerning', 'Discerning', [.2, .5], [.5, .85], .45, 20000),
});

export function guestRandomStreams(seed = Math.floor(Math.random() * 4294967296)) {
  return { traffic: seededGuestRandom(seed), personality: seededGuestRandom(seed ^ 0x9e3779b9),
    dialogue: seededGuestRandom(seed ^ 0x85ebca6b) };
}

export function chooseGuestPersonality(registry, rng) {
  const profiles = Object.values(registry);
  if (!profiles.length || profiles.some(p => !p.id || !Number.isFinite(p.weight) || p.weight < 0)) {
    throw new Error('Invalid guest personality registry');
  }
  const total = profiles.reduce((sum, p) => sum + p.weight, 0), roll = rng();
  if (!total || !Number.isFinite(roll) || roll < 0 || roll > 1) throw new Error('Invalid personality selection');
  let value = roll * total;
  return profiles.find(p => (value -= p.weight) < 0) ?? profiles.filter(p => p.weight > 0).at(-1);
}

export function personalityRangeValue(band, minimum, maximum, roll) {
  if (!Array.isArray(band) || band.length !== 2 || band.some(v => !Number.isFinite(v))
    || !Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum > maximum
    || !Number.isFinite(roll) || roll < 0 || roll > 1) throw new Error('Invalid personality preference');
  const clamp = v => Math.max(0, Math.min(1, v));
  const low = clamp(Math.min(...band)), high = clamp(Math.max(...band));
  return Math.max(minimum, Math.min(maximum, minimum + (maximum - minimum) * (low + roll * (high - low))));
}
