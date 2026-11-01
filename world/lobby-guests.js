import { GuestTrafficController } from './guest-traffic-controller.js';
import { DEBUG_TRAFFIC_PROFILES, GUEST_TRAFFIC_CONFIG, LOBBY_GUESTS } from './guest-traffic-config.js';
import { guestRandomStreams } from './guest-personalities.js';
import { GuestDialogueController } from './guest-dialogue-controller.js';
import { GuestDialogueBubbles } from './guest-dialogue-bubbles.js';
import { createGuestVisual } from './guest-appearances.js';
import { RECEPTION_QUEUE } from './reception-queue-manager.js';
import { HotelStateAdapter } from './hotel-state-adapter.js';
import { GuestActivityDirector } from './guest-activity-director.js';
import { GUEST_ACTIVITY_REFRESH } from './guest-activity-config.js';
export { TRAVELER_JOURNEY, LOBBY_GUESTS } from './guest-traffic-config.js';

// Explicit legacy fixture adapter. Both modes use the same coordinator, mover
// and reception manager; the normal page always selects dynamic arrivals.
export class LobbyGuestTraffic extends GuestTrafficController {
  constructor({ guests = LOBBY_GUESTS, queue = RECEPTION_QUEUE } = {}) {
    super({ schedule: guests, queue });
  }
}

