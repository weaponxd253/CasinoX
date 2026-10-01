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
       CasinoWallet.canTopUp()       → Cashier allowed? (balance under TOPUP_BELOW)
       CasinoWallet.topUp()          → refill to STARTING if allowed, else false
       CasinoWallet.devMode()        → ?dev=1 / ?dev=0 testing switch (persists)
       CasinoWallet.onChange(fn)      → run fn(balance) whenever it changes
                                        (fires across tabs too)
   ============================================================ */

const CasinoWallet = (() => {
  const KEY = 'casinoBalance';
  const STARTING = 100;
  const TOPUP_BELOW = 1;            // Cashier only refills a bankroll under $1
  const DEV_MODE_KEY = 'hotelDevMode';

  /* Visit any page with ?dev=1 to turn on (persists in localStorage),
     ?dev=0 to turn off. Skips economy limits so every system is quick
     to reach while testing. */
  function devMode() {
    try {
      const flag = new URLSearchParams(location.search).get('dev');
      if (flag === '1') localStorage.setItem(DEV_MODE_KEY, '1');
      else if (flag === '0') localStorage.removeItem(DEV_MODE_KEY);
      return localStorage.getItem(DEV_MODE_KEY) === '1';
    } catch (_) { return false; }
  }

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

  // The Cashier is a bail-out for a busted bankroll, not free chips.
  const canTopUp = () => devMode() || get() < TOPUP_BELOW;
  const topUp    = () => (canTopUp() ? reset() : false);

  function onChange(fn) {
    // same-page updates
    document.addEventListener('wallet:change', (e) => fn(e.detail));
    // updates made in another tab/window
    window.addEventListener('storage', (e) => { if (e.key === KEY) fn(get()); });
    fn(get()); // fire once with current value
  }

  return { get, set, add, deduct, canAfford, reset, canTopUp, topUp, devMode, onChange, STARTING, TOPUP_BELOW };
})();

if (typeof window !== 'undefined') window.CasinoWallet = CasinoWallet;
