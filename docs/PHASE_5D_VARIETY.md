# Phase 5D — guest variety, personalities and ambient dialogue

Historical Phase 5D behavior and evidence are retained below. Current management
integration is documented in [Phase 5E](PHASE_5E_ACTIVITY.md); historical test
fixtures explicitly select unavailable management metrics.

The Central Lobby uses eight appearances, five independently assigned personalities
and occasional contextual speech. All properties are transient. Guest movement,
reception, destinations and hotel-passage right of way still use the Phase 5C
controllers. Traffic never reads or writes hotel, wallet, booking, satisfaction,
staffing or world-save records.

## Supplied artwork and normalization

Five supplied 1024×1536 RGBA sheets join the original three appearances:

| New appearance | ID | Inspected source row cuts |
| --- | --- | --- |
| Conference Attendee | `conference-attendee` | 392, 774, 1153 |
| Vacation Tourist | `vacation-tourist` | 391, 770, 1142 |
| Luxury Hotel Guest | `luxury-hotel-guest` | 390, 771, 1156 |
| Young Casino Visitor | `young-casino-visitor` | 395, 742, 1095 |
| High Roller | `high-roller` | 391, 762, 1129 |

Each folder under `world/assets/guests/` contains a byte-identical `*-source.png`,
a separate normalized PNG, `*-frames.json` with hashes/windows/translations/pixel
counts, and preparation notes. Existing Casual, Business and Older Leisure
Traveler artwork is untouched. No character was generated, redrawn or resized.

The Luxury source contained actual faint background alpha: 59.30% of pixels had
alpha 1–31. Young Visitor and High Roller poses crossed nominal 384px source-row
boundaries. Loading those sources directly as a regular grid would mix or clip
poses. The preparation script uses the inspected empty gaps instead.

For the new sheets, alpha≥32 defines a silhouette seed. Every original RGBA pixel
within two pixels of any seed is retained, including faint antialiasing and
detached details. Background outside that neighborhood is cleared. This is not
a global alpha cutoff or a rectangular erase operation. Normalization removed
895,077 faint background pixels from Luxury while retaining 37,686 faint edge
pixels; the other sheets retain 34,044–38,608 faint edge pixels each. Browser
pixel comparisons verify retained RGBA values against the preserved originals.

Frames remain 256×384, with down/left/right/up rows and idle frames 0/4/8/12.
The silhouette core is centered with exclusive foot baseline y=368; its original
faint fringe can extend to y=370, safely inside the transparent padding. The
shared renderer remains 48×72, nearest-neighbor, 8fps, anchored at guest center
y+radius. None of the new art creates a physics body.

Rebuild a derivative with Pillow (preparation only):

```text
python scripts/prepare-guest-sprites.py conference-attendee path/to/source.png
```

The original two Phase 5B preparation commands retain their previous behavior.

## Appearance selection and identity

The existing `GUEST_APPEARANCES` registry owns all eight texture URLs, frame
mappings, scale, foot anchor, fallback colors and optional clothing tags. Behavior
never follows a clothing tag. Textures/animations are shared per appearance;
runtime IDs remain unique and independent.

Selection prefers a different last-arrival appearance, adjacent reception variety
and fewer nearby duplicates at the entrance or selected idle area. A bounded
last-used map and small age bonus keep all eight eligible. Ties remain random
under the injected RNG; on-screen uniqueness is not compulsory. Population limits
remain six visible/eight configurable/four actually moving.

## Personalities

`world/guest-personalities.js` defines equal initial weights. Every appearance
supports every personality and all four purposes, including a Reserved High Roller
or an Excited Conference Attendee. An appearance grants no queue/service privilege.

| Personality | Production speed preference, px/s | Relaxing duration, seconds | Presentation |
| --- | --- | --- | --- |
| Relaxed | 78–82.9 | 19.75–25 | Calm comments, occasional idle turn |
| Excited | 87.1–92 | 10–15.25 | Brisk pace, enthusiastic comments |
| Reserved | 82.9–87.1 | 13.75–19 | Minimal speech, calm idle pose |
| Impatient | 87.1–91.3 | 10–14.5 | Brief stationary waiting turn/comment |
| Discerning | 80.8–85 | 17.5–22.75 | Measured pace, surroundings comments |

