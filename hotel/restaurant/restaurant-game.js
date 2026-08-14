/* ============================================================
   HOTEL RESTAURANT - TASTING ROOM
   ------------------------------------------------------------
   A menu-composition game: read the table, build a three-course
   flight, and score the balance instead of matching exact orders.
   ============================================================ */

const RestaurantGame = (() => {
  const DISHES = [
    { id:'emberTart',     name:'Ember Tart',     icon:'fa-fire-burner', role:'open',   trait:'Bold opener',    tags:['warm','bold'],       signals:['warm','bold','showpiece','festive'],      flavor:{ comfort:2, bright:0, luxury:1, surprise:1 }, courseBonus:{ open:8, turn:2, finish:4 }, value:34 },
    { id:'citrusCrudo',   name:'Citrus Crudo',   icon:'fa-lemon',       role:'open',   trait:'Bright opener',  tags:['bright','clean'],    signals:['clean','precise','fresh','gentle'],       flavor:{ comfort:0, bright:3, luxury:1, surprise:1 }, courseBonus:{ open:10, turn:2, finish:0 }, value:38 },
    { id:'velvetRisotto', name:'Velvet Risotto', icon:'fa-bowl-rice',   role:'turn',   trait:'Comfort anchor', tags:['silky','rich'],      signals:['comfort','safe','luxury','gentle'],      flavor:{ comfort:3, bright:0, luxury:2, surprise:0 }, courseBonus:{ open:-2, turn:10, finish:3 }, value:42 },
    { id:'gardenStatic',  name:'Garden Static',  icon:'fa-seedling',    role:'finish', trait:'Surprise finish',tags:['fresh','strange'],   signals:['strange','fresh','memorable','one risk'], flavor:{ comfort:0, bright:2, luxury:0, surprise:3 }, courseBonus:{ open:4, turn:2, finish:10 }, value:36 },
    { id:'goldLeafSole',  name:'Gold Leaf Sole', icon:'fa-fish',        role:'finish', trait:'Luxury finale',  tags:['delicate','luxury'], signals:['luxury','showpiece','precise','polish'],   flavor:{ comfort:1, bright:1, luxury:3, surprise:0 }, courseBonus:{ open:1, turn:4, finish:10 }, value:58 },
    { id:'midnightBroth', name:'Midnight Broth', icon:'fa-moon',        role:'turn',   trait:'Calm reset',     tags:['deep','calm'],       signals:['comfort','calm','gentle','warm'],        flavor:{ comfort:2, bright:0, luxury:0, surprise:2 }, courseBonus:{ open:3, turn:9, finish:2 }, value:30 },
    { id:'pepperBloom',   name:'Pepper Bloom',   icon:'fa-pepper-hot',  role:'finish', trait:'Spiced lift',    tags:['spiced','floral'],   signals:['memorable','one risk','bold','fresh'],   flavor:{ comfort:1, bright:2, luxury:0, surprise:2 }, courseBonus:{ open:5, turn:5, finish:8 }, value:32 },
    { id:'pearlCustard',  name:'Pearl Custard',  icon:'fa-egg',         role:'turn',   trait:'Classic bridge', tags:['soft','classic'],    signals:['safe','comfort','festive','polish'],     flavor:{ comfort:2, bright:1, luxury:2, surprise:0 }, courseBonus:{ open:2, turn:8, finish:6 }, value:44 },
  ];

  const TABLES = [
    { id:'critics',     name:'Quiet Critics',     guests:3, brief:'They notice restraint, contrast, and one brave idea.', wants:{ comfort:2, bright:2, luxury:2, surprise:2 }, keywords:['balanced','precise','one risk'], traits:['balanced','precise','contrast','one risk'], coursePrefs:{ open:'bright', turn:'luxury', finish:'surprise' }, bonus:'surprise', reactions:{ great:'They mark the flight as deliberate and worth remembering.', good:'They nod at the balance, even if one course needed sharper intent.', weak:'They can taste the idea, but the menu never quite commits.' } },
    { id:'highrollers', name:'High Rollers',      guests:4, brief:'They want spectacle, polish, and food that feels expensive.', wants:{ comfort:1, bright:1, luxury:4, surprise:2 }, keywords:['luxury','bold','showpiece'], traits:['luxury','bold','showpiece','polish'], coursePrefs:{ open:'bold', turn:'luxury', finish:'luxury' }, bonus:'luxury', reactions:{ great:'The table reads it as premium from first bite to finale.', good:'The polish lands, though the showpiece could be louder.', weak:'They wanted a statement and got a polite dinner.' } },
    { id:'jetlag',      name:'Jet-Lagged Suite',  guests:2, brief:'They need warmth without heaviness, and a clean finish.', wants:{ comfort:4, bright:2, luxury:1, surprise:0 }, keywords:['comfort','clean','gentle'], traits:['comfort','clean','gentle','warm'], coursePrefs:{ open:'clean', turn:'comfort', finish:'gentle' }, bonus:'comfort', reactions:{ great:'The room finally exhales. Warm, clean, exactly enough.', good:'Comfort arrives, with only a little drag in the middle.', weak:'Too sharp or too heavy for guests who needed recovery.' } },
    { id:'artists',     name:'Late Artists',      guests:5, brief:'They came for a dish they can argue about tomorrow.', wants:{ comfort:1, bright:3, luxury:0, surprise:4 }, keywords:['strange','fresh','memorable'], traits:['strange','fresh','memorable','one risk'], coursePrefs:{ open:'fresh', turn:'bright', finish:'surprise' }, bonus:'bright', reactions:{ great:'They are already debating the finale. That means it worked.', good:'Fresh and strange enough to keep the table awake.', weak:'The flight plays too safe for people hunting a story.' } },
    { id:'family',      name:'Celebration Table', guests:6, brief:'A lively group wants comfort, sparkle, and nothing too severe.', wants:{ comfort:3, bright:2, luxury:2, surprise:1 }, keywords:['warm','festive','safe'], traits:['warm','festive','safe','comfort'], coursePrefs:{ open:'warm', turn:'comfort', finish:'festive' }, bonus:'comfort', reactions:{ great:'The whole table finds something to toast.', good:'Comfort carries the room, with enough sparkle to keep it festive.', weak:'Too severe for a celebration table looking for easy joy.' } },
  ];

  const FLAVORS = ['comfort', 'bright', 'luxury', 'surprise'];
  const COURSES = [
    { key:'open', label:'Open', prompt:'Set the first impression' },
    { key:'turn', label:'Turn', prompt:'Anchor the middle' },
    { key:'finish', label:'Finish', prompt:'Leave the final note' },
  ];
  const ROLE_LABELS = {
    open: 'Opening note',
    turn: 'Mid-course anchor',
    finish: 'Final note',
  };
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
      harmonyTotal: 0,
      bestHarmony: 0,
      bestTable: null,
      weakHarmony: 100,
      weakTable: null,
    };

    $('start-tasting-btn').disabled = true;
    $('start-tasting-btn').innerHTML = '<i class="fa-solid fa-spinner"></i> In Service';
    setReturnLink('Back to Hotel', 'fa-arrow-left');
    setNextStep('Choose 3 dishes for the first table.');
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
    hideFlightFeedback();
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
    score.signature = score.signature || (score.harmony >= 88 && score.matchedTraits.length >= 3);
    score.reaction = tableReaction(service.table, score.harmony, score.signature);
    const base = service.selected.reduce((sum, dish) => sum + dish.value, 0);
    const tableBonus = service.table.guests * 8;
    const levelBonus = service.restaurantLevel * 14;
    const earned = Math.round((base + tableBonus + levelBonus) * (0.55 + score.harmony / 180) * (service.staffEffect?.incomeMult ?? 1));

    service.served++;
    service.earned += earned;
    service.lastHarmony = score.harmony;
    service.harmonyTotal += score.harmony;
    if (score.harmony > service.bestHarmony) {
      service.bestHarmony = score.harmony;
      service.bestTable = service.table.name;
    }
    if (score.harmony < service.weakHarmony) {
      service.weakHarmony = score.harmony;
      service.weakTable = service.table.name;
    }
    if (score.signature) service.signatures++;

    const tone = score.harmony >= 82 ? 'good' : score.harmony >= 58 ? 'gold' : 'bad';
    const note = score.signature ? ' Signature menu.' : score.reaction;
    renderFlightFeedback(score, 'reaction', earned);
    log(`${service.table.name}: ${score.harmony}% harmony. +$${earned}. ${note}`, tone);
    animateTable(score.harmony);
    CasinoShell.sound[score.harmony >= 58 ? 'win' : 'lose']();

    updateStats();
    setTimeout(nextTable, 1400);
  }

  function finishService() {
    const cash = service.earned;
    const signatures = service.signatures;
    const served = service.served;
    const avgHarmony = served ? Math.round(service.harmonyTotal / served) : 0;
    const satBonus = Math.max(0, Math.min(8, signatures * 2 + Math.round(avgHarmony / 35) - 1 + (service.staffEffect?.satisfactionBonus ?? 0)));
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
        { label:'Avg Harmony', value:`${avgHarmony}%` },
        { label:'Best Table', value:service.bestTable ?? 'None' },
      ],
    });
    CasinoShell.awardXp(Math.max(14, Math.round(cash / 5)));

    service.active = false;
    $('start-tasting-btn').disabled = false;
    $('start-tasting-btn').innerHTML = '<i class="fa-solid fa-rotate-right"></i> Open Service Again';
    setReturnLink('Return to Hotel', 'fa-building');
    $('fire-course-btn').disabled = true;
    $('fire-course-btn').innerHTML = '<i class="fa-solid fa-bell-concierge"></i> Service Complete';
    $('clear-flight-btn').disabled = true;
    setNextStep('Return to Hotel with the result, or open service again.');
    syncHotelCash();
    updateStats();
    showResults({ cash, served, signatures, satBonus, avgHarmony, bestTable: service.bestTable, weakTable: service.weakTable });
    log(`Service complete. Hotel earned $${fmt(cash)}. Satisfaction +${satBonus}.`, 'gold');
    CasinoShell.celebrate(cash);
    CasinoShell.toast(`Tasting room complete: +$${fmt(cash)} hotel cash`);
  }

  function scoreFlight(dishes, table) {
    const totals = sumFlavors(dishes);
    const deltas = FLAVORS.map(key => Math.abs((table.wants[key] ?? 0) - totals[key]));
    const flavorFit = Math.max(0, 100 - deltas.reduce((sum, n) => sum + n, 0) * 8);
    const courseMarks = dishes.map((dish, index) => ({
      course: COURSES[index],
      dish,
      value: dish.courseBonus?.[COURSES[index]?.key] ?? 0,
    }));
    const courseFit = courseMarks.reduce((sum, mark) => sum + mark.value, 0);
    const duplicatePenalty = countDuplicates(dishes.flatMap(d => d.tags));
    const rolePenalty = countDuplicates(dishes.map(d => d.role)) * 4;
    const matchedTraits = getMatchedTableTraits(dishes, table, totals);
    const traitScore = Math.min(18, matchedTraits.length * 4);
    const finishDish = dishes[2];
    const finishPreference = table.coursePrefs?.finish ?? table.bonus;
    const finishBonus = finishDish && (dishSignals(finishDish).includes(finishPreference) || (finishDish.flavor[table.bonus] ?? 0) >= 2) ? 8 : 0;
    const raw = flavorFit + courseFit * 0.7 + traitScore + finishBonus - duplicatePenalty * 4 - rolePenalty;
    const harmony = clamp(Math.round(raw), 0, 100);
    const missing = findMissingFlavor(totals, table);
    const strongest = FLAVORS.reduce((best, key) => totals[key] > totals[best] ? key : best, FLAVORS[0]);
    const signature = harmony >= 84 && matchedTraits.length >= 3 && totals[table.bonus] >= (table.wants[table.bonus] ?? 0);

    return {
      harmony,
      totals,
      signature,
      matchedTraits,
      missing,
      strongest,
      courseFit,
      traitScore,
      duplicatePenalty,
      rolePenalty,
      feedback: buildScoreFeedback({ courseFit, duplicatePenalty, rolePenalty, matchedTraits, missing, strongest, table }),
      reaction: tableReaction(table, harmony, signature),
    };
  }

  function sumFlavors(dishes) {
    return dishes.reduce((sum, dish) => {
      FLAVORS.forEach(key => { sum[key] += dish.flavor[key] ?? 0; });
      return sum;
    }, { comfort:0, bright:0, luxury:0, surprise:0 });
  }

  function dishSignals(dish) {
    return [...(dish.tags ?? []), ...(dish.signals ?? []), dish.role].filter(Boolean);
  }

  function dishFitsTable(dish, table) {
    const signals = dishSignals(dish);
    return (table.traits ?? table.keywords ?? []).some(trait => signals.includes(trait))
      || (dish.flavor[table.bonus] ?? 0) >= 2;
  }

  function countDuplicates(items) {
    return items.length - new Set(items).size;
  }

  function getMatchedTableTraits(dishes, table, totals) {
    const signals = new Set(dishes.flatMap(dishSignals));
    const matched = new Set((table.traits ?? table.keywords ?? []).filter(trait => signals.has(trait)));
    const values = FLAVORS.map(key => totals[key] ?? 0);

    if (table.traits?.includes('balanced') && FLAVORS.every(key => (totals[key] ?? 0) > 0)) matched.add('balanced');
    if (table.traits?.includes('contrast') && Math.max(...values) - Math.min(...values) >= 2) matched.add('contrast');
    if (table.traits?.includes('comfort') && (totals.comfort ?? 0) >= (table.wants.comfort ?? 0)) matched.add('comfort');
    if (table.traits?.includes('luxury') && (totals.luxury ?? 0) >= (table.wants.luxury ?? 0)) matched.add('luxury');
    if (table.traits?.includes('safe') && !signals.has('strange') && !signals.has('spiced')) matched.add('safe');
    if (table.traits?.includes('fresh') && signals.has('fresh')) matched.add('fresh');

    return [...matched];
  }

  function findMissingFlavor(totals, table) {
    const deficits = FLAVORS
      .map(key => ({ key, deficit: (table.wants[key] ?? 0) - (totals[key] ?? 0) }))
      .sort((a, b) => b.deficit - a.deficit);
    return deficits[0]?.deficit > 0 ? deficits[0].key : null;
  }

  function buildScoreFeedback({ courseFit, duplicatePenalty, rolePenalty, matchedTraits, missing, strongest, table }) {
    const courseTone = courseFit >= 22 ? 'good' : courseFit >= 15 ? 'mid' : 'bad';
    const traitTone = matchedTraits.length >= 3 ? 'good' : matchedTraits.length >= 2 ? 'mid' : 'bad';
    const varietyPenalty = duplicatePenalty + rolePenalty / 4;
    const varietyTone = varietyPenalty <= 0 ? 'good' : varietyPenalty <= 1 ? 'mid' : 'bad';
    return [
      {
        tone: courseTone,
        label: 'Course Arc',
        value: courseTone === 'good' ? 'Strong order' : courseTone === 'mid' ? 'Workable order' : 'Awkward order',
      },
      {
        tone: traitTone,
        label: 'Table Read',
        value: matchedTraits.length ? matchedTraits.slice(0, 2).join(' + ') : `Needs ${table.keywords?.[0] ?? table.bonus}`,
      },
      {
        tone: varietyTone,
        label: 'Variety',
        value: varietyTone === 'good' ? `Leans ${strongest}` : missing ? `Missing ${missing}` : 'Repeats itself',
      },
    ];
  }

  function tableReaction(table, harmony, signature) {
    if (signature) return table.reactions?.great ?? 'The table calls it a signature flight.';
    if (harmony >= 82) return table.reactions?.great ?? 'The table loves the arc.';
    if (harmony >= 58) return table.reactions?.good ?? 'The table accepts the flight.';
    return table.reactions?.weak ?? 'The table loses patience with the menu.';
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
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
    $('fire-course-btn').innerHTML = ready
      ? '<i class="fa-solid fa-bell-concierge"></i> Fire Flight'
      : `<i class="fa-solid fa-utensils"></i> ${selected.length ? `Choose ${MAX_COURSES - selected.length} More` : 'Choose 3 Dishes'}`;
    $('clear-flight-btn').disabled = !service?.active || selected.length === 0;
    updateNextStep();
    if (ready) {
      renderFlightFeedback(score, 'preview');
    } else if (service?.active && selected.length > 0) {
      renderPartialFlightGuidance(selected, table);
    } else {
      hideFlightFeedback();
    }

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
    const activeIndex = service?.active ? selected.length : -1;
    $('course-rail').innerHTML = [0, 1, 2].map(i => {
      const dish = selected[i];
      const course = COURSES[i];
      return `
        <div class="course-slot ${dish ? 'filled' : ''} ${i === activeIndex ? 'active' : ''}">
          <span>${course.label}</span>
          <strong>${dish ? dish.name : 'Choose dish'}</strong>
          <em>${dish ? dish.trait : course.prompt}</em>
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
      const nextCourse = COURSES[service?.selected?.length ?? 0];
      const courseFit = service?.active && nextCourse ? (dish.courseBonus?.[nextCourse.key] ?? 0) >= 7 : false;
      const tableFit = service?.active && service.table ? dishFitsTable(dish, service.table) : false;
      const suggested = unlocked && !selectedIds.has(dish.id) && (courseFit || tableFit);
      const hint = courseFit ? 'Course Fit' : tableFit ? 'Table Fit' : '';

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
        <button class="dish-card ${selectedIds.has(dish.id) ? 'selected' : ''} ${suggested ? 'suggested' : ''}" type="button" data-dish="${dish.id}" ${disabled ? 'disabled' : ''}>
          <i class="fa-solid ${dish.icon}"></i>
          <span class="dish-name">${dish.name}</span>
          <span class="dish-role">${unlocked ? ROLE_LABELS[dish.role] : 'Locked dish'}</span>
          <span class="dish-tags">${unlocked ? dish.tags.join(' / ') : 'Lv ' + Math.max(1, Math.ceil((index + 1) / 2))}</span>
          ${suggested ? `<span class="dish-hint">${hint}</span>` : ''}
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
    setNextStep(level > 0 ? 'Open service to see the first table.' : 'Build the Restaurant to unlock service.');
  }

  function updateStats() {
    $('tables-served').textContent = service?.served ?? 0;
    $('tables-target').textContent = service?.target ?? Math.min(7, 3 + Math.max(1, HotelState.get().departments.restaurant?.level ?? 0));
    $('tasting-earned').textContent = fmt(service?.earned ?? 0);
    $('signature-count').textContent = service?.signatures ?? 0;
    $('room-mood').textContent = (service?.signatures ?? 0) >= 2 ? 'Electric' : (service?.lastHarmony ?? 0) >= 70 ? 'Warm' : 'Quiet';
  }

  function renderFlightFeedback(score, mode = 'preview', earned = 0) {
    const el = $('flight-feedback');
    if (!el) return;
    const tone = score.harmony >= 82 ? 'good' : score.harmony >= 58 ? 'mid' : 'bad';
    const label = mode === 'reaction' ? 'Table Reaction' : 'Flight Preview';
    const title = mode === 'reaction'
      ? `${score.reaction}${earned ? ` +$${fmt(earned)}` : ''}`
      : `Projected Harmony ${score.harmony}%`;
    el.hidden = false;
    el.className = `flight-feedback ${mode} ${tone}`;
    el.innerHTML = `
      <span>${label}</span>
      <strong>${title}</strong>
      <div class="feedback-chips">
        ${score.feedback.map(item => `
          <div class="feedback-chip ${item.tone}">
            <span>${item.label}</span>
            <strong>${item.value}</strong>
          </div>
        `).join('')}
      </div>
    `;
  }

  function renderPartialFlightGuidance(selected, table) {
    const el = $('flight-feedback');
    if (!el || !table) return;
    const nextCourse = COURSES[selected.length];
    if (!nextCourse) {
      hideFlightFeedback();
      return;
    }
    const preference = table.coursePrefs?.[nextCourse.key] ?? table.bonus;
    el.hidden = false;
    el.className = 'flight-feedback partial';
    el.innerHTML = `
      <span>Flight Read</span>
      <strong>${nextCourse.label}: look for ${preference}.</strong>
      <div class="feedback-chips">
        <div class="feedback-chip good">
          <span>Chosen</span>
          <strong>${selected.map((dish, i) => `${COURSES[i].label}: ${dish.name}`).join(' / ')}</strong>
        </div>
        <div class="feedback-chip mid">
          <span>Table Signal</span>
          <strong>${table.keywords.slice(0, 2).join(' + ')}</strong>
        </div>
      </div>
    `;
  }

  function hideFlightFeedback() {
    const el = $('flight-feedback');
    if (!el) return;
    el.hidden = true;
    el.innerHTML = '';
  }

  function showResults({ cash, served, signatures, satBonus, avgHarmony, bestTable, weakTable }) {
    $('result-cash').textContent = fmt(cash);
    $('result-tables').textContent = served;
    $('result-signatures').textContent = signatures;
    $('result-sat').textContent = satBonus;
    const note = $('result-note');
    if (note) {
      note.textContent = served
        ? `Average harmony ${avgHarmony}%. Best table: ${bestTable ?? 'none'}. Weakest read: ${weakTable ?? 'none'}.`
        : 'No tables were served.';
    }
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

  function updateNextStep() {
    if (!service?.active) return;
    const tableName = service.table?.name ?? 'this table';
    const count = service.selected?.length ?? 0;
    if (count >= MAX_COURSES) {
      setNextStep(`Flight ready. Fire Flight for ${tableName}.`);
      return;
    }
    const remaining = MAX_COURSES - count;
    if (count === 0) {
      setNextStep(`Choose 3 dishes for ${tableName}.`);
      return;
    }
    setNextStep(`Choose ${remaining} more dish${remaining === 1 ? '' : 'es'} for ${tableName}.`);
  }

  function setNextStep(message) {
    const el = $('tasting-next-step');
    if (!el) return;
    el.querySelector('strong').textContent = message;
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

  function debugScoreFlight(dishIds, tableId) {
    const dishes = dishIds.map(id => DISHES.find(dish => dish.id === id)).filter(Boolean);
    const table = TABLES.find(item => item.id === tableId) ?? TABLES[0];
    return scoreFlight(dishes, table);
  }

  return { init, debugScoreFlight };
})();

if (typeof window !== 'undefined') window.RestaurantGame = RestaurantGame;
