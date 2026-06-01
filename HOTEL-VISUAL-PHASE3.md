# Hotel Manager — Phase 3 Visual Architecture
## Full technical plan: Pixi.js · Cross-section view · Guest state machine

> **Scope of this document**
>
> Phase 3 splits into three deliverables built in order:
> - **3A — Static building** (hotel cross-section, department floors, ambient art)
> - **3B — Guest characters** (spawning, walking, interacting, leaving)
> - **3C — Visual events** (particles, floating numbers, jackpot flashes, VIP arrivals)
>
> Do not start 3B until 3A renders correctly. Do not start 3C until 3B
> has guests walking without bugs. The layers depend on each other.

---

## 1. What We Are Building

A cross-section hotel — the "dollhouse" view. The player sees every floor
at once. Guests enter at the bottom, ride an elevator between floors, and
spend time at departments. The management UI sits alongside the canvas, not
on top of it.

```
  ┌─────────────────────────────────────────────────────┐
  │  ☁️  ☁️          sky / exterior                  ☁️  │
  ├──────────────────────────────────────────────────────┤
  │ 🧖 SPA & WELLNESS          [Lv 2]  ~~~~~~~~~~~~~ 💆 │  ← Floor 6
  ├──────────────────────────────────────────────────────┤
  │ 🎭 ENTERTAINMENT            [Lv 1]  🎤  seats...    │  ← Floor 5
  ├──────────────────────────────────────────────────────┤
  │ 🍸 BAR & LOUNGE             [Lv 2]  🍸  🍸  🍹     │  ← Floor 4
  ├──────────────────────────────────────────────────────┤
  │ 🍽️ RESTAURANT               [Lv 3]  🪑 🪑 🪑 🪑   │  ← Floor 3
  ├──────────────────────────────────────────────────────┤
  │ 🛏️ ROOMS                    [Lv 2]  🚪 🚪 🚪 🚪   │  ← Floor 2
  ├──────────────────────────────────────────────────────┤
  │ 🎰 CASINO FLOOR             [Lv 1]  🎰  🂡  🎰     │  ← Floor 1
  ├──────────────────────────────────────────────────────┤
  │ 🏨 LOBBY / RECEPTION        🚶 → 🛗    🚶 🚶 🚶    │  ← Ground
  └──────────────────────────────────────────────────────┘
                         ↑ entrance
```

**Floor order** is fixed — the schema determines which departments exist,
the renderer assigns them floors in the order above. Locked departments show
as a "Construction" floor with scaffolding art and a lock icon.

---

## 2. Technology: Pixi.js

```
Pixi.js v7  —  https://pixijs.com
Bundle:        ~1MB (acceptable for a game)
Renderer:      WebGL with Canvas fallback
Integration:   drops into vanilla JS as a <script> tag or ES module
```

```html
<!-- In hotel.html, BEFORE hotel-renderer.js -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/pixi.js/7.3.2/pixi.min.js"></script>
```

```js
// hotel-renderer.js — the Pixi application
const app = new PIXI.Application({
  width:           520,
  height:          window.innerHeight - 140,  // below shell header
  backgroundColor: 0x0d1117,
  antialias:       true,
  resolution:      window.devicePixelRatio || 1,
  autoDensity:     true,
});

document.getElementById('hotel-canvas-wrap').appendChild(app.view);
```

**Why Pixi.js over alternatives:**

| Option | Verdict |
|---|---|
| Raw Canvas + requestAnimationFrame | Too much manual work for sprites, layers, hit areas |
| CSS + DOM animation | Collapses at 10+ simultaneously animated characters |
| Phaser | Full game framework — overkill, 4MB+ bundle |
| Three.js | 3D library, wrong tool for 2D sprites |
| **Pixi.js** | ✓ Built for exactly this: 2D sprites, layers, 60fps, reasonable size |

---

## 3. The Layer Stack

Every visual element lives in exactly one Pixi Container. Containers are
rendered in order — higher index = renders on top. Never mix layers.

```
Layer 7  — UI overlays       (floating income numbers, tooltips, notifications)
Layer 6  — Particles/FX      (confetti, sparkles, VIP fanfare, jackpot flash)
Layer 5  — Guest indicators  (speech bubbles, satisfaction icons above guests)
Layer 4  — Guests            (animated characters, all guest sprites)
Layer 3  — Dept animations   (pool water, slot machine spinning, candle flicker)
Layer 2  — Dept interiors    (furniture, props — static per dept level)
Layer 1  — Building shell    (floor slabs, walls, windows, elevator shaft)
Layer 0  — Background        (sky, clouds, building exterior gradient)
```

```js
// hotel-renderer.js
const layers = {
  background:    new PIXI.Container(),
  building:      new PIXI.Container(),
  interiors:     new PIXI.Container(),
  deptAnims:     new PIXI.Container(),
  guests:        new PIXI.Container(),
  indicators:    new PIXI.Container(),
  fx:            new PIXI.Container(),
  ui:            new PIXI.Container(),
};

// Add in order — index 0 renders behind
Object.values(layers).forEach(layer => app.stage.addChild(layer));
```

---

## 4. Building Structure

### 4a. Floor Layout Constants

