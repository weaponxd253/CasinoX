/* Roulette Royale — shell-mounted European roulette. */

CasinoShell.mount({ name: 'Roulette Royale', subtitle: 'Single Zero' });

const WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
  5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
];
const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const MAX_HISTORY = 10;
const POCKET_STEP = 360 / WHEEL_ORDER.length;
const BALL_HOME_ANGLE = 0;

const state = {
  chip: 5,
  bets: [],
  previousBets: [],
  spinning: false,
  wheelRotation: 0,
  ballRotation: 0,
  history: [],
};

const wheel = document.getElementById('wheel');
const board = document.getElementById('number-board');
const betDisplay = document.getElementById('bet-display');
const ticketLabel = document.getElementById('ticket-label');
const ticketPayout = document.getElementById('ticket-payout');
const payoutPreview = document.getElementById('payout-preview');
const spinResult = document.getElementById('spin-result');
const wheelNumber = document.getElementById('wheel-number');
const spinBtn = document.getElementById('spin-btn');
const clearBtn = document.getElementById('clear-btn');
const repeatBtn = document.getElementById('repeat-btn');
const doubleBtn = document.getElementById('double-btn');
const historyList = document.getElementById('history-list');
const streakNote = document.getElementById('streak-note');

function wallet() {
  return CasinoShell.wallet;
}

function money(amount) {
  return `$${Number(amount).toFixed(2)}`;
}

function betKey(bet) {
  return `${bet.type}:${bet.value}`;
}

function totalWager(bets = state.bets) {
  return bets.reduce((sum, bet) => sum + bet.amount, 0);
}

function numberColor(number) {
  if (number === 0) return 'green';
  return RED_NUMBERS.has(number) ? 'red' : 'black';
}

function normalizeAngle(deg) {
  return ((deg % 360) + 360) % 360;
}

function renderBoard() {
  const zero = '<button class="number-bet zero" data-number="0"><span class="bet-text">0</span></button>';
  const rows = [[], [], []];
  for (let n = 1; n <= 36; n++) {
    const row = 2 - ((n - 1) % 3);
    rows[row].push(`<button class="number-bet ${numberColor(n)}" data-number="${n}"><span class="bet-text">${n}</span></button>`);
  }
  board.innerHTML = zero + rows.map((row) => row.join('')).join('');
}

function renderWheelGradient() {
  const colors = { red: '#982020', black: '#101010', green: '#1f7a45' };
  const stops = WHEEL_ORDER.map((number, index) => {
    const start = index * POCKET_STEP;
    const end = (index + 1) * POCKET_STEP;
    return `${colors[numberColor(number)]} ${start.toFixed(3)}deg ${end.toFixed(3)}deg`;
  }).join(', ');
  wheel.style.setProperty('--wheel-gradient', `conic-gradient(from ${(-POCKET_STEP / 2).toFixed(3)}deg, ${stops})`);
}

function renderWheelNumbers() {
  const labels = document.createElement('div');
  labels.className = 'wheel-numbers';
  labels.setAttribute('aria-hidden', 'true');
  labels.innerHTML = WHEEL_ORDER.map((number, index) => {
    const angle = POCKET_STEP * index;
    return `<span class="wheel-pocket ${numberColor(number)}" style="--angle:${angle}deg">${number}</span>`;
  }).join('');
  wheel.appendChild(labels);
}

function setChip(amount) {
  if (state.spinning) return;
  state.chip = amount;
  betDisplay.textContent = money(amount);
  document.querySelectorAll('.chip-btn').forEach((btn) => {
    btn.classList.toggle('active', Number(btn.dataset.bet) === amount);
  });
}

function ticketFromOutside(button) {
  const type = button.dataset.betType;
  const value = button.dataset.betValue;
  const labels = {
    color: value === 'red' ? 'Red' : 'Black',
    parity: value === 'even' ? 'Even' : 'Odd',
    range: value === 'low' ? '1-18' : '19-36',
    dozen: `${['1st', '2nd', '3rd'][Number(value) - 1]} 12`,
  };
  return {
    type,
    value,
    label: labels[type],
    payout: type === 'dozen' ? 2 : 1,
  };
}

function makeStraightBet(number) {
  return { type: 'straight', value: number, label: `Straight ${number}`, payout: 35 };
}

