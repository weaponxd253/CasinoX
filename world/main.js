import { WorldState, WORLD_KEY, saveAvailability } from './world-state.js';
import { LOBBY } from './lobby-config.js';
import { BlackjackOverlay } from '../floor/blackjack-overlay.js';
import { Dialogue } from './dialogue.js';
import { readResortSnapshot } from './resort-snapshot.js';
import { WORLD_ROOMS, routeFor, backRoute, routeEntry } from './room-routes.js';
import { CasinoGameHost } from './casino-game-host.js';
import { CASINO_ATTRACTIONS } from './casino-attractions.js';

const host = document.getElementById('floor-canvas');
const status = document.getElementById('world-status');
const errors = document.getElementById('world-errors');
const interact = document.getElementById('world-interact');
const returnButton = document.getElementById('world-return');
const dialog = document.getElementById('blackjack-overlay');
const conversation = document.getElementById('world-dialogue');
let game;
let current = 'CentralLobby';
let ready = false;
let failed = false;
let lobby;
let casino;
let hotel;
let mainFloor;
const rooms = new Map(), departures = new Map();
let pendingEntry = null;
let interactHeld = false, awaitingRelease = false;
let overlay;
let casinoGameHost;
let casinoPose = null;
let dialogue;
let store;
let returnPosition;
let unlockInteractionAt = 0;
let lastSaveAt = 0;
let lastSavedPosition;
let allowLeaving = false;

const activeScene = () => rooms.get(current);
const isBlocked = () => failed || !ready || awaitingRelease || !activeScene()?.owner || dialog.open || conversation.open || casinoGameHost?.isOpen || performance.now() < unlockInteractionAt;
const samePosition = (a, b) => a && b && a.x === b.x && a.y === b.y && a.facing === b.facing;
const setText = (id, value) => {
  const element = document.getElementById(id);
  if (element.textContent !== value) element.textContent = value;
};

function refreshResort() {
  const resort = readResortSnapshot();
  setText('world-resort', resort.name);
  setText('world-hotel-cash', resort.hasHotel ? resort.hotelCash.toFixed(2) : 'Not created');
  return resort;
}

function fail(error) {
  failed = true;
  if (activeScene()?.sys) {
    const scene = activeScene();
    scene.owner?.stop();
    if (scene.input?.keyboard) scene.input.keyboard.enabled = false;
    const pause = () => scene.owner ? scene.pauseWorld() : scene.game.scene.pause(scene);
    // SceneManager finishes create() by setting RUNNING. Pause after that
    // lifecycle event, rather than leaving status and active flags inconsistent.
    if (scene.sys.getStatus() === window.Phaser.Scenes.CREATING) {
      scene.events.once('create', pause);
    } else if (scene.sys.isActive()) pause();
  }
  errors.hidden = false;
  errors.textContent = `${error.message} Saved data has not been reset or replaced.`;
  host.setAttribute('aria-busy', 'false');
  status.textContent = 'Saved data needs attention. Return to the title to review it.';
  interact.disabled = true;
  returnButton.disabled = true;
  console.error('Casino world:', error);
}

function persistLobby() {
  if (!lobby?.owner || failed) return false;
  const position = lobby.owner.snapshot();
  if (samePosition(position, lastSavedPosition) && store.state) return true;
  try {
    store.save(position);
    lastSavedPosition = position;
    lastSaveAt = performance.now();
    return true;
  } catch (error) {
    fail(error);
    return false;
  }
}

function refresh() {
  if (!ready || failed) return;
  const scene = activeScene();
  if (!scene?.owner) return;
  const action = scene.interactions.current();
  const locked = isBlocked();
  interact.disabled = !action || locked;
  returnButton.hidden = current === 'CentralLobby';
  returnButton.disabled = locked;
  setText('world-location', WORLD_ROOMS[current].label);
  setText('world-return', `Return to ${WORLD_ROOMS[WORLD_ROOMS[current].parent]?.label ?? 'Central Lobby'}`);
  const actionLabel = action && (routeFor(current, action.id)?.label ?? action.label);
  setText('world-interact', action ? `E · ${actionLabel}` : 'E · Interact');
  setText('world-status', casinoGameHost?.isOpen ? 'At a casino game · world paused' : dialog.open ? 'At the blackjack table · world paused'
    : conversation.open ? 'In conversation · world paused · Esc to close'
      : action ? [current === 'CasinoRoom' && action.id === 'blackjack' ? casino.dealer.greeting : null,
        `Press E · ${actionLabel}`].filter(Boolean).join(' · ')
        : WORLD_ROOMS[current].help);
  if (current === 'CentralLobby' && performance.now() - lastSaveAt > 750) persistLobby();
}

