import { ROOM } from './room-config.js';
import { BlackjackOverlay } from './blackjack-overlay.js';

const status = document.getElementById('floor-status');
const interact = document.getElementById('interact-button');
const host = document.getElementById('floor-canvas');
const dialog = document.getElementById('blackjack-overlay');
const balance = document.getElementById('floor-balance');
let room;
let game;
let failed = false;
function fail(error) {
  failed = true;
  room?.owner?.stop();
  if (room?.sys) {
    room.input.keyboard.enabled = false;
    const pause = () => game.scene.pause(room);
    if (room.sys.getStatus() === window.Phaser.Scenes.CREATING) room.events.once('create', pause);
    else if (room.sys.isActive()) pause();
  }
  interact.disabled = true;
  host.setAttribute('aria-busy', 'false');
  status.textContent = `${error.message} You can still use the classic Blackjack X link below.`;
  console.error('Casino floor:', error);
}
CasinoWallet.onChange(value => { balance.textContent = value.toFixed(2); });

try {
  if (!window.Phaser) throw new Error('Phaser could not load.');
  const { CasinoRoom } = await import('./room-scene.js');
  room = new CasinoRoom({
    onError: fail, hasFailed: () => failed,
    onInteract: () => openTable(),
    onProximity: near => {
      if (failed) return;
      interact.disabled = !near;
      status.textContent = near ? [room.dealer.greeting, 'Press E to play blackjack'].filter(Boolean).join(' · ')
        : 'Walk up to the blackjack table';
    },
    onReady: () => {
      host.setAttribute('aria-busy', 'false');
      status.textContent = 'Walk up to the blackjack table';
      room.focusCanvas();
    },
  });
  const overlay = new BlackjackOverlay({
    dialog,
    onOpen: () => {
      room.setBlackjackOpen(true);
      room.pauseWorld();
      status.textContent = 'At the blackjack table · floor paused';
    },
    onClose: () => {
      room.setBlackjackOpen(false);
      if (failed) return;
      room.resumeWorld();
      status.textContent = 'Press E to play blackjack';
    },
  });
  const openTable = () => {
    if (!interact.disabled && room.isNearTable()) overlay.open();
  };
  interact.addEventListener('click', openTable);
  const collisionButton = document.getElementById('floor-collisions');
  collisionButton.hidden = !new URLSearchParams(location.search).has('debug');
  collisionButton.addEventListener('click', () => { if (room.owner && !failed) { room.toggleCollisions(); room.focusCanvas(); } });

  const Phaser = window.Phaser;
  game = new Phaser.Game({
    // Keep the existing canvas runtime and its nearest-neighbor sprite rendering.
    type: Phaser.CANVAS,
    parent: host,
    width: ROOM.width,
    height: ROOM.height,
    backgroundColor: '#131d27',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    input: { keyboard: { target: host } },
    physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 0 }, debug: false } },
    audio: { noAudio: true },
    scene: [room],
  });

  // Read-only diagnostics for repeatable tests; no teleport or wallet shortcuts.
  if (new URLSearchParams(location.search).has('debug')) {
    window.CasinoFloorDebug = Object.freeze({
      snapshot: () => ({
        ready: Boolean(room.player), failed,
        paused: game.scene.isPaused('CasinoRoom'),
        player: room.player ? { x: room.player.x, y: room.player.y } : null,
        velocity: room.player ? { x: room.player.body.velocity.x, y: room.player.body.velocity.y } : null,
        nearTable: room.player ? room.isNearTable() : false,
        balance: CasinoWallet.get(),
        ownerFacing: room.owner?.facing ?? null,
        dealer: room.dealer?.snapshot() ?? null,
        loungeArtwork: room.artworkSnapshot(),
        collisionsVisible: room.collisionOverlay?.visible ?? false,
        loungeForegrounds: room.foregrounds?.map(layer => ({ baseline: layer.baseline, depth: layer.foreground.depth })) ?? [],
        ownerVisual: room.owner?.visual.snapshot() ?? null,
        ownerBody: room.player ? {
          radius: room.player.body.radius, width: room.player.body.width, height: room.player.body.height,
          isCircle: room.player.body.isCircle, placeholderVisible: room.player.visible,
        } : null,
      }),
    });
  }
} catch (error) { fail(error); }
