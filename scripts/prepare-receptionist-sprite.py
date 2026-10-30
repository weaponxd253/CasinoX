"""Pack the supplied sixteen poses into regular Phaser cells without redrawing.

Usage: python scripts/prepare-receptionist-sprite.py path/to/source.png
Requires Pillow only for preparation. Runtime uses the static PNG.
"""
import hashlib
import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'world' / 'assets' / 'receptionist'
ROWS = [(32, 398), (398, 762), (762, 1118), (1118, 1472)]
DIRECTIONS = ['down', 'left', 'right', 'up']
FRAME = (256, 384)
BASELINE = 368
ALPHA_THRESHOLD = 32


def prepare(source):
    original = source.read_bytes()
    image = Image.open(source).convert('RGBA')
    if image.size != (1024, 1536):
        raise ValueError('Expected the inspected 1024x1536 receptionist sheet.')
    # Like the owner asset, the source has almost invisible background residue.
    # Preserve every retained RGBA pixel; no resizing, recoloring or new poses.
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
            if art.width > 224 or art.height > 352:
                raise ValueError(f'Unexpected or clipped pose {row * 4 + column}')
            x, y = (FRAME[0] - art.width) // 2, BASELINE - art.height
            cell = Image.new('RGBA', FRAME)
            cell.paste(art, (x, y))
            final_bounds = cell.getbbox()
            if final_bounds[1] < 16 or final_bounds[3] != BASELINE:
                raise ValueError(f'Incorrect margin or feet for pose {row * 4 + column}')
            sheet.paste(cell, (column * FRAME[0], row * FRAME[1]))
            records.append({'frame': row * 4 + column, 'direction': DIRECTIONS[row],
                            'sourceBounds': [column * 256 + bounds[0], top + bounds[1],
                                             column * 256 + bounds[2], top + bounds[3]],
                            'preparedBounds': list(final_bounds)})
    OUTPUT.mkdir(parents=True, exist_ok=True)
    (OUTPUT / 'receptionist-source.png').write_bytes(original)
    target = OUTPUT / 'receptionist.png'
    sheet.save(target, optimize=True)
    metadata = {'sourceSize': list(image.size), 'sourceSha256': hashlib.sha256(original).hexdigest(),
                'sheetSize': list(sheet.size), 'frameSize': list(FRAME), 'footBaseline': BASELINE,
                'resampling': 'none', 'alphaThreshold': ALPHA_THRESHOLD, 'directions': DIRECTIONS,
                'idleFrames': {'down': 0, 'left': 4, 'right': 8, 'up': 12},
                'preparedSha256': hashlib.sha256(target.read_bytes()).hexdigest(), 'frames': records}
    (OUTPUT / 'receptionist-frames.json').write_text(json.dumps(metadata, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({key: value for key, value in metadata.items() if key != 'frames'}, indent=2))


if __name__ == '__main__':
    prepare(Path(sys.argv[1]))
