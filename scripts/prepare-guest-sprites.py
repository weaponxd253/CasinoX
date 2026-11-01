"""Pack user-supplied guest sheets. Pillow is preparation-only; no art is redrawn.

Usage: python scripts/prepare-guest-sprites.py business-traveler source.png
       python scripts/prepare-guest-sprites.py older-leisure-traveler source.png
"""
import hashlib
import json
import sys
from pathlib import Path
from PIL import Image, ImageChops, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
ROWS = [(0, 392), (392, 764), (764, 1128), (1128, 1536)]
DIRECTIONS = ['down', 'left', 'right', 'up']
NEW_GUEST_CUTS = {
    'conference-attendee': [392, 774, 1153],
    'vacation-tourist': [391, 770, 1142],
    'luxury-hotel-guest': [390, 771, 1156],
    'young-casino-visitor': [395, 742, 1095],
    'high-roller': [391, 762, 1129],
}


def prepare_legacy(name, source):
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


def prepare_new(name, source):
    original = source.read_bytes()
    image = Image.open(source).convert('RGBA')
    if image.size != (1024, 1536):
        raise ValueError('Expected the inspected 1024x1536 source sheet.')
    alpha = image.getchannel('A')
    # Alpha is a silhouette seed, not an erase threshold. Retain original faint
    # antialias pixels within two pixels of every seed, including detached details.
    core = alpha.point(lambda a: 255 if a >= 32 else 0)
    near = core.filter(ImageFilter.MaxFilter(5))
    retained = Image.composite(image, Image.new('RGBA', image.size), near)
    edges = [0, *NEW_GUEST_CUTS[name], 1536]
    sheet = Image.new('RGBA', image.size)
    frames = []
    for row, (top, bottom) in enumerate(zip(edges, edges[1:])):
        for column in range(4):
            window = (column * 256, top, (column + 1) * 256, bottom)
            region = retained.crop(window)
            bounds = core.crop(window).getbbox()
            if not bounds:
                raise ValueError(f'Empty pose {row * 4 + column}')
            width, height = bounds[2] - bounds[0], bounds[3] - bounds[1]
            if width > 224 or height > 360 or bounds[0] < 3 or bounds[2] > 253:
                raise ValueError(f'Unsafe pose bounds {row * 4 + column}: {bounds}')
            dx = (256 - width) // 2 - bounds[0]
            dy = 368 - bounds[3]
            cell = Image.new('RGBA', (256, 384))
            cell.paste(region, (dx, dy))
            if sum(cell.getchannel('A').histogram()[1:]) != sum(region.getchannel('A').histogram()[1:]):
                raise ValueError(f'Packing clipped retained pixels in pose {row * 4 + column}')
            prepared_core = cell.getchannel('A').point(lambda a: 255 if a >= 32 else 0).getbbox()
            if prepared_core[1] < 8 or prepared_core[3] != 368:
                raise ValueError('Invalid core foot baseline or top padding')
            sheet.paste(cell, (column * 256, row * 384))
            frames.append({'frame': row * 4 + column, 'direction': DIRECTIONS[row],
                           'sourceWindow': list(window), 'translation': [dx, dy],
                           'sourceCoreBounds': [column * 256 + bounds[0], top + bounds[1],
                                                column * 256 + bounds[2], top + bounds[3]],
                           'preparedBounds': list(cell.getbbox()), 'preparedCoreBounds': list(prepared_core)})
    before, after = alpha.histogram(), retained.getchannel('A').histogram()
    if sheet.getchannel('A').histogram() != after:
        raise ValueError('Packing changed retained alpha values or lost pixels')
    output = ROOT / 'world' / 'assets' / 'guests' / name
    output.mkdir(parents=True, exist_ok=True)
    (output / f'{name}-source.png').write_bytes(original)
    target = output / f'{name}.png'
    sheet.save(target, optimize=True)
    metadata = {'sourceSize': list(image.size), 'sourceSha256': hashlib.sha256(original).hexdigest(),
                'sheetSize': list(sheet.size), 'frameSize': [256, 384], 'footBaseline': 368,
                'sourceRowCuts': NEW_GUEST_CUTS[name], 'resampling': 'none',
                'cleanup': {'silhouetteMinAlpha': 32, 'edgeRadius': 2,
                            'method': 'retain original RGBA within two pixels of alpha>=32 silhouette',
                            'sourcePixels': sum(before[1:]), 'retainedPixels': sum(after[1:]),
                            'removedBackgroundPixels': sum(before[1:]) - sum(after[1:]),
                            'removedAlphaSum': sum(i * (before[i] - after[i]) for i in range(256)),
                            'retainedFaintEdgePixels': sum(after[1:32])},
                'directions': DIRECTIONS, 'idleFrames': dict(zip(DIRECTIONS, [0, 4, 8, 12])),
                'preparedSha256': hashlib.sha256(target.read_bytes()).hexdigest(), 'frames': frames}
    (output / f'{name}-frames.json').write_text(json.dumps(metadata, indent=2) + '\n', encoding='utf-8')
    (output / 'README.md').write_text(
        f'# {name.replace("-", " ").title()}\n\n'
        'User-supplied Phase 5D artwork. The original source is preserved byte for byte.\n'
        'The derivative repacks sixteen poses using inspected empty row gaps; no\n'
        'RGB pixels are redrawn, resized or resampled. Direction rows are down, left,\n'
        'right, up; each cell is 256x384, displayed at 48x72 with nearest filtering.\n'
        'The alpha>=32 silhouette is centered with exclusive foot baseline y=368.\n'
        'Original faint antialias pixels within two pixels of that silhouette are\n'
        'retained, so the faint fringe may extend to y=370 inside the padded cell.\n'
        'Only background outside that neighborhood is cleared. Cleanup counts,\n'
        'source windows, translations, bounds and hashes are in the manifest.\n\n'
        f'Rebuild: `python scripts/prepare-guest-sprites.py {name} path/to/source.png`\n', encoding='utf-8')
    print(f'{name}: 16 intact poses; removed {metadata["cleanup"]["removedBackgroundPixels"]} background pixels; '
          f'retained {metadata["cleanup"]["retainedFaintEdgePixels"]} faint edge pixels')


def prepare(name, source):
    if name in NEW_GUEST_CUTS:
        prepare_new(name, source)
    else:
        prepare_legacy(name, source)


if __name__ == '__main__':
    prepare(sys.argv[1], Path(sys.argv[2]))
