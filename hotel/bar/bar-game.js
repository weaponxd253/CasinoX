/* ============================================================
   HOTEL BAR SHIFT
   ------------------------------------------------------------
   Guests take seats at the counter, each with an order and their
   own patience. Pick a guest, build their drink from ingredients,
   and serve it before they walk out. Higher bar levels add seats
   and cocktails that share ingredients, so recipes matter.
   Awards hotel cash and satisfaction.
   ============================================================ */

const BarGame = (() => {
  const INGREDIENTS = [
    { id: 'lager',    label: 'Lager',    key: 'q', color: '#e8b84a' },
    { id: 'wine',     label: 'Red Wine', key: 'w', color: '#8d1c3a' },
    { id: 'gin',      label: 'Gin',      key: 'e', color: '#cfe8ef' },
    { id: 'whiskey',  label: 'Whiskey',  key: 'r', color: '#b5651d' },
    { id: 'vermouth', label: 'Vermouth', key: 'a', color: '#c9b27a' },
    { id: 'bitters',  label: 'Bitters',  key: 's', color: '#9b2a2a' },
    { id: 'soda',     label: 'Soda',     key: 'd', color: '#d9f0ff' },
    { id: 'citrus',   label: 'Citrus',   key: 'f', color: '#f2c94c' },
    { id: 'olive',    label: 'Olive',    key: 'z', color: '#7a8f3a' },
    { id: 'ice',      label: 'Ice',      key: 'x', color: '#bfe3ff' },
  ];

  // Order of ingredients doesn't matter. Several cocktails share two of
  // their three ingredients, so the third one is what you have to know.
  const DRINKS = [
    { id: 'beer',         label: 'Beer',          icon: '🍺', recipe: ['lager'],                         tip: 16, level: 1 },
    { id: 'wine',         label: 'Wine',          icon: '🍷', recipe: ['wine'],                          tip: 20, level: 1 },
    { id: 'martini',      label: 'Martini',       icon: '🍸', recipe: ['gin', 'vermouth', 'olive'],      tip: 34, level: 1 },
    { id: 'oldFashioned', label: 'Old Fashioned', icon: '🥃', recipe: ['whiskey', 'bitters', 'citrus'],  tip: 38, level: 1 },
    { id: 'ginTonic',     label: 'Gin & Tonic',   icon: '🍹', recipe: ['gin', 'soda', 'citrus'],         tip: 28, level: 2 },
    { id: 'highball',     label: 'Highball',      icon: '🥃', recipe: ['whiskey', 'soda', 'ice'],        tip: 26, level: 2 },
    { id: 'spritz',       label: 'Spritz',        icon: '🍹', recipe: ['wine', 'soda', 'citrus'],        tip: 30, level: 3 },
    { id: 'negroni',      label: 'Negroni',       icon: '🍸', recipe: ['gin', 'vermouth', 'bitters'],    tip: 40, level: 4 },
    { id: 'manhattan',    label: 'Manhattan',     icon: '🍸', recipe: ['whiskey', 'vermouth', 'bitters'], tip: 44, level: 5 },
  ];

  const GUESTS = ['Suit', 'Tourist', 'Regular', 'Performer', 'Gambler', 'Couple'];
  const VIP_CHANCE = 0.15;
  const MAX_GLASS = 4;

  let shift = null;
  let timer = null;

  document.addEventListener('shift-hints-changed', () => { if (shift?.active) renderAll(); });

  /* ── Setup ─────────────────────────────────────────────── */
  const ingredient = (id) => INGREDIENTS.find(i => i.id === id);
  const unlockedDrinks = (level) => DRINKS.filter(d => d.level <= Math.max(1, level));
  const unlockedIngredients = (level) => {
    const used = new Set(unlockedDrinks(level).flatMap(d => d.recipe));
    return INGREDIENTS.filter(i => used.has(i.id));
  };

  function init() {
    syncHotelCash();
    window.HotelShiftBriefing?.mount?.('bar');
    renderIdle();

    document.getElementById('start-shift-btn')?.addEventListener('click', startShift);
    document.getElementById('drink-station')?.addEventListener('click', e => {
      const btn = e.target.closest('.ingredient-btn');
      if (btn && !btn.disabled) addIngredient(btn.dataset.ingredient);
    });
    document.getElementById('bar-seats')?.addEventListener('click', e => {
      const seat = e.target.closest('.bar-seat');
      if (seat) selectSeat(Number(seat.dataset.seat));
    });
    document.getElementById('serve-btn')?.addEventListener('click', serve);
    document.getElementById('dump-btn')?.addEventListener('click', dumpGlass);
    document.getElementById('recipe-book-btn')?.addEventListener('click', showRecipeBook);

    CasinoShell.registerShortcuts?.([
      { keys: ['1', '2', '3'], label: 'Pick a seat', run: e => selectSeat(Number(e.key) - 1) },
      { keys: ['Enter'], label: 'Serve the drink', run: serve },
      { keys: ['Backspace', '0'], label: 'Empty the glass', run: dumpGlass },
      { keys: ['b'], label: 'Recipe book', run: showRecipeBook },
      ...INGREDIENTS.map(i => ({ keys: [i.key], label: `Add ${i.label}`, run: () => addIngredient(i.id) })),
    ]);
  }

  function startShift() {
    const state = HotelState.get();
    const barLevel = state.departments.bar?.level ?? 0;
    if (barLevel <= 0) {
      log('Build the Bar & Lounge before opening a shift.', 'bad', true);
      CasinoShell.toast('Build the Bar & Lounge first.');
      return;
    }

    window.HotelShiftBriefing?.start?.('bar', 'Bar Shift');
    shift = {
      active: true,
      barLevel,
      target: Math.min(8, 4 + barLevel),     // guests this shift
      spawned: 0,
      served: 0,        // guests finished (served or walked out)
      misses: 0,
      tips: 0,
      streak: 0,
      bestStreak: 0,
      speedTotal: 0,    // patience left on each correct serve (0–1), for the grade
      seats: Array.from({ length: barLevel >= 2 ? 3 : 2 }, () => null),
      selected: null,
      glass: [],
      nextArrival: Date.now(),
      guestId: 0,
    };

    document.getElementById('start-shift-btn').disabled = true;
    document.getElementById('start-shift-btn').innerHTML = '<i class="fa-solid fa-spinner"></i> On Shift';
    setReturnLink('Back to Hotel Lobby', 'fa-arrow-left');
    hideResults();
    clearLog();
    log(`Shift opened: ${shift.target} guests, ${shift.seats.length} seats.`, 'gold');
    renderIngredients();
    tick();
    renderAll();
    clearInterval(timer);
    timer = setInterval(tick, 100);
  }

  /* ── Guests ────────────────────────────────────────────── */
  function seatGuest(index) {
    const drinks = unlockedDrinks(shift.barLevel);
    const drink = drinks[Math.floor(Math.random() * drinks.length)];
    const vip = Math.random() < VIP_CHANCE && shift.spawned > 0;
    const levelPace = Math.max(0.75, 1 - (shift.barLevel - 1) * 0.04);
    const patience = Math.round((10_000 + drink.recipe.length * 3_000) * levelPace * (vip ? 0.75 : 1));
    const guest = {
      id: ++shift.guestId,
      name: vip ? 'VIP' : GUESTS[Math.floor(Math.random() * GUESTS.length)],
      vip,
      drink,
      patience,
      arrivedAt: Date.now(),
    };
    shift.seats[index] = guest;
    shift.spawned++;
    if (shift.selected === null) shift.selected = index;
    CasinoShell.announce?.(`Seat ${index + 1}: ${guest.name} orders a ${drink.label}.`);
  }

  function tick() {
    if (!shift?.active) return;
    const now = Date.now();

    // Walkouts
    shift.seats.forEach((guest, i) => {
      if (guest && now - guest.arrivedAt >= guest.patience) settle(i, false, 'walked out');
    });

    // Arrivals: fill an empty seat every couple of seconds until everyone's in
    const empty = shift.seats.findIndex(g => g === null);
    if (empty !== -1 && shift.spawned < shift.target && now >= shift.nextArrival) {
      seatGuest(empty);
      shift.nextArrival = now + 1600 + Math.random() * 1600;
      renderAll();
    }

    if (shift.served >= shift.target) { finishShift(); return; }
    updatePatienceBars();
  }

  function patienceLeft(guest, now = Date.now()) {
    return Math.max(0, 1 - (now - guest.arrivedAt) / guest.patience);
  }

  /* ── Player actions ────────────────────────────────────── */
  function selectSeat(index) {
    if (!shift?.active || !shift.seats[index]) return;
    shift.selected = index;
    renderAll();
  }

  function addIngredient(id) {
    if (!shift?.active || !ingredient(id)) return;
    if (!unlockedIngredients(shift.barLevel).some(i => i.id === id)) return;
    const at = shift.glass.indexOf(id);
    if (at !== -1) shift.glass.splice(at, 1);           // tap again to take it out
    else if (shift.glass.length < MAX_GLASS) shift.glass.push(id);
    CasinoShell.sound.tone(520 + shift.glass.length * 60, 'sine', 0.05, 0.12);
    renderGlass();
  }

  function dumpGlass() {
    if (!shift?.active || !shift.glass.length) return;
    shift.glass = [];
    renderGlass();
  }

  function serve() {
    if (!shift?.active || shift.selected === null) return;
    const guest = shift.seats[shift.selected];
    if (!guest || !shift.glass.length) return;
    const recipe = guest.drink.recipe;
    const correct = shift.glass.length === recipe.length && recipe.every(id => shift.glass.includes(id));
    settle(shift.selected, correct, correct ? 'served' : 'wrong drink');
  }

  /* A guest leaves: served correctly, given the wrong drink, or walked out. */
  function settle(index, correct, how) {
    const guest = shift.seats[index];
    if (!guest) return;
    shift.seats[index] = null;           // off the stool first: no double settles
    shift.served++;
    shift.glass = how === 'walked out' ? shift.glass : [];

    if (correct) {
      const left = patienceLeft(guest);
      const speedBonus = Math.round(guest.drink.tip * left * 0.55);
      const streakBonus = Math.min(18, shift.streak * 4);
      const earned = Math.round((guest.drink.tip + speedBonus + streakBonus + shift.barLevel * 3) * (guest.vip ? 1.8 : 1));
      shift.speedTotal += left;
      shift.tips += earned;
      shift.streak++;
      shift.bestStreak = Math.max(shift.bestStreak, shift.streak);
      log(`${guest.name} loved the ${guest.drink.label}. +$${earned}`, 'good');
      CasinoShell.sound.win();
      flashSeat(index, 'happy');
      CasinoShell.announce?.(`${guest.drink.label} served. Plus ${earned} dollars.`);
    } else {
      shift.streak = 0;
      shift.misses++;
      const why = how === 'wrong drink'
        ? `${guest.name} wanted a ${guest.drink.label} (${recipeText(guest.drink)}) and left unhappy.`
        : `${guest.name} gave up waiting for a ${guest.drink.label}.`;
      log(why, 'bad');
      CasinoShell.sound.lose();
      flashSeat(index, 'annoyed');
      CasinoShell.announce?.(why);
    }

    if (shift.selected === index) {
      const next = shift.seats.findIndex(g => g !== null);
      shift.selected = next === -1 ? null : next;
    }
    shift.nextArrival = Math.max(shift.nextArrival, Date.now() + 900);
    renderAll();
  }

  /* ── Finish ────────────────────────────────────────────── */
  function finishShift() {
    clearInterval(timer);
    shift.active = false;
    const rewardMult = HotelState.shiftRewardMultiplier?.('bar') ?? 1;
    const tips = Math.round(shift.tips * rewardMult);
    shift.tips = tips;
    const satisfactionBonus = Math.round(Math.max(0, Math.min(4, Math.floor(shift.bestStreak / 2) + 2 - shift.misses)) * rewardMult);
    const served = shift.served;
    const misses = shift.misses;
    // Grade: correct drinks, weighted by how quickly they were served
    const correct = served - misses;
    const avgSpeed = correct ? shift.speedTotal / correct : 0;
    const gradeScore = 100 * (correct / Math.max(1, shift.target)) * (0.55 + 0.45 * avgSpeed);
    const grade = window.HotelShiftBriefing?.finishRun?.('bar', gradeScore, document.getElementById('shift-results'));
    HotelState.addHotelCash(tips);
    HotelState.addSatisfactionBonus(satisfactionBonus);
    HotelEngine.recalculateReputation(HotelState.get());
    HotelBridge.applyHotelToCasino(HotelState.get());
    HotelState.recordShiftResult?.('bar', {
      title: 'Bar Shift complete',
      cash: tips,
      satisfaction: satisfactionBonus,
      rewardMult,
      grade: grade?.letter,
      score: grade?.score,
      primaryLabel: 'Served',
      primaryValue: correct,
      summary: `${correct} of ${served} guests served right, ${misses} misses, $${tips} in tips.`,
      impact: 'Added nightlife value and guest mood.',
      metrics: [
        { label: 'Misses', value: misses },
        { label: 'Best streak', value: shift.bestStreak },
      ],
    });
    CasinoShell.awardXp(Math.max(10, Math.round(tips / 4)));

    document.getElementById('start-shift-btn').disabled = false;
    document.getElementById('start-shift-btn').innerHTML = '<i class="fa-solid fa-rotate-right"></i> Start Bar Shift Again';
    setReturnLink('Back to Hotel Lobby', 'fa-building');
    syncHotelCash();
    renderAll();
    setNextStep('Head back to the Hotel Lobby with the tips, or start Bar Shift again.');
    showResults({ tips, served: correct, misses, satisfactionBonus });

    log(`Shift complete. Hotel earned $${tips}. Satisfaction +${satisfactionBonus}.`, 'gold');
    if (rewardMult < 1) log(`Repeat run this phase: ${Math.round(rewardMult * 100)}% rewards. Full rewards return next phase.`, 'bad');
    CasinoShell.celebrate(tips, { currency: 'hotel' });
    CasinoShell.toast(`Bar shift complete: +$${tips} hotel cash`);
  }

  /* ── Rendering ─────────────────────────────────────────── */
  function hintsOn() { return window.HotelShiftBriefing?.hintsOn?.('bar') ?? true; }
  const recipeText = (drink) => drink.recipe.map(id => ingredient(id).label).join(' + ');
  const selectedGuest = () => (shift?.selected !== null && shift?.selected !== undefined ? shift.seats[shift.selected] : null);

  function renderAll() {
    renderSeats();
    renderTicket();
    renderGlass();
    renderIngredientHighlights();
    updateStats();
  }

  function renderSeats() {
    const wrap = document.getElementById('bar-seats');
    if (!wrap) return;
    const seats = shift?.seats ?? [null, null];
    wrap.innerHTML = seats.map((guest, i) => {
      const selected = shift?.active && shift.selected === i && guest;
      if (!guest) {
        return `<div class="bar-seat empty" data-seat="${i}"><span class="seat-num">${i + 1}</span><span class="seat-empty">${shift?.active && shift.spawned < shift.target ? 'Guest arriving…' : 'Empty'}</span></div>`;
      }
      return `
        <button type="button" class="bar-seat ${selected ? 'selected' : ''} ${guest.vip ? 'vip' : ''}" data-seat="${i}" aria-pressed="${selected ? 'true' : 'false'}"
                aria-label="Seat ${i + 1}: ${guest.name} wants a ${guest.drink.label}">
          <span class="seat-num">${i + 1}</span>
          <span class="seat-avatar" aria-hidden="true"></span>
          <span class="seat-name">${guest.name}${guest.vip ? ' ★' : ''}</span>
          <strong class="seat-order">${guest.drink.icon} ${guest.drink.label}</strong>
          <span class="seat-patience"><span class="seat-patience-fill" style="width:${Math.round(patienceLeft(guest) * 100)}%"></span></span>
        </button>`;
    }).join('');
  }

  function renderTicket() {
    const guest = selectedGuest();
    const label = document.getElementById('ticket-label');
    const drinkEl = document.getElementById('ticket-drink');
    const recipeEl = document.getElementById('ticket-recipe');
    const ticket = document.querySelector('.order-ticket');
    ticket?.classList.toggle('active', !!guest);
    if (!shift?.active) {
      ticket?.classList.toggle('complete', !!shift);
      label.textContent = 'Order';
      drinkEl.textContent = shift ? 'Closed' : (HotelState.get().departments.bar?.level ?? 0) > 0 ? 'Ready' : 'Build Bar';
      recipeEl.innerHTML = '';
      setNextStep(shift ? '' : (HotelState.get().departments.bar?.level ?? 0) > 0 ? 'Start Bar Shift to seat the first guests.' : 'Build Bar & Lounge to unlock this shift.');
      return;
    }
    ticket?.classList.remove('complete');
    if (!guest) {
      label.textContent = 'Order';
      drinkEl.textContent = 'Waiting for guests';
      recipeEl.innerHTML = '';
      setNextStep('Guests are on their way.');
      return;
    }
    label.textContent = `Seat ${shift.selected + 1} · ${guest.name}`;
    drinkEl.textContent = `${guest.drink.icon} ${guest.drink.label}`;
    recipeEl.innerHTML = hintsOn()
      ? `<span class="recipe-hint">${guest.drink.recipe.map(id => `<span class="recipe-chip" style="--ing:${ingredient(id).color}">${ingredient(id).label}</span>`).join('<span class="recipe-plus">+</span>')}</span>`
      : '<span class="recipe-hint muted">Make it from memory, or open the recipe book (B).</span>';
    setNextStep(hintsOn()
      ? `Build a ${guest.drink.label}: ${recipeText(guest.drink)}, then Serve.`
      : `Build a ${guest.drink.label} for seat ${shift.selected + 1}, then Serve.`);
  }

  function renderGlass() {
    const el = document.getElementById('glass-contents');
    if (!el) return;
    const glass = shift?.glass ?? [];
    el.innerHTML = glass.length
      ? glass.map(id => `<span class="glass-chip" style="--ing:${ingredient(id).color}">${ingredient(id).label}</span>`).join('')
      : '<span class="glass-empty">Empty glass</span>';
    const canServe = !!shift?.active && glass.length > 0 && !!selectedGuest();
    document.getElementById('serve-btn').disabled = !canServe;
    document.getElementById('dump-btn').disabled = !shift?.active || !glass.length;
    document.querySelectorAll('.ingredient-btn').forEach(btn => {
      btn.classList.toggle('in-glass', glass.includes(btn.dataset.ingredient));
      btn.setAttribute('aria-pressed', glass.includes(btn.dataset.ingredient) ? 'true' : 'false');
    });
  }

  function renderIngredients() {
    const rail = document.getElementById('drink-station');
    if (!rail) return;
    const level = shift?.barLevel ?? Math.max(1, HotelState.get().departments.bar?.level ?? 1);
    rail.innerHTML = unlockedIngredients(level).map(i => `
      <button class="ingredient-btn" type="button" data-ingredient="${i.id}" style="--ing:${i.color}" ${shift?.active ? '' : 'disabled'}>
        <span class="ingredient-swatch" aria-hidden="true"></span>
        <span class="ingredient-name">${i.label}</span>
        <kbd>${i.key.toUpperCase()}</kbd>
      </button>`).join('');
  }

  // Training hint: light up the selected order's ingredients
  function renderIngredientHighlights() {
    const guest = selectedGuest();
    const recipe = guest && hintsOn() ? guest.drink.recipe : [];
    document.querySelectorAll('.ingredient-btn').forEach(btn => {
      btn.classList.toggle('is-order', recipe.includes(btn.dataset.ingredient));
      btn.disabled = !shift?.active;
    });
  }

  function updatePatienceBars() {
    const now = Date.now();
    shift.seats.forEach((guest, i) => {
      if (!guest) return;
      const fill = document.querySelector(`.bar-seat[data-seat="${i}"] .seat-patience-fill`);
      const left = patienceLeft(guest, now);
      if (fill) {
        fill.style.width = `${Math.round(left * 100)}%`;
        fill.classList.toggle('danger', left < 0.25);
      }
    });
    const guest = selectedGuest();
    const main = document.getElementById('patience-fill');
    if (main) main.style.width = guest ? `${Math.round(patienceLeft(guest, now) * 100)}%` : '0%';
  }

  function flashSeat(index, mood) {
    const el = document.querySelector(`.bar-seat[data-seat="${index}"]`);
    el?.classList.add(`leaving-${mood}`);
  }

  function showRecipeBook() {
    const level = shift?.barLevel ?? Math.max(1, HotelState.get().departments.bar?.level ?? 1);
    const rows = DRINKS.map(d => {
      const open = d.level <= level;
      return `<li class="${open ? '' : 'locked'}"><span>${d.icon} <strong>${d.label}</strong></span><span>${open ? recipeText(d) : `Bar level ${d.level}`}</span></li>`;
    }).join('');
    CasinoShell.info('📖 Recipe book', `
      <p class="recipe-book-note">Guests keep waiting while this is open. Ingredient order doesn't matter.</p>
      <ul class="recipe-book">${rows}</ul>`);
  }

  function updateStats() {
    const served = shift?.served ?? 0;
    const target = shift?.target ?? Math.min(8, 4 + Math.max(1, HotelState.get().departments.bar?.level ?? 1));
    const misses = shift?.misses ?? 0;
    const streak = shift?.streak ?? 0;
    document.getElementById('served-count').textContent = served - misses;
    document.getElementById('served-target').textContent = target;
    document.getElementById('tips-total').textContent = fmt(shift?.tips ?? 0);
    document.getElementById('streak-count').textContent = streak;
    document.getElementById('mood-label').textContent = misses > 1 ? 'Tense' : streak >= 3 ? 'Buzzing' : 'Calm';
  }

  function showResults({ tips, served, misses, satisfactionBonus }) {
    const panel = document.getElementById('shift-results');
    if (!panel) return;
    document.getElementById('result-tips').textContent = fmt(tips);
    document.getElementById('result-orders').textContent = served;
    document.getElementById('result-misses').textContent = misses;
    document.getElementById('result-satisfaction').textContent = satisfactionBonus;
    panel.hidden = false;
    document.querySelector('.shift-panel')?.classList.add('has-results');
    panel.classList.remove('pop');
    void panel.offsetWidth;
    panel.classList.add('pop');
  }

  function hideResults() {
    const panel = document.getElementById('shift-results');
    if (panel) panel.hidden = true;
    document.querySelector('.shift-panel')?.classList.remove('has-results');
  }

  function renderIdle() {
    const barLevel = HotelState.get().departments.bar?.level ?? 0;
    log(barLevel > 0 ? 'Bar is ready.' : 'Bar & Lounge is not built yet.', barLevel > 0 ? 'gold' : 'bad', true);
    setReturnLink('Back to Hotel Lobby', 'fa-arrow-left');
    renderIngredients();
    renderAll();
  }

  function syncHotelCash() {
    const el = document.getElementById('bar-hotel-cash');
    if (el) el.textContent = fmt(HotelState.getCash());
  }

  function setReturnLink(label, icon) {
    const link = document.getElementById('bar-return-link');
    if (!link) return;
    link.innerHTML = `<i class="fa-solid ${icon}"></i> ${label}`;
  }

  function setNextStep(message) {
    const el = document.getElementById('bar-next-step');
    if (!el || !message) return;
    el.querySelector('strong').textContent = message;
  }

  function clearLog() {
    const el = document.getElementById('shift-log');
    if (el) el.innerHTML = '';
  }

  function log(message, tone = '', replace = false) {
    const el = document.getElementById('shift-log');
    if (!el) return;
    if (replace) el.innerHTML = '';
    const p = document.createElement('p');
    p.className = tone;
    p.textContent = message;
    el.prepend(p);
  }

  function fmt(n) {
    return Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
  }

  return { init, DRINKS, INGREDIENTS };
})();

if (typeof window !== 'undefined') window.BarGame = BarGame;