```js
// building-renderer.js — CONFIG, not saved

const BUILDING = {
  width:          520,
  floorHeight:    90,      // px per floor
  wallThickness:  18,
  elevatorX:      480,     // x position of elevator shaft (right side)
  elevatorWidth:  28,
  entranceX:      60,      // where guests spawn/despawn
  windowWidth:    22,
  windowSpacing:  48,
};

// Floor order (bottom = index 0 = ground floor, top = last)
const FLOOR_ORDER = [
  'lobby',         // index 0 — always ground, always visible
  'casino',        // index 1
  'rooms',         // index 2
  'restaurant',    // index 3
  'bar',           // index 4
  'entertainment', // index 5
  'spa',           // index 6 — top floor
];

function floorY(floorIndex) {
  // Y coordinate of the TOP of this floor
  // Canvas origin is top-left, so ground floor is highest Y value
  const totalFloors = FLOOR_ORDER.length;
  return (totalFloors - 1 - floorIndex) * BUILDING.floorHeight;
}
```

### 4b. Drawing a Floor

Each floor is drawn once when the department is unlocked or upgraded. It's
not redrawn every frame — only on state change. Use `PIXI.Graphics` for
procedural art, or a `PIXI.Sprite` from a tile texture.

```js
// building-renderer.js
function drawFloor(deptId, level, floorIndex, layers) {
  const y    = floorY(floorIndex);
  const w    = BUILDING.width;
  const h    = BUILDING.floorHeight;

  // Floor slab (the ceiling/floor line between departments)
  const slab = new PIXI.Graphics();
  slab.beginFill(0x2a1f0e);
  slab.drawRect(0, y + h - 4, w, 4);
  slab.endFill();
  layers.building.addChild(slab);

  // Department interior background
  const bg = new PIXI.Graphics();
  bg.beginFill(DEPT_COLORS[deptId] ?? 0x1a2a1a);
  bg.drawRect(BUILDING.wallThickness, y, w - BUILDING.wallThickness * 2 - BUILDING.elevatorWidth, h - 4);
  bg.endFill();
  layers.interiors.addChild(bg);

  // Department label
  const label = new PIXI.Text(DEPT_LABELS[deptId], {
    fontFamily: 'Playfair Display, serif',
    fontSize:   11,
    fill:       0xc9a84c,
    letterSpacing: 2,
  });
  label.x = BUILDING.wallThickness + 6;
  label.y = y + 6;
  layers.interiors.addChild(label);

  // Props for this dept + level
  drawDeptProps(deptId, level, y, layers.interiors);

  // Ambient animations for this dept
  setupDeptAmbience(deptId, level, y, layers.deptAnims);
}

const DEPT_COLORS = {
  lobby:         0x0d2218,
  casino:        0x0a1a0a,
  rooms:         0x1a1a2e,
  restaurant:    0x1a0d0d,
  bar:           0x0d0d1a,
  entertainment: 0x1a0a1a,
  spa:           0x0d1a1a,
};
```

### 4c. The Elevator Shaft

The elevator shaft is a permanent vertical element spanning all floors.
It has a simple car that guests "ride" (animated y position).

```js
function drawElevatorShaft(layers) {
  const totalHeight = FLOOR_ORDER.length * BUILDING.floorHeight;

  const shaft = new PIXI.Graphics();
  shaft.beginFill(0x111111);
  shaft.lineStyle(1, 0x8a6e28, 0.6);
  shaft.drawRect(BUILDING.elevatorX, 0, BUILDING.elevatorWidth, totalHeight);
  shaft.endFill();
  layers.building.addChild(shaft);

  // Elevator car — stored on the renderer so guests can reference it
  const car = new PIXI.Graphics();
  car.beginFill(0x2a2010);
  car.lineStyle(1, 0xc9a84c, 0.8);
  car.drawRoundedRect(0, 0, BUILDING.elevatorWidth - 4, BUILDING.floorHeight - 10, 3);
  car.endFill();
  car.x = BUILDING.elevatorX + 2;
  car.y = floorY(0);    // starts at ground floor
  layers.building.addChild(car);

  return car;
}
```

---

## 5. Department Interaction Slots

Each department floor has predefined positions where guests stand and interact.
These are **config**, not save state. Positions are expressed as fractions of
floor width (0–1) so they scale with the building.

