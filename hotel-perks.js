/* ============================================================
   CASINO X — HOTEL PERKS  (global: HotelPerks)
   ------------------------------------------------------------
   What the hotel gives the casino. The hotel writes a perks
   snapshot into its save (HotelBridge.applyHotelToCasino);
   casino pages only READ it here, so they never overwrite
   hotel progress. Anything that costs hotel cash (comps) goes
   through the HotelEvents queue and is debited by the hotel.

   Load after hotel-events.js:
       <script src="../hotel-events.js"></script>
       <script src="../hotel-perks.js"></script>

   API:
       HotelPerks.get()               → { hasHotel, casinoLevel, betMult, chipBonus, barDailyBonus, hotelCash }
       HotelPerks.slotsMaxBet()       → top Lucky Reels bet ($6 × casino bet multiplier)
       HotelPerks.blackjackChips()    → chip values, with $50/$100 at higher casino levels
       HotelPerks.dailyBonusExtra(n)  → extra chips on an n-chip daily bonus
       HotelPerks.compOffer()         → { cost, chips, available, hotelCash, reason }
       HotelPerks.takeComp()          → exchange hotel cash for chips (false if unavailable)
       HotelPerks.highRoller()        → { active, minutesLeft } — high-stakes table
       HotelPerks.xpMult()            → casino XP multiplier (1.5 during a high-roller visit)
       HotelPerks.limitMult()         → table-limit multiplier (casino level × high roller)
       HotelPerks.gameGate(id)        → unlock status of a gated casino game
       HotelPerks.list()              → active perks for display
       HotelPerks.renderStrip()       → "Hotel perks" strip under the page header
   ============================================================ */

