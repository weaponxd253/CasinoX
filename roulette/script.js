/* ============================================================
   ROULETTE ROYALE — on CasinoShell
   ------------------------------------------------------------
   European single-zero wheel (house edge ≈ 2.7%).
     Straight number   35:1
     Dozen / column     2:1
     Red/black, odd/even, 1–18/19–36   1:1  (zero loses these)
   Unlocked through the hotel (Casino Floor Lv 2 + reputation 5,
   see hotel-perks.js); dev mode opens it for testing.
   ============================================================ */

CasinoShell.mount({ name: 'Roulette Royale', subtitle: 'European Wheel' });

const WHEEL_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
  5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const colorOf = (n) => (n === 0 ? 'green' : RED.has(n) ? 'red' : 'black');
const SEGMENT = 360 / WHEEL_ORDER.length;
const BASE_TABLE_MAX = 100;            // per spin, before hotel limit perks
const HISTORY_SIZE = 12;

const OUTSIDE = {
  red:    { label: 'Red',      pays: 1, wins: (n) => colorOf(n) === 'red' },
  black:  { label: 'Black',    pays: 1, wins: (n) => colorOf(n) === 'black' },
  odd:    { label: 'Odd',      pays: 1, wins: (n) => n > 0 && n % 2 === 1 },
  even:   { label: 'Even',     pays: 1, wins: (n) => n > 0 && n % 2 === 0 },
  low:    { label: '1–18',     pays: 1, wins: (n) => n >= 1 && n <= 18 },
  high:   { label: '19–36',    pays: 1, wins: (n) => n >= 19 },
  dozen1: { label: '1st 12',   pays: 2, wins: (n) => n >= 1 && n <= 12 },
  dozen2: { label: '2nd 12',   pays: 2, wins: (n) => n >= 13 && n <= 24 },
  dozen3: { label: '3rd 12',   pays: 2, wins: (n) => n >= 25 },
  col1:   { label: 'Column 1', pays: 2, wins: (n) => n > 0 && n % 3 === 1 },
  col2:   { label: 'Column 2', pays: 2, wins: (n) => n > 0 && n % 3 === 2 },
  col3:   { label: 'Column 3', pays: 2, wins: (n) => n > 0 && n % 3 === 0 },
};

function betSpec(key) {
  if (key.startsWith('n')) {
    const n = Number(key.slice(1));
    return { label: `${n} ${colorOf(n)}`, pays: 35, wins: (x) => x === n };
  }
  return OUTSIDE[key];
}

let bets = {};          // bet key → chips on it
let lastBets = {};
let chip = 1;
let spinning = false;
let wheelAngle = 0;
let history = [];

const wallet = () => CasinoShell.wallet;
const totalOf = (b) => Object.values(b).reduce((sum, v) => sum + v, 0);
const money = (n) => `$${Number(n).toFixed(2)}`;
const tableMax = () => Math.round(BASE_TABLE_MAX * (window.HotelPerks?.limitMult?.() ?? 1));

function hotelEvent(type, data) {
  // Queued for the hotel to apply — see hotel-events.js
  window.HotelEvents?.push(type, data);
}

/* ── Gate ────────────────────────────────────────────────── */
function checkGate() {
  const gate = window.HotelPerks?.gameGate?.('roulette');
  if (!gate || gate.unlocked) return true;
  document.getElementById('rt-layout').hidden = true;
  document.getElementById('rt-lock').hidden = false;
  document.getElementById('rt-lock-detail').textContent =
    `Needs Casino Floor level ${gate.casinoLevel} (you have ${gate.casinoLevelNow}) and reputation ${gate.rep} (you have ${gate.repNow}). Upgrade your hotel to open the table.`;
  return false;
}

/* ── Build the wheel and the number grid ─────────────────── */
function buildWheel() {
  const wheel = document.getElementById('rt-wheel');
  const stops = WHEEL_ORDER.map((n, i) => {
    const color = { red: '#b3261e', black: '#1c1c1c', green: '#1f7a42' }[colorOf(n)];
    return `${color} ${i * SEGMENT}deg ${(i + 1) * SEGMENT}deg`;
  });
  wheel.style.background = `conic-gradient(${stops.join(', ')})`;
  wheel.innerHTML = WHEEL_ORDER.map((n, i) =>
    `<span class="rt-wheel-num" style="transform: rotate(${i * SEGMENT + SEGMENT / 2}deg)"><span>${n}</span></span>`).join('');
}

