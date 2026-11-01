const { test, expect } = require('@playwright/test');
const { openCasino, approach, storage, snapshot } = require('./helpers/casino-world');

test('seven separate standing regions match the approved artwork positions and existing collisions', async ({ page }) => {
  await page.goto('/');
  const r = await page.evaluate(async () => {
    const { CASINO_ATTRACTIONS: all } = await import('/world/casino-attractions.js');
    const { MAIN_SOLIDS, MAIN_PORTALS, walkable } = await import('/world/main-casino-layout.js');
    const { selectInteraction } = await import('/world/interaction-system.js');
    const { INTERACTABLES } = await import('/world/interactables.js');
    return { bodies: MAIN_SOLIDS.length, entries: all.map(a => ({ id: a.id, game: a.gameId, p: a.approach,
      clear: walkable(a.approach, 14.25), selected: selectInteraction(INTERACTABLES, 'MainCasinoFloor', a.approach)?.id })),
      doors: Object.values(MAIN_PORTALS).map(p => selectInteraction(INTERACTABLES, 'MainCasinoFloor', p.approach)?.id),
      opposite: [{ x: 208.125, y: 178.125 }, { x: 761.25, y: 175.78125 }, { x: 832.734375, y: 377.34375 }]
        .map(p => selectInteraction(INTERACTABLES, 'MainCasinoFloor', p)?.action.type ?? null) };
  });
  expect(r.bodies).toBe(120); expect(r.entries).toHaveLength(7);
  expect(r.entries.every(a => a.clear && a.selected === a.id)).toBe(true);
  expect(r.entries.filter(a => a.game === 'slots').map(a => a.p)).toEqual([674.53125,717.890625,761.25,804.609375,847.96875].map(x => ({ x, y: 300 })));
  expect(r.doors).toEqual(['main-south', 'main-north']); expect(r.opposite).toEqual([null,null,null]);
});

test('opt-in reachability filters before deterministic distance and ID selection', async ({ page }) => {
  await page.goto('/');
  const r = await page.evaluate(async () => {
    const { selectInteraction } = await import('/world/interaction-system.js');
    const d = { scene: 'Main', position: { x: 0, y: 0 }, radius: 20 };
    const entries = [{ ...d, id: 'blocked', reachable: () => false }, { ...d, id: 'z' }, { ...d, id: 'a' }];
    return [selectInteraction(entries, 'Main', { x: 1, y: 0 }).id,
      selectInteraction(entries, 'Other', { x: 0, y: 0 }), selectInteraction(entries, 'Main', { x: 21, y: 0 })];
  }); expect(r).toEqual(['a', null, null]);
});

test('real input reaches each cabinet and both tables without changing saves or body dimensions', async ({ page }) => {
  test.setTimeout(90000); const seed = await openCasino(page);
  for (const id of ['roulette','slot-1','slot-2','slot-3','slot-4','slot-5','coin-flip']) {
    await approach(page, id); const s = await snapshot(page);
    expect(s.ownerBody).toMatchObject({ radius: 14, width: 28, height: 28 });
    await expect(page.locator('#world-interact')).toContainText(id.startsWith('slot-') ? `Machine ${id.slice(-1)}` : id === 'roulette' ? 'Roulette Royale' : 'Coin Flip');
  }
  expect(await storage(page)).toEqual(seed);
});
