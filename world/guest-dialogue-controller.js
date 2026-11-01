import { GUEST_PERSONALITIES } from './guest-personalities.js';
import { dialogueConfig, guestDialogueLines } from './guest-dialogue-config.js';

export function guestDialogueContext(guest, activeMs, arrivalMs = 8000) {
  if (!guest.spawned || guest.complete) return null;
  if (guest.queueState === 'WAITING' && guest.arrived && !guest.moving) return 'waiting';
  if (guest.state === 'IDLING' && guest.arrived && !guest.moving) return 'relaxing';
  if (guest.purpose === 'casino' && guest.position.y < 270) return 'casino';
  if (activeMs - guest.spawnedAtMs <= arrivalMs) return 'entering';
  if (guest.state === 'DEPARTING') return 'departing';
  return null;
}

// Presentation deadlines follow the traffic clock. No movement, saved data,
// per-guest event listeners or wall-clock timers live in this controller.
export class GuestDialogueController {
  constructor({ rng = Math.random, config = {}, enabled = true, personalities = GUEST_PERSONALITIES } = {}) {
    this.rng = rng; this.config = dialogueConfig(config); this.enabled = enabled;
    this.personalities = personalities; this.states = new Map();
    this.activeMs = 0; this.nextGlobalMs = 0; this.suspended = false; this.priority = false;
    this.stats = { spoken: 0, expired: 0, removed: 0 }; this.history = [];
    this.mood = null;
  }
  setSatisfactionMood(mood) {
    if (![null, 'low', 'average', 'high'].includes(mood)) throw Error('Invalid satisfaction presentation mood');
    this.mood = mood;
  }
  random() {
    const v = this.rng();
    if (!Number.isFinite(v) || v < 0 || v > 1) throw new Error('Invalid guest dialogue RNG');
    return v;
  }
  range(stem) { return this.config[`min${stem}Ms`] + this.random() * (this.config[`max${stem}Ms`] - this.config[`min${stem}Ms`]); }
  remember(event) {
    this.history.push(event);
    if (this.history.length > this.config.historyLimit) this.history.splice(0, this.history.length - this.config.historyLimit);
  }
  activeBubbles() { return [...this.states.values()].filter(s => s.bubble).map(s => ({ id: s.id, ...s.bubble })); }
  update(activeMs, guests, { priority = false } = {}) {
    if (this.suspended) return;
    this.activeMs = Math.max(this.activeMs, activeMs); this.priority = priority;
    const active = this.enabled ? guests.filter(g => g.spawned && !g.complete) : [];
    const ids = new Set(active.map(g => g.id));
    for (const [id, state] of this.states) {
      if (!ids.has(id)) {
        if (state.bubble) { this.stats.removed++; this.remember({ type: 'removed', id, atMs: this.activeMs }); }
        this.states.delete(id);
      } else if (state.bubble && this.activeMs >= state.bubble.expiresAtMs) {
        this.stats.expired++; state.bubble = null;
        this.remember({ type: 'expired', id, atMs: this.activeMs });
      }
    }
    const candidates = [];
    for (const g of active) {
      let state = this.states.get(g.id);
      const context = guestDialogueContext(g, this.activeMs, this.config.arrivalContextMs);
      if (!state) {
        state = { id: g.id, context, nextCheckMs: this.activeMs + this.range('Initial'),
          cooldownUntilMs: 0, lastLine: null, bubble: null };
        this.states.set(g.id, state);
      } else if (context !== state.context) {
        state.context = context;
        state.nextCheckMs = Math.min(state.nextCheckMs, this.activeMs + this.range('Context'));
      }
      if (context && !state.bubble && this.activeMs >= state.nextCheckMs && this.activeMs >= state.cooldownUntilMs) candidates.push({ g, state });
    }
    if (!this.enabled || this.priority || this.activeMs < this.nextGlobalMs) return;
    candidates.sort((a, b) => a.state.nextCheckMs - b.state.nextCheckMs || a.g.id.localeCompare(b.g.id));
    let count = this.activeBubbles().length;
    for (const { g, state } of candidates) {
      if (count >= this.config.maxVisible || this.activeMs < this.nextGlobalMs) break;
      state.nextCheckMs = this.activeMs + this.range('Check');
      const profile = this.personalities[g.personality];
      const lines = guestDialogueLines(g.personality, state.context, this.mood);
      const chance = Math.max(0, Math.min(1, (profile?.speechRate ?? 0) * (g.moving ? this.config.walkingChanceMultiplier : 1)));
      if (!lines?.length || chance === 0 || this.random() >= chance) continue;
      const mood = this.mood === 'low' || this.mood === 'high' ? this.mood : null;
      const choices = lines.map((text, i) => ({ text, lineId: `${g.personality}:${state.context}:${mood ? `${mood}:` : ''}${i}` }))
        .filter(line => lines.length === 1 || line.lineId !== state.lastLine);
      const line = choices[Math.min(choices.length - 1, Math.floor(this.random() * choices.length))];
      state.bubble = { ...line, context: state.context, personality: g.personality, mood,
        startedAtMs: this.activeMs, expiresAtMs: this.activeMs + this.range('Duration') };
      state.lastLine = line.lineId; state.cooldownUntilMs = this.activeMs + this.range('Cooldown');
      this.nextGlobalMs = this.activeMs + this.range('GlobalGap'); count++; this.stats.spoken++;
      this.remember({ type: 'spoken', id: g.id, ...state.bubble });
    }
  }
  suspend() { this.suspended = true; }
  resume() { this.suspended = false; }
  destroy() {
    this.stats.removed += this.activeBubbles().length;
    this.states.clear();
  }
  guestSnapshot(id) {
    const state = this.states.get(id);
    return state ? { context: state.context, cooldownMs: Math.max(0, state.cooldownUntilMs - this.activeMs),
      nextCheckMs: Math.max(0, state.nextCheckMs - this.activeMs),
      active: state.bubble ? { ...state.bubble, remainingMs: Math.max(0, state.bubble.expiresAtMs - this.activeMs) } : null } : null;
  }
  snapshot() {
    const bubbles = this.activeBubbles();
    return { enabled: this.enabled, activeMs: this.activeMs, suspended: this.suspended, priority: this.priority, mood: this.mood,
      trackedCount: this.states.size, activeCount: bubbles.length,
      visibleCount: this.suspended || this.priority ? 0 : bubbles.length, settings: { ...this.config },
      globalCooldownMs: Math.max(0, this.nextGlobalMs - this.activeMs), stats: { ...this.stats },
      bubbles: bubbles.map(b => ({ ...b, remainingMs: Math.max(0, b.expiresAtMs - this.activeMs) })),
      history: this.history.map(e => ({ ...e })) };
  }
}
