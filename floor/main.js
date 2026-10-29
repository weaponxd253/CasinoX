import { ROOM } from './room-config.js';
import { BlackjackOverlay } from './blackjack-overlay.js';

const status = document.getElementById('floor-status');
const interact = document.getElementById('interact-button');
const host = document.getElementById('floor-canvas');
const dialog = document.getElementById('blackjack-overlay');
const balance = document.getElementById('floor-balance');
CasinoWallet.onChange(value => { balance.textContent = value.toFixed(2); });

try {
  if (!window.Phaser) throw new Error('Phaser could not load.');
  const { CasinoRoom } = await import('./room-scene.js');
  const room = new CasinoRoom({
    onInteract: () => openTable(),
    onProximity: near => {
      interact.disabled = !near;
      status.textContent = near ? 'Press E to play blackjack' : 'Walk up to the blackjack table';
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
      room.pauseWorld();
      status.textContent = 'At the blackjack table · floor paused';
    },
    onClose: () => {
      room.resumeWorld();
      status.textContent = 'Press E to play blackjack';
    },
  });
  const openTable = () => {
    if (!interact.disabled && room.isNearTable()) overlay.open();
  };
  interact.addEventListener('click', openTable);

  const Phaser = window.Phaser;
  const game = new Phaser.Game({
    // This small vector room needs no WebGL pipeline or GPU assets.
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
        ready: Boolean(room.player),
        paused: game.scene.isPaused('CasinoRoom'),
        player: room.player ? { x: room.player.x, y: room.player.y } : null,
        velocity: room.player ? { x: room.player.body.velocity.x, y: room.player.body.velocity.y } : null,
        nearTable: room.player ? room.isNearTable() : false,
        balance: CasinoWallet.get(),
        ownerVisual: room.owner?.visual.snapshot() ?? null,
        ownerBody: room.player ? {
          radius: room.player.body.radius, width: room.player.body.width, height: room.player.body.height,
          isCircle: room.player.body.isCircle, placeholderVisible: room.player.visible,
        } : null,
      }),
    });
  }
} catch (error) {
  host.setAttribute('aria-busy', 'false');
  status.textContent = 'The room could not load. You can still play using the Blackjack link below.';
  console.error('Casino floor:', error);
}
