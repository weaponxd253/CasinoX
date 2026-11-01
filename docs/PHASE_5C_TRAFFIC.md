# Phase 5C — dynamic guest traffic

Phase 5D extends this traffic system with eight appearances, five independent
personalities and ambient dialogue. See [Phase 5D behavior and verification](PHASE_5D_VARIETY.md).
This document retains the original Phase 5C baseline and implementation history.

The Central Lobby now starts quiet and continues receiving independent visual
guests throughout a page load. Each visitor has a purpose, runtime identity and
finite journey. No hotel records, bookings, occupancy, cash, satisfaction, staffing,
wallet values, wagers or world-save fields are read or changed by traffic.

## Configuration

`world/guest-traffic-config.js` centralizes the production defaults:

| Setting | Default |
| --- | --- |
| Arrival interval | 15–30 active seconds, freshly sampled after each actual arrival |
| Maximum visible guests | 6 |
| Configurable hard cap | 8; visible and moving limits are clamped to configured limits |
| Maximum actually moving guests per physics step | 4, including yielding and queue advances |
| Walking speed | 78–92 world pixels/second |
| Reception | Existing 3 positions and 8 active seconds of service |
| Relaxing duration | 10–25 eligible active seconds |
| Relaxing exit | 50% hotel / 50% south |
| Pending arrivals | At most one uncommitted descriptor |
| Recent history | At most 64 records per history; lifetime counters retained |

All timers follow lobby physics time. An occupied entrance, movement budget or
population limit delays one pending arrival without duplicate actors, accumulated
invisible guests or catch-up bursts. Departure does not trigger an immediate
replacement. Runtime IDs (`guest-000001`, etc.) are independent of appearance IDs
and never reused during the page load.

| Purpose | Nominal weight | Journey |
| --- | --- | --- |
| Hotel check-in | 40% | South → existing reception queue/service → hotel |
| Casino visitor | 30% | South → a validated fountain-side route → northern staircase |
| Relaxing guest | 15% | South → a reserved standing idle point → hotel or south |
| Departing hotel guest | 15% | Hotel-side entrance → lobby → south |

Weights are normalized among currently admissible purposes. A full reception
line excludes new check-in admission while unrelated visitors can continue.
Occupied idle positions and the hotel passage similarly constrain admission.
The 15–30 second defaults generally produce a quiet lobby; six is a ceiling,
not a constant population target.

## Approved geometry

All coordinates are radius-14 collision centers; sprite feet remain center y+14.

| Location | Coordinate |
| --- | --- |
| South arrival / departure | (520,548) / (480,548) |
| South arrival / departure approach | (520,460) / (480,460) |
| Hotel-side departure spawn | (856,350) |
| Hotel arrival/despawn | (856,314) |
| Casino staircase approach/despawn | (480,174) |
| West seating idle, facing left | (286,344) |
| East seating idle, facing right | (626,350) |
| West / east lower route guides | (340,460) / (620,460) |
| Reception service | (252,220) |
| Reception waiting positions | (300,252), (348,252) |
| Reception entrance / required departure clearance | (340,300) / (340,212) |

The owner keeps the existing receptionist interaction point (206,220) and hotel
interaction point (856,314). The hotel-side spawn lies beyond the hotel's reach
rectangle and still waits if any owner/guest footprint or predicted movement
makes it unsafe. No static collision shapes or cached navigation nodes changed.

## Shared architecture

- `GuestTrafficController` generalizes the former Phase 5B orchestration. It owns
  arrivals, admission, appearance/purpose choice, finite journey state, active
  population, movement permits, idle reservations, cleanup and read-only diagnostics.
- `GuestController` remains the only mover. Every displacement uses its existing
  bounded, checked substeps, directional animation intent, owner avoidance and peer
  passing. A movement-permission input limits displacement without stopping the
  traffic/service/idle clocks. Held guests remain physical obstacles.
- `ReceptionQueueManager` remains the only reception authority. FCFS assignment,
  unique reservations, physical service arrival and source/departure clearing are
  retained. It can consult traffic about a safe departure without creating another
  check-in queue. Eight seconds of service may be followed by a stationary wait
  for a blocked departure route; the completed service is not restarted.
