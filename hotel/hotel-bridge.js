/* ============================================================
   HOTEL MANAGER — BRIDGE  (hotel-bridge.js)
   ------------------------------------------------------------
   Thin pub/sub bus between the casino and the hotel.
   Casino code calls HotelBridge.onCasinoEvent() and never
   touches HotelState directly. Hotel UI subscribes to events
   it cares about for visual feedback.

   Load order: wallet.js → hotel-config.js → hotel-state.js
               → hotel-engine.js → hotel-bridge.js
   ============================================================ */

const HotelBridge = (() => {
  const _handlers = {};

  /* ── Pub / sub ───────────────────────────────────────────── */
  function on(event, fn) {
    if (!_handlers[event]) _handlers[event] = [];
    _handlers[event].push(fn);
  }

  function emit(event, data = {}) {
    (_handlers[event] ?? []).forEach(fn => {
      try { fn(data); } catch (e) { console.error('[HotelBridge]', e); }
    });
  }

  /* ── Casino → Hotel ──────────────────────────────────────────
     Call this from casino game scripts whenever a relevant event
     happens. Examples:

       HotelBridge.onCasinoEvent('blackjack_win', { net: 25 });
       HotelBridge.onCasinoEvent('jackpot',       { amount: 300 });
       HotelBridge.onCasinoEvent('slots_spun',    {});
  ─────────────────────────────────────────────────────────── */
  function onCasinoEvent(type, data = {}) {
    if (!HotelState.get()) return;  // hotel not loaded

    const state = HotelState.get();
    const bridge = state.casinoBridge;

    switch (type) {

      case 'blackjack_win': {
        bridge.events.blackjackWins++;
        HotelState.updateCasinoBridge({ blackjackWins: bridge.events.blackjackWins });
        HotelState.tickAchievementProgress('ten_blackjack_wins', 1);
        // Every 5 wins: small reputation bump + 20-min income boost
        if (bridge.events.blackjackWins % 5 === 0) {
          _applyIncomeBoost(1.20, 20);
          emit('income_boost', { mult: 1.20, minutes: 20,
            reason: 'Blackjack streak — guests are excited!' });
        }
        emit('casino_event', { type, data });
        break;
      }

      case 'blackjack_loss': {
        bridge.events.blackjackLosses++;
        HotelState.updateCasinoBridge({ blackjackLosses: bridge.events.blackjackLosses });
        emit('casino_event', { type, data });
        break;
      }

      case 'jackpot': {
        bridge.events.jackpotsHit++;
        HotelState.updateCasinoBridge({ jackpotsHit: bridge.events.jackpotsHit });
        HotelState.tickAchievementProgress('jackpot_hit', 1);
        // Jackpot: attract high roller next spawn, 30-min income boost
        _applyIncomeBoost(1.40, 30);
        HotelState.setHighRollerFlag();
        emit('jackpot', { amount: data.amount });
        emit('income_boost', { mult: 1.40, minutes: 30,
          reason: 'Jackpot hit — word spreads fast!' });
        break;
      }

      case 'slots_spun': {
        bridge.events.slotsSpun++;
        HotelState.updateCasinoBridge({ slotsSpun: bridge.events.slotsSpun });
        emit('casino_event', { type, data });
        break;
      }

      case 'coin_flip_win': {
        bridge.events.coinFlipsWon++;
        HotelState.updateCasinoBridge({ coinFlipsWon: bridge.events.coinFlipsWon });
        emit('casino_event', { type, data });
        break;
      }

      case 'all_chips_lost': {
        // Hotel gesture: offer comp chips drawn from hotel cash
        const compChips = 50;
        if (HotelState.getCash() >= 200) {
          HotelState.spendHotelCash(200);  // $200 hotel cash → 50 comp chips
          if (window.CasinoWallet) CasinoWallet.add(compChips);
          emit('comp_chips', { chips: compChips });
        }
        emit('casino_event', { type, data });
        break;
      }

      case 'level_up': {
        // Casino XP level up → small hotel reputation boost
        emit('casino_level_up', { level: data.level });
        HotelEngine.recalculateReputation(HotelState.get());
        break;
      }
    }
  }

  /* ── Hotel → Casino ───────────────────────────────────────
     Hotel upgrades that affect casino behavior.
     Called by hotel-ui.js after an upgrade completes.
  ─────────────────────────────────────────────────────────── */
  function applyHotelToCasino(state) {
    const casinoLevel = state.departments.casino?.level ?? 1;
    const barLevel    = state.departments.bar?.level    ?? 0;

    // Casino dept level → bet multiplier (exposed to casino shell)
    const stats    = HotelConfig.UPGRADE_CATALOG.casino?.[casinoLevel - 1];
    const betMult  = stats?.betMult   ?? 1.0;
    const chipBonus= stats?.chipBonus ?? 0;

    // Bar → daily bonus boost
    const dailyBonus = barLevel >= 3 ? 100 : 0;

    // Store effects in sessionStorage so casino pages can read them
    // without needing to load the full hotel state
    const effects = { betMult, chipBonus, dailyBonus };
    try {
      sessionStorage.setItem('hotelCasinoEffects', JSON.stringify(effects));
    } catch (e) { /* storage unavailable */ }

    emit('hotel_effects_updated', effects);
    return effects;
  }

  /* ── Snapshot sync ───────────────────────────────────────── */
  function syncCasinoSnapshot() {
    const state = HotelState.get();
    if (!state) return;
    const snap = {
      casinoLevel:  state.departments.casino?.level ?? 1,
      chipBalance:  window.CasinoWallet?.get() ?? 0,
      playerLevel:  (() => {
        try {
          const p = JSON.parse(localStorage.getItem('casinoProfile') ?? '{}');
          return p.xp ? Math.floor(p.xp / 50) + 1 : 1;
        } catch { return 1; }
      })(),
      lastSnapshot: Date.now(),
    };
    Object.assign(state.casinoBridge.snapshot, snap);
    HotelState.save();
    return snap;
  }

  /* ── Internal helpers ────────────────────────────────────── */
  function _applyIncomeBoost(mult, minutes) {
    const expiry = Date.now() + minutes * 60_000;
    const state  = HotelState.get();
    state.ticker.activeMultiplier      = mult;
    state.ticker.activeMultiplierExpiry = expiry;
    HotelState.save();
  }

  return { on, emit, onCasinoEvent, applyHotelToCasino, syncCasinoSnapshot };
})();

if (typeof window !== 'undefined') window.HotelBridge = HotelBridge;
