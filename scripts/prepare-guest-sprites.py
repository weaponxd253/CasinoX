"""Losslessly pack the supplied Phase 5B sheets. Pillow is preparation-only.

Usage: python scripts/prepare-guest-sprites.py business-traveler source.png
       python scripts/prepare-guest-sprites.py older-leisure-traveler source.png
"""
import hashlib
import json
import sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ROWS = [(0, 392), (392, 764), (764, 1128), (1128, 1536)]
DIRECTIONS = ['down', 'left', 'right', 'up']


def prepare(name, source):
    if name not in ('business-traveler', 'older-leisure-traveler'):
        raise ValueError('Choose a registered Phase 5B appearance.')
    original = source.read_bytes()
    image = Image.open(source).convert('RGBA')
    if image.size != (1024, 1536):
        raise ValueError('Expected the inspected 1024x1536 source sheet.')
    image.putalpha(image.getchannel('A').point(lambda a: a if a >= 32 else 0))
    sheet = Image.new('RGBA', image.size)
    frames = []
    for row, (top, bottom) in enumerate(ROWS):
        for column in range(4):
            region = image.crop((column * 256, top, (column + 1) * 256, bottom))
            bounds = region.getbbox()
            if not bounds:
                raise ValueError('Empty pose')
            art = region.crop(bounds)
            if art.width > 224 or art.height > 360:
                raise ValueError('Pose would exceed established padding')
            x, y = (256 - art.width) // 2, 368 - art.height
            cell = Image.new('RGBA', (256, 384))
            cell.paste(art, (x, y))
            sheet.paste(cell, (column * 256, row * 384))
            frames.append({'frame': row * 4 + column, 'direction': DIRECTIONS[row],
                           'sourceBounds': [column * 256 + bounds[0], top + bounds[1],
                                            column * 256 + bounds[2], top + bounds[3]],
                           'preparedBounds': list(cell.getbbox())})
    if sum(sheet.getchannel('A').histogram()[1:]) != sum(image.getchannel('A').histogram()[1:]):
        raise ValueError('Packing dropped retained pixels')
    output = ROOT / 'world' / 'assets' / 'guests' / name
    output.mkdir(parents=True, exist_ok=True)
    (output / f'{name}-source.png').write_bytes(original)
    target = output / f'{name}.png'
    sheet.save(target, optimize=True)
    metadata = {'sourceSize': list(image.size), 'sourceSha256': hashlib.sha256(original).hexdigest(),
                'sheetSize': list(sheet.size), 'frameSize': [256, 384], 'footBaseline': 368,
                'resampling': 'none', 'alphaThreshold': 32, 'directions': DIRECTIONS,
                'idleFrames': dict(zip(DIRECTIONS, [0, 4, 8, 12])),
                'preparedSha256': hashlib.sha256(target.read_bytes()).hexdigest(), 'frames': frames}
    (output / f'{name}-frames.json').write_text(json.dumps(metadata, indent=2) + '\n', encoding='utf-8')
    (output / 'README.md').write_text(
        f'# {name.replace("-", " ").title()}\n\n'
        'User-supplied Phase 5B artwork. The source PNG is preserved byte for byte.\n'
        'Sixteen 256x384 frames, in down/left/right/up row order, use centered\n'
        'transparent padding and a common exclusive foot baseline y=368.\n'
        'All retained source pixels are copied without resizing or redrawing;\n'
        'only alpha below 32 is cleared, matching the existing NPC convention.\n'
        'Hashes and per-frame bounds are recorded in the adjacent manifest.\n\n'
        'The shared NPC renderer uses idle frames 0/4/8/12, 8fps walking,\n'
        'scale 0.1875 (48x72), nearest-neighbor filtering and a foot anchor\n'
        'at controller center + radius. Appearance owns no simulation state.\n\n'
        f'Rebuild: `python scripts/prepare-guest-sprites.py {name} path/to/source.png`\n', encoding='utf-8')
    print(f'{name}: 16 poses packed; source {metadata["sourceSha256"]}')


if __name__ == '__main__':
    prepare(sys.argv[1], Path(sys.argv[2]))