function addBet(ticket) {
  if (state.spinning) return;
  const key = betKey(ticket);
  const existing = state.bets.find((bet) => betKey(bet) === key);
  if (existing) {
    existing.amount += state.chip;
  } else {
    state.bets.push({ ...ticket, amount: state.chip });
  }
  CasinoShell.sound.click();
  renderBets();
}

function clearBets() {
  if (state.spinning) return;
  state.bets = [];
  renderBets();
}

function repeatBets() {
  if (state.spinning || state.previousBets.length === 0) return;
  state.bets = state.previousBets.map((bet) => ({ ...bet }));
  renderBets();
}

function doubleBets() {
  if (state.spinning || state.bets.length === 0) return;
  state.bets = state.bets.map((bet) => ({ ...bet, amount: bet.amount * 2 }));
  renderBets();
}

function renderBets() {
  document.querySelectorAll('.number-bet, .outside-bet').forEach((btn) => {
    btn.classList.remove('active');
    btn.querySelector('.bet-chip')?.remove();
  });

  state.bets.forEach((bet) => {
    const selector = bet.type === 'straight'
      ? `[data-number="${bet.value}"]`
      : `[data-bet-type="${bet.type}"][data-bet-value="${bet.value}"]`;
    const btn = document.querySelector(selector);
    if (!btn) return;
    btn.classList.add('active');
    const chip = document.createElement('span');
    chip.className = 'bet-chip';
    chip.textContent = money(bet.amount).replace('.00', '');
    btn.appendChild(chip);
  });

  const wager = totalWager();
  if (state.bets.length === 0) {
    ticketLabel.textContent = 'No bets placed';
    ticketPayout.textContent = 'Choose a chip, then tap the table';
    payoutPreview.textContent = 'Potential win: $0.00';
  } else if (state.bets.length === 1) {
    const bet = state.bets[0];
    ticketLabel.textContent = `${bet.label} · ${money(bet.amount)}`;
    ticketPayout.textContent = `Pays ${bet.payout}:1`;
    payoutPreview.textContent = `Potential win: ${money(bet.amount * bet.payout)} profit`;
  } else {
    const bestProfit = state.bets.reduce((max, bet) => Math.max(max, bet.amount * bet.payout), 0);
    ticketLabel.textContent = `${state.bets.length} bets · ${money(wager)} total`;
    ticketPayout.textContent = 'Multiple payouts';
    payoutPreview.textContent = `Best single-hit profit: ${money(bestProfit)}`;
  }

  spinBtn.disabled = state.spinning || wager <= 0;
  clearBtn.disabled = state.spinning || wager <= 0;
  doubleBtn.disabled = state.spinning || wager <= 0;
  repeatBtn.disabled = state.spinning || state.previousBets.length === 0;
}

function didWin(number, bet) {
  if (bet.type === 'straight') return number === bet.value;
  if (number === 0) return false;
  if (bet.type === 'color') return numberColor(number) === bet.value;
  if (bet.type === 'parity') return bet.value === 'even' ? number % 2 === 0 : number % 2 === 1;
  if (bet.type === 'range') return bet.value === 'low' ? number <= 18 : number >= 19;
  if (bet.type === 'dozen') return Math.ceil(number / 12) === Number(bet.value);
  return false;
}

function randomPocket() {
  return WHEEL_ORDER[Math.floor(Math.random() * WHEEL_ORDER.length)];
}

function spinWheelTo(number) {
  const pocketIndex = WHEEL_ORDER.indexOf(number);
  const pocketAngle = POCKET_STEP * pocketIndex;
  const currentWheel = normalizeAngle(state.wheelRotation);
  const targetWheel = normalizeAngle(BALL_HOME_ANGLE - pocketAngle);
  const wheelDelta = normalizeAngle(targetWheel - currentWheel) + 1440;

  state.wheelRotation += wheelDelta;
  state.ballRotation += 1800;
  wheel.style.transform = `rotate(${state.wheelRotation}deg)`;
  document.getElementById('ball-track').style.transform = `rotate(${state.ballRotation}deg)`;
}

function lockControls(locked) {
  state.spinning = locked;
  document.querySelectorAll('.chip-btn, .number-bet, .outside-bet').forEach((btn) => {
    btn.disabled = locked;
  });
  renderBets();
}

