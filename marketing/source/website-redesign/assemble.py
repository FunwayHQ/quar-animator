"""Cuts "Redesign your site in Quar Animator" together, both ways round, to music.

  intro card → the live site → the page rebuilt in the editor (the whole
  artboard, its Animation Sequence, the headline's real font, playback) →
  the export, scrolled → end card on the music's breakdown

Every frame is put together here (backdrop, the shot in its window, the window
chrome, the caption) and piped to ffmpeg; cuts fall on the track's bar lines.

Usage: python3 assemble.py [out-dir] [music.mp3]
  -> marketing/quar-website-redesign-16x9.mp4, -9x16.mp4 and -cover.jpg
"""
import glob
import json
import os
import subprocess
import sys

import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '../out/website-redesign'))
MUSIC = sys.argv[2] if len(sys.argv) > 2 else os.path.expanduser('~/Downloads/Pool Table Panic.mp3')
FINAL = os.path.abspath(os.path.join(HERE, '../../quar-website-redesign'))
FPS = 30
LENGTH = 36.4                       # the track's length
BEAT, FIRST_BEAT = 60 / 139.7, 0.151  # "Pool Table Panic": 140 bpm
BAR = 4 * BEAT
BREAKDOWN = FIRST_BEAT + 67 * BEAT    # the music drops: the end card
cut = lambda bars: FIRST_BEAT + bars * BAR

LAYOUT = json.load(open(os.path.join(OUT, 'layout.json')))
MARKS = json.load(open(os.path.join(OUT, 'marks.json')))
mark = {m['name']: m['at'] - MARKS['t0'] for m in MARKS['marks']}
ease = lambda t: 0.0 if t <= 0 else 1.0 if t >= 1 else (2 * t * t if t < 0.5 else 1 - (-2 * t + 2) ** 2 / 2)


class Screencast:
    """A screencast's frames (record.mjs's concat list), by time from its start."""

    def __init__(self, name):
        lines = open(os.path.join(OUT, name, 'list.txt')).read().splitlines()
        self.files, self.starts, t = [], [], 0.0
        for i, line in enumerate(lines):
            if line.startswith('file') and i + 1 < len(lines) and lines[i + 1].startswith('duration'):
                self.files.append(line.split("'")[1])
                self.starts.append(t)
                t += float(lines[i + 1].split()[1])
        self.length, self._cache = t, (None, None)

    def at(self, t):
        index = max(0, min(len(self.files) - 1, int(np.searchsorted(self.starts, t, 'right')) - 1))
        if self._cache[0] != index:
            self._cache = (index, cv2.imread(self.files[index]))
        return self._cache[1]


class Frames:
    """Numbered still frames (stepped playback, the export), by frame number."""

    def __init__(self, pattern):
        self.files = sorted(glob.glob(os.path.join(OUT, pattern), recursive=True))
        if not self.files:
            raise SystemExit(f'no frames for {pattern}')
        self._cache = (None, None)

    def at(self, index):
        index = max(0, min(len(self.files) - 1, index))
        if self._cache[0] != index:
            self._cache = (index, cv2.imread(self.files[index]))
        return self._cache[1]


def rgba(path):
    image = cv2.imread(path, cv2.IMREAD_UNCHANGED)
    return image[:, :, :3].astype(np.float32), image[:, :, 3:4].astype(np.float32) / 255


def rounded(w, h, r, top=True):
    """A w × h mask with rounded bottom corners (and top ones, for a window with no bar)."""
    mask = np.ones((h, w), np.float32)
    corners = [((r, h - 1 - r), (slice(h - r, h), slice(0, r))), ((w - 1 - r, h - 1 - r), (slice(h - r, h), slice(w - r, w)))]
    if top:
        corners += [((r, r), (slice(0, r), slice(0, r))), ((w - 1 - r, r), (slice(0, r), slice(w - r, w)))]
    for center, region in corners:
        mask[region] = 0
        cv2.circle(mask, center, r, 1.0, -1, cv2.LINE_AA)
    return mask[:, :, None]


editor = Screencast('editor')
# The live site from its full-page screenshot (its screencast runs at ~9 fps on
# that page): a 1440 × 900 view scrolled down it, the fixed nav bar on top
FULL = cv2.imread(os.path.join(OUT, 'full.png'))


def site_view(t, length):
    y = int(round(2150 * ease((t - 0.25) / (length - 0.6))))
    view = FULL[y:y + 900].copy()
    view[:65] = FULL[:65]
    return view

play, page = Frames('editor-play/f*.jpg'), Frames('page-frames/**/*.png')


def page_view(index, y, w, h):
    """The exported page at frame `index`, `h` page px of it from `y`, scaled to w wide."""
    frame = page.at(index)
    scale = w / frame.shape[1]
    rows = int(round(h / scale))
    top = int(round(max(0, min(frame.shape[0] - rows, y))))
    return cv2.resize(frame[top:top + rows], (w, h), interpolation=cv2.INTER_AREA)


# The shots: [start, end), what's in the window, and its caption
SHOTS = [
    dict(name='intro', start=0, end=cut(2)),
    dict(name='site', start=cut(2), end=cut(4), cap='site', address='site', window='site',
         src=lambda t: site_view(t, cut(4) - cut(2))),
    dict(name='overview', start=cut(4), end=cut(5), cap='overview', address='quar', window='editor',
         src=lambda t: editor.at(mark['overview'] + 0.3 + t), detail=(440, 125)),
    dict(name='sequence', start=cut(5), end=cut(7), cap='sequence', address='quar', window='editor',
         src=lambda t: editor.at(mark['sequence'] + t), detail=(700, 85)),
    dict(name='zoom', start=cut(7), end=cut(7) + 1.3, cap='sequence', cap_from=cut(5), address='quar', window='editor',
         src=lambda t: editor.at(mark['zoom'] + t * 2.2), detail=(440, 110)),
    dict(name='select', start=cut(7) + 1.3, end=cut(9), cap='select', address='quar', window='editor',
         src=lambda t: editor.at(mark['select'] + 1.3 + t), detail=(920, 60)),
    dict(name='play', start=cut(9), end=cut(13), cap='play', address='quar', window='editor',
         src=lambda t: play.at(int(round(t * FPS))), detail=(440, 110)),
    dict(name='after', start=cut(13), end=BREAKDOWN, cap='after', address='export', window='page'),
    dict(name='outro', start=BREAKDOWN, end=LENGTH),
]