These are fractions of the current traffic ranges, not separate absolute limits.
Changing traffic configuration still clamps speed and idle duration safely.
Assignment occurs once at creation. Existing speed/idle random draws sample the
selected preference band; personality selection uses a separate random stream.

Impatient guests briefly face sideways for 1.5 seconds after nine seconds at an
actually reached waiting anchor, repeating only while waiting. This is a visual
override, cleared while moving or being served. No waypoint, position, reservation,
service timer, priority or contact behavior changes. Relaxing orientation changes
also occur only at the existing reserved anchor. No corridor pauses or extra
journey stops were added.

## Ambient dialogue

`GuestDialogueController` manages presentation deadlines using the traffic active
clock. `GuestDialogueBubbles` renders graphics/text through the existing scene
adapter. Neither controls movement or a second guest state machine.

The fixed catalog contains two short lines per personality/context: entering,
physical reception waiting, casino approach, relaxing at an anchor and departing.
Text never uses actual room availability, finances, satisfaction or measured wait
times. Context and personality determine eligible lines; repeated lines for the
same guest are avoided where alternatives exist.

Defaults in `world/guest-dialogue-config.js`:

- One active bubble by default, configurable up to two.
- Duration 3–4 active seconds.
- Per-guest cooldown 30–60 active seconds from speech start.
- Global gap 9–15 active seconds between speech starts.
- Initial checks after 2–5 seconds, subsequent checks 6–10 seconds apart.
- Walking speech probability is 12% of the stationary personality probability.
  Reserved guests speak much less frequently.
- Recent diagnostic history is capped at 64 events; guest state is bounded by the
  active population.

Checks draw randomness only at eligibility/context events and scheduled deadlines,
not on every frame. Debug seeds fork independent traffic, personality and dialogue
streams. Production seeds them from fresh randomness. Enabling or suppressing
speech cannot consume the traffic scheduler's RNG or alter its decisions.

Bubbles use compact 11px light text, a dark translucent background and thin gold
border, above the guest's head and inside camera bounds. At most two graphics/text
pairs exist. Text is laid out only at creation; following a guest only updates
positions. Bubbles do not receive pointer or keyboard input and do not change focus.
Overlapping/offscreen UI is hidden safely.

## Priority, lifecycle and cleanup

An available owner interaction prompt suppresses new speech and hides current
bubbles. Existing conversation/table overlays take priority through the normal
scene pause. A prompt by itself does not freeze traffic or expiration; a hidden
bubble can expire and is not revived on leaving the prompt.

Pause/sleep hides UI and freezes dialogue duration, cooldown and eligibility clocks
with traffic. Resume/wake preserves the original runtime IDs and remaining times.
No per-guest wall timer or event listener is created. The adapter reuses its
existing worldstep and sleep/wake/pause/resume/shutdown callbacks.

Despawn prunes dialogue state and destroys associated UI in the same adapter
update. Expiration destroys graphics/text. The renderer reports creation/destruction
counts, and long-running tests check balanced objects, bounded histories, no stale
reservations and unchanged listener counts.

## Debugging

Existing URLs remain valid:

```text
/world/index.html?debug=1&collisions=1
/world/index.html?debug=1&trafficProfile=busy&trafficSeed=19
```

`CasinoWorldDebug.snapshot().guestTraffic` includes registry counts, per-guest
personality/label/speed, purpose, presentation-facing override, current dialogue
and cooldown, movement/queue/idle/animation/fallback diagnostics, bounded appearance
history, model/UI counts and cleanup totals. Debug text adds personalities and
active speech. Normal gameplay has no permanent labels or debug information.

The `busy` profile still means 1.5–2.5 second arrivals and 20–25 second configured
idle limits; normal arrivals stay 15–30 seconds. Query seed/profile controls remain
debug-only. The explicit Phase 5B regression fixture retains its original schedule,
speeds and three appearances, with ambient dialogue disabled.

## Verification

Fresh pre-change baseline on 2026-10-31: **518 passed in 22.0 minutes** with one
worker, 1,319,313.432 ms total, zero failures/flakes/skips.

Milestone checks (desktop, one worker):

- Asset preparation: **5 passed**, 2.7 seconds.
- Registry, animations/fallback and existing traffic: **32 passed**, 2.4 minutes.
- Personalities and existing traffic: **27 passed**, 2.7 minutes, including all
  160 appearance×personality×purpose combinations completing valid journeys.
