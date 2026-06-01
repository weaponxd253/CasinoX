/* Coin Flip — built on CasinoShell. Notice how little this file does:
   the header, balance, theme, sound, confetti and game-over modal all
   come from the shell. This file is just the *game*. */

CasinoShell.mount({ name: 'Coin Flip', subtitle: 'Double or Nothing' });

const MIN_BET = 1;
const BET_STEP = 5;
let bet = 5;
let flipping = false;

const coin     = document.getElementById('coin');
const resultEl = document.getElementById('cf-result');
const betValEl = document.getElementById('bet-val');

function wallet() { return CasinoShell.wallet; }
function renderBet() { betValEl.textContent = `$${bet.toFixed(2)}`; }

document.getElementById('bet-minus').addEventListener('click', () => {
  if (flipping) return;
  bet = Math.max(MIN_BET, bet - BET_STEP);
  renderBet();
});
document.getElementById('bet-plus').addEventListener('click', () => {
  if (flipping) return;
  bet = Math.min(bet + BET_STEP, Math.max(MIN_BET, wallet().get()));
  renderBet();
});
document.getElementById('flip-heads').addEventListener('click', () => flip('heads'));
document.getElementById('flip-tails').addEventListener('click', () => flip('tails'));

let spins = 0;
function flip(choice) {
  if (flipping) return;
  const w = wallet();
  if (!w.canAfford(bet)) { CasinoShell.toast('Not enough chips for that bet.'); return; }

  flipping = true;
  w.deduct(bet);
  CasinoShell.awardXp(bet);
  CasinoShell.sound.click();
  resultEl.textContent = 'Flipping…';

  const outcome = Math.random() < 0.5 ? 'heads' : 'tails';
  spins += 5;                                   // keep spinning forward
  const end = spins * 360 + (outcome === 'tails' ? 180 : 0);
  coin.style.transform = `rotateY(${end}deg)`;

  setTimeout(() => {
    flipping = false;
    if (outcome === choice) {
      const payout = bet * 2;
      w.add(payout);
      resultEl.textContent = `${cap(outcome)}! You win $${payout.toFixed(2)}.`;
      CasinoShell.celebrate(bet);               // net win == bet
    } else {
      resultEl.textContent = `${cap(outcome)}. You lose $${bet.toFixed(2)}.`;
      CasinoShell.sound.lose();
      if (!w.canAfford(MIN_BET)) CasinoShell.gameOver();
    }
    // keep the bet within what's now affordable
    bet = Math.max(MIN_BET, Math.min(bet, w.get()));
    renderBet();
  }, 850);
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

renderBet();
