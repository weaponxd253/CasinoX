// Keep owner depth 10 and all existing overlays unchanged. Relative foot heights
// give every moving actor and painted foreground one consistent ordering.
export function updateLobbyDepth(scene) {
  const ownerFeet = scene.player.y + scene.config.playerRadius;
  for (const layer of scene.foregrounds) layer.foreground.setDepth(10 + (layer.baseline - ownerFeet) / 1000);
  const guest = scene.guests;
  if (guest?.visual) guest.visual.setDepth(10 + (guest.controller.position.y + guest.controller.radius - ownerFeet) / 1000);
}