function buildNumbers() {
  const grid = document.getElementById('rt-numbers');
  let html = '';
  for (let row = 0; row < 12; row++) {
    for (let col = 1; col <= 3; col++) {
      const n = row * 3 + col;
      html += `<button type="button" class="rt-spot rt-num ${colorOf(n)}" data-bet="n${n}">${n}</button>`;
    }
  }
  grid.innerHTML = html;
}

/* ── Betting ─────────────────────────────────────────────── */
function placeBet(key) {
  if (spinning) return;
  const total = totalOf(bets);
  if (total + chip > wallet().get() + 1e-9) { CasinoShell.toast(`Not enough chips for another ${money(chip)} chip.`); return; }
  if (total + chip > tableMax()) { CasinoShell.toast(`Table limit is ${money(tableMax())} per spin.`); return; }
  bets[key] = (bets[key] ?? 0) + chip;
  clearHighlights();
  render();
  CasinoShell.sound.click();
}

function clearBets() {
  if (spinning) return;
  bets = {};
  render();
}

function rebet() {
  if (spinning || !totalOf(lastBets)) return;
  const total = totalOf(lastBets);
  if (total > wallet().get() + 1e-9) { CasinoShell.toast(`Rebet needs ${money(total)} in chips.`); return; }
  if (total > tableMax()) { CasinoShell.toast(`Table limit is ${money(tableMax())} per spin.`); return; }
  bets = { ...lastBets };
  clearHighlights();
  render();
}

function selectChip(value) {
  const btn = document.querySelector(`.rt-chip[data-chip="${value}"]`);
  if (!btn || btn.hidden) return;
  chip = value;
  render();
}

/* ── Spin ────────────────────────────────────────────────── */
function spin() {
  if (spinning) return;
  const stake = totalOf(bets);
  if (!stake) { CasinoShell.toast('Place a bet first: tap a number or an outside bet.'); return; }
  if (!wallet().canAfford(stake)) { CasinoShell.toast('Not enough chips for these bets.'); return; }

  spinning = true;
  wallet().deduct(stake);
  CasinoShell.awardXp(stake);
  hotelEvent('chips_wagered', { amount: stake });
  lastBets = { ...bets };
  render();

  const result = Math.floor(Math.random() * WHEEL_ORDER.length);   // 0–36, uniform
  const index = WHEEL_ORDER.indexOf(result);
  // Rotate so the winning segment's centre lands under the pointer (top).
  const target = (360 - (index * SEGMENT + SEGMENT / 2)) % 360;
  const reduced = CasinoShell.reducedMotion();
  wheelAngle = wheelAngle - (wheelAngle % 360) + (reduced ? 360 : 360 * 5) + target;
  const wheel = document.getElementById('rt-wheel');
  wheel.style.transitionDuration = reduced ? '0s' : '3.2s';
  wheel.style.transform = `rotate(${wheelAngle}deg)`;
  document.getElementById('rt-hub').textContent = '…';
  document.getElementById('rt-result').textContent = 'No more bets…';

  setTimeout(() => settle(result, stake), reduced ? 150 : 3300);
}

function settle(result, stake) {
  let returned = 0;
  const winners = [];
  for (const [key, amount] of Object.entries(bets)) {
    const spec = betSpec(key);
    if (spec?.wins(result)) {
      returned += amount * (spec.pays + 1);
      winners.push(key);
    }
  }
  if (returned > 0) wallet().add(returned);
  const net = Math.round((returned - stake) * 100) / 100;

  const color = colorOf(result);
  const hub = document.getElementById('rt-hub');
  hub.textContent = result;
  hub.className = `rt-hub ${color}`;
  history = [result, ...history].slice(0, HISTORY_SIZE);

  const name = `${result} ${color === 'green' ? 'green' : color}`;
  const resultEl = document.getElementById('rt-result');
  resultEl.textContent = net > 0 ? `${name} — you win ${money(returned)}!`
    : net === 0 ? `${name} — bets returned.`
    : returned > 0 ? `${name} — ${money(returned)} back.`
    : `${name} — no winning bets.`;
  resultEl.className = `rt-result ${net > 0 ? 'win' : net < 0 ? 'loss' : ''}`;
  CasinoShell.announce(`${name}. ${winners.length
    ? `Winning bets: ${winners.map((k) => betSpec(k).label).join(', ')}. ${net >= 0 ? `Won ${money(net)}.` : `Lost ${money(-net)} overall.`}`
    : `You lost ${money(stake)}.`}`);

  if (net > 0) {
    CasinoShell.sound.win();
    if (net >= 20) CasinoShell.celebrate(net);
  } else if (net < 0) {
    CasinoShell.sound.lose();
  }

  // The number and the winning spots stay lit until the next bet
  highlight(result, winners);
  bets = {};
  spinning = false;
  render();
  if (wallet().get() < 1) CasinoShell.gameOver();
}

