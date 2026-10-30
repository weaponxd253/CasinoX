/* ─── Lucky Reels — migrated onto CasinoShell ───────────────────────────────
   Header, balance, theme, sound, toast, confetti, game-over and the help
   dialog all come from the shell now. This file is just the slot. */

const symbols = ["🍒", "🍋", "🍉", "⭐", "🍇", "🔔", "🍊", "💰"];
// Three of a kind pays the multiplier, two of a kind pays half of it.
// 💰💰💰 is the 50× jackpot. These values return ~95.4% of wagers.
const multipliers = { "🍒": 2, "🍋": 3, "🍊": 3, "🍉": 4, "🍇": 4, "⭐": 5, "🔔": 8, "💰": 10 };
const JACKPOT_MULT = 50;

const BETS = [0.6, 1.2, 2.4, 3.6, 6];
const MAX_HISTORY = 10;

let currentYPositions = [0, 0, 0];
let currentBet = 0.6;
let typeToken = 0;      // bumps on each typewriter call; older runs stop

/* Auto-spin: a run of spins that stops on a big win (5× the bet or more:
   three stars/bells, a 💰 pair), when the bankroll falls to half of where the run started,
   when the bet is no longer affordable, or when the player stops it. */
const AUTO_BIG_WIN_MULT = 5;
let auto = null;        // { remaining, floor } while a run is going
let spinning = false;   // true from bet placed until the reels settle

const wallet = () => (window.CasinoShell && CasinoShell.wallet) || window.CasinoWallet;

// Animation is optional: if GSAP failed to load, reels settle without it
// instead of hanging after the bet has been taken.
const hasGsap = () => typeof window.gsap !== "undefined";
// Reel spin and win shakes are skipped for players who prefer less motion.
const animate = () => hasGsap() && !CasinoShell.reducedMotion();