```js
// hotel-config.js — never persisted
const DEPT_SLOTS = {
  lobby: [
    { id: 'desk_0',    xFrac: 0.20, type: 'desk',     animation: 'idle'    },
    { id: 'wait_0',    xFrac: 0.40, type: 'standing', animation: 'idle'    },
    { id: 'wait_1',    xFrac: 0.52, type: 'standing', animation: 'phone'   },
    { id: 'wait_2',    xFrac: 0.64, type: 'standing', animation: 'idle'    },
  ],
  casino: [
    { id: 'slot_0',    xFrac: 0.18, type: 'slots',    animation: 'pull'    },
    { id: 'slot_1',    xFrac: 0.32, type: 'slots',    animation: 'pull'    },
    { id: 'bj_0',      xFrac: 0.52, type: 'blackjack',animation: 'cards'   },
    { id: 'bj_1',      xFrac: 0.68, type: 'blackjack',animation: 'cards'   },
  ],
  restaurant: [
    { id: 'table_0',   xFrac: 0.18, type: 'table',    animation: 'eating'  },
    { id: 'table_1',   xFrac: 0.34, type: 'table',    animation: 'eating'  },
    { id: 'table_2',   xFrac: 0.50, type: 'table',    animation: 'eating'  },
    { id: 'table_3',   xFrac: 0.66, type: 'table',    animation: 'eating'  },
  ],
  bar: [
    { id: 'bar_0',     xFrac: 0.22, type: 'bar',      animation: 'drink'   },
    { id: 'bar_1',     xFrac: 0.36, type: 'bar',      animation: 'drink'   },
    { id: 'bar_2',     xFrac: 0.50, type: 'bar',      animation: 'drink'   },
    { id: 'couch_0',   xFrac: 0.68, type: 'sitting',  animation: 'relax'   },
  ],
  spa: [
    { id: 'bed_0',     xFrac: 0.20, type: 'bed',      animation: 'lying'   },
    { id: 'bed_1',     xFrac: 0.42, type: 'bed',      animation: 'lying'   },
    { id: 'pool_0',    xFrac: 0.64, type: 'pool',     animation: 'swim'    },
  ],
  entertainment: [
    { id: 'seat_0',    xFrac: 0.20, type: 'seat',     animation: 'watch'   },
    { id: 'seat_1',    xFrac: 0.34, type: 'seat',     animation: 'watch'   },
    { id: 'seat_2',    xFrac: 0.48, type: 'seat',     animation: 'watch'   },
    { id: 'seat_3',    xFrac: 0.62, type: 'seat',     animation: 'watch'   },
  ],
  rooms: [
    // Rooms are shown as doors — guests enter and disappear (in room)
    { id: 'door_0',    xFrac: 0.20, type: 'door',     animation: 'enter'   },
    { id: 'door_1',    xFrac: 0.36, type: 'door',     animation: 'enter'   },
    { id: 'door_2',    xFrac: 0.52, type: 'door',     animation: 'enter'   },
    { id: 'door_3',    xFrac: 0.68, type: 'door',     animation: 'enter'   },
  ],
};

// Runtime slot occupancy (not persisted — rebuilt on load from guest state)
const slotOccupancy = {};   // { 'casino/slot_0': guestId | null }
```

---

## 6. The Guest State Machine

This is the heart of Phase 3B. Every guest is an instance of this machine.
The machine runs inside the Pixi ticker (every frame) but transitions happen
on game-time events (every N seconds of real time).

```
                     ┌─────────────┐
              spawn  │             │
         ───────────▶│  SPAWNING   │
                     │ (fade in)   │
                     └──────┬──────┘
                            │ animation done
                     ┌──────▼──────┐
                     │             │
                     │  ENTERING   │ ← walking from entrance to lobby area
                     │             │
                     └──────┬──────┘
                            │ reached lobby
                     ┌──────▼──────┐
              ┌──────│             │◀─────────────────┐
              │      │    IDLE     │                  │
              │      │  (in lobby) │                  │
              │      └──────┬──────┘                  │
              │             │ destination chosen       │
              │      ┌──────▼──────┐                  │
              │      │             │                  │
              │      │  WALK_TO    │ ← to elevator    │
              │      │  ELEVATOR   │                  │
              │      └──────┬──────┘                  │
              │             │ at elevator              │
              │      ┌──────▼──────┐                  │
              │      │             │                  │
              │      │ IN_ELEVATOR │ ← riding up/down │
              │      │             │                  │
              │      └──────┬──────┘                  │
              │             │ at destination floor     │
              │      ┌──────▼──────┐                  │
              │      │             │                  │
              │      │  WALK_TO    │ ← to slot        │
              │      │   SLOT      │                  │
              │      └──────┬──────┘                  │
              │             │ at slot                  │
              │      ┌──────▼──────┐                  │
              │      │             │                  │
              │      │ INTERACTING │ ← activity anim  │
              │      │             │                  │
              │      └──────┬──────┘                  │
              │             │ done (timer elapsed)     │
              │      ┌──────▼──────┐                  │
              │      │             │                  │
              │      │ RETURNING   │ ── to elevator ──┘
              │      │             │   OR to lobby
              │      └─────────────┘
              │                         guest.visits >= maxVisits
              │      ┌─────────────┐   ───────────────────────────▶ LEAVING
              └─────▶│             │
        satisfaction  │   LEAVING   │ ← walk to entrance, fade out, destroy
        too low OR    │             │
        leaving time  └─────────────┘
```

### 6a. Guest Data Structure (Runtime — not persisted)

```js
// guest-renderer.js
class Guest {
  constructor(typeId, guestId) {
    // Identity
    this.id        = guestId;          // 'guest_0042'
    this.typeId    = typeId;           // 'gambler' | 'vip' | etc.
    this.type      = GUEST_TYPES[typeId];

    // State machine
    this.state     = 'SPAWNING';
    this.prevState = null;

    // Navigation
    this.x         = BUILDING.entranceX;
    this.y         = floorY(0) + BUILDING.floorHeight * 0.7;
    this.targetX   = this.x;
    this.targetY   = this.y;
    this.speed     = 60 + Math.random() * 20;   // px/second — slight variation
    this.floorIndex = 0;
    this.destFloor  = 0;
    this.destSlot   = null;           // { id, xFrac, type, animation }

    // Interaction timing
    this.stayDuration  = 0;           // ms to spend interacting
    this.stayElapsed   = 0;
    this.visits        = 0;
    this.maxVisits     = 2 + Math.floor(Math.random() * 3);  // 2–4 destinations per visit

    // Animation
    this.walkFrame    = 0;
    this.walkTimer    = 0;
    this.facing       = 'right';      // 'left' | 'right'
    this.alpha        = 0;            // starts transparent (SPAWNING)
    this.sprite       = null;         // PIXI.Container assigned by character-draw.js

    // Mood
    this.mood         = 'neutral';    // 'happy' | 'neutral' | 'bored' | 'unhappy'
    this.moodTimer    = 0;
  }
}
```

