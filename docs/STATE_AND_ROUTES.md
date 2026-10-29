# Phase 1 — owner entry, routes and saves

This records the Phase 1 baseline. [Phase 2](PHASE_2.md) extends the world with
shared interactions, reception, an office shortcut and a hotel interior preview.
All routes and save authorities below remain; the world schema stays at version 1.

## Implemented journey

`/` → Continue Resort / New Game placeholder → `/world/index.html` → walk north
to the casino entrance → E → Blackjack Lounge → E near table → existing blackjack.
Close the overlay, walk south and press E (or use Return to Central Lobby) to
return to the exact lobby position and facing captured before entering.

Both rooms live in one Phaser 3.90.0 game. Scene sleep/wake retains the lounge's
position. One same-origin blackjack iframe lives outside the scenes and stays
mounted across overlay closes and lobby visits. Phaser never owns hotel rules,
hotel cash, blackjack hands, payouts or another simulation clock.

The standalone `/floor/index.html` lounge still works. Legacy casino pages stay
at `/casino.html`, `/slots/index.html`, `/blackjack/index.html`, `/coinflip/index.html`.
Management is `/hotel/index.html`; operations remain under `/hotel/{checkin,rooms,
restaurant,bar,entertainment,spa}/index.html`. Shell return links from all six
operations now point directly to `../index.html` (hotel management), with explicit
labels and no inferred broken hotel URL. Management and the casino selector have
an owner-world return link. Browser History is not used as a return-position store.
Hotel operation headers wrap their controls on small screens to keep return links
accessible alongside long titles. Check-In's opening overlay retains its own
visible Back to Hotel link.

## Title and New Game boundary

Title availability checks only read saved data. The title loads no HotelState,
hotel engine, wallet initialization, offline tick, daily-bonus prompt or migration.
Settings reads preferences; only Save settings writes `theme` and `casinoMuted`.

Continue is available for compatible existing hotel/chip/profile/guest data or
valid world metadata. A legacy save without world metadata starts at the safe
lobby spawn without changing or migrating the hotel payload.

**New Game is explicitly a nondestructive placeholder.** It explains that creating
or replacing a resort is unavailable, and offers exploration using the existing
save/location. Cancel does nothing. Fresh exploration creates only world metadata
and the existing default chip wallet. HotelState creates its usual hotel save only
when the player explicitly opens the original management page. Existing saves are
never reset by these title actions. A real new-resort/reset workflow, backup/export
policy and save-slot design remain decisions for a later phase.

## World metadata schema and writes

The only new persistent key is `casinoWorldState`, version 1:

```json
{
  "version": 1,
  "lobby": { "x": 480, "y": 480, "facing": "up" },
  "updatedAt": 1793200000000
}
```

The lobby location is saved periodically after movement, before scene transitions,
and on pagehide. Continue always re-enters Central Lobby: if the page was left in
the lounge, the saved point is the lobby entrance point, not the lounge spawn.
Walking and room transitions do not write hotel state. Coordinates must be finite,
within the room and outside solid geometry; facing must be one of four directions.
Unknown metadata fields within version 1 are retained. Unsupported versions and
invalid positions/JSON produce errors without a fallback write or schema downgrade.

Each session compares the stored world payload with the value it last read/wrote.
Another tab's world change stops this session and asks for reload, rather than
silently overwriting that tab. Failed world writes stop movement and show an error.
This is conflict detection, not concurrent multiplayer. Existing hotel multi-tab
simulation synchronization is not redesigned by Phase 1.

## Existing storage and safety

| Key | Authority / behavior |
| --- | --- |
| `casinoBalance` | CasinoWallet; virtual chips, default 100 when missing |
| `hotelGameState` | HotelState / HotelEngine; schema 9, separate hotel operating cash |
| `hotelGuestPool` | Existing Check-In guest pool, schema 1 |
| `casinoProfile` | Existing unversioned XP, daily claim and streak data |
| `theme`, `casinoMuted` | Existing appearance/sound preferences |
| `slotToastShown` | Existing slots introduction flag |
| `checkinGameCooldown` | Existing disabled cooldown; legacy Check-In still clears it |
| `shellBonusPrompted` | Existing sessionStorage daily-prompt flag |
| `hotelCasinoEffects` | Existing sessionStorage effects cache |

`save-safety.js` supplies read-only validation and visible errors. Existing pages
load it before wallet.js. Narrow guards prevent legacy loaders/writers from
replacing malformed JSON, invalid core data or unsupported versions. Hotel schemas
0–9 with compatible core structures remain eligible for their original migration
when opening hotel management; the title/world never perform that migration. The
guest pool supports versions 0–1; versioned future casino profiles are rejected
because the current profile format is unversioned. Version limits must be updated
alongside the owning modules when deliberately introducing new schemas.

