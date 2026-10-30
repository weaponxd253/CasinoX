# Phase 4 — Blackjack Lounge visual integration

The shared `CasinoRoom` now uses the approved south-open lounge background in
both the owner world and standalone `/floor/index.html`. The existing game page
still owns blackjack rules, wagers and settlement. The iframe remains mounted
between overlay visits and world scene transitions.

## Artwork and coordinates

`floor/assets/lounge/blackjack-lounge.png` is the unmodified 1536 × 1024 RGB
source, SHA-256
`c84b3780798110d2be28ee19d039a4b3565bdd6aeb7d96fa8a1d47c7a6209f39`.
The source is displayed at x=30, y=0, 900 × 600 inside the existing 960 × 600
world. Both texture filtering and canvas scaling retain nearest-neighbor pixel
rendering. No standalone table sprite is loaded or added to the painted table.

The source transform is `worldX = 30 + sourceX * 600/1024`,
`worldY = sourceY * 600/1024`. `floor/lounge-layout.js` defines physical
footprints, the approach strip and foreground masks in source-image pixels.

- Spawn remains (480,480), facing up; lobby return remains (480,535), reach 44.
- Front table approach is near (480,410).
- The logical interaction strip spans x≈381.56–578.44, y≈357.42–372.07, reach 44.
- A curved table-base polygon is compiled into narrow rectangles; seven stool
  bases use circles. The southern middle stool stops the radius-14 owner near
  y=389.586; the north table edge stops an approach from behind near y=189.906.
- Corner seating/tables, planter and column bases and walls have separate floor
  footprints. Rugs, decorative floor trim and the open south threshold stay
  walkable. The obsolete placeholder partition was removed.

The collision builder refreshes fractional static-circle extents from their
zones, matching the established lobby pattern. The existing unchanged
`constrainFootprintMovement` helper finishes contacts after every physics step,
including opposing contacts around stools and furniture. Speed remains 190,
the body remains a 14-pixel circle, and the owner controller and sprite assets
are unchanged.

Foreground masks use identical pixels from the same background for table
surfaces/lamps, stool backs, southern palms and pillars. Depth depends on the
owner's feet relative to each object's baseline. Masks avoid a single broad
rectangle over the empty carpet between stools. Normal presentation uses the
existing HTML interaction prompt rather than a box drawn over the table.

## Loading, navigation and saves

First entry may wait for the PNG. World transitions now mark the room busy and
disable interactions until `onReady` creates the owner and restores canvas
focus. Sleeping rooms still wake immediately at their retained position.
This fixes the old assumption that every room creates synchronously.

The scene validates image availability and dimensions before creating its owner.
Abort, invalid-image and wrong-size failures stop input and leave existing saves
intact. The standalone page retains its classic Blackjack X link. World save
conflicts during loading stop stale scene creation. Existing storage validation,
failed-write handling and multi-tab protections remain in their original owner.

World-state version 2, keys and payload format are unchanged. The Central Lobby
checkpoint and any migration receipt remain authoritative. No new migration or
lounge save key exists; the lounge's position is transient scene state, as before.
Lobby artwork/geometry, Hotel Interior, receptionist dialogue, hotel state and
engine, wallet, blackjack rules and other minigames are unchanged. The visual
integration left the bridge/overlay unchanged; the local-file follow-up below
extends their readiness messaging.

Hard reload still loses an unfinished blackjack hand and leaves its wager
deducted. The existing warning remains; this phase adds no restoration, refund
or replay behavior. New Game and legacy export limitations described in the
Central Lobby report remain outside this phase.

## Debug and verification

Final verification on October 30, 2026: **368 passed, 0 failed** in 8.4 minutes,
using both configured Chromium desktop and Pixel 5 projects with two workers.
All 342 pre-existing checks remain, with 26 added for Phase 4. `git diff --check`
passes, and all 15 HTML entrypoints have no missing local asset references.
Hash comparisons against the pre-implementation manifest confirm unchanged
pre-existing files outside the change list below, including all protected game,
save, hotel, owner, lobby and Hotel Interior modules/assets. No files were reset,
deleted, staged or committed by this phase.

Open `/floor/index.html?debug=1&collisions=1`, or enter the lounge through
`/world/index.html?debug=1&collisions=1`. The debug button toggles the active
scene's overlay. Red shows solid footprints, cyan shows interaction reach, and
white shows the owner's radius. Normal routes hide the debug controls.
Read-only diagnostics expose artwork bounds, filtering and foreground depths;
they provide no position or economy mutation API.