### 6b. State Transition Logic

```js
// guest-renderer.js
function updateGuest(guest, deltaMs, hotelState) {
  switch (guest.state) {

    case 'SPAWNING':
      guest.alpha = Math.min(1, guest.alpha + deltaMs / 400);
      if (guest.alpha >= 1) transitionTo(guest, 'ENTERING');
      break;

    case 'ENTERING':
      moveToward(guest, 280, guest.y, deltaMs);   // lobby center x
      if (Math.abs(guest.x - 280) < 2) transitionTo(guest, 'IDLE');
      break;

    case 'IDLE':
      guest.stayElapsed += deltaMs;
      // Wait 5–20 real seconds before deciding next destination
      if (guest.stayElapsed >= guest.stayDuration) {
        const dest = chooseDest(guest, hotelState);
        if (dest === 'leave') { transitionTo(guest, 'LEAVING'); break; }
        guest.destFloor = dest.floorIndex;
        guest.destSlot  = dest.slot;
        guest.stayElapsed = 0;
        transitionTo(guest, 'WALK_TO_ELEVATOR');
      }
      break;

    case 'WALK_TO_ELEVATOR':
      moveToward(guest, BUILDING.elevatorX - 10, guest.y, deltaMs);
      if (Math.abs(guest.x - (BUILDING.elevatorX - 10)) < 2) {
        transitionTo(guest, 'IN_ELEVATOR');
      }
      break;

    case 'IN_ELEVATOR':
      const targetY = floorY(guest.destFloor) + BUILDING.floorHeight * 0.7;
      moveToward(guest, guest.x, targetY, deltaMs, 80);   // faster vertical
      if (Math.abs(guest.y - targetY) < 2) {
        guest.floorIndex = guest.destFloor;
        transitionTo(guest, 'WALK_TO_SLOT');
      }
      break;

    case 'WALK_TO_SLOT':
      const slotX = BUILDING.wallThickness
        + guest.destSlot.xFrac
        * (BUILDING.width - BUILDING.wallThickness * 2 - BUILDING.elevatorWidth);
      moveToward(guest, slotX, guest.y, deltaMs);
      if (Math.abs(guest.x - slotX) < 2) {
        claimSlot(guest);
        guest.stayDuration = 8000 + Math.random() * 22000;  // 8–30s real time
        guest.stayElapsed  = 0;
        transitionTo(guest, 'INTERACTING');
      }
      break;

    case 'INTERACTING':
      guest.stayElapsed += deltaMs;
      playInteractionAnim(guest, deltaMs);
      if (guest.stayElapsed >= guest.stayDuration) {
        releaseSlot(guest);
        guest.visits++;
        // After N visits or if satisfaction is low — head for the exit
        if (guest.visits >= guest.maxVisits || shouldLeave(guest, hotelState)) {
          transitionTo(guest, 'WALK_TO_ELEVATOR');
          guest.destFloor = 0;
          guest.destSlot  = null;
        } else {
          transitionTo(guest, 'WALK_TO_ELEVATOR');
          const next = chooseDest(guest, hotelState);
          guest.destFloor = next.floorIndex;
          guest.destSlot  = next.slot;
        }
      }
      break;

    case 'LEAVING':
      moveToward(guest, BUILDING.entranceX, guest.y, deltaMs);
      guest.alpha = Math.max(0, guest.alpha - deltaMs / 800);
      if (guest.alpha <= 0) destroyGuest(guest);
      break;
  }

  // Sync Pixi sprite position and alpha
  if (guest.sprite) {
    guest.sprite.x     = guest.x;
    guest.sprite.y     = guest.y;
    guest.sprite.alpha = guest.alpha;
  }
}
```

### 6c. Destination Choice

```js
// guest-renderer.js
function chooseDest(guest, hotelState) {
  const { departments } = hotelState;
  const guestType = GUEST_TYPES[guest.typeId];

  // Build list of available destinations
  const options = [];
  for (const [deptId, dept] of Object.entries(departments)) {
    if (!dept.unlocked || dept.level === 0) continue;
    if (deptId === 'rooms') continue;         // rooms handled separately (invisible)
    if (deptId === 'lobby')  continue;         // no one chooses lobby as destination

    // Get available (unoccupied) slot
    const slots = DEPT_SLOTS[deptId] ?? [];
    const available = slots.filter(s =>
      !slotOccupancy[`${deptId}/${s.id}`]
    );
    if (available.length === 0) continue;

    // Weight by guest type preferences
    const isLiked    = guestType.likes?.includes(deptId);
    const visitChance = deptId === 'casino' ? guestType.casinoVisitChance : 0.4;
    const weight      = isLiked ? visitChance * 2 : visitChance;

    options.push({
      weight,
      floorIndex: FLOOR_ORDER.indexOf(deptId),
      slot:       available[Math.floor(Math.random() * available.length)],
    });
  }

  if (options.length === 0) return 'leave';

  // Weighted random pick
  const total = options.reduce((s, o) => s + o.weight, 0);
  let rand = Math.random() * total;
  for (const opt of options) {
    rand -= opt.weight;
    if (rand <= 0) return opt;
  }
  return options[options.length - 1];
}
```

