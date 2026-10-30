# Phase 4 — Blackjack Lounge visual integration proposal

Status: mapping approved October 30, 2026; implementation recorded in
`BLACKJACK_LOUNGE_VISUAL.md`.

The user's pasted Phase 4 brief defines this visual milestone. The older build
plan's differently named Phase 4 does not expand this scope into onboarding,
NPCs or hotel simulation.

## Verified starting point

- Clean checkout at `6f474af` before this plan was written.
- Fresh full baseline: **342 passed, 0 failed**, desktop Chromium and Pixel 5,
  two workers, 6.7 minutes. Command: `npx playwright test --workers=2`.
  The earlier figure of 338 predates four lobby-contact regression checks.
- Phaser remains 3.90.0; world dimensions 960 × 600, speed 190, radius 14.
- `floor/room-scene.js` supplies both the standalone lounge and the world room.
- The existing page hosts own the mounted blackjack iframe. Scene sleep/wake
  does not destroy it; the game page retains ownership of rules and settlement.
- World-state v2 stores the Central Lobby checkpoint, not lounge coordinates.

## Selected assets and transform

Use the latest, south-open background:
`C:/Users/xad/AppData/Local/Temp/codex-clipboard-3dd108a8-d340-43db-af67-d1debe14415c.png`.
It is 1536 × 1024 RGB. SHA-256:
`c84b3780798110d2be28ee19d039a4b3565bdd6aeb7d96fa8a1d47c7a6209f39`.

This replaces the earlier background containing the southern seating group.
Use its original bytes without cropping, stretching, repainting or cleanup.
Display at x=30, y=0, width=900, height=600, matching the Central Lobby.

Source-to-world conversion:

```
worldX = 30 + sourceX * 0.5859375
worldY = sourceY * 0.5859375
```

Nearest-neighbor texture filtering and the existing pixelated canvas scaling
stay in place. Side margins are black and non-walkable.

The separate table asset is also 1536 × 1024, with genuine RGBA transparency.
Its main visible pixels occupy approximately (15,141)–(1521,929); faint alpha
fringe pixels extend farther. It is not needed for this background and will not
be loaded or rendered, avoiding a second table or changes to the original art.

## Proposed mapping

All source coordinates below refer to the latest background. Footprint outlines
are proposed from visual inspection and will be checked against the debug view
and actual radius-14 movement during implementation.

| Element | Source pixels | World coordinates, approximately |
| --- | --- | --- |
| Owner entrance/spawn, facing up | (768,819.2) | **(480,480), unchanged** |
| Return-to-lobby interaction | (768,913.07) | **(480,535), reach 44, unchanged** |
| Front-center table approach | (768,700) | (480,410.16) |
| Blackjack interaction strip | x=600–936, y=610–635 | x=381.56–578.44, y=357.42–372.07; reach 44 |
| Curved table base | polygon below | bounding x≈291–669, y≈204–329 |
| Seven stool/chair bases | centers below, source radius≈30 | circular bases, world radius≈17.58 |
| Northwest lounge seats/table | seats (103,244), (267,244); table (185,236) | seat centers (90.35,142.97), (186.45,142.97); table (138.40,138.28) |
| Northeast lounge seats/table | seats (1268,244), (1433,244); table (1351,236) | seat centers (772.97,142.97), (869.65,142.97); table (821.60,138.28) |
| Northern palm pots | (375,222), (1158,222), source radius≈32 | (249.73,130.08), (708.52,130.08); radius≈18.75 |
| Southern palm/pedestal groups | centered near (444,831), (1090,831), plus pillar bases | near (290.16,486.91), (668.67,486.91) |
| North wall base | source y≈0–245, following the visible trim | world y≈0–143.55 |
| Side walls/piers | trace visible outer wall and column bases | stay inside image x=30–930 |
| Southwest/southeast planter beds | roughly x=0–216 / 1320–1536, y=670–907 | x≈30–156.56 / 803.44–930, y≈392.58–531.45 |
| Southern pillar feet | roughly x=414–474 / 1062–1122, y=845–980 | x≈272.58–307.73 / 652.27–687.42, y≈495.12–574.22 |

Proposed curved table-base polygon, in source pixels:

```
(466,348), (1070,348), (1090,395), (1050,455),
(968,512), (874,547), (768,562), (662,547),
(568,512), (486,455), (446,395)
```

Proposed stool-base centers, west to east:

```
(450,475), (520,548), (633,594), (768,611),
(903,594), (1016,548), (1086,475)
```

These are floor-level bases. Table lamps, tall chair backs and palm fronds are
not full-height collision rectangles. Rugs, gold floor borders and the open
southern threshold remain walkable. Small decorations at the image edges will
receive individual floor footprints or be covered by their actual wall/bed base.

