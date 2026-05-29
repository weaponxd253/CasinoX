/* ============================================================
   BLACKJACK X — with betting + shared CasinoWallet
   ------------------------------------------------------------
   Phases:  'betting' → 'playing' → 'resolved' → 'betting'
   Wager is deducted on Deal; payout is added on settle.
   Requires wallet.js to be loaded before this file.
   ============================================================ */

let playerHand = [];
let dealerHand = [];
let deckId = '';
let playerScore = 0;
let dealerScore = 0;
let gameActive = false;
let soundEnabled = true;
let leaderboard = [];
let animationSpeed = 1;

/* ── Betting state ── */
const CHIPS = [1, 5, 10, 25];
const BLACKJACK_PAYOUT = 1.5;          // 3:2
let currentBet = 0;
let lastBet = 0;
let phase = 'betting';                  // 'betting' | 'playing' | 'resolved'

/* ── Wallet helpers (graceful fallback if wallet.js is missing) ── */
const hasWallet = () => typeof window !== 'undefined' && window.CasinoWallet;
const balance   = () => (hasWallet() ? CasinoWallet.get() : 100);
const minBet    = () => CHIPS[0];

/* ============================================================
   INIT
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  // Adopt the site-wide theme choice on load (default dark, matching other pages)
  applyTheme(localStorage.getItem('theme') === 'light' ? 'light' : 'dark');

  document.querySelectorAll('.chip-btn').forEach((btn) =>
    btn.addEventListener('click', () => addChip(parseInt(btn.dataset.value, 10)))
  );
  document.getElementById('clear-bet').addEventListener('click', clearBet);
  document.getElementById('max-bet').addEventListener('click', maxBet);
  document.getElementById('rebet').addEventListener('click', rebet);

  if (hasWallet()) CasinoWallet.onChange(updateBalanceUI);
  else updateBalanceUI(100);

  enterBetting();
});

/* ============================================================
   BETTING
   ============================================================ */
function addChip(value) {
  if (phase !== 'betting') return;
  const remaining = balance() - currentBet;
  if (value > remaining) return;
  currentBet = round(currentBet + value);
  updateBetUI();
}

function clearBet() {
  if (phase !== 'betting') return;
  currentBet = 0;
  updateBetUI();
}

function maxBet() {
  if (phase !== 'betting') return;
  currentBet = round(balance());
  updateBetUI();
}

function rebet() {
  if (phase !== 'betting' || lastBet <= 0) return;
  currentBet = round(Math.min(lastBet, balance()));
  updateBetUI();
}

function updateBetUI() {
  document.getElementById('bet-amount').textContent = `$${currentBet.toFixed(2)}`;
  refreshButtons();
}

function updateBalanceUI(bal) {
  const el = document.getElementById('bj-balance');
  if (el) el.textContent = Number(bal).toFixed(2);
  const pill = document.getElementById('bj-balance-pill');
  if (pill) { pill.classList.remove('bump'); void pill.offsetWidth; pill.classList.add('bump'); }
  refreshButtons();
}

/* ============================================================
   PHASE / BUTTON GATING
   ============================================================ */
function enterBetting() {
  phase = 'betting';
  currentBet = Math.min(currentBet, balance());
  updateBetUI();
}

function refreshButtons() {
  const betting  = phase === 'betting';
  const playing  = phase === 'playing';
  const broke    = betting && currentBet === 0 && balance() < minBet();
  const remaining = balance() - currentBet;

  // Chips: only enabled while betting and affordable
  document.querySelectorAll('.chip-btn').forEach((btn) => {
    const v = parseInt(btn.dataset.value, 10);
    btn.disabled = !betting || v > remaining;
  });

  setDisabled('clear-bet', !betting || currentBet === 0);
  setDisabled('max-bet',  !betting || balance() < minBet() || currentBet >= balance());
  setDisabled('rebet',    !betting || lastBet <= 0 || balance() < minBet());

  setDisabled('deal-button',  !betting || currentBet < minBet() || currentBet > balance());
  setDisabled('hit-button',   !playing);
  setDisabled('stand-button', !playing);
  setDisabled('reset-button', playing);   // can't bail mid-hand (bet is on the table)

  if (broke) {
    setResult('Out of chips — visit the Cashier in the lobby.');
  }
}

function setDisabled(id, state) {
  const el = document.getElementById(id);
  if (el) el.disabled = !!state;
}

/* ============================================================
   DEAL  (places the wager, then deals)
   ============================================================ */
async function deal() {
  if (phase !== 'betting') return;
  if (currentBet < minBet()) { setResult('Place a bet to deal.'); return; }
  if (hasWallet() && !CasinoWallet.canAfford(currentBet)) { setResult('Not enough chips.'); return; }

  if (hasWallet()) CasinoWallet.deduct(currentBet);   // wager on the table
  phase = 'playing';
  refreshButtons();
  await startRound();
}

