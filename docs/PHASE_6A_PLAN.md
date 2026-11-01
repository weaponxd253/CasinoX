# Phase 6A — Main Casino Floor architecture and implementation plan

Status: implemented; this file retains the original planning audit and its
historical baseline. See [final implementation and verification](PHASE_6A_IMPLEMENTATION.md)
for the shipped behavior, subsequent checks and evidence.
The new floor is the middle room in **CentralLobby ↔ MainCasinoFloor ↔ CasinoRoom**.
`CasinoRoom` remains the existing Blackjack Lounge scene ID; its standalone
`floor/index.html` entry and blackjack overlay remain supported.

## Repository audit

Inspected `world/main.js`, `lobby-scene.js`, `explorable-scene.js`,
`lobby-config.js`, `lobby-layout.js`, `lobby-navigation.js`, `lobby-depth.js`,
`owner-controller.js`, `interaction-system.js`, `interactables.js`,
`collision-geometry.js`, `world-state.js`, `hotel-scene.js`, and
`floor/main.js`, `room-scene.js`, `room-config.js`, `lounge-layout.js`.
The Phase 5E verification report records 672 passed tests. This planning pass ran
a fresh full baseline; its one intermittent mobile timeout is recorded below.

Important existing contracts:

- Logical canvas 960×600; both room PNGs are 1536×1024, rendered at (30,0),
  900×600. Scale is exactly 75/128 = 0.5859375, with no aspect distortion.
- Owner speed 190 logical pixels/second, circular collision radius 14,
  normalized diagonal velocity, existing four-direction animations and feet
  anchoring. Reuse OwnerController/OwnerSprite without changing these values.
- LobbyScene extends ExplorableScene. CasinoRoom independently implements the
  same owner/interaction conventions, plus dealer, table depth and blackjack.
  Do not refactor the working lounge into a new base class during this phase.
- Existing doors require E or the interaction button. InteractionSystem rejects
  key repeats and has a 250ms lock. The host adds a transition lock as well.
- There is no general room navigation graph today. `enterRoom` only accepts
  travel from CentralLobby to CasinoRoom/HotelInterior; all return/back actions
  call `returnToLobby`. One `returnPosition` cannot represent a two-edge journey.
- `lobby-navigation.js` is the lobby's cached, radius-aware navigation grid, not
  a room-transition graph. Preserve it and its Phase 5 traffic behavior.
- Version 2 persists only the lobby checkpoint in `casinoWorldState`:
  `{version:2, layout:'luxury-lobby-1', lobby:{x,y,facing,...}, updatedAt,...}`.
  It stores no active room ID or interior position. Unknown metadata and v1
  migration receipts are preserved; cross-tab stale writes are rejected.
- Reload/Continue currently starts in the Central Lobby, even after an interior
  visit. Preserve that contract. Do not save MainCasinoFloor coordinates into
  `state.lobby`, add a persisted room field, or change the version/layout ID.
- The blackjack iframe remains mounted during same-page room visits. Preserve
  its hand, wallet, overlay pause/resume, dealer state and unload warning.

## Artwork availability and visual continuity

The supplied attachment is a clean, UI-free **1536×1024 PNG**, 3,362,962 bytes.
SHA-256: `143498d10180471a83e1a7eef4bbf89dc40fe7bc45f3f2e7011932fc85e6ca0b`.
It contains the required north/south central stairs, roulette, five slot cabinets,
stools, decorative furniture and coin kiosk. There is no Main Casino Floor asset
installed in the repository: the only existing room-size assets found are the
Central Lobby and Blackjack Lounge. The provided attachment supplies the missing
repository asset; no generated replacement or repaint is proposed.

During implementation, copy these exact bytes to
`world/assets/casino/main-casino-floor.png`, validate dimensions/hash, and retain
the source. The planning artifact bundle retains a byte-identical reference copy.
Fail visibly on missing/wrong-size art; preserve saved data instead of silently
substituting another room or fabricating artwork.

