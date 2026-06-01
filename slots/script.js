/* ─── Lucky Reels — migrated onto CasinoShell ───────────────────────────────
   Header, balance, theme, sound, toast, confetti, game-over and the help
   dialog all come from the shell now. This file is just the slot. */

const symbols = ["🍒", "🍋", "🍉", "⭐", "🍇", "🔔", "🍊", "💰"];
const multipliers = { "🍒": 2, "🍋": 3, "🍉": 4, "⭐": 5, "💰": 10 };

const BETS = [0.6, 1.2, 2.4, 3.6, 6];
const MAX_HISTORY = 10;

let currentYPositions = [0, 0, 0];
let currentBet = 0.6;
let isTyping = false;

const wallet = () => (window.CasinoShell && CasinoShell.wallet) || window.CasinoWallet;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getRandomSymbol() { return symbols[Math.floor(Math.random() * symbols.length)]; }

function initializeReels() {
  document.querySelectorAll(".icon-container").forEach((reel) => {
    reel.innerHTML = `<div>${getRandomSymbol()}</div>`;
  });
}

function setBet(amount) {
  currentBet = amount;
  document.getElementById("current-bet").textContent = amount.toFixed(2);
  updateWinningExamples(amount);
}

function calculateWinnings(syms, betAmount) {
  const unique = Array.from(new Set(syms));
  if (unique.length === 1 && unique[0] === "💰") return betAmount * 50;
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
  document.getElementById("cherry-winnings").textContent     = `$${(bet * 2).toFixed(2)} (full), $${(bet * 1).toFixed(2)} (partial)`;
  document.getElementById("lemon-winnings").textContent      = `$${(bet * 3).toFixed(2)} (full), $${(bet * 1.5).toFixed(2)} (partial)`;
  document.getElementById("watermelon-winnings").textContent = `$${(bet * 4).toFixed(2)} (full), $${(bet * 2).toFixed(2)} (partial)`;
  document.getElementById("star-winnings").textContent       = `$${(bet * 5).toFixed(2)} (full), $${(bet * 2.5).toFixed(2)} (partial)`;
  document.getElementById("jackpot-winnings").textContent    = `$${(bet * 50).toFixed(2)} (jackpot)`;
}

