/* Coin Flip — built on CasinoShell. Notice how little this file does:
   the header, balance, theme, sound, confetti and game-over modal all
   come from the shell. This file is just the *game*. */

CasinoShell.mount({ name: 'Coin Flip', subtitle: 'Double or Nothing' });

const MIN_BET = 1;
const BET_STEP = 5;
const MAX_RIDES = 4;      // win, then up to 4 rides: at most a 32× pot
let bet = 5;
let flipping = false;

/* Let it ride: after a win the pot stays on the table. Flip again to
   double it, or cash out. pot = 0 means no ride in progress. */
let pot = 0;
let rides = 0;

const coin     = document.getElementById('coin');
const resultEl = document.getElementById('cf-result');
const betValEl = document.getElementById('bet-val');

function wallet() { return CasinoShell.wallet; }
function renderBet() { betValEl.textContent = `$${bet.toFixed(2)}`; }

// Hotel event helper — queues events for the hotel to apply
function hotelEvent(type, data) {
  // Queued for the hotel to apply — see hotel-events.js
  window.HotelEvents?.push(type, data);
}

function betDown() {
  if (flipping || pot) return;
  bet = Math.max(MIN_BET, bet - BET_STEP);
  renderBet();
renderRide();
}
function betUp() {
  if (flipping || pot) return;
  bet = Math.min(bet + BET_STEP, Math.max(MIN_BET, wallet().get()));
  renderBet();
}
document.getElementById('bet-minus').addEventListener('click', betDown);
document.getElementById('bet-plus').addEventListener('click', betUp);
document.getElementById('flip-heads').addEventListener('click', () => flip('heads'));
document.getElementById('flip-tails').addEventListener('click', () => flip('tails'));
document.getElementById('cash-out').addEventListener('click', cashOut);

CasinoShell.registerShortcuts([
  { keys: ['h', 'ArrowLeft'], label: 'Bet heads', run: () => flip('heads') },
  { keys: ['t', 'ArrowRight'], label: 'Bet tails', run: () => flip('tails') },
  { keys: ['ArrowUp', '+', '='], label: 'Raise bet', run: betUp },
  { keys: ['ArrowDown', '-'], label: 'Lower bet', run: betDown },
  { keys: ['c'], label: 'Cash out the pot', run: () => cashOut() },
]);

// Leaving mid-ride never forfeits the pot: it's banked automatically.
window.addEventListener('pagehide', () => { if (pot && !flipping) cashOut({ quiet: true }); });

let spins = 0;
function flip(choice) {
  if (flipping) return;
  const w = wallet();
  const riding = pot > 0;
  if (!riding) {
    if (!w.canAfford(bet)) { CasinoShell.toast('Not enough chips for that bet.'); return; }
    w.deduct(bet);
    CasinoShell.awardXp(bet);
    hotelEvent('chips_wagered', { amount: bet });
  }
  const stake = riding ? pot : bet;

  flipping = true;
  renderRide();
  CasinoShell.sound.click();
  resultEl.textContent = riding ? `Riding $${stake.toFixed(2)}…` : 'Flipping…';

  const outcome = Math.random() < 0.5 ? 'heads' : 'tails';
  spins += 5;                                   // keep spinning forward
  const end = spins * 360 + (outcome === 'tails' ? 180 : 0);
  coin.style.transform = `rotateY(${end}deg)`;

  setTimeout(() => {   // the coin's spin; instant for reduced motion
    flipping = false;
    if (outcome === choice) {
      hotelEvent('coin_flip_win');
      if (riding) rides++;
      pot = stake * 2;
      if (rides >= MAX_RIDES) {
        resultEl.textContent = `${cap(outcome)}! Table limit reached — pot of $${pot.toFixed(2)} cashed out.`;
        cashOut();
        return;
      }
      resultEl.textContent = `${cap(outcome)}! Pot $${pot.toFixed(2)} — let it ride or cash out.`;
      CasinoShell.announce(`${cap(outcome)}. You win. The pot is $${pot.toFixed(2)}. Flip again to ride for $${(pot * 2).toFixed(2)}, or press C to cash out.`);
      CasinoShell.sound.win();
    } else {
      resultEl.textContent = riding
        ? `${cap(outcome)}. The $${stake.toFixed(2)} pot is gone.`
        : `${cap(outcome)}. You lose $${bet.toFixed(2)}.`;
      CasinoShell.announce(resultEl.textContent);
      CasinoShell.sound.lose();
      pot = 0;
      rides = 0;
      if (!w.canAfford(MIN_BET)) CasinoShell.gameOver();
    }
    // keep the bet within what's now affordable
    bet = Math.max(MIN_BET, Math.min(bet, w.get()));
    renderBet();
    renderRide();
  }, CasinoShell.reducedMotion() ? 120 : 850);
}

function cashOut({ quiet = false } = {}) {
  if (!pot || flipping) return;
  const banked = pot;
  const net = banked - bet;
  wallet().add(banked);
  pot = 0;
  rides = 0;
  if (!quiet) {
    if (!/cashed out/.test(resultEl.textContent)) resultEl.textContent = `Cashed out $${banked.toFixed(2)}.`;
    CasinoShell.announce(`Cashed out $${banked.toFixed(2)}.`);
    CasinoShell.celebrate(net);
  }
  renderBet();
  renderRide();
}

/* Ride panel + button labels follow the state: "Bet Heads" or "Ride Heads". */
function renderRide() {
  const panel = document.getElementById('ride-panel');
  panel.hidden = !pot;
  if (pot) {
    document.getElementById('ride-pot').textContent = `$${pot.toFixed(2)}`;
    document.getElementById('ride-next').textContent = rides + 1 >= MAX_RIDES
      ? `Last ride: win to bank $${(pot * 2).toFixed(2)}`
      : `Ride ${rides + 1} of ${MAX_RIDES}: win to make it $${(pot * 2).toFixed(2)}`;
    document.getElementById('cash-out').textContent = `Cash out $${pot.toFixed(2)}`;
  }
  document.getElementById('cash-out').disabled = flipping;
  document.getElementById('flip-heads').textContent = pot ? 'Ride Heads ♛' : 'Bet Heads ♛';
  document.getElementById('flip-tails').textContent = pot ? 'Ride Tails ✦' : 'Bet Tails ✦';
  document.getElementById('bet-minus').disabled = !!pot;
  document.getElementById('bet-plus').disabled = !!pot;
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

renderBet();
