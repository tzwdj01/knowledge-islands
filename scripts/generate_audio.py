#!/usr/bin/env python3
"""Generate bundled offline Mandarin narration for all 662 tasks.

Requires macOS `say` with Tingting and ffmpeg. All spoken scripts are original
game prompts from catalog.json. Generated files are checked into public/audio.
"""

import json
import re
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / 'src/data/catalog.json'
OUT = ROOT / 'public/audio'
OUT.mkdir(parents=True, exist_ok=True)


def spoken(text):
    return (text.replace('×', '乘').replace('÷', '除以').replace('=', '等于')
            .replace(' - ', ' 减 ').replace(' + ', ' 加 ')
            .replace('□', '方框').replace('>', '大于').replace('<', '小于')
            .replace('?', '几').replace('？', '？').replace('●', '圆点'))


def item(point):
    task = point['task']
    if task['mode'] == 'auto':
        for variant in task['variants']:
            yield variant['audio'], variant.get('speechText', variant['prompt']), False, False, False
    else:
        first = task['checklist'][0]
        intro_task = point['id'].startswith(('YW1-U0-', 'SX1-U0-'))
        yield task['audio'], task['instruction'] + task['practice'] + '小目标：' + first, True, point['type'] == '朗读背诵', intro_task


def render(job):
    name, script, self_task, reading_task, intro_task = job
    target = OUT / Path(name).name
    refresh_ids = next((arg.split('=', 1)[1].split(',') for arg in sys.argv if arg.startswith('--refresh-ids=')), [])
    point_id = target.stem.rsplit('-', 1)[0] if target.stem.rsplit('-', 1)[-1].isdigit() else target.stem
    force = '--force' in sys.argv or ('--refresh-self' in sys.argv and self_task) or ('--refresh-reading' in sys.argv and reading_task) or ('--refresh-intro' in sys.argv and intro_task) or point_id in refresh_ids
    if not force and target.exists() and target.stat().st_size > 200:
        return 'cached'
    with tempfile.TemporaryDirectory() as tmp:
        aiff = Path(tmp) / 'voice.aiff'
        subprocess.run(['say', '-v', 'Tingting', '-r', '190', '-o', str(aiff), spoken(script)], check=True, timeout=30, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        encoded = Path(tmp) / 'voice.mp3'
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', str(aiff), '-ac', '1', '-ar', '22050', '-b:a', '32k', str(encoded)], check=True, timeout=30, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        encoded.replace(target)
    return 'created'


def main():
    catalog = json.loads(CATALOG.read_text())
    jobs = [j for point in catalog['points'] for j in item(point)]
    jobs += [('audio/ui-correct.mp3', '答对啦！继续加油。', False, False, False),
             ('audio/ui-try.mp3', '再想一想，听听提示。', False, False, False),
             ('audio/ui-star.mp3', '获得一颗星星！', False, False, False)]
    created = cached = 0
    with ThreadPoolExecutor(max_workers=4) as pool:
        for i, future in enumerate(as_completed(pool.submit(render, j) for j in jobs), 1):
            result = future.result()
            created += result == 'created'
            cached += result == 'cached'
            if i % 100 == 0 or i == len(jobs):
                print(f'{i}/{len(jobs)} files; created={created}, cached={cached}', flush=True)
    if '--prune' in sys.argv:
        expected = {Path(name).name for name, *_ in jobs}
        removed = 0
        for old in OUT.glob('*.mp3'):
            if old.name not in expected:
                old.unlink()
                removed += 1
        print(f'removed {removed} unused audio files', flush=True)


if __name__ == '__main__':
    main()
