import { GUEST_ACTIVITY_PROFILES, RECEPTION_SERVICE_MS, activityBand } from './guest-activity-config.js';

// Numeric presentation policy only. Owns no guests, movement, storage or timers.
export class GuestActivityDirector {
  constructor({ maxVisible = 6 } = {}) {
    if (!Number.isInteger(maxVisible) || maxVisible < 1 || maxVisible > 8) throw Error('Activity population cap must be 1–8');
    this.maxVisible = maxVisible; this.occupancyBand = null; this.nearFull = false; this.mood = null;
  }
  derive(snapshot) {
    if (snapshot.occupancy.available) {
      const percentage = snapshot.occupancy.percentage;
      this.occupancyBand = activityBand(percentage, this.occupancyBand, 30, 70, ['low', 'moderate', 'high']);
      this.nearFull = this.occupancyBand === 'high' && (this.nearFull ? percentage >= 90 : percentage >= 95);
    } else { this.occupancyBand = null; this.nearFull = false; }
    const name = this.nearFull ? 'full' : this.occupancyBand ?? 'fallback', profile = GUEST_ACTIVITY_PROFILES[name];
    const admissionCeiling = name === 'fallback' ? this.maxVisible
      : Math.min(this.maxVisible, profile.ceilings[this.maxVisible > 6 ? 1 : 0]);
    this.mood = snapshot.satisfaction.available
      ? activityBand(snapshot.satisfaction.score, this.mood, 40, 80, ['low', 'average', 'high']) : null;
    return { profile: this.occupancyBand ?? 'fallback', nearFull: this.nearFull,
      dialogueMood: this.mood,
      serviceMs: snapshot.reception.available ? RECEPTION_SERVICE_MS[snapshot.reception.coverageStatus] ?? 8000 : 8000,
      traffic: { minArrivalMs: profile.minArrivalMs, maxArrivalMs: profile.maxArrivalMs, admissionCeiling, weights: { ...profile.weights } } };
  }
}