---

## 7. Character Drawing System

Two implementation levels. Start with Procedural (Phase 3B launch),
upgrade to Sprites when you have art assets (Phase 3C or later).

### 7a. Procedural Characters (no art files needed)

Characters are drawn with Pixi.js `Graphics` objects. Each guest type gets
a signature color and accessory. The walk cycle is driven by a sine wave.

```js
// character-draw.js

const GUEST_COLORS = {
  budgetTraveler: { body: 0x4a6a8a, skin: 0xf0c8a0 },
  tourist:        { body: 0xe8a020, skin: 0xf0c8a0 },
  gambler:        { body: 0x2a4a2a, skin: 0xd4a080 },
  businessGuest:  { body: 0x1a1a3a, skin: 0xf0c8a0 },
  vip:            { body: 0x8a6e28, skin: 0xf0c8a0 },
  highRoller:     { body: 0x1a0a2a, skin: 0xd4a080 },
};

function createCharacterSprite(typeId) {
  const container = new PIXI.Container();
  const colors    = GUEST_COLORS[typeId];

  // Body
  const body = new PIXI.Graphics();
  body.beginFill(colors.body);
  body.drawRoundedRect(-8, -20, 16, 22, 4);
  body.endFill();
  container.addChild(body);

  // Head
  const head = new PIXI.Graphics();
  head.beginFill(colors.skin);
  head.drawCircle(0, -28, 9);
  head.endFill();
  container.addChild(head);

  // Eyes
  const eyes = new PIXI.Graphics();
  eyes.beginFill(0x222222);
  eyes.drawCircle(-3, -29, 1.5);
  eyes.drawCircle(3, -29, 1.5);
  eyes.endFill();
  container.addChild(eyes);

  // Legs (animated — two separate Graphics, referenced for animation)
  const legL = new PIXI.Graphics();
  legL.beginFill(colors.body);
  legL.drawRoundedRect(-6, 0, 5, 14, 2);
  legL.endFill();
  container.addChild(legL);

  const legR = new PIXI.Graphics();
  legR.beginFill(colors.body);
  legR.drawRoundedRect(1, 0, 5, 14, 2);
  legR.endFill();
  container.addChild(legR);

  // Accessory by type
  drawAccessory(typeId, container);

  // Store leg references for animation
  container._legL = legL;
  container._legR = legR;
  container._walkPhase = Math.random() * Math.PI * 2;  // random offset so guests don't sync

  return container;
}

function drawAccessory(typeId, container) {
  const acc = new PIXI.Text(
    { budgetTraveler: '🎒', tourist: '📸', gambler: '🎲',
      businessGuest: '💼', vip: '⭐', highRoller: '💎' }[typeId] ?? '',
    { fontSize: 10 }
  );
  acc.anchor.set(0.5);
  acc.x = 10;
  acc.y = -18;
  container.addChild(acc);
}

// Call every frame for walking guests
function animateWalk(container, deltaMs) {
  container._walkPhase += deltaMs * 0.008;
  const swing = Math.sin(container._walkPhase) * 5;
  container._legL.y = swing > 0 ? -swing * 0.5 : 0;
  container._legR.y = swing < 0 ? swing * 0.5  : 0;
  container._legL.rotation =  swing * 0.04;
  container._legR.rotation = -swing * 0.04;
}

// Stop legs when idle/interacting
function animateIdle(container, deltaMs) {
  container._legL.y = 0;
  container._legR.y = 0;
  container._legL.rotation = 0;
  container._legR.rotation = 0;
  // Subtle breathing
  const breathe = Math.sin(Date.now() * 0.001) * 0.5;
  container.scale.y = 1 + breathe * 0.01;
}
```

### 7b. Sprite Sheet System (Phase 3C upgrade)

When you have art assets, replace `createCharacterSprite` with a sprite sheet
loader. The state machine stays identical — only the drawing changes.

```
Sprite sheet layout (per guest type):
  Row 0: walk_right  [4 frames × 24px]
  Row 1: walk_left   [4 frames × 24px]
  Row 2: idle        [2 frames × 24px]
  Row 3: sitting     [1 frame  × 24px]
  Row 4: eating      [3 frames × 24px]
  Row 5: drinking    [3 frames × 24px]
  Row 6: swimming    [4 frames × 24px]

File naming: guest-{typeId}.png (e.g. guest-gambler.png)
Recommended size: 24×48px per frame, @2x for retina
```

```js
// character-draw.js — sprite version
async function loadGuestSheet(typeId) {
  const sheet = await PIXI.Assets.load(`./assets/sprites/guest-${typeId}.png`);
  return sheet;
}

function getFrameForState(state, slot) {
  const ROW = {
    'ENTERING': 0, 'WALK_TO_ELEVATOR': 0, 'WALK_TO_SLOT': 0, 'RETURNING': 0,
    'INTERACTING': { table: 3, bar: 5, pool: 6, slots: 2, blackjack: 3 }[slot?.type] ?? 2,
    'IDLE': 2, 'SPAWNING': 2, 'LEAVING': 0,
  };
  return ROW[state] ?? 2;
}
```