const HotelPerks = (() => {
  const STATE_KEY = 'hotelGameState';
  const SLOTS_BASE_MAX_BET = 6;
  const COMP = { cost: 1000, chips: 250 };   // hotel cash → chips, before the chip bonus
  const HIGH_ROLLER = { limitMult: 2, xpMult: 1.5 };

  /* Casino games unlocked through hotel progress (Casino Floor level +
     reputation). Dev mode (?dev=1) opens them all for testing. */
  const GAME_GATES = {
    roulette:    { label: 'Roulette Royale', casinoLevel: 2, rep: 5,  href: 'roulette/index.html' },
    mines:       { label: 'Mines',           casinoLevel: 2, rep: 6 },
    videoPoker:  { label: 'Video Poker',     casinoLevel: 3, rep: 10 },
    texasHoldem: { label: "Texas Hold'em",   casinoLevel: 5, rep: 20 },
  };

  function readState() {
    try { return JSON.parse(localStorage.getItem(STATE_KEY) || 'null'); }
    catch (_) { return null; }
  }

  function get() {
    const state = readState();
    const perks = state?.casinoBridge?.perks ?? {};
    return {
      hasHotel: !!state,
      casinoLevel: perks.casinoLevel ?? state?.departments?.casino?.level ?? 1,
      betMult: Number(perks.betMult) || 1,
      chipBonus: Number(perks.chipBonus) || 0,
      barDailyBonus: Number(perks.dailyBonus) || 0,
      hotelCash: Number(state?.currencies?.hotelCash) || 0,
      highRollerUntil: state?.guests?.highRollerPresent ? Number(state.guests.highRollerUntil) || 0 : 0,
    };
  }

  /* A high roller in the hotel opens a high-stakes table until they leave. */
  function highRoller() {
    const until = get().highRollerUntil;
    const active = until > Date.now();
    return { active, minutesLeft: active ? Math.ceil((until - Date.now()) / 60_000) : 0 };
  }

  const limitMult = () => get().betMult * (highRoller().active ? HIGH_ROLLER.limitMult : 1);
  const xpMult = () => (highRoller().active ? HIGH_ROLLER.xpMult : 1);

  function slotsMaxBet() {
    return Math.round(SLOTS_BASE_MAX_BET * limitMult() * 100) / 100;
  }

  function blackjackChips() {
    const mult = limitMult();
    return [1, 5, 10, 25, ...(mult >= 2 ? [50] : []), ...(mult >= 3 ? [100] : [])];
  }

  function dailyBonusExtra(base) {
    const p = get();
    return Math.round((Number(base) || 0) * p.chipBonus / 100) + p.barDailyBonus;
  }

  function gameGate(id) {
    const gate = GAME_GATES[id];
    if (!gate) return null;
    const state = readState();
    const casinoLevel = state?.departments?.casino?.level ?? 1;
    const rep = state?.currencies?.reputation ?? 1;
    const casinoMet = casinoLevel >= gate.casinoLevel;
    const repMet = rep >= gate.rep;
    const dev = !!window.CasinoWallet?.devMode?.();
    return { ...gate, casinoLevelNow: casinoLevel, repNow: rep, casinoMet, repMet, dev, unlocked: (casinoMet && repMet) || dev };
  }

  function compOffer() {
    const p = get();
    // Comps already taken but not yet debited by the hotel still count.
    const pending = Number(window.HotelEvents?.peek?.().compCost) || 0;
    const hotelCash = Math.max(0, p.hotelCash - pending);
    const chips = Math.round(COMP.chips * (1 + p.chipBonus / 100));
    const reason = !p.hasHotel ? 'Open the hotel to unlock comps.'
      : hotelCash < COMP.cost ? `Needs $${COMP.cost.toLocaleString()} hotel cash (you have $${Math.floor(hotelCash).toLocaleString()}).`
      : '';
    return { cost: COMP.cost, chips, available: !reason, hotelCash, reason };
  }

  function takeComp() {
    const offer = compOffer();
    if (!offer.available || !window.HotelEvents || !window.CasinoWallet) return false;
    HotelEvents.push('comp_chips', { cost: offer.cost });
    CasinoWallet.add(offer.chips);
    return offer;
  }

  function list() {
    const p = get();
    if (!p.hasHotel) return [];
    const perks = [];
    const hr = highRoller();
    if (hr.active) perks.push({ icon: 'fa-gem', label: `High roller in the house: limits ×2, +50% XP · ${hr.minutesLeft} min left`, highlight: true });
    if (limitMult() > 1) perks.push({ icon: 'fa-arrow-up-wide-short', label: `Higher limits · slots up to $${slotsMaxBet()}` });
    if (p.chipBonus > 0) perks.push({ icon: 'fa-coins', label: `+${p.chipBonus}% daily bonus & comps` });
    if (p.barDailyBonus > 0) perks.push({ icon: 'fa-martini-glass', label: `Bar: +$${p.barDailyBonus} daily bonus` });
    return perks;
  }

  /* A slim strip under the page header. With no perks yet it nudges the
     player toward the hotel (in the lobby only, to keep game pages quiet). */
  function renderStrip({ teaser = false, hotelHref = '../hotel/index.html' } = {}) {
    if (typeof document === 'undefined' || document.getElementById('hotel-perk-strip')) return;
    const header = document.querySelector('.shell-header, .casino-header');
    if (!header) return;
    const perks = list();
    if (!perks.length && !teaser) return;
    const strip = document.createElement('a');
    strip.id = 'hotel-perk-strip';
    strip.className = 'hotel-perk-strip';
    strip.href = hotelHref;
    strip.classList.toggle('high-roller', highRoller().active);
    strip.innerHTML = perks.length
      ? `<span class="perk-kicker"><i class="fa-solid fa-hotel" aria-hidden="true"></i> Hotel perks</span>${perks.map(perk =>
          `<span class="perk-item ${perk.highlight ? 'perk-highlight' : ''}"><i class="fa-solid ${perk.icon}" aria-hidden="true"></i> ${perk.label}</span>`).join('')}`
      : `<span class="perk-kicker"><i class="fa-solid fa-hotel" aria-hidden="true"></i> Hotel perks</span><span class="perk-item">Upgrade the Casino Floor and Bar in your hotel for higher limits and bigger bonuses →</span>`;
    header.insertAdjacentElement('afterend', strip);
  }

  return { get, highRoller, xpMult, limitMult, gameGate, GAME_GATES, slotsMaxBet, blackjackChips, dailyBonusExtra, compOffer, takeComp, list, renderStrip, COMP };
})();

if (typeof window !== 'undefined') window.HotelPerks = HotelPerks;
