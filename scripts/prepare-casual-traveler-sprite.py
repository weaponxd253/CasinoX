"""Pack all supplied casual-traveler poses without resizing or redrawing.

Usage: python scripts/prepare-casual-traveler-sprite.py path/to/source.png
Pillow is needed only for preparation; the game loads the static PNG.
"""
import hashlib
import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'world' / 'assets' / 'guests' / 'casual-traveler'
ROWS = [(0, 392), (392, 764), (764, 1128), (1128, 1536)]
DIRECTIONS = ['down', 'left', 'right', 'up']
FRAME = (256, 384)
BASELINE = 368
ALPHA_THRESHOLD = 32


def prepare(source):
    original = source.read_bytes()
    image = Image.open(source).convert('RGBA')
    if image.size != (1024, 1536):
        raise ValueError('Expected the inspected 1024x1536 casual-traveler sheet.')
    # Same cleanup as the receptionist: remove faint background residue only.
    # Every retained RGBA pixel is copied unchanged; no resampling or new poses.
    image.putalpha(image.getchannel('A').point(lambda a: a if a >= ALPHA_THRESHOLD else 0))
    sheet = Image.new('RGBA', (1024, 1536))
    records = []
    for row, (top, bottom) in enumerate(ROWS):
        for column in range(4):
            region = image.crop((column * 256, top, (column + 1) * 256, bottom))
            bounds = region.getbbox()
            if not bounds:
                raise ValueError(f'Empty frame {row * 4 + column}')
            art = region.crop(bounds)
            # Travel poses reach 354px tall; retain all original pixels.
            if art.width > 224 or art.height > 360:
                raise ValueError(f'Unexpected or clipped pose {row * 4 + column}')
            x, y = (FRAME[0] - art.width) // 2, BASELINE - art.height
            cell = Image.new('RGBA', FRAME)
            cell.paste(art, (x, y))
            final_bounds = cell.getbbox()
            if final_bounds[1] < 8 or final_bounds[3] != BASELINE:
                raise ValueError(f'Incorrect padding or feet for pose {row * 4 + column}')
            sheet.paste(cell, (column * FRAME[0], row * FRAME[1]))
            records.append({'frame': row * 4 + column, 'direction': DIRECTIONS[row],
                            'sourceBounds': [column * 256 + bounds[0], top + bounds[1],
                                             column * 256 + bounds[2], top + bounds[3]],
                            'preparedBounds': list(final_bounds)})
    source_pixels = sum(image.getchannel('A').histogram()[1:])
    if sum(sheet.getchannel('A').histogram()[1:]) != source_pixels:
        raise ValueError('Packing dropped retained source pixels.')
    OUTPUT.mkdir(parents=True, exist_ok=True)
    (OUTPUT / 'casual-traveler-source.png').write_bytes(original)
    target = OUTPUT / 'casual-traveler.png'
    sheet.save(target, optimize=True)
    metadata = {'sourceSize': list(image.size), 'sourceSha256': hashlib.sha256(original).hexdigest(),
                'sheetSize': list(sheet.size), 'frameSize': list(FRAME), 'footBaseline': BASELINE,
                'resampling': 'none', 'alphaThreshold': ALPHA_THRESHOLD, 'directions': DIRECTIONS,
                'idleFrames': {'down': 0, 'left': 4, 'right': 8, 'up': 12},
                'preparedSha256': hashlib.sha256(target.read_bytes()).hexdigest(), 'frames': records}
    (OUTPUT / 'casual-traveler-frames.json').write_text(json.dumps(metadata, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({key: value for key, value in metadata.items() if key != 'frames'}, indent=2))


if __name__ == '__main__':
    prepare(Path(sys.argv[1]))
