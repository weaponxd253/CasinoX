# Phase 5B: reception queue and three visual guests

Phase 5C now uses this queue with continuous dynamic traffic in normal gameplay.
This document describes the retained fixed regression fixture, selected with
`?debug=1&trafficScenario=phase5b`. See [Phase 5C traffic](PHASE_5C_TRAFFIC.md)
for current production behavior and verification.

Three distinct guests enter once per world page load, queue for automatic visual
check-in, physically advance in arrival order and leave toward the hotel. The
hotel engine remains the sole business authority: no bookings, transactions,
occupancy, satisfaction, staffing, revenue, wallet or save fields are added.

## Approved configuration

Positions are radius-14 collision centers; sprite feet are center y+14.

| Purpose | World position |
| --- | --- |
| South entrance spawn | (520,548) |
| Service | (252,220) |
| Waiting 1 | (300,252) |
| Waiting 2 | (348,252) |
| Queue entrance | (340,300) |
| Departure clearance | (340,212) |
| Hotel destination | (856,314) |
| Existing owner approach | (206,242) → (206,220) |

The user approved this layout before implementation. Every marker is reachable
using unchanged geometry. Slot spacing is 57.69px and 48px. Waiting guests stay
above the main west fountain aisle; the owner's interaction point remains 46px
west of service.

Arrivals use (520,460), (340,460), (340,300), then their assigned slot, with
validated navigation around guests **and other guests' reserved slots**.
Departures use (340,212), (620,220), then the existing navigator around east
furniture to the hotel. Service remains locked until its guest physically reaches
the departure clearance waypoint.

| Guest / appearance ID | Eligible active time | Speed |
| --- | --- | --- |
| `casual-traveler` | 0ms | 85px/s |
| `business-traveler` | 4,000ms | 82px/s |
| `older-leisure-traveler` | 8,000ms | 88px/s |

`LOBBY_GUESTS` in `world/lobby-guests.js` configures appearances, arrival times and
speeds. `RECEPTION_QUEUE` configures slots/routes, 8,000ms service and 4px preferred
spacing. Overdue arrivals wait in scripted order if the entrance is occupied.
The unobstructed demonstration takes approximately 42–43 active seconds.

## Architecture and guarantees

- `GuestController` remains the single movement implementation. `goTo()` enables
  queue-controlled destinations and idle holds. The original autonomous Phase 5A
  stops and exported journey remain covered by their unchanged tests.
- `ReceptionQueueManager` owns FCFS ordering, one assigned slot per guest, source
  clearing guards, service eligibility/time and completion diagnostics. It never
  assigns positions, renders artwork, invokes hotel logic or writes saved data.
- `LobbyGuestTraffic` orchestrates the fixed scenario using the same production
  controllers/navigation in deterministic tests and the real scene.
- `LobbyGuests` connects active physics time, owner observations, existing scene
  lifecycle events, the shared `NpcSprite` renderer and collision debug drawing.
- `guest-appearances.js` separates appearance from behavior. The two attached
  sources are preserved byte for byte; normalized sheets retain all pixels with
  alpha at least 32, without resampling/redrawing. Each has sixteen 256×384 frames,
  baseline 368, down/left/right/up rows, 48×72 display and nearest-neighbor filtering.
  Bounds/hashes/rebuild notes live in each asset directory.
- `lobby-depth.js` applies the same foot-height ordering to all guests. Owner
  depth, stationary receptionist and dealer rendering remain unchanged.

States: ARRIVING, APPROACHING_QUEUE, WAITING, ADVANCING, BEING_SERVED, DEPARTING,
COMPLETED. Service begins only when physically at its anchor. A displaced service
guest retains its reservation and pauses its service clock until it returns.
Expiry authorizes departure; the service slot is freed after physical clearance.
Waiting slots also remain unavailable while the former occupant clears them.
Completion frees reservations, destroys visuals and excludes the guest from
active traffic. Read-only completion history prevents same-page respawn.

Every movement substep is at most 1px and checked against static geometry, owner,
peer footprints and prior/current peer positions. Departing guests have priority
over advancing guests; other priority follows arrival order. Lower-priority
opposing traffic chooses a consistent passing side. Blocked routes replan at most
once per active second. Temporary blockers never mutate cached navigation.

Owner priority uses existing predictive yielding and the last-resort swept contact
guard. Multiple guards keep the nearest forward limit on the attempted owner
step. Increasing-clearance retreat is permitted from a small contact-margin
deficit. Controls, speed, sprite, body and static collision resolution are unchanged.

