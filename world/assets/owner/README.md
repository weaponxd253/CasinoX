# Owner sprite integration

This change replaces only the yellow-circle owner presentation. The existing
circle remains the physics body and fallback. Room drawing, colliders, controls,
speed, interactions, save schemas, hotel systems and games are unchanged.

## Asset preparation

The user-supplied source is preserved byte-for-byte as `owner-source.png`:
1024 × 1536 RGBA, SHA-256
`6d2b574153536b90594b05c65a74aeeb453d9680b70e4fe574548eb5e734ef0c`.
No replacement artwork was generated.

The visible rows are unevenly spaced; uniformly dividing the original into
256 × 384 cells clips later rows. `scripts/prepare-owner-sprite.py` uses measured
row regions and each figure's actual alpha bounds. It removes low-alpha residue
below 32/255, preserves the remaining RGBA artwork, aligns each figure's bottom
and horizontal centre on a common canvas, then downsamples once by 4 using nearest
neighbour. No stretching, invented poses or generative edits are used.

- Runtime sheet: **256 × 384**, transparent PNG, 4 columns × 4 rows.
- Frame: **64 × 96**, all 16 complete with transparent margins.
- Foot baseline: **y = 92**, consistent in every frame.
- Horizontal bounds: centred within half a pixel, as required for odd widths.
- Actual art: approximately 44–46 pixels wide and 80–83 pixels tall per frame.
- Scale in all rooms: **0.75**; frame footprint 48 × 72 world pixels, visible
  character approximately 33–35 × 60–62 world pixels.

`owner-frames.json` records the exact original and prepared bounds of every frame,
direction, idle selection and source/output checksums. Preparation requires Pillow
only; the static game adds no dependency or build step.

```sh
python scripts/prepare-owner-sprite.py world/assets/owner/owner-source.png
```

The script also creates an ignored QA contact sheet under `test-results/`.

## Animation mapping (zero-based, row-major)

| Direction | Walking frames | Idle frame |
| --- | --- | --- |
| Down / front | 0, 1, 2, 3 | 0 |
| Left | 4, 5, 6, 7 | 4 |
| Right | 8, 9, 10, 11 | 8 |
| Up / back | 12, 13, 14, 15 | 15 |

Walking uses the supplied four poses at 8 fps. The up row has no separate neutral
pose; frame 15 has the most nearly planted feet and is held for idle. All other
idle frames use the first, neutral pose of their row. Facing follows the original
controller, including its existing vertical preference during diagonal movement.

## Runtime and compatibility

`world/owner-sprite.js` loads the image during the shared scenes' preload step,
creates each animation once per Phaser game and validates its dimensions/frames.
The first scene queues the asset; later rooms reuse that outcome, including a
failed load, so their existing immediate transitions work without extra requests.
Reloading starts a fresh load attempt. Missing, undecodable or wrongly sized
assets leave the original yellow circle and facing dot visible.

OwnerController still moves its original radius-14 circle at 190 world pixels per
second. The sprite has no physics body and receives no input or interaction
authority. Its ground line is anchored to the existing body's bottom; only its
render position is rounded to pixels. Physics coordinates and persisted positions
retain their original precision. The original label remains below the owner.

Texture filtering is NEAREST; CSS `image-rendering: pixelated` keeps the FIT-scaled
canvas sharp. Room graphics drawing code and renderer antialias settings are not
changed. Blur, pause and sleep immediately stop animation in the current facing;
restore synchronizes the visual to the saved body position and facing.
Final render alignment follows Arcade's post-update position, avoiding a one-frame
visual lag without changing the original physics update or save coordinates.

Read-only visual/body diagnostics were added to the existing `?debug=1` snapshots.
Normal routes expose no new debugging API. No storage key or migration is added.
Lobby/NPC and blackjack artwork work has not started.

## Files changed in this slice

Added: `world/owner-sprite.js`, `world/assets/owner/{owner-source.png,owner.png,
owner-frames.json,README.md}`, `scripts/prepare-owner-sprite.py`,
`tests/owner-sprite.spec.js`.

Modified: `world/owner-controller.js`, `world/explorable-scene.js`,
`floor/room-scene.js` (preload only), `world/main.js` and `floor/main.js`
(read-only debug fields only). Existing uncommitted work is retained.

## Verification

```sh
npx playwright test tests/owner-sprite.spec.js --workers=2
npx playwright test --workers=2
```

New coverage checks all frame bounds/alpha/baselines, animation rows and idles,
unchanged speed and circle body, nearest filtering, hotel and lounge return
positions/facing, reload preservation, dialogue/blackjack pause and keyboard focus,
missing/wrong-sheet fallback and standalone lounge behavior. The existing 142
checks remain the regression baseline, including original rules and payouts.
Screenshots cover the Central Lobby, Blackjack Lounge and Hotel Interior.

Verified October 29, 2026: **160 checks passed** (142 existing + 18 new) on desktop
Chromium and Pixel 5 emulation, in 3.0 minutes. `git diff --check` and local
reference checks passed (14 HTML entrypoints, 32 world/lounge imports). Asset
regeneration from the archived source produced identical PNG/metadata bytes.
The contact sheet and all three room appearances were visually inspected; physical
mobile hardware and touch movement are outside this verification.