- `LobbyGuests` remains the scene/visual adapter. It handles one worldstep listener,
  existing pause/sleep/wake/resume events, dynamic visual creation/destruction and
  the collision overlay. Existing lobby depth logic already supports the collection.
- `NpcSprite` remains unchanged. The appearance registry now provides IDs, URLs,
  texture keys, frame mappings, scale, foot anchoring and tags. It loads entries
  generically, so compatible Phase 5D artwork needs a registry entry rather than
  traffic or queue rewrites. No existing character pixels were modified.

Appearance choice avoids the last arrival's appearance when alternatives exist
and penalizes adjacent queue duplicates and nearby matching guests. Purpose,
speed, idle time and route selection remain separate from appearance. Instances
are named with runtime IDs; textures and animation definitions are shared.

## Congestion and recovery

Movement permits cap actual frame displacement at four guests. Owner-threatened
guests receive priority, then reception clearance/advancement, then stable permits
with aging/fairness. Sustained blockers yield permits and probe routes at bounded
intervals rather than starving other traffic. Owner travel retains the existing
static resolver, predictive guest yielding and last-resort contact guard; valid
retreat remains available and guest handling cannot lengthen the attempted owner
step.

Blocked actors retain geometry-valid directional intent so opposing guests can
yield even while the blocked actor is waiting for its next movement permit.
Traffic route guides may be bypassed through a newly validated path when occupied;
the actual destination is never skipped. The reception departure-clearance point
is explicitly required and cannot be bypassed. An occupied endpoint may allow a
guest to approach a nearby clear point; it still waits for the real endpoint and
cannot despawn or finish service there. No positional teleport is used.

The east furniture creates a narrow shared hotel approach. Hotel departures get
exclusive opposing-direction right of way until they clear its west side. New
departing-hotel admissions wait while hotel-bound visitors use that passage.
Reception service and relaxing guests wait at their existing anchors before
starting a conflicting hotel-bound departure. This keeps opposite directions
from forming a circular blockage, while other lobby visitors continue. It adds
no overflow queue positions and does not change static geometry.

Idle positions are protected while approached, occupied and physically cleared.
Idle time advances only at the reserved anchor; an owner-induced displacement
pauses it until return. Standing frames occasionally change orientation; no
seated artwork or random wandering is introduced.

Completion unregisters queue entries, releases idle positions and permits,
destroys both sprite and fallback, removes the active object and increments totals.
Histories and queue arrays are bounded, and no per-guest wall timers or event
listeners are created.

## Lifecycle and debug inspection

Scene pause/sleep freezes arrivals, movement/animations, reception, idle and facing
timers. Wake/resume continues the same IDs, positions, purposes, routes and remaining
times. Both Blackjack Lounge and Hotel Interior transitions preserve the instance.
Reload starts a fresh transient population; world-state version 2 is unchanged.

Open `/world/index.html?debug=1&collisions=1` or use the existing collision button.
`CasinoWorldDebug.snapshot().guestTraffic` reports population/caps, actual moving
and waiting counts, next arrival, pending reason, per-guest identity/appearance,
purpose/state/destination/path/footprint, blocked and movement-hold durations,
queue/idle assignments, hotel right of way, completions/despawns, route requests,
recoveries, validated settings and object/listener counts. Normal gameplay has no
debug overlay or mutable developer settings UI.

Reproducible busy showcase:

```text
/world/index.html?debug=1&trafficProfile=busy&trafficSeed=19
```

This **debug-only** profile uses 1.5–2.5 second arrivals and 20–25 second idle
durations. It is labelled `DEBUG busy` in the overlay and does not change normal
15–30 second arrivals or saved data. Seed/profile query parameters are ignored
without the debug flag. Tests also inject a seeded source into the pure coordinator.

Existing Phase 5B regression fixtures explicitly request
`?debug=1&trafficScenario=phase5b`. The lightweight `LobbyGuestTraffic` adapter
selects that fixed schedule through the same coordinator/mover/queue, rather than
maintaining a second movement or reception implementation. Normal URLs always
select continuous traffic. The standalone Phase 5A journey remains exported.

## Verification

