export const HOTEL = {
  width: 960, height: 600, speed: 190, playerRadius: 14,
  spawn: { x: 480, y: 455, facing: 'up' },
  exit: { x: 480, y: 525 },
  directory: { x: 480, y: 180, width: 180, height: 60 },
  solids: [
    // The original interior bounds are independent of lobby artwork.
    { x: 480, y: 16, width: 960, height: 32 },
    { x: 480, y: 584, width: 960, height: 32 },
    { x: 16, y: 300, width: 32, height: 600 },
    { x: 944, y: 300, width: 32, height: 600 },
    { x: 260, y: 280, width: 200, height: 90 },
    { x: 700, y: 280, width: 200, height: 90 },
    { x: 480, y: 180, width: 180, height: 60 },
  ],
};