The pre-change baseline passed all 342 desktop/mobile checks in 6.7 minutes.
The focused world/floor/sprite/resort/artwork run passed all 140 checks in
3.9 minutes. `tests/lounge-visual.spec.js` adds 26 checks across the two projects
for source hash/pixels/scaling, all four review views, movement/animation, full
table circuits, table/stool/furniture collisions, pause/focus, first-load delay,
six route/image-failure combinations and a save conflict during loading.

Existing tests retain their wallet/hand-lifetime/focus assertions. Only obsolete
placeholder collision paths/coordinates in floor and standalone-sprite tests
were retargeted to the actual artwork. Test-only routing feeds normal keyboard
events; it does not teleport or override physics, speed, wagers or settlement.

```sh
npx playwright test tests/lounge-visual.spec.js --workers=2
npx playwright test --workers=2
```

Review captures from the artwork journey:

- [Normal lounge](screenshots/blackjack-lounge.png)
- [Collision boundaries](screenshots/blackjack-lounge-collisions.png)
- [Owner at the table](screenshots/blackjack-lounge-table.png)
- [Owner at the return exit](screenshots/blackjack-lounge-exit.png)

The four PNGs are copied directly from the Playwright captures without image
editing. Mobile emulation produces the same four views in `test-results`.
Controls remain keyboard-based; physical-device performance and touch controls
are outside this visual phase.

## Changed files

Added: `floor/assets/lounge/blackjack-lounge.png`, `floor/lounge-layout.js`,
`tests/helpers/lounge-world.js`, `tests/lounge-visual.spec.js`, this report and
the final screenshot artifacts.

Modified: `floor/{room-config,room-scene,main}.js`, `floor/index.html`,
`floor/floor.css` (hide the debug button when its hidden attribute is set),
`world/main.js` (asynchronous readiness and active-scene debug controls),
`tests/floor.spec.js`, `tests/owner-sprite.spec.js` and the approved plan status.
The planned world/resort test changes were unnecessary; those suites pass
without edits. No dependencies or runtime upgrades were added.

## Follow-up — clicks blocked in a file-based integrated browser

The reported symptom was a fully rendered game still labelled “Loading the
table…”, with its iframe left inert. The user opened the title through VS Code's
integrated browser using a `file:///c%3A/.../index.html` URL. Both local-file hosts
reproduced this state before the correction. Local-file document and message
origins can serialize differently (`file://` or `null`), so HTTP-style origin
matching/targeting cannot complete that handshake reliably.

`blackjack/floor-bridge.js` now uses a wildcard message target only for local
files, verifies the readable local parent against the actual world/floor host
paths, and sends readiness immediately when initialized after DOMContentLoaded.
`floor/blackjack-overlay.js` still requires the exact iframe WindowProxy. On
file launches it also verifies the frame's actual readable blackjack URL and
`embed=floor` parameter; HTTP origin checks stay strict. Arbitrary opaque frames
and different local documents do not receive host-control permission.

The host probes readiness after frame load or a still-inert reopen, and the
bridge responds without navigating or reinitializing the game. This recovers
a missed initial signal while retaining the same mounted iframe and paid hand.
Only channel/type messages travel; no saved state or wallet data is sent.

`tests/blackjack-bridge.spec.js` adds ten desktop/mobile checks covering ordinary
file URLs, VS Code's encoded drive-letter form, real chip/Deal/Stand clicks,
single deduction/payout, retained paid hands, Escape/focus, late bridge startup,
a dropped readiness signal, and rejection of a different local document in the
same frame. Isolated test browsers permit local-file module access to emulate
the integrated browser; no product browser-security settings are changed.
The lounge test helper now resolves its layout import relative to the page so
the same keyboard journeys work under both HTTP and file URLs.

Verification on October 30, 2026: **108 passed, 0 failed** in 2.8 minutes across
the bridge, floor, world and resort suites on desktop and mobile. This includes
all ten new bridge checks. The earlier full 368-check result above describes the
visual integration; this bridge-only follow-up ran the relevant regression
suites. Command:

```sh
npx playwright test tests/blackjack-bridge.spec.js tests/floor.spec.js tests/world.spec.js tests/resort-lobby.spec.js --workers=2
```

Follow-up files: `blackjack/floor-bridge.js`, `floor/blackjack-overlay.js`,
`tests/blackjack-bridge.spec.js`, `tests/helpers/lounge-world.js` and this report.
No rules, payouts, saves, artwork, collision geometry or owner controls changed.
