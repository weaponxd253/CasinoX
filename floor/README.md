# Phaser room integration

Phase 1 adds the owner title at `/` and Central Lobby at `/world/index.html`.
This standalone lounge route remains available. Its movement code now shares
`../world/owner-controller.js`; its rules and iframe lifetime remain unchanged.
See [world routes and persistence](../docs/STATE_AND_ROUTES.md).

The existing app is a set of independently served HTML pages. `index.html` opens
the hotel; `casino.html` links to casino games. `CasinoShell` supplies shared
chrome, progression and audio. `wallet.js` owns `casinoBalance` in localStorage;
blackjack's rules, betting and payouts live in `blackjack/script.js`. Blackjack
still needs the external Deck of Cards API for live deals.

## Minimal plan and boundaries

1. Add this optional room alongside the existing pages, linked from the game lobby.
2. Use Phaser only for the floor, WASD/arrow movement, solid walls/table and proximity.
3. Show the existing blackjack page in a native modal dialog with a same-origin
   iframe. Pause/resume the Phaser scene without replacing it or moving its player.
4. Keep the iframe mounted between visits, including when leaving mid-hand. A small
   optional bridge handles Escape and shell return links; rules remain unchanged.
5. Reuse `CasinoWallet` and its `casinoBalance` store in both documents. The existing
   storage event listener syncs changes between them; there is no second bankroll
   or transfer step. Other casino pages/tabs use the same balance too.
6. Test with the real local Phaser runtime and deterministic deck API responses.

The iframe keeps blackjack's global functions and CSS isolated from Phaser and
the floor's DOM. The host accepts only messages from that frame at the same origin.
Closing the overlay does not cancel, reset, refund or place a wager. An in-flight
deal continues in the mounted frame. Reopening shows the same hand and controls.

## Modules

| File | Responsibility |
| --- | --- |
| `room-config.js` | Fixed world dimensions, spawn, speed, solid bounds, interaction reach |
| `room-scene.js` | Drawing, Arcade Physics, normalized keyboard movement, proximity |
| `blackjack-overlay.js` | Dialog/frame lifetime, pause/resume callbacks, validated messages |
| `main.js` | Wire modules, floor wallet display, optional read-only diagnostics |
| `../blackjack/floor-bridge.js` | Opt-in iframe return/Escape behavior; standalone pages unaffected |

Phaser **3.90.0** is pinned in `package.json`; the committed `vendor/` copy and MIT
license preserve the project's static hosting workflow. No bundler or CDN is
needed for the room. After deliberately updating the npm dependency, regenerate
the runtime with `npm run vendor:phaser`.

Phaser references: [Arcade Physics](https://docs.phaser.io/phaser/concepts/physics/arcade),
[scene pause/resume](https://docs.phaser.io/api-documentation/3.90.0/class/scenes-sceneplugin),
[keyboard input](https://docs.phaser.io/api-documentation/3.90.0/class/input-keyboard-keyboardplugin).

## Manual end-to-end check

1. Serve the repo root: `python -m http.server 8000`. Open
   `http://localhost:8000/casino.html` and choose **Explore the Blackjack Lounge**.
2. Use WASD or arrows. Try walking through the room edges, the left partition and
   the blackjack table. Movement should stop at each solid surface.
3. Press E away from the table: nothing opens. Walk north from the starting spot
   until the table outline lights up and the prompt says **Press E**.
4. Press E (or use **Play blackjack**). The floor pauses behind the existing HTML UI.
   Dismiss the existing daily bonus if prompted. Add a $1 chip and Deal.
5. Close with **Return to floor**, then release all keys. Your avatar stays where
   it was. Press E again: the same hand is present. Stand to settle it.
6. Check the balance in the table header and on the floor; both show the same
   amount. Escape also closes the overlay when focus is inside the game.
7. Resume walking. Leaving/reopening never places or refunds a bet by itself.

The room is keyboard-first. The canvas scales to small screens; the interaction
button also works with pointer input. Touch movement is outside this first room.

## Automated end-to-end check

```sh
npm install
npx playwright install chromium
npm run test:floor
```

The suite uses actual keyboard input and Arcade Physics. It checks walls/table
collision, normalized diagonals, proximity, E opening, frozen position, focus and
movement after closing, active-hand retention, real blackjack deduction/payout,
live wallet sync in both directions and another tab, Escape and shell return links.
Deck API fixtures remove live network and random outcomes from those tests.
Existing casino tests still exercise standalone blackjack and other games.

For read-only inspection, open `/floor/index.html?debug=1` and call
`CasinoFloorDebug.snapshot()` in the console. Normal pages expose no diagnostic API.
