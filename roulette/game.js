/* Roulette Royale — shell-mounted European roulette. */

CasinoShell.mount({ name: 'Roulette Royale', subtitle: 'Single Zero' });

const WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
  5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
];
const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const MAX_HISTORY = 10;

const state = {
  wager: 5,
  ticket: { type: 'color', value: 'red', label: 'Red', payout: 1 },
  spinning: false,
  wheelRotation: 0,
  ballRotation: 0,
  history: [],
};

const wheel = document.getElementById('wheel');
const ball = document.getElementById('ball');
const board = document.getElementById('number-board');
const betDisplay = document.getElementById('bet-display');
const ticketLabel = document.getElementById('ticket-label');
const ticketPayout = document.getElementById('ticket-payout');
const spinResult = document.getElementById('spin-result');
const wheelNumber = document.getElementById('wheel-number');
const spinBtn = document.getElementById('spin-btn');
const clearBtn = document.getElementById('clear-btn');
const historyList = document.getElementById('history-list');
const streakNote = document.getElementById('streak-note');

function wallet() {
  return CasinoShell.wallet;
}

function numberColor(number) {
  if (number === 0) return 'green';
  return RED_NUMBERS.has(number) ? 'red' : 'black';
}

function renderBoard() {
  const zero = '<button class="number-bet zero" data-number="0">0</button>';
  const rows = [[], [], []];
  for (let n = 1; n <= 36; n++) {
    const row = 2 - ((n - 1) % 3);
    rows[row].push(`<button class="number-bet ${numberColor(n)}" data-number="${n}">${n}</button>`);
  }
  board.innerHTML = zero + rows.map((row) => row.join('')).join('');
}

function setWager(amount) {
  if (state.spinning) return;
  state.wager = amount;
  betDisplay.textContent = `$${amount.toFixed(2)}`;
  document.querySelectorAll('.chip-btn').forEach((btn) => {
    btn.classList.toggle('active', Number(btn.dataset.bet) === amount);
  });
}

