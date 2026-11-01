function conversation(id, resort) {
  if (id === 'directory') return {
    title: 'Hotel directory',
    text: 'This hotel interior is an exploration preview. Guest rooms and service doors are not available here yet. Use Hotel Management for the existing departments and shifts.',
    choices: [],
  };
  return {
    title: 'Receptionist',
    text: resort.hasHotel
      ? `Welcome back, owner of ${resort.name}. The casino entrance is north, the manager’s office is northeast, and the hotel entrance is to the east.`
      : 'Welcome, owner. You can explore the resort now. Open Hotel Management when you are ready to set up the hotel; exploring and chatting do not create a hotel save.',
    choices: [
      { label: 'Where can I go?', text: 'Walk north to the Main Casino Floor, then continue north to the Blackjack Lounge, or east to the hotel interior preview. Approach a marked entrance and press E. Return brings you to the same Central Lobby point.' },
      { label: 'How do I manage the resort?', text: 'Visit the manager’s office in the northeast or press M anywhere in the world. Both open the existing Hotel Management dashboard. Its Return to Central Lobby link brings you back.' },
      { label: 'About hotel cash and chips', text: 'Hotel operating cash pays for the resort. Virtual casino chips are a separate balance used by the existing games. Talking and walking do not transfer or spend either balance.' },
    ],
  };
}

export class Dialogue {
  constructor({ dialog, onOpen, onClose }) {
    Object.assign(this, { dialog, onOpen, onClose });
    dialog.querySelector('[data-dialogue-close]').addEventListener('click', () => this.close());
    dialog.addEventListener('cancel', event => { event.preventDefault(); this.close(); });
    dialog.addEventListener('close', () => { if (!dialog.open) this.finishClose(); });
  }

  open(id, resort) {
    if (this.dialog.open) return;
    const content = conversation(id, resort);
    this.dialog.querySelector('h2').textContent = content.title;
    this.dialog.querySelector('[data-dialogue-text]').textContent = content.text;
    const choices = this.dialog.querySelector('[data-dialogue-choices]');
    choices.replaceChildren();
    for (const choice of content.choices) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'owner-secondary';
      button.textContent = choice.label;
      button.addEventListener('click', () => { this.dialog.querySelector('[data-dialogue-text]').textContent = choice.text; });
      choices.append(button);
    }
    this.isOpen = true;
    this.onOpen();
    this.dialog.showModal();
  }

  close() {
    if (!this.dialog.open) return;
    this.dialog.close();
    this.finishClose();
  }

  finishClose() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.onClose();
  }
}
