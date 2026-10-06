/* ============================================================
   BLACKJACK X — on CasinoShell
   ------------------------------------------------------------
   Shell provides: header · balance · theme · sound · toast ·
   confetti · gameOver modal · XP/daily bonus.
   This file is the game + betting system only.
   ============================================================ */

/* ── Hotel event helper ─────────────────────────────────────
   Queues casino activity for the hotel (hotel-events.js) so
   no hotel scripts are needed on this page.                 */
function hotelEvent(type, data) {
  // Queued for the hotel to apply — see hotel-events.js
  window.HotelEvents?.push(type, data);
}

/* ── State ──────────────────────────────────────────────────
   A round has one player hand, or two after a split:
   { cards, bet, doubled, done, fromSplit, result }            */
let hands         = [];
let active        = 0;       // index of the hand being played
let dealerHand    = [];
let deck          = [];
let dealerScore   = 0;
let insurance     = 0;       // insurance stake taken this round
let dealerNatural = false;
let gameActive    = false;
let busy          = false;   // a card is mid-animation; ignore actions
let leaderboard   = [];
let animationSpeed = 1;

const hand  = () => hands[active];
const score = (h) => calcHand(h.cards);

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

  // High-limit chips unlocked by the hotel's Casino Floor
  const chipValues = window.HotelPerks?.blackjackChips?.() ?? CHIPS;
  document.querySelectorAll('.chip-btn').forEach(btn => {
    btn.hidden = !chipValues.includes(parseInt(btn.dataset.value, 10));
    btn.addEventListener('click', () => addChip(parseInt(btn.dataset.value, 10)));
  });
  document.getElementById('double-button').addEventListener('click', playerDouble);
  document.getElementById('split-button').addEventListener('click', playerSplit);
  document.getElementById('insurance-yes').addEventListener('click', () => takeInsurance(true));
  document.getElementById('insurance-no').addEventListener('click', () => takeInsurance(false));
  document.getElementById('clear-bet').addEventListener('click', clearBet);
  document.getElementById('max-bet').addEventListener('click',   maxBet);
  document.getElementById('rebet').addEventListener('click',    rebet);

  CasinoShell.registerShortcuts([
    { keys: ['d'], label: 'Deal (double down during a hand)', run: () => (phase === 'betting' ? deal() : playerDouble()) },
    { keys: ['h'], label: 'Hit', run: () => playerHit() },
    { keys: ['s'], label: 'Stand', run: () => playerStand() },
    { keys: ['p'], label: 'Split a pair', run: () => playerSplit() },
    { keys: ['i'], label: 'Take insurance', run: () => takeInsurance(true) },
    { keys: ['n'], label: 'No insurance', run: () => takeInsurance(false) },
    { keys: ['r'], label: 'Rebet last stake', run: () => rebet() },
    { keys: ['x'], label: 'Clear bet', run: () => clearBet() },
    { keys: ['1', '2', '3', '4', '5', '6'], label: 'Add a chip (smallest to largest)', run: (e) => {
      const chip = [...document.querySelectorAll('.chip-btn')].filter(btn => !btn.hidden)[Number(e.key) - 1];
      if (chip && !chip.disabled) addChip(parseInt(chip.dataset.value, 10));
    } },
  ]);

  enterBetting();
});

function handText(hand) { return hand.map(cardName).join(' and '); }

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
  // Show the stake on the Deal button so it's visible from the sticky bar
  document.getElementById('deal-button').textContent = currentBet > 0 ? `Deal · $${currentBet.toFixed(2)}` : 'Deal';
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
  const offering  = phase === 'insurance';
  setDisabled('hit-button',  !playing || !gameActive || busy);
  setDisabled('stand-button',!playing || !gameActive || busy);
  setDisabled('double-button', !canDouble());
  setDisabled('split-button',  !canSplit());
  setDisabled('reset-button', playing || offering);
  ['insurance-yes', 'insurance-no'].forEach(id => { document.getElementById(id).hidden = !offering; });

  // Visual signal that a hand is mid-play (mobile CSS uses these)
  document.body.classList.toggle('mid-hand', playing || offering);
  document.body.classList.toggle('insurance-offer', offering);

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
  deck = newShuffledDeck();
  insurance = 0;
  setResult('Dealing…');

  hands = [{ cards: [draw(), draw()], bet: currentBet, doubled: false, done: false, fromSplit: false, result: '' }];
  dealerHand = [draw(), draw()];
  active = 0;

  await animateCardDealing(hands[0].cards, playerCardsEl(0));
  await animateCardDealing(dealerHand, document.getElementById('dealer-cards'), { hideIndex: 1 });

  dealerScore = calcHand(dealerHand);
  dealerNatural = dealerScore === 21;
  renderScores();

  if (dealerHand[0].value === 'ACE' && balance() >= round(currentBet / 2)) offerInsurance();
  else afterPeek();
}