function setTicket(ticket) {
  if (state.spinning) return;
  state.ticket = ticket;
  ticketLabel.textContent = ticket.label;
  ticketPayout.textContent = `Pays ${ticket.payout}:1`;

  document.querySelectorAll('.number-bet, .outside-bet').forEach((btn) => btn.classList.remove('active'));
  if (ticket.type === 'straight') {
    document.querySelector(`[data-number="${ticket.value}"]`)?.classList.add('active');
  } else {
    document.querySelector(`[data-bet-type="${ticket.type}"][data-bet-value="${ticket.value}"]`)?.classList.add('active');
  }
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

function didWin(number, ticket) {
  if (ticket.type === 'straight') return number === ticket.value;
  if (number === 0) return false;
  if (ticket.type === 'color') return numberColor(number) === ticket.value;
  if (ticket.type === 'parity') return ticket.value === 'even' ? number % 2 === 0 : number % 2 === 1;
  if (ticket.type === 'range') return ticket.value === 'low' ? number <= 18 : number >= 19;
  if (ticket.type === 'dozen') {
    const dozen = Math.ceil(number / 12);
    return dozen === Number(ticket.value);
  }
  return false;
}

function randomPocket() {
  return WHEEL_ORDER[Math.floor(Math.random() * WHEEL_ORDER.length)];
}

function spinWheelTo(number) {
  const pocketIndex = WHEEL_ORDER.indexOf(number);
  const pocketAngle = (360 / WHEEL_ORDER.length) * pocketIndex;
  state.wheelRotation += 1440 + pocketAngle;
  state.ballRotation -= 1800 + pocketAngle + 18;
  wheel.style.transform = `rotate(${state.wheelRotation}deg)`;
  ball.parentElement.style.transform = `rotate(${state.ballRotation}deg)`;
}

function lockControls(locked) {
  state.spinning = locked;
  spinBtn.disabled = locked;
  clearBtn.disabled = locked;
  document.querySelectorAll('.chip-btn, .number-bet, .outside-bet').forEach((btn) => {
    btn.disabled = locked;
  });
}

function spin() {
  if (state.spinning) return;
  const w = wallet();
  if (!w.canAfford(state.wager)) {
    CasinoShell.toast('Not enough chips for that wager.');
    if (!w.canAfford(1)) CasinoShell.gameOver();
    return;
  }

  lockControls(true);
  w.deduct(state.wager);
  CasinoShell.awardXp(state.wager);
  CasinoShell.sound.click();
  spinResult.textContent = 'Spinning...';
  wheelNumber.textContent = '--';

  const number = randomPocket();
  spinWheelTo(number);

  setTimeout(() => settle(number), 3300);
}

function settle(number) {
  const color = numberColor(number);
  const won = didWin(number, state.ticket);
  const payout = won ? state.wager * (state.ticket.payout + 1) : 0;
  const net = won ? state.wager * state.ticket.payout : -state.wager;

  wheelNumber.textContent = number;

  if (won) {
    wallet().add(payout);
    spinResult.textContent = `${number} ${color}. +$${net.toFixed(2)}`;
    state.ticket.payout >= 2 ? CasinoShell.celebrate(net) : CasinoShell.sound.win();
  } else {
    spinResult.textContent = `${number} ${color}. -$${state.wager.toFixed(2)}`;
    CasinoShell.sound.lose();
    if (!wallet().canAfford(1)) CasinoShell.gameOver();
  }

  addHistory(number, color, net);
  lockControls(false);
}

function addHistory(number, color, net) {
  state.history.unshift({ number, color, net });
  state.history = state.history.slice(0, MAX_HISTORY);
  historyList.innerHTML = state.history.map((item) => `
    <li>
      <span class="history-number ${item.color}">${item.number} ${item.color}</span>
      <span class="${item.net >= 0 ? 'history-win' : 'history-loss'}">
        ${item.net >= 0 ? '+' : '-'}$${Math.abs(item.net).toFixed(2)}
      </span>
    </li>
  `).join('');

  const wins = state.history.filter((item) => item.net > 0).length;
  streakNote.textContent = `${wins}/${state.history.length} recent wins`;
}

function clearTicket() {
  setTicket({ type: 'color', value: 'red', label: 'Red', payout: 1 });
}

function showHelp() {
  CasinoShell.info('Roulette Royale Rules', `
    <h6>Goal</h6>
    <p>Choose a number or outside bet, then spin the wheel. The game uses European single-zero roulette.</p>
    <h6>Payouts</h6>
    <ul>
      <li><strong>Straight number:</strong> pays 35:1</li>
      <li><strong>Dozens:</strong> pay 2:1</li>
      <li><strong>Red/Black, Even/Odd, 1-18/19-36:</strong> pay 1:1</li>
    </ul>
    <h6>Zero</h6>
    <p>Zero only wins on a straight 0 bet. It loses for outside bets.</p>
  `);
}

document.querySelectorAll('.chip-btn').forEach((btn) => {
  btn.addEventListener('click', () => setWager(Number(btn.dataset.bet)));
});

document.querySelectorAll('.outside-bet').forEach((btn) => {
  btn.addEventListener('click', () => setTicket(ticketFromOutside(btn)));
});

board.addEventListener('click', (event) => {
  const btn = event.target.closest('.number-bet');
  if (!btn) return;
  const number = Number(btn.dataset.number);
  setTicket({ type: 'straight', value: number, label: `Straight ${number}`, payout: 35 });
});

spinBtn.addEventListener('click', spin);
clearBtn.addEventListener('click', clearTicket);
document.getElementById('help-btn').addEventListener('click', showHelp);

document.addEventListener('keydown', (event) => {
  if (event.code !== 'Space' || event.repeat) return;
  event.preventDefault();
  if (!spinBtn.disabled) spin();
});

renderBoard();
setWager(state.wager);
setTicket(state.ticket);
