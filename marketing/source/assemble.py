"""Cut the marketing video together from the recorded clips (see record.cjs)."""
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')
SHOWCASE_FRAMES = os.path.join(OUT, 'showcase-frames', 'frame_%03d.png')
FINAL = sys.argv[1] if len(sys.argv) > 1 else os.path.join(OUT, 'quar-animator-promo-16x9.mp4')
FPS = 30
FADE = 0.5
SPEEDUP = 2.6


def run(args):
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', *args], check=True)


def duration(path):
    out = subprocess.run(
        ['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path],
        capture_output=True, text=True, check=True)
    return float(out.stdout.strip())


def encode_list(name):
    """A clip's frames, at their recorded timing, as constant 30 fps."""
    target = os.path.join(OUT, f'{name}.mp4')
    run(['-f', 'concat', '-safe', '0', '-i', os.path.join(OUT, name, 'list.txt'),
         '-vf', f'fps={FPS},scale=1920:1080:flags=lanczos,format=yuv420p',
         '-c:v', 'libx264', '-crf', '12', '-preset', 'medium', target])
    return target


intro = encode_list('intro')
outro = encode_list('outro')
creation = encode_list('creation')

# The editor session: building steps sped up, the playback at real speed
marks = json.load(open(os.path.join(OUT, 'creation', 'marks.json')))
play_step = next(m['at'] for m in marks if m['step'] == 6)
play_start = play_step + 1.1  # the click on the canvas, then Space
play_end = min(play_start + 6.0, duration(creation) - 0.2)
creation_cut = os.path.join(OUT, 'creation-cut.mp4')
run(['-i', creation, '-filter_complex',
     f'[0:v]trim=0:{play_start:.2f},setpts=(PTS-STARTPTS)/{SPEEDUP},fps={FPS}[a];'
     f'[0:v]trim={play_start:.2f}:{play_end:.2f},setpts=PTS-STARTPTS,fps={FPS}[b];'
     '[a][b]concat=n=2:v=1:a=0,format=yuv420p[v]',
     '-map', '[v]', '-c:v', 'libx264', '-crf', '12', '-preset', 'medium', creation_cut])

# The showcase, rendered by the app (PNG sequence), cropped to its artboard, held at the end
showcase = os.path.join(OUT, 'showcase.mp4')
run(['-framerate', str(FPS), '-i', SHOWCASE_FRAMES,
     '-vf', 'crop=1920:1080:15:65,tpad=stop_mode=clone:stop_duration=0.8,format=yuv420p',
     '-c:v', 'libx264', '-crf', '12', '-preset', 'medium', showcase])

# Crossfade it all together
clips = [intro, creation_cut, showcase, outro]
lengths = [duration(c) for c in clips]
inputs = sum((['-i', c] for c in clips), [])
graph = []
offset = 0.0
prev = '0:v'
for i in range(1, len(clips)):
    offset += lengths[i - 1] - FADE
    label = f'x{i}'
    graph.append(f'[{prev}][{i}:v]xfade=transition=fade:duration={FADE}:offset={offset:.3f}[{label}]')
    prev = label
total = sum(lengths) - FADE * (len(clips) - 1)
graph.append(f'[{prev}]format=yuv420p[v]')
run([*inputs, '-f', 'lavfi', '-t', f'{total:.3f}', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
     '-filter_complex', ';'.join(graph), '-map', '[v]', '-map', f'{len(clips)}:a',
     '-c:v', 'libx264', '-profile:v', 'high', '-crf', '18', '-preset', 'slow', '-r', str(FPS),
     '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart', FINAL])
print('lengths', [round(x, 2) for x in lengths], 'total', round(total, 2), '->', FINAL)

# Square and vertical cuts: the video over the backdrops layouts.cjs renders
for name, top, suffix in [('vertical', 656, '9x16'), ('square', 236, '1x1')]:
    backdrop = os.path.join(OUT, f'bg-{name}.png')
    if not os.path.exists(backdrop):
        print('no', backdrop, '- run layouts.cjs for the', suffix, 'cut')
        continue
    target = FINAL.replace('16x9', suffix)
    run(['-loop', '1', '-i', backdrop, '-i', FINAL, '-filter_complex',
         f'[1:v]scale=1080:608:flags=lanczos[v];[0:v][v]overlay=0:{top}:shortest=1,format=yuv420p[out]',
         '-map', '[out]', '-map', '1:a', '-c:v', 'libx264', '-profile:v', 'high', '-crf', '18',
         '-preset', 'slow', '-r', str(FPS), '-c:a', 'copy', '-movflags', '+faststart', target])
    print('->', target)

