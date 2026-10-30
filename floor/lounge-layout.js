import { clearOf, polygonStrips } from '../world/collision-geometry.js';

export const LOUNGE_ART = Object.freeze({ key: 'luxury-blackjack-lounge', sourceWidth: 1536, sourceHeight: 1024,
  x: 30, y: 0, width: 900, height: 600, scale: 600 / 1024 });
export const toWorld = (x, y) => ({ x: 30 + x * LOUNGE_ART.scale, y: y * LOUNGE_ART.scale });
const rect = (id, left, top, right, bottom) => ({ id, ...toWorld((left + right) / 2, (top + bottom) / 2),
  width: (right - left) * LOUNGE_ART.scale, height: (bottom - top) * LOUNGE_ART.scale });
const circle = (id, x, y, radius) => ({ id, ...toWorld(x, y), radius: radius * LOUNGE_ART.scale });
const polygon = (id, points) => polygonStrips(points).map((shape, i) => ({ id: `${id}:${i}`,
  ...toWorld(shape.x, shape.y), width: shape.width * LOUNGE_ART.scale, height: shape.height * LOUNGE_ART.scale }));

// Source-image floor footprints. Carpet, gold floor borders and the south
// threshold are walkable; fronds, lamps and tall chair backs are not walls.
export const LOUNGE_WALLS = [
  { id: 'left-margin', x: 15, y: 300, width: 30, height: 600 },
  { id: 'right-margin', x: 945, y: 300, width: 30, height: 600 },
  rect('north-wall', 0, 0, 1536, 245),
  rect('west-wall', 0, 245, 55, 650), rect('east-wall', 1481, 245, 1536, 650),
  rect('west-planter-bed', 0, 670, 216, 907), rect('east-planter-bed', 1320, 670, 1536, 907),
  rect('west-south-pillar', 414, 845, 474, 980), rect('east-south-pillar', 1062, 845, 1122, 980),
  rect('west-lamp-pillar', 22, 430, 78, 550), rect('east-lamp-pillar', 1458, 430, 1514, 550),
];
const stoolCenters = [[450, 475], [520, 548], [633, 594], [768, 611], [903, 594], [1016, 548], [1086, 475]];
export const LOUNGE_SOLIDS = [
  ...LOUNGE_WALLS,
  ...polygon('table', [[466, 348], [1070, 348], [1090, 395], [1050, 455], [968, 512], [874, 547],
    [768, 562], [662, 547], [568, 512], [486, 455], [446, 395]]),
  ...stoolCenters.map(([x, y], i) => circle(`stool-${i}`, x, y, 30)),
  ...[[103, 244], [267, 244], [1268, 244], [1433, 244]].map(([x, y], i) => circle(`corner-seat-${i}`, x, y, 30)),
  circle('west-round-table', 185, 236, 33), circle('east-round-table', 1351, 236, 33),
  ...[[375, 222, 32], [1158, 222, 32], [444, 831, 32], [1090, 831, 32],
    [52, 759, 39], [1484, 759, 39], [25, 1010, 35], [1511, 1010, 35]]
    .map(([x, y, radius], i) => circle(`palm-pot-${i}`, x, y, radius)),
];

// Logical approach strip, independent of the curved physical table and stools.
export const LOUNGE_TABLE = { ...toWorld(768, 622.5), width: 336 * LOUNGE_ART.scale,
  height: 25 * LOUNGE_ART.scale, reach: 44 };
export function walkable(position, radius = 14) {
  return Number.isFinite(position?.x) && Number.isFinite(position?.y)
    && position.x >= radius && position.x <= 960 - radius && position.y >= radius && position.y <= 600 - radius
    && clearOf(position, LOUNGE_SOLIDS, radius);
}

// Identical source pixels are masked over the owner only behind these objects.
// Avoid rectangular masks across empty carpet between the seats.
export const LOUNGE_FOREGROUNDS = [
  { id: 'table', baseline: 562, points: [[470, 304], [1069, 304], [1089, 323], [1085, 379], [1056, 430],
    [1000, 478], [928, 515], [846, 538], [768, 547], [680, 539], [600, 515], [529, 478],
    [478, 431], [452, 379], [447, 335], [451, 319]] },
  ...[[535, 255], [1000, 255]].map(([x, y], i) => ({ id: `table-lamp-${i}`, baseline: 562,
    points: [[x - 19, y + 12], [x - 11, y], [x + 11, y], [x + 19, y + 12], [x + 17, y + 36],
      [x + 6, y + 42], [x + 8, y + 87], [x - 8, y + 87], [x - 6, y + 42], [x - 17, y + 36]] })),
  ...stoolCenters.map(([x, y], i) => ({ id: `stool-${i}`, baseline: y + 30,
    points: [[x - 43, y - 72], [x - 18, y - 81], [x + 33, y - 68], [x + 43, y - 46],
      [x + 28, y - 7], [x + 15, y + 20], [x - 20, y + 20], [x - 34, y - 7], [x - 45, y - 44]] })),
  ...[[444, 679, 863], [1090, 679, 863]].map(([x, top, baseline], i) => ({ id: `south-palm-${i}`, baseline,
    points: [[x - 58, top + 65], [x - 43, top + 28], [x - 14, top + 39], [x - 9, top], [x + 15, top + 8],
      [x + 19, top + 38], [x + 52, top + 29], [x + 60, top + 66], [x + 37, top + 90],
      [x + 32, baseline - 13], [x + 15, baseline], [x - 22, baseline], [x - 33, baseline - 20], [x - 37, top + 98]] })),
  ...[[414, 474], [1062, 1122]].map(([left, right], i) => ({ id: `south-pillar-${i}`, baseline: 980,
    points: [[left, 850], [right, 850], [right, 980], [left, 980]] })),
];
