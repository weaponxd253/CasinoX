/* ============================================================
   CASINO X — DEV TOOLS  (global: CasinoDevTools)
   ------------------------------------------------------------
   Testing shortcuts, loaded by casino-shell.js only while dev
   mode is on (?dev=1; ?dev=0 turns it off). Click the DEV MODE
   badge to open the panel. Hotel tools appear on pages that
   load the hotel scripts (the hotel lobby and its mini-games).
   ============================================================ */

const CasinoDevTools = (() => {
  const hasHotel = () => !!window.HotelState?.get?.();

  /* Recompute derived hotel stats, persist, and let open UIs re-render. */
  function afterHotelChange() {
    const state = HotelState.get();
    window.HotelEngine?.recalculateReputation?.(state);
    window.HotelEngine?.recalculateSatisfaction?.(state);
    window.HotelBridge?.applyHotelToCasino?.(state);
    HotelState.saveNow?.();
    window.dispatchEvent(new CustomEvent('hotel:state-synced'));
  }

  function setDeptLevels(levelFor) {
    const state = HotelState.get();
    for (const [id, dept] of Object.entries(state.departments)) {
      const catalog = HotelConfig.UPGRADE_CATALOG[id];
      if (!catalog?.length) { dept.unlocked = true; continue; }
      dept.unlocked = true;
      dept.level = Math.max(dept.level ?? 0, levelFor(catalog));
    }
    afterHotelChange();
  }

  const ACTIONS = [
    { group: 'Casino', label: '+$1,000 chips', run: () => CasinoWallet.add(1000) },
    { group: 'Casino', label: 'Bankroll to $0', run: () => CasinoWallet.set(0) },
    {
      group: 'Casino', label: '+1 casino level',
      run: () => { const p = CasinoShell.profile; CasinoShell.awardXp(p.need - p.into); },
    },
    {
      group: 'Casino', label: 'Daily bonus ready',
      run: () => {
        const p = JSON.parse(localStorage.getItem('casinoProfile') || '{}');
        p.lastClaim = null;
        localStorage.setItem('casinoProfile', JSON.stringify(p));
        sessionStorage.removeItem('shellBonusPrompted');
        location.reload();
      },
    },
    { group: 'Hotel', hotel: true, label: '+$10,000 hotel cash', run: () => { HotelState.addHotelCash(10000); afterHotelChange(); } },
    { group: 'Hotel', hotel: true, label: 'Build all departments', run: () => setDeptLevels(() => 1) },
    { group: 'Hotel', hotel: true, label: 'Summon a high roller', run: () => { HotelState.setHighRollerFlag(); afterHotelChange(); } },
    { group: 'Hotel', hotel: true, label: '+3 dirty rooms', run: () => { HotelState.addDirtyRooms(3); afterHotelChange(); } },
    { group: 'Hotel', hotel: true, label: 'Max all departments', run: () => setDeptLevels(catalog => catalog.length) },
    {
      group: 'Hotel', hotel: true, label: 'Reset hotel save', danger: true,
      run: () => {
        if (!confirm('Start a brand-new hotel? This erases the current hotel save.')) return;
        HotelState.resetSave();
        HotelState.saveNow?.();
        location.reload();
      },
    },
    {
      group: 'Dev mode', label: 'Turn off dev mode',
      run: () => {
        const url = new URL(location.href);
        url.searchParams.set('dev', '0');
        location.href = url.toString();
      },
    },
  ];

  const STYLE = `
    .casino-dev-panel {
      position: fixed; left: 12px; bottom: 44px; z-index: 10000;
      width: min(280px, calc(100vw - 24px)); max-height: 70vh; overflow: auto;
      padding: 12px; border-radius: 12px;
      background: #141414; color: #f2f2f2; border: 1px solid #b3261e;
      box-shadow: 0 12px 32px rgba(0,0,0,0.5);
      font: 13px/1.4 system-ui, sans-serif;
    }
    .casino-dev-panel[hidden] { display: none; }
    .casino-dev-panel h4 { margin: 10px 0 6px; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #ff8a80; }
    .casino-dev-panel h4:first-child { margin-top: 0; }
    .casino-dev-panel .dev-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
    .casino-dev-panel button {
      padding: 7px 8px; border-radius: 8px; border: 1px solid #444;
      background: #222; color: inherit; font: inherit; cursor: pointer; text-align: left;
    }
    .casino-dev-panel button:hover { background: #2e2e2e; }
    .casino-dev-panel button.danger { border-color: #b3261e; color: #ffb4ab; }
    .casino-dev-panel .dev-note { margin: 6px 0 0; color: #aaa; font-size: 12px; }
  `;

  let panel = null;

  function build() {
    const style = document.createElement('style');
    style.textContent = STYLE;
    document.head.appendChild(style);

    panel = document.createElement('div');
    panel.className = 'casino-dev-panel';
    panel.id = 'casino-dev-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Dev tools');
    panel.hidden = true;

    const groups = [...new Set(ACTIONS.map(a => a.group))];
    panel.innerHTML = groups.map(group => {
      const items = ACTIONS.filter(a => a.group === group);
      if (items.every(a => a.hotel) && !hasHotel()) {
        return `<h4>${group}</h4><p class="dev-note">Open the hotel (or a hotel shift) for these tools.</p>`;
      }
      return `<h4>${group}</h4><div class="dev-grid">${items.map(a =>
        `<button type="button" data-dev-action="${ACTIONS.indexOf(a)}" class="${a.danger ? 'danger' : ''}">${a.label}</button>`
      ).join('')}</div>`;
    }).join('');

    panel.addEventListener('click', e => {
      const btn = e.target.closest('[data-dev-action]');
      if (!btn) return;
      const action = ACTIONS[Number(btn.dataset.devAction)];
      try {
        action.run();
        CasinoShell.toast(`Dev: ${action.label}`);
      } catch (err) {
        console.error('[DevTools]', err);
        CasinoShell.toast(`Dev action failed: ${err.message}`);
      }
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && panel && !panel.hidden) toggle(false); });
    document.body.appendChild(panel);
  }

  function toggle(force) {
    if (!panel) build();
    panel.hidden = force === undefined ? !panel.hidden : !force;
    document.getElementById('casino-dev-badge')?.setAttribute('aria-expanded', String(!panel.hidden));
  }

  return { toggle, ACTIONS };
})();

if (typeof window !== 'undefined') window.CasinoDevTools = CasinoDevTools;
