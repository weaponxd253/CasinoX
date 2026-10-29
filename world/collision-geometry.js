export function distanceFromRect(position, rect) {
  return Math.hypot(Math.max(Math.abs(position.x - rect.x) - rect.width / 2, 0),
    Math.max(Math.abs(position.y - rect.y) - rect.height / 2, 0));
}

export function clearOf(position, solids, radius) {
  return solids.every(shape => shape.radius !== undefined
    ? Math.hypot(position.x - shape.x, position.y - shape.y) >= shape.radius + radius - 0.01
    : distanceFromRect(position, shape) >= radius - 0.01);
}

// Rasterize a convex footprint into narrow, conservative Arcade rectangles.
// The same rectangles drive physics, validation, navigation and the debug overlay.
export function polygonStrips(points, step = 4) {
  const result = [];
  const low = Math.min(...points.map(p => p[1]));
  const high = Math.max(...points.map(p => p[1]));
  for (let y = low; y < high; y += step) {
    const bottom = Math.min(high, y + step);
    const xs = [];
    for (const scan of [y + 0.001, bottom - 0.001]) {
      points.forEach((a, i) => {
        const b = points[(i + 1) % points.length];
        if (a[1] !== b[1] && scan >= Math.min(a[1], b[1]) && scan <= Math.max(a[1], b[1])) {
          xs.push(a[0] + (scan - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
        }
      });
    }
    if (xs.length) result.push({ x: (Math.min(...xs) + Math.max(...xs)) / 2,
      y: (y + bottom) / 2, width: Math.max(...xs) - Math.min(...xs), height: bottom - y });
  }
  return result;
}
