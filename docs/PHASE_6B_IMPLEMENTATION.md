# Phase 6B — playable Main Casino Floor

The roulette table, five separately identified slot cabinets and Coin Flip kiosk
launch their existing games with E. The shared host pauses the owner, preserves
their exact position and facing, and resumes the same Main Casino Floor after a
safe return. Central Lobby ↔ Main Casino Floor ↔ Blackjack Lounge remains the
world route. No casino NPCs or new game mechanics were added.

The [approved plan and source audit](PHASE_6B_PLAN.md) records the original
game entry points, lifecycle findings, preimplementation evidence and source
hash baseline. The user subsequently approved implementation with “implement
6B”. The fresh starting regression was **716 passing tests**: 358 desktop and
358 mobile, one worker, no skipped, failed or retried cases.

## Architecture and financial authority

`world/casino-attractions.js` supplies seven immutable interaction descriptors.
The existing selector still orders eligible interactions by distance, then ID;
an optional reachability predicate checks the unchanged collision map and a
clear segment to the standing point. Doorways have separate, distant regions.
The existing scene adds optional outlines and a selection halo. No body, mask,
room transition, movement controller or artwork was replaced.

`world/casino-game-host.js` owns a single modal and at most one active game iframe.
Roulette, Slots and Coin Flip are loaded from `roulette/index.html`,
`slots/index.html` and `coinflip/index.html`. Opening never places a bet. After
a safe close the document is destroyed; future visits create a fresh document.
All five cabinets use the same Slots implementation, shared wallet and profile.
They do not create separate persistent histories or bankrolls. The original
Blackjack iframe remains retained, including an unfinished hand.

`casino-game-bridge.js` is inactive on standalone pages. In a verified world
embedding it observes original lexical round flags and reports readiness and
safe-close state. Messages require the exact source window, origin, channel,
version, game ID and per-visit nonce. The parent also checks the exact document
URL. A new close request obtains fresh state; the child freezes input before
acknowledging a safe teardown. A cached “idle” message cannot authorize closure.
Production diagnostics expose observations, never outcome controls.

The host and bridge contain no wallet mutation, payout, refund, bet or RNG code.
The original game scripts and `wallet.js` are byte-identical to the starting
baseline. Parent HUDs share the existing single wallet subscription; child game
documents keep their original wallet and profile behavior. Normal game effects,
including existing hotel event/perk integration, still come from those games.
Opening and closing alone never initialize or save hotel management state.

An audited cross-game bug required a small read-only shell addition:
`CasinoShell.refreshProfile()` reloads profile defaults and saved XP into memory
without saving or awarding anything. A retained Blackjack frame now confirms
readiness on every activation before input is released. This prevents cached
XP from repeating a level reward after a different game crosses that level.
Dealing, Double, payouts, XP formulas and rewards themselves are unchanged.

## Exact interaction geometry

Coordinates are logical world units in the existing 960 × 600 world. Rectangles
are centered; the unchanged owner radius is 14 and movement speed is 190.
Each region has an additional reach of 8 units and requires collision clearance.

| Attraction | Standing/rectangle center (x, y) | Width × height | Original game |
| --- | --- | --- | --- |
| Roulette | 208.125, 342.1875 | 28.125 × 16.40625 | Roulette Royale |
| Slot 1 | 674.53125, 300 | 18.75 × 14.0625 | Lucky Reels |
| Slot 2 | 717.890625, 300 | 18.75 × 14.0625 | Lucky Reels |
| Slot 3 | 761.25, 300 | 18.75 × 14.0625 | Lucky Reels |
| Slot 4 | 804.609375, 300 | 18.75 × 14.0625 | Lucky Reels |
| Slot 5 | 847.96875, 300 | 18.75 × 14.0625 | Lucky Reels |
| Coin Flip | 655.78125, 377.34375 | 14.0625 × 18.75 | Coin Flip |

The slot standing points are on the walkable floor below the stools. The
[planning map](phase6b-attractions-plan.png) retains the source-art coordinates;
the runtime collision view shows the final regions and approach circles.

## Round, input and document lifetime

| Game | Ordinary safe return | During an unresolved wager |
| --- | --- | --- |
| Roulette | Original `spinning` is false | Return and Escape retain the frame until settlement |
| Slots | Original `spinning` is false and `auto === null` | Use original Stop; let current spin settle. Escape can stop Auto before returning |
| Coin Flip | Original `flipping` is false and `pot === 0` | Finish the flip and use original Cash Out. A winning pot alone is not safe to discard |
| Blackjack | Existing retained-frame behavior | Closing retains the hand and original document as before |