// ─── Spin history ─────────────────────────────────────────────────────────────
function addHistoryEntry(syms, winnings, bet) {
  const list = document.getElementById("history-list");
  const empty = list.querySelector(".history-empty");
  if (empty) empty.remove();

  const isWin = winnings > 0;
  const li = document.createElement("li");
  li.className = `history-item ${isWin ? "history-win" : "history-loss"}`;
  li.innerHTML = `
    <span class="history-symbols">${syms.join(" ")}</span>
    <span class="history-result">
      ${isWin
        ? `<span class="history-amount win">+$${winnings.toFixed(2)}</span>`
        : `<span class="history-amount loss">−$${bet.toFixed(2)}</span>`}
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
  wallet().reset();
  document.querySelectorAll(".bet-buttons .pushable").forEach((b) => (b.disabled = false));
}

// ─── Typewriter ───────────────────────────────────────────────────────────────
function typewriterEffect(element, text, baseSpeed = 100, callback = null) {
  if (isTyping) return;
  isTyping = true;
  const spinButton = document.querySelector(".spin-button");
  element.textContent = "";
  let index = 0;
  const dynamicSpeed = text.length > 20 ? baseSpeed : baseSpeed / 2;
  spinButton.disabled = true;
  (function type() {
    try {
      if (index < text.length) { element.textContent += text[index++]; setTimeout(type, dynamicSpeed); }
      else { spinButton.disabled = false; isTyping = false; if (callback) callback(); }
    } catch (err) { console.error("Typewriter error:", err); spinButton.disabled = false; isTyping = false; }
  })();
}

// ─── Win animation on reels ───────────────────────────────────────────────────
function animateWinningReels(reelElements) {
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
  const allButtons = document.querySelectorAll("button");
  const w = wallet();

  if (currentBet <= 0 || !w.canAfford(currentBet)) {
    typewriterEffect(result, "Invalid bet! Select a valid amount.");
    return;
  }

  w.deduct(currentBet);
  CasinoShell.awardXp(currentBet);
  CasinoShell.sound.click();
  typewriterEffect(result, "Spinning...", 100);

  allButtons.forEach((b) => (b.disabled = true));
  gsap.to(spinButton, { scale: 1.1, duration: 0.4, yoyo: true, repeat: -1, ease: "power1.inOut" });
  reelWrappers.forEach((r) => gsap.set(r, { boxShadow: "" }));

  const reelPromises = iconContainers.map((container, index) => {
    const randomSymbols = Array.from({ length: 20 }, getRandomSymbol);
    const finalSymbol = getRandomSymbol();
    const totalHeight = randomSymbols.length * 100;
    const finalPosition = currentYPositions[index] - totalHeight - 100;
    container.innerHTML += randomSymbols.map((s) => `<div>${s}</div>`).join("") + `<div>${finalSymbol}</div>`;
    return new Promise((resolve) => {
      gsap.fromTo(container, { y: currentYPositions[index] }, {
        y: finalPosition, duration: 2 + index * 0.2, ease: "power2.inOut",
        onComplete: () => {
          container.innerHTML = `<div>${finalSymbol}</div>`;
          container.style.transform = "translateY(0)";
          currentYPositions[index] = 0;
          CasinoShell.sound.tone([220, 262, 330][index], "sine", 0.15, 0.2); // reel-stop
          resolve(finalSymbol);
        }
      });
    });
  });

  iconContainers.forEach((_, index) => {
    const totalHeight = 20 * 100;
    currentYPositions[index] = currentYPositions[index] - totalHeight - 100;
  });

  Promise.all(reelPromises).then((finalSymbols) => {
    gsap.killTweensOf(spinButton);
    gsap.to(spinButton, { scale: 1, duration: 0.2 });

    const winnings = calculateWinnings(finalSymbols, currentBet);
    const isJackpot = winnings === currentBet * 50;
    addHistoryEntry(finalSymbols, winnings, currentBet);

    if (winnings > 0) {
      w.add(winnings);
      isJackpot ? CasinoShell.sound.jackpot() : CasinoShell.sound.win();

      const unique = Array.from(new Set(finalSymbols));
      if (unique.length === 1) {
        animateWinningReels(reelWrappers);
      } else {
        const repeated = finalSymbols.find((s) => finalSymbols.filter((x) => x === s).length === 2);
        animateWinningReels(reelWrappers.filter((_, i) => finalSymbols[i] === repeated));
      }

      if (winnings > currentBet) CasinoShell.celebrate(winnings - currentBet); // confetti on net win

      const label = isJackpot ? `🎰 JACKPOT $${winnings.toFixed(2)}! 🎰` : `🎉 You Win $${winnings.toFixed(2)}! 🎉`;
      typewriterEffect(result, label, 80, () => { allButtons.forEach((b) => (b.disabled = false)); checkGameOver(); });
    } else {
      CasinoShell.sound.lose();
      typewriterEffect(result, "Try Again!", 50, () => { allButtons.forEach((b) => (b.disabled = false)); checkGameOver(); });
    }
  });
}

// ─── Help content ───────────────────────────────────────────────────────────
function showHelp() {
  CasinoShell.info("How to Play", `
    <h6>🎯 Goal</h6>
    <p>Match symbols on the reels to win multiples of your bet.</p>
    <h6>📝 Gameplay</h6>
    <ol>
      <li>Pick a bet with the buttons.</li>
      <li>Spin with the button or press <strong>Space</strong>.</li>
      <li>Match symbols to win — see the table for payouts.</li>
    </ol>
    <h6>🔘 Buttons</h6>
    <ul>
      <li><strong>Spin</strong> — spin the reels (also: Space)</li>
      <li><strong>Cashier</strong> — reset your bankroll to $100</li>
      <li><strong>Help</strong> — this guide</li>
    </ul>
    <h6>💡 Tip</h6>
    <p>Higher bets pay more but drain the bankroll faster. Play wisely!</p>`);
}

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  CasinoShell.mount({ name: "Lucky Reels", subtitle: "Casino Edition" });

  initializeReels();
  setBet(0.6);
  updateWinningExamples(currentBet);

  document.querySelector(".spin-button").addEventListener("click", spin);
  document.getElementById("reset-button").addEventListener("click", resetMoney);
  document.getElementById("help").addEventListener("click", showHelp);

  document.addEventListener("keydown", (e) => {
    if (e.code === "Space" && !e.repeat) {
      e.preventDefault();
      const spinBtn = document.querySelector(".spin-button");
      if (!spinBtn.disabled) spin();
    }
  });

  if (!localStorage.getItem("slotToastShown")) {
    CasinoShell.toast("💡 Press Space to spin. Theme & sound are in the header.");
    localStorage.setItem("slotToastShown", "true");
  }
});
