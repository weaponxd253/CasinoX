# Phase 2 — Interactive Resort Lobby

## Scope and compatibility plan

Review completed against the working Phase 1 world, lounge, save guards, original
hotel/blackjack owners, Playwright tests, and the external planning pack's
`AGENTS.md` and `CASINO_X_BUILD_PLAN.md`. The user authorizes reception, an office
shortcut and a hotel placeholder in this phase; the plan's later tablet simulation
summary and onboarding work are outside this slice.

1. Add `world/interaction-system.js` (eligibility, selection, input and dispatch)
   and `world/interactables.js` (door/NPC/object definitions).
2. Add `world/explorable-scene.js`, `world/hotel-config.js`,
   `world/hotel-scene.js`; adapt `world/lobby-scene.js` and
   `floor/room-scene.js` to the common interaction path. Reuse OwnerController.
3. Add `world/dialogue.js` and `world/resort-snapshot.js`; wire navigation,
   modal pause/focus, prompts and HUD in `world/main.js`, `world/index.html`
   and `world/world.css`.
4. Expand tests in `tests/interactions.spec.js` and `tests/resort-lobby.spec.js`;
   document behavior here and link it from `README.md` and
   `docs/STATE_AND_ROUTES.md`.

No hotel, wallet, minigame, payout, dependency or legacy route changes are planned.
Keep the v1 `casinoWorldState` format and the existing lobby collision geometry:
new door markings are walkable thresholds, not new solids that could invalidate
old saved coordinates. Before an excursion or dashboard navigation, save the
exact lobby point and facing. Reload/Continue always returns to that lobby point;
interior positions are retained only while this world document stays open.
No migration, destructive save operation or new persistent authority is needed.

## Implemented journey and ownership

- Reception is west: approach the desk, E to talk, choose a topic, close with Esc
  or Back to exploring. Dialogue distinguishes an existing resort from fresh
  exploration. The receptionist is a stationary guide placeholder, not a hired
  staff record, an assignment or an NPC simulation.
- The northeast office opens `/hotel/index.html` using normal navigation. Its
  existing return link restores the saved lobby point. M and the always-visible
  management link remain shortcuts; exploration is optional.
- The east hotel entrance leads to a second placeholder interior. Its directory
  explains that guest rooms/service doors are planned. E at the south exit, Esc,
  or Return to Central Lobby restores the exact entry point and facing.
- The north entrance still opens the original lounge. The same blackjack iframe
  remains mounted across hotel/lobby/lounge visits; no hand or wallet logic moved.

`INTERACTABLES` defines `id`, `scene`, `position`, `radius`, `label`, `availability`
and `action`. Pure selection filters scene/range/availability, chooses the nearest
eligible definition and resolves ties by ID. Rectangle radius is measured from
the edge; NPC/exit radius is measured from a point. One controller handles E,
focus, repeats, proximity revalidation and cooldown. Scenes supply visuals and
colliders; `world/main.js` owns scene switching, DOM modals and route navigation.
Both new scenes share `ExplorableScene`; the standalone lounge uses an adapter
that hides its world exit when no world host exists. DOM activation buttons use
the same controller without requiring canvas focus.

Dialogue and blackjack pause the active scene and disable its keyboard input.
Close resets held keys, resumes the scene and restores canvas focus, with a short
interaction cooldown. A save error remains fatal even if a dialogue is closed.
Transitions sleep/wake scenes in the same Phaser 3.90.0 game; the reused owner
controller and v1 WorldState remain their original authorities.

The HUD shows location, chip balance, resort name and **saved** hotel operating
cash. `resort-snapshot.js` reads and validates the existing hotel payload only;
there is no hotel initialization, boot/offline tick, staffing calculation or new
clock in the world. Missing hotel state shows Not created. Valid hotel storage
updates refresh the snapshot; malformed/future data stops the world and is kept.
Opening management intentionally starts the original dashboard's normal behavior.

## Verification and file inventory

Phase 1 baseline: 114 checks passed before implementation. New coverage includes
pure eligibility/dispatch rules and browser journeys for reception, contextual
topics, dialogue pause/focus, all hotel return paths, repeated transitions,
collision, reload/Continue, unchanged legacy bytes and unknown v1 fields, office
staff changes, management shortcut, read-only HUD updates, save errors during a
modal and a paid blackjack hand retained through a hotel visit with one payout.
Both desktop Chromium and Pixel 5 emulation use the real local Phaser runtime;
remote cards/assets are mocked as in the existing suite. Touch movement and live
external card service availability are not certified by these tests.