async function startRound() {
  resetHands();
  setResult('Shuffling deck…');
  try {
    const res = await fetch('https://deckofcardsapi.com/api/deck/new/shuffle/?deck_count=1');
    const data = await res.json();
    deckId = data.deck_id;
    await dealInitialCards();
    if (phase === 'playing') {          // not already resolved by a natural
      gameActive = true;
      setDisabled('hit-button', false);
      setDisabled('stand-button', false);
    }
  } catch (e) {
    console.error(e);
    setResult('Could not connect. Returning your bet.');
    if (hasWallet()) CasinoWallet.add(currentBet);    // refund on failure
    enterBetting();
  }
}

async function dealInitialCards() {
  const playerEl = document.getElementById('player-cards');
  const dealerEl = document.getElementById('dealer-cards');
  const res = await fetch(`https://deckofcardsapi.com/api/deck/${deckId}/draw/?count=4`);
  const data = await res.json();
  const cards = data.cards;

  playerHand.push(cards[0], cards[2]);
  dealerHand.push(cards[1], cards[3]);

  await animateCardDealing(playerHand, playerEl);
  await animateCardDealing(dealerHand, dealerEl);

  playerScore = calculateHandValue(playerHand);
  dealerScore = calculateHandValue(dealerHand);
  document.getElementById('player-score').textContent = `Score: ${playerScore}`;
  document.getElementById('dealer-score').textContent = `Score: ${dealerScore}`;
  updateTotalScores();
  setResult('Your move…');

  // Naturals
  const playerNatural = playerScore === 21;
  const dealerNatural = dealerScore === 21;
  if (playerNatural && dealerNatural) resolve('Push — both have blackjack.', 'push');
  else if (playerNatural)             resolve('Blackjack! 3:2 payout.', 'blackjack');
  else if (dealerNatural)             resolve('Dealer blackjack.', 'lose');
}

/* ============================================================
   PLAY
   ============================================================ */
async function hit() {
  if (!gameActive || phase !== 'playing') return;
  const playerEl = document.getElementById('player-cards');
  try {
    const res = await fetch(`https://deckofcardsapi.com/api/deck/${deckId}/draw/?count=1`);
    const data = await res.json();
    const card = data.cards[0];
    playerHand.push(card);
    await animateCardDealing([card], playerEl);
    playerScore = calculateHandValue(playerHand);
    document.getElementById('player-score').textContent = `Score: ${playerScore}`;
    updateTotalScores();
    if (playerScore > 21) resolve('Bust! Dealer wins.', 'lose');
    else if (playerScore === 21) stand();
  } catch (e) {
    console.error(e);
  }
}

async function stand() {
  if (!gameActive || phase !== 'playing') return;
  gameActive = false;
  setDisabled('hit-button', true);
  setDisabled('stand-button', true);
  const dealerEl = document.getElementById('dealer-cards');
  try {
    while (dealerScore < 17) {
      const res = await fetch(`https://deckofcardsapi.com/api/deck/${deckId}/draw/?count=1`);
      const data = await res.json();
      const card = data.cards[0];
      dealerHand.push(card);
      await animateCardDealing([card], dealerEl);
      dealerScore = calculateHandValue(dealerHand);
      document.getElementById('dealer-score').textContent = `Score: ${dealerScore}`;
      updateTotalScores();
    }
    determineWinner();
  } catch (e) {
    console.error(e);
  }
}

function determineWinner() {
  if (dealerScore > 21)               resolve('Dealer busts — you win!', 'win');
  else if (dealerScore > playerScore) resolve('Dealer wins.', 'lose');
  else if (dealerScore < playerScore) resolve('You win!', 'win');
  else                                resolve("Push — it's a tie.", 'push');
}

/* ============================================================
   SETTLE  (apply payout, show net, return to betting)
   ============================================================ */
function resolve(message, outcome) {
  if (phase === 'resolved') return;     // guard against double-calls
  phase = 'resolved';
  gameActive = false;
  setResult(message);
  setDisabled('hit-button', true);
  setDisabled('stand-button', true);

  let payout = 0, net = 0;
  if (outcome === 'blackjack')   { payout = currentBet * (1 + BLACKJACK_PAYOUT); net =  currentBet * BLACKJACK_PAYOUT; }
  else if (outcome === 'win')    { payout = currentBet * 2;                       net =  currentBet; }
  else if (outcome === 'push')   { payout = currentBet;                           net =  0; }
  else                           { payout = 0;                                    net = -currentBet; }

  if (payout > 0 && hasWallet()) CasinoWallet.add(payout);

  const isPlayerWin = outcome === 'win' || outcome === 'blackjack';
  if (isPlayerWin) playSound('win-sound');
  else if (outcome === 'lose') playSound('lose-sound');

  const wm = document.getElementById('winning-message');
  wm.style.display = 'block';
  if (net > 0)      { wm.textContent = `★ +$${net.toFixed(2)} ★`; wm.style.color = 'var(--gold-light)'; }
  else if (net < 0) { wm.textContent = `−$${Math.abs(net).toFixed(2)}`; wm.style.color = '#e8877c'; }
  else              { wm.textContent = `Bet returned`; wm.style.color = 'var(--text-muted)'; }

  if (isPlayerWin) highlightWinner('player');
  updateLeaderboard(outcome, net);

  lastBet = currentBet;
  // Return to betting; result + cards stay on screen until the next deal.
  enterBetting();
}

