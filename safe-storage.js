/* ============================================================
   SAFE STORAGE  —  load first on every page
   ------------------------------------------------------------
   The game keeps everything in localStorage. Some browsers block
   it (strict privacy settings, embedded iframes) and a full disk
   makes writes throw. Either used to crash every page.

   - Storage blocked: swap in an in-memory store so the game runs;
     progress lasts until the tab closes.
   - Storage full: writes that fail are kept in memory instead of
     throwing, so the session carries on.
   Either way window.CasinoStorage.persistent becomes false and
   the shell shows a "progress won't be saved" notice.
   ============================================================ */

(function () {
  const status = { persistent: true, reason: null };
  window.CasinoStorage = status;

  function memoryStorage(seed = {}) {
    const data = new Map(Object.entries(seed));
    return {
      get length() { return data.size; },
      key: i => [...data.keys()][i] ?? null,
      getItem: k => (data.has(String(k)) ? data.get(String(k)) : null),
      setItem: (k, v) => { data.set(String(k), String(v)); },
      removeItem: k => { data.delete(String(k)); },
      clear: () => data.clear(),
    };
  }

  // Probe each storage; a blocked one (reading it throws) is replaced with memory
  function probe(name, track) {
    let native = null;
    try {
      native = window[name];
      native.setItem('__casino_probe__', '1');
      native.removeItem('__casino_probe__');
      return native;
    } catch (err) {
      const blocked = !native || err?.name === 'SecurityError';
      if (track) { status.persistent = false; status.reason = blocked ? 'blocked' : 'full'; }
      if (!blocked) return native;
      const mem = memoryStorage();
      try { Object.defineProperty(window, name, { configurable: true, get: () => mem }); }
      catch (_) { /* can't replace; individual try/catch blocks still apply */ }
      return null;
    }
  }

  const local = probe('localStorage', true);
  probe('sessionStorage', false);

  // A failed write (storage full) never throws: the value is kept for this session instead
  try {
    const proto = window.Storage?.prototype;
    if (proto && !proto.__casinoSafe) {
      const realSet = proto.setItem;
      const realGet = proto.getItem;
      const realRemove = proto.removeItem;
      const overflow = new WeakMap();      // storage object → Map of values that didn't fit
      const spill = store => { if (!overflow.has(store)) overflow.set(store, new Map()); return overflow.get(store); };
      proto.setItem = function (key, value) {
        try {
          realSet.call(this, key, value);
          overflow.get(this)?.delete(String(key));
        } catch (_) {
          spill(this).set(String(key), String(value));
          if (this === local && status.persistent) {
            status.persistent = false;
            status.reason = 'full';
            window.dispatchEvent(new CustomEvent('casino:storage-unavailable', { detail: status }));
          }
        }
      };
      proto.getItem = function (key) {
        const kept = overflow.get(this);
        return kept?.has(String(key)) ? kept.get(String(key)) : realGet.call(this, key);
      };
      proto.removeItem = function (key) {
        overflow.get(this)?.delete(String(key));
        try { realRemove.call(this, key); } catch (_) { /* nothing to remove */ }
      };
      proto.__casinoSafe = true;
    }
  } catch (_) { /* leave native behaviour */ }
})();