The host also requires known state and a healthy shared wallet. It locks owner
input during loading and play, blocks repeated E activation, and restores the
captured pose, canvas focus and released keys after closing. The native modal
keeps a mouse-accessible Return control outside the frame. Inner game Help and
settings consume Escape first. Existing game layout remains scrollable; optional
embed CSS removes redundant page navigation/footer and gives the phone roulette
bar enough bottom clearance for the save controls. An embed-only CSS rule also
holds settled Slots symbols in their reel windows when the original GSAP win
shake reapplies its cached strip offset; spinning strips still animate normally.
The original game JavaScript remains unchanged. A read-only chip display
stays visible in the host header while scrolling the board.

An unplayed load failure can close and retry. An error after readiness cannot
discard a possibly paid document. Storage degradation before play rejects the
frame. A quota failure during settlement preserves the original frame and its
ephemeral balance; the host never copies or reconciles it into persistent funds.
New wagers are blocked while original recovery controls and save export remain
accessible. Import is disabled inside the embedded document. Deferred scene
disposal keeps a busy frame until it can safely close. Each successful teardown
removes its frame listeners and timers; host disposal removes its four parent
listeners.

## Save compatibility and limitations

World-state version **2**, transient interiors and lobby-only checkpoints are
unchanged. Hard reload returns to the lobby checkpoint, not an attraction or
unfinished round. Existing unknown save metadata and corrupt-save protections
remain intact. The hotel engine remains authoritative and absent from the world
scene's visual integration.

Ordinary close is protected; hard reload, forced navigation and process loss
retain the original games' limitations. Roulette and Slots may lose an unsettled
deducted wager on unload. Coin Flip's existing pagehide banks an idle winning pot;
an in-flight flip or ride can lose its deducted stake/pot. Blackjack retains its
existing reload limitation. Beforeunload provides the existing browser warning
when a wager is unresolved, but cannot guarantee settlement. There is no new
refund, round persistence, save migration, balance repair or multi-tab transaction
guarantee. Export keeps the original exporter's behavior; retaining divergent
in-memory funds does not guarantee recovery after page loss. New embedded games
intentionally start fresh per visit; only their
existing persistent game data survives. HTTP is the primary supported hosting
mode; the existing Blackjack file-URL bridge regression is preserved.

## Verification and evidence

The complete final single-worker regression passed **788/788 tests**: **394
desktop and 394 mobile**, including all 716 original cases and 72 new cases.
There were **zero failures, skips, retries or flaky cases**. The full run took
52 minutes 4 seconds. See the
[machine-readable verification record](PHASE_6B_VERIFICATION.json) for results,
source fingerprints, original-game transaction ledgers and evidence hashes.

All six milestones are complete: source audit and fresh baseline; seven physical
interaction regions; shared host; original-game connections; protected return
and document lifetime; full regression and visual acceptance. Focused milestones
passed before the final full run. The final implementation was frozen across
192 application/test source files throughout that run.

The existing actual Hotel Management UI tests pass for both full-page return and
live updates in a retained lobby. Legitimate management UI purchases remain
distinct from the visual integration's zero management writes. Deterministic
management and guest movement stress checks pass at six and eight visible guests,
including the existing four-moving-guest limit: **28 management stress cases**
and **12 guest movement stress cases**, each simulating 600 active seconds.
All **57 protected authority files** match the preimplementation fingerprints.
No hotel, guest movement, queue,
collision, owner controller, game calculation, wallet, artwork or save-schema
implementation was changed.

Focused milestones exercised every physical cabinet, deterministic selection,
collision rejection, owner/focus restoration, one held E, delayed readiness,
fresh close acknowledgments, load failures, storage denial, real-payout quota
failure, original wins/losses/pushes/jackpot, Coin Flip pot protection, Auto Stop,
forced reload, retained Blackjack Double across an XP level boundary, repeated
frame teardown and sleeping guest identity/queue preservation. RNG/deck inputs
and settlement delays are controlled only in isolated tests; assertions exercise
the original wager and settlement code. No test balance mutation is presented
as evidence of a completed wager.

The recorded tour starts with $250.25 in isolated save data. Original Roulette
Odd wins $1 net; Slots cabinet 1 loses $0.60; cabinet 5 wins $0.60 net; Coin Flip
wins and cashes out $5 net; Blackjack wins $1 net. The final authoritative balance
is **$257.25**. Every balance write originates in an original game document.
Hotel, guest-pool and world-checkpoint bytes remain identical to the seeded save.
Four Main Floor game returns preserve exact owner position and facing.