---

## 8. Ambient Department Animations

These run independently of guests. They make the hotel feel alive even
when no one is in a department. All built with Pixi Graphics or lightweight
tweening — no sprite sheets required.

```js
// ambient-renderer.js

function setupDeptAmbience(deptId, level, floorY, container) {
  switch (deptId) {

    case 'casino':
      // Slot machine reels spinning (three small rectangles rotating)
      spawnSlotMachineAnim(container, floorY);
      // Playing card flip on blackjack table every ~3s
      spawnCardFlipAnim(container, floorY);
      break;

    case 'spa':
      // Pool water: a sine wave drawn each frame across the pool area
      spawnPoolWaterAnim(container, floorY);
      // Candle flicker: orange ellipse with varying alpha
      spawnCandleAnim(container, floorY);
      break;

    case 'restaurant':
      // Steam rising from kitchen: small particles drifting upward
      spawnSteamParticles(container, floorY);
      break;

    case 'bar':
      // Glass clink effect: two circles briefly merging every ~5s
      spawnGlassClinkAnim(container, floorY);
      // Neon sign flicker: text with random alpha dip
      spawnNeonSignAnim(container, floorY);
      break;

    case 'entertainment':
      // Stage spotlight sweep: rotating light cone
      spawnSpotlightAnim(container, floorY);
      break;
  }
}

// Example: pool water
function spawnPoolWaterAnim(container, floorY) {
  const water = new PIXI.Graphics();
  container.addChild(water);

  // Redrawn in the ticker — sine wave across pool area
  app.ticker.add((delta) => {
    water.clear();
    water.lineStyle(2, 0x4ab0d0, 0.6);
    const t = Date.now() / 1000;
    water.moveTo(300, floorY + 60);
    for (let x = 300; x <= 460; x += 4) {
      const y = floorY + 60 + Math.sin((x / 20) + t * 2) * 3;
      water.lineTo(x, y);
    }
  });
}

// Example: steam particles
function spawnSteamParticles(container, floorY) {
  const particles = [];
  for (let i = 0; i < 4; i++) {
    const p = new PIXI.Graphics();
    p.beginFill(0xffffff, 0.15);
    p.drawEllipse(0, 0, 4, 6);
    p.endFill();
    p.x = 100 + i * 30 + Math.random() * 10;
    p.y = floorY + 40;
    p._speed = 0.3 + Math.random() * 0.2;
    p._offset = Math.random() * Math.PI * 2;
    container.addChild(p);
    particles.push(p);
  }

  app.ticker.add(() => {
    particles.forEach(p => {
      p.y -= p._speed;
      p.alpha -= 0.002;
      p.x += Math.sin(Date.now() * 0.001 + p._offset) * 0.3;
      if (p.alpha <= 0) {
        p.y = floorY + 40;
        p.alpha = 0.15;
      }
    });
  });
}
```

---

## 9. The Dual Game Loop

Two completely separate loops. They must never block each other.

```
INCOME TICK (every 60 seconds)
  │
  ├── calculateIncome(HotelState)
  ├── add to hotelCash
  ├── recalculateSatisfaction()
  ├── updateGuestMix()
  ├── spawnOrDespawnGuests()
  ├── checkAchievements()
  └── emit events → visual FX (floating numbers, level-up glow, etc.)

RENDER TICK (every ~16ms = 60fps via app.ticker)
  │
  ├── for each guest: updateGuest(guest, delta, HotelState)
  ├── animate walk cycles / idle cycles
  ├── run ambient animations (water, steam, candle)
  ├── update floating numbers (drift upward, fade out)
  ├── update particle systems (confetti, sparkles)
  └── Pixi renders everything
```

```js
// hotel-renderer.js

// ── Income tick ────────────────────────────────────────────────────
let lastIncomeTick = Date.now();

function runIncomeTick() {
  const now    = Date.now();
  const result = HotelEngine.calculateIncome(HotelState.get(), now);
  if (result.amount > 0) {
    HotelState.addHotelCash(result.amount);
    VisualEvents.emit('income', { amount: result.amount });
  }
  HotelEngine.recalculateSatisfaction(HotelState.get());
  GuestEngine.updatePopulation(HotelState.get());
  lastIncomeTick = now;
}

setInterval(runIncomeTick, 60_000);

// ── Render tick ───────────────────────────────────────────────────
app.ticker.add((delta) => {
  const deltaMs = delta * (1000 / 60);       // convert Pixi delta to ms
  const state   = HotelState.get();          // read-only snapshot

  activeGuests.forEach(g => updateGuest(g, deltaMs, state));
  floatingNumbers.forEach(n => updateFloatingNumber(n, deltaMs));
  // ambient anims run their own internal ticker callbacks (set up once)
});
```

---

## 10. Visual Event System

Game events trigger visual effects. This is a tiny pub/sub bus.
Game logic emits. Renderer subscribes. They never call each other directly.

