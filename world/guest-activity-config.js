const profile = (minArrivalMs, maxArrivalMs, ceilings, weights) => Object.freeze({ minArrivalMs, maxArrivalMs,
  ceilings: Object.freeze(ceilings), weights: Object.freeze(weights) });
export const GUEST_ACTIVITY_PROFILES = Object.freeze({
  low: profile(30000, 50000, [3, 4], { checkIn: 20, casino: 50, relaxing: 20, hotelDeparture: 10 }),
  moderate: profile(20000, 35000, [5, 7], { checkIn: 40, casino: 30, relaxing: 15, hotelDeparture: 15 }),
  high: profile(12000, 22000, [6, 8], { checkIn: 35, casino: 25, relaxing: 15, hotelDeparture: 25 }),
  full: profile(12000, 22000, [6, 8], { checkIn: 20, casino: 30, relaxing: 15, hotelDeparture: 35 }),
  fallback: profile(15000, 30000, [6, 8], { checkIn: 40, casino: 30, relaxing: 15, hotelDeparture: 15 }),
});
export const GUEST_ACTIVITY_REFRESH = Object.freeze({ coalesceMs: 1000, pollMs: 10000 });
export const RECEPTION_SERVICE_MS = Object.freeze({ covered: 6000, thin: 8000, short: 12000 });

// Three percentage points around each transition after initial classification.
export function activityBand(value, previous, low, high, labels) {
  if (!previous) return value < low ? labels[0] : value < high ? labels[1] : labels[2];
  if (previous === labels[0]) return value >= high + 3 ? labels[2] : value >= low + 3 ? labels[1] : labels[0];
  if (previous === labels[2]) return value < low - 3 ? labels[0] : value < high - 3 ? labels[1] : labels[2];
  return value < low - 3 ? labels[0] : value >= high + 3 ? labels[2] : labels[1];
}
