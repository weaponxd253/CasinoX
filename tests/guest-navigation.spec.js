const { test, expect } = require('@playwright/test');

test('temporary owner blockers leave the cached lobby navigation and migration results unchanged', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { lobbyPath, clearSegment, reachable, nearestReachable } = await import('/world/lobby-navigation.js');
    const from = { x: 340, y: 240 }, to = { x: 252, y: 220 }, blocked = { x: 296, y: 228, radius: 20 };
    const before = lobbyPath(from, to), nearest = nearestReachable({ x: 480, y: 350, facing: 'left' });
    const route = lobbyPath(from, to, { blockers: [blocked], smooth: true });
    let p = from, valid = true;
    for (const next of route) { valid &&= clearSegment(p, next, 14, [blocked]); p = next; }
    try { lobbyPath(from, to, { blockers: [{ ...to, radius: 30 }] }); } catch (_) {}
    return { before, after: lobbyPath(from, to), nearest, nearestAfter: nearestReachable({ x: 480, y: 350, facing: 'left' }),
      valid, reachable: reachable(to), final: p };
  });
  expect(result.valid).toBe(true); expect(result.reachable).toBe(true);
  expect(result.after).toEqual(result.before); expect(result.nearestAfter).toEqual(result.nearest);
  expect(result.final).toEqual({ x: 252, y: 220 });
});

test('the configured journey stays on walkable floor at 85px/s, waits eight active seconds and completes once', async ({ page }) => {
  const result = await simulate(page, async ({ create, walkable }) => {
    const c = create(), directions = new Set(), failures = [];
    let maxSpeed = 0, waitFrames = 0;
    const owner = Object.freeze({ x: 480, y: 498, radius: 14, vx: 0, vy: 0 });
    for (let i = 0; i < 2400 && !c.complete; i++) {
      c.update(1000 / 60, owner);
      if (!walkable(c.position) || Math.hypot(c.position.x - owner.x, c.position.y - owner.y) < 28) failures.push(c.snapshot());
      if (c.moving) directions.add(c.facing);
      maxSpeed = Math.max(maxSpeed, Math.hypot(c.velocity.x, c.velocity.y));
      if (c.waiting) { waitFrames++; if (c.moving || c.facing !== 'up' || Math.hypot(c.position.x - 252, c.position.y - 220) > 0.01) failures.push(c.snapshot()); }
    }
    const finished = c.snapshot();
    for (let i = 0; i < 600; i++) c.update(1000 / 60, owner);
    return { failures, directions: [...directions].sort(), maxSpeed, waitFrames, finished, later: c.snapshot() };
  });
  expect(result.failures).toEqual([]); expect(result.directions).toEqual(['down', 'left', 'right', 'up']);
  expect(result.maxSpeed).toBeCloseTo(85, 6); expect(result.waitFrames).toBe(480);
  expect(result.finished).toMatchObject({ state: 'COMPLETE', complete: true, moving: false, position: { x: 856, y: 314 } });
  expect(result.later).toEqual(result.finished);
});

test('a blocked spawn and reception yield without teleporting or writing owner state, then resume when clear', async ({ page }) => {
  const result = await simulate(page, async ({ create, walkable }) => {
    const c = create();
    const occupying = Object.freeze({ x: 520, y: 548, radius: 14, vx: 0, vy: 0 });
    for (let i = 0; i < 180; i++) c.update(1000 / 60, occupying);
    const pending = c.snapshot();
    const owner = Object.freeze({ x: 252, y: 220, radius: 14, vx: 0, vy: 0 });
    let bad = 0, maxStep = 0;
    for (let i = 0; i < 1200; i++) {
      const before = { ...c.position }; c.update(1000 / 60, owner);
      maxStep = Math.max(maxStep, Math.hypot(c.position.x - before.x, c.position.y - before.y));
      if (!walkable(c.position) || Math.hypot(c.position.x - owner.x, c.position.y - owner.y) < 28) bad++;
    }
    const blocked = c.snapshot();
    for (let i = 0; i < 2400 && !c.complete; i++) c.update(1000 / 60, { x: 480, y: 498, radius: 14 });
    return { pending, blocked, bad, maxStep, finished: c.snapshot(), owner };
  });
  expect(result.pending).toMatchObject({ spawned: false, state: 'WAITING_TO_SPAWN', position: { x: 520, y: 548 } });
  expect(result.blocked).toMatchObject({ state: 'YIELDING', stuck: true, complete: false });
  expect(result.blocked.replans).toBeLessThanOrEqual(24);
  expect(result.bad).toBe(0); expect(result.maxStep).toBeLessThanOrEqual(85 / 60 + 0.001);
  expect(result.finished.state).toBe('COMPLETE'); expect(result.owner).toEqual({ x: 252, y: 220, radius: 14, vx: 0, vy: 0 });
});