All three rooms share centerline source x=768 / logical x=480, red carpet, amber
lighting and green/gold furniture. Lobby north stairs lead into the new floor's
south stairs; its north stairs lead into the lounge's south entrance. The lounge
has an open south threshold, not a north exit. No lounge wall opening is needed.
This is continuity across scene cuts, not a claim that different room edges can
be stitched into a pixel-perfect scrolling map. Preserve source orientation and
nearest-neighbor filtering; do not flip, crop or stretch art to force a seam.

## Proposed scene and route architecture

Add `MainCasinoFloorScene extends ExplorableScene` with scene key
`MainCasinoFloor`. Put source-space art geometry in `main-casino-layout.js` and
logical room configuration in `main-casino-config.js`. Keep preload/dimension
validation, static bodies, footprint-contact correction, foreground masks and
debug drawing scoped to this scene. Follow LobbyScene's proven setup, including
`worldstep` correction and shutdown cleanup. Do not instantiate LobbyGuests,
GuestTrafficController, dealer NPCs, HotelState or HotelEngine in the new room.

Add a small pure `room-routes.js` definition for directed portal edges, destination
entry keys, labels and valid return destinations. The host owns actual scene
activation and overlays. Layout/config/route modules must not import scene classes
or main.js, avoiding cycles through ExplorableScene → INTERACTABLES.

| Edge | Activation | Destination entry |
| --- | --- | --- |
| CentralLobby → MainCasinoFloor | Existing north `casino` anchor; label becomes Enter Main Casino Floor | Main south spawn |
| MainCasinoFloor → CentralLobby | New south portal | Exact saved lobby departure checkpoint |
| MainCasinoFloor → CasinoRoom | New north portal | Existing lounge spawn (480,480), facing up |
| CasinoRoom → MainCasinoFloor | Existing lounge south exit | Main north spawn, facing down |
| CentralLobby ↔ HotelInterior | Existing route | Existing checkpoint/return behavior |

Keep the existing lobby interaction ID `casino` for compatibility, change its
destination/label, and add Main room portal definitions. Preserve CasinoRoom's
scene ID and `blackjack` ID. Its `lobby` exit ID may be retained for compatibility,
but label/destination must be supplied by world-host context: Main Casino Floor
in the owner world, unchanged existing behavior in the standalone floor host.
Do not change ROOM.spawn/table/exit coordinates or dealer/table mechanics.

Replace the hard-coded host scene lookup with a registry, and replace the one
returnPosition assumption with **transient per-room departure poses and explicit
edge destinations**. This is not persisted navigation history. For the lounge
round trip, save the Main departure pose for diagnostics, but return at the safe
north arrival spawn so the owner does not land inside the reverse doorway.
For the lobby, preserve exact checkpoint return and facing as existing tests expect.

Make activation a staged operation: validate edge and target entry first; stop
movement; persist the lobby checkpoint when necessary; sleep the source; prepare
the destination entry; run/wake it; restore the validated entry after owner
creation on first load or before accepting input on wake; then focus and arm
interaction. Handle asset/create failure without overwriting saves or resuming
an invalid scene. Preserve CasinoRoom's zero-argument onReady adapter.

Back/Esc/toolbar behavior follows room depth: lounge → Main floor → Lobby;
HotelInterior → Lobby; overlays/dialogue close first. M still opens management.
Update location/status/accessibility labels, return-button text and debug snapshot
scene lookup from the same registry. Keep standalone floor/main.js host callbacks
optional; a standalone lounge must not acquire an exit into an absent world scene.

No automatic overlap transitions. Keep E/button activation, 250ms locks, ignored
repeat events and reset movement keys. Require release then a fresh activation
after transition. Main and lounge arrival points sit outside the reverse portal's
eligibility volume. A fresh deliberate E from the restored lobby checkpoint may
re-enter, preserving existing behavior; a held key must not bounce rooms.

## Coordinates and portals

All source rectangles below use **left, top, right, bottom**, not center-size.
All positions describe the owner's circular body center; feet render 14 logical
pixels below that. Convert with `worldX = 30 + sourceX*75/128`,
`worldY = sourceY*75/128`. Keep full precision in configuration.

| Main floor portal | Source rectangle | Logical center; width×height | Interaction reach |
| --- | --- | --- | --- |
| South → Lobby | (712,950,824,1004) | (480,572.4609375); 65.625×31.640625 | 18 logical px |
| North → Lounge | (712,112,824,148) | (480,76.171875); 65.625×21.09375 | 18 logical px |

