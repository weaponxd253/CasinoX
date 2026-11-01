# Vacation Tourist

User-supplied Phase 5D artwork. The original source is preserved byte for byte.
The derivative repacks sixteen poses using inspected empty row gaps; no
RGB pixels are redrawn, resized or resampled. Direction rows are down, left,
right, up; each cell is 256x384, displayed at 48x72 with nearest filtering.
The alpha>=32 silhouette is centered with exclusive foot baseline y=368.
Original faint antialias pixels within two pixels of that silhouette are
retained, so the faint fringe may extend to y=370 inside the padded cell.
Only background outside that neighborhood is cleared. Cleanup counts,
source windows, translations, bounds and hashes are in the manifest.

Rebuild: `python scripts/prepare-guest-sprites.py vacation-tourist path/to/source.png`
