/* ============================================================
   BLACKJACK X — on CasinoShell
   ------------------------------------------------------------
   Shell provides: header · balance · theme · sound · toast ·
   confetti · gameOver modal · XP/daily bonus.
   This file is the game + betting system only.
   ============================================================ */

/* ── Hotel event helper ─────────────────────────────────────
   Writes directly to the hotel's localStorage state so the
   hotel knows about casino activity without needing hotel
   scripts loaded on this page.                              */
function hotelEvent(type, data) {
  try {
    const raw = localStorage.getItem('hotelGameState');
    if (!raw) return;
    const state = JSON.parse(raw);
    if (!state?.casinoBridge?.events) return;
    const e = state.casinoBridge.events;
    if (type === 'blackjack_win')   e.blackjackWins++;
    else if (type === 'blackjack_loss') e.blackjackLosses++;
    else if (type === 'chips_wagered')  e.totalChipsWagered += (Number(data?.amount) || 0);
    localStorage.setItem('hotelGameState', JSON.stringify(state));
  } catch (_) { /* hotel not initialised */ }
}

/* ── State ────────────────────────────────────────────────── */
let playerHand    = [];
let dealerHand    = [];
let deckId        = '';
let playerScore   = 0;
let dealerScore   = 0;
let gameActive    = false;
let leaderboard   = [];
let animationSpeed = 1;

/* ── Betting ──────────────────────────────────────────────── */
const CHIPS = [1, 5, 10, 25];
const BLACKJACK_PAYOUT = 1.5;
let currentBet = 0;
let lastBet    = 0;
let phase      = 'betting';     // 'betting' | 'playing' | 'resolved'

const w       = () => CasinoShell.wallet;
const balance = () => w()?.get() ?? 0;
const minBet  = () => CHIPS[0];

/* ── Init ─────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  CasinoShell.mount({ name: 'Blackjack X', subtitle: 'Casino Edition' });

  // Refresh buttons whenever wallet changes (shell handles balance display)
  if (window.CasinoWallet) CasinoWallet.onChange(() => refreshButtons());

  document.querySelectorAll('.chip-btn').forEach(btn =>
    btn.addEventListener('click', () => addChip(parseInt(btn.dataset.value, 10)))
  );
  document.getElementById('clear-bet').addEventListener('click', clearBet);
  document.getElementById('max-bet').addEventListener('click',   maxBet);
  document.getElementById('rebet').addEventListener('click',    rebet);

  enterBetting();
});

/* ── Betting controls ─────────────────────────────────────── */
function addChip(value) {
  if (phase !== 'betting') return;
  if (value > balance() - currentBet) return;
  currentBet = round(currentBet + value);
  updateBetUI();
}
function clearBet() {
  if (phase !== 'betting') return;
  currentBet = 0; updateBetUI();
}
function maxBet() {
  if (phase !== 'betting') return;
  currentBet = round(balance()); updateBetUI();
}
function rebet() {
  if (phase !== 'betting' || lastBet <= 0) return;
  currentBet = round(Math.min(lastBet, balance())); updateBetUI();
}
function updateBetUI() {
  document.getElementById('bet-amount').textContent = `$${currentBet.toFixed(2)}`;
  refreshButtons();
}

/* ── Phase gating ─────────────────────────────────────────── */
function enterBetting() {
  phase = 'betting';
  currentBet = Math.min(currentBet, balance());
  updateBetUI();
}

function refreshButtons() {
  const betting   = phase === 'betting';
  const playing   = phase === 'playing';
  const broke     = betting && currentBet === 0 && balance() < minBet();
  const remaining = balance() - currentBet;

  document.querySelectorAll('.chip-btn').forEach(btn => {
    btn.disabled = !betting || parseInt(btn.dataset.value, 10) > remaining;
  });
  setDisabled('clear-bet',   !betting || currentBet === 0);
  setDisabled('max-bet',     !betting || balance() < minBet() || currentBet >= balance());
  setDisabled('rebet',       !betting || lastBet <= 0 || balance() < minBet());
  setDisabled('deal-button', !betting || currentBet < minBet() || currentBet > balance());
  setDisabled('hit-button',  !playing);
  setDisabled('stand-button',!playing);
  setDisabled('reset-button', playing);

  // Visual signal that a hand is mid-play (mobile CSS uses this)
  document.body.classList.toggle('mid-hand', playing);

  if (broke) setResult('Out of chips — visit the Cashier to top up.');
}

