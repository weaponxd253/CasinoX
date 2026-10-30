# Phase 5A: one Casual Traveler

One visual-only guest completes one journey per world page load. No reservations,
hotel guests, room assignments, transactions, satisfaction changes or world-save
fields are created. Phaser remains 3.90.0; hotel and casino authorities are unchanged.

## Journey and configuration

`world/lobby-guests.js` owns the appearance-independent journey configuration:

- Spawn center (520, 548), only when clear of the owner's footprint/approach.
- Walk at **85 world pixels/second**, independent of owner speed. Speed and radius
  are configurable; the guest's logical collision radius is 14px.
- Use the west aisle via (520, 460), (340, 460), (340, 240), then reception (252, 220).
- Face up and idle for **8,000 active milliseconds** at reception. The normal owner
  approach (206, 220) is 46px away, exceeding the required 28px center separation.
- Walk via the upper lobby toward the east hotel entrance at (856, 314), then
  destroy the guest's render objects. There is no automatic respawn.

With the owner stationary at the normal lobby spawn, the geometry simulation
completes in approximately 23.2 active seconds. Blocking or scene suspension
extends that duration. Reload starts a new cosmetic journey; leaving the world
page through management navigation also creates a new page load on return.

## Architecture and safety

`GuestController` is a reusable kinematic behavior component receiving geometry
callbacks and owner observations. `CasualTravelerSprite` supplies appearance;
the shared NPC renderer supplies validated assets, animations and fallback.
Route movement is validated in steps of at most 1px; yielding segments are also
checked against geometry. Neither exceeds the configured walking budget.
Animation direction derives from actual displacement. Waiting and
scene suspension stop walking and select the first frame for the current direction.

The existing cached lobby navigation remains authoritative for static geometry.
Guest path requests filter transient owner blockers without modifying cached
nodes. Shortcuts are checked against the same collision geometry. Blocked routes
are retried at most once per second; two blocked active seconds flag the guest
as stuck. It waits or yields, with no teleport-based recovery.

The guest predicts the owner's path and sidesteps first. At the user's explicit
approval, a last-resort contact guard clips only attempted forward owner travel
when continuous guest yielding cannot avoid contact. It never pushes the owner
backwards, changes controls/body size/speed, or replaces the existing static
collision resolver. This guard checks the guest's swept footprint; outside guest
contact the original owner collision behavior is untouched.

The component advances on lobby physics steps. Scene pause/sleep freezes the
position, route and remaining reception wait; resume/wake continues the same
instance. Completion is retained until page reload. A missing, invalid or stalled
traveler asset uses a cosmetic fallback. This optional asset gets one five-second
load attempt; dealer and receptionist loading policies are unchanged.
No independent wall timer,
hotel simulation, global event queue or guest save authority is introduced.

Lobby foreground depths are relative to the unchanged owner depth 10 and each
actor's feet. The receptionist stays below the original counter mask. The dealer
and lounge rendering paths are not changed.

## Debugging and manual check

Open `/world/index.html?debug=1&collisions=1`, or use Toggle collision debug.
The overlay shows the guest's destination, currently validated route, radius-14
footprint, behavior, blocked duration, stuck flag, replan count and contact holds.
`CasinoWorldDebug.snapshot().guest` is read-only and exposes the same diagnostics.

1. Continue the resort and watch the guest enter near the south carpet.
2. Approach the guest's route: it yields while owner controls and E remain usable.
3. At reception, stand at (206, 220) and open the usual dialogue. The guest and its
   remaining wait pause; Escape restores focus and resumes them.
4. Enter the casino/hotel and return. The same journey resumes at its prior spot.
5. Watch the guest leave for the hotel. It despawns once and does not loop.

## Verification

Fresh pre-change baseline: **414 passed, one worker, 14.8 minutes**, with no
resource-related failures. Focused checks: **40 passed (2.0m)** plus **2 stalled
asset checks passed (15.3s)**, using one worker. The full post-change suite passed
**444 tests in 16.4 minutes with one worker**: the existing 414 plus 30 new cases.
The final navigation/contact checks also passed all **12 cases** after adding
the conservative clipping-margin validation. No resource-related failures
occurred in the fresh baseline or final verification runs.

During implementation, focused tests caught and verified fixes for a contact
guard interfering with existing static sliding, and a recording assertion that
sampled the reception wait too late. The asset timeout test also caught Phaser's
default retries; only the traveler now gets one five-second attempt. These were
implementation/test issues, not resource-related failures.

Tests cover retained sprite pixels, all four walking
animations, idle frames, geometry, owner avoidance/contact, reception access,
eight active seconds, pauses, sleep/wake, iframe behavior, fallback assets,
safe despawn, unchanged saves and existing owner routes.

A before/after SHA-256 comparison of all 171 preexisting workspace files
confirmed changes only to the six existing files listed below. Earlier
uncommitted dealer work and all protected game/save/economy/art files were
preserved. `git diff --check` passed.

Reviewed captures:

- `docs/screenshots/traveler-entering.png`
- `docs/screenshots/traveler-reception.png`
- `docs/screenshots/traveler-hotel.png`
- `docs/screenshots/traveler-debug.png`
- `docs/recordings/traveler-journey.webm` (native Playwright recording, about 27s).

## Files

Existing files changed:

- `world/npc-sprite.js`: optional movement synchronization, visibility and cleanup;
  stationary receptionist/dealer defaults remain intact.
- `world/lobby-navigation.js`: optional transient blockers and validated smoothing;
  existing default path and migration calls are preserved.
- `world/lobby-scene.js`: guest preload/lifecycle, post-physics depth and debug drawing.
- `world/main.js`: read-only guest diagnostics.
- `tests/lobby-visual.spec.js`, `tests/receptionist-sprite.spec.js`: depth-order
  assertions reflect shared ordering; existing canvas pixel checks remain.

Added:

- `world/guest-controller.js`, `world/lobby-guests.js`, `world/lobby-depth.js`,
  `world/casual-traveler-sprite.js`.
- `scripts/prepare-casual-traveler-sprite.py`.
- `world/assets/guests/casual-traveler/`: original PNG, runtime PNG, frame manifest,
  asset documentation.
- `tests/guest-navigation.spec.js`, `tests/guest-journey.spec.js`,
  `tests/guest-capture.spec.js`, `tests/helpers/guest-world.js`.
- This document and reviewed journey screenshots/recording under `docs/`.

## Limitations

This is one cosmetic traveler, not an actual hotel guest or queue. Owner blocking
can delay spawn, reception or arrival indefinitely; the guest does not skip a
stop or teleport to finish. In a forced contact with no yielding space, the
approved contact guard may briefly stop an attempted owner step. No crowd,
continuous spawning, occupancy integration or new minigame behavior is included.
The existing blackjack hard-reload hand-loss behavior remains unchanged.
