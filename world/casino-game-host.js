// UI/lifetime only. Existing game documents own all wagers, rewards and settlement.
export const CASINO_GAMES = Object.freeze({
  roulette: { title: 'Roulette Royale', path: 'roulette/index.html' },
  slots: { title: 'Lucky Reels', path: 'slots/index.html' },
  coinflip: { title: 'Coin Flip', path: 'coinflip/index.html' },
});
const CHANNEL = 'casino-world:game';
const VERSION = 1;

export class CasinoGameHost {
  constructor({ dialog, onOpen, onClose, onNavigate = () => {}, timeoutMs = 10000 }) {
    Object.assign(this, { dialog, onOpen, onClose, onNavigate, timeoutMs });
    this.content = dialog.querySelector('[data-game-content]');
    this.status = dialog.querySelector('[role="status"]');
    this.title = dialog.querySelector('[data-game-title]');
    this.button = dialog.querySelector('[data-game-close]');
    this.abort = new AbortController();
    this.phase = 'closed'; this.created = 0; this.destroyed = 0; this.requestSequence = 0;
    this.button.addEventListener('click', () => this.requestClose(), { signal: this.abort.signal });
    dialog.addEventListener('cancel', event => { event.preventDefault(); this.escape(); }, { signal: this.abort.signal });
    dialog.addEventListener('close', () => {
      // Native/programmatic close cannot discard a possibly paid document.
      if (this.isOpen && !dialog.open) { dialog.showModal(); this.requestClose(); }
    }, { signal: this.abort.signal });
    window.addEventListener('message', event => this.receive(event), { signal: this.abort.signal });
  }

  open(gameId, attractionId) {
    if (this.isOpen || this.disposed || !CASINO_GAMES[gameId]) return false;
    this.isOpen = true; this.phase = 'loading'; this.gameId = gameId; this.attractionId = attractionId;
    this.visit = crypto.randomUUID(); this.everReady = false; this.frameLoads = 0; this.state = null; this.error = null;
    this.title.textContent = CASINO_GAMES[gameId].title + (gameId === 'slots' ? ` · Machine ${attractionId.slice(-1)}` : '');
    this.status.textContent = 'Loading the game…'; this.button.disabled = false;
    this.onOpen({ gameId, attractionId });
    document.body.classList.add('casino-game-open'); this.dialog.showModal();
    const frame = document.createElement('iframe');
    frame.title = CASINO_GAMES[gameId].title; frame.inert = true; frame.allow = 'autoplay';
    frame.id = 'casino-game-frame'; this.frame = frame; this.created++;
    this.frameAbort = new AbortController();
    frame.addEventListener('load', () => {
      if (!this.expectedDocument()) { this.fail('The game navigated to an unexpected page.'); return; }
      if (++this.frameLoads > 1 && this.everReady) { this.fail('The game document reloaded unexpectedly.'); return; }
      this.send('host-ready');
    }, { signal: this.frameAbort.signal });
    frame.addEventListener('error', () => this.fail('The game could not load.'), { signal: this.frameAbort.signal });
    this.url = new URL(`../${CASINO_GAMES[gameId].path}`, import.meta.url);
    this.url.searchParams.set('embed', 'casino'); this.url.searchParams.set('visit', this.visit);
    frame.src = this.url.href; this.content.replaceChildren(frame);
    this.loadTimer = setTimeout(() => this.fail('The game did not finish loading. Return to the casino and try again.'), this.timeoutMs);
    return true;
  }