Fresh pre-change baseline: **478 passed in 15.9 minutes**, one worker, before
implementation approval. Dedicated desktop checks: **20 passed in 3.1 minutes**,
including all four purposes with all three appearances, arrival limits and delays,
weighted selection, capacity admission, fallback assets, scene transitions,
save preservation, owner priority and six separate ten-minute deterministic runs.

The six stress scenarios cover seeds 1, 19 and 42 at both six and eight visible
guests: 60 simulated active minutes per browser project, followed by draining each population. They
sample static/swept/peer/owner clearance, speed, actual moving count, queue capacity,
pause/resume, route-map immutability, bounded histories, complete cleanup and
navigation request counts. Simulated active time is distinct from wall-clock
browser/video duration. The real-time showcase also checks animations, body
spacing, caps, balanced visual objects/listeners and unchanged saved data.

Full post-change regression: **518 passed in 22.5 minutes** on 2026-10-31,
with one worker: 259 desktop Chromium and 259 mobile Chrome tests. There were
**0 failures, 0 flakes, 0 skips and no run interruptions**. This includes all
478 existing baseline tests plus 40 new Phase 5C cases across the two projects.
The structured report recorded 1,347,110.708 ms total duration.

Development findings, reported separately from final verification:

- Busy seeded simulations found genuine northeast hotel-passage deadlocks.
  Retained directional intent, optional route guides, safe endpoint approaches and
  the shared passage right-of-way rule resolved the tested circular blockages;
  all six final ten-minute populations completed and released their resources.
- Two initial legacy tests could not observe reception idle because a guest held
  at its reached anchor was labelled yielding. Idle diagnostics now preserve the
  reached-anchor state; the subsequent 15-case guest recheck passed.
- One owner audit assumed the original static contact resolver could never
  project a corner step beyond the nominal input length. Its 74 flagged samples
  were unchanged static corner projections, with no overlaps/backward pushes.
  The assertion now verifies that guest guarding never lengthens the already
  corrected attempted segment. The production owner resolver was not changed.

## Visual evidence

The screenshots were visually checked for foot anchoring, distinct appearances,
walkable standing positions, reception spacing and readable debug paths. The
continuous recording is 1280×1000 at 25 fps and lasts approximately 65 seconds;
it uses actual lobby time, with no guest-position edits or time acceleration.

Normal production intervals:

- [Quiet lobby after the first natural arrival](screenshots/traffic-normal-quiet.png)

Seeded, explicitly tuned busy profile:

- [Quiet one/two-guest moment](screenshots/traffic-quiet.png)
- [Staggered arrivals](screenshots/traffic-staggered.png)
- [Three appearances](screenshots/traffic-appearances.png)
- [Reception with multiple guests](screenshots/traffic-reception.png)
- [Casino staircase journey](screenshots/traffic-casino.png)
- [Guest relaxing beside seating](screenshots/traffic-relaxing.png)
- [Safe passing](screenshots/traffic-passing.png)
- [Main-entrance departure](screenshots/traffic-main-exit.png)
- [Six visible guests](screenshots/traffic-busy.png)
- [Debug paths and queue status](screenshots/traffic-debug.png)
- [Continuous actual-time busy recording](recordings/dynamic-guest-traffic.webm)

## Reproduce

```powershell
npx playwright test tests/guest-traffic.spec.js tests/guest-traffic-capture.spec.js --workers=1
npx playwright test --workers=1
```

On Windows installations mapping `.js` to `text/plain`, start this local server
first (Playwright reuses it), without editing the registry or application:

```powershell
python -c "import http.server; http.server.SimpleHTTPRequestHandler.extensions_map['.js']='application/javascript'; http.server.test(HandlerClass=http.server.SimpleHTTPRequestHandler,port=4173,bind='127.0.0.1')"
```

The title redesign, art assets, owner input/speed/static collision resolver,
receptionist/dealer and all hotel/casino/save authorities remain unchanged. A player
deliberately occupying a required entrance/exit may delay traffic indefinitely;
clearing that obstruction resumes travel rather than forcing a teleport or
financial action. Phase 5D artwork and Phase 5E hotel-state-driven traffic are out
of scope.
