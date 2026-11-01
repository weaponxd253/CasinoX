// Two noninteractive game objects per active bubble. Text layout happens once
// on speech creation; following a guest only changes object positions/visibility.
export class GuestDialogueBubbles {
  constructor(scene) { this.scene = scene; this.items = new Map(); this.created = 0; this.destroyed = 0; }
  remove(id) {
    const item = this.items.get(id);
    if (!item) return;
    item.background.destroy(); item.text.destroy(); this.items.delete(id); this.destroyed += 2;
  }
  sync(dialogue, guests) {
    const active = dialogue.activeBubbles(), ids = new Set(active.map(b => b.id));
    for (const id of this.items.keys()) if (!ids.has(id)) this.remove(id);
    const camera = this.scene.cameras.main, view = camera.worldView;
    const left = view.x + 4, top = view.y + 4;
    const right = view.x + view.width - 4, bottom = view.y + view.height - 4;
    const occupied = [];
    for (const bubble of active) {
      const guest = guests.find(g => g.id === bubble.id);
      if (!guest) { this.remove(bubble.id); continue; }
      let item = this.items.get(bubble.id);
      if (item && item.startedAtMs !== bubble.startedAtMs) { this.remove(bubble.id); item = null; }
      if (!item) {
        const text = this.scene.add.text(0, 0, bubble.text, { fontFamily: 'monospace', fontSize: '11px',
          color: '#f5ebd5', lineSpacing: 1, wordWrap: { width: 138, useAdvancedWrap: true } }).setDepth(40.01);
        const width = Math.min(150, Math.ceil(text.width) + 12), height = Math.ceil(text.height) + 12;
        const background = this.scene.add.graphics().setDepth(40);
        background.fillStyle(0x111d23, .94).fillRoundedRect(0, 0, width, height, 4)
          .lineStyle(1, 0xc8a96b, .95).strokeRoundedRect(0, 0, width, height, 4);
        background.fillStyle(0x111d23, .94).fillTriangle(width / 2 - 3, height - 1, width / 2 + 3, height - 1, width / 2, height + 4);
        item = { id: bubble.id, text, background, width, height, startedAtMs: bubble.startedAtMs, visible: false };
        this.items.set(bubble.id, item); this.created += 2;
      }
      const x = Math.max(left, Math.min(right - item.width, guest.position.x - item.width / 2));
      const feetY = guest.position.y + (guest.radius ?? 14);
      const y = Math.max(top, Math.min(bottom - item.height - 4, feetY - 70 - item.height - 6));
      const rect = { x, y, width: item.width, height: item.height + 4 };
      const overlaps = occupied.some(r => x < r.x + r.width && x + rect.width > r.x && y < r.y + r.height && y + rect.height > r.y);
      item.visible = !dialogue.suspended && !dialogue.priority && !overlaps
        && camera.worldView.contains(guest.position.x, feetY);
      item.background.setPosition(x, y).setVisible(item.visible);
      item.text.setPosition(x + 6, y + 6).setVisible(item.visible); item.bounds = rect;
      if (item.visible) occupied.push(rect);
    }
  }
  snapshot() {
    return { objectCount: this.items.size * 2, created: this.created, destroyed: this.destroyed,
      visibleCount: [...this.items.values()].filter(b => b.visible).length,
      bubbles: [...this.items.values()].map(b => ({ id: b.id, text: b.text.text,
        visible: b.visible, bounds: { ...b.bounds }, hasInput: Boolean(b.text.input || b.background.input) })) };
  }
  destroy() { for (const id of this.items.keys()) this.remove(id); }
}
