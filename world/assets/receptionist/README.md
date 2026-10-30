# Receptionist sprite integration

The supplied sixteen poses are packed into a regular Phaser sheet and displayed
as a stationary, downward-facing receptionist behind the existing lobby counter.
This is presentation only: no physics body, staff record, hotel calculations,
navigation, clock or saved NPC state is introduced.

## Asset preparation

`receptionist-source.png` preserves the supplied 1024 × 1536 RGBA file byte for
byte. SHA-256:
`d58c5be75256b004e0da681bc282c7296d3f7bf12aa608e58a5c0c9f1b60a19a`.

The meaningful row bands are y=48–388, 409–747, 774–1107 and 1126–1458 (exclusive
bottoms). Uniform 384-pixel slicing would split the first and third rows. The
preparation script uses measured row regions and per-pose alpha bounds instead.

- Runtime sheet: **1024 × 1536**, transparent PNG, four columns × four rows.
- Each frame: **256 × 384**, preserving the original artwork resolution.
- Common foot baseline: **y=368**, leaving 16 transparent pixels below the feet.
- Each pose is horizontally centered within half a native pixel, with transparent
  padding. No pose is resized, stretched, recolored, redrawn or generated.
- As with the owner preparation pipeline, alpha below 32/255 is cleared to remove
  faint background residue. Every retained source RGBA pixel is copied exactly.
- `receptionist-frames.json` records all sixteen source/prepared bounds and
  checksums. The prepared PNG hash is
  `e1be3f569a35426805ebd45cfba5295c49bf3c7757f2136bb8799e9a714f9dd3`.

Preparation is deterministic asset packing through a project script; it requires
Pillow only at preparation time. The static game adds no runtime dependency.

```sh
python scripts/prepare-receptionist-sprite.py world/assets/receptionist/receptionist-source.png
```

## Runtime and animation mapping

The full-resolution frames use **0.1875 scale** (`owner scale 0.75 / 4`) for a
**48 × 72 world-pixel frame**, matching the owner. Texture filtering remains
nearest-neighbor, and the existing pixelated canvas scaling is unchanged.
Origin is (0.5,368/384), anchoring every pose to the same ground line.

| Direction | Walking frames | Prepared idle |
| --- | --- | --- |
| Down | 0–3 | 0 |
| Left | 4–7 | 4 |
| Right | 8–11 | 8 |
| Up | 12–15 | 12 |

`world/receptionist-sprite.js` registers `receptionist-walk-{direction}` at 8 fps
with repeat=-1, but does not play them. The current NPC stays on frame 0; no NPC
controller, movement or destination system has been added.

The source-art foot position is (300,296), converted through the existing lobby
transform and snapped to **(206,173)** in world pixels. The sprite is depth 4.
A presentation-only counter polygon is appended to the existing foreground-mask
pipeline; its depth is 5 or 20 according to the unchanged owner-depth rule, always
above the receptionist. It displays identical counter pixels from the original
background over the lower body. It introduces no collision or artwork changes.

The art-backed lobby previously had the reception interaction without a separate
NPC object. Normal rendering now shows the character. Missing, undecodable or
wrong-size sprite assets use a non-physical circle fallback and keep dialogue
available. The asset is loaded once per game and reused across scene returns.

The existing receptionist dialogue, E target/radius, owner movement, lobby
collision definitions, world-state v2, hotel systems and casino code are unchanged.
`world/main.js` only gains read-only receptionist/counter diagnostics under
`?debug=1`. No save keys or payload fields are added.

## Regression coverage and files

Verification on October 30, 2026: the complete suite passed **390 checks, zero
failures** in 8.4 minutes across desktop Chromium and Pixel 5 emulation. A focused
rerun of all twelve receptionist checks passed in 28.3 seconds, including the
strengthened all-source-pixel coverage assertion and sharp rendering when the
owner uses its existing circle fallback. `git diff --check` passes.

Hash comparisons confirm that only `world/lobby-scene.js` and `world/main.js`
changed among the pre-existing files. In particular, `world/lobby-layout.js`
(including every collision definition), owner code/assets, hotel systems, saves,
minigames and the prior lounge/iframe changes remain byte-for-byte unchanged.

`tests/receptionist-sprite.spec.js` adds twelve desktop/mobile checks covering all
sixteen packed poses against the source pixels, alpha/padding/baselines, runtime
scale, stationary idle, registered animation definitions, counter pixel occlusion,
existing collision stopping distance, dialogue pause/focus, casino/hotel returns,
reload, save preservation and three sprite-failure fallback cases.

```sh
npx playwright test tests/receptionist-sprite.spec.js --workers=2
npx playwright test --workers=2
```

Added: `scripts/prepare-receptionist-sprite.py`,
`world/receptionist-sprite.js`, `world/assets/receptionist/{receptionist-source.png,
receptionist.png,receptionist-frames.json,README.md}`,
`tests/receptionist-sprite.spec.js` and the final lobby capture.

Modified: `world/lobby-scene.js` (preload/visual/mask integration) and
`world/main.js` (read-only diagnostics). Existing uncommitted lounge and iframe
fixes are retained. No source image was overwritten.

The walking poses are ready for a future NPC controller. Navigation and assignment
to actual hotel staff records remain outside this change.

[Verified lobby capture](../../../docs/screenshots/receptionist-lobby.png)