function setDisabled(id, state) {
  const el = document.getElementById(id);
  if (el) el.disabled = !!state;
}

/* ── Deal ─────────────────────────────────────────────────── */
async function deal() {
  if (phase !== 'betting') return;
  if (currentBet < minBet())           { setResult('Place a bet first.'); return; }
  if (!w()?.canAfford(currentBet))     { setResult('Not enough chips.');  return; }

  w().deduct(currentBet);
  CasinoShell.awardXp(currentBet);
  hotelEvent('chips_wagered', { amount: currentBet });

  phase = 'playing';
  refreshButtons();
  await startRound();
}

async function startRound() {
  resetHands();
  setResult('Shuffling deck…');
  try {
    const res  = await fetch('https://deckofcardsapi.com/api/deck/new/shuffle/?deck_count=1');
    const data = await res.json();
    deckId = data.deck_id;
    await dealInitialCards();
    if (phase === 'playing') {
      gameActive = true;
      setDisabled('hit-button',  false);
      setDisabled('stand-button',false);
    }
  } catch (e) {
    console.error(e);
    setResult('Could not connect. Returning your bet.');
    w()?.add(currentBet);
    enterBetting();
  }
}

async function dealInitialCards() {
  const res   = await fetch(`https://deckofcardsapi.com/api/deck/${deckId}/draw/?count=4`);
  const data  = await res.json();
  const cards = data.cards;

  playerHand.push(cards[0], cards[2]);
  dealerHand.push(cards[1], cards[3]);

  await animateCardDealing(playerHand, document.getElementById('player-cards'));
  await animateCardDealing(dealerHand, document.getElementById('dealer-cards'));

  playerScore = calcHand(playerHand);
  dealerScore = calcHand(dealerHand);
  document.getElementById('player-score').textContent = `Score: ${playerScore}`;
  document.getElementById('dealer-score').textContent = `Score: ${dealerScore}`;
  updateTotalScores();
  setResult('Your move…');

  const pNat = playerScore === 21;
  const dNat = dealerScore === 21;
  if (pNat && dNat)  resolve('Push — both have Blackjack.',  'push');
  else if (pNat)     resolve('Blackjack! 3:2 payout.',       'blackjack');
  else if (dNat)     resolve('Dealer Blackjack.',            'lose');
}

/* ── Play ─────────────────────────────────────────────────── */
async function playerHit() {
  if (!gameActive || phase !== 'playing') return;
  try {
    const res  = await fetch(`https://deckofcardsapi.com/api/deck/${deckId}/draw/?count=1`);
    const data = await res.json();
    const card = data.cards[0];
    playerHand.push(card);
    await animateCardDealing([card], document.getElementById('player-cards'));
    playerScore = calcHand(playerHand);
    document.getElementById('player-score').textContent = `Score: ${playerScore}`;
    updateTotalScores();
    if (playerScore > 21) resolve('Bust! Dealer wins.', 'lose');
    else if (playerScore === 21) playerStand();
  } catch (e) { console.error(e); }
}

async function playerStand() {
  if (!gameActive || phase !== 'playing') return;
  gameActive = false;
  setDisabled('hit-button',   true);
  setDisabled('stand-button', true);
  const dealerEl = document.getElementById('dealer-cards');
  try {
    while (dealerScore < 17) {
      const res  = await fetch(`https://deckofcardsapi.com/api/deck/${deckId}/draw/?count=1`);
      const data = await res.json();
      const card = data.cards[0];
      dealerHand.push(card);
      await animateCardDealing([card], dealerEl);
      dealerScore = calcHand(dealerHand);
      document.getElementById('dealer-score').textContent = `Score: ${dealerScore}`;
      updateTotalScores();
    }
    determineWinner();
  } catch (e) { console.error(e); }
}

function determineWinner() {
  if (dealerScore > 21)               resolve('Dealer busts — you win!', 'win');
  else if (dealerScore > playerScore) resolve('Dealer wins.',            'lose');
  else if (dealerScore < playerScore) resolve('You win!',                'win');
  else                                resolve("Push — it's a tie.",      'push');
}