Pause/sleep freezes movement, animation, arrivals, service and reservations.
Resume/wake continues the same instances. The existing receptionist E conversation
still pauses the lobby; guests never open owner dialogue automatically. Reload
restarts only this transient scenario. World-save version 2 is unchanged.

## Diagnostics and manual review

Open `/world/index.html?debug=1&collisions=1` or use the collision button. The overlay
shows guest IDs/states/destinations, paths, reservations, footprints, service time,
blocked duration, replans, queue order and service/waiting markers.
`CasinoWorldDebug.snapshot().guestTraffic` exposes collection/queue diagnostics;
`.guest` retains the first-traveler view. Both are read-only.

1. Observe staggered arrivals, service plus two waiting guests, then physical advances.
2. Stand west of service and press E; guest progress freezes until dialogue closes.
3. Walk into the line and retreat; guests yield and resume without losing order.
4. Visit Blackjack Lounge with the line present and return; reservations and
   remaining service continue without duplicate guests.
5. Observe each hotel departure. Guests do not respawn until page reload.

## Verification and captures

Pre-change baseline: **444 passed, one worker, 12.8 minutes**, completed before
source edits and user approval. Locked npm dependencies and Chromium were initially
missing. An interrupted attempt also exposed Windows Python serving `.js` as
`text/plain`; a temporary server explicitly serving JavaScript resolved those
readiness failures without registry or repository configuration changes.
The completed baseline had zero failures, skips or flakes.

Focused regression: **62 passed in 4.2 minutes**, one worker, across desktop and
mobile. A final contact refinement and its new regression then passed **12
targeted cases in 5.2 seconds**, also covering both projects.

Final complete suite: **478 passed in 15.8 minutes (946.987 seconds), one worker**:
239 desktop and 239 mobile, comprising all 444 existing cases plus 34 new cases.
Zero failures, flaky results, skips or resource-related interruptions occurred.
No isolated retries are included in that full-suite result. `git diff --check`
passes. The protected hotel/casino/wallet/save/geometry/owner/receptionist/dealer
files and the existing NPC renderer have no changes from the pre-change baseline.
Raw final results are in `.npm-cache/phase5b-full-results.json` and the corresponding
run log is `.npm-cache/phase5b-full.log` (ignored local verification output).

One early dedicated run caught a functional reservation violation: an arrival
crossed another guest's reserved, not-yet-occupied slot. The real-time journey had
no physical overlaps, but the reservation rule failed. Request-local reservation
blockers fixed it; the subsequent dedicated desktop run passed all 15 cases then
present. This was a functional fix, not a resource failure or an isolated retry
being counted as a full-suite pass.

A later targeted stress audit found that yielding to another guest could choose
a sidestep into a nearby stationary owner. Peer-yield candidates now also validate
the owner's footprint. The dedicated stationary-owner regression and existing
pursuit, retreat, opposing-traffic and service checks passed after that fix.

Actual Phaser captures under `docs/screenshots/`:

- [First guest receiving service](screenshots/queue-first-service.png)
- [Two guests waiting](screenshots/queue-two-waiting.png)
- [All three guests at their positions](screenshots/queue-all-three.png)
- [Second guest physically advancing](screenshots/queue-second-advancing.png)
- [Owner standing near the queue](screenshots/queue-owner-access.png)
- [Queue markers, footprints and paths in debug view](screenshots/queue-debug.png)

The full [44-second real-time recording](recordings/reception-queue.webm) is
1280×1000 at 25fps and includes all three completions. Actors and clocks are not
modified for captures. All six final screenshots were visually inspected.

```powershell
npx playwright test tests/guest-navigation.spec.js tests/guest-journey.spec.js tests/guest-capture.spec.js tests/reception-queue.spec.js tests/reception-queue-capture.spec.js --workers=1
npx playwright test --workers=1
```

On Windows hosts whose registry maps `.js` to `text/plain`, start this server
first; Playwright reuses it without changing application code or machine settings:

```powershell
python -c "import http.server; http.server.SimpleHTTPRequestHandler.extensions_map['.js']='application/javascript'; http.server.test(HandlerClass=http.server.SimpleHTTPRequestHandler,port=4173,bind='127.0.0.1')"
```

This is a fixed visual scenario without Phase 5C traffic or guest persistence.
An owner deliberately occupying a required anchor can delay the demonstration;
clearing the obstruction resumes it without teleporting or skipping guests.