function completeArrival(scene) {
  if (failed) return;
  if (pendingEntry?.key === current) { scene.owner.restore(pendingEntry.position); pendingEntry = null; }
  ready = true;
  host.setAttribute('aria-busy', 'false');
  scene.focusCanvas();
}

function travel(route) {
  if (!route || isBlocked() || route.from !== current) return;
  try {
    const source = activeScene(), destination = rooms.get(route.to);
    const position = routeEntry(route, returnPosition, destination?.owner?.snapshot());
    if (!destination) throw new Error('The destination room is unavailable.');
    source.stopMovement();
    if (current === 'CentralLobby') {
      if (!persistLobby()) return;
      returnPosition = lobby.owner.snapshot();
    }
    departures.set(current, source.owner.snapshot());
    pendingEntry = { key: route.to, position };
    if (destination.owner) { destination.owner.restore(position); pendingEntry = null; }
    const previous = current;
    ready = false; awaitingRelease = interactHeld;
    host.setAttribute('aria-busy', 'true'); interact.disabled = true; returnButton.disabled = true;
    setText('world-status', 'Loading the room…');
    unlockInteractionAt = performance.now() + 250;
    game.scene.sleep(previous); current = route.to; game.scene.run(current);
    if (destination.owner && !failed) completeArrival(destination);
    refresh();
  } catch (error) { fail(error); }
}
function returnToParent() { travel(backRoute(current)); }

// Scenes and definitions request actions; this host owns navigation and modals.
function dispatch(definition) {
  if (isBlocked() || activeScene().interactions.current()?.id !== definition.id) return;
  const action = definition.action;
  if (action.type === 'door' || action.type === 'return') travel(routeFor(current, definition.id));
  else if (action.type === 'management') document.getElementById('management-link').click();
  else if (action.type === 'blackjack') overlay.open();
  else if (action.type === 'casino-game' && current === 'MainCasinoFloor') casinoGameHost.open(action.gameId, action.attractionId);
  else if (action.type === 'dialogue') {
    try { dialogue.open(action.conversation, refreshResort()); }
    catch (error) { fail(error); }
  }
  refresh();
}

// The existing page remains authoritative. This is only an unload warning;
// it never serializes, refunds, restores or replays a blackjack hand.
function hasActiveHand() {
  return Boolean(casinoGameHost?.hasUnresolved() || document.getElementById('blackjack-frame').contentDocument?.body?.classList.contains('mid-hand'));
}

document.querySelectorAll('[data-leave-world]').forEach(link => {
  link.addEventListener('click', event => {
    activeScene()?.owner?.stop();
    if (!failed && lobby?.owner && !persistLobby()) { event.preventDefault(); return; }
    if (hasActiveHand()) {
      if (!confirm(casinoGameHost?.hasUnresolved()
        ? 'Leaving may lose your unfinished casino round or unbanked pot. Leave anyway?'
        : 'Leaving will lose your unfinished blackjack hand. Its wager stays deducted. Leave anyway?')) {
        event.preventDefault();
        activeScene()?.focusCanvas();
      } else allowLeaving = true;
    }
  });
});
window.addEventListener('beforeunload', event => {
  if (hasActiveHand() && !allowLeaving) {
    event.preventDefault();
    event.returnValue = '';
  }
});
window.addEventListener('pagehide', persistLobby);
window.addEventListener('storage', event => {
  if (event.key === 'theme') document.documentElement.dataset.theme = localStorage.getItem('theme') === 'light' ? 'light' : 'dark';
  if (!store || failed) return;
  const availability = saveAvailability();
  if (availability.errors.length) fail(new Error(availability.errors.join(' ')));
  else if (event.key === WORLD_KEY && localStorage.getItem(WORLD_KEY) !== store.expectedRaw) {
    fail(new Error('Your world save changed in another tab. Reload to continue; no position was overwritten.'));
  }
  if (!failed && (event.key === 'hotelGameState' || event.key === null)) {
    try { refreshResort(); lobby?.guests?.requestActivityRefresh(); } catch (error) { fail(error); }
  }
});

