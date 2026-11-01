import { toWorld, MAIN_ART, walkable, clearSegment } from './main-casino-layout.js';

const definitions = [
  { id: 'roulette', gameId: 'roulette', label: 'Play Roulette Royale', bounds: [280, 570, 328, 598], stand: [304, 584] },
  ...[1100, 1174, 1248, 1322, 1396].map((x, i) => ({ id: `slot-${i + 1}`, gameId: 'slots',
    label: `Play Lucky Reels · Machine ${i + 1}`, bounds: [x - 16, 500, x + 16, 524], stand: [x, 512] })),
  { id: 'coin-flip', gameId: 'coinflip', label: 'Play Coin Flip', bounds: [1056, 628, 1080, 660], stand: [1068, 644] },
];

// Standing regions are on the floor, independent of the unchanged furniture bodies.
export const CASINO_ATTRACTIONS = Object.freeze(definitions.map(d => {
  const [l, t, r, b] = d.bounds;
  const approach = Object.freeze(toWorld(...d.stand));
  return Object.freeze({ id: d.id, gameId: d.gameId, label: d.label, approach,
    position: Object.freeze({ ...toWorld((l + r) / 2, (t + b) / 2),
      width: (r - l) * MAIN_ART.scale, height: (b - t) * MAIN_ART.scale }),
    radius: 8, reachable: p => walkable(p) && clearSegment(p, approach) });
}));

export const ATTRACTION_INTERACTIONS = CASINO_ATTRACTIONS.map(a => ({ ...a,
  scene: 'MainCasinoFloor', availability: true,
  action: { type: 'casino-game', gameId: a.gameId, attractionId: a.id },
}));
