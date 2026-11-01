// Optional same-origin host lifecycle. This file observes existing game state;
// it never chooses outcomes, places bets, pays winnings or refunds a wager.
(() => {
  const query = new URLSearchParams(location.search);
  if (window.parent === window || query.get('embed') !== 'casino' || !query.get('visit')) return;
  const gameId = location.pathname.split('/').at(-2);
  if (!['roulette', 'slots', 'coinflip'].includes(gameId)) return;
  const expectedParent = new URL('../world/index.html', location.href);
  const localFile = location.protocol === 'file:';
  try {
    const actual = new URL(parent.location.href);
    if (actual.protocol !== expectedParent.protocol || actual.host !== expectedParent.host
      || decodeURIComponent(actual.pathname) !== decodeURIComponent(expectedParent.pathname)) return;
  } catch (_) { return; }
  const visit = query.get('visit'), channel = 'casino-world:game', version = 1;
  const abort = new AbortController();
  let initialized = false, active = false, fault = null, frozen = false, observer;
  let lastState = '', escapeUntil = 0, forwardingEscape = false;
  document.documentElement.dataset.casinoEmbed = '';
  const send = (type, extra = {}) => parent.postMessage({ channel, version, visit, gameId, type, ...extra }, localFile ? '*' : location.origin);
  const modal = () => document.querySelector('.shell-modal.open');

  function snapshot() {
    try {
      const storageHealthy = window.CasinoStorage?.persistent !== false
        && window.CasinoWallet?.get() === parent.CasinoWallet?.get();
      let roundActive, autoActive = false, potPending = false;
      if (gameId === 'roulette') roundActive = spinning;
      else if (gameId === 'slots') { roundActive = spinning; autoActive = auto !== null; }
      else { roundActive = flipping; potPending = pot > 0; }
      const known = initialized && typeof roundActive === 'boolean';
      let reason = '';
      if (fault) reason = fault;
      else if (!storageHealthy) reason = 'The shared wallet is unavailable. Keep this game open; new wagers are blocked.';
      else if (autoActive) reason = 'Stop Auto-spin in the game, then let the current spin finish before returning.';
      else if (roundActive) reason = 'Let the current round finish before returning to the casino.';
      else if (potPending) reason = 'Cash out your pot in the game before returning to the casino.';
      return { known, storageHealthy, roundActive: Boolean(roundActive), autoActive, potPending,
        canClose: Boolean(known && storageHealthy && !fault && !roundActive && !autoActive && !potPending),
        shellModal: Boolean(modal()), escapeConsumed: performance.now() < escapeUntil,
        locked: gameId === 'roulette' && Boolean(document.getElementById('rt-lock') && !document.getElementById('rt-lock').hidden), reason };
    } catch (_) {
      return { known: false, storageHealthy: false, canClose: false, reason: 'The game could not confirm its current state.' };
    }
  }
  window.CasinoGameBridge = Object.freeze({ snapshot });
  function notify() {
    if (!initialized || frozen) return;
    const state = snapshot(), encoded = JSON.stringify(state);
    if (encoded !== lastState) { lastState = encoded; send('state', { state }); }
  }
  function prepareChrome() {
    document.querySelectorAll('[data-menu="import"]').forEach(input => {
      if (!input.disabled) input.disabled = true;
      const label = input.closest('label'); if (label && !label.hidden) label.hidden = true;
    });
  }
  function ready() {
    try {
      if (!window.CasinoShell?.wallet || !window.CasinoWallet || !document.querySelector('main')) throw Error('The game interface could not initialize.');
      CasinoShell.refreshProfile(); initialized = true;
      const state = snapshot(); if (!state.known) throw Error(state.reason);
      prepareChrome(); send('ready', { state });
    } catch (error) { send('error', { reason: error.message }); }
  }
  function requestReturn(destination = null) { send('request-close', { destination }); }
  function forwardOriginalEscape() {
    escapeUntil = performance.now() + 350; forwardingEscape = true;
    try { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true })); }
    finally { forwardingEscape = false; queueMicrotask(notify); }
  }
  window.addEventListener('message', event => {
    const d = event.data;
    if (event.source !== parent || (localFile ? !['null','file://'].includes(event.origin) : event.origin !== location.origin)
      || d?.channel !== channel || d.version !== version || d.visit !== visit || d.gameId !== gameId) return;
    if (d.type === 'host-ready' && !initialized) {
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready, { once: true }); else ready();
    } else if (d.type === 'activate' && initialized && !fault) {
      active = true; document.body.tabIndex = -1; document.body.focus({ preventScroll: true }); notify();
    } else if (d.type === 'escape') {
      if (performance.now() < escapeUntil) return;
      if (modal() || snapshot().autoActive) forwardOriginalEscape(); else requestReturn();
    } else if (d.type === 'close-check' && typeof d.requestId === 'string') {
      const state = snapshot();
      // Freeze input before acknowledging. The parent can now tear down only
      // this safe document; no later click can start a wager in the gap.
      if (state.canClose) { frozen = true; active = false; }
      send('close-reply', { requestId: d.requestId, accepted: state.canClose, state });
    }
  }, { signal: abort.signal });

  function guardInput(event) {
    if (forwardingEscape) return;
    if (event.type === 'keydown' && event.key === 'Escape') {
      if (event.repeat) { event.preventDefault(); return; }
      if (modal() || snapshot().autoActive) { escapeUntil = performance.now() + 350; queueMicrotask(notify); return; }
      event.preventDefault(); event.stopImmediatePropagation(); requestReturn(); return;
    }
    const state = snapshot();
    // Storage failure blocks new paid inputs. Keep original Stop/cash-out and
    // save-export controls available; never invent a balance reconciliation.
    const recoveryControl = event.target.closest?.('#autospin-stop,#cash-out,[data-menu="export"],[data-shell-menu],#shell-menu-link,.shell-modal-close,.shell-info-close');
    if (!active || frozen || ((!state.storageHealthy || fault) && !recoveryControl)) {
      event.preventDefault(); event.stopImmediatePropagation(); return;
    }
    if (event.type === 'change' && event.target.matches?.('[data-menu="import"]')) {
      event.preventDefault(); event.stopImmediatePropagation(); return;
    }
    if (event.type === 'click') {
      const link = event.target.closest?.('a[href]');
      if (link && link.target !== '_blank') {
        event.preventDefault(); event.stopImmediatePropagation();
        const url = new URL(link.href);
        requestReturn(url.origin === location.origin && url.pathname === expectedParent.pathname.replace('/world/index.html','/hotel/index.html') ? 'management' : null);
        return;
      }
    }
    queueMicrotask(notify);
  }
  for (const type of ['keydown','click','change']) document.addEventListener(type, guardInput, { capture: true, signal: abort.signal });
  window.addEventListener('casino:storage-unavailable', notify, { signal: abort.signal });
  window.addEventListener('error', () => { fault = 'The game reported an error. Its document has been kept open to protect any unfinished wager.'; notify(); }, { signal: abort.signal });
  window.addEventListener('unhandledrejection', () => { fault = 'The game could not complete an operation. Its document has been kept open.'; notify(); }, { signal: abort.signal });
  const boot = () => {
    ready();
    observer = new MutationObserver(() => { prepareChrome(); notify(); });
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden','disabled','class'] });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
  window.addEventListener('pagehide', () => { observer?.disconnect(); abort.abort(); }, { once: true });
})();
