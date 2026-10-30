# Casual Traveler

User-supplied artwork for Casino X. `casual-traveler-source.png` preserves the
original 1024 x 1536 RGBA PNG byte for byte (SHA-256
`ac3f8472093cb16cdbf62e950e3755fa4e3aaf103b37667589ac3e087381cbcf`).

The runtime PNG is 1024 x 1536, with sixteen 256 x 384 frames. All retained
source pixels are copied unchanged, without resizing or redrawing. As with the
dealer and receptionist, alpha below 32 is cleared to remove faint background
residue. Every pose has centered transparent padding, at least 14px above the
art and 16px below it, with a shared exclusive foot baseline y = 368. The
354px tallest pose fits without clipping. Bounds and file hashes are recorded
in `casual-traveler-frames.json`.

| Direction | Walking frames | Idle | Animation |
| --- | --- | --- | --- |
| Down | 0-3 | 0 | `casual-traveler-walk-down` |
| Left | 4-7 | 4 | `casual-traveler-walk-left` |
| Right | 8-11 | 8 | `casual-traveler-walk-right` |
| Up | 12-15 | 12 | `casual-traveler-walk-up` |

Animations run at 8fps. Scale 0.1875 gives the established 48 x 72 display box.
The foot anchor follows the controller's circle center plus its 14px radius,
matching the owner's convention. Phaser filtering and CSS use nearest-neighbor
and pixelated rendering. Missing/invalid art uses the shared cosmetic fallback.

Rebuild with Pillow (asset preparation only):

```powershell
python scripts/prepare-casual-traveler-sprite.py world/assets/guests/casual-traveler/casual-traveler-source.png
```