// ─── Hotel event helper ────────────────────────────────────────────────────────
// Queues events for the hotel — no hotel scripts needed on this page.
function hotelEvent(type, data) {
  // Queued for the hotel to apply — see hotel-events.js
  window.HotelEvents?.push(type, data);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getRandomSymbol() { return symbols[Math.floor(Math.random() * symbols.length)]; }

function initializeReels() {
  document.querySelectorAll(".icon-container").forEach((reel) => {
    reel.innerHTML = `<div>${getRandomSymbol()}</div>`;
  });
}

function setBet(amount) {
  if (amount > wallet().get() + 1e-9) {
    CasinoShell.toast(`Not enough chips for a $${amount.toFixed(2)} bet.`);
    return;
  }
  currentBet = amount;
  document.getElementById("current-bet").textContent = amount.toFixed(2);
  updateWinningExamples(amount);
  refreshBetButtons();
}

/* Mark the selected bet and dim bets the bankroll can't cover. If the
   current bet is no longer affordable, step down to the largest one that is. */
function refreshBetButtons() {
  const balance = wallet().get();
  const affordable = BETS.filter((b) => b <= balance + 1e-9);
  if (currentBet > balance + 1e-9 && affordable.length && !spinning) {
    currentBet = affordable[affordable.length - 1];
    document.getElementById("current-bet").textContent = currentBet.toFixed(2);
    updateWinningExamples(currentBet);
  }
  document.querySelectorAll(".bet-buttons [data-bet]").forEach((btn) => {
    const value = Number(btn.dataset.bet);
    const selected = Math.abs(value - currentBet) < 1e-9;
    btn.classList.toggle("selected", selected);
    btn.setAttribute("aria-pressed", selected ? "true" : "false");
    btn.classList.toggle("unaffordable", value > balance + 1e-9);
  });
}

// Spin locks only the game's own controls, not the shell header or dialogs.
const gameControls = () => document.querySelectorAll(".bet-buttons button, .button-container button");

function calculateWinnings(syms, betAmount) {
  const unique = Array.from(new Set(syms));
  if (unique.length === 1 && unique[0] === "💰") return betAmount * JACKPOT_MULT;
  if (unique.length === 1) return betAmount * (multipliers[syms[0]] || 1);
  if (unique.length === 2) {
    const repeated = syms.find((s) => syms.filter((x) => x === s).length === 2);
    if (repeated) return betAmount * ((multipliers[repeated] || 1) / 2);
  }
  return 0;
}

function updateWinningExamples(bet) {
  if (typeof bet !== "number" || isNaN(bet)) return;
  document.getElementById("max-bet-display").textContent = bet.toFixed(2);
  const rows = Object.entries(multipliers).sort((a, b) => a[1] - b[1]);
  document.getElementById("paytable-body").innerHTML = rows.map(([sym, mult]) => {
    const full = sym === "💰" ? JACKPOT_MULT : mult;
    const half = mult / 2;
    return `<tr${sym === "💰" ? ' class="jackpot-row"' : ""}>
      <td>${sym}</td>
      <td>×${full}${sym === "💰" ? " Jackpot" : ""}</td>
      <td>×${half}${half === 1 ? " (bet back)" : half < 1 ? " (part back)" : ""}</td>
      <td>$${(bet * full).toFixed(2)} / $${(bet * half).toFixed(2)}</td>
    </tr>`;
  }).join("");
}

// ─── Spin history ─────────────────────────────────────────────────────────────
function addHistoryEntry(syms, winnings, bet) {
  const list = document.getElementById("history-list");
  const empty = list.querySelector(".history-empty");
  if (empty) empty.remove();

  // Show the net result: a payout smaller than the bet is still a loss.
  const net = Math.round((winnings - bet) * 100) / 100;
  const tone = net > 0 ? "win" : net === 0 ? "push" : "loss";
  const amount = net > 0 ? `+$${net.toFixed(2)}` : net === 0 ? "±$0.00" : `−$${Math.abs(net).toFixed(2)}`;
  const li = document.createElement("li");
  li.className = `history-item history-${tone}`;
  li.innerHTML = `
    <span class="history-symbols">${syms.join(" ")}</span>
    <span class="history-result">
      <span class="history-amount ${tone}">${amount}</span>
    </span>`;
  list.insertBefore(li, list.firstChild);
  while (list.children.length > MAX_HISTORY) list.removeChild(list.lastChild);
}

// ─── Game Over ────────────────────────────────────────────────────────────────
function checkGameOver() {
  const bal = wallet().get();
  const affordable = BETS.filter((b) => b <= bal);
  if (bal <= 0 || affordable.length === 0) CasinoShell.gameOver();
}

function resetMoney() {
  CasinoShell.openCashier();
}

/* The top bet grows with the hotel's Casino Floor ($6 × its bet multiplier). */
function applyHotelLimits() {
  const maxBet = window.HotelPerks?.slotsMaxBet?.() ?? BETS[BETS.length - 1];
  if (maxBet <= BETS[BETS.length - 1]) return;
  BETS[BETS.length - 1] = maxBet;
  const btn = document.querySelector(".bet-buttons [data-bet]:last-child");
  if (!btn) return;
  btn.dataset.bet = String(maxBet);
  btn.setAttribute("aria-label", `Bet ${maxBet} dollars, hotel high-limit maximum`);
  btn.title = "High limit unlocked by your hotel's Casino Floor";
  btn.querySelector(".front").innerHTML = `$${maxBet.toFixed(2)}<span class="bet-max-tag"> Max</span>`;
  btn.classList.add("high-limit");
}

// ─── Typewriter ───────────────────────────────────────────────────────────────
function typewriterEffect(element, text, baseSpeed = 100, callback = null) {
  // A newer message replaces one still typing (it used to be dropped,
  // along with its callback that re-enables the buttons).
  const token = ++typeToken;
  const spinButton = document.querySelector(".spin-button");
  element.textContent = "";
  let index = 0;
  const dynamicSpeed = text.length > 20 ? baseSpeed : baseSpeed / 2;
  spinButton.disabled = true;
  if (CasinoShell.reducedMotion()) {           // show the whole message at once
    element.textContent = text;
    setTimeout(() => {
      if (token !== typeToken) return;
      if (!spinning) spinButton.disabled = false;
      if (callback) callback();
    }, 0);
    return;
  }
  (function type() {
    try {
      if (token !== typeToken) return;
      if (index < text.length) { element.textContent += text[index++]; setTimeout(type, dynamicSpeed); }
      else { if (!spinning) spinButton.disabled = false; if (callback) callback(); }
    } catch (err) { console.error("Typewriter error:", err); if (!spinning) spinButton.disabled = false; }
  })();
}

// ─── Win animation on reels ───────────────────────────────────────────────────
function animateWinningReels(reelElements) {
  if (!animate()) return;
  reelElements.forEach((reel) => {
    const container = reel.querySelector(".icon-container");
    gsap.to(reel, { boxShadow: "0 0 20px 6px #ffd700", duration: 0.3, yoyo: true, repeat: 5, ease: "power1.inOut",
      onComplete: () => gsap.set(reel, { boxShadow: "" }) });
    gsap.to(container, { x: 4, duration: 0.06, yoyo: true, repeat: 7, ease: "none",
      onComplete: () => gsap.set(container, { x: 0 }) });
  });
}

// ─── Spin ─────────────────────────────────────────────────────────────────────
function spin() {
  const reelWrappers = Array.from(document.querySelectorAll(".reel"));
  const iconContainers = reelWrappers.map((r) => r.querySelector(".icon-container"));
  const result = document.getElementById("result");
  const spinButton = document.querySelector(".spin-button");
  const allButtons = gameControls();
  const w = wallet();

  if (spinning) return;
  if (currentBet <= 0 || !w.canAfford(currentBet)) {
    typewriterEffect(result, "Invalid bet! Select a valid amount.");
    return;
  }

  spinning = true;
  w.deduct(currentBet);
  CasinoShell.awardXp(currentBet);
  hotelEvent('slots_spun');
  hotelEvent('chips_wagered', { amount: currentBet });
  typewriterEffect(result, "Spinning...", 100);

  allButtons.forEach((b) => (b.disabled = true));
  if (animate()) {
    gsap.to(spinButton, { scale: 1.1, duration: 0.4, yoyo: true, repeat: -1, ease: "power1.inOut" });
    reelWrappers.forEach((r) => gsap.set(r, { boxShadow: "" }));
  }

  const reelPromises = iconContainers.map((container, index) => {
    const randomSymbols = Array.from({ length: 20 }, getRandomSymbol);
    const finalSymbol = getRandomSymbol();
    const totalHeight = randomSymbols.length * 100;
    const finalPosition = currentYPositions[index] - totalHeight - 100;
    return new Promise((resolve) => {
      const settle = () => {
        container.innerHTML = `<div>${finalSymbol}</div>`;
        container.style.transform = "translateY(0)";
        currentYPositions[index] = 0;
        CasinoShell.sound.tone([220, 262, 330][index], "sine", 0.15, 0.2); // reel-stop
        resolve(finalSymbol);
      };
      if (!animate()) { setTimeout(settle, CasinoShell.reducedMotion() ? 150 + index * 150 : 600 + index * 300); return; }
      container.innerHTML += randomSymbols.map((s) => `<div>${s}</div>`).join("") + `<div>${finalSymbol}</div>`;
      gsap.fromTo(container, { y: currentYPositions[index] }, {
        y: finalPosition, duration: 2 + index * 0.2, ease: "power2.inOut", onComplete: settle
      });
    });
  });

  iconContainers.forEach((_, index) => {
    const totalHeight = 20 * 100;
    currentYPositions[index] = currentYPositions[index] - totalHeight - 100;
  });

  Promise.all(reelPromises).then((finalSymbols) => {
    spinning = false;
    if (animate()) {
      gsap.killTweensOf(spinButton);
      gsap.to(spinButton, { scale: 1, duration: 0.2 });
    }

    const winnings = calculateWinnings(finalSymbols, currentBet);
    const isJackpot = winnings === currentBet * JACKPOT_MULT;
    const net = Math.round((winnings - currentBet) * 100) / 100;
    addHistoryEntry(finalSymbols, winnings, currentBet);

    if (winnings > 0) {
      w.add(winnings);
      if (isJackpot) CasinoShell.sound.jackpot();
      else if (net > 0) CasinoShell.sound.win();
      else if (net < 0) CasinoShell.sound.lose();
      if (isJackpot) hotelEvent('jackpot', { amount: winnings });

      const unique = Array.from(new Set(finalSymbols));
      if (unique.length === 1) {
        animateWinningReels(reelWrappers);
      } else {
        const repeated = finalSymbols.find((s) => finalSymbols.filter((x) => x === s).length === 2);
        animateWinningReels(reelWrappers.filter((_, i) => finalSymbols[i] === repeated));
      }

      if (winnings > currentBet) CasinoShell.celebrate(winnings - currentBet); // confetti on net win

      const label = isJackpot ? `🎰 JACKPOT $${winnings.toFixed(2)}! 🎰`
        : net > 0  ? `🎉 You Win $${winnings.toFixed(2)}! 🎉`
        : net === 0 ? `Bet back — $${winnings.toFixed(2)} returned.`
        : `Partial match — $${winnings.toFixed(2)} back.`;
      CasinoShell.announce(`${finalSymbols.join(" ")}. ${label.replace(/[🎰🎉]/gu, "").trim()}`);
      typewriterEffect(result, label, 80, () => { allButtons.forEach((b) => (b.disabled = false)); checkGameOver(); continueAuto(winnings); });
    } else {
      CasinoShell.sound.lose();
      CasinoShell.announce(`${finalSymbols.join(" ")}. No match, lost $${currentBet.toFixed(2)}.`);
      typewriterEffect(result, "Try Again!", 50, () => { allButtons.forEach((b) => (b.disabled = false)); checkGameOver(); continueAuto(0); });
    }
  });
}

// ─── Auto-spin ────────────────────────────────────────────────────────────────
function startAuto(count) {
  if (spinning || auto) return;
  if (!wallet().canAfford(currentBet)) { CasinoShell.toast("Not enough chips for this bet."); return; }
  auto = { remaining: count, floor: wallet().get() / 2 };
  CasinoShell.announce(`Auto-spin: ${count} spins at $${currentBet.toFixed(2)}.`);
  renderAuto();
  autoSpinOnce();
}

function autoSpinOnce() {
  if (!auto) return;
  auto.remaining--;
  renderAuto();
  spin();
}

function stopAuto(reason = "Auto-spin stopped.") {
  if (!auto) return;
  auto = null;
  renderAuto();
  CasinoShell.toast(reason);
  CasinoShell.announce(reason);
}

function continueAuto(winnings) {
  if (!auto) return;
  if (winnings >= currentBet * AUTO_BIG_WIN_MULT) return stopAuto(`Auto-spin stopped on a big win: $${winnings.toFixed(2)}!`);
  if (wallet().get() < auto.floor) return stopAuto("Auto-spin stopped: bankroll is down by half.");
  if (!wallet().canAfford(currentBet)) return stopAuto("Auto-spin stopped: not enough chips for this bet.");
  if (auto.remaining <= 0) return stopAuto("Auto-spin finished.");
  setTimeout(() => { if (auto && !spinning) autoSpinOnce(); }, CasinoShell.reducedMotion() ? 250 : 600);
}

function renderAuto() {
  const running = !!auto;
  document.querySelectorAll(".autospin-btn").forEach((btn) => { btn.hidden = running; });
  const stop = document.getElementById("autospin-stop");
  stop.hidden = !running;
  if (running) stop.textContent = `Stop · ${auto.remaining} left`;
  document.querySelector(".autospin-row").classList.toggle("running", running);
}

// ─── Help content ───────────────────────────────────────────────────────────
function showHelp() {
  CasinoShell.info("How to Play", `
    <h6>🎯 Goal</h6>
    <p>Match symbols on the reels to win multiples of your bet.</p>
    <h6>📝 Gameplay</h6>
    <ol>
      <li>Pick a bet with the buttons.</li>
      <li>Spin with the button or press <kbd>Space</kbd>. Keys <kbd>1</kbd>–<kbd>5</kbd> pick a bet.</li>
      <li>Auto-spin runs 10, 25 or 50 spins and stops on a big win, if your bankroll halves, or when you press Stop, <kbd>Space</kbd> or <kbd>Esc</kbd>.</li>
      <li>Match symbols to win — see the table for payouts.</li>
    </ol>
    <h6>🔘 Buttons</h6>
    <ul>
      <li><strong>Spin</strong> — spin the reels (also: <kbd>Space</kbd>)</li>
      <li><strong>Cashier</strong> — free refill below $1, or trade hotel cash for chips</li>
      <li><strong>Help</strong> — this guide</li>
    </ul>
    <h6>💡 Tip</h6>
    <p>Higher bets pay more but drain the bankroll faster. Play wisely!</p>`);
}

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  CasinoShell.mount({ name: "Lucky Reels", subtitle: "Casino Edition" });

  initializeReels();
  applyHotelLimits();
  updateWinningExamples(currentBet);   // starts at 60¢; no toast if unaffordable
  refreshBetButtons();

  document.querySelectorAll(".bet-buttons [data-bet]").forEach((btn) =>
    btn.addEventListener("click", () => setBet(Number(btn.dataset.bet))));
  wallet().onChange(() => refreshBetButtons());
  document.querySelector(".spin-button").addEventListener("click", () => { if (auto) stopAuto(); else spin(); });
  document.querySelectorAll(".autospin-btn").forEach((btn) =>
    btn.addEventListener("click", () => startAuto(Number(btn.dataset.auto))));
  document.getElementById("autospin-stop").addEventListener("click", () => stopAuto());
  renderAuto();
  document.getElementById("reset-button").addEventListener("click", resetMoney);
  document.getElementById("help").addEventListener("click", showHelp);

  CasinoShell.registerShortcuts([
    { keys: [" "], label: "Spin (stops auto-spin)", run: () => {
      if (auto) { stopAuto(); return; }
      if (!spinning && !document.querySelector(".spin-button").disabled) spin();
    } },
    { keys: ["Escape"], label: "Stop auto-spin", run: () => stopAuto() },
    { keys: ["a"], label: "Auto-spin 10", run: () => startAuto(10) },
    { keys: ["1", "2", "3", "4", "5"], label: "Pick a bet (smallest to largest)", run: (e) => {
      if (spinning) return;
      const btn = document.querySelectorAll(".bet-buttons [data-bet]")[Number(e.key) - 1];
      if (btn) setBet(Number(btn.dataset.bet));
    } },
  ]);

  if (!localStorage.getItem("slotToastShown")) {
    CasinoShell.toast("💡 Press Space to spin, or ? for all keyboard shortcuts.");
    localStorage.setItem("slotToastShown", "true");
  }
});