/* ── Settle ───────────────────────────────────────────────── */
function resolve(message, outcome) {
  if (phase === 'resolved') return;
  phase = 'resolved';
  gameActive = false;
  setResult(message);
  setDisabled('hit-button',   true);
  setDisabled('stand-button', true);

  let payout = 0, net = 0;
  if (outcome === 'blackjack') { payout = currentBet * (1 + BLACKJACK_PAYOUT); net =  currentBet * BLACKJACK_PAYOUT; }
  else if (outcome === 'win')  { payout = currentBet * 2;                       net =  currentBet; }
  else if (outcome === 'push') { payout = currentBet;                           net =  0; }
  else                         { payout = 0;                                    net = -currentBet; }

  if (payout > 0) w()?.add(payout);

  const isWin = outcome === 'win' || outcome === 'blackjack';
  if (isWin) {
    CasinoShell.sound.win();
    if (net >= 20) CasinoShell.celebrate(net);
    hotelEvent('blackjack_win');
  } else if (outcome === 'lose') {
    CasinoShell.sound.lose();
    hotelEvent('blackjack_loss');
    if (balance() < minBet()) {
      setTimeout(() => CasinoShell.gameOver(), 600);
    }
  }

  const wm = document.getElementById('winning-message');
  wm.style.display = 'block';
  if (net > 0)      { wm.textContent = `★ +$${net.toFixed(2)} ★`;        wm.style.color = 'var(--win)';      }
  else if (net < 0) { wm.textContent = `−$${Math.abs(net).toFixed(2)}`;  wm.style.color = 'var(--loss)';     }
  else              { wm.textContent = 'Bet returned';                     wm.style.color = 'var(--text-dim)'; }

  if (isWin) highlightWinner();
  updateLeaderboard(outcome, net);
  lastBet = currentBet;

  // Short pause so result registers before buttons re-enable
  setTimeout(enterBetting, 420);
}

/* ── Table helpers ────────────────────────────────────────── */
function resetHands() {
  playerHand = []; dealerHand = [];
  playerScore = 0; dealerScore = 0;
  document.getElementById('player-cards').innerHTML = '';
  document.getElementById('dealer-cards').innerHTML = '';
  document.getElementById('player-score').textContent = 'Score: 0';
  document.getElementById('dealer-score').textContent = 'Score: 0';
  document.getElementById('player-total').textContent = '0';
  document.getElementById('dealer-total').textContent = '0';
  document.getElementById('winning-message').style.display = 'none';
  removeWinnerHighlight();
}

function resetTable() {
  if (phase === 'playing') return;
  resetHands();
  setResult('—');
  clearBet();
  enterBetting();
}

function animateCardDealing(hand, element) {
  return new Promise(resolve => {
    hand.forEach((card, i) => {
      setTimeout(() => {
        const cardEl = document.createElement('div');
        cardEl.classList.add('card');
        const img = document.createElement('img');
        img.src = card.image;
        img.alt = `${card.value} of ${card.suit}`;
        cardEl.appendChild(img);
        element.appendChild(cardEl);
        requestAnimationFrame(() =>
          requestAnimationFrame(() => cardEl.classList.add('show'))
        );
        // Shell synth card sound (two quick tones simulate a card flip)
        CasinoShell.sound.tone(900, 'sine', 0.05, 0.18);
        setTimeout(() => CasinoShell.sound.tone(700, 'sine', 0.04, 0.12), 55);
        if (i === hand.length - 1) setTimeout(resolve, 400 / animationSpeed);
      }, i * (380 / animationSpeed));
    });
  });
}

function calcHand(hand) {
  let value = 0, aces = 0;
  hand.forEach(card => {
    if (card.value === 'ACE')                           { aces++; value += 11; }
    else if (['KING','QUEEN','JACK'].includes(card.value)) value += 10;
    else                                                   value += parseInt(card.value, 10);
  });
  while (value > 21 && aces > 0) { value -= 10; aces--; }
  return value;
}

function setResult(msg) { document.getElementById('result-message').textContent = msg; }
function round(n)       { return Math.max(0, parseFloat(Number(n).toFixed(2))); }

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
  document.getElementById('table-wrap')?.classList.remove('winner-glow');
}

function updateLeaderboard(outcome, net) {
  const list = document.getElementById('leaderboard-list');
  const time = new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
  const label = outcome === 'push' ? `🂢 Push`
              : net > 0            ? `🂡 Won +$${net.toFixed(2)}`
              :                      `🂢 Lost −$${Math.abs(net).toFixed(2)}`;
  leaderboard.unshift(`${label} — ${time}`);
  if (leaderboard.length > 10) leaderboard.pop();
  list.innerHTML = leaderboard.map((e, i) =>
    `<li><span>${e}</span><span style="opacity:.4;font-size:11px;">#${i+1}</span></li>`
  ).join('');
}