/* ============================================================
   TABLE / HANDS
   ============================================================ */
function resetHands() {
  playerHand = [];
  dealerHand = [];
  playerScore = 0;
  dealerScore = 0;
  document.getElementById('player-cards').innerHTML = '';
  document.getElementById('dealer-cards').innerHTML = '';
  document.getElementById('player-score').textContent = 'Score: 0';
  document.getElementById('dealer-score').textContent = 'Score: 0';
  document.getElementById('player-total').textContent = '0';
  document.getElementById('dealer-total').textContent = '0';
  document.getElementById('winning-message').style.display = 'none';
  removeWinnerHighlight();
}

// Reset / clear the table back to a fresh betting state (only when not mid-hand)
function resetTable() {
  if (phase === 'playing') return;
  resetHands();
  setResult('—');
  clearBet();
  enterBetting();
}

function animateCardDealing(hand, element) {
  return new Promise((resolve) => {
    hand.forEach((card, index) => {
      setTimeout(() => {
        const cardEl = document.createElement('div');
        cardEl.classList.add('card');
        const img = document.createElement('img');
        img.src = card.image;
        img.alt = `${card.value} of ${card.suit}`;
        cardEl.appendChild(img);
        element.appendChild(cardEl);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => cardEl.classList.add('show'));
        });
        playSound('card-draw-sound');
        if (index === hand.length - 1) setTimeout(resolve, 400 / animationSpeed);
      }, index * (380 / animationSpeed));
    });
  });
}

function calculateHandValue(hand) {
  let value = 0, aces = 0;
  hand.forEach((card) => {
    if (card.value === 'ACE') { aces++; value += 11; }
    else if (['KING', 'QUEEN', 'JACK'].includes(card.value)) value += 10;
    else value += parseInt(card.value, 10);
  });
  while (value > 21 && aces > 0) { value -= 10; aces--; }
  return value;
}

/* ============================================================
   UI HELPERS
   ============================================================ */
function setResult(msg) { document.getElementById('result-message').textContent = msg; }
function round(n) { return Math.max(0, parseFloat(Number(n).toFixed(2))); }

function applyTheme(t) {
  const light = t === 'light';
  // Blackjack's stylesheet keys off body.light; also set the site-wide classes
  // + data-theme so the choice is consistent with every other page.
  document.documentElement.dataset.theme = light ? 'light' : 'dark';
  document.body.classList.toggle('light', light);
  document.body.classList.toggle('light-theme', light);
  document.body.classList.toggle('dark-theme', !light);
  localStorage.setItem('theme', light ? 'light' : 'dark');
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = light ? '☾ Dark Mode' : '☀ Light Mode';
}

function toggleTheme() {
  const next = localStorage.getItem('theme') === 'light' ? 'dark' : 'light';
  applyTheme(next);
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  document.getElementById('sound-toggle').textContent = soundEnabled ? '♪ Mute' : '♪ Unmute';
}

function playSound(id) {
  if (!soundEnabled) return;
  const el = document.getElementById(id);
  if (el) el.play().catch(() => {});
}

function updateSpeed(val) {
  animationSpeed = parseFloat(val);
  document.getElementById('speed-value').textContent = parseFloat(val).toFixed(1);
}

function updateTotalScores() {
  document.getElementById('player-total').textContent = playerScore;
  document.getElementById('dealer-total').textContent = dealerScore;
}

function highlightWinner() {
  document.getElementById('table-wrap').classList.add('winner-glow');
}

function removeWinnerHighlight() {
  document.getElementById('table-wrap').classList.remove('winner-glow');
}

function updateLeaderboard(outcome, net) {
  const list = document.getElementById('leaderboard-list');
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  let label;
  if (outcome === 'push') label = `🂢 Push`;
  else if (net > 0)       label = `🂡 Won +$${net.toFixed(2)}`;
  else                    label = `🂢 Lost −$${Math.abs(net).toFixed(2)}`;

  leaderboard.unshift(`${label} — ${time}`);
  if (leaderboard.length > 10) leaderboard.pop();

  list.innerHTML = '';
  leaderboard.forEach((e, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${e}</span><span style="opacity:0.4;font-size:11px;">#${i + 1}</span>`;
    list.appendChild(li);
  });
}
