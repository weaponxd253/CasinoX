import { saveAvailability } from './world-state.js';

const continueButton = document.getElementById('continue-resort');
const newButton = document.getElementById('new-game');
const status = document.getElementById('save-status');
const errors = document.getElementById('save-errors');
const newDialog = document.getElementById('new-game-dialog');
const settings = document.getElementById('settings-dialog');
document.documentElement.dataset.theme = CasinoShell.theme.get();

function refresh() {
  const availability = saveAvailability();
  continueButton.disabled = !availability.canContinue;
  newButton.disabled = Boolean(availability.errors.length);
  errors.hidden = !availability.errors.length;
  errors.textContent = availability.errors.length
    ? `${availability.errors.join(' ')} Nothing has been changed. Restore a compatible backup to continue.` : '';
  status.textContent = availability.errors.length ? 'Saved data needs attention.'
    : availability.available ? 'Your saved progress is ready. Continue from the Central Lobby.'
      : 'First visit? Choose New Game to explore without resetting anything.';
  return availability;
}

function explore() {
  if (!refresh().errors.length) location.href = new URL('index.html', import.meta.url).href;
}

continueButton.addEventListener('click', () => { if (refresh().canContinue) explore(); });
newButton.addEventListener('click', () => { if (!refresh().errors.length) newDialog.showModal(); });
document.getElementById('explore-resort').addEventListener('click', explore);
document.getElementById('settings-button').addEventListener('click', () => {
  document.getElementById('theme-setting').value = CasinoShell.theme.get();
  document.getElementById('sound-setting').value = CasinoShell.sound.muted ? 'off' : 'on';
  settings.showModal();
});
document.getElementById('settings-form').addEventListener('submit', event => {
  event.preventDefault();
  CasinoShell.theme.apply(document.getElementById('theme-setting').value);
  CasinoShell.sound.muted = document.getElementById('sound-setting').value === 'off';
  settings.close();
});
document.querySelectorAll('[data-dialog-close]').forEach(button => {
  button.addEventListener('click', () => button.closest('dialog').close());
});
window.addEventListener('storage', refresh);
refresh();
