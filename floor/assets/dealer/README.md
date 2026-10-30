# Blackjack dealer artwork

Supplied by the user for Casino X. `dealer-source.png` preserves the original
1024 x 1536 RGBA PNG byte for byte. Its SHA-256 is
`371025339f4245120c39899bb70974353e0c8f5d5fce84138d7b79f50be85b55`.

`dealer.png` is a 1024 x 1536 RGBA Phaser sheet containing sixteen 256 x 384
frames. Every retained source pixel is copied without resizing or recoloring.
As with the receptionist, alpha below 32 is cleared to remove faint background
residue. The per-pose bounds and both file hashes are in `dealer-frames.json`.
The tallest pose is 357px; every pose fits with at least 11px transparent top
padding and 16px bottom padding. Feet share the exclusive baseline y = 368.

| Direction | Frames | Idle | Prepared animation |
| --- | --- | --- | --- |
| Down | 0-3 | 0 | `dealer-walk-down` |
| Left | 4-7 | 4 | `dealer-walk-left` |
| Right | 8-11 | 8 | `dealer-walk-right` |
| Up | 12-15 | 12 | `dealer-walk-up` |

Walking definitions are 8fps, repeating, and are not played in this phase.
The dealer stays on downward idle frame 0 in all three presentation states.
Runtime scale 0.1875 gives a 48 x 72 frame display box, matching the owner and
receptionist. Filtering and canvas CSS use nearest-neighbor/pixelated rendering.

Rebuild with Pillow (preparation only; no new game dependency):

```powershell
python scripts/prepare-dealer-sprite.py floor/assets/dealer/dealer-source.png
```
