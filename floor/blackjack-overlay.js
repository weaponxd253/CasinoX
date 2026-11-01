// The existing page owns all rules, bets and payouts. This controller only
// manages the DOM overlay and the lifetime of its same-origin iframe.
export class BlackjackOverlay {
  constructor({ dialog, onOpen, onClose }) {
    this.dialog = dialog;
    this.frame = dialog.querySelector('iframe');
    this.onOpen = onOpen;
    this.onClose = onClose;
    this.status = dialog.querySelector('[role="status"]');
    dialog.querySelector('[data-close]').addEventListener('click', () => this.close());
    dialog.addEventListener('cancel', event => {
      event.preventDefault();
      this.close();
    });
    dialog.addEventListener('close', () => {
      // A queued close from the previous visit must not resume a reopened room.
      if (!dialog.open) this.finishClose();
    });
    this.frame.addEventListener('load', () => this.requestReady());
    window.addEventListener('message', event => {
      if (event.source !== this.frame.contentWindow || !this.acceptsOrigin(event.origin)) return;
      if (event.data?.channel !== 'casino-floor:blackjack') return;
      if (event.data.type === 'close') this.close();
      if (event.data.type === 'ready') {
        this.frame.inert = false;
        this.status.textContent = 'Your hand stays at this table when you return to the floor.';
      }
    });
  }

  acceptsOrigin(origin) {
    if (location.protocol !== 'file:') return origin === location.origin;
    // Local-file origin strings vary between embedded browsers and message
    // events. Require the actual readable table URL as well as its WindowProxy;
    // never accept arbitrary opaque-origin frames on an HTTP page.
    if (origin !== 'null' && origin !== 'file://') return false;
    try {
      const actual = new URL(this.frame.contentWindow.location.href);
      const expected = new URL('../blackjack/index.html', location.href);
      return actual.protocol === 'file:' && actual.host === expected.host
        && decodeURIComponent(actual.pathname) === decodeURIComponent(expected.pathname)
        && actual.searchParams.get('embed') === 'floor';
    } catch (_) { return false; }
  }

  requestReady() {
    if (!this.frame.hasAttribute('src')) return;
    // File URLs cannot use a reliable serialized target origin. This probe
    // contains no state; replies still require the exact expected frame/URL.
    this.frame.contentWindow.postMessage({ channel: 'casino-floor:blackjack', type: 'host-ready' },
      location.protocol === 'file:' ? '*' : location.origin);
  }

  open() {
    if (this.dialog.open) return;
    this.isOpen = true;
    this.frame.inert = true;
    this.onOpen();
    document.body.classList.add('blackjack-open');
    this.dialog.showModal();
    // Load once. Never remove or reload this frame on close, including mid-hand.
    if (!this.frame.hasAttribute('src')) {
      this.frame.src = '../blackjack/index.html?embed=floor';
    } else this.requestReady();
  }

  close() {
    if (!this.dialog.open) return;
    this.dialog.close();
    // Native close events are queued. Resume immediately so a fresh movement
    // key cannot be swallowed by a later focus/input reset.
    this.finishClose();
  }

  finishClose() {
    if (!this.isOpen) return;
    this.isOpen = false;
    document.body.classList.remove('blackjack-open');
    this.onClose();
  }
}