Verification on October 29, 2026: **142 checks passed** (114 retained + 28 new,
all desktop/mobile projects, 2.5 minutes). `git diff --check` passed. Static checks
resolved all 14 HTML entrypoints and 29 world/lounge module imports with no missing
local references. Reception dialogue and hotel interior screenshots were inspected.

```sh
npx playwright test tests/interactions.spec.js tests/resort-lobby.spec.js --workers=2
npx playwright test --workers=2
```

Added: `world/{interaction-system,interactables,explorable-scene,hotel-config,
hotel-scene,dialogue,resort-snapshot}.js`, `tests/interactions.spec.js`,
`tests/resort-lobby.spec.js`, `docs/PHASE_2.md`.

Modified relative to the Phase 1 working tree: `world/{main,lobby-scene}.js`,
`world/index.html`, `world/world.css`, `floor/room-scene.js`, `README.md` and
`docs/STATE_AND_ROUTES.md`. No previous uncommitted files were reset or removed.
OwnerController, WorldState, SaveSafety, wallet, hotel engine/state/UI, standalone
routes, original tests, minigame and payout files remain unchanged in this phase.

Manual verification:

1. Continue an existing resort. Read the separate hotel cash/chip displays; walk
   west to reception, talk and try movement/M while dialogue is open. Esc closes
   it, leaving the owner in place with keyboard focus restored.
2. Visit the northeast office; change a staff assignment in the original UI and
   use Return to Central Lobby. Check both the saved assignment and owner point.
3. Enter the east hotel preview, read its directory, test seating/wall collision
   and return south. Revisit, close a directory conversation, then Esc returns.
4. Reload while inside the preview; Continue returns to its lobby entry point.
5. Play blackjack, close it mid-hand, visit the hotel and return to the table.
   The same live hand remains. Settle it before leaving/reloading the page.

Remaining boundaries: placeholder art and stationary NPC only; no new service
gameplay, full Manager Tablet or touch controls. Interior coordinates are held in
memory during a document visit; durable current-room persistence would require a
separately reviewed world schema migration. New Game and hard-reload hand recovery
remain as described below.

## Remaining Phase 1 issues: recommendations only

### A genuinely new resort

Current New Game remains an honest, nondestructive exploration placeholder.
`HotelState.createNewSave()` already supplies hotel defaults, but calling
`resetSave()` alone does not define a complete resort reset: chips, XP/claims,
guest pool and world metadata have separate owners. Decide whether chip/profile
progress belongs to the resort or the player before implementing slots.

Recommended prerequisite: export/download a versioned backup of all owned save
keys, validate round-trip import, then stage a new slot using the original default
factories. Keep the legacy active keys compatible with every existing page. A
manifest/pointer alone cannot switch these writers safely: define and test a
transaction/recovery protocol for activating staged keys, failed writes and reload
between each write, and reject active sessions in other tabs. Preserve preferences
and unrelated keys. Ask for explicit confirmation only once the complete proposed
replacement and backup are reviewable. Never clear localStorage wholesale or
overwrite malformed/future data. Slot switching/reset needs separate approval.

### An unfinished blackjack hand after hard reload

The existing hand/cards/deck/phase are in memory; the wager is deducted from the
wallet before dealing, and settlement adds the original payout. Keeping the
iframe mounted preserves a live hand across world visits, not across reloads.
Warnings remain; no refund, replay or hand restoration is added in Phase 2.

Recommended prerequisite: a versioned hand journal with a stable hand ID, original
bet, deck/card progress, turn/outcome and settlement status, plus idempotent wallet
transaction IDs. localStorage writes across separate keys are not a single
transaction; specify crash recovery for the interval between hand and wallet
writes. Preserve current rules and API-failure refunds. Test crashes before/after
deduction, card requests/draws, natural blackjack, win/loss/push, refund, payout,
XP and hotel-event updates; include rapid input, repeated reload, two tabs,
storage failure and an expired/unavailable deck. Only then enable resume with
explicit approval. Serializing cards alone does not prevent duplicate payments.
