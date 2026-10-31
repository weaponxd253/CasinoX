# Older Leisure Traveler

User-supplied Phase 5B artwork. The source PNG is preserved byte for byte.
Sixteen 256x384 frames, in down/left/right/up row order, use centered
transparent padding and a common exclusive foot baseline y=368.
All retained source pixels are copied without resizing or redrawing;
only alpha below 32 is cleared, matching the existing NPC convention.
Hashes and per-frame bounds are recorded in the adjacent manifest.

The shared NPC renderer uses idle frames 0/4/8/12, 8fps walking,
scale 0.1875 (48x72), nearest-neighbor filtering and a foot anchor
at controller center + radius. Appearance owns no simulation state.

Rebuild: `python scripts/prepare-guest-sprites.py older-leisure-traveler path/to/source.png`
