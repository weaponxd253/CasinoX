import { polygonStrips } from './collision-geometry.js';

export const LOBBY_ART = Object.freeze({ key: 'luxury-central-lobby', sourceWidth: 1536, sourceHeight: 1024,
  x: 30, y: 0, width: 900, height: 600, scale: 600 / 1024, layout: 'luxury-lobby-1' });
export const toWorld = (x, y) => ({ x: 30 + x * LOBBY_ART.scale, y: y * LOBBY_ART.scale });
const rect = (id, left, top, right, bottom) => ({ id, ...toWorld((left + right) / 2, (top + bottom) / 2),
  width: (right - left) * LOBBY_ART.scale, height: (bottom - top) * LOBBY_ART.scale });
const circle = (id, x, y, radius) => ({ id, ...toWorld(x, y), radius: radius * LOBBY_ART.scale });
const polygon = (id, points) => polygonStrips(points).map((shape, i) => ({
  id: `${id}:${i}`, ...toWorld(shape.x, shape.y), width: shape.width * LOBBY_ART.scale, height: shape.height * LOBBY_ART.scale,
}));

// Source-image pixels. Rugs, stair treads and canopy overhangs are not solids.
export const LOBBY_SOLIDS = [
  { id: 'left-margin', x: 15, y: 300, width: 30, height: 600 },
  { id: 'right-margin', x: 945, y: 300, width: 30, height: 600 },
  rect('reception-back', 0, 0, 560, 260),
  ...polygon('reception-counter', [[0, 260], [500, 260], [500, 294], [456, 336], [153, 336], [104, 302], [0, 302]]),
  rect('casino-left-arch', 560, 0, 706, 270),
  rect('casino-right-arch', 846, 0, 1088, 270),
  rect('casino-threshold', 706, 0, 846, 174),
  rect('office-building', 1088, 0, 1536, 350),
  rect('office-door-wall', 1088, 350, 1250, 382),
  rect('hotel-north-wall', 1250, 350, 1536, 410),
  rect('hotel-door', 1343, 410, 1472, 500),
  rect('hotel-left-column', 1244, 500, 1276, 540),
  rect('hotel-right-column', 1480, 410, 1536, 540),
  rect('left-wall', 0, 302, 53, 766),
  rect('right-wall', 1505, 540, 1536, 1024),
  rect('left-front-wing', 0, 766, 94, 1024),
  rect('left-front-wall', 94, 866, 278, 1024),
  rect('left-stair-side', 278, 948, 354, 1024),
  rect('left-stair-end', 354, 1004, 474, 1024),
  rect('left-entry-planter', 500, 882, 625, 1024),
  rect('right-entry-planter', 911, 882, 1040, 1024),
  rect('right-front-wall', 1280, 880, 1536, 1024),
  rect('right-stair-side', 1210, 948, 1280, 1024),
  rect('right-stair-end', 1040, 1004, 1210, 1024),
  rect('left-pillar-base', 48, 625, 102, 710),
  rect('right-pillar-base', 1230, 748, 1298, 805),
  ...polygon('fountain', [[709, 508], [827, 508], [869, 548], [869, 620], [827, 669], [709, 669], [667, 620], [667, 548]]),
  rect('west-sofa-north', 144, 444, 274, 490),
  rect('west-sofa-east', 326, 504, 370, 612),
  rect('west-sofa-south', 151, 675, 285, 720),
  rect('west-chair-south', 326, 686, 370, 764),
  circle('west-coffee-table', 202, 547, 33),
  rect('west-cabinet', 53, 524, 104, 625),
  rect('west-lamp-north', 99, 444, 140, 490),
  rect('west-lamp-east', 326, 621, 370, 660),
  rect('east-chair-north', 1073, 509, 1157, 545),
  rect('east-chair-middle', 1073, 665, 1159, 704),
  rect('east-chair-south', 1073, 725, 1158, 756),
  circle('east-table-north', 1111, 591, 29),
  circle('east-table-south', 1113, 793, 29),
  rect('east-lamp-left', 1040, 513, 1070, 552),
  circle('east-lamp-right', 1175, 543, 10),
  rect('east-lamp-south', 1040, 825, 1070, 864),
  ...[[618, 450], [915, 450], [619, 676], [916, 676], [75, 373], [87, 475],
    [343, 472], [407, 705], [1063, 327], [1113, 377], [1228, 378], [1307, 520], [1516, 520],
    [1515, 775], [1128, 149], [1428, 146]].map(([x, y], i) => circle(`planter-${i}`, x, y, 17)),
];

export const LOBBY_INTERACTIONS = {
  receptionist: { ...toWorld(300, 326), width: 260 * LOBBY_ART.scale, height: 12 * LOBBY_ART.scale, reach: 34 },
  casino: { ...toWorld(768, 270), width: 130 * LOBBY_ART.scale, height: 50 * LOBBY_ART.scale, reach: 30 },
  office: { ...toWorld(1172, 340), width: 52 * LOBBY_ART.scale, height: 84 * LOBBY_ART.scale, reach: 30 },
  hotel: { ...toWorld(1410, 462), width: 115 * LOBBY_ART.scale, height: 76 * LOBBY_ART.scale, reach: 30 },
};

// Masks reveal identical source pixels above an owner whose feet are behind a
// tall object. They add depth without repainting or resampling the source PNG.
export const LOBBY_FOREGROUNDS = [
  { id: 'fountain-crown', baseline: 669, points: [[720, 440], [775, 431], [813, 459], [827, 500], [806, 551], [732, 551], [708, 510], [708, 473]] },
  ...[[618, 362, 450], [915, 362, 450], [619, 592, 676], [916, 592, 676]].map(([x, top, baseline], i) => ({
    id: `palm-${i}`, baseline,
    points: [[x - 48, top + 32], [x - 25, top + 8], [x + 5, top], [x + 37, top + 13], [x + 48, top + 45],
      [x + 31, top + 70], [x + 13, baseline], [x - 12, baseline], [x - 25, top + 70], [x - 48, top + 52]],
  })),
  { id: 'east-column', baseline: 805, points: [[1230, 613], [1299, 613], [1299, 805], [1230, 805]] },
  { id: 'hotel-column', baseline: 540, points: [[1230, 380], [1278, 380], [1278, 540], [1230, 540]] },
];
