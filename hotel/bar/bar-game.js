/* ============================================================
   HOTEL BAR SHIFT - MINI-GAME SHELL
   ------------------------------------------------------------
   A small department game that awards hotel cash and satisfaction.
   ============================================================ */

const BarGame = (() => {
  const DRINKS = [
    { id: 'beer', label: 'Beer', icon: '🍺', tip: 18, patience: 6500 },
    { id: 'martini', label: 'Martini', icon: '🍸', tip: 28, patience: 5600 },
    { id: 'wine', label: 'Wine', icon: '🍷', tip: 22, patience: 6100 },
    { id: 'oldFashioned', label: 'Old Fashioned', icon: '🥃', tip: 36, patience: 5000 },
  ];

  const GUESTS = ['Suit', 'Tourist', 'Regular', 'VIP', 'Performer'];

  let shift = null;
  let timer = null;

  function init() {
    syncHotelCash();
    setDrinkButtons(false);
    renderIdle();

    document.getElementById('start-shift-btn')?.addEventListener('click', startShift);
    document.getElementById('drink-station')?.addEventListener('click', e => {
      const btn = e.target.closest('.drink-btn');
      if (!btn || btn.disabled) return;
      serve(btn.dataset.drink);
    });
  }

  function startShift() {
    const state = HotelState.get();
    const barLevel = state.departments.bar?.level ?? 0;
    if (barLevel <= 0) {
      log('Build the Bar & Lounge before opening a shift.', 'bad', true);
      CasinoShell.toast('Build the Bar & Lounge first.');
      return;
    }

    shift = {
      active: true,
      served: 0,
      target: Math.min(8, 4 + barLevel),
      tips: 0,
      streak: 0,
      misses: 0,
      order: null,
      orderStarted: 0,
      guest: '',
      barLevel,
    };

    document.getElementById('served-target').textContent = shift.target;
    document.getElementById('start-shift-btn').disabled = true;
    hideResults();
    setOrderState('active');
    setDrinkButtons(true);
    clearLog();
    log('Shift opened.', 'gold');
    nextOrder();
    updateStats();
    startTimer();
  }

  function nextOrder() {
    if (!shift?.active) return;
    if (shift.served >= shift.target) {
      finishShift();
      return;
    }

    shift.order = DRINKS[Math.floor(Math.random() * DRINKS.length)];
    shift.orderStarted = Date.now();
    shift.guest = GUESTS[Math.floor(Math.random() * GUESTS.length)];

    document.getElementById('ticket-drink').textContent = `${shift.order.icon} ${shift.order.label}`;
    setOrderState('active');
    setCustomerMood('');
    updatePatience();
  }

  function serve(drinkId) {
    if (!shift?.active || !shift.order) return;

    const elapsed = Date.now() - shift.orderStarted;
    const patienceLeft = Math.max(0, 1 - elapsed / shift.order.patience);
    const correct = drinkId === shift.order.id && patienceLeft > 0;

    if (correct) {
      const speedBonus = Math.round(shift.order.tip * patienceLeft * 0.55);
      const streakBonus = Math.min(18, shift.streak * 4);
      const earned = shift.order.tip + speedBonus + streakBonus + (shift.barLevel * 3);
      shift.tips += earned;
      shift.streak++;
      shift.served++;
      setCustomerMood('happy');
      animateServe(shift.order.id, true);
      log(`${shift.guest} enjoyed the ${shift.order.label}. +$${earned}`, 'good');
      CasinoShell.sound.win();
    } else {
      shift.streak = 0;
      shift.misses++;
      shift.served++;
      setCustomerMood('annoyed');
      animateServe(drinkId, false);
      log(`${shift.guest} left unhappy.`, 'bad');
      CasinoShell.sound.lose();
    }

    updateStats();
    setTimeout(nextOrder, 520);
  }

  function startTimer() {
    clearInterval(timer);
    timer = setInterval(() => {
      if (!shift?.active) return;
      updatePatience();
      const elapsed = Date.now() - shift.orderStarted;
      if (shift.order && elapsed > shift.order.patience) {
        serve('__timeout__');
      }
    }, 80);
  }

  function updatePatience() {
    const fill = document.getElementById('patience-fill');
    if (!fill || !shift?.order) return;
    const elapsed = Date.now() - shift.orderStarted;
    const pct = Math.max(0, 100 - (elapsed / shift.order.patience) * 100);
    fill.style.width = `${pct}%`;
  }

  function finishShift() {
    clearInterval(timer);
    const tips = shift.tips;
    const satisfactionBonus = Math.max(0, Math.min(4, shift.streak + 2 - shift.misses));
    const served = shift.served;
    const misses = shift.misses;
    const currentSat = HotelState.getSatisfaction();

    HotelState.addHotelCash(tips);
    HotelState.setSatisfaction(currentSat + satisfactionBonus);
    HotelEngine.recalculateReputation(HotelState.get());
    HotelBridge.applyHotelToCasino(HotelState.get());
    CasinoShell.awardXp(Math.max(10, Math.round(tips / 4)));

    shift.active = false;
    setDrinkButtons(false);
    document.getElementById('start-shift-btn').disabled = false;
    document.getElementById('start-shift-btn').innerHTML = '<i class="fa-solid fa-rotate-right"></i> New Shift';
    document.getElementById('ticket-drink').textContent = 'Closed';
    document.getElementById('patience-fill').style.width = '0%';
    setOrderState('complete');
    resetServeDrink();
    syncHotelCash();
    updateStats();
    showResults({ tips, served, misses, satisfactionBonus });

    log(`Shift complete. Hotel earned $${tips}. Satisfaction +${satisfactionBonus}.`, 'gold');
    CasinoShell.celebrate(tips);
    CasinoShell.toast(`Bar shift complete: +$${tips} hotel cash`);
  }

  function setDrinkButtons(enabled) {
    document.querySelectorAll('.drink-btn').forEach(btn => { btn.disabled = !enabled; });
  }

  function updateStats() {
    const served = shift?.served ?? 0;
    const target = shift?.target ?? 5;
    const tips = shift?.tips ?? 0;
    const streak = shift?.streak ?? 0;
    const misses = shift?.misses ?? 0;

    document.getElementById('served-count').textContent = served;
    document.getElementById('served-target').textContent = target;
    document.getElementById('tips-total').textContent = fmt(tips);
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
    document.getElementById('ticket-drink').textContent = barLevel > 0 ? 'Ready' : 'Build Bar';
    setOrderState('idle');
    document.getElementById('served-target').textContent = Math.min(8, 4 + Math.max(1, barLevel));
    log(barLevel > 0 ? 'Bar is ready.' : 'Bar & Lounge is not built yet.', barLevel > 0 ? 'gold' : 'bad', true);
    resetServeDrink();
  }

  function setOrderState(state) {
    const ticket = document.querySelector('.order-ticket');
    if (!ticket) return;
    ticket.classList.remove('idle', 'active', 'complete');
    ticket.classList.add(state);
  }

  function animateServe(drinkId, correct) {
    const drink = document.getElementById('serve-drink');
    if (!drink) return;

    const className = drinkClass(drinkId);
    drink.className = `bar-drink serve-drink ${className}`;
    drink.classList.remove('pouring', 'served', 'miss');
    void drink.offsetWidth;
    drink.classList.add(correct ? 'served' : 'miss');
    if (correct) drink.classList.add('pouring');
  }

  function resetServeDrink() {
    const drink = document.getElementById('serve-drink');
    if (!drink) return;
    drink.className = 'bar-drink serve-drink beer';
  }

  function drinkClass(drinkId) {
    return {
      beer: 'beer',
      martini: 'martini',
      wine: 'wine',
      oldFashioned: 'old-fashioned',
    }[drinkId] ?? 'old-fashioned';
  }

  function setCustomerMood(mood) {
    const avatar = document.getElementById('customer-avatar');
    if (!avatar) return;
    avatar.classList.remove('happy', 'annoyed');
    if (mood) avatar.classList.add(mood);
  }

  function syncHotelCash() {
    const el = document.getElementById('bar-hotel-cash');
    if (el) el.textContent = fmt(HotelState.getCash());
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

  return { init };
})();

if (typeof window !== 'undefined') window.BarGame = BarGame;
