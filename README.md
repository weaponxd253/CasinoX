# Casino X — Royale Collection

A browser-based casino hub plus hotel-management sim with a shared bankroll, meta-game progression, local save data, and a modular shell system for adding new games quickly. Built with vanilla JS, no build tools or frameworks required for runtime.

**Live:** `weaponxd253.github.io` · **Stack:** HTML · CSS · Vanilla JS · GSAP · Web Audio API · localStorage · Playwright tests

---

## Games & Modes

| Game / Mode | Status | Min Bet | Notes |
|---|---|---|---|
| Lucky Reels | ✅ Live | $0.60 | Slots · 8 symbols · jackpot 50× |
| Blackjack X | ✅ Live | $1 | 3:2 payout · dealer stands on 17 |
| Coin Flip | ✅ Live | $1 | Double or nothing |
| Hotel Manager | ✅ Live / in UX tuning | — | Idle hotel sim · staff, guests, operations, guided onboarding |
| Roulette Royale | 🔒 Soon | — | |
| Texas Hold'em | 🔒 Soon | — | |

---

## Project Structure

```
CasinoX/
│
├── index.html              ← Lobby (site entry point)
├── lobby.css               ← Lobby layout + light-theme overrides
│
├── casino-shell.css        ← Shared design system (tokens, header, modals)
├── casino-shell.js         ← Shared chrome + meta-game engine
├── casino-mobile.css       ← Full mobile layout pass (link last on every page)
├── wallet.js               ← Shared bankroll via localStorage
│
├── casino-theme.css        ← Legacy stylesheet retained for older theme rules
├── package.json            ← Playwright test scripts
├── playwright.config.js    ← E2E test config
├── tests/                  ← Browser tests
├── SHELL-GUIDE.md          ← How to add a new game
├── HOTEL-SCHEMA.md         ← Hotel state/schema notes
├── README.md               ← This file
│
├── slots/
│   ├── index.html          ← On the shell ✓
│   ├── styles.css          ← Slot-specific styles
│   └── script.js           ← Game logic
│
├── blackjack/
│   ├── index.html          ← On the shell ✓
│   ├── styles.css          ← Blackjack-specific table styles
│   ├── betting.css         ← Chip + wager UI
│   ├── script.js           ← Game logic + betting system + XP
│   └── sounds/
│       └── README.txt      ← Drop card-draw.mp3 · win.wav · lose.wav here
│
├── coinflip/
│   ├── index.html          ← On the shell ✓
│   ├── styles.css          ← Coin flip styles
│   └── game.js             ← Game logic (~50 lines, reference implementation)
│
└── hotel/
    ├── index.html          ← Hotel Manager dashboard
    ├── hotel.css           ← Dashboard, onboarding, staff/guest UI
    ├── hotel-state.js      ← `hotelGameState` persistence + migrations
    ├── hotel-engine.js     ← Income, calendar, satisfaction, reports
    ├── hotel-ui.js         ← Dashboard rendering + guided onboarding
    ├── hotel-config.js     ← Department/upgrade/static config
    ├── hotel-bridge.js     ← Casino-to-hotel sync hooks
    ├── hotel-guests.js     ← Guest simulation helpers
    ├── hotel-guest-pool.js ← Guest profile pool
    ├── checkin/            ← Check-In Rush operation
    ├── rooms/              ← Rooms operation
    ├── restaurant/         ← Restaurant operation
    ├── bar/                ← Bar operation
    ├── entertainment/      ← Entertainment operation
    └── spa/                ← Spa operation
```

---

## Running Locally

The site uses `localStorage` for persistence, which requires an HTTP origin. It will not work correctly from `file://` across pages. Serve it from the repo root:

```bash
# Python (built-in)
cd CasinoX
python3 -m http.server 8000

# Node (if you have http-server)
npx http-server . -p 8000
```

Then open `http://localhost:8000`.

Blackjack pulls cards from `deckofcardsapi.com`, so it needs an internet connection to deal. Every other game works fully offline.

### Testing

Install dev dependencies before running the browser tests:

```bash
npm install
npm test
```

`npm test` runs `playwright test`. If you see `playwright is not recognized`, install dependencies with `npm install` first.

---

## Architecture

### The Shell

`casino-shell.js` + `casino-shell.css` are the foundation every game builds on. Mounting the shell gives a game:

