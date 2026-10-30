export function distanceFromRect(position, rect) {
  return Math.hypot(Math.max(Math.abs(position.x - rect.x) - rect.width / 2, 0),
    Math.max(Math.abs(position.y - rect.y) - rect.height / 2, 0));
}

export function clearOf(position, solids, radius) {
  return solids.every(shape => shape.radius !== undefined
    ? Math.hypot(position.x - shape.x, position.y - shape.y) >= shape.radius + radius - 0.01
    : distanceFromRect(position, shape) >= radius - 0.01);
}

// Arcade's circle/rectangle corner separation uses the rectangle's centre as
// its normal. At oblique contacts that can leave a small residual overlap.
// Finish separation against the actual closest footprint point, without
// changing the owner's radius, speed, input, or the collision geometry.
export function resolveFootprintContacts(position, solids, radius) {
  const result = { x: position.x, y: position.y };
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (const shape of solids) {
      const circular = shape.radius !== undefined;
      const x = circular ? shape.x : Math.max(shape.x - shape.width / 2, Math.min(result.x, shape.x + shape.width / 2));
      const y = circular ? shape.y : Math.max(shape.y - shape.height / 2, Math.min(result.y, shape.y + shape.height / 2));
      const dx = result.x - x, dy = result.y - y;
      const distance = Math.hypot(dx, dy), minimum = radius + (shape.radius ?? 0);
      if (distance >= minimum - 0.01) continue;
      if (!distance) continue; // Deep invalid positions are rejected by save validation.
      const correction = (minimum + 0.001 - distance) / distance;
      result.x += dx * correction; result.y += dy * correction;
      changed = true;
    }
    if (!changed) break;
  }
  return result;
}

// Adjacent obstacles can have opposing separation normals, so projection alone
// is not proof of clearance. Keep normal resolved contacts when all footprints
// are clear; otherwise clip this step from its preceding clear position. A
// narrow gap stops movement rather than pushing into neighbouring solids.
export function constrainFootprintMovement(previous, position, solids, radius) {
  const finite = p => Number.isFinite(p?.x) && Number.isFinite(p?.y);
  if (!finite(previous) || !finite(position) || !clearOf(previous, solids, radius)) {
    throw new Error('Cannot resolve lobby movement from an invalid position.');
  }
  const corrected = resolveFootprintContacts(position, solids, radius);
  if (clearOf(corrected, solids, radius)) return corrected;
  const dx = corrected.x - previous.x, dy = corrected.y - previous.y;
  const distance = Math.hypot(dx, dy), steps = Math.ceil(distance);
  const at = t => ({ x: previous.x + dx * t, y: previous.y + dy * t });
  for (let i = 1; i <= steps; i++) {
    if (clearOf(i === steps ? corrected : at(i / steps), solids, radius)) continue;
    let low = (i - 1) / steps, high = i / steps;
    for (let n = 0; n < 16; n++) {
      const middle = (low + high) / 2;
      if (clearOf(at(middle), solids, radius)) low = middle;
      else high = middle;
    }
    // Stay just inside the clear side despite body/game-object float rounding.
    return at(Math.max(0, low - 0.0001 / distance));
  }
  return corrected;
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
