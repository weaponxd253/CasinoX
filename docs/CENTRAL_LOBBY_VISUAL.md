# Central Lobby visual integration

## Artwork and mapping

The supplied PNG is copied byte-for-byte to
`world/assets/lobby/central-lobby.png` (1536 × 1024 RGB). SHA-256:
`4fa44e549d01cdd1fe8e2a424335129653456e19bbb8a67d03187958a0f9af7d`.
No generative edits, stretching, cropping or repainting were performed.

The game stays 960 × 600. The background displays at 900 × 600, x=30, y=0.
Source-to-world conversion is `x = 30 + sourceX * 600/1024`,
`y = sourceY * 600/1024`. The 30-pixel side margins are black and non-walkable.
Both the background and existing owner texture use nearest-neighbor filtering;
the existing pixelated canvas scaling remains. OwnerController, sprite frames,
speed 190, radius 14 and owner save precision are unchanged.

| Destination | Artwork landmark | World target, approximately |
| --- | --- | --- |
| Reception dialogue | Upper-left counter face | 206, 191 |
| Existing Blackjack Lounge | North red staircase | 480, 158 |
| Existing Hotel Management | Brown door beneath office | 717, 199 |
| Existing Hotel Interior | East grand double doors | 856, 271 |
| New visitor spawn | South central red carpet | 480, 498 |

Existing E dispatch, receptionist conversation, M shortcut, overlay pause/focus,
room sleep/wake and exact return point continue through the original host.
Other painted doors are scenery and do not advertise new destinations.

## Collision and depth

`world/lobby-layout.js` is the source-coordinate definition for artwork, obstacle
footprints, interactions and foreground masks. Rugs, stair treads and tall-object
overhangs remain passable. Colliders cover walls/exterior, counter, the octagonal
fountain basin, seating, tables, planter bases and column feet. Rounded bases use
circle bodies; polygons use conservative four-source-pixel strips. Physics,
save validation, navigation and the debug overlay use those same compiled shapes.

The shared collision builder refreshes fractional circle extents from their zones:
Phaser 3.90's `StaticBody.setCircle` otherwise floors half-extents and shifts their
centres relative to scaled coordinates. This keeps collision and save clearance
consistent without changing the owner's body.

The lobby also finishes residual oblique circle/rectangle contacts after each
physics step using the nearest footprint point. Arcade's rectangle-centre normal
can otherwise leave a small overlap at a corner. The correction keeps the
14-pixel body clear for strict save validation; it does not change owner controls
or the shared controller. A regression samples clearance on every rendered frame
while the owner brushes the east column and autosave runs.

The October 30 contact follow-up also handles opposing contacts in narrow gaps.
The east table/chair gap is about 26.37 world pixels; the casino arch/planter gap
is about 23.44 pixels. Both are narrower than the owner's 28-pixel diameter.
Four projection passes can separate one contact while reintroducing another.
`constrainFootprintMovement` checks the result against every footprint. When it
remains obstructed, it clips that physics step from Arcade's preceding clear
body position to the first contact, with a small floating-point margin. Normal
resolved contacts keep their existing behavior. No geometry, save schema,
clearance tolerance, owner controller, animation or economy changes are needed.
This uses Arcade's existing per-step `body.prev`, not another position cache or
save authority. Invalid previous positions still stop the world with an error.

Small foreground masks display identical pixels from the original image above an
owner whose feet are behind the fountain crown, palms or columns. No second art
version or color overlay is used in the normal scene. The Hotel Interior has its
original seven rectangles explicitly retained, independent of lobby geometry.

Temporary debugging: open `/world/index.html?debug=1&collisions=1`, or use the
debug-only Toggle collision debug button. Red denotes solid footprints, cyan
marks interaction reach, and the white circle shows the owner's radius. The
normal route hides the button and overlay. Debugging never writes saved data.

Navigation clearance is checked with a connected four-pixel grid and the full
owner radius plus a small sampling margin. Only this static map is cached; there
is no simulation clock, guest generation, financial calculation or save authority
in navigation. Playwright drives the existing keyboard input along those routes.

## World-save version 2

`casinoWorldState` remains the only world key. Version 2 identifies
`layout: "luxury-lobby-1"`. Hotel, wallet, profile and guest storage are not migrated.

1. Title checks are read-only. A v1 payload is validated against frozen original
   geometry, never against the new furniture. Invalid JSON, invalid original
   coordinates, unsupported versions/layouts and invalid receipts remain errors.
2. On world entry, clear v1 coordinates and facing are preserved exactly. Only
   obstructed coordinates are resolved to the deterministic nearest clear grid
   point connected to the new spawn. Unknown metadata and lobby fields survive.
3. The background must load and match its expected dimensions before the scene
   initializes movement or attempts persistence. Failure shows an error and
   preserves all existing saved data.
4. Migration uses one `setItem` containing the new layout/position and a single
   `migrationReceipt`: `sourceVersion`, `layout`, exact `originalRaw`, `relocated`
   and `migratedAt`. The exact whitespace and unknown fields of v1 remain in
   `originalRaw`. No separate backup key, deletion or partial commit is used.
5. In-memory write bookkeeping changes only after successful persistence. Failed
   writes stop the world and retain v1; reloading after storage recovers retries
   safely. Subsequent movement/reloads retain the same receipt without nesting or
   replacing it. Relocation shows a visible notice on the migration visit.
6. Expected-raw comparison and storage-event conflict protection remain. A second
   tab's change, including during image loading, stops the stale session and
   prevents it from committing. Pagehide never replaces data after a failure.

