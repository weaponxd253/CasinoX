"""Deterministically crop the supplied owner art; requires Pillow for preparation only.

Usage: python scripts/prepare-owner-sprite.py path/to/source.png
The game uses only the prepared PNG and needs no Python/runtime dependency.
"""
import hashlib
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'world' / 'assets' / 'owner'
ROWS = [(40, 392), (392, 742), (742, 1098), (1098, 1460)]
DIRECTIONS = ['down', 'left', 'right', 'up']
ALPHA_THRESHOLD = 32


def prepare(source):
    original = source.read_bytes()
    image = Image.open(source).convert('RGBA')
    if image.size != (1024, 1536):
        raise ValueError('Expected the supplied 1024x1536 sheet; do not guess other layouts.')
    # Low-alpha background residue otherwise gives false full-cell bounds.
    image.putalpha(image.getchannel('A').point(lambda value: value if value >= ALPHA_THRESHOLD else 0))
    sheet = Image.new('RGBA', (256, 384))
    records = []
    for row, (top, bottom) in enumerate(ROWS):
        for column in range(4):
            region = image.crop((column * 256, top, (column + 1) * 256, bottom))
            bounds = region.getbbox()
            if not bounds:
                raise ValueError(f'Empty frame {row * 4 + column}')
            art = region.crop(bounds)
            if art.width > 224 or art.height > 352:
                raise ValueError(f'Unexpected/clipped art in frame {row * 4 + column}')
            # Same horizontal centre and ground line for every pose. No stretching.
            cell = Image.new('RGBA', (256, 384))
            cell.paste(art, ((256 - art.width) // 2, 368 - art.height))
            cell = cell.resize((64, 96), Image.Resampling.NEAREST)
            final_bounds = cell.getbbox()
            if not final_bounds or final_bounds[1] < 1 or final_bounds[3] != 92:
                raise ValueError(f'Frame {row * 4 + column} lost its baseline or margin')
            sheet.paste(cell, (column * 64, row * 96))
            records.append({
                'frame': row * 4 + column, 'direction': DIRECTIONS[row],
                'sourceBounds': [column * 256 + bounds[0], top + bounds[1], column * 256 + bounds[2], top + bounds[3]],
                'preparedBounds': list(final_bounds),
            })
    OUTPUT.mkdir(parents=True, exist_ok=True)
    (OUTPUT / 'owner-source.png').write_bytes(original)
    target = OUTPUT / 'owner.png'
    sheet.save(target, optimize=True)
    metadata = {
        'sourceSize': [1024, 1536], 'sourceSha256': hashlib.sha256(original).hexdigest(),
        'sheetSize': list(sheet.size), 'frameSize': [64, 96], 'footBaseline': 92,
        'resampling': 'nearest', 'alphaThreshold': ALPHA_THRESHOLD,
        'directions': DIRECTIONS, 'idleFrames': {'down': 0, 'left': 4, 'right': 8, 'up': 15},
        'preparedSha256': hashlib.sha256(target.read_bytes()).hexdigest(), 'frames': records,
    }
    (OUTPUT / 'owner-frames.json').write_text(json.dumps(metadata, indent=2) + '\n', encoding='utf-8')
    # QA contact sheet is generated outside source control.
    preview = Image.new('RGB', (576, 880), '#26323b')
    draw = ImageDraw.Draw(preview)
    for row in range(4):
        for column in range(4):
            x, y = column * 144, row * 220
            for gy in range(0, 192, 16):
                for gx in range(0, 128, 16):
                    draw.rectangle((x + gx, y + gy, x + gx + 15, y + gy + 15), fill='#46535d' if (gx + gy) % 32 else '#34414b')
            frame = sheet.crop((column * 64, row * 96, (column + 1) * 64, (row + 1) * 96)).resize((128, 192), Image.Resampling.NEAREST)
            preview.paste(frame, (x, y), frame)
            draw.text((x + 5, y + 197), f'{row * 4 + column}: {DIRECTIONS[row]}', fill='#f0d699')
    preview_path = ROOT / 'test-results' / 'owner-sheet-preview.png'
    preview_path.parent.mkdir(exist_ok=True)
    preview.save(preview_path)
    print(json.dumps({key: value for key, value in metadata.items() if key != 'frames'}, indent=2))


if __name__ == '__main__':
    prepare(Path(sys.argv[1]))
