"""Assemble rendered PNG frames into browser-compatible transparent WebP animation.
Usage: python3 student/assemble-scholar.py <frames-directory> <assets-directory>
Requires Pillow and FFmpeg (libwebp_anim encoder). The source mesh/rig/texture are deliberately not copied.
"""
from pathlib import Path
import sys
import subprocess
from PIL import Image

frames_dir, out = (Path(value) for value in sys.argv[1:])
out.mkdir(parents=True, exist_ok=True)
for action in ['idle', 'nod', 'wave', 'explain', 'emphasis']:
    paths = sorted((frames_dir / action).glob('*.png'))
    expected = {'idle': 60, 'nod': 36, 'wave': 57, 'explain': 54, 'emphasis': 42}[action]
    if len(paths) != expected:
        raise ValueError(f'{action}: expected {expected} frames, found {len(paths)}')
    for path in paths:
        with Image.open(path) as frame:
            bounds = frame.getchannel('A').point(lambda value: 255 if value > 16 else 0).getbbox()
            if not bounds or min(bounds[0], bounds[1], frame.width - bounds[2], frame.height - bounds[3]) < 4:
                raise ValueError(f'{path}: character touches the render edge; adjust the pose or camera')
    target = out / (action + '.webp')
    subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-framerate','15',
                    '-i',str(frames_dir / action / '%04d.png'),'-c:v','libwebp_anim',
                    '-quality','82','-compression_level','3','-loop','0','-y',str(target)],check=True)
    # FFmpeg defaults ANIM's canvas background to white. Keep disposal transparent.
    data = bytearray(target.read_bytes())
    cursor = 12
    while cursor + 8 <= len(data):
        size = int.from_bytes(data[cursor + 4:cursor + 8], 'little')
        if data[cursor:cursor + 4] == b'ANIM':
            data[cursor + 8:cursor + 12] = bytes(4)
            break
        cursor += 8 + size + size % 2
    target.write_bytes(data)
    if action == 'idle':
        with Image.open(paths[0]) as still:
            still.save(out / 'still.webp', 'WEBP', quality=90, method=6)
    print(f'{target}: {len(paths)} frames, {target.stat().st_size:,} bytes')
