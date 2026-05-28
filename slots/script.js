// ─── Symbols & multipliers ────────────────────────────────────────────────────
const symbols = ["🍒", "🍋", "🍉", "⭐", "🍇", "🔔", "🍊", "💰"];

const multipliers = {
  "🍒": 2,
  "🍋": 3,
  "🍉": 4,
  "⭐": 5,
  "💰": 10
};

// ─── Shared wallet ──────────────────────────────────────────────────────────
// Use the shared CasinoWallet when present; otherwise fall back to a local
// in-memory balance so the slot still runs standalone (just won't persist).
const Wallet = (typeof window !== "undefined" && window.CasinoWallet) || (function () {
  let bal = 100;
  const subs = [];
  const set = (v) => {
    bal = Math.max(0, parseFloat(Number(v).toFixed(2)));
    subs.forEach((fn) => fn(bal));
    return bal;
  };
  return {
    get: () => bal,
    set,
    add: (v) => set(bal + Number(v)),
    deduct: (v) => set(bal - Number(v)),
    canAfford: (b) => bal + 1e-9 >= b,
    reset: () => set(100),
    onChange: (fn) => { subs.push(fn); fn(bal); },
    STARTING: 100
  };
})();

// ─── State ────────────────────────────────────────────────────────────────────
let currentYPositions = [0, 0, 0];
let currentBet = 0.6;
let isTyping = false;
const BETS = [0.6, 1.2, 2.4, 3.6, 6];
const MAX_HISTORY = 10;

// ─── Web Audio (sound effects) ────────────────────────────────────────────────
// All sounds are synthesised via the Web Audio API — no external files needed.
let audioCtx = null;

function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playTone(frequency, type, duration, gainValue = 0.3, startTime = 0) {
  const ctx = getAudioCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.type = type;
  osc.frequency.setValueAtTime(frequency, ctx.currentTime + startTime);

  gain.gain.setValueAtTime(gainValue, ctx.currentTime + startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startTime + duration);

  osc.start(ctx.currentTime + startTime);
  osc.stop(ctx.currentTime + startTime + duration);
}

function playClickSound() {
  // Short tick for reel spin start
  playTone(180, "square", 0.08, 0.15);
}

function playReelStopSound(reelIndex) {
  // Each reel lands with a slightly different pitch
  const pitches = [220, 262, 330];
  playTone(pitches[reelIndex], "sine", 0.15, 0.2);
}

function playWinSound(isJackpot) {
  if (isJackpot) {
    // Ascending fanfare
    [523, 659, 784, 1047].forEach((freq, i) => playTone(freq, "sine", 0.3, 0.4, i * 0.12));
  } else {
    // Simple two-note win chime
    playTone(523, "sine", 0.2, 0.35, 0);
    playTone(784, "sine", 0.25, 0.35, 0.15);
  }
}

