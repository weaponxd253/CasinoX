// World coordinates stay fixed; Phaser scales the canvas to fit the page.
export const ROOM = Object.freeze({
  width: 960,
  height: 600,
  speed: 190,
  playerRadius: 14,
  spawn: { x: 480, y: 480 },
  exit: { x: 480, y: 535, reach: 44 },
  table: { x: 480, y: 240, width: 240, height: 120, reach: 70 },
  walls: [
    { x: 480, y: 16, width: 960, height: 32 },
    { x: 480, y: 584, width: 960, height: 32 },
    { x: 16, y: 300, width: 32, height: 600 },
    { x: 944, y: 300, width: 32, height: 600 },
    { x: 232, y: 390, width: 28, height: 180 },
  ],
});