- Injected header (logo, balance pill, XP bar, daily bonus, lobby link, theme + sound toggles)
- Shared bankroll via `CasinoShell.wallet`
- Light/dark theme (driven by `<html data-theme>`, persisted to `localStorage`)
- Web Audio sound effects (no audio files needed)
- Toast notifications
- Confetti + big-number win celebration
- Game-over modal with Cashier shortcut
- Info/rules modal for help content
- Meta-game (XP, levels, daily bonus — see below)

#### Shell API

```js
// Mount once, at the top of your game script
CasinoShell.mount({ name: 'Game Name', subtitle: 'Tagline' });

// Wallet
const w = CasinoShell.wallet;
w.get()              // current balance
w.deduct(bet)        // place a wager
w.add(payout)        // pay a win
w.canAfford(bet)     // boolean check before deducting
w.reset()            // back to $100 (Cashier)

// XP (call on every wager — handles level-ups automatically)
CasinoShell.awardXp(bet);

// UI helpers
CasinoShell.toast('message');
CasinoShell.celebrate(netWin);          // confetti + +$X flourish + sound
CasinoShell.gameOver({ title, message }); // out-of-chips modal
CasinoShell.info(title, htmlString);    // rules / paytable modal

// Sound
CasinoShell.sound.click();
CasinoShell.sound.win();
CasinoShell.sound.jackpot();
CasinoShell.sound.lose();
CasinoShell.sound.tone(freq, type, duration, gain, delay); // custom

// Theme + profile
CasinoShell.theme.toggle();
CasinoShell.profile   // { xp, level, into, need, streak }
```

Pages with their own header (e.g. the lobby) call `CasinoShell.standalone()` instead of `mount()` — it wires the meta-game without injecting a header.

### Wallet

`wallet.js` exposes a singleton `CasinoWallet` — one balance in `localStorage` under the key `casinoBalance`. Every game and the lobby read from and write to the same store. Changes sync across tabs instantly.

```js
CasinoWallet.onChange((balance) => { /* update your display */ });
```

### Meta-game (XP · Levels · Daily Bonus)

All stored under `casinoProfile` in `localStorage`. Shared across every game.

**XP and levels:** 1 XP per $1 wagered (minimum 1 per bet). Advancing from level `L` requires `50 × L` XP. Each level-up awards `25 × L` chips and fires a celebration. The header shows a live level badge and XP progress bar.

**Daily bonus:** One claim per calendar day. A 7-day escalating streak ($50 / $75 / $100 / $150 / $250 / $400 / $750). Missing a day resets the streak to Day 1. The gift icon glows red when a claim is ready; the shell auto-opens the modal once per session.

**Wiring a game into the meta-game** is one line, added wherever a wager is placed:

```js
w.deduct(bet);
CasinoShell.awardXp(bet);  // always call after deduct
```

### Theme

The shell drives theming via `<html data-theme="dark|light">`. CSS variables respond to this attribute — no per-game theme JavaScript needed. The shell also mirrors legacy body classes (`.light-theme`, `.dark-theme`, `.light`) for backward compatibility with Blackjack's stylesheet.

Theme is persisted to `localStorage` under the key `theme`. Changing it in any game or the lobby propagates everywhere on next load.

### Mobile Layout

`casino-mobile.css` activates at `≤ 768px` (with a `≤ 380px` micro-breakpoint for small Androids). It must be linked **last** on every page.

Key mobile behaviours it applies:

- Shell header collapses to a compact 2-column grid
- Slots: bet pills become a horizontal scroll row; spin/cashier/help pins to a fixed bottom tray
- Blackjack: Deal/Hit/Stand/Clear pins to a fixed 2×2 sticky grid at the bottom; disabled states are dramatically more visible (`opacity: 0.10` + greyscale)
- Coin Flip: choice buttons go full-width
- Win overlay repositions above the sticky bar so it never covers cards or reels
- Safe-area insets (`env(safe-area-inset-bottom)`) for notched phones

### Hotel Manager

The Hotel Manager is a separate management layer under `hotel/`. It uses one `localStorage` key, `hotelGameState`, with migrations in `hotel-state.js`.

Core systems:

- **Departments:** rooms, casino floor, restaurant, bar, entertainment, spa, and lobby-facing operations.
- **Staff:** roster, assignment, coverage, morale, payroll, applicants, training, promotion, and reports.
- **Guests:** population, guest roster, demand, arrivals/departures, guest types, and check-in boosts.
- **Calendar:** morning/afternoon/evening/night phases with income, payroll, satisfaction, and shift reports.
- **Casino bridge:** reads casino-side progress and applies hotel bonuses back into casino play.

#### Guided Onboarding

New hotel saves start in Guided mode. The first-run flow intentionally narrows the dashboard so new players have one obvious next action:

1. Assign staff to cover service.
2. Upgrade a department.
3. Run Check-In Rush.
4. Advance time.
5. Review the first shift report.

Players can switch between **Guided** and **Expert** from the dashboard. Expert mode opens the full dashboard immediately. Existing saves migrate into Expert mode so returning players are not forced through onboarding.

For local UX testing, open the hotel with `?onboardingDebug=1` or press `Ctrl+Shift+G` on the hotel dashboard. This shows an onboarding test panel with fresh-user, skipped-guidance, expert, existing-save, and guided-complete scenarios. The same helpers are available in the console as `window.HotelOnboardingDebug`.

---

## Adding a New Game

Every game is a folder with three files. Full details in `SHELL-GUIDE.md`. The short version:

**1. Create the folder and HTML**

```html
<!-- yourgame/index.html -->
<link rel="stylesheet" href="../casino-shell.css">
<link rel="stylesheet" href="../casino-mobile.css">
<link rel="stylesheet" href="styles.css">

<main class="game-stage">
  <!-- your game markup -->
</main>

<script src="../wallet.js"></script>
<script src="../casino-shell.js"></script>
<script src="game.js"></script>
```

**2. Mount and write your game logic**

```js
// game.js
CasinoShell.mount({ name: 'Your Game', subtitle: 'Tagline' });

const w = CasinoShell.wallet;

function placeBet(bet) {
  if (!w.canAfford(bet)) return;
  w.deduct(bet);
  CasinoShell.awardXp(bet);
  // ... your game logic
}

function settleWin(net) {
  w.add(bet + net);
  CasinoShell.celebrate(net);
}
```

**3. Style with shell tokens** (`--bg-2`, `--surface`, `--text`, `--gold`, `--gold-light`, `--border`, etc.)  — the page themes automatically.

**4. Add a lobby tile** — copy an existing `.game-card` block in `casino/index.html`.

See `coinflip/` for a complete working example in ~50 lines of JS.

---

## Known Issues & Outstanding Work

**Hotel onboarding is still being tuned.** The current Guided/Expert flow is implemented, but first-time-user clarity should continue to be checked with real play sessions and screenshots.

**Playwright must be installed for tests.** `npm test` depends on `@playwright/test` from `devDependencies`. Run `npm install` before using the test script.

**Blackjack is now on the shell.** It mounts `CasinoShell`, shares the same bankroll/header controls as the other live casino games, and awards XP when a hand is dealt. Its table and chip UI still keep their own game-specific styles.

**`casino-theme.css` is legacy.** It remains in the repo for older theme/header rules, but the active casino pages use `casino-shell.css`, per-game styles, and `casino-mobile.css`. Future cleanup can confirm whether anything still references it and remove it if not.

**Blackjack needs audio files.** The deck API call and card animations work; sounds don't play until you add `card-draw.mp3`, `win.wav`, and `lose.wav` to `blackjack/sounds/`. Shell-based games use synthesised Web Audio and need no files.

**No backend.** Everything is `localStorage`. This means the bankroll is device-specific and can be edited by the user. Fine for the current scope; a backend + accounts would be needed for shared leaderboards, cross-device play, or anti-cheat.

---

## Planned Features

- [x] Migrate Blackjack onto the shell and award XP on wagers
- [x] Add Hotel Manager foundation, staff, guests, operations, and guided onboarding
- [ ] Run a first-time-user pass on Hotel Manager onboarding and tune any confusing steps
- [ ] Expand Hotel Manager reports, late-game goals, and prestige hooks
- [ ] Persistent player profile page (lifetime stats, achievements)
- [ ] Daily bonus timer (free-chip refill every N hours)
- [ ] Roulette Royale (simplified red/black/number board, GSAP wheel spin)
- [ ] Mines (high-tension push-your-luck format)
- [ ] Video Poker — Jacks or Better
- [ ] PWA / installable (manifest + service worker)

---

## Tech Stack

| What | How |
|---|---|
| Language | Vanilla JS (ES2020, no bundler) |
| Styling | Plain CSS with custom properties |
| Animation | GSAP 3 (slots + coin flip), CSS transitions everywhere else |
| Sound | Web Audio API (synthesised tones — no files for shell games) |
| Cards (Blackjack) | [Deck of Cards API](https://deckofcardsapi.com) |
| Persistence | `localStorage` |
| Fonts | Playfair Display · Cormorant Garamond (Google Fonts) |
| Icons | Font Awesome 6 |
| Hosting | GitHub Pages |