  expectedDocument() {
    try { return this.frame?.contentWindow.location.href === this.url.href; } catch (_) { return false; }
  }
  acceptsOrigin(origin) {
    return location.protocol === 'file:' ? ['null', 'file://'].includes(origin) && this.expectedDocument() : origin === location.origin;
  }
  send(type, extra = {}) {
    this.frame?.contentWindow?.postMessage({ channel: CHANNEL, version: VERSION, gameId: this.gameId,
      visit: this.visit, type, ...extra }, location.protocol === 'file:' ? '*' : location.origin);
  }
  readState() {
    if (!this.expectedDocument()) return null;
    try { return this.frame.contentWindow.CasinoGameBridge?.snapshot() ?? this.state; } catch (_) { return null; }
  }
  hasUnresolved() {
    if (!this.isOpen || !this.everReady) return false;
    const s = this.readState(); return s?.known !== true || s.canClose !== true;
  }
  receive(event) {
    const d = event.data;
    if (!this.isOpen || event.source !== this.frame?.contentWindow || !this.acceptsOrigin(event.origin)
      || !this.expectedDocument() || d?.channel !== CHANNEL || d.version !== VERSION
      || d.gameId !== this.gameId || d.visit !== this.visit) return;
    if (d.type === 'ready') {
      if (this.everReady || this.phase === 'failed') return;
      if (d.state?.known !== true || d.state.storageHealthy !== true) { this.fail(d.state?.reason || 'The shared wallet is unavailable.'); return; }
      clearTimeout(this.loadTimer); this.loadTimer = null;
      this.everReady = true; this.phase = 'open'; this.state = d.state;
      this.frame.inert = false; this.send('activate'); this.updateStatus();
    } else if (d.type === 'state' && this.everReady) {
      this.state = d.state; this.updateStatus();
      if (this.disposing && d.state?.known === true && d.state.canClose === true) this.requestClose();
    } else if (d.type === 'error') this.fail(d.reason || 'The game reported an error.');
    else if (d.type === 'request-close') this.requestClose(d.destination);
    else if (d.type === 'close-reply' && this.pendingClose?.id === d.requestId) {
      this.state = d.state;
      const pending = this.pendingClose; this.pendingClose = null; clearTimeout(this.closeTimer); this.closeTimer = null;
      if (d.accepted === true && d.state?.known === true && d.state.canClose === true) {
        this.finishClose(pending.destination); pending.resolve(true);
      } else { this.phase = this.error ? 'failed' : 'open'; this.updateStatus(); pending.resolve(false); }
    }
  }
  updateStatus() {
    if (this.error) { this.status.textContent = this.error; return; }
    this.status.textContent = this.state?.reason || 'Play the existing game, then return to the casino.';
  }
  fail(message) {
    clearTimeout(this.loadTimer); this.loadTimer = null; this.error = message; this.phase = 'failed';
    // Before ready the frame has never accepted user input. After ready keep it
    // alive: an error is not evidence that its wager has settled.
    this.status.textContent = message;
    if (!this.everReady && this.frame) this.frame.inert = true;
  }
  escape() {
    const s = this.readState();
    if (s?.escapeConsumed) return;
    if (s?.shellModal || s?.autoActive) this.send('escape');
    else this.requestClose();
  }
  requestClose(destination = null) {
    if (!this.isOpen) return Promise.resolve(true);
    if (this.pendingClose) return this.pendingClose.promise;
    if (!this.everReady) { this.finishClose(destination); return Promise.resolve(true); }
    let resolve;
    const promise = new Promise(r => { resolve = r; });
    const id = `${this.visit}:${++this.requestSequence}`;
    this.pendingClose = { id, promise, resolve, destination: destination === 'management' ? destination : null };
    this.phase = 'closing'; this.status.textContent = 'Checking that the game can safely close…';
    this.send('close-check', { requestId: id });
    this.closeTimer = setTimeout(() => {
      if (this.pendingClose?.id !== id) return;
      this.pendingClose = null; this.closeTimer = null; this.phase = 'failed';
      this.status.textContent = 'The game could not confirm a safe return. Its document has been kept open.';
      resolve(false);
    }, 3000);
    return promise;
  }
  finishClose(destination) {
    if (!this.isOpen) return;
    this.isOpen = false; clearTimeout(this.loadTimer); clearTimeout(this.closeTimer);
    this.loadTimer = this.closeTimer = null;
    this.frameAbort?.abort(); this.frame?.remove(); if (this.frame) this.destroyed++;
    this.frame = null; this.state = null; this.phase = 'closed';
    this.dialog.close(); document.body.classList.remove('casino-game-open');
    this.onClose({ resume: !this.disposing });
    if (destination === 'management' && !this.disposing) this.onNavigate('management');
    if (this.disposing) { this.abort.abort(); this.disposed = true; }
  }
  dispose() {
    this.disposing = true;
    if (!this.isOpen) { this.abort.abort(); this.disposed = true; return Promise.resolve(true); }
    return this.requestClose();
  }
  snapshot() {
    const s = this.isOpen ? this.readState() : null;
    return { phase: this.phase, open: Boolean(this.isOpen), gameId: this.isOpen ? this.gameId : null,
      attractionId: this.isOpen ? this.attractionId : null, ready: Boolean(this.isOpen && this.everReady),
      roundActive: s?.roundActive ?? null, autoActive: s?.autoActive ?? null, potPending: s?.potPending ?? null,
      canClose: this.isOpen ? (this.everReady ? Boolean(s?.canClose) : true) : true,
      storageHealthy: s?.storageHealthy ?? null, error: this.error,
      created: this.created, destroyed: this.destroyed, liveFrames: this.frame ? 1 : 0,
      parentListeners: this.disposed ? 0 : 4, loadTimerActive: Boolean(this.loadTimer),
      closeRequestPending: Boolean(this.pendingClose), disposing: Boolean(this.disposing) };
  }
}