/* ── Insurance ──────────────────────────────────────────────
   Dealer shows an Ace: insure for half the bet before the peek.
   Pays 2:1 if the dealer has Blackjack.                        */
function offerInsurance() {
  phase = 'insurance';
  refreshButtons();
  const cost = round(hands[0].bet / 2);
  setResult(`Dealer shows an Ace. Insurance for $${cost.toFixed(2)}?`);
  document.getElementById('insurance-yes').textContent = `Insure · $${cost.toFixed(2)}`;
  CasinoShell.announce(`You have ${handText(hands[0].cards)}, ${score(hands[0])}. Dealer shows an Ace. Take insurance for $${cost.toFixed(2)}? Press I for yes or N for no.`);
}

function takeInsurance(yes) {
  if (phase !== 'insurance') return;
  if (yes) {
    insurance = round(hands[0].bet / 2);
    w().deduct(insurance);
    hotelEvent('chips_wagered', { amount: insurance });
  }
  phase = 'playing';
  afterPeek();
}

/* Dealer has peeked: a natural on either side ends the round at once. */
function afterPeek() {
  const pNat = score(hands[0]) === 21;
  if (pNat && dealerNatural)  finish('Push — both have Blackjack.', ['push']);
  else if (pNat)              finish('Blackjack! 3:2 payout.',      ['blackjack']);
  else if (dealerNatural)     finish('Dealer Blackjack.',           ['lose']);
  else {
    gameActive = true;
    setResult(insurance ? 'No dealer Blackjack — insurance lost. Your move…' : 'Your move…');
    CasinoShell.announce(`${insurance ? 'No dealer Blackjack, insurance lost. ' : ''}You have ${handText(hands[0].cards)}, ${score(hands[0])}. Dealer shows ${cardName(dealerHand[0])}. ${optionsText()}`);
    refreshButtons();
  }
}

function optionsText() {
  return `Hit, stand${canDouble() ? ', double' : ''}${canSplit() ? ', split' : ''}?`;
}

/* ── Deck ─────────────────────────────────────────────────── */
const SUITS = [
  { id: 'HEARTS',   symbol: '♥', red: true  },
  { id: 'DIAMONDS', symbol: '♦', red: true  },
  { id: 'CLUBS',    symbol: '♣', red: false },
  { id: 'SPADES',   symbol: '♠', red: false },
];
const RANKS = ['ACE', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'JACK', 'QUEEN', 'KING'];
const RANK_LABEL = { ACE: 'A', JACK: 'J', QUEEN: 'Q', KING: 'K' };