| Purpose | Source center | Logical center | Facing |
| --- | --- | --- | --- |
| Arrive from Lobby | (768,868) | (480,508.59375) | Up |
| South eligible approach | (768,930) | (480,544.921875) | Down |
| Arrive from lounge | (768,240) | (480,140.625) | Down |
| North eligible approach | (768,176) | (480,103.125) | Up |
| Enter lounge | Existing ROOM.spawn | (480,480) | Up |
| Lounge return approach | Existing ROOM.exit | (480,535), reach 44 | Down |
| Return to Lobby | Existing departure checkpoint | Exact stored x/y | Exact stored facing |

The existing lobby north interaction remains source center (768,270), size
130×50, reach 30 logical. Its current collision threshold remains unchanged.
The lounge spawn is 55 logical pixels from its exit center and outside its
44-pixel eligibility radius. Main south/north spawns are respectively over
48/53 logical pixels beyond the nearest portal rectangle edge, outside reach
18 even allowing the body radius. Both planned approach points are eligible.

These are exact **proposed** coordinates, not runtime-calibrated final geometry.
The source-space draft and numerical clearance results accompany this plan.

## Collision draft and circulation

Use the existing shared rect/circle/polygonStrips helpers and static Arcade
bodies, plus constrainFootprintMovement after physics. Do not change the owner's
physics, global collision helper or existing room geometry. Source-image rugs,
gold floor borders, stair treads and plant fronds are not solid footprints.
Use small pot bases and separate foreground silhouettes for tall plants.

The complete machine-readable draft contains 51 source-space primitives, plus
two logical black-margin guards at center (15,300) / (945,300), size 30×600:

| Group | Source footprint proposal |
| --- | --- |
| North walls | Rects (0,0,688,214), (848,0,1536,214), preserving central opening |
| North exit boundary | (688,0,848,88), stopping overshoot beyond the active north stairs; no painted wall/mask added |
| Side walls | (0,214,65,666), (1471,214,1536,666); logical black side margins also blocked |
| Lower side-wall returns | (0,666,112,820), (1438,666,1536,820) |
| South wings | (0,820,280,1024), (1256,820,1536,1024) |
| South planted beds | (474,880,650,1024), (886,880,1062,1024) |
| Decorative side-stair ends | (280,980,650,1024), (886,980,1256,1024); no side-stair portals |
| South columns | (578,824,640,980), (896,824,958,980) |
| Middle lamp columns | (616,446,664,550), (872,446,920,550) |
| Roulette east lamp base | (528,560,570,666) |
| Low decorative furniture clusters | (112,696,264,820), (1336,696,1438,820), conservative until contact QA |
| Roulette body | Polygon (128,368),(446,368),(481,396),(486,452),(448,488),(150,488),(106,453),(106,410) |
| Roulette stools | Radius 24 at (176,514),(258,520),(337,520),(418,520),(500,459),(181,350) |
| Five slot footprints | For x=1100,1174,1248,1322,1396: rect (x−33,360,x+33,416) |
| Five slot stools | Same x values, y=445, radius 24 |
| Coin kiosk plinth | Polygon (1160,560),(1280,560),(1332,601),(1332,670),(1280,714),(1160,714),(1116,670),(1116,601) |
| Pots | (x,y,r): (628,200,28),(908,200,28),(636,418,28),(898,418,28),(252,327,25),(496,326,25),(1054,552,22),(1338,735,27),(500,620,27),(121,190,26),(1450,190,26),(56,640,32),(1490,640,32) |

Audit remaining perimeter lamps/seats against the wall bands during implementation;
do not treat this visual trace as proof every painted edge has physical contact.
Split furniture clusters into individual footprints where a visible usable gap
exists. Do not invent a walkable gap between adjacent stools/cabinets when it
cannot fit the radius-14 body.

Reserve these source-space approach polylines:

