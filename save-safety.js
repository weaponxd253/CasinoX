/* Read-only validation shared by the title, world and legacy persistence APIs.
   No migrations, resets, backups or writes happen in this module. */
const CasinoSaveSafety = (() => {
  const scriptUrl = document.currentScript?.src || new URL('save-safety.js', location.href).href;
  const keys = ['hotelGameState', 'casinoBalance', 'casinoProfile', 'hotelGuestPool'];
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const nonnegative = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
  let errorDialog;

  function validateHotel(value) {
    if (!object(value)) throw new Error('Hotel save must contain an object.');
    const version = value.meta?.version ?? 0;
    if (!Number.isInteger(version) || version < 0 || version > 9) {
      throw new Error(`Hotel save version ${version} is unsupported (maximum 9).`);
    }
    if (value.meta !== undefined && !object(value.meta)) throw new Error('Hotel save metadata is malformed.');
    if (!object(value.currencies) || !nonnegative(value.currencies.hotelCash)) {
      throw new Error('Hotel operating cash is malformed.');
    }
    if (!object(value.departments)) throw new Error('Hotel departments are malformed.');
    for (const id of ['lobby', 'casino', 'rooms', 'restaurant', 'bar', 'entertainment', 'spa']) {
      const dept = value.departments[id];
      if (!object(dept) || typeof dept.unlocked !== 'boolean' || !Number.isInteger(dept.level) || dept.level < 0) {
        throw new Error(`Hotel department ${id} is malformed.`);
      }
    }
    if (!object(value.ticker) || !nonnegative(value.ticker.lastTick)
      || !object(value.satisfaction) || !nonnegative(value.satisfaction.current)
      || !object(value.stats)) throw new Error('Hotel save is missing valid simulation data.');
  }

  function inspectKey(key, storage = localStorage) {
    let raw;
    try {
      raw = storage.getItem(key);
      if (raw === null) return { key, present: false, valid: true, value: null };
      const value = key === 'casinoBalance' ? Number(raw) : JSON.parse(raw);
      if (key === 'casinoBalance' && (!raw.trim() || !nonnegative(value))) {
        throw new Error('Casino chip balance is malformed.');
      }
      if (key === 'hotelGameState') validateHotel(value);
      if (key === 'casinoProfile') {
        if (object(value) && value.version !== undefined && value.version !== 0) {
          throw new Error(`Casino profile version ${value.version} is unsupported (expected an unversioned profile).`);
        }
        if (!object(value) || (value.xp !== undefined && !nonnegative(value.xp))
          || (value.streak !== undefined && !nonnegative(value.streak))
          || (value.lastClaim != null && typeof value.lastClaim !== 'string')) {
          throw new Error('Casino profile is malformed.');
        }
      }
      if (key === 'hotelGuestPool') {
        if (!object(value)) throw new Error('Guest pool is malformed.');
        const version = value.version ?? 0;
        if (!Number.isInteger(version) || version < 0 || version > 1) {
          throw new Error(`Guest pool version ${version} is unsupported (maximum 1).`);
        }
        if (!['pool', 'activeGuests', 'guestHistory'].every(name => Array.isArray(value[name]))) {
          throw new Error('Guest pool collections are malformed.');
        }
      }
      return { key, present: true, valid: true, value };
    } catch (error) {
      return { key, present: raw !== null, valid: false, error: `${key}: ${error.message}` };
    }
  }

  function inspectLegacy(storage = localStorage) {
    const entries = keys.map(key => inspectKey(key, storage));
    return { available: entries.some(entry => entry.present), errors: entries.filter(entry => !entry.valid).map(entry => entry.error) };
  }

  function report(message) {
    const render = () => {
      if (errorDialog?.isConnected) return;
      errorDialog = document.createElement('dialog');
      errorDialog.id = 'save-error-dialog';
      errorDialog.setAttribute('aria-labelledby', 'save-error-title');
      errorDialog.style.cssText = 'margin:auto;max-width:540px;width:92vw;padding:28px;border:1px solid #c9a84c;border-radius:12px;background:#111c24;color:#f5ead5;font:17px/1.6 Georgia,serif;';
      const title = document.createElement('h2');
      title.id = 'save-error-title';
      title.textContent = 'Saved data needs attention';
      const detail = document.createElement('p');
      detail.textContent = `${message} Nothing has been reset or replaced. Restore a compatible backup before using this page.`;
      const link = document.createElement('a');
      link.href = new URL('index.html', scriptUrl).href;
      link.textContent = 'Return to title';
      link.style.color = '#e8cb80';
      errorDialog.append(title, detail, link);
      errorDialog.addEventListener('cancel', event => event.preventDefault());
      document.body.append(errorDialog);
      errorDialog.showModal();
    };
    if (document.body) render();
    else document.addEventListener('DOMContentLoaded', render, { once: true });
  }

  function fail(message) {
    report(message);
    return new Error(message);
  }

  function assertReadable(key) {
    const result = inspectKey(key);
    if (!result.valid) throw fail(result.error);
    return result.value;
  }

  function assertLegacy() {
    const { errors } = inspectLegacy();
    if (errors.length) throw fail(errors.join(' '));
  }

  window.addEventListener('storage', event => {
    if (keys.includes(event.key)) {
      const result = inspectKey(event.key);
      if (!result.valid) report(result.error);
    }
  });
  return { inspectKey, inspectLegacy, assertReadable, assertLegacy, fail };
})();
window.CasinoSaveSafety = CasinoSaveSafety;