```js
// visual-events.js

const VisualEvents = {
  _handlers: {},
  emit(event, data) {
    (this._handlers[event] ?? []).forEach(fn => fn(data));
  },
  on(event, fn) {
    if (!this._handlers[event]) this._handlers[event] = [];
    this._handlers[event].push(fn);
  },
};
```

**Event catalog:**

```js
// fx-renderer.js — subscribe to all visual events

// ── Floating income numbers ──────────────────────────────────────
VisualEvents.on('income', ({ amount }) => {
  // Spawn +$X text that floats upward over active departments
  Object.entries(HotelState.get().departments)
    .filter(([, d]) => d.unlocked && d.level > 0)
    .forEach(([deptId, d]) => {
      const floorIdx = FLOOR_ORDER.indexOf(deptId);
      spawnFloatingNumber(
        `+$${Math.floor(amount / activeDeptCount)}`,
        BUILDING.width / 2,
        floorY(floorIdx) + 20,
      );
    });
});

// ── Department upgraded ──────────────────────────────────────────
VisualEvents.on('dept_upgraded', ({ deptId, newLevel }) => {
  const floorIdx = FLOOR_ORDER.indexOf(deptId);
  // Golden pulse radiating from that floor
  spawnGoldenPulse(floorY(floorIdx), BUILDING.floorHeight);
  // Rebuild the floor art
  rebuildFloor(deptId, newLevel, floorIdx);
  HotelEvents.recalculateReputation();
});

// ── VIP arrival ──────────────────────────────────────────────────
VisualEvents.on('vip_arrival', ({ typeId }) => {
  // Red carpet unfurls at entrance
  spawnRedCarpet();
  // Gold particles shower from entrance point
  spawnParticleBurst(BUILDING.entranceX, floorY(0) + 60, 0xffd700, 40);
  // Notification banner
  showBanner(`★ ${GUEST_TYPES[typeId].label} has arrived`);
});

// ── Casino jackpot (from CasinoBridge) ──────────────────────────
VisualEvents.on('jackpot', ({ amount }) => {
  // Casino floor lights flash
  flashFloor('casino', 0xffd700, 6);
  // Confetti from casino floor
  spawnConfettiBurst(BUILDING.width / 2, floorY(1));
  // Attract high-roller guest next spawn cycle
  HotelState.setHighRollerFlag();
});

// ── Satisfaction dropped ─────────────────────────────────────────
VisualEvents.on('satisfaction_drop', ({ from, to }) => {
  if (to < 50) {
    // Sad face indicator above lobby guests
    activeGuests
      .filter(g => g.floorIndex === 0)
      .forEach(g => showMoodIndicator(g, 'unhappy'));
  }
});

// ── Level up (casino XP system) ─────────────────────────────────
VisualEvents.on('level_up', ({ level }) => {
  spawnParticleBurst(BUILDING.width / 2, floorY(0), 0xc9a84c, 60);
  showBanner(`Level ${level} — bonus chips awarded!`);
});
```

---

## 11. Floating Number System

These are `+$X` text objects that drift upward and fade out. They're one of
the most satisfying visual feedbacks in idle games.

```js
// fx-renderer.js
const floatingNumbers = [];

function spawnFloatingNumber(text, x, y) {
  const label = new PIXI.Text(text, {
    fontFamily:  'Playfair Display, serif',
    fontSize:    14,
    fontWeight:  'bold',
    fill:        0xc9a84c,
    dropShadow:  true,
    dropShadowDistance: 1,
  });
  label.anchor.set(0.5);
  label.x = x + (Math.random() - 0.5) * 60;
  label.y = y;
  label._vy    = -0.6;    // px/ms upward drift
  label._life  = 1.0;     // alpha, counts down to 0

  layers.ui.addChild(label);
  floatingNumbers.push(label);
}

function updateFloatingNumber(label, deltaMs) {
  label.y     += label._vy * deltaMs;
  label._life -= deltaMs * 0.0008;
  label.alpha  = Math.max(0, label._life);
  if (label._life <= 0) {
    layers.ui.removeChild(label);
    floatingNumbers.splice(floatingNumbers.indexOf(label), 1);
    label.destroy();
  }
}
```

---

## 12. The Viewport (Camera + Scroll)

As the hotel grows taller (more floors unlocked), the building may exceed
the canvas height. The viewport handles pan and optional auto-fit.

```js
// hotel-viewport.js

const viewport = {
  y:         0,        // current scroll offset (positive = scrolled down)
  minY:      0,        // top of building
  maxY:      0,        // calculated from total floors
  isDragging: false,
  dragStartY: 0,
};

function updateMaxScroll() {
  const totalH = FLOOR_ORDER.length * BUILDING.floorHeight;
  viewport.maxY = Math.max(0, totalH - app.view.height);
}

// Pan the stage container on scroll/drag
function applyViewport() {
  app.stage.y = -viewport.y;
}

// Touch/mouse drag to scroll
app.view.addEventListener('pointerdown', e => {
  viewport.isDragging = true;
  viewport.dragStartY = e.clientY + viewport.y;
});
app.view.addEventListener('pointermove', e => {
  if (!viewport.isDragging) return;
  viewport.y = Math.max(viewport.minY,
               Math.min(viewport.maxY, viewport.dragStartY - e.clientY));
  applyViewport();
});
app.view.addEventListener('pointerup', () => viewport.isDragging = false);

// Scroll to a specific floor (called when dept upgrades to draw attention)
function scrollToFloor(floorIndex, smooth = true) {
  const targetY = floorY(floorIndex) - app.view.height / 2;
  if (!smooth) { viewport.y = Math.max(0, targetY); applyViewport(); return; }
  // Tween via requestAnimationFrame
  tweenViewportTo(Math.max(0, targetY), 400);
}
```