Valid v2 positions continue unchanged. Invalid v2 positions are errors rather than
being silently relocated. Reload/Continue still returns to the lobby checkpoint;
interior room positions remain in memory during a document visit.

## Verification

Contact-fix verification on October 30, 2026: **342 passed, 0 failed** in 6.4
minutes, using both configured desktop and Pixel 5 projects with two workers.
This retains the previous 338 checks and adds four regressions for the reported
locations. The four focused regressions also passed separately in 13.8 seconds.
Save validation, collision footprints and owner controls were unchanged.

Initial integration verification on October 30, 2026: **338 passed, 0 failed** in 7.1 minutes
using both configured Chromium desktop and Pixel 5 projects, with two workers.
The total comprises the original 160 checks, 138 checks from the incoming branch,
and 40 new lobby checks. The focused merge/navigation/contact recheck also passed
all 30 checks. `git diff --check` passes and no merge markers remain.

The unchanged 160-check baseline passed before switching the lobby. Its existing
world, resort and owner tests were retargeted to current layout coordinates;
save fixtures now identify v2. Existing casino/floor coverage remains intact.
`tests/lobby-visual.spec.js` adds 40 desktop/mobile checks for exact asset bytes,
rendered pixels/aspect ratio, collision/debug rendering, physical keyboard routes,
fountain/table/wall clearance, depth order, v1 migration and receipts, relocation,
clear-coordinate preservation, sampled reachability, failed writes/retry, image
failures, invalid/future saves and cross-tab loading races.

`tests/lobby-contacts.spec.js` adds four desktop/mobile regressions for the two
reported gaps. Both cases reproduced invalid positions before the correction.
The tests hold movement into the obstacles for 2.2 seconds, check clearance on
every rendered frame across autosaves, verify retreat and stopped input, then
verify exact checkpoint persistence through reload and normal-title Continue.
Legacy save bytes and unknown world metadata must remain intact.

```sh
npx playwright test tests/lobby-visual.spec.js --workers=2
npx playwright test tests/lobby-contacts.spec.js --workers=2
npx playwright test --workers=2
```

Manual verification: Continue, walk both sides of the fountain and through the
seating area, speak at reception, visit each destination and return. Reload and
check position/facing. In a disposable browser context, test a valid v1 position
inside the new fountain and inspect its notice and receipt. The tests use isolated
storage and mocked remote services; screenshots include the normal lobby and the
collision overlay on desktop and mobile emulation.

Final desktop captures: [normal lobby](screenshots/central-lobby.png) and
[collision overlay](screenshots/central-lobby-collisions.png). Both are generated
by the artwork regression and copied without image edits. Mobile captures are
also produced in Playwright's `test-results` directory.

## Files and approved merge resolution

Added for this integration: `world/assets/lobby/central-lobby.png`,
`world/{collision-geometry,legacy-lobby-layout,lobby-layout,lobby-navigation}.js`,
`tests/helpers/lobby-world.js`, `tests/lobby-visual.spec.js`, this document and
the final screenshot artifacts.

The reported-contact follow-up changes only `world/collision-geometry.js`,
`world/lobby-scene.js`, the new `tests/lobby-contacts.spec.js` and this document.

Modified: `world/{lobby-config,lobby-scene,interactables,explorable-scene,
hotel-config,world-state,main}.js`, `world/index.html`, and layout fixtures in
`tests/{world,resort-lobby,owner-sprite}.spec.js`.

During implementation the repository changed to include an incoming branch with
literal merge markers. The user separately approved resolving them. Original
conflicted files were copied to a timestamped `casinox-conflict-backup-*` folder
under the OS temporary directory. Resolution retains the owner title/routes,
SaveSafety and blackjack iframe bridge, plus incoming queued hotel events, perks,
local assets/versioning and other non-conflicting changes. Unreadable hotel saves
retain the strict error path instead of starting fresh. No wager/payout formulas
or operation rules were edited in resolving conflicts.

Those resolutions touch `package.json`, `README.md`, root `index.html`,
`casino.html`, `blackjack/{index.html,script.js}`, `coinflip/{index.html,game.js}`,
`slots/{index.html,script.js}`, `hotel/hotel-state.js`, `hotel/index.html` and the
six hotel operation HTML entrypoints. The saved-resort VM fixture gains an inert
event-listener shim for the incoming module's lifecycle registration. The new
Roulette entrypoint also loads the shared SaveSafety dependency required by its
wallet and shell. Test fixtures acknowledge the incoming welcome modal and use
the local deck's shuffle input for deterministic hands, without bypassing real
wagers or settlement. The obsolete deck-service refund test now verifies local
offline dealing, one deduction and one settlement. The incoming import test
waits for hotel initialization after reload. These compatibility updates touch
`tests/floor.spec.js`, `tests/casino.spec.js`, the world/resort suites and the new
`tests/helpers/blackjack-deck.js`.

No files were reset, deleted, staged or committed by this task. SHA-256 comparisons
against the pre-task manifest confirm unchanged owner controller/sprite code,
owner PNGs, standalone floor host/scene and Hotel Interior scene code.

New Game reset and unfinished blackjack hard-reload recovery remain outside this
slice; the existing warning and retained-deduction behavior are unchanged.
The incoming legacy export/import menu does not include `casinoWorldState` in
its export allowlist; extending that backup workflow needs a separate save-file
compatibility change. The in-browser world checkpoint and receipt are persisted.