The primary route is a straight walk north from (480,480) to the front table
approach near (480,410). Walk south to the existing exit near (480,535).
Both side aisles remain accessible. No artwork change is required to open them.

## Conflicts and implementation decisions

1. The old 240 × 120 rectangular table collider and artificial partition at
   (232,390) do not match the artwork. Replace them with source-defined table,
   stool, furniture, wall and planter footprints. The revised image removes the
   previous southern spawn/exit obstruction, so both existing points can stay.
2. `ROOM.table` currently acts as both collider and interaction target. Keep it
   as the logical interaction strip consumed by the existing controller and
   `isNearTable`; build physics from a separate `solids` collection.
3. Reuse `polygonStrips`, `clearOf`, and `constrainFootprintMovement` unchanged.
   Refresh fractional static-circle extents as established in the lobby. Check
   opposing contacts around stools and plants so narrow gaps stop movement
   safely. No Central Lobby geometry or collision-helper changes are proposed.
4. First entry becomes asynchronous because the room loads a PNG. Adjust the
   world host's readiness/focus handling so it does not call room methods before
   create. Disable interaction during loading and finish focus in onReady.
   Validate image dimensions; handle missing, wrong-size and failed images
   without owner-control exceptions or replacing saved data.
5. Add precise foreground masks using identical pixels from the same background
   for appropriate table surfaces, chair backs, palms and column faces. Do not
   mask empty carpet between objects. Existing HTML proximity prompts remain;
   normal rendering has no collision fill or large table box covering the art.
6. Reuse the debug button/query approach for the active world scene and add a
   debug-only control to the standalone lounge. Debug snapshots remain read-only.

## Proposed files

Add:

- `floor/assets/lounge/blackjack-lounge.png` — exact latest background.
- `floor/lounge-layout.js` — transform, solids, interaction geometry and masks.
- `tests/lounge-visual.spec.js` — artwork and physical journey regressions.
- `tests/helpers/lounge-world.js` — keyboard routes/approved landmark fixtures.
- `docs/BLACKJACK_LOUNGE_VISUAL.md` and final screenshot artifacts.

Modify:

- `floor/room-config.js` — retain dimensions/speed/radius/spawn/exit; use new
  layout and separate physical solids from the interaction target.
- `floor/room-scene.js` — preload/validate/render background, footprints, masks,
  contact correction and debug drawing; retain existing host/interaction API.
- `floor/main.js` — standalone loading/failure handling and read-only diagnostics.
- `floor/index.html` — debug-only collision toggle.
- `world/main.js` — loading-aware scene entry/focus and active-scene debug toggle.
- `tests/floor.spec.js`, `tests/world.spec.js`, `tests/resort-lobby.spec.js`,
  `tests/owner-sprite.spec.js` — update paths and obsolete placeholder geometry
  assertions while retaining movement, focus, iframe lifetime and wallet checks.

`world/interactables.js` already reads `ROOM.table` and `ROOM.exit`; their new
definitions propagate without editing the interaction system or lobby entries.
No changes are proposed to the owner controller/assets, world-state module,
lobby artwork/footprints, Hotel Interior, blackjack bridge/overlay/rules, wallet,
hotel systems, minigames, package dependencies or Phaser vendor runtime.

## Acceptance criteria and checks after mapping review

- Run both routes: `/world/index.html` → casino and `/floor/index.html`.
- Assert original PNG bytes, 1536 × 1024 dimensions and exact 900 × 600 display
  bounds at (30,0), including desktop and mobile emulation.
- Verify unchanged owner body, speed and four-direction animations/focus.
- Physically walk from spawn to the visible table, around furniture and back to
  the south-center exit. Check table/stool/wall/palm contacts and retreat, with
  radius-14 clearance while holding keys into single and opposing contacts.
- E works only in the intended interaction region; prompts are contextual.
- Opening the original blackjack UI pauses movement; closing restores the same
  owner position/facing and canvas focus.
- Leave an active paid hand, visit another scene, reopen the same mounted iframe
  and settle once using the existing deterministic shuffle fixture. Check the
  exact shared-wallet deduction and payout and unchanged hotel cash.
- Return to the exact saved lobby position/facing; reload/Continue preserve the
  v2 checkpoint and any migration receipt. No schema/key migration is needed.
- Test delayed loading and image failures, including keyboard input and conflict
  protection, without unhandled exceptions or replacement of existing saves.
- Retain standalone navigation and all existing game assertions; run the full
  suite again after implementation.
- Capture normal lounge, collision-debug lounge, owner at the table and owner at
  the return exit. The existing hard-reload hand-loss behavior remains unchanged.

The footprint coordinates above record the approved proposal. Physical clearance
and rendering are checked during implementation; see the implementation report
for final results and any refinements. The user approved this mapping before
code integration began.