- Dialogue: **8 passed**, 1.0 minute, including ten-minute mixed speech/traffic
  scenarios at six and eight visible guests.
- Live dialogue and capture integration: **10 passed**, 2.8 minutes.
- Additional active-speech lounge visit: **1 passed**, 32.5 seconds, confirming
  an existing bubble hides/freezes and resumes the same instance and remaining time.

Each browser project runs six retained traffic stress scenarios plus two new
dialogue/traffic stress scenarios: **80 simulated active minutes per project**,
followed by population draining and cleanup checks. Simulated active time is
distinct from wall-clock test duration and the actual-time recording below.

Complete post-change regression on 2026-10-31: **582 passed in 30.3 minutes**,
using one worker: **291 desktop Chromium + 291 mobile Chrome**. This includes
the 518 baseline cases and 64 additional Phase 5D cases across both projects.
The structured report recorded **1,820,918.427 ms**, 582 attempts, **0 failures,
0 retries, 0 flakes, 0 skips and 0 report errors**. No functional test failures
or environment/memory interruptions occurred in the Phase 5D milestone or final runs.
All six milestones are complete.

The final SHA-256 comparison found **0 changes in all 27 protected pre-5D files**,
including the movement/queue/NPC renderer, owner/static-navigation/depth/save/title
authorities and original three guest asset sets. Existing uncommitted Phase 5C
implementation and evidence remain preserved.

```text
npx playwright test tests/guest-variety.spec.js tests/guest-personalities.spec.js tests/guest-dialogue.spec.js tests/guest-variety-capture.spec.js --workers=1
npx playwright test --workers=1
```

## Visual evidence

The normal-profile capture uses the production 15–30-second configuration. Other
gameplay captures use the explicitly tuned busy profile with seed 1 and ordinary
arrivals/journeys. No guest positions are manually assigned for gameplay evidence.
The owner demonstration uses normal keyboard movement; that movement legitimately
updates the existing owner checkpoint, while all other saved records are checked
byte-for-byte. Stationary tests check the complete saved state remains unchanged.

The separate all-frame contact sheet is labelled **asset calibration only**. It
shows all supplied poses on lobby marble and is not evidence of a guest journey.

The 79.08-second recording is actual-time 1280×1000 VP8 at 25fps. It includes all
four walking directions, arrivals/departures, speech appearing/expiring and the
owner's keyboard-driven passage. The captured live audit found no static/peer/owner
overlaps, cap violations, animation/anchor errors or unbalanced display objects.
All evidence below was visually reviewed against the actual lobby background.

- [Normal production arrival configuration](screenshots/variety-normal.png)
- [High Roller entering](screenshots/variety-high-roller-entry.png)
- [Young Casino Visitor heading north](screenshots/variety-young-casino.png)
- [Conference Attendee at reception](screenshots/variety-conference-reception.png)
- [Vacation Tourist at the seating approach](screenshots/variety-tourist-seating.png)
- [Luxury Hotel Guest heading to the hotel](screenshots/variety-luxury-hotel.png)
- [Several appearances together](screenshots/variety-appearances.png)
- [All 80 supplied frames on lobby marble — calibration only](screenshots/variety-directions.png)
- [Relaxed personality speaking](screenshots/variety-relaxed-dialogue.png)
- [Impatient personality waiting in order](screenshots/variety-impatient-queue.png)
- [Six visible guests](screenshots/variety-busy.png)
- [Bubble expired](screenshots/variety-speech-expired.png)
- [Owner moving through live traffic](screenshots/variety-owner-passage.png)
- [Debug paths, identities, personalities and speech](screenshots/variety-debug.png)
- [Continuous actual-time demonstration](recordings/guest-variety-dialogue.webm)

## Protected scope

GuestController, ReceptionQueueManager, NpcSprite, owner controls/contact guard,
static geometry/cached navigation, depth ordering, northeast hotel right of way,
all entrance/exit/queue/idle coordinates, original artwork, title screen, hotel
engine, casino games/wallet and world-state version 2 remain unchanged by Phase 5D.
Hotel-state-driven behavior, actual VIP entitlements, new environments, finance
mechanics and save migrations remain outside this phase.