test('suspension freezes position, active wait time and walking state and resumes the same stop', async ({ page }) => {
  const result = await simulate(page, async ({ create }) => {
    const c = create(), owner = { x: 480, y: 498, radius: 14 };
    while (!c.waiting) c.update(1000 / 60, owner);
    for (let i = 0; i < 120; i++) c.update(1000 / 60, owner);
    c.suspend(); const before = c.snapshot();
    for (let i = 0; i < 1200; i++) c.update(1000 / 60, owner);
    const after = c.snapshot(); c.resume(); c.update(1000 / 60, owner);
    return { before, after, resumed: c.snapshot() };
  });
  expect(result.after).toEqual(result.before);
  expect(result.before).toMatchObject({ moving: false, suspended: true, state: 'WAITING_AT_RECEPTION', facing: 'up' });
  expect(result.resumed.waitRemainingMs).toBeCloseTo(result.before.waitRemainingMs - 1000 / 60, 5);
});

test('owner pursuit uses bounded guest steps and the last-resort guard without overlaps, wall crossings or backward pushes', async ({ page }) => {
  const result = await simulate(page, async ({ create, walkable, clipOwnerStep }) => {
    const c = create(); let owner = { x: 480, y: 498, radius: 14 }, bad = 0, holds = 0, maximumStep = 0;
    for (let i = 0; i < 1800; i++) {
      const previous = { ...owner }, guestFrom = { ...c.position };
      const dx = c.position.x - owner.x, dy = c.position.y - owner.y, d = Math.hypot(dx, dy);
      let next = { x: owner.x + dx / d * 190 / 60, y: owner.y + dy / d * 190 / 60 };
      if (!walkable(next)) next = { x: owner.x, y: owner.y };
      c.update(1000 / 60, { ...next, radius: 14, previous, vx: (next.x - owner.x) * 60, vy: (next.y - owner.y) * 60 });
      const guarded = c.spawned && !c.complete ? clipOwnerStep(previous, next, guestFrom, c.position, 28.05, walkable)
        : { position: next, held: false };
      if (guarded.held) holds++;
      owner = { ...guarded.position, radius: 14 };
      maximumStep = Math.max(maximumStep, Math.hypot(c.position.x - guestFrom.x, c.position.y - guestFrom.y));
      if (!walkable(owner) || !walkable(c.position) || (c.spawned && Math.hypot(c.position.x - owner.x, c.position.y - owner.y) < 28)) bad++;
      const forward = (owner.x - previous.x) * (next.x - previous.x) + (owner.y - previous.y) * (next.y - previous.y);
      if (forward < -0.000001) bad++;
    }
    const direct = clipOwnerStep({ x: 340, y: 210 }, { x: 340, y: 214 },
      { x: 340, y: 240 }, { x: 340, y: 240 }, 28.05, walkable);
    const margin = clipOwnerStep({ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 5.5, y: 0 }, { x: 5.5, y: 0 },
      2, p => p.x <= 2.5 || p.x >= 3.5008);
    return { bad, holds, maximumStep, direct, margin, final: c.snapshot() };
  });
  expect(result.bad).toBe(0);
  expect(result.direct.held).toBe(true);
  expect(result.direct.position.y).toBeGreaterThanOrEqual(210);
  expect(result.direct.position.y).toBeLessThanOrEqual(211.951);
  expect(result.margin).toEqual({ position: { x: 0, y: 0 }, held: true });
  expect(result.maximumStep).toBeLessThanOrEqual(85 / 60 + 0.001);
});

async function simulate(page, body) {
  await page.goto('/');
  return page.evaluate(async source => {
    const { GuestController, clipOwnerStep } = await import('/world/guest-controller.js');
    const { TRAVELER_JOURNEY } = await import('/world/lobby-guests.js');
    const { lobbyPath, clearSegment, walkable } = await import('/world/lobby-navigation.js');
    const create = () => new GuestController({ ...TRAVELER_JOURNEY,
      path: (a, b, blockers) => lobbyPath(a, b, { blockers, smooth: true }),
      clear: (a, b, blockers = []) => clearSegment(a, b, 14, blockers), walkable });
    return await (0, eval)(`(${source})`)({ create, walkable, clipOwnerStep });
  }, body.toString());
}

test('shared depth orders both moving actors against the same foreground without changing the stationary receptionist', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { updateLobbyDepth } = await import('/world/lobby-depth.js');
    let layerDepth, guestDepth;
    const scene = { player: { y: 386 }, config: { playerRadius: 14 },
      foregrounds: [{ baseline: 300, foreground: { setDepth(d) { layerDepth = d; } } }],
      guests: { controller: { position: { y: 186 }, radius: 14 }, visual: { setDepth(d) { guestDepth = d; } } },
      receptionist: { depth: 4 } };
    updateLobbyDepth(scene); const behind = { layerDepth, guestDepth };
    scene.player.y = 186; scene.guests.controller.position.y = 386;
    updateLobbyDepth(scene);
    return { behind, front: { layerDepth, guestDepth }, receptionist: scene.receptionist.depth };
  });
  expect(result.behind.guestDepth).toBeLessThan(result.behind.layerDepth);
  expect(result.behind.layerDepth).toBeLessThan(10);
  expect(result.front.guestDepth).toBeGreaterThan(result.front.layerDepth);
  expect(result.front.layerDepth).toBeGreaterThan(10); expect(result.receptionist).toBe(4);
});