function spin() {
  if (state.spinning) return;
  const wager = totalWager();
  if (wager <= 0) {
    CasinoShell.toast('Place at least one bet first.');
    return;
  }

  const w = wallet();
  if (!w.canAfford(wager)) {
    CasinoShell.toast(`Not enough chips for ${money(wager)} in bets.`);
    if (!w.canAfford(1)) CasinoShell.gameOver();
    return;
  }

  lockControls(true);
  state.previousBets = state.bets.map((bet) => ({ ...bet }));
  w.deduct(wager);
  CasinoShell.awardXp(wager);
  CasinoShell.sound.click();
  spinResult.textContent = 'Spinning...';
  wheelNumber.textContent = '--';

  const number = randomPocket();
  spinWheelTo(number);

  setTimeout(() => settle(number), 3300);
}

function settle(number) {
  const color = numberColor(number);
  const wager = totalWager();
  let payout = 0;
  let hitCount = 0;

  state.bets.forEach((bet) => {
    if (!didWin(number, bet)) return;
    hitCount++;
    payout += bet.amount * (bet.payout + 1);
  });

  const net = payout - wager;
  wheelNumber.textContent = number;

  if (payout > 0) wallet().add(payout);

  if (net > 0) {
    spinResult.textContent = `${number} ${color}. ${hitCount} hit${hitCount === 1 ? '' : 's'} · +${money(net)}`;
    net >= wager * 2 ? CasinoShell.celebrate(net) : CasinoShell.sound.win();
  } else if (net === 0) {
    spinResult.textContent = `${number} ${color}. Break even`;
    CasinoShell.sound.win();
  } else {
    spinResult.textContent = `${number} ${color}. -${money(Math.abs(net))}`;
    CasinoShell.sound.lose();
    if (!wallet().canAfford(1)) CasinoShell.gameOver();
  }

  addHistory(number, color, net, hitCount);
  state.bets = [];
  lockControls(false);
  renderBets();
}

function addHistory(number, color, net, hitCount) {
  state.history.unshift({ number, color, net, hitCount });
  state.history = state.history.slice(0, MAX_HISTORY);
  historyList.innerHTML = state.history.map((item) => `
    <li>
      <span class="history-number ${item.color}">${item.number} ${item.color}</span>
      <span class="${item.net >= 0 ? 'history-win' : 'history-loss'}">
        ${item.net >= 0 ? '+' : '-'}${money(Math.abs(item.net))}
      </span>
    </li>
  `).join('');

  const wins = state.history.filter((item) => item.net > 0).length;
  streakNote.textContent = `${wins}/${state.history.length} recent wins`;
}

function showHelp() {
  CasinoShell.info('Roulette Royale Rules', `
    <h6>Goal</h6>
    <p>Choose a chip, place one or more bets, then spin the wheel. The game uses European single-zero roulette.</p>
    <h6>Payouts</h6>
    <ul>
      <li><strong>Straight number:</strong> pays 35:1</li>
      <li><strong>Dozens:</strong> pay 2:1</li>
      <li><strong>Red/Black, Even/Odd, 1-18/19-36:</strong> pay 1:1</li>
    </ul>
    <h6>Table Controls</h6>
    <ul>
      <li><strong>Repeat</strong> restores your previous spin's bets.</li>
      <li><strong>Double</strong> doubles every chip currently on the table.</li>
      <li><strong>Clear</strong> removes all current bets.</li>
    </ul>
    <h6>Zero</h6>
    <p>Zero only wins on a straight 0 bet. It loses for outside bets.</p>
  `);
}

document.querySelectorAll('.chip-btn').forEach((btn) => {
  btn.addEventListener('click', () => setChip(Number(btn.dataset.bet)));
});

document.querySelectorAll('.outside-bet').forEach((btn) => {
  btn.addEventListener('click', () => addBet(ticketFromOutside(btn)));
});

board.addEventListener('click', (event) => {
  const btn = event.target.closest('.number-bet');
  if (!btn) return;
  addBet(makeStraightBet(Number(btn.dataset.number)));
});

spinBtn.addEventListener('click', spin);
clearBtn.addEventListener('click', clearBets);
repeatBtn.addEventListener('click', repeatBets);
doubleBtn.addEventListener('click', doubleBets);
document.getElementById('help-btn').addEventListener('click', showHelp);

document.addEventListener('keydown', (event) => {
  if (event.code !== 'Space' || event.repeat) return;
  event.preventDefault();
  if (!spinBtn.disabled) spin();
});

renderBoard();
renderWheelGradient();
renderWheelNumbers();
setChip(state.chip);
renderBets();
