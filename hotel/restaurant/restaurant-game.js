/* ============================================================
   HOTEL RESTAURANT - TASTING ROOM
   ------------------------------------------------------------
   A menu-composition game: read the table, build a three-course
   flight, and score the balance instead of matching exact orders.
   ============================================================ */

const RestaurantGame = (() => {
  const DISHES = [
    { id:'emberTart',     name:'Ember Tart',     icon:'fa-fire-burner', tags:['warm','bold'],      flavor:{ comfort:2, bright:0, luxury:1, surprise:1 }, value:34 },
    { id:'citrusCrudo',   name:'Citrus Crudo',   icon:'fa-lemon',       tags:['bright','clean'],   flavor:{ comfort:0, bright:3, luxury:1, surprise:1 }, value:38 },
    { id:'velvetRisotto', name:'Velvet Risotto', icon:'fa-bowl-rice',   tags:['silky','rich'],     flavor:{ comfort:3, bright:0, luxury:2, surprise:0 }, value:42 },
    { id:'gardenStatic',  name:'Garden Static',  icon:'fa-seedling',    tags:['fresh','strange'],  flavor:{ comfort:0, bright:2, luxury:0, surprise:3 }, value:36 },
    { id:'goldLeafSole',  name:'Gold Leaf Sole', icon:'fa-fish',        tags:['delicate','luxury'],flavor:{ comfort:1, bright:1, luxury:3, surprise:0 }, value:58 },
    { id:'midnightBroth', name:'Midnight Broth', icon:'fa-moon',        tags:['deep','calm'],      flavor:{ comfort:2, bright:0, luxury:0, surprise:2 }, value:30 },
    { id:'pepperBloom',   name:'Pepper Bloom',   icon:'fa-pepper-hot',  tags:['spiced','floral'],  flavor:{ comfort:1, bright:2, luxury:0, surprise:2 }, value:32 },
    { id:'pearlCustard',  name:'Pearl Custard',  icon:'fa-egg',         tags:['soft','classic'],   flavor:{ comfort:2, bright:1, luxury:2, surprise:0 }, value:44 },
  ];

  const TABLES = [
    { id:'critics',    name:'Quiet Critics',      guests:3, brief:'They notice restraint, contrast, and one brave idea.', wants:{ comfort:2, bright:2, luxury:2, surprise:2 }, keywords:['balanced','precise','one risk'],  bonus:'surprise' },
    { id:'highrollers',name:'High Rollers',        guests:4, brief:'They want spectacle, polish, and food that feels expensive.', wants:{ comfort:1, bright:1, luxury:4, surprise:2 }, keywords:['luxury','bold','showpiece'], bonus:'luxury' },
    { id:'jetlag',     name:'Jet-Lagged Suite',   guests:2, brief:'They need warmth without heaviness, and a clean finish.', wants:{ comfort:4, bright:2, luxury:1, surprise:0 }, keywords:['comfort','clean','gentle'],    bonus:'comfort' },
    { id:'artists',    name:'Late Artists',        guests:5, brief:'They came for a dish they can argue about tomorrow.', wants:{ comfort:1, bright:3, luxury:0, surprise:4 }, keywords:['strange','fresh','memorable'],  bonus:'bright' },
    { id:'family',     name:'Celebration Table',  guests:6, brief:'A lively group wants comfort, sparkle, and nothing too severe.', wants:{ comfort:3, bright:2, luxury:2, surprise:1 }, keywords:['warm','festive','safe'],  bonus:'comfort' },
  ];

  const FLAVORS = ['comfort', 'bright', 'luxury', 'surprise'];
  const MAX_COURSES = 3;

  // Radar chart state — persists across renders so we can animate smoothly
  let radarAnimFrame = null;
  let radarCurrent = { comfort:0, bright:0, luxury:0, surprise:0 };
  let radarTarget  = { comfort:0, bright:0, luxury:0, surprise:0 };
  let radarWants   = null;

  let service = null;

  function init() {
    syncHotelCash();
    window.HotelShiftBriefing?.mount?.('restaurant');
    renderDishes();
    renderIdle();
    $('start-tasting-btn')?.addEventListener('click', startService);
    $('fire-course-btn')?.addEventListener('click', fireFlight);
    $('clear-flight-btn')?.addEventListener('click', clearFlight);
    $('dish-grid')?.addEventListener('click', e => {
      const btn = e.target.closest('.dish-card');
      if (!btn || btn.disabled) return;
      addDish(btn.dataset.dish);
    });
    // Start idle radar draw
    drawRadar({ comfort:0, bright:0, luxury:0, surprise:0 }, null);
  }

  function startService() {
    const restaurantLevel = HotelState.get().departments.restaurant?.level ?? 0;
    if (restaurantLevel <= 0) {
      log('Build the Restaurant before opening service.', 'bad', true);
      CasinoShell.toast('Build the Restaurant first.');
      return;
    }

    window.HotelShiftBriefing?.start?.('restaurant', 'Tasting Room');
    service = {
      active: true,
      restaurantLevel,
      staffEffect: HotelState.getStaffEffect?.('restaurant') ?? null,
      target: Math.min(7, 3 + restaurantLevel),
      served: 0,
      earned: 0,
      signatures: 0,
      selected: [],
      table: null,
      lastHarmony: 0,
    };

    $('start-tasting-btn').disabled = true;
    $('start-tasting-btn').innerHTML = '<i class="fa-solid fa-spinner"></i> In Service';
    setReturnLink('Back to Hotel', 'fa-arrow-left');
    hideResults();
    clearLog();
    nextTable();
    updateStats();
    log(`Service opened. Restaurant staff coverage: ${service.staffEffect?.score ?? 0}% ${service.staffEffect?.label ?? 'Short'}.`, 'gold');
  }

  function nextTable() {
    if (!service?.active) return;
    if (service.served >= service.target) {
      finishService();
      return;
    }
    service.table = TABLES[Math.floor(Math.random() * TABLES.length)];
    service.selected = [];
    service.lastHarmony = 0;
    renderTable();
    renderFlight();
    renderDishes();
    updateHarmony();
  }

  function addDish(dishId) {
    if (!service?.active || service.selected.length >= MAX_COURSES) return;
    const dish = DISHES.find(d => d.id === dishId);
    if (!dish || service.selected.some(d => d.id === dishId)) return;
    service.selected.push(dish);
    renderFlight();
    renderDishes();
    updateHarmony();
  }

  function clearFlight() {
    if (!service?.active) return;
    service.selected = [];
    renderFlight();
    renderDishes();
    updateHarmony();
  }

  function fireFlight() {
    if (!service?.active || service.selected.length !== MAX_COURSES) return;
    const score = scoreFlight(service.selected, service.table);
    score.harmony = Math.min(100, score.harmony + Math.round((service.staffEffect?.qualityBonus ?? 0) * 4));
    const base = service.selected.reduce((sum, dish) => sum + dish.value, 0);
    const tableBonus = service.table.guests * 8;
    const levelBonus = service.restaurantLevel * 14;
    const earned = Math.round((base + tableBonus + levelBonus) * (0.55 + score.harmony / 180) * (service.staffEffect?.incomeMult ?? 1));

    service.served++;
    service.earned += earned;
    service.lastHarmony = score.harmony;
    if (score.signature) service.signatures++;

    const tone = score.harmony >= 82 ? 'good' : score.harmony >= 58 ? 'gold' : 'bad';
    const note = score.signature ? ' Signature menu.' : score.harmony >= 58 ? ' Solid table.' : ' The room cooled.';
    log(`${service.table.name}: ${score.harmony}% harmony. +$${earned}.${note}`, tone);
    animateTable(score.harmony);
    CasinoShell.sound[score.harmony >= 58 ? 'win' : 'lose']();

    updateStats();
    setTimeout(nextTable, 720);
  }

  function finishService() {
    const cash = service.earned;
    const signatures = service.signatures;
    const served = service.served;
    const satBonus = Math.max(0, Math.min(8, signatures * 2 + Math.round(service.lastHarmony / 35) - 1 + (service.staffEffect?.satisfactionBonus ?? 0)));
    const currentSat = HotelState.getSatisfaction();

    HotelState.addHotelCash(cash);
    HotelState.setSatisfaction(currentSat + satBonus);
    HotelState.applyStaffFatigue?.('restaurant', served ? 4 : 1);
    HotelEngine.recalculateReputation(HotelState.get());
    HotelBridge.applyHotelToCasino(HotelState.get());
    HotelState.recordShiftResult?.('restaurant', {
      title: 'Tasting Room complete',
      cash,
      satisfaction: satBonus,
      primaryLabel: 'Tables',
      primaryValue: served,
      summary: `${served} tables served with ${signatures} signature flights.`,
      impact: 'Raised dining satisfaction and restaurant momentum.',
      metrics: [
        { label:'Signatures', value:signatures },
        { label:'Harmony', value:`${service.lastHarmony}%` },
      ],
    });
    CasinoShell.awardXp(Math.max(14, Math.round(cash / 5)));

    service.active = false;
    $('start-tasting-btn').disabled = false;
    $('start-tasting-btn').innerHTML = '<i class="fa-solid fa-rotate-right"></i> Open Service Again';
    setReturnLink('Return to Hotel', 'fa-building');
    $('fire-course-btn').disabled = true;
    $('clear-flight-btn').disabled = true;
    syncHotelCash();
    updateStats();
    showResults({ cash, served, signatures, satBonus });
    log(`Service complete. Hotel earned $${fmt(cash)}. Satisfaction +${satBonus}.`, 'gold');
    CasinoShell.celebrate(cash);
    CasinoShell.toast(`Tasting room complete: +$${fmt(cash)} hotel cash`);
  }

  function scoreFlight(dishes, table) {
    const totals = sumFlavors(dishes);
    const deltas = FLAVORS.map(key => Math.abs((table.wants[key] ?? 0) - totals[key]));
    const fit = Math.max(0, 100 - deltas.reduce((sum, n) => sum + n, 0) * 9);
    const duplicatePenalty = dishes.length - new Set(dishes.flatMap(d => d.tags)).size / 2;
    const arc = dishes[0].flavor.comfort + dishes[1].flavor.bright + dishes[2].flavor[table.bonus];
    const arcBonus = Math.min(12, arc * 3);
    const harmony = Math.max(0, Math.min(100, Math.round(fit + arcBonus - duplicatePenalty * 3)));
    return { harmony, totals, signature: harmony >= 84 && totals[table.bonus] >= table.wants[table.bonus] };
  }

  function sumFlavors(dishes) {
    return dishes.reduce((sum, dish) => {
      FLAVORS.forEach(key => { sum[key] += dish.flavor[key] ?? 0; });
      return sum;
    }, { comfort:0, bright:0, luxury:0, surprise:0 });
  }

  function updateHarmony() {
    const selected = service?.selected ?? [];
    const table = service?.table;
    const ready = selected.length === MAX_COURSES && !!table;
    const score = ready ? scoreFlight(selected, table) : { harmony: 0, totals: sumFlavors(selected), signature: false };

    $('harmony-score').textContent = score.harmony;
    $('harmony-fill').style.width = `${score.harmony}%`;
    $('harmony-fill').className = score.harmony >= 82 ? 'high' : score.harmony >= 58 ? 'mid' : 'low';
    $('fire-course-btn').disabled = !ready;
    $('clear-flight-btn').disabled = !service?.active || selected.length === 0;

    // Update radar — animate from current to new totals
    radarTarget = { ...score.totals };
    radarWants  = table?.wants ?? null;
    animateRadar();
  }

  /* ─── Radar chart ─────────────────────────────────────── */

  // Flavor axis config: label, angle (deg from top, clockwise), color
  const RADAR_AXES = [
    { key: 'comfort',  label: 'COMFORT',  angle:  270, color: 'rgba(232,145,106,0.9)' },
    { key: 'bright',   label: 'BRIGHT',   angle:    0, color: 'rgba(108,185,163,0.9)' },
    { key: 'luxury',   label: 'LUXURY',   angle:   90, color: 'rgba(201,168,76,0.9)'  },
    { key: 'surprise', label: 'SURPRISE', angle:  180, color: 'rgba(176,132,204,0.9)' },
  ];

  function radarPoint(cx, cy, angle, radius) {
    const rad = (angle - 90) * (Math.PI / 180);
    return { x: cx + Math.cos(rad) * radius, y: cy + Math.sin(rad) * radius };
  }

  function animateRadar() {
    if (radarAnimFrame) cancelAnimationFrame(radarAnimFrame);
    const SPEED = 0.18;
    function step() {
      let done = true;
      FLAVORS.forEach(k => {
        const diff = radarTarget[k] - radarCurrent[k];
        if (Math.abs(diff) > 0.01) {
          radarCurrent[k] += diff * SPEED;
          done = false;
        } else {
          radarCurrent[k] = radarTarget[k];
        }
      });
      drawRadar(radarCurrent, radarWants);
      if (!done) radarAnimFrame = requestAnimationFrame(step);
    }
    radarAnimFrame = requestAnimationFrame(step);
  }

  function drawRadar(totals, wants) {
    const canvas = $('flavor-radar');
    if (!canvas) return;

    // Respect device pixel ratio for crisp rendering
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const CW = rect.width  || canvas.offsetWidth  || 280;
    const CH = rect.height || canvas.offsetHeight || 180;

    if (canvas.width !== Math.round(CW * dpr) || canvas.height !== Math.round(CH * dpr)) {
      canvas.width  = Math.round(CW * dpr);
      canvas.height = Math.round(CH * dpr);
    }

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, CW, CH);

    // Leave room for axis labels on all sides
    const PAD = 34;
    const cx  = CW / 2;
    const cy  = CH / 2 + 2;
    const MAX_R = Math.min(CW - PAD * 2, CH - PAD * 2) / 2;
    const MAX_VAL = 4; // max meaningful flavor value

    // ── Grid rings
    const RINGS = 3;
    for (let r = 1; r <= RINGS; r++) {
      const radius = (r / RINGS) * MAX_R;
      ctx.beginPath();
      RADAR_AXES.forEach(({ angle }, i) => {
        const pt = radarPoint(cx, cy, angle, radius);
        i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y);
      });
      ctx.closePath();
      ctx.strokeStyle = r === RINGS ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.08)';
      ctx.lineWidth = r === RINGS ? 0.75 : 0.5;
      ctx.stroke();
    }

    // Tick label on outermost ring (value = MAX_VAL)
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.font = '8px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(MAX_VAL), cx + MAX_R + 3, cy);

    // ── Axis spokes
    RADAR_AXES.forEach(({ angle, color }) => {
      const outer = radarPoint(cx, cy, angle, MAX_R);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(outer.x, outer.y);
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    });

    // ── Axis labels
    RADAR_AXES.forEach(({ angle, label, color }) => {
      const labelR = MAX_R + 16;
      const pt = radarPoint(cx, cy, angle, labelR);
      ctx.fillStyle = color;
      ctx.font = `600 9px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.letterSpacing = '0.08em';
      ctx.fillText(label, pt.x, pt.y);
      ctx.letterSpacing = '0';
    });

    // Helper: build polygon path from a value object
    function buildPoly(vals) {
      ctx.beginPath();
      RADAR_AXES.forEach(({ key, angle }, i) => {
        const v = Math.min(vals[key] ?? 0, MAX_VAL);
        const r = (v / MAX_VAL) * MAX_R;
        const pt = radarPoint(cx, cy, angle, Math.max(r, 2));
        i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y);
      });
      ctx.closePath();
    }

    // ── Target polygon (dashed gold)
    if (wants) {
      buildPoly(wants);
      ctx.fillStyle = 'rgba(201,168,76,0.08)';
      ctx.fill();
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = 'rgba(201,168,76,0.65)';
      ctx.lineWidth = 1.25;
      ctx.stroke();
      ctx.setLineDash([]);

      // Vertex dots on target
      RADAR_AXES.forEach(({ key, angle }) => {
        const v = Math.min(wants[key] ?? 0, MAX_VAL);
        const r = (v / MAX_VAL) * MAX_R;
        const pt = radarPoint(cx, cy, angle, Math.max(r, 2));
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(201,168,76,0.8)';
        ctx.fill();
      });
    }

    // ── Current selection polygon (solid teal/green)
    const hasSelection = FLAVORS.some(k => (totals[k] ?? 0) > 0);
    if (hasSelection) {
      buildPoly(totals);
      ctx.fillStyle = 'rgba(108,185,163,0.18)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(108,185,163,0.9)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Vertex dots on current
      RADAR_AXES.forEach(({ key, angle }) => {
        const v = Math.min(totals[key] ?? 0, MAX_VAL);
        const r = (v / MAX_VAL) * MAX_R;
        if (r < 2) return;
        const pt = radarPoint(cx, cy, angle, r);
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#6cb9a3';
        ctx.fill();
      });
    }

    // ── Center dot
    ctx.beginPath();
    ctx.arc(cx, cy, 2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fill();
  }

  /* ─────────────────────────────────────────────────────── */

  function renderTable() {
    const table = service?.table;
    if (!table) return;
    $('table-number').textContent = `Table ${service.served + 1}`;
    $('table-persona').textContent = table.name;
    $('brief-title').textContent = table.name;
    $('brief-copy').textContent = table.brief;
    $('craving-tags').innerHTML = table.keywords.map(tag => `<span>${tag}</span>`).join('');
    $('table-guests').innerHTML = Array.from({ length: table.guests }, (_, i) =>
      `<span style="--i:${i}"><i class="fa-solid fa-user"></i></span>`
    ).join('');
  }

  function renderFlight() {
    const selected = service?.selected ?? [];
    $('course-rail').innerHTML = [0, 1, 2].map(i => {
      const dish = selected[i];
      return `
        <div class="course-slot ${dish ? 'filled' : ''}">
          <span>${i === 0 ? 'Open' : i === 1 ? 'Turn' : 'Finish'}</span>
          <strong>${dish ? dish.name : 'Choose dish'}</strong>
          ${dish ? `<i class="fa-solid ${dish.icon}"></i>` : '<i class="fa-solid fa-plus"></i>'}
        </div>
      `;
    }).join('');
  }

  function renderDishes() {
    const level = service?.restaurantLevel ?? HotelState.get().departments.restaurant?.level ?? 0;
    const selectedIds = new Set(service?.selected?.map(d => d.id) ?? []);
    $('dish-grid').innerHTML = DISHES.map((dish, index) => {
      const unlocked = level >= Math.max(1, Math.ceil((index + 1) / 2));
      const disabled = !service?.active || selectedIds.has(dish.id) || service.selected.length >= MAX_COURSES || !unlocked;

      // Build mini flavor bars (4 axes, each 0–3)
      const flavorBars = unlocked ? `
        <div class="dish-flavor-bars">
          ${RADAR_AXES.map(({ key, color }) => {
            const pct = Math.round((dish.flavor[key] / 3) * 100);
            return `<div class="flavor-pip-row" title="${key}: ${dish.flavor[key]}">
              <span class="flavor-pip-fill" style="width:${pct}%;background:${color}"></span>
            </div>`;
          }).join('')}
        </div>` : '';

      return `
        <button class="dish-card ${selectedIds.has(dish.id) ? 'selected' : ''}" type="button" data-dish="${dish.id}" ${disabled ? 'disabled' : ''}>
          <i class="fa-solid ${dish.icon}"></i>
          <span class="dish-name">${dish.name}</span>
          <span class="dish-tags">${unlocked ? dish.tags.join(' / ') : 'Lv ' + Math.max(1, Math.ceil((index + 1) / 2))}</span>
          ${flavorBars}
        </button>
      `;
    }).join('');
  }

  function renderIdle() {
    const level = HotelState.get().departments.restaurant?.level ?? 0;
    const tier = level > 0 ? HotelConfig.UPGRADE_CATALOG.restaurant?.[level - 1] : null;
    $('brief-title').textContent = tier?.label ?? 'Restaurant not built';
    $('brief-copy').textContent = level > 0
      ? 'Open service to compose tasting flights for guests with shifting moods.'
      : 'Build the Restaurant department to open a tasting room shift.';
    $('table-persona').textContent = level > 0 ? 'Ready' : 'Closed';
    $('tables-target').textContent = Math.min(7, 3 + Math.max(1, level));
    renderFlight();
    // Draw empty radar with no wants
    radarCurrent = { comfort:0, bright:0, luxury:0, surprise:0 };
    radarTarget  = { comfort:0, bright:0, luxury:0, surprise:0 };
    radarWants   = null;
    drawRadar(radarCurrent, null);
    log(level > 0 ? 'Dining room is ready.' : 'Restaurant is not built yet.', level > 0 ? 'gold' : 'bad', true);
    setReturnLink('Back to Hotel', 'fa-arrow-left');
  }

  function updateStats() {
    $('tables-served').textContent = service?.served ?? 0;
    $('tables-target').textContent = service?.target ?? Math.min(7, 3 + Math.max(1, HotelState.get().departments.restaurant?.level ?? 0));
    $('tasting-earned').textContent = fmt(service?.earned ?? 0);
    $('signature-count').textContent = service?.signatures ?? 0;
    $('room-mood').textContent = (service?.signatures ?? 0) >= 2 ? 'Electric' : (service?.lastHarmony ?? 0) >= 70 ? 'Warm' : 'Quiet';
  }

  function showResults({ cash, served, signatures, satBonus }) {
    $('result-cash').textContent = fmt(cash);
    $('result-tables').textContent = served;
    $('result-signatures').textContent = signatures;
    $('result-sat').textContent = satBonus;
    $('tasting-results').hidden = false;
    $('tasting-results').classList.remove('pop');
    void $('tasting-results').offsetWidth;
    $('tasting-results').classList.add('pop');
  }

  function hideResults() {
    $('tasting-results').hidden = true;
  }

  function animateTable(harmony) {
    const table = document.querySelector('.tasting-table');
    if (!table) return;
    table.classList.remove('delighted', 'uneasy');
    void table.offsetWidth;
    table.classList.add(harmony >= 58 ? 'delighted' : 'uneasy');
  }

  function syncHotelCash() {
    $('restaurant-hotel-cash').textContent = fmt(HotelState.getCash());
  }

  function setReturnLink(label, icon) {
    const link = $('restaurant-return-link');
    if (!link) return;
    link.innerHTML = `<i class="fa-solid ${icon}"></i> ${label}`;
  }

  function clearLog() {
    $('tasting-log').innerHTML = '';
  }

  function log(message, tone = '', replace = false) {
    const el = $('tasting-log');
    if (replace) el.innerHTML = '';
    const p = document.createElement('p');
    p.className = tone;
    p.textContent = message;
    el.prepend(p);
  }

  function fmt(n) {
    return Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
  }

  function $(id) {
    return document.getElementById(id);
  }

  return { init };
})();

if (typeof window !== 'undefined') window.RestaurantGame = RestaurantGame;