Hotel parity checks passed **1,795 selector cases across 48 capacity settings**
and **360 financial cases**, with exact output parity and **zero writes**.

The [desktop tour recording](recordings/casino-games-desktop-tour.webm) and
[mobile tour recording](recordings/casino-games-mobile-tour.webm) use actual
movement and original game interfaces. Desktop is 1280 × 1000; mobile retains
the Pixel 5 viewport and touch configuration. Mobile validation uses Chromium
emulation and the existing keyboard movement path; physical-device testing is
outside this verification. The mobile recording removes only the recorder's unused surrounding canvas;
uncropped originals remain in the retained test artifacts. The delivery contains
**58 screenshots and two recordings**, including two additional passing,
single-worker full-page prompt captures covering all seven attractions.

Representative evidence:

| Evidence | Desktop | Mobile |
| --- | --- | --- |
| Roulette approach and E prompt | [Floor](screenshots/casino-games-desktop-roulette-prompt-full.png) | [Floor](screenshots/casino-games-mobile-roulette-prompt-full.png) |
| Roulette original interface | [Open](screenshots/casino-games-desktop-roulette-open.png) | [Open](screenshots/casino-games-mobile-roulette-open.png) |
| Completed Roulette round | [Result](screenshots/casino-games-desktop-roulette-result.png) | [Result](screenshots/casino-games-mobile-roulette-result.png) |
| Exact Roulette return | [Owner](screenshots/casino-games-desktop-roulette-return.png) | [Owner](screenshots/casino-games-mobile-roulette-return.png) |
| Cabinet 1 | [Prompt](screenshots/casino-games-desktop-slot-1-prompt-full.png), [spin](screenshots/casino-games-desktop-slot-1-result.png) | [Prompt](screenshots/casino-games-mobile-slot-1-prompt-full.png), [spin](screenshots/casino-games-mobile-slot-1-result.png) |
| Cabinet 5, same existing game | [Prompt](screenshots/casino-games-desktop-slot-5-prompt-full.png), [spin](screenshots/casino-games-desktop-slot-5-result.png) | [Prompt](screenshots/casino-games-mobile-slot-5-prompt-full.png), [spin](screenshots/casino-games-mobile-slot-5-result.png) |
| Coin Flip pot protected before Cash Out | [Pot](screenshots/casino-games-desktop-coinflip-pot.png) | [Pot](screenshots/casino-games-mobile-coinflip-pot.png) |
| Coin Flip exact return | [Owner](screenshots/casino-games-desktop-coinflip-return.png) | [Owner](screenshots/casino-games-mobile-coinflip-return.png) |
| Existing Blackjack playable | [Result](screenshots/casino-games-desktop-blackjack-result.png) | [Result](screenshots/casino-games-mobile-blackjack-result.png) |
| Complete route returns to lobby | [Lobby](screenshots/casino-games-desktop-lobby-return.png) | [Lobby](screenshots/casino-games-mobile-lobby-return.png) |
| Optional interaction/collision view | [Debug](screenshots/casino-games-desktop-interaction-debug.png) | [Debug](screenshots/casino-games-mobile-interaction-debug.png) |

## File inventory

Added runtime files: `world/casino-attractions.js`, `world/casino-game-host.js`,
`casino-game-bridge.js`, `casino-game-embed.css`.

Modified runtime files: `world/main.js`, `world/index.html`, `world/world.css`,
`world/main-casino-scene.js`, `world/interactables.js`,
`world/interaction-system.js`, `world/room-routes.js`, `casino-shell.js`,
`floor/blackjack-overlay.js`, `blackjack/floor-bridge.js`,
`roulette/index.html`, `slots/index.html`, `coinflip/index.html`.

Added tests: `casino-attractions`, `casino-game-host`, `casino-games`,
`casino-game-safety`, `casino-slot-outcomes`, `casino-game-failures`,
`casino-game-lifecycle`, `casino-game-capture` specs; `helpers/casino-world.js`
and `fixtures/casino-host-game.html`. Modified the existing interaction enum
expectation in `tests/interactions.spec.js` to include `casino-game`.

Documentation: README, approved Phase 6B plan/audit/maps/baseline, this report,
verification JSON, screenshots and recordings. Existing Phase 5/6A evidence was
preserved. No Phase 6C traffic or later world expansion was introduced.