function playLoseSound() {
  // Low descending blip
  playTone(180, "sawtooth", 0.18, 0.15, 0);
  playTone(140, "sawtooth", 0.2, 0.1, 0.15);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getRandomSymbol() {
  return symbols[Math.floor(Math.random() * symbols.length)];
}

function initializeReels() {
  document.querySelectorAll(".icon-container").forEach((reel) => {
    reel.innerHTML = `<div>${getRandomSymbol()}</div>`;
  });
}

function updateBalanceDisplay() {
  document.getElementById("balance").textContent = Wallet.get().toFixed(2);
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
  document.getElementById("cherry-winnings").textContent =
    `$${(bet * 2).toFixed(2)} (full), $${(bet * 1).toFixed(2)} (partial)`;
  document.getElementById("lemon-winnings").textContent =
    `$${(bet * 3).toFixed(2)} (full), $${(bet * 1.5).toFixed(2)} (partial)`;
  document.getElementById("watermelon-winnings").textContent =
    `$${(bet * 4).toFixed(2)} (full), $${(bet * 2).toFixed(2)} (partial)`;
  document.getElementById("star-winnings").textContent =
    `$${(bet * 5).toFixed(2)} (full), $${(bet * 2.5).toFixed(2)} (partial)`;
  document.getElementById("jackpot-winnings").textContent =
    `$${(bet * 50).toFixed(2)} (jackpot)`;
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
        : `<span class="history-amount loss">−$${bet.toFixed(2)}</span>`
      }
    </span>`;

  list.insertBefore(li, list.firstChild);

  // Keep only the most recent MAX_HISTORY entries
  while (list.children.length > MAX_HISTORY) {
    list.removeChild(list.lastChild);
  }
}

// ─── Game Over ────────────────────────────────────────────────────────────────
function checkGameOver() {
  const bal = Wallet.get();
  const affordable = BETS.filter((b) => b <= bal);
  // Out of funds if balance is gone OR too small to cover even the minimum bet.
  if (bal <= 0 || affordable.length === 0) {
    const modal = new bootstrap.Modal(document.getElementById("gameOverModal"));
    modal.show();
  }
}

function resetMoney() {
  Wallet.reset();
  updateBalanceDisplay();
  // Re-enable all bet buttons in case they were dimmed
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

  function type() {
    try {
      if (index < text.length) {
        element.textContent += text[index++];
        setTimeout(type, dynamicSpeed);
      } else {
        spinButton.disabled = false;
        isTyping = false;
        if (callback) callback();
      }
    } catch (err) {
      console.error("Typewriter error:", err);
      spinButton.disabled = false;
      isTyping = false;
    }
  }

  type();
}

// ─── Win animation on reels ───────────────────────────────────────────────────
function animateWinningReels(reelElements, winningSymbol) {
  reelElements.forEach((reel) => {
    const container = reel.querySelector(".icon-container");
    // Glow pulse via GSAP then shake
    gsap.to(reel, {
      boxShadow: "0 0 20px 6px #ffd700",
      duration: 0.3,
      yoyo: true,
      repeat: 5,
      ease: "power1.inOut",
      onComplete: () => gsap.set(reel, { boxShadow: "" })
    });
    gsap.to(container, {
      x: 4,
      duration: 0.06,
      yoyo: true,
      repeat: 7,
      ease: "none",
      onComplete: () => gsap.set(container, { x: 0 })
    });
  });
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function showToast(message) {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = "toast align-items-center text-bg-dark border-0";
  toast.setAttribute("role", "alert");
  toast.setAttribute("aria-live", "assertive");
  toast.setAttribute("aria-atomic", "true");
  toast.innerHTML = `
    <div class="d-flex">
      <div class="toast-body">${message}</div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
    </div>`;

  container.appendChild(toast);

  try {
    const bsToast = new bootstrap.Toast(toast);
    bsToast.show();
    toast.addEventListener("hidden.bs.toast", () => toast.remove());
  } catch (err) {
    console.error("Toast error:", err);
  }
}

// ─── Theme ────────────────────────────────────────────────────────────────────
function toggleTheme() {
  const body = document.body;
  const icon = document.getElementById("theme-icon");

  gsap.fromTo(icon, { rotate: 0 }, { rotate: 360, duration: 0.5, ease: "power2.inOut" });

  if (body.classList.contains("dark-theme")) {
    body.classList.replace("dark-theme", "light-theme");
    icon.classList.replace("fa-moon", "fa-sun");
  } else {
    body.classList.replace("light-theme", "dark-theme");
    icon.classList.replace("fa-sun", "fa-moon");
  }

  localStorage.setItem("theme", body.classList.contains("dark-theme") ? "dark" : "light");
}

// ─── Spin ─────────────────────────────────────────────────────────────────────
function spin() {
  const reelWrappers = Array.from(document.querySelectorAll(".reel"));
  const iconContainers = reelWrappers.map((r) => r.querySelector(".icon-container"));
  const result = document.getElementById("result");
  const spinButton = document.querySelector(".spin-button");
  const allButtons = document.querySelectorAll("button");

  if (currentBet <= 0 || !Wallet.canAfford(currentBet)) {
    typewriterEffect(result, "Invalid bet! Select a valid amount.");
    return;
  }

  Wallet.deduct(currentBet);          // take the wager from the shared bankroll
  playClickSound();
  typewriterEffect(result, "Spinning...", 100);

  allButtons.forEach((b) => (b.disabled = true));
  gsap.to(spinButton, { scale: 1.1, duration: 0.4, yoyo: true, repeat: -1, ease: "power1.inOut" });

  // Clear any leftover reel glow from a previous win
  reelWrappers.forEach((r) => gsap.set(r, { boxShadow: "" }));

  const reelPromises = iconContainers.map((container, index) => {
    const randomSymbols = Array.from({ length: 20 }, getRandomSymbol);
    const finalSymbol = getRandomSymbol();
    const totalHeight = randomSymbols.length * 100;
    const finalPosition = currentYPositions[index] - totalHeight - 100;

    container.innerHTML +=
      randomSymbols.map((s) => `<div>${s}</div>`).join("") + `<div>${finalSymbol}</div>`;

    return new Promise((resolve) => {
      gsap.fromTo(
        container,
        { y: currentYPositions[index] },
        {
          y: finalPosition,
          duration: 2 + index * 0.2,
          ease: "power2.inOut",
          onComplete: () => {
            container.innerHTML = `<div>${finalSymbol}</div>`;
            container.style.transform = "translateY(0)";
            currentYPositions[index] = 0;
            playReelStopSound(index);  // Sound per reel landing
            resolve(finalSymbol);
          }
        }
      );
    });
  });

  // Update positions outside the map so they don't interfere with the closure
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
      Wallet.add(winnings);           // pay out into the shared bankroll
      playWinSound(isJackpot);

      // Determine which reels are part of the win and animate them
      const unique = Array.from(new Set(finalSymbols));
      if (unique.length === 1) {
        // Full match — all reels glow
        animateWinningReels(reelWrappers, unique[0]);
      } else {
        // Partial match — animate the reels showing the repeated symbol
        const repeated = finalSymbols.find(
          (s) => finalSymbols.filter((x) => x === s).length === 2
        );
        const winningReels = reelWrappers.filter(
          (_, i) => finalSymbols[i] === repeated
        );
        animateWinningReels(winningReels, repeated);
      }

      const label = isJackpot ? `🎰 JACKPOT $${winnings.toFixed(2)}! 🎰` : `🎉 You Win $${winnings.toFixed(2)}! 🎉`;
      typewriterEffect(result, label, 80, () => {
        allButtons.forEach((b) => (b.disabled = false));
        updateBalanceDisplay();
        checkGameOver();
      });
    } else {
      playLoseSound();
      typewriterEffect(result, "Try Again!", 50, () => {
        allButtons.forEach((b) => (b.disabled = false));
        updateBalanceDisplay();
        checkGameOver();
      });
    }
  });
}

// ─── Single DOMContentLoaded ──────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  // Theme
  const savedTheme = localStorage.getItem("theme") || "light";
  document.body.classList.add(savedTheme === "dark" ? "dark-theme" : "light-theme");
  document.getElementById("theme-icon").classList.add(
    savedTheme === "dark" ? "fa-moon" : "fa-sun"
  );

  // Core init
  initializeReels();
  setBet(0.6);
  updateWinningExamples(currentBet);

  // Keep the balance display in sync with the shared wallet — fires immediately
  // with the current value, and on every change (including the lobby Cashier
  // and changes made in other tabs).
  Wallet.onChange(updateBalanceDisplay);

  // Button listeners
  document.querySelector(".spin-button").addEventListener("click", spin);
  document.querySelector(".theme-toggle").addEventListener("click", toggleTheme);
  document.getElementById("reset-button").addEventListener("click", resetMoney);
  document.getElementById("help").addEventListener("click", () => {
    new bootstrap.Modal(document.getElementById("helpModal")).show();
  });
  document.getElementById("gameOverResetBtn").addEventListener("click", () => {
    bootstrap.Modal.getInstance(document.getElementById("gameOverModal")).hide();
    resetMoney();
  });

  // Space bar triggers spin
  document.addEventListener("keydown", (e) => {
    if (e.code === "Space" && !e.repeat) {
      e.preventDefault(); // prevent page scroll
      const spinBtn = document.querySelector(".spin-button");
      if (!spinBtn.disabled) spin();
    }
  });

  // Bootstrap tooltips
  document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach((el) => {
    new bootstrap.Tooltip(el);
  });

  // First-visit toast
  if (!localStorage.getItem("themeToastShown")) {
    showToast("💡 Use the button in the corner to switch themes! Press Space to spin.");
    localStorage.setItem("themeToastShown", "true");
  }
});
