/* ============================================================
   HOTEL MANAGER - PIXI DOLLHOUSE HUB  (hotel-renderer.js)
   ------------------------------------------------------------
   Owns the animated hotel canvas. It reads HotelState snapshots
   and HotelConfig metadata, but does not mutate game state.
   ============================================================ */

const HotelRenderer = (() => {
  const DESIGN = {
    width: 480,
    floorHeight: 82,
    roofHeight: 42,
    podiumHeight: 34,
    wall: 16,
    elevatorWidth: 34,
    corner: 8,
  };

  const FLOOR_PROPS = {
    lobby: ['desk', 'plant', 'bell'],
    casino: ['slot', 'cards', 'slot'],
    rooms: ['door', 'bed', 'door', 'lamp'],
    restaurant: ['table', 'table', 'kitchen'],
    bar: ['bar', 'bottle', 'stool'],
    entertainment: ['stage', 'spotlight', 'seats'],
    spa: ['pool', 'steam', 'plant'],
  };

  const DEPT_COLORS = {
    lobby: [0x123423, 0x22563c],
    casino: [0x102611, 0x1d4a23],
    rooms: [0x171b3a, 0x252d5a],
    restaurant: [0x351616, 0x63302b],
    bar: [0x161833, 0x37306d],
    entertainment: [0x32143a, 0x69386f],
    spa: [0x12333a, 0x25636d],
    locked: [0x161616, 0x2a2a2a],
    ready: [0x241e12, 0x4b3d21],
  };

  const GOLD = 0xc9a84c;
  const GOLD_LIGHT = 0xe8cb80;
  const INK = 0x070908;

  let app = null;
  let root = null;
  let layers = null;
  let wrap = null;
  let lastState = null;
  let elapsed = 0;
  let isReady = false;

  function init(containerId = 'hotel-canvas-wrap') {
    wrap = document.getElementById(containerId);
    if (!wrap || !window.PIXI) return false;

    const height = DESIGN.roofHeight
      + (HotelConfig.FLOOR_ORDER.length * DESIGN.floorHeight)
      + DESIGN.podiumHeight;

    app = new PIXI.Application({
      width: DESIGN.width,
      height,
      backgroundColor: 0x07110d,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });

    app.view.className = 'hotel-pixi-canvas';
    app.view.setAttribute('aria-label', 'Animated hotel dollhouse view');
    wrap.appendChild(app.view);

    const fallback = document.getElementById('hotel-building-css');
    if (fallback) fallback.classList.add('pixi-active');

    root = new PIXI.Container();
    layers = {
      background: new PIXI.Container(),
      shell: new PIXI.Container(),
      interiors: new PIXI.Container(),
      anims: new PIXI.Container(),
      guests: new PIXI.Container(),
      fx: new PIXI.Container(),
      ui: new PIXI.Container(),
    };

    app.stage.addChild(root);
    Object.values(layers).forEach(layer => root.addChild(layer));

    app.ticker.add(delta => {
      elapsed += delta / 60;
      animate();
    });

    window.addEventListener('resize', resize);
    resize();
    isReady = true;
    return true;
  }

  function render(state = HotelState.get()) {
    if (!isReady || !state) return false;
    lastState = state;
    clearStaticLayers();
    drawBackground();
    drawBuildingShell(state);
    drawFloors(state);
    drawGuests(state);
    drawStatusBadges(state);
    return true;
  }

  function clearStaticLayers() {
    layers.background.removeChildren();
    layers.shell.removeChildren();
    layers.interiors.removeChildren();
    layers.guests.removeChildren();
    layers.ui.removeChildren();
  }

  function drawBackground() {
    const bg = new PIXI.Graphics();
    bg.beginFill(0x07110d).drawRect(0, 0, app.screen.width, app.screen.height).endFill();
    bg.beginFill(0x0d1b18, 0.9).drawRoundedRect(14, 18, DESIGN.width - 28, app.screen.height - 28, 16).endFill();
    bg.beginFill(0x122820, 0.55).drawRoundedRect(34, 44, DESIGN.width - 68, app.screen.height - 82, 12).endFill();
    layers.background.addChild(bg);

    for (let i = 0; i < 22; i++) {
      const light = new PIXI.Graphics();
      const x = 42 + ((i * 37) % (DESIGN.width - 84));
      const y = 34 + ((i * 61) % (app.screen.height - 78));
      light.beginFill(i % 3 === 0 ? GOLD_LIGHT : 0x5f744f, i % 3 === 0 ? 0.18 : 0.08);
      light.drawCircle(x, y, 1.8 + (i % 2));
      light.endFill();
      layers.background.addChild(light);
    }
  }

  function drawBuildingShell(state) {
    const x = 26;
    const y = DESIGN.roofHeight;
    const w = DESIGN.width - 52;
    const h = HotelConfig.FLOOR_ORDER.length * DESIGN.floorHeight;
    const shell = new PIXI.Graphics();

    shell.beginFill(0x080a09).drawRoundedRect(x - 10, y - 10, w + 20, h + 20, DESIGN.corner).endFill();
    shell.lineStyle(2, GOLD, 0.72).beginFill(0x111711).drawRoundedRect(x, y, w, h, DESIGN.corner).endFill();
    shell.beginFill(0x080808, 0.72).drawRect(x + w - DESIGN.elevatorWidth - 12, y, DESIGN.elevatorWidth + 12, h).endFill();
    shell.lineStyle(1, GOLD, 0.24).moveTo(x + w - DESIGN.elevatorWidth - 12, y).lineTo(x + w - DESIGN.elevatorWidth - 12, y + h);

    shell.beginFill(0x181109).drawPolygon([
      x + 12, y - 10,
      x + w - 12, y - 10,
      x + w - 42, y - DESIGN.roofHeight + 8,
      x + 42, y - DESIGN.roofHeight + 8,
    ]).endFill();
    shell.lineStyle(2, GOLD, 0.68).moveTo(x + 42, y - DESIGN.roofHeight + 8).lineTo(x + w - 42, y - DESIGN.roofHeight + 8);

    const name = new PIXI.Text(state.meta.hotelName, {
      fontFamily: 'Georgia, serif',
      fontSize: 16,
      fontWeight: '700',
      fill: GOLD_LIGHT,
      align: 'center',
    });
    name.anchor.set(0.5);
    name.x = DESIGN.width / 2;
    name.y = 18;
    layers.shell.addChild(shell, name);
  }

  function drawFloors(state) {
    const floors = HotelConfig.FLOOR_ORDER;
    floors.forEach((id, floorIndex) => {
      const top = floorTop(floorIndex);
      const dept = state.departments[id];
      const meta = HotelConfig.DEPT_META[id];
      const unlocked = !!dept?.unlocked;
      const level = dept?.level ?? 0;
      const status = floorStatus(id, dept);
      const palette = status === 'active'
        ? DEPT_COLORS[id]
        : DEPT_COLORS[status];

      drawFloorBox(id, top, palette, status);
      drawFloorLabel(id, meta, top, status, level);
      drawWindows(id, top, status, level);
      drawProps(id, top, status, level);
      drawElevatorSlot(top, floorIndex);
      drawFloorHotspot(id, top, status);
    });
  }

  function floorStatus(id, dept) {
    if (!dept?.unlocked) return 'locked';
    if (id !== 'lobby' && (dept.level ?? 0) <= 0) return 'ready';
    return 'active';
  }

  function drawFloorBox(id, y, palette, status) {
    const x = 26;
    const w = DESIGN.width - 52;
    const interiorW = w - DESIGN.elevatorWidth - 12;
    const g = new PIXI.Graphics();
    const isActive = status === 'active';

    g.beginFill(palette[0], isActive ? 0.96 : 0.68);
    g.drawRect(x, y, interiorW, DESIGN.floorHeight);
    g.endFill();
    g.beginFill(palette[1], isActive ? 0.42 : 0.26);
    g.drawRect(x + 1, y + 1, interiorW - 2, DESIGN.floorHeight - 2);
    g.endFill();
    g.lineStyle(1, GOLD, 0.2);
    g.moveTo(x, y).lineTo(x + w, y);

    if (status !== 'active') {
      drawConstructionOverlay(g, x, y, interiorW, status);
    }

    layers.interiors.addChild(g);
  }

  function drawConstructionOverlay(g, x, y, w, status) {
    g.lineStyle(2, status === 'ready' ? GOLD : 0x3a3221, status === 'ready' ? 0.46 : 0.34);
    for (let sx = x - 30; sx < x + w; sx += 26) {
      g.moveTo(sx, y + DESIGN.floorHeight);
      g.lineTo(sx + 76, y);
    }

    g.beginFill(0x080808, status === 'ready' ? 0.16 : 0.34);
    g.drawRect(x + 108, y + 18, 150, 34);
    g.endFill();
    g.lineStyle(1, status === 'ready' ? GOLD_LIGHT : 0x706244, status === 'ready' ? 0.48 : 0.25);
    g.drawRect(x + 112, y + 22, 142, 26);
  }

  function drawFloorLabel(id, meta, y, status, level) {
    const isActive = status === 'active';
    const isReady = status === 'ready';
    const label = new PIXI.Text(meta.label, {
      fontFamily: 'Georgia, serif',
      fontSize: 13,
      fontWeight: '700',
      fill: isActive ? 0xf3dc9a : isReady ? 0xe8cb80 : 0x7d745d,
    });
    label.x = 46;
    label.y = y + 10;

    const subText = isActive
      ? `Lv ${level}`
      : isReady
        ? 'Ready to build'
        : `Requires reputation ${HotelConfig.DEPT_UNLOCK_REP[id] ?? 1}`;
    const sub = new PIXI.Text(subText, {
      fontFamily: 'Arial, sans-serif',
      fontSize: 10,
      fill: isActive ? 0xb8ad8d : isReady ? 0xcbbf91 : 0x736a5a,
    });
    sub.x = 47;
    sub.y = y + 28;

    const icon = new PIXI.Text(isActive ? meta.icon : isReady ? '🔨' : '🚧', {
      fontFamily: 'Arial, sans-serif',
      fontSize: 20,
    });
    icon.x = 34;
    icon.y = y + 43;

    layers.ui.addChild(label, sub, icon);
  }

  function drawWindows(id, y, status, level) {
    const isActive = status === 'active';
    const count = Math.min(5, 2 + Math.max(level, 1));
    for (let i = 0; i < count; i++) {
      const x = 110 + i * 42;
      const lit = isActive && ((i + level) % 2 === 0 || id === 'lobby');
      const win = new PIXI.Graphics();
      win.beginFill(lit ? GOLD_LIGHT : 0x111817, lit ? 0.56 : status === 'ready' ? 0.38 : 0.62);
      win.drawRoundedRect(x, y + 13, 20, 24, 3);
      win.endFill();
      win.lineStyle(1, 0x030303, 0.35).drawRoundedRect(x, y + 13, 20, 24, 3);
      layers.interiors.addChild(win);
    }
  }

  function drawProps(id, y, status, level) {
    if (status !== 'active') {
      drawBuildPreview(id, y, status);
      return;
    }

    const props = FLOOR_PROPS[id] ?? [];
    props.forEach((prop, index) => {
      const x = 128 + index * 70;
      const baseY = y + 56;
      drawProp(prop, x, baseY, 1, level);
    });
  }

  function drawBuildPreview(id, y, status) {
    const g = new PIXI.Graphics();
    const x = 154;
    const baseY = y + 58;

    g.alpha = status === 'ready' ? 0.88 : 0.5;
    g.lineStyle(2, status === 'ready' ? GOLD_LIGHT : 0x6b6048, status === 'ready' ? 0.65 : 0.32);
    g.moveTo(x, baseY).lineTo(x + 38, baseY - 28).lineTo(x + 76, baseY);
    g.moveTo(x + 10, baseY).lineTo(x + 10, baseY - 18);
    g.moveTo(x + 66, baseY).lineTo(x + 66, baseY - 18);

    g.beginFill(status === 'ready' ? 0xc9a84c : 0x3a3426, status === 'ready' ? 0.32 : 0.45);
    g.drawRoundedRect(x + 104, baseY - 29, 70, 24, 3);
    g.endFill();
    g.lineStyle(1, status === 'ready' ? GOLD_LIGHT : 0x6b6048, status === 'ready' ? 0.55 : 0.3);
    for (let i = 0; i < 4; i++) {
      g.moveTo(x + 112 + i * 14, baseY - 26);
      g.lineTo(x + 112 + i * 14, baseY - 8);
    }
    layers.interiors.addChild(g);

    const blueprint = new PIXI.Text(status === 'ready' ? 'BUILD' : 'LOCKED', {
      fontFamily: 'Arial, sans-serif',
      fontSize: 9,
      fontWeight: '700',
      fill: status === 'ready' ? 0xf0dda3 : 0x807761,
      letterSpacing: 1,
    });
    blueprint.x = x + 118;
    blueprint.y = baseY - 23;
    layers.ui.addChild(blueprint);
  }

  function drawProp(prop, x, y, alpha, level) {
    const g = new PIXI.Graphics();
    g.alpha = alpha;

    if (prop === 'desk') {
      g.beginFill(0x5c311c).drawRoundedRect(x, y - 13, 48, 16, 3).endFill();
      g.beginFill(GOLD, 0.7).drawRect(x + 6, y - 18, 22, 5).endFill();
    } else if (prop === 'plant') {
      g.beginFill(0x174f2f).drawCircle(x + 12, y - 18, 10).drawCircle(x + 21, y - 14, 8).endFill();
      g.beginFill(0x5b3922).drawRoundedRect(x + 10, y - 8, 16, 11, 2).endFill();
    } else if (prop === 'bell') {
      g.beginFill(GOLD_LIGHT).drawCircle(x + 18, y - 8, 8).endFill();
      g.beginFill(GOLD).drawRect(x + 8, y, 20, 3).endFill();
    } else if (prop === 'slot') {
      g.beginFill(0x201c2a).drawRoundedRect(x, y - 32, 24, 32, 4).endFill();
      g.beginFill(0x142d18).drawRect(x + 4, y - 25, 16, 10).endFill();
      g.beginFill(level > 2 ? GOLD_LIGHT : 0xd74f45).drawCircle(x + 12, y - 7, 5).endFill();
    } else if (prop === 'cards') {
      g.beginFill(0xf1ead8).drawRoundedRect(x, y - 19, 18, 24, 2).endFill();
      g.beginFill(0xb93131).drawRoundedRect(x + 13, y - 22, 18, 24, 2).endFill();
    } else if (prop === 'door') {
      g.beginFill(0x5c3524).drawRoundedRect(x, y - 34, 21, 34, 2).endFill();
      g.beginFill(GOLD_LIGHT).drawCircle(x + 16, y - 17, 2).endFill();
    } else if (prop === 'bed') {
      g.beginFill(0x2d3e78).drawRoundedRect(x, y - 17, 46, 18, 3).endFill();
      g.beginFill(0xf0e4c4).drawRoundedRect(x + 3, y - 14, 14, 10, 2).endFill();
    } else if (prop === 'lamp') {
      g.lineStyle(2, GOLD, 0.65).moveTo(x + 10, y).lineTo(x + 10, y - 18);
      g.beginFill(GOLD_LIGHT, 0.7).drawPolygon([x, y - 18, x + 20, y - 18, x + 15, y - 30, x + 5, y - 30]).endFill();
    } else if (prop === 'table') {
      g.beginFill(0x6f3222).drawEllipse(x + 16, y - 11, 24, 10).endFill();
      g.lineStyle(2, 0x2b160e).moveTo(x + 16, y - 2).lineTo(x + 16, y + 8);
    } else if (prop === 'kitchen') {
      g.beginFill(0xb8b4a5).drawRoundedRect(x, y - 27, 34, 28, 3).endFill();
      g.beginFill(0x7d221b).drawCircle(x + 9, y - 12, 5).drawCircle(x + 24, y - 12, 5).endFill();
    } else if (prop === 'bar') {
      g.beginFill(0x4b1e18).drawRoundedRect(x, y - 21, 56, 20, 3).endFill();
      g.beginFill(GOLD, 0.5).drawRect(x + 3, y - 24, 50, 4).endFill();
    } else if (prop === 'bottle') {
      for (let i = 0; i < 4; i++) {
        g.beginFill([0x2f8a4c, 0x8a2f4c, 0x2f608a, GOLD][i], 0.8).drawRoundedRect(x + i * 11, y - 28 - (i % 2) * 5, 6, 25 + (i % 2) * 5, 2).endFill();
      }
    } else if (prop === 'stool') {
      g.beginFill(0x5a2b1e).drawCircle(x + 12, y - 17, 10).endFill();
      g.lineStyle(2, 0x2b160e).moveTo(x + 12, y - 7).lineTo(x + 12, y + 5);
    } else if (prop === 'stage') {
      g.beginFill(0x231025).drawRoundedRect(x, y - 18, 60, 18, 3).endFill();
      g.beginFill(GOLD, 0.4).drawRect(x + 6, y - 23, 48, 4).endFill();
    } else if (prop === 'spotlight') {
      g.beginFill(GOLD_LIGHT, 0.28).drawPolygon([x + 12, y - 36, x - 8, y, x + 42, y]).endFill();
      g.beginFill(0x1b1b1b).drawCircle(x + 12, y - 36, 8).endFill();
    } else if (prop === 'seats') {
      for (let i = 0; i < 4; i++) g.beginFill(0x602626).drawRoundedRect(x + i * 12, y - 13, 9, 12, 2).endFill();
    } else if (prop === 'pool') {
      g.beginFill(0x42b9c7, 0.72).drawRoundedRect(x, y - 18, 58, 18, 8).endFill();
      g.lineStyle(1, 0xd5faff, 0.5).moveTo(x + 8, y - 9).quadraticCurveTo(x + 20, y - 15, x + 32, y - 9).quadraticCurveTo(x + 44, y - 3, x + 54, y - 9);
    } else if (prop === 'steam') {
      g.lineStyle(2, 0xdcfff7, 0.42);
      for (let i = 0; i < 3; i++) {
        g.moveTo(x + i * 12, y - 4).quadraticCurveTo(x - 6 + i * 12, y - 19, x + 4 + i * 12, y - 32);
      }
    }

    layers.interiors.addChild(g);
  }

  function drawElevatorSlot(y, floorIndex) {
    const x = DESIGN.width - 72;
    const g = new PIXI.Graphics();
    g.beginFill(0x050505, 0.48).drawRect(x, y + 1, 46, DESIGN.floorHeight - 2).endFill();
    g.lineStyle(1, GOLD, 0.18).drawRect(x + 7, y + 10, 22, DESIGN.floorHeight - 20);

    if (floorIndex === 0) {
      const text = new PIXI.Text('ELEV', {
        fontFamily: 'Arial, sans-serif',
        fontSize: 8,
        fill: 0x8c7b52,
        letterSpacing: 1,
      });
      text.x = x + 6;
      text.y = y + 58;
      layers.ui.addChild(text);
    }

    layers.shell.addChild(g);
  }

  function drawFloorHotspot(id, y, status) {
    const hit = new PIXI.Graphics();
    hit.beginFill(0xffffff, 0.001);
    hit.drawRect(26, y, DESIGN.width - 98, DESIGN.floorHeight);
    hit.endFill();
    hit.eventMode = 'static';
    hit.cursor = 'pointer';

    const outline = new PIXI.Graphics();
    outline.visible = false;
    outline.lineStyle(2, status === 'active' ? GOLD_LIGHT : status === 'ready' ? GOLD : 0x7d745d, status === 'locked' ? 0.38 : 0.78);
    outline.drawRect(28, y + 2, DESIGN.width - 104, DESIGN.floorHeight - 4);
    layers.ui.addChild(outline);

    hit.on('pointerover', () => { outline.visible = true; });
    hit.on('pointerout', () => { outline.visible = false; });
    hit.on('pointertap', () => {
      window.dispatchEvent(new CustomEvent('hotel:floor-selected', {
        detail: { deptId: id, status, unlocked: status !== 'locked' },
      }));
    });

    layers.ui.addChild(hit);
  }

  function pulseFloor(deptId) {
    if (!isReady || !deptId) return;
    const index = HotelConfig.FLOOR_ORDER.indexOf(deptId);
    if (index < 0) return;

    const y = floorTop(index);
    const pulse = new PIXI.Graphics();
    pulse.lineStyle(3, GOLD_LIGHT, 0.85);
    pulse.drawRect(30, y + 4, DESIGN.width - 108, DESIGN.floorHeight - 8);
    pulse.life = 0;
    layers.fx.addChild(pulse);

    const tick = delta => {
      pulse.life += delta / 60;
      pulse.alpha = Math.max(0, 1 - pulse.life / 0.7);
      pulse.scale.set(1 + pulse.life * 0.02, 1 + pulse.life * 0.03);
      if (pulse.life >= 0.7) {
        app.ticker.remove(tick);
        pulse.destroy();
      }
    };
    app.ticker.add(tick);
  }

  function drawGuests(state) {
    const population = Math.max(3, Math.min(12, state.guests?.population ?? 5));
    const openFloors = HotelConfig.FLOOR_ORDER
      .filter(id => floorStatus(id, state.departments[id]) === 'active')
      .map(id => HotelConfig.FLOOR_ORDER.indexOf(id));

    for (let i = 0; i < population; i++) {
      const floorIndex = openFloors[i % openFloors.length] ?? 0;
      const y = floorTop(floorIndex) + 60;
      const x = 76 + ((i * 47) % 285);
      const guest = makeGuest(i, x, y);
      guest.meta = { baseX: x, baseY: y, speed: 0.5 + (i % 4) * 0.12, phase: i * 0.9 };
      layers.guests.addChild(guest);
    }

    if (state.guests?.vipPresent) {
      const vip = makeGuest(98, 332, floorTop(HotelConfig.FLOOR_ORDER.indexOf('bar')) + 60, true);
      vip.meta = { baseX: vip.x, baseY: vip.y, speed: 0.35, phase: 3 };
      layers.guests.addChild(vip);
    }

    if (state.guests?.highRollerPresent) {
      const highRoller = makeGuest(99, 334, floorTop(HotelConfig.FLOOR_ORDER.indexOf('casino')) + 60, true, 0x62d6ff);
      highRoller.meta = { baseX: highRoller.x, baseY: highRoller.y, speed: 0.45, phase: 6 };
      layers.guests.addChild(highRoller);
    }
  }

  function makeGuest(index, x, y, special = false, glow = GOLD_LIGHT) {
    const c = new PIXI.Container();
    c.x = x;
    c.y = y;

    const color = special ? glow : [0xe8cb80, 0xa9d6c0, 0xd98880, 0x8fa9d6][index % 4];
    const body = new PIXI.Graphics();
    if (special) body.beginFill(color, 0.18).drawCircle(0, -14, 16).endFill();
    body.beginFill(color).drawCircle(0, -23, 5).endFill();
    body.beginFill(color, 0.86).drawRoundedRect(-5, -17, 10, 16, 4).endFill();
    body.lineStyle(2, color, 0.7).moveTo(-3, -2).lineTo(-7, 7).moveTo(3, -2).lineTo(7, 7);
    c.addChild(body);
    return c;
  }

  function drawStatusBadges(state) {
    const guests = new PIXI.Text(`${state.guests?.population ?? 0} guests`, {
      fontFamily: 'Arial, sans-serif',
      fontSize: 11,
      fontWeight: '700',
      fill: 0xf4e2a7,
    });
    guests.x = 36;
    guests.y = app.screen.height - 24;

    const hint = new PIXI.Text('Click departments on the right to expand the resort', {
      fontFamily: 'Arial, sans-serif',
      fontSize: 10,
      fill: 0x8f856b,
    });
    hint.anchor.set(1, 0);
    hint.x = DESIGN.width - 34;
    hint.y = app.screen.height - 23;

    layers.ui.addChild(guests, hint);
  }

  function animate() {
    if (!layers) return;

    layers.guests.children.forEach((guest, index) => {
      if (!guest.meta) return;
      const wobble = Math.sin(elapsed * guest.meta.speed + guest.meta.phase);
      guest.x = guest.meta.baseX + wobble * 9;
      guest.y = guest.meta.baseY + Math.abs(wobble) * 1.5;
      guest.scale.x = wobble < 0 ? -1 : 1;
      guest.alpha = 0.82 + Math.abs(wobble) * 0.18;
    });

    layers.interiors.children.forEach((child, index) => {
      if (index % 11 === 0) child.alpha = 0.86 + Math.sin(elapsed * 2 + index) * 0.08;
    });
  }

  function floorTop(floorIndex) {
    const reversed = HotelConfig.FLOOR_ORDER.length - 1 - floorIndex;
    return DESIGN.roofHeight + (reversed * DESIGN.floorHeight);
  }

  function resize() {
    if (!wrap || !app) return;
    const available = wrap.clientWidth || DESIGN.width;
    const scale = Math.min(1, available / DESIGN.width);
    app.view.style.width = `${Math.floor(DESIGN.width * scale)}px`;
    app.view.style.height = `${Math.floor(app.screen.height * scale)}px`;
  }

  function flashIncome(amount) {
    if (!isReady || !amount) return;
    const text = new PIXI.Text(`+$${short(amount)}`, {
      fontFamily: 'Georgia, serif',
      fontSize: 20,
      fontWeight: '700',
      fill: 0x6fcf97,
      stroke: 0x061008,
      strokeThickness: 3,
    });
    text.anchor.set(0.5);
    text.x = DESIGN.width / 2;
    text.y = DESIGN.roofHeight + 32;
    text.life = 0;
    layers.fx.addChild(text);

    const tick = delta => {
      text.life += delta / 60;
      text.y -= delta * 0.45;
      text.alpha = Math.max(0, 1 - text.life / 1.3);
      if (text.life >= 1.3) {
        app.ticker.remove(tick);
        text.destroy();
      }
    };
    app.ticker.add(tick);
  }

  function short(n) {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(Math.round(n));
  }

  return { init, render, flashIncome, pulseFloor };
})();

if (typeof window !== 'undefined') window.HotelRenderer = HotelRenderer;