The original hotel/chip economy, XP rewards, bonuses, staffing, department rules,
shift rewards and blackjack payouts are retained. Casino event writers gain only
a guard before modifying stored hotel counters. No automatic repair, deletion,
refund, money transfer or replacement-save action is provided. Restore a compatible
backup externally when an error is shown. There is no claim of support for every
historical or arbitrarily shaped save; invalid payloads are kept for recovery.

## Blackjack hard-reload limitation

**An unfinished paid hand does not survive hard reload or leaving the world page.**
Its chip deduction remains. The implementation does not serialize, restore, replay
or refund that hand. Finish the hand before navigating away. World navigation warns
about an active hand; beforeunload requests the browser's confirmation where the
browser supports it. Such warnings cannot prevent forced termination or guarantee
recovery. Closing the overlay or moving between the two scenes does preserve the
live hand and does not place another wager. Live deals still require the existing
external card API; its original connection-failure refund behavior is unchanged.

## Verification

```sh
python -m http.server 8000
# Open http://localhost:8000/

npm run test:world
npx playwright test --workers=2
```

Phase 1 verification on October 28, 2026: **114 checks passed** (56 existing,
58 Phase 1) across desktop Chromium and Pixel 5 emulation. A static reference
check also resolved all 14 HTML entrypoints and 14 local module imports, with
save-safety.js loaded before wallet.js everywhere it is used. Live external API
availability and physical mobile-device/touch support are not certified by these
mocked-network browser tests.

Manual checklist:

1. Open the title with an existing resort. Continue is enabled; merely visiting the
   title changes no saved data. Open/cancel New Game and Settings; data stays intact.
2. Continue, walk with WASD/arrows, and test room edges and the reception desk.
3. Approach the casino, press E, approach blackjack and press E. Add a chip and
   Deal. Close the table, return to the lobby, then revisit: the hand is retained.
4. Settle the hand. Chips update through the original wallet exactly once.
5. Return to the lobby, reload, then use Title → Continue. Position/facing return.
6. Open management via its link or M. Existing staffing/departments/shifts remain
   available. Each minigame's Hotel Lobby header link returns to management.
7. Test malformed/future data only in a disposable browser profile. The title/world
   and applicable legacy page show errors and retain the original bytes.

Playwright uses the real local Phaser runtime and original game logic with mocked
cards and remote assets. Tests cover the above journey, legacy-save byte preservation,
older saves without title-side migration, metadata validity, conflicts/write failure,
existing casino/floor regressions and the explicit hard-reload limitation.

For read-only world inspection, use `/world/index.html?debug=1` and
`CasinoWorldDebug.snapshot()`. Normal pages expose no diagnostic API. Movement is
keyboard-first; touch movement, full Manager Tablet, NPC AI, production art and new
departments are outside Phase 1.

## Phase 1 change inventory

This inventory is relative to the audited working tree, including the prior
uncommitted lounge integration. No prior files were deleted, reset or committed.
The previous Phaser vendor copy, dependency lockfile, overlay controller, iframe
bridge and floor tests were retained.

| Area | Added | Modified |
| --- | --- | --- |
| Entry and world | `world/index.html`, `world/start.js`, `world/main.js`, `world/lobby-config.js`, `world/lobby-scene.js`, `world/owner-controller.js`, `world/world-state.js`, `world/world.css` | `index.html`, `floor/room-scene.js`, `floor/room-config.js` |
| Save safety | `save-safety.js` | `wallet.js`, `casino-shell.js`, `hotel/hotel-state.js`, `hotel/hotel-guest-pool.js`; one hotel-save guard each in `blackjack/script.js`, `slots/script.js`, `coinflip/game.js` |
| Script loading | — | Safety script before wallet in `casino.html`, `blackjack/index.html`, `slots/index.html`, `coinflip/index.html`, `floor/index.html`, `hotel/index.html` and all six `hotel/*/index.html` operation pages |
| Legacy navigation | — | `hotel/hotel-ui.js`, `hotel/checkin/game.js`, `hotel/{rooms,restaurant,bar,entertainment,spa}/index.html`, `hotel/index.html`, `casino.html`, `casino-shell.js`, `casino-mobile.css` |
| Tests | `tests/helpers/saved-resort.js`, `tests/world.spec.js` | Root navigation assertion in `tests/casino.spec.js`; `test:world` script in `package.json` |
| Documentation | `docs/STATE_AND_ROUTES.md` | `README.md`, `SHELL-GUIDE.md`, `floor/README.md` |

The hotel engine/configuration, staff and department calculations, all operation
mechanics, blackjack rules and payout calculations are unchanged. Changes to casino
game scripts only guard the pre-existing hotel-event persistence helper.