- Central: (768,930) → (768,868) → (768,740) → (768,300) → (768,240) → (768,176).
- West upper: central (768,300) → (576,300) → (576,420).
- West lower: central (768,740) → (304,740) → roulette approach (304,584).
- East slots: central (768,300) → (980,300) → (980,500) → slots approach (1248,500).
- East kiosk: central (768,740) → (1000,740) → kiosk approach (1068,644).

The central painted passage is roughly 94 logical pixels wide at its narrow
160-source-pixel section, enough for future paired traffic with body/spacing
validation. Side approaches include narrower single-file areas; do not promise
two-way NPC passing everywhere. Reserve holding/passing space at the cross-aisles
for Phase 6C. In particular, do not route through the narrow gap beside the
roulette east lamp/middle column; use the north or south cross-aisle.

A planning-only check sampled each segment at at most one logical pixel using
the current clearOf/polygonStrips code and radius **14.25**. All five polylines,
both spawns, both portal approaches and three anchors pass against this draft.
This is static numerical verification, not a Phaser physics, visual-mask or
future NPC traffic test. Implementation must add radius-aware grid connectivity,
swept contacts, corner pressure and actual keyboard-walking verification.

Future metadata-only anchors: roulette source (304,584) → logical
(208.125,342.1875); slots (1248,500) → (761.25,292.96875); coin kiosk
(1068,644) → (655.78125,377.34375). Do not register active game actions, unlock
checks, transactions or iframe launches for these in 6A. No casino NPC spawns,
queue reservations or movement schedules until 6C.

## Rendering and foreground masks

Keep Phaser.CANVAS, FIT scaling, original owner frames/scale and nearest filtering.
Base art depth 0; owner depth 10; debug overlay depth 100. Use masked copies of
the identical PNG for foregrounds, with feet-based ordering as in lobby-depth.
Masks are source-space polygons converted by the same transform, with no repainted
or independently resized foreground assets.

Trace roulette rail/table (baseline around source y=488), each roulette stool
(its center y+24), each cabinet silhouette (baseline 416), slot stools (469),
coin sculpture/plinth (714), middle columns (550), south columns (980) and visible
palm fronds (their own pot-base baselines). Exact silhouette polygons require
implementation visual QA; the collision footprint is not a rectangular mask of
the entire rug. Test owner behind and in front of each mask with feet thresholds,
including near lamp stems, coin silhouette, chair backs and cabinet gaps.
Destroy mask graphics, masks and scene listeners on shutdown.

## Save, lifecycle and scope safeguards

Keep WorldState v2 and its current validator unchanged. Continue persisting the
lobby checkpoint before leaving and when navigating to management/title. While
away, do not replace it with current-room coordinates. Reload/Continue resumes
that lobby checkpoint. Preserve unknown metadata, migration receipts, original
corrupt payloads and cross-tab compare-before-write protection. If persisted
interior continuation is desired later, it needs a separately designed schema;
it is not part of 6A.

Sleep/wake existing scenes, rather than reconstructing them on every crossing.
Lobby NPC identities, queue/service progress, bubbles and active clock remain
frozen while away. The Phase 5E wake refresh still runs before subsequent lobby
admissions. Blackjack hand state stays in the existing iframe and is not serialized,
refunded, restarted or settled by navigation. No new hotel/wallet dependencies.

## Implementation milestones and acceptance gates

1. **Baseline/asset gate:** fresh full desktop/mobile run with one worker, preserve
   reports/evidence and source hashes; confirm attachment bytes/dimensions. Copy
   supplied art only after the implementation work begins.
2. **Geometry/config gate:** pure layout/config and radius-aware walkability;
   verify spawns, approaches, all anchored areas connected to central route,
   boundary margins, swept segments and awkward collision corners.
3. **Scene/render gate:** MainCasinoFloorScene, source validation, masks, shared
   owner, debug bodies/portals/spawns/route guides/IDs. Verify animation directions,
   190 speed, normalized diagonals, radius14 and feet/depth behavior. No NPCs/games.
4. **Navigation gate:** explicit bidirectional edges, cold-create and warm-wake
   arrival handling, correct back/toolbar/context labels, E repeat/focus locks and
   precise lobby checkpoint. Preserve standalone lounge host and original scene ID.
