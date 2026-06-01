/* ============================================================
   CASINO X — SHARED WALLET
   ------------------------------------------------------------
   One bankroll across the lobby and every game, persisted in
   localStorage so it survives navigation between pages.

   Link in every page (lobby + each game) BEFORE the page's
   own script:
       <script src="wallet.js"></script>

   API:
       CasinoWallet.get()            → current balance (number)
       CasinoWallet.set(amount)      → set absolute balance
       CasinoWallet.add(amount)      → add winnings, returns new balance
       CasinoWallet.deduct(amount)   → take a bet, returns new balance
       CasinoWallet.canAfford(bet)   → boolean
       CasinoWallet.reset()          → back to STARTING ($100)
       CasinoWallet.onChange(fn)      → run fn(balance) whenever it changes
                                        (fires across tabs too)
   ============================================================ */

const CasinoWallet = (() => {
  const KEY = 'casinoBalance';
  const STARTING = 100;

  function round(n) { return Math.max(0, parseFloat(Number(n).toFixed(2))); }

  function get() {
    const raw = localStorage.getItem(KEY);
    const val = parseFloat(raw);
    if (isNaN(val)) { localStorage.setItem(KEY, STARTING); return STARTING; }
    return val;
  }

  function emit(balance) {
    document.dispatchEvent(new CustomEvent('wallet:change', { detail: balance }));
  }

  function set(amount) {
    const val = round(amount);
    localStorage.setItem(KEY, val);
    emit(val);
    return val;
  }

  const add     = (amount) => set(get() + Number(amount));
  const deduct  = (amount) => set(get() - Number(amount));
  const canAfford = (bet)  => get() + 1e-9 >= round(bet);
  const reset   = ()       => set(STARTING);

  function onChange(fn) {
    // same-page updates
    document.addEventListener('wallet:change', (e) => fn(e.detail));
    // updates made in another tab/window
    window.addEventListener('storage', (e) => { if (e.key === KEY) fn(get()); });
    fn(get()); // fire once with current value
  }

  return { get, set, add, deduct, canAfford, reset, onChange, STARTING };
})();

if (typeof window !== 'undefined') window.CasinoWallet = CasinoWallet;
