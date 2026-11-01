const { test, expect } = require('@playwright/test');

test('interaction eligibility uses scene, availability, rectangle distance and deterministic nearest selection', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { selectInteraction } = await import('/world/interaction-system.js');
    const base = { scene: 'A', position: { x: 0, y: 0 }, radius: 10, availability: true };
    const definitions = [
      { ...base, id: 'hidden', availability: false },
      { ...base, id: 'other-scene', scene: 'B' },
      { ...base, id: 'z' }, { ...base, id: 'a' },
      { ...base, id: 'conditional', availability: context => context.open, position: { x: 8, y: 0 } },
    ];
    const pick = (x, context = {}) => selectInteraction(definitions, 'A', { x, y: 0 }, context)?.id ?? null;
    const rect = [{ ...base, id: 'door', position: { x: 0, y: 0, width: 20, height: 10 }, radius: 5 }];
    return { tie: pick(0), closed: pick(8), open: pick(8, { open: true }), outside: pick(100),
      edge: selectInteraction(rect, 'A', { x: 15, y: 0 })?.id,
      beyond: selectInteraction(rect, 'A', { x: 15.01, y: 0 }),
      wrongScene: selectInteraction(definitions, 'C', { x: 0, y: 0 }) };
  });
  expect(result).toEqual({ tie: 'a', closed: 'a', open: 'conditional', outside: null, edge: 'door', beyond: null, wrongScene: null });
});

test('one dispatch handler rejects repeats, focus loss, blocked state, cooldown and stale proximity', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { InteractionSystem } = await import('/world/interaction-system.js');
    let focused = false, blocked = false, x = 0, time = 0, available = true, calls = 0;
    const scene = { sys: { settings: { key: 'A' } }, input: { keyboard: { on() {}, off() {} } }, events: { once() {} },
      owner: { snapshot: () => ({ x, y: 0 }), hasFocus: () => focused, stop() {} } };
    const system = new InteractionSystem(scene, {
      definitions: [{ id: 'door', scene: 'A', position: { x: 0, y: 0 }, radius: 5, availability: () => available }],
      dispatch: () => calls++, blocked: () => blocked, now: () => time,
    });
    const noFocus = system.trigger(); focused = true;
    const repeat = system.trigger({ repeat: true }); blocked = true;
    const modal = system.trigger(); blocked = false;
    const first = system.trigger(); const cooldown = system.trigger(); time = 250;
    x = 10; const outOfRange = system.trigger({ pointer: true }); x = 0; available = false;
    const unavailable = system.trigger(); available = true; focused = false;
    const button = system.trigger({ pointer: true });
    return { noFocus, repeat, modal, first, cooldown, outOfRange, unavailable, button, calls };
  });
  expect(result).toEqual({ noFocus: false, repeat: false, modal: false, first: true, cooldown: false,
    outOfRange: false, unavailable: false, button: true, calls: 2 });
});

test('declarative destinations share the system and standalone lounge has no world exit', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { INTERACTABLES } = await import('/world/interactables.js');
    const { selectInteraction } = await import('/world/interaction-system.js');
    const byId = id => INTERACTABLES.find(item => item.id === id);
    const exit = byId('lobby');
    return {
      idsUnique: new Set(INTERACTABLES.map(item => item.id)).size === INTERACTABLES.length,
      types: [...new Set(INTERACTABLES.map(item => item.action.type))].sort(),
      casino: byId('casino').action, hotel: byId('hotel').action,
      worldExit: selectInteraction(INTERACTABLES, exit.scene, exit.position, { canReturn: true })?.id,
      standaloneExit: selectInteraction(INTERACTABLES, exit.scene, exit.position, { canReturn: false }),
    };
  });
  expect(result).toEqual({ idsUnique: true, types: ['blackjack', 'dialogue', 'door', 'management', 'return'],
    casino: { type: 'door', destination: 'MainCasinoFloor' }, hotel: { type: 'door', destination: 'HotelInterior' },
    worldExit: 'lobby', standaloneExit: null });
});
