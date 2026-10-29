/* ============================================================
   CASINO X — HOTEL EVENT QUEUE  (global: HotelEvents)
   ------------------------------------------------------------
   Casino pages never write the hotel save directly: the hotel
   tab keeps its state in memory and would overwrite them on its
   next save. Instead they add events to this small queue, and
   the hotel applies it (HotelBridge.processQueuedEvents) on boot
   and whenever another tab adds to it.

   Link on casino pages BEFORE the game script:
       <script src="../hotel-events.js"></script>

   API:
       HotelEvents.push(type, data)  → queue one casino event
           types: slots_spun · jackpot {amount} · coin_flip_win
                  blackjack_win · blackjack_loss · chips_wagered {amount}
                  comp_chips {cost}  (hotel cash the hotel should debit)
       HotelEvents.take()            → read and clear the queue
       HotelEvents.isEmpty(queue)    → nothing to apply?
   ============================================================ */

const HotelEvents = (() => {
  const KEY = 'hotelEventQueue';
  const MAX_JACKPOTS = 20;

  function empty() { return { counts: {}, wagered: 0, jackpots: [], compCost: 0 }; }

  function read() {
    try {
      const q = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!q || typeof q !== 'object') return empty();
      return {
        counts: q.counts && typeof q.counts === 'object' ? { ...q.counts } : {},
        wagered: Number(q.wagered) || 0,
        jackpots: Array.isArray(q.jackpots) ? q.jackpots : [],
        compCost: Number(q.compCost) || 0,
      };
    } catch (_) { return empty(); }
  }

  // Events are stored as running totals so the queue stays tiny no matter
  // how long the player stays on the casino floor.
  function push(type, data = {}) {
    try {
      const q = read();
      if (type === 'chips_wagered') {
        q.wagered = Math.round((q.wagered + (Number(data.amount) || 0)) * 100) / 100;
      } else if (type === 'comp_chips') {
        q.compCost += Math.max(0, Number(data.cost) || 0);
      } else {
        q.counts[type] = (q.counts[type] || 0) + 1;
        if (type === 'jackpot') q.jackpots = [...q.jackpots, Number(data.amount) || 0].slice(-MAX_JACKPOTS);
      }
      localStorage.setItem(KEY, JSON.stringify(q));
    } catch (_) { /* storage unavailable */ }
  }

  function take() {
    const q = read();
    try { localStorage.removeItem(KEY); } catch (_) { /* storage unavailable */ }
    return q;
  }

  function isEmpty(q) {
    return !q.wagered && !q.compCost && !Object.values(q.counts).some(n => n > 0);
  }

  return { KEY, push, take, peek: read, isEmpty };
})();

if (typeof window !== 'undefined') window.HotelEvents = HotelEvents;