---

## 13. Page Layout (HTML structure)

Reserve this layout before Phase 3 implementation starts.
The canvas slot must exist in Phase 1 even if it's empty.

```html
<!-- hotel.html -->
<body class="hotel-page">

  <!-- Shell header (injected by CasinoShell.standalone) -->

  <div class="hotel-manager-layout">

    <!-- Left: the living hotel building -->
    <div class="hotel-view-wrap">
      <div id="hotel-canvas-wrap">
        <!-- Pixi canvas injected here by hotel-renderer.js -->
      </div>
      <div class="hotel-view-controls">
        <button id="scroll-up">↑</button>
        <button id="scroll-down">↓</button>
      </div>
    </div>

    <!-- Right: management panel -->
    <aside class="hotel-mgmt-panel">

      <section class="income-display">
        <div class="income-rate">$<span id="income-rate">125</span>/min</div>
        <div class="hotel-cash">Hotel Cash: $<span id="hotel-cash">5000</span></div>
      </section>

      <section class="satisfaction-display">
        <div class="sat-label">Guest Satisfaction</div>
        <div class="sat-bar">
          <div class="sat-fill" id="sat-fill" style="width: 75%"></div>
        </div>
        <span id="sat-value">75%</span>
      </section>

      <section class="dept-upgrade-list" id="dept-list">
        <!-- Department cards rendered by hotel-ui.js -->
      </section>

    </aside>
  </div>

</body>
```

```css
/* hotel.css */
.hotel-manager-layout {
  display: grid;
  grid-template-columns: 520px 1fr;
  gap: 20px;
  max-width: 1100px;
  margin: 0 auto;
  padding: 0 20px;
}

#hotel-canvas-wrap canvas {
  display: block;
  border-radius: 12px;
  border: 2px solid var(--gold-dark);
  box-shadow: var(--shadow-deep);
}

/* Mobile: stack vertically */
@media (max-width: 768px) {
  .hotel-manager-layout {
    grid-template-columns: 1fr;
  }
  #hotel-canvas-wrap canvas {
    width: 100% !important;
    height: 55vh !important;
  }
}
```

---

## 14. File Structure

```
casino/
└── hotel/
    ├── hotel.html              ← hotel manager page
    ├── hotel.css               ← hotel manager styles
    │
    ├── hotel-state.js          ← save/load (Phase 1)
    ├── hotel-config.js         ← UPGRADE_CATALOG, GUEST_TYPES, DEPT_SLOTS (Phase 1)
    ├── hotel-engine.js         ← calculateIncome, satisfaction, guest mix (Phase 1–2)
    ├── hotel-bridge.js         ← casino ↔ hotel events (Phase 1)
    ├── hotel-ui.js             ← department cards, satisfaction meter DOM (Phase 1–2)
    │
    └── visual/                 ← everything below is Phase 3
        ├── hotel-renderer.js   ← Pixi app, layer stack, dual game loop
        ├── building-renderer.js ← floor drawing, elevator shaft
        ├── dept-renderer.js    ← department props + slot positions
        ├── guest-renderer.js   ← guest FSM, movement, collision
        ├── ambient-renderer.js ← pool water, steam, neon, candle
        ├── fx-renderer.js      ← floating numbers, particles, banners
        ├── hotel-viewport.js   ← camera, scroll, pan
        ├── character-draw.js   ← procedural characters + sprite upgrade path
        ├── visual-events.js    ← pub/sub event bus
        └── assets/
            ├── sprites/        ← guest-{typeId}.png sprite sheets (Phase 3C)
            └── tiles/          ← floor background tiles (optional)
```

---

## 15. Build Order Within Phase 3

```
3A.1  Set up Pixi app · draw background + sky
3A.2  Draw building shell (walls, windows, elevator shaft)
3A.3  Draw one floor (casino) with props — static art only
3A.4  Add all floors with locked states showing construction art
3A.5  Ambient animations on the casino floor (slot spin, card flip)
3A.6  Ambient animations on remaining departments
3A.7  Floating income numbers on income tick
3A.8  Department upgrade visual (pulse + rebuild floor)
───── 3A complete — the hotel looks alive with no guests ─────
3B.1  Spawn one guest type (tourist) · walk cycle procedural
3B.2  Full guest state machine for that one type
3B.3  Add all guest types + their accessories
3B.4  Guest interaction animations at each slot type
3B.5  Guest mood indicators (happy/unhappy speech bubble)
3B.6  Spawn/despawn system tied to HotelState.guests.population
───── 3B complete — guests walk, visit departments, leave ────
3C.1  VIP arrival effect (red carpet + gold particles)
3C.2  Jackpot casino event (floor flash + confetti)
3C.3  Satisfaction drop visual (mood shift across guests)
3C.4  Viewport scroll + pan
3C.5  Sprite sheet upgrade (swap procedural for pixel art)
───── 3C complete — full Phase 3 visual system ───────────────
```
