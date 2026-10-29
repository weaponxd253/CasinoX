// Optional host integration. Standalone blackjack retains its existing behavior.
(() => {
  if (window.parent === window || new URLSearchParams(location.search).get('embed') !== 'floor') return;
  try {
    if (window.parent.location.origin !== location.origin) return;
  } catch (_) { return; }

  document.documentElement.dataset.floorEmbed = '';
  const send = type => window.parent.postMessage({ channel: 'casino-floor:blackjack', type }, location.origin);
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
  document.addEventListener('DOMContentLoaded', () => send('ready'));
})();