export class LobbyGuests {
  constructor(scene) {
    this.scene = scene;
    const params = new URLSearchParams(location.search), debug = params.has('debug');
    this.profile = debug ? params.get('trafficProfile') : null;
    const seed = debug && params.has('trafficSeed') ? Number(params.get('trafficSeed')) : null;
    this.random = guestRandomStreams(seed !== null && Number.isFinite(seed) ? seed : undefined);
    const legacy = debug && params.get('trafficScenario') === 'phase5b';
    this.activityFixture = debug && params.get('activityFixture') === 'unavailable' ? 'unavailable' : null;
    this.trafficOverrides = DEBUG_TRAFFIC_PROFILES[this.profile] ?? {};
    if (!legacy) {
      this.hotelAdapter = new HotelStateAdapter(this.activityFixture ? { readRaw: () => null } : {});
      this.activityDirector = new GuestActivityDirector({ maxVisible: this.trafficOverrides.maxVisible ?? GUEST_TRAFFIC_CONFIG.maxVisible });
      this.managementSnapshot = this.hotelAdapter.read();
      this.activityPolicy = this.activityDirector.derive(this.managementSnapshot);
    }
    const policy = this.activityPolicy?.traffic;
    this.traffic = legacy ? new LobbyGuestTraffic()
      : new GuestTrafficController({ config: { minArrivalMs: policy.minArrivalMs, maxArrivalMs: policy.maxArrivalMs,
        weights: policy.weights, ...this.trafficOverrides },
        rng: this.random.traffic, personalityRng: this.random.personality });
    this.guests = this.traffic.guests;
    this.dialogue = new GuestDialogueController({ rng: this.random.dialogue, enabled: !this.traffic.legacy });
    this.lastActivityReadMs = 0; this.nextActivityPollMs = GUEST_ACTIVITY_REFRESH.pollMs;
    this.activityDirty = false; this.refreshOnResume = false;
    this.applyActivityPolicy();
    this.bubbles = new GuestDialogueBubbles(scene);
    this.label = scene.add.text(40, 8, '', { fontFamily: 'monospace', fontSize: '10px', color: '#a8ffe3',
      backgroundColor: '#10211f' }).setDepth(101).setVisible(false);
    this.slotLabels = this.traffic.queue.slots.map((s, i) => scene.add.text(s.position.x, s.position.y + 17,
      i ? `Q${i}` : 'SERVICE', { fontFamily: 'monospace', fontSize: '10px', color: '#ffe2a0', backgroundColor: '#10211f' })
      .setOrigin(0.5, 0).setDepth(101).setVisible(false));
    this.step = seconds => {
      if (seconds <= 0) return;
      this.refreshActivity(this.refreshOnResume);
      const body = scene.player.body;
      const previous = { x: body.prev.x + body.halfWidth, y: body.prev.y + body.halfHeight };
      const guarded = this.traffic.update(seconds * 1000, { x: body.center.x, y: body.center.y,
        vx: (body.center.x - previous.x) / seconds, vy: (body.center.y - previous.y) / seconds,
        radius: scene.config.playerRadius, previous });
      if (guarded.held) {
        body.position.x += guarded.position.x - body.center.x;
        body.position.y += guarded.position.y - body.center.y;
        body.updateCenter();
      }
      this.dialogue.update(this.traffic.activeMs, this.dialogueGuests(), {
        priority: Boolean(scene.getInteraction?.() || scene.host.isBlocked?.()),
      });
      this.sync();
    };
    this.suspend = () => { this.traffic.suspend(); this.dialogue.suspend(); this.sync(); };
    this.resume = () => { this.refreshOnResume = true; this.traffic.resume(); this.dialogue.resume(); };
    // Phaser pauses the whole game on browser blur independently of scene
    // sleep/pause. Mark one fresh read on return before the next physics step.
    this.gameSleep = () => { this.activityWasHidden = true; };
    this.gameWake = () => { if (this.activityWasHidden) { this.refreshOnResume = true; this.activityWasHidden = false; } };
    for (const event of ['blur', 'hidden', 'pause']) scene.game.events.on(event, this.gameSleep);
    for (const event of ['focus', 'visible', 'resume']) scene.game.events.on(event, this.gameWake);
    scene.physics.world.on('worldstep', this.step);
    for (const event of ['sleep', 'pause']) scene.events.on(event, this.suspend);
    for (const event of ['wake', 'resume']) scene.events.on(event, this.resume);
    scene.events.once('shutdown', () => {
      scene.physics.world.off('worldstep', this.step);
      for (const event of ['sleep', 'pause']) scene.events.off(event, this.suspend);
      for (const event of ['wake', 'resume']) scene.events.off(event, this.resume);
      for (const event of ['blur', 'hidden', 'pause']) scene.game.events.off(event, this.gameSleep);
      for (const event of ['focus', 'visible', 'resume']) scene.game.events.off(event, this.gameWake);
      this.dialogue.destroy(); this.bubbles.destroy(); this.traffic.destroy();
      this.label.destroy(); this.slotLabels.forEach(label => label.destroy());
    });
    this.sync();
  }
  applyActivityPolicy() {
    if (!this.activityPolicy) return;
    const traffic = { ...this.activityPolicy.traffic };
    for (const key of ['minArrivalMs', 'maxArrivalMs']) if (this.trafficOverrides[key] !== undefined) traffic[key] = this.trafficOverrides[key];
    this.traffic.applyActivitySettings(traffic);
    this.traffic.queue.setPresentationServiceMs(this.activityPolicy.serviceMs);
    this.dialogue.setSatisfactionMood(this.activityPolicy.dialogueMood);
  }
  requestActivityRefresh() { this.activityDirty = true; }
  refreshActivity(force = false) {
    if (!this.hotelAdapter) return;
    const now = this.traffic.activeMs;
    if (!force && now < this.nextActivityPollMs
      && (!this.activityDirty || now - this.lastActivityReadMs < GUEST_ACTIVITY_REFRESH.coalesceMs)) return;
    this.managementSnapshot = this.hotelAdapter.read();
    this.activityPolicy = this.activityDirector.derive(this.managementSnapshot);
    this.applyActivityPolicy();
    this.lastActivityReadMs = now; this.nextActivityPollMs = now + GUEST_ACTIVITY_REFRESH.pollMs;
    this.activityDirty = false; this.refreshOnResume = false;
  }
  get controller() { return this.guests[0]?.controller ?? null; }
  get visual() { return this.guests[0]?.visual ?? null; }
  dialogueGuests() {
    return this.traffic.activeGuests().map(g => ({ id: g.id, personality: g.personality,
      spawned: g.controller.spawned, complete: g.controller.complete, position: g.controller.position,
      radius: g.controller.radius, moving: g.controller.moving, arrived: g.controller.arrived,
      spawnedAtMs: g.spawnedAtMs, purpose: g.purpose,
      queueState: this.traffic.queue.entries.get(g.id)?.state ?? null,
      state: this.traffic.queue.entries.get(g.id)?.state === 'DEPARTING' ? 'DEPARTING' : g.state }));
  }
  sync() {
    for (const g of this.guests) {
      const c = g.controller;
      if (c.complete) { g.visual?.destroy(); g.visual = null; continue; }
      if (!g.visual) g.visual = createGuestVisual(this.scene, g.appearance, g.id);
      g.visual.setVisible(c.spawned);
      g.visual.sync({ x: c.position.x, y: c.position.y + c.radius },
        !c.moving && g.presentationFacing ? g.presentationFacing : c.facing, c.moving);
    }
    this.bubbles.sync(this.dialogue, this.dialogueGuests());
  }
  drawDebug(graphics, visible) {
    this.label.setVisible(visible);
    this.slotLabels.forEach(label => label.setVisible(visible));
    if (!visible) return;
    const t = this.traffic, s = t.snapshot(), d = this.dialogue.snapshot();
    this.label.setText([`Traffic ${s.activeCount}/${s.populationCap} (hard ${s.hardCap}) | moving ${s.movingCount}/${s.maxMoving} | waiting ${s.waitingCount}`
      + ` | next ${((s.nextArrivalMs ?? 0) / 1000).toFixed(1)}s | done ${s.stats.completed} | despawned ${s.stats.despawned}`,
      `${s.mode}${this.profile ? ` / DEBUG ${this.profile}` : ''} | pending ${s.pending?.reason ?? '-'} | recoveries ${s.stats.recoveries} | queue ${s.queue.order.join(' > ') || 'empty'}`,
      `Looks ${s.registeredAppearanceCount} | personalities ${s.registeredPersonalityCount} | speech ${d.visibleCount}/${d.settings.maxVisible}`
        + ` | ${d.bubbles.map(b => `${b.id}: ${b.text}`).join(' / ') || 'quiet'}`,
      ...(this.activityPolicy ? [
        `${this.activityFixture ? 'DEBUG unavailable fixture' : 'Hotel save'} | utilization ${this.managementSnapshot.occupancy.percentage ?? '?'}% | ${this.activityPolicy.profile}${this.activityPolicy.nearFull ? ' / near full' : ''} | admit ${s.admissionCeiling} | draining ${s.drainingCount}`,
        `Reception ${this.managementSnapshot.reception.coverageStatus ?? '?'} | next service ${this.activityPolicy.serviceMs / 1000}s | satisfaction ${this.managementSnapshot.satisfaction.score ?? '?'} / ${this.activityPolicy.dialogueMood ?? 'fallback'} | reads/parses ${this.hotelAdapter.stats.reads}/${this.hotelAdapter.stats.parses}`,
      ] : []),
      ...s.guests.map(g => `${g.id} [${g.appearance} / ${g.personality ?? 'fixture'}] ${g.behavior} / ${g.purpose} | ${g.reservedSlot ?? g.idleSlot ?? '-'} | target ${g.destination.x},${g.destination.y}`
        + ` | service ${(g.serviceRemainingMs / 1000).toFixed(1)}s | idle ${((g.idleRemainingMs ?? 0) / 1000).toFixed(1)}s | blocked ${(g.blockedMs / 1000).toFixed(1)}s`)]);
    graphics.lineStyle(2, 0xffd36d);
    for (const slot of t.queue.slots) graphics.strokeCircle(slot.position.x, slot.position.y, 14);
    graphics.lineStyle(1, 0x70d2ff);
    for (const slot of t.idleSlots) graphics.strokeCircle(slot.position.x, slot.position.y, 14);
    this.guests.forEach(g => {
      const c = g.controller;
      graphics.lineStyle(2, [0x6dffd0, 0xffd36d, 0x7ebcff, 0xf29acb, 0xe1b4ff, 0xffa674][g.sequence % 6]);
      graphics.strokeCircle(c.stop.position.x, c.stop.position.y, 5);
      if (c.spawned && !c.complete) {
        graphics.strokeCircle(c.position.x, c.position.y, c.radius);
        graphics.strokePoints([c.position, ...c.route], false);
      }
    });
  }
  visualSnapshot(g) {
    return g.visual ? { ...g.visual.snapshot(), texture: g.visual.config.key,
      name: g.visual.sprite?.name ?? g.visual.fallback.name,
      animation: g.visual.sprite?.anims.currentAnim?.key ?? null,
      visible: g.visual.sprite?.visible ?? g.visual.fallback.visible } : null;
  }
  snapshot() { const g = this.guests[0]; return g ? { ...this.traffic.guestSnapshot(g), visual: this.visualSnapshot(g),
    dialogue: this.dialogue.guestSnapshot(g.id) } : null; }
  snapshotAll() { return { ...this.traffic.snapshot(), profile: this.profile,
    activity: this.activityPolicy ? { fixture: this.activityFixture, snapshot: this.managementSnapshot,
      policy: { ...this.activityPolicy, traffic: { ...this.activityPolicy.traffic, weights: { ...this.activityPolicy.traffic.weights } } },
      cache: this.hotelAdapter.snapshot(), dirty: this.activityDirty,
      nextPollInMs: Math.max(0, this.nextActivityPollMs - this.traffic.activeMs) } : null,
    dialogue: this.dialogue.snapshot(), dialogueUI: this.bubbles.snapshot(),
    resources: { visualCount: this.guests.filter(g => g.visual).length,
      dialogueModels: this.dialogue.states.size, dialogueObjects: this.bubbles.items.size * 2,
      displayObjects: this.scene.children.list.length,
      worldStepListeners: this.scene.physics.world.listenerCount('worldstep'),
      // Count this integration's hooks independently of Phaser's scene input hooks.
      gameListeners: Object.fromEntries(['blur', 'hidden', 'pause', 'focus', 'visible', 'resume'].map(e => [e,
        this.scene.game.events.listeners(e).filter(fn => fn === this.gameSleep || fn === this.gameWake).length])),
      sceneListeners: Object.fromEntries(['sleep', 'wake', 'pause', 'resume'].map(e => [e, this.scene.events.listenerCount(e)])) },
    guests: this.guests.map(g => ({ ...this.traffic.guestSnapshot(g), visual: this.visualSnapshot(g),
      dialogue: this.dialogue.guestSnapshot(g.id) })) }; }
}
