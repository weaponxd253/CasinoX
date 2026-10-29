import { LOBBY, walkable } from './lobby-config.js';
import { LOBBY_ART } from './lobby-layout.js';
import { validLegacyPosition } from './legacy-lobby-layout.js';
import { nearestReachable } from './lobby-navigation.js';

export const WORLD_KEY = 'casinoWorldState';
export const WORLD_VERSION = 2;
const facings = ['up', 'down', 'left', 'right'];

function metadataValid(state) {
  return state && facings.includes(state.lobby?.facing)
    && Number.isFinite(state.updatedAt) && state.updatedAt >= 0;
}
function validV1(state) { return state?.version === 1 && metadataValid(state) && validLegacyPosition(state.lobby); }

function validateReceipt(receipt) {
  if (receipt === undefined) return;
  if (!receipt || receipt.sourceVersion !== 1 || receipt.layout !== LOBBY_ART.layout
    || typeof receipt.originalRaw !== 'string' || typeof receipt.relocated !== 'boolean'
    || !Number.isFinite(receipt.migratedAt) || receipt.migratedAt < 0 || !validV1(JSON.parse(receipt.originalRaw))) {
    throw new Error('World migration receipt is invalid.');
  }
}

// Read-only, including v1 compatibility. Loading the title never migrates a save.
export function readWorldState(storage = localStorage) {
  let raw = null;
  try {
    raw = storage.getItem(WORLD_KEY);
    if (raw === null) return { present: false, valid: true, raw, state: null };
    const state = JSON.parse(raw);
    if (!state || ![1, WORLD_VERSION].includes(state.version)) {
      throw new Error(`World save version ${state?.version ?? 'missing'} is unsupported (expected 1 or 2).`);
    }
    if (state.version === 1) {
      if (!validV1(state)) throw new Error('World save has an invalid legacy lobby position or metadata.');
    } else {
      if (state.layout !== LOBBY_ART.layout) throw new Error('World save lobby layout is unsupported.');
      if (!metadataValid(state) || !walkable(state.lobby)) throw new Error('World save has an invalid lobby position or metadata.');
      validateReceipt(state.migrationReceipt);
    }
    return { present: true, valid: true, raw, state };
  } catch (error) {
    return { present: raw !== null, valid: false, raw, state: null, error: `casinoWorldState: ${error.message}` };
  }
}

export function saveAvailability(storage = localStorage) {
  const legacy = CasinoSaveSafety.inspectLegacy(storage);
  const world = readWorldState(storage);
  const errors = [...legacy.errors, ...(world.valid ? [] : [world.error])];
  return { available: legacy.available || world.present, errors, canContinue: (legacy.available || world.present) && !errors.length };
}

export class WorldState {
  constructor(storage = localStorage) {
    this.storage = storage;
    const availability = saveAvailability(storage);
    if (availability.errors.length) throw new Error(availability.errors.join(' '));
    const world = readWorldState(storage);
    if (!world.valid) throw new Error(world.error);
    this.expectedRaw = world.raw;
    this.state = world.state;
    this.needsMigration = this.state?.version === 1;
    const original = this.state?.lobby ?? LOBBY.spawn;
    this.relocated = this.needsMigration && !walkable(original);
    this.resolvedLobby = this.relocated ? nearestReachable(original) : { ...original };
  }

  get lobby() { return { ...this.resolvedLobby }; }

  save(lobby) {
    if (!walkable(lobby) || !facings.includes(lobby.facing)) throw new Error('Cannot save an invalid lobby position.');
    const availability = saveAvailability(this.storage);
    if (availability.errors.length) throw new Error(availability.errors.join(' '));
    if (this.storage.getItem(WORLD_KEY) !== this.expectedRaw) {
      throw new Error('Your world save changed in another tab. Reload to continue; no position was overwritten.');
    }
    const state = { ...this.state, version: WORLD_VERSION, layout: LOBBY_ART.layout,
      lobby: { ...this.state?.lobby, ...lobby }, updatedAt: Date.now() };
    if (this.needsMigration) state.migrationReceipt = {
      sourceVersion: 1, layout: LOBBY_ART.layout, originalRaw: this.expectedRaw,
      relocated: this.relocated, migratedAt: Date.now(),
    };
    const raw = JSON.stringify(state);
    // One atomic key write: original payload, receipt and new position commit together.
    this.storage.setItem(WORLD_KEY, raw);
    this.expectedRaw = raw;
    this.state = state;
    this.resolvedLobby = { ...state.lobby };
    this.needsMigration = false;
    return state;
  }
}
