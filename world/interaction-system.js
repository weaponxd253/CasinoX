// Pure eligibility/selection is shared by doors, NPCs and objects. No save writes.
export function interactionDistance(position, definition) {
  const target = definition.position;
  return Math.hypot(
    Math.max(Math.abs(position.x - target.x) - (target.width ?? 0) / 2, 0),
    Math.max(Math.abs(position.y - target.y) - (target.height ?? 0) / 2, 0),
  );
}

export function selectInteraction(definitions, scene, position, context = {}) {
  return definitions
    .filter(definition => definition.scene === scene
      && (typeof definition.availability === 'function' ? definition.availability(context) : definition.availability !== false)
      && interactionDistance(position, definition) <= definition.radius)
    .sort((a, b) => interactionDistance(position, a) - interactionDistance(position, b)
      || a.id.localeCompare(b.id))[0] ?? null;
}

export class InteractionSystem {
  constructor(scene, { definitions, dispatch, context = () => ({}), blocked = () => false, now = () => performance.now() }) {
    Object.assign(this, { scene, definitions, dispatch, context, blocked, now });
    this.unlockAt = 0;
    this.onKey = event => this.trigger({ repeat: event.repeat });
    scene.input.keyboard.on('keydown-E', this.onKey);
    scene.events.once('shutdown', () => scene.input.keyboard.off('keydown-E', this.onKey));
  }

  current() {
    return selectInteraction(this.definitions, this.scene.sys.settings.key, this.scene.owner.snapshot(), this.context());
  }

  trigger({ repeat = false, pointer = false } = {}) {
    if (repeat || this.blocked() || this.now() < this.unlockAt || (!pointer && !this.scene.owner.hasFocus())) return false;
    // Re-evaluate at activation time, including DOM-button clicks.
    const definition = this.current();
    if (!definition) return false;
    this.unlockAt = this.now() + 250;
    this.scene.owner.stop();
    this.dispatch(definition);
    return true;
  }
}
