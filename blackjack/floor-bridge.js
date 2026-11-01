// Optional host integration. Standalone blackjack retains its existing behavior.
(() => {
  if (window.parent === window || new URLSearchParams(location.search).get('embed') !== 'floor') return;
  try {
    if (location.protocol === 'file:') {
      const parent = new URL(window.parent.location.href);
      const allowed = ['../floor/index.html', '../world/index.html'].map(path => new URL(path, location.href));
      if (parent.protocol !== 'file:' || !allowed.some(url => parent.host === url.host
        && decodeURIComponent(parent.pathname) === decodeURIComponent(url.pathname))) return;
    } else if (window.parent.location.origin !== location.origin) return;
  } catch (_) { return; }

  document.documentElement.dataset.floorEmbed = '';
  const localFile = location.protocol === 'file:';
  const send = type => window.parent.postMessage({ channel: 'casino-floor:blackjack', type }, localFile ? '*' : location.origin);
  const ready = () => {
    const finish = () => { CasinoShell.refreshProfile(); send('ready'); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', finish, { once: true });
    else finish();
  };
  window.addEventListener('message', event => {
    if (event.source !== window.parent) return;
    if (localFile ? !['null', 'file://'].includes(event.origin) : event.origin !== location.origin) return;
    if (event.data?.channel === 'casino-floor:blackjack' && event.data.type === 'host-ready') ready();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      send('close');
    }
  });
  document.addEventListener('click', event => {
    // Shell return links leave the table, rather than navigating inside the frame.
    const link = event.target.closest('a[href]');
    if (link && link.origin === location.origin && link.pathname !== location.pathname) {
      event.preventDefault();
      document.getElementById('shell-modal')?.classList.remove('open');
      send('close');
    }
  });
  ready();
})();