5. **Integration gate:** traverse Lobby → Main → Lounge → Main → Lobby through
   actual input; visit Hotel/management from relevant rooms; retain blackjack
   hand/payout and lobby guests during repeated visits; check cleanup and saves.
6. **Regression/evidence gate:** full single-worker desktop/mobile suite after
   implementation, focused failure/missing-asset/corrupt-save tests, source/financial
   byte audits, screenshots/movement recordings for each connection and masks.

Existing tests expecting Lobby → CasinoRoom must be updated explicitly to walk
through MainCasinoFloor; do not hide the new route behind a legacy debug bypass.
Standalone floor tests retain their current route. Preserve old collision,
financial, hand-persistence and Phase 5 assertions rather than relaxing them.

Proposed new tests: main-casino-geometry, main-casino-transitions,
main-casino-lifecycle, main-casino-capture. Cover both directions of both edges;
held/repeated E and movement keys; fresh button clicks; spawn clearance; deliberate
re-entry; cold/failed asset load; repeated loops without duplicate objects/listeners;
Esc and toolbar returning to the correct adjacent room; management navigation,
reload/Continue from each room, v1 migration and v2 unknown metadata, stale-tab
and corrupt-save rejection; bank balance/profile/hotel/guest-pool preservation;
existing blackjack hand completion after room travel; Phase 5E paused/resumed
traffic/service/dialogue/refresh at six/eight configured caps. No 6C traffic tests
are represented as implemented casino NPCs.

## Expected file scope

Add: `world/main-casino-scene.js`, `world/main-casino-layout.js`,
`world/main-casino-config.js`, `world/room-routes.js`,
`world/assets/casino/main-casino-floor.png`,
`tests/main-casino-geometry.spec.js`, `tests/main-casino-transitions.spec.js`,
`tests/main-casino-lifecycle.spec.js`, `tests/main-casino-capture.spec.js`,
`tests/helpers/main-casino-world.js`, and implementation documentation/evidence.

Modify narrowly: world/main.js host/registry/navigation/debug snapshot;
world/interactables.js portal actions/context labels; floor/room-scene.js only
if required for contextual exit/debug labeling; world/dialogue.js and world/index.html
only where existing destination/help wording becomes inaccurate; affected route
test helpers and assertions. Review and prefer host-only changes where possible.

Protect: OwnerController/OwnerSprite and their assets, collision algorithms,
lobby layout/navigation and guest systems, hotel state/engine/economics/selectors,
wallet, blackjack/minigame code and overlay transaction logic, world save schema,
all prior uncommitted work and evidence. No 6B game integration or 6C traffic.

## Baseline result

Fresh one-worker full desktop/mobile baseline: **671 passed, 1 failed**, no skips
or automatic retries; duration **46 minutes 7 seconds**, starting
2026-10-31T22:01:50.682Z. The failed case was the existing mobile
`full-page management return reads an actual Eli assignment as thin coverage and
starts a fresh transient population` test. It timed out at its five-second
initial `stats.created > 0` wait, before the management/return assertions.
Its **unchanged isolated mobile rerun passed**. This indicates an intermittent
arrival/readiness test condition, not proof of a particular root cause.

This is **not a clean full 672-pass baseline**. Before implementing 6A, investigate
the test's browser foreground/readiness and active traffic clock versus its
five-second wall-clock wait, make any justified test correction separately,
then rerun the complete one-worker suite. Do not relax traffic/financial/return
assertions or attribute this pre-existing failure to unimplemented 6A code.

All **323 starting tracked/untracked input files are byte-identical** after this
planning pass. No application or existing test code was changed. Both the full
failure report/artifacts and isolated rerun are preserved; no failed attempt was
hidden by reporting the rerun as a clean full suite.

Supporting files:

- [Baseline summary and failure details](phase6a-baseline.json).
- [51-primitive source-space layout draft and logical margins](phase6a-layout-draft.json).
- [Static clearance/portal eligibility results](phase6a-geometry-check.json).

The draft check reports zero blocked samples across 1,612 route samples, clear
spawns/approaches/anchors, eligible approach points and ineligible reverse portals
at both arrival spawns. These checks include the north exit boundary and lower
side-wall returns. They do not replace in-engine contact and mask QA.
