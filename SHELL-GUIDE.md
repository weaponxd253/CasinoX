# Building a new game on the Casino X shell

Every game is a folder under `casino/` with three files. The shell handles the
header, balance, theme, sound, confetti and game-over modal — your code is just
the game.

## The recipe (≈ 5 steps)

1. **Make a folder:** `casino/yourgame/`
2. **Create `index.html`** — copy `coinflip/index.html` as a starting point. The
   only required pieces are the four `<link>`/`<script>` tags and a
   `<main class="game-stage">` for your markup:

   ```html
   <link rel="stylesheet" href="../casino-shell.css">
   <link rel="stylesheet" href="styles.css">
   ...
   <main class="game-stage"> <!-- your game --> </main>
   <script src="../wallet.js"></script>
   <script src="../casino-shell.js"></script>
   <script src="game.js"></script>
   ```

3. **Create `game.js`** — mount the shell, then write your game:

   ```js
   CasinoShell.mount({ name: 'Your Game', subtitle: 'Tagline' });

   const w = CasinoShell.wallet;     // the shared bankroll
   // place a bet:   w.deduct(bet)
   // pay a win:     w.add(payout)
   // check funds:   w.canAfford(bet)
   ```

4. **Create `styles.css`** — style off the shell's semantic tokens so it themes
   automatically: `--bg-2`, `--surface`, `--text`, `--text-dim`, `--gold`,
   `--gold-light`, `--border`, `--font-display`, `--font-body`.
5. **Add a lobby tile** in `casino/index.html` (copy an existing `.game-card`).

## Shell API cheat-sheet

| Call | Does |
|---|---|
| `CasinoShell.mount({name, subtitle, lobbyHref?, footer?})` | Injects chrome, wires balance/theme/sound. Call once, first. |
| `CasinoShell.wallet` | The shared `CasinoWallet` (`get/add/deduct/canAfford/reset`). |
| `CasinoShell.sound.click() / win() / jackpot() / lose()` | Built-in synth sounds (no audio files needed). |
| `CasinoShell.sound.tone(freq,type,dur,gain,delay)` | Custom one-off tone. |
| `CasinoShell.toast('message')` | Transient notification. |
| `CasinoShell.celebrate(netWin)` | Confetti + big `+$X` flourish + sound. |
| `CasinoShell.gameOver({title?, message?})` | Out-of-chips modal with Cashier + Lobby. |
| `CasinoShell.info(title, html)` | Dismissible modal for rules/paytables/help. |
| `CasinoShell.awardXp(wager)` | Grant XP scaled to a wager (call on each bet). Handles level-ups + chip rewards. |
| `CasinoShell.profile` | Read-only `{ xp, level, into, need, streak }`. |
| `CasinoShell.dailyBonus.available() / .open() / .claim()` | Daily streak bonus. The shell auto-prompts once per session. |
| `CasinoShell.standalone(cfg)` | Wire the meta-game WITHOUT injecting a header (for pages that have their own, like the lobby). Add elements with ids `shell-level`, `shell-xp-fill`, `shell-bonus-btn` and they're picked up automatically. |
| `CasinoShell.theme.toggle()` | Flip light/dark (also a header button). |

## Notes

- **Theme:** the shell drives `<html data-theme="dark|light">` and persists it to
  the `theme` key. It also mirrors the legacy `.light-theme/.dark-theme/.light`
  body classes so the existing slot and blackjack stylesheets keep working. New
  games should style off `[data-theme]` via the tokens above — no per-game theme
  code required.
- **No Bootstrap needed** for shell chrome (modal/toast are built in).
- The shell **supersedes `casino-theme.css`** for new games. The slot/blackjack
  can migrate to it later; until then both files can coexist.

See `coinflip/` for a complete ~50-line reference game.

## Meta-game (XP, levels, daily bonus)

These live in the shell, so every game shares one profile (stored under
`casinoProfile`). To make a game feed the system, award XP wherever the player
wagers — one line:

```js
w.deduct(bet);
CasinoShell.awardXp(bet);   // 1 XP per $1 wagered, min 1; auto handles level-ups
```

- **Levels:** advancing from level *L* needs `50·L` XP; each level-up pays
  `25·L` chips and fires a celebration. The header shows a live Lv + XP bar.
- **Daily bonus:** one claim per day, a 7-day escalating streak
  ($50→$750, resets on a missed day). The gift button glows when ready and the
  shell auto-opens the claim modal once per session.
- **Blackjack** won't participate until it's migrated onto the shell (it still
  has its own header). Add the `awardXp` line during that migration.