def compose(fmt):
    W, H = LAYOUT[fmt]['size']
    bg = cv2.imread(os.path.join(OUT, 'stills', f'{fmt}-bg.png'))[:, :, :3].astype(np.float32)
    cards = {k: Screencast(f'cards/{fmt}-{k}') for k in ('intro', 'outro')}
    still = lambda name: rgba(os.path.join(OUT, 'stills', f'{fmt}-{name}.png'))
    caps = {s['cap']: still(f"cap-{s['cap']}") for s in SHOTS if 'cap' in s}
    chrome = {}
    masks = {}

    def window_box(kind):
        return LAYOUT['wide']['window'] if fmt == 'wide' else LAYOUT['tall'][kind]

    def paste(canvas, image, box, kind, address):
        x, y, w, h = box['x'], box['y'], box['w'], box['h']
        key = (kind, w, h)
        if key not in masks:
            masks[key] = rounded(w, h, 22, top=kind == 'detail')
        m = masks[key]
        canvas[y:y + h, x:x + w] = canvas[y:y + h, x:x + w] * (1 - m) + image.astype(np.float32) * m
        name = f"frame-{'window' if fmt == 'wide' else kind}-{address}"
        if name not in chrome:
            chrome[name] = still(name)
        color, a = chrome[name]
        canvas[:] = canvas * (1 - a) + color * a

    def frame_at(t):
        shot = next(s for s in SHOTS if s['start'] <= t < s['end'] or s is SHOTS[-1])
        local = t - shot['start']
        if shot['name'] in cards:
            return cards[shot['name']].at(local)
        canvas = bg.copy()
        if shot['name'] == 'after':
            index = int(round(local * FPS))
            box = window_box('page')
            if fmt == 'wide':
                # A visitor's view, scrolled down to the banner as the page reveals
                y = 1540 * ease((index - 20) / 130)
                paste(canvas, page_view(index, y, box['w'], box['h']), box, 'page', 'export')
            else:
                y = 1414 * ease((index - 20) / 150)
                paste(canvas, page_view(index, y, box['w'], box['h']), box, 'page', 'export')
        else:
            image = shot['src'](local)
            if shot['window'] == 'site':
                box = window_box('site')
                scaled = cv2.resize(image, (box['w'], int(round(image.shape[0] * box['w'] / image.shape[1]))), interpolation=cv2.INTER_AREA)
                paste(canvas, scaled[:box['h']], box, 'site', 'site')
            else:
                box = window_box('editor')
                paste(canvas, cv2.resize(image, (box['w'], box['h']), interpolation=cv2.INTER_AREA), box, 'editor', 'quar')
                if fmt == 'tall':
                    # The part that matters, at full size, under the whole editor
                    dx, dy = shot['detail']
                    d = window_box('detail')
                    paste(canvas, image[dy:dy + d['h'], dx:dx + d['w']], d, 'detail', 'quar')
        color, a = caps[shot['cap']]
        fade = min(1.0, (t - shot.get('cap_from', shot['start'])) / 0.2)
        canvas[:] = canvas * (1 - a * fade) + color * (a * fade)
        return np.clip(canvas, 0, 255).astype(np.uint8)

    return W, H, frame_at


def render(fmt, target):
    W, H, frame_at = compose(fmt)
    # (the picture alone, until the music's muxed in: kept out of sight in OUT)
    video = os.path.join(OUT, os.path.basename(target) + '.video.mp4')
    encoder = subprocess.Popen(
        ['ffmpeg', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{W}x{H}', '-r', str(FPS),
         '-i', '-', '-c:v', 'libx264', '-crf', '17', '-preset', 'medium', '-pix_fmt', 'yuv420p', video],
        stdin=subprocess.PIPE)
    total = int(round(LENGTH * FPS))
    for i in range(total):
        encoder.stdin.write(frame_at(i / FPS).tobytes())
    encoder.stdin.close()
    encoder.wait()
    # The track under it all: in quickly, out over the last 1.5 s
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', video, '-i', MUSIC,
                    '-filter_complex', f'[1:a]atrim=0:{LENGTH},afade=t=in:d=0.08,afade=t=out:st={LENGTH - 1.5}:d=1.5[a];'
                    f'[0:v]fade=t=out:st={LENGTH - 0.6}:d=0.6[v]',
                    '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-crf', '17', '-preset', 'medium', '-pix_fmt', 'yuv420p',
                    '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-shortest', target], check=True)
    os.remove(video)
    print(fmt, total, 'frames ->', target)


if __name__ == '__main__':
    for fmt, suffix in (('wide', '16x9'), ('tall', '9x16')):
        render(fmt, f'{FINAL}-{suffix}.mp4')
    # The cover: the page alive, mid-reveal, from the wide cut
    at = cut(13) + 3.2
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-ss', f'{at:.2f}', '-i', f'{FINAL}-16x9.mp4',
                    '-frames:v', '1', '-q:v', '2', f'{FINAL}-cover.jpg'], check=True)
    print('->', f'{FINAL}-cover.jpg')