try {
  document.documentElement.dataset.theme = localStorage.getItem('theme') === 'light' ? 'light' : 'dark';
  store = new WorldState();
  refreshResort();
  returnPosition = store.lobby;
  lastSavedPosition = store.state && !store.needsMigration ? store.lobby : null;
  CasinoWallet.onChange(value => {
    for (const id of ['world-balance', 'casino-game-balance']) document.getElementById(id).textContent = value.toFixed(2);
  });
  if (!window.Phaser) throw new Error('The room runtime could not load. Use the existing resort links above.');
  const [{ LobbyScene }, { CasinoRoom }, { HotelScene }, { MainCasinoFloorScene }] = await Promise.all([
    import('./lobby-scene.js'), import('../floor/room-scene.js'), import('./hotel-scene.js'), import('./main-casino-scene.js'),
  ]);
  const onReady = scene => {
    if (failed) return;
    completeArrival(scene);
    if (scene === mainFloor) scene.events.once('shutdown', () => casinoGameHost.dispose());
    if (scene === lobby) {
      const migrating = store.needsMigration;
      if (persistLobby() && migrating && store.relocated) {
        const notice = document.getElementById('world-migration');
        notice.hidden = false;
        notice.textContent = 'Lobby artwork updated. Your previous position was obstructed; you have been moved to the nearest reachable floor. Your exact original world save is retained in its migration receipt.';
      }
    }
    refresh();
  };
  const sceneHost = {
    onAction: dispatch, isBlocked, onReady, onError: fail, hasFailed: () => failed,
    onBack: returnToParent,
    onManagement: () => document.getElementById('management-link').click(),
  };
  lobby = new LobbyScene(sceneHost, store.lobby);
  hotel = new HotelScene(sceneHost);
  mainFloor = new MainCasinoFloorScene(sceneHost);
  casino = new CasinoRoom({
    ...sceneHost,
    onProximity() {},
    onReady: () => onReady(casino),
  });
  for (const scene of [lobby, mainFloor, casino, hotel]) rooms.set(scene.sys.settings.key, scene);
  const resume = () => {
    interactHeld = false; awaitingRelease = false;
    if (!failed) activeScene().resumeWorld();
    unlockInteractionAt = performance.now() + 250;
    refresh();
  };
  overlay = new BlackjackOverlay({
    dialog,
    onOpen: () => { casino.setBlackjackOpen(true); casino.pauseWorld(); refresh(); },
    onClose: () => { casino.setBlackjackOpen(false); resume(); },
  });
  casinoGameHost = new CasinoGameHost({
    dialog: document.getElementById('casino-game-overlay'),
    onOpen: () => { casinoPose = { ...mainFloor.owner.snapshot() }; mainFloor.pauseWorld(); refresh(); },
    onClose: ({ resume: shouldResume }) => {
      if (!shouldResume || failed || current !== 'MainCasinoFloor' || !mainFloor.owner) return;
      mainFloor.owner.restore(casinoPose); casinoPose = null;
      document.getElementById('world-balance').textContent = CasinoWallet.get().toFixed(2);
      refreshResort(); resume();
    },
    onNavigate: () => document.getElementById('management-link').click(),
  });
  dialogue = new Dialogue({
    dialog: conversation,
    onOpen: () => { activeScene().pauseWorld(); refresh(); },
    onClose: resume,
  });
  interact.addEventListener('click', () => activeScene()?.interactions?.trigger({ pointer: true }));
  returnButton.addEventListener('click', returnToParent);
  window.addEventListener('keydown', event => { if (event.code === 'KeyE') interactHeld = true; }, true);
  window.addEventListener('keyup', event => { if (event.code === 'KeyE') { interactHeld = false; awaitingRelease = false; } }, true);
  host.addEventListener('focusout', () => { interactHeld = false; awaitingRelease = false; });
  const collisionButton = document.getElementById('world-collisions');
  collisionButton.hidden = !new URLSearchParams(location.search).has('debug');
  collisionButton.addEventListener('click', () => {
    if (!failed && activeScene()?.owner) activeScene().toggleCollisions?.();
    activeScene()?.owner?.focus();
  });
  const Phaser = window.Phaser;
  game = new Phaser.Game({
    type: Phaser.CANVAS, parent: host, width: LOBBY.width, height: LOBBY.height,
    backgroundColor: '#131d27',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    input: { keyboard: { target: host } },
    physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 0 }, debug: false } },
    audio: { noAudio: true }, scene: [lobby, casino, hotel, mainFloor],
  });
  game.events.on('poststep', refresh);
  if (new URLSearchParams(location.search).has('debug')) {
    window.CasinoWorldDebug = Object.freeze({ snapshot: () => ({
      ready, scene: current, failed, paused: game.scene.isPaused(current),
      player: activeScene()?.owner?.snapshot() ?? null,
      velocity: activeScene()?.player ? { x: activeScene().player.body.velocity.x, y: activeScene().player.body.velocity.y } : null,
      interaction: activeScene()?.owner ? activeScene().getInteraction() : null,
      returnPosition: { ...returnPosition }, overlayOpen: dialog.open, dialogueOpen: conversation.open,
      casinoGameHost: casinoGameHost.snapshot(),
      attraction: current === 'MainCasinoFloor' && mainFloor?.interactions ? (() => {
        const a = CASINO_ATTRACTIONS.find(a => a.id === mainFloor.getInteraction());
        return a ? { id: a.id, gameId: a.gameId, range: a.radius, position: { ...a.position }, approach: { ...a.approach } } : null;
      })() : null,
      ownerInput: { focused: Boolean(activeScene()?.owner?.hasFocus()), keyboardEnabled: Boolean(activeScene()?.input?.keyboard?.enabled),
        blocked: Boolean(isBlocked()), casinoPose: casinoPose && { ...casinoPose } },
      ownerVisual: activeScene()?.owner?.visual.snapshot() ?? null,
      ownerBody: activeScene()?.player ? {
        radius: activeScene().player.body.radius, width: activeScene().player.body.width,
        height: activeScene().player.body.height, isCircle: activeScene().player.body.isCircle,
        placeholderVisible: activeScene().player.visible,
      } : null,
      lobbyArtwork: lobby?.background ? { x: lobby.background.x, y: lobby.background.y,
        width: lobby.background.displayWidth, height: lobby.background.displayHeight,
        sourceWidth: lobby.background.texture.getSourceImage().width, sourceHeight: lobby.background.texture.getSourceImage().height,
        scaleMode: lobby.background.frame.source.scaleMode } : null,
      loungeArtwork: casino?.artworkSnapshot() ?? null,
      mainCasinoArtwork: mainFloor?.artworkSnapshot() ?? null,
      mainCasino: mainFloor?.owner ? mainFloor.geometrySnapshot() : null,
      roomDepartures: Object.fromEntries([...departures].map(([k,p]) => [k,{...p}])),
      awaitingRelease,
      roomLifecycle: Object.fromEntries([...rooms].map(([k,s]) => [k,{created:Boolean(s.owner),sleeping:game.scene.isSleeping(k),paused:game.scene.isPaused(k)}])),
      dealer: casino?.dealer?.snapshot() ?? null,
      receptionist: lobby?.receptionist?.snapshot() ?? null,
      guest: lobby?.guests?.snapshot() ?? null,
      guestTraffic: lobby?.guests?.snapshotAll() ?? null,
      receptionCounter: lobby?.foregrounds?.filter(layer => layer.id === 'reception-counter')
        .map(layer => ({ depth: layer.foreground.depth, baseline: layer.baseline })) ?? [],
      collisionsVisible: activeScene()?.collisionOverlay?.visible ?? false,
      lobbyForegrounds: lobby?.foregrounds?.map(layer => ({ baseline: layer.baseline, depth: layer.foreground.depth })) ?? [],
      loungeForegrounds: casino?.foregrounds?.map(layer => ({ baseline: layer.baseline, depth: layer.foreground.depth })) ?? [],
    }) });
  }
} catch (error) { fail(error); }
