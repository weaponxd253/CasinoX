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

  /* ── Queued casino events (from HotelEvents) ────────────────
     Casino pages queue running totals; apply them here in one
     pass with a single save. Called on hotel boot and whenever
     another tab adds to the queue.
  ─────────────────────────────────────────────────────────── */
  function processQueuedEvents() {
    if (!window.HotelEvents || !HotelState.get()) return null;
    const queue = HotelEvents.take();
    if (HotelEvents.isEmpty(queue)) return null;

    const ev = HotelState.get().casinoBridge.events;
    const n = type => Math.max(0, Math.floor(Number(queue.counts[type]) || 0));
    const summary = {
      blackjackWins:   n('blackjack_win'),
      blackjackLosses: n('blackjack_loss'),
      slotsSpun:       n('slots_spun'),
      coinFlipsWon:    n('coin_flip_win'),
      jackpotsHit:     n('jackpot'),
      chipsWagered:    Math.max(0, Number(queue.wagered) || 0),
    };

    const winsBefore = ev.blackjackWins ?? 0;
    HotelState.updateCasinoBridge({
      blackjackWins:     winsBefore + summary.blackjackWins,
      blackjackLosses:   (ev.blackjackLosses ?? 0) + summary.blackjackLosses,
      slotsSpun:         (ev.slotsSpun ?? 0) + summary.slotsSpun,
      coinFlipsWon:      (ev.coinFlipsWon ?? 0) + summary.coinFlipsWon,
      jackpotsHit:       (ev.jackpotsHit ?? 0) + summary.jackpotsHit,
      totalChipsWagered: Math.round(((ev.totalChipsWagered ?? 0) + summary.chipsWagered) * 100) / 100,
    });

    if (summary.blackjackWins) HotelState.tickAchievementProgress('ten_blackjack_wins', summary.blackjackWins);

    // One boost per sync — the strongest one earned wins.
    if (summary.jackpotsHit) {
      HotelState.tickAchievementProgress('jackpot_hit', summary.jackpotsHit);
      HotelState.setHighRollerFlag();
      _applyIncomeBoost(1.40, 30);
      emit('jackpot', { amount: Math.max(0, ...queue.jackpots) });
      emit('income_boost', { mult: 1.40, minutes: 30,
        reason: 'Jackpot hit — word spreads fast!' });
    } else if (Math.floor((winsBefore + summary.blackjackWins) / 5) > Math.floor(winsBefore / 5)) {
      _applyIncomeBoost(1.20, 20);
      emit('income_boost', { mult: 1.20, minutes: 20,
        reason: 'Blackjack streak — guests are excited!' });
    }

    emit('casino_events_synced', summary);
    return summary;
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
      // Same curve as the casino shell: level L needs 50 × L XP to clear.
      playerLevel:  window.CasinoShell?.profile?.level ?? (() => {
        try {
          let xp = Number(JSON.parse(localStorage.getItem('casinoProfile') ?? '{}').xp) || 0;
          let level = 1;
          while (xp >= 50 * level) { xp -= 50 * level; level++; }
          return level;
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

  return { on, emit, onCasinoEvent, processQueuedEvents, applyHotelToCasino, syncCasinoSnapshot };
})();

if (typeof window !== 'undefined') window.HotelBridge = HotelBridge;