/* Fresh single deck each hand, Fisher–Yates shuffled. */
function newShuffledDeck() {
  const cards = [];
  SUITS.forEach(suit => RANKS.forEach(value => cards.push({ value, suit: suit.id, symbol: suit.symbol, red: suit.red })));
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

function draw() {
  if (!deck.length) deck = newShuffledDeck();
  return deck.pop();
}

/* ── Play ─────────────────────────────────────────────────── */
function cardValue(card) {
  if (card.value === 'ACE') return 11;
  if (['KING', 'QUEEN', 'JACK'].includes(card.value)) return 10;
  return parseInt(card.value, 10);
}

function canAct() { return gameActive && !busy && phase === 'playing' && !!hand() && !hand().done; }

/* Double: any two-card hand (also after a split) — double the bet, take one card, stand. */
function canDouble() {
  return canAct() && hand().cards.length === 2 && balance() + 1e-9 >= hand().bet;
}

/* Split: two cards of equal value, once per round. */
function canSplit() {
  const h = hand();
  return canAct() && hands.length === 1 && h.cards.length === 2
    && cardValue(h.cards[0]) === cardValue(h.cards[1]) && balance() + 1e-9 >= h.bet;
}

const handPrefix = () => (hands.length > 1 ? `Hand ${active + 1}: ` : '');

async function playerHit() {
  if (!canAct()) return;
  busy = true;
  refreshButtons();
  const h = hand();
  const card = draw();
  h.cards.push(card);
  await animateCardDealing([card], playerCardsEl(active));
  busy = false;
  renderScores();
  const total = score(h);
  if (total <= 21) CasinoShell.announce(`${handPrefix()}You drew ${cardName(card)}. Total ${total}.`);
  if (total > 21) {
    if (hands.length === 1) { finish('Bust! Dealer wins.', ['lose']); return; }
    CasinoShell.announce(`Hand ${active + 1} busts with ${total}.`);
    nextHand();
  } else if (total === 21) nextHand();      // 21 stands automatically
  else refreshButtons();
}

function playerStand() {
  if (!canAct()) return;
  nextHand();
}

async function playerDouble() {
  if (!canDouble()) return;
  const h = hand();
  w().deduct(h.bet);
  CasinoShell.awardXp(h.bet);
  hotelEvent('chips_wagered', { amount: h.bet });
  h.bet = round(h.bet * 2);
  h.doubled = true;
  busy = true;
  refreshButtons();
  const card = draw();
  h.cards.push(card);
  await animateCardDealing([card], playerCardsEl(active));
  busy = false;
  renderScores();
  const total = score(h);
  CasinoShell.announce(`${handPrefix()}Doubled to $${h.bet.toFixed(2)}. You drew ${cardName(card)}. Total ${total}.`);
  if (total > 21 && hands.length === 1) { finish('Bust! Dealer wins.', ['lose']); return; }
  nextHand();
}

async function playerSplit() {
  if (!canSplit()) return;
  const first = hand();
  w().deduct(first.bet);
  CasinoShell.awardXp(first.bet);
  hotelEvent('chips_wagered', { amount: first.bet });
  first.fromSplit = true;
  hands.push({ cards: [first.cards.pop()], bet: first.bet, doubled: false, done: false, fromSplit: true, result: '' });
  renderSplitLayout();

  busy = true;
  refreshButtons();
  for (let i = 0; i < hands.length; i++) {
    const card = draw();
    hands[i].cards.push(card);
    await animateCardDealing([card], playerCardsEl(i));
  }
  busy = false;
  renderScores();

  if (first.cards[0].value === 'ACE') {      // split aces: one card each
    hands.forEach(h => { h.done = true; });
    CasinoShell.announce(`Split aces get one card each. Hand 1: ${score(hands[0])}. Hand 2: ${score(hands[1])}.`);
    await dealerPlay();
    return;
  }
  active = 0;
  CasinoShell.announce(`Split. Hand 1: ${handText(hands[0].cards)}, ${score(hands[0])}. Hand 2: ${handText(hands[1].cards)}, ${score(hands[1])}. Playing hand 1.`);
  if (score(hands[0]) === 21) { nextHand(); return; }
  setResult('Hand 1: your move…');
  refreshButtons();
}

/* Finish the current hand and move on: next unfinished hand, or the dealer. */
async function nextHand() {
  hand().done = true;
  let next = hands.findIndex(h => !h.done);
  while (next !== -1 && score(hands[next]) === 21) {   // a split hand dealt to 21 stands
    hands[next].done = true;
    next = hands.findIndex(h => !h.done);
  }
  if (next !== -1) {
    active = next;
    renderScores();
    setResult(`Hand ${active + 1}: your move…`);
    CasinoShell.announce(`Hand ${active + 1}: ${handText(hand().cards)}, ${score(hand())}. ${optionsText()}`);
    refreshButtons();
    return;
  }
  await dealerPlay();
}

async function dealerPlay() {
  gameActive = false;
  refreshButtons();
  revealHoleCard();
  renderScores();
  await wait(400 / animationSpeed);
  const anyLive = hands.some(h => score(h) <= 21);
  const dealerEl = document.getElementById('dealer-cards');
  while (anyLive && dealerScore < 17) {
    const card = draw();
    dealerHand.push(card);
    await animateCardDealing([card], dealerEl);
    dealerScore = calcHand(dealerHand);
    renderScores();
  }
  settleHands();
}

function settleHands() {
  const outcomes = hands.map(h => {
    const total = score(h);
    if (total > 21) return 'lose';
    if (dealerScore > 21 || total > dealerScore) return 'win';
    return total < dealerScore ? 'lose' : 'push';
  });
  let message;
  if (hands.length === 1) {
    const total = score(hands[0]);
    message = total > 21 ? 'Bust! Dealer wins.'
      : dealerScore > 21 ? 'Dealer busts — you win!'
      : dealerScore > total ? 'Dealer wins.'
      : dealerScore < total ? 'You win!'
      : "Push — it's a tie.";
  } else {
    const parts = outcomes.map((o, i) => `Hand ${i + 1} ${score(hands[i]) > 21 ? 'busts' : { win: 'wins', lose: 'loses', push: 'pushes' }[o]}`);
    message = `${dealerScore > 21 ? 'Dealer busts — ' : ''}${parts.join(', ')}.`;
  }
  finish(message, outcomes);
}

/* ── Settle ───────────────────────────────────────────────── */
function finish(message, outcomes) {
  if (phase === 'resolved') return;
  phase = 'resolved';
  gameActive = false;
  revealHoleCard();

  let payout = 0, staked = 0;
  hands.forEach((h, i) => {
    const o = outcomes[i];
    staked += h.bet;
    if (o === 'blackjack') payout += h.bet * (1 + BLACKJACK_PAYOUT);
    else if (o === 'win')  payout += h.bet * 2;
    else if (o === 'push') payout += h.bet;
    h.result = { blackjack: 'Blackjack', win: 'Win', push: 'Push', lose: score(h) > 21 ? 'Bust' : 'Loss' }[o];
  });
  let insuranceNote = '';
  if (insurance) {
    if (dealerNatural) { payout += insurance * 3; insuranceNote = ` Insurance pays $${(insurance * 2).toFixed(2)}.`; }
    else insuranceNote = ' Insurance lost.';
  }
  payout = round(payout);
  if (payout > 0) w()?.add(payout);
  const net = round(payout - staked - insurance);

  renderScores();
  setResult(message + (dealerNatural ? insuranceNote : ''));
  refreshButtons();

  const wins = outcomes.filter(o => o === 'win' || o === 'blackjack').length;
  const losses = outcomes.filter(o => o === 'lose').length;
  for (let i = 0; i < wins; i++) hotelEvent('blackjack_win');
  for (let i = 0; i < losses; i++) hotelEvent('blackjack_loss');

  if (net > 0) {
    CasinoShell.sound.win();
    if (net >= 20) CasinoShell.celebrate(net);
  } else if (net < 0) {
    CasinoShell.sound.lose();
  }
  if (balance() < minBet()) setTimeout(() => CasinoShell.gameOver(), 600);

  const wm = document.getElementById('winning-message');
  wm.style.display = 'block';
  if (net > 0)      { wm.textContent = `★ +$${net.toFixed(2)} ★`;        wm.style.color = 'var(--win)';      }
  else if (net < 0) { wm.textContent = `−$${Math.abs(net).toFixed(2)}`;  wm.style.color = 'var(--loss)';     }
  else              { wm.textContent = 'Bet returned';                     wm.style.color = 'var(--text-dim)'; }

  const scores = hands.length === 1 ? `You ${score(hands[0])}` : hands.map((h, i) => `Hand ${i + 1} ${score(h)}`).join(', ');
  CasinoShell.announce(`${message} ${scores}, dealer ${dealerScore}.${insuranceNote} ${
    net > 0 ? `Won $${net.toFixed(2)}.` : net < 0 ? `Lost $${Math.abs(net).toFixed(2)}.` : 'Bet returned.'}`);

  if (net > 0) highlightWinner();
  updateLeaderboard(net === 0 ? 'push' : net > 0 ? 'win' : 'lose', net);
  lastBet = currentBet;

  // Short pause so result registers before buttons re-enable
  setTimeout(enterBetting, 420);
}

/* ── Table helpers ────────────────────────────────────────── */
function resetHands() {
  hands = []; dealerHand = []; active = 0;
  dealerScore = 0; dealerNatural = false; insurance = 0;
  busy = false;
  document.getElementById('player-cards').innerHTML = '';
  document.getElementById('player-cards').classList.remove('is-split');
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

function animateCardDealing(hand, element, { hideIndex = -1 } = {}) {
  return new Promise(resolve => {
    hand.forEach((card, i) => {
      setTimeout(() => {
        const cardEl = createCardEl(card, i === hideIndex);
        element.appendChild(cardEl);
        requestAnimationFrame(() =>
          requestAnimationFrame(() => cardEl.classList.add('show'))
        );
        playCardSound();
        if (i === hand.length - 1) setTimeout(resolve, 400 / animationSpeed);
      }, i * (380 / animationSpeed));
    });
  });
}

function cardName(card) {
  const value = card.value.charAt(0) + card.value.slice(1).toLowerCase();
  const suit  = card.suit.charAt(0) + card.suit.slice(1).toLowerCase();
  return `${value} of ${suit}`;
}

function paintCardFace(cardEl, card) {
  const rank = RANK_LABEL[card.value] ?? card.value;
  cardEl.classList.remove('face-down');
  cardEl.classList.add(card.red ? 'red' : 'black');
  cardEl.setAttribute('aria-label', cardName(card));
  cardEl.innerHTML = `
    <span class="card-corner top" aria-hidden="true">${rank}<br>${card.symbol}</span>
    <span class="card-pip" aria-hidden="true">${card.symbol}</span>
    <span class="card-corner bottom" aria-hidden="true">${rank}<br>${card.symbol}</span>`;
}

function createCardEl(card, faceDown = false) {
  const cardEl = document.createElement('div');
  cardEl.classList.add('card');
  cardEl.setAttribute('role', 'img');
  if (faceDown) {
    cardEl.classList.add('face-down');
    cardEl.setAttribute('aria-label', 'Face-down card');
  } else {
    paintCardFace(cardEl, card);
  }
  return cardEl;
}

/* Turn the dealer's hole card face up (no-op once revealed). */
function revealHoleCard() {
  const hole = document.querySelector('#dealer-cards .card.face-down');
  if (!hole || !dealerHand[1]) return;
  paintCardFace(hole, dealerHand[1]);
  playCardSound();
}

function holeCardHidden() {
  return !!document.querySelector('#dealer-cards .card.face-down');
}

/* Where a hand's cards go: the player area itself, or a hand column after a split. */
function playerCardsEl(i) {
  const root = document.getElementById('player-cards');
  return hands.length > 1 ? root.querySelector(`.hand-group[data-hand="${i}"] .hand-cards`) : root;
}

function renderSplitLayout() {
  const root = document.getElementById('player-cards');
  root.classList.add('is-split');
  root.innerHTML = hands.map((_, i) => `
    <div class="hand-group" data-hand="${i}">
      <div class="hand-cards"></div>
      <div class="hand-label"></div>
    </div>`).join('');
  hands.forEach((h, i) => h.cards.forEach(card => {
    const el = createCardEl(card);
    el.classList.add('show');
    playerCardsEl(i).appendChild(el);
  }));
}

/* Show only the dealer's up card total while the hole card is down. */
function renderScores() {
  const dealerShown = holeCardHidden() ? `${calcHand(dealerHand.slice(0, 1))} + ?` : dealerScore;
  const totals = hands.map(score);
  document.getElementById('player-score').textContent = hands.length > 1
    ? `Hand ${active + 1}: ${totals[active]}`
    : `Score: ${totals[0] ?? 0}`;
  document.getElementById('dealer-score').textContent = `Score: ${dealerShown}`;
  document.getElementById('player-total').textContent = totals.length ? totals.join(' / ') : '0';
  document.getElementById('dealer-total').textContent = dealerShown;

  if (hands.length > 1) {
    // Split hands grow the table as cards land; keep the action buttons on screen
    if (gameActive) document.querySelector('.actions-row')?.scrollIntoView({ block: 'nearest' });
    hands.forEach((h, i) => {
      const group = document.querySelector(`#player-cards .hand-group[data-hand="${i}"]`);
      if (!group) return;
      group.classList.toggle('active', gameActive && i === active);
      group.classList.toggle('busted', score(h) > 21);
      group.querySelector('.hand-label').textContent =
        `Hand ${i + 1} · $${h.bet.toFixed(2)}${h.doubled ? ' doubled' : ''} · ${score(h)}${h.result ? ` · ${h.result}` : ''}`;
    });
  }
}

function playCardSound() {
  // Shell synth card sound (two quick tones simulate a card flip)
  CasinoShell.sound.tone(900, 'sine', 0.05, 0.18);
  setTimeout(() => CasinoShell.sound.tone(700, 'sine', 0.04, 0.12), 55);
}

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

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
              : net > 0            ? `♠️ Won +$${net.toFixed(2)}`
              :                      `🂢 Lost −$${Math.abs(net).toFixed(2)}`;
  leaderboard.unshift(`${label} — ${time}`);
  if (leaderboard.length > 10) leaderboard.pop();
  list.innerHTML = leaderboard.map((e, i) =>
    `<li><span>${e}</span><span style="opacity:.4;font-size:11px;">#${i+1}</span></li>`
  ).join('');
}