function highlight(result, winners) {
  clearHighlights();
  document.querySelector(`.rt-spot[data-bet="n${result}"]`)?.classList.add('hit');
  winners.forEach((key) => document.querySelector(`.rt-spot[data-bet="${key}"]`)?.classList.add('won'));
}

function clearHighlights() {
  document.querySelectorAll('.rt-spot.hit, .rt-spot.won').forEach((el) => el.classList.remove('hit', 'won'));
}

/* ── Render ──────────────────────────────────────────────── */
function render() {
  const total = totalOf(bets);
  document.getElementById('rt-total').textContent = money(total);
  document.getElementById('rt-limit').textContent = `Table limit ${money(tableMax())}`;
  document.querySelectorAll('.rt-spot').forEach((spot) => {
    const key = spot.dataset.bet;
    const amount = bets[key] ?? 0;
    let badge = spot.querySelector('.rt-bet-chip');
    if (amount && !badge) {
      badge = document.createElement('span');
      badge.className = 'rt-bet-chip';
      spot.appendChild(badge);
    }
    if (badge) {
      if (amount) badge.textContent = amount >= 1000 ? `${Math.round(amount / 100) / 10}k` : amount;
      else badge.remove();
    }
    spot.setAttribute('aria-label', `Bet on ${betSpec(key).label}${amount ? `, ${money(amount)} placed` : ''}`);
    spot.disabled = spinning;
  });
  document.querySelectorAll('.rt-chip').forEach((btn) => {
    const value = Number(btn.dataset.chip);
    btn.classList.toggle('selected', value === chip);
    btn.setAttribute('aria-pressed', value === chip ? 'true' : 'false');
    btn.disabled = spinning;
  });
  document.getElementById('rt-spin').disabled = spinning || !total;
  document.getElementById('rt-spin').textContent = total ? `Spin · ${money(total)}` : 'Spin';
  document.getElementById('rt-clear').disabled = spinning || !total;
  document.getElementById('rt-rebet').disabled = spinning || !totalOf(lastBets);
  document.getElementById('rt-history').innerHTML = history
    .map((n) => `<li class="${colorOf(n)}" aria-label="${n} ${colorOf(n)}">${n}</li>`).join('');
}

function showHelp() {
  CasinoShell.info('How to Play Roulette', `
    <ol>
      <li>Pick a chip value, then tap numbers or outside bets to place chips. Tap again to add more.</li>
      <li>Press <strong>Spin</strong> (or <kbd>Space</kbd>). The wheel picks one number from 0 to 36.</li>
      <li>Winning bets pay out; the table clears. <strong>Rebet</strong> puts your last bets back.</li>
    </ol>
    <h6>Payouts</h6>
    <ul>
      <li><strong>Single number</strong> — 35 to 1</li>
      <li><strong>Dozen / column</strong> — 2 to 1</li>
      <li><strong>Red, black, odd, even, 1–18, 19–36</strong> — 1 to 1 (the green 0 loses these)</li>
    </ul>
    <p>European single-zero wheel: the house keeps about 2.7% over time. Your hotel's Casino Floor raises the table limit.</p>`);
}

/* ── Init ────────────────────────────────────────────────── */
buildWheel();
buildNumbers();
if (checkGate()) {
  document.getElementById('rt-table').addEventListener('click', (e) => {
    const spot = e.target.closest('.rt-spot');
    if (spot) placeBet(spot.dataset.bet);
  });
  document.querySelectorAll('.rt-chip').forEach((btn) => {
    btn.hidden = btn.hidden && tableMax() < 300;      // $100 chip once limits reach $300
    btn.addEventListener('click', () => selectChip(Number(btn.dataset.chip)));
  });
  document.getElementById('rt-spin').addEventListener('click', spin);
  document.getElementById('rt-clear').addEventListener('click', clearBets);
  document.getElementById('rt-rebet').addEventListener('click', rebet);
  document.getElementById('rt-help').addEventListener('click', showHelp);

  CasinoShell.registerShortcuts([
    { keys: [' '], label: 'Spin', run: spin },
    { keys: ['r'], label: 'Rebet last spin', run: rebet },
    { keys: ['x'], label: 'Clear bets', run: clearBets },
    { keys: ['1', '2', '3', '4'], label: 'Pick a chip ($1 / $5 / $25 / $100)', run: (e) => selectChip([1, 5, 25, 100][Number(e.key) - 1]) },
  ]);
  render();
}
