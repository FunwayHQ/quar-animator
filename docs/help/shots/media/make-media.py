"""
The videos the "Video and GIF clips" pictures import (video-clips.mjs):

  sunrise.mp4      4 s, 640 x 360, 24 fps, H.264 + AAC: the sun coming up
                   over two hills, birds crossing, a plucked tune
  bouncing-ball.gif  0.8 s, 160 x 160, 16 frames of 50 ms, looping forever:
                   a ball bouncing and squashing, on nothing (transparent)

Run it again to make them again (Python 3 with Pillow, and ffmpeg):

  python3 docs/help/shots/media/make-media.py
"""

import math
import os
import shutil
import struct
import subprocess
import tempfile
import wave

from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
SUPER = 2  # drawn at twice the size, then scaled down: smooth edges


def mix(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def smooth(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


# ---------------------------------------------------------------------------
# sunrise.mp4
# ---------------------------------------------------------------------------

W, H, FPS, SECONDS = 640, 360, 24, 4
FRAMES = FPS * SECONDS


def sky(t):
    """The sky's top and bottom colours, from before dawn to morning."""
    top = mix((24, 22, 72), (64, 120, 196), smooth(t))
    bottom = mix((190, 60, 110), (252, 196, 120), smooth(t))
    return top, bottom


def hill(draw, w, h, base, height, phase, color):
    points = [(0, h)]
    for i in range(0, 65):
        x = w * i / 64
        y = base - height * (0.6 * math.sin(x / w * 5.2 + phase) + 0.4 * math.sin(x / w * 11.3 + phase * 1.7))
        points.append((x, y))
    points.append((w, h))
    draw.polygon(points, fill=color)


def sunrise_frame(i):
    t = i / (FRAMES - 1)
    w, h = W * SUPER, H * SUPER
    image = Image.new('RGB', (w, h))
    draw = ImageDraw.Draw(image)
    top, bottom = sky(t)
    for y in range(h):
        draw.line([(0, y), (w, y)], fill=mix(top, bottom, (y / h) ** 1.2))

    # The sun and its glow, rising
    sun_x = w * 0.62
    sun_y = h * (0.95 - 0.55 * smooth(t))
    radius = h * 0.13
    glow = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    g = ImageDraw.Draw(glow)
    for k in range(10, 0, -1):
        r = radius * (1 + k * 0.35)
        g.ellipse([sun_x - r, sun_y - r, sun_x + r, sun_y + r], fill=(255, 214, 140, 14))
    image.paste(glow, (0, 0), glow)
    draw.ellipse(
        [sun_x - radius, sun_y - radius, sun_x + radius, sun_y + radius],
        fill=mix((255, 150, 90), (255, 236, 170), smooth(t)),
    )

    # Clouds drifting
    for cx, cy, s, speed in ((0.18, 0.22, 1.0, 40), (0.78, 0.15, 0.8, 26), (0.45, 0.32, 0.6, 55)):
        x = (cx * w + speed * SUPER * t * SECONDS) % (w * 1.2) - w * 0.1
        y = cy * h
        color = mix((120, 70, 130), (255, 244, 236), smooth(t)) + (210,)
        layer = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        c = ImageDraw.Draw(layer)
        for dx, dy, r in ((0, 0, 30), (34, -10, 26), (64, 2, 22), (-30, 6, 20)):
            r *= s * SUPER
            c.ellipse(
                [x + dx * s * SUPER - r, y + dy * s * SUPER - r, x + dx * s * SUPER + r, y + dy * s * SUPER + r],
                fill=color,
            )
        image.paste(layer, (0, 0), layer)

    # Two hills, the far one lighter
    hill(draw, w, h, h * 0.80, h * 0.07, 0.4 + t * 0.15, mix((70, 40, 96), (88, 128, 120), smooth(t)))
    hill(draw, w, h, h * 0.90, h * 0.05, 2.1 + t * 0.3, mix((34, 24, 60), (40, 84, 70), smooth(t)))

    # Birds crossing
    for k, (start, height, size) in enumerate(((-0.1, 0.42, 1.0), (-0.22, 0.36, 0.8), (-0.3, 0.47, 0.7))):
        x = (start + 0.45 * t * SECONDS / 3) * w
        y = height * h + math.sin(t * 9 + k) * 6 * SUPER
        flap = math.sin(t * 40 + k * 2) * 5 * SUPER * size
        span = 12 * SUPER * size
        draw.line(
            [(x - span, y - flap), (x, y), (x + span, y - flap)],
            fill=(30, 24, 48),
            width=int(3 * SUPER * size),
            joint='curve',
        )

    return image.resize((W, H), Image.LANCZOS)


def plucked_wav(path, notes, seconds, rate=44100):
    """A mono 16-bit WAV of plucked notes, one after another, with a soft fifth under them."""
    count = int(seconds * rate)
    per = count / len(notes)
    frames = bytearray()
    for i in range(count):
        n = int(i / per)
        t = (i - n * per) / rate
        envelope = math.exp(-t * 3.0) * min(1.0, t * 200)
        value = math.sin(2 * math.pi * notes[n] * t) * envelope * 0.55
        value += math.sin(2 * math.pi * notes[n] * 2 * t) * envelope * 0.12
        pad = 0.12 * math.sin(2 * math.pi * 130.81 * i / rate) * min(1.0, i / rate) * min(1.0, (count - i) / rate)
        frames += struct.pack('<h', int(max(-1, min(1, value + pad)) * 32767))
    with wave.open(path, 'wb') as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(rate)
        out.writeframes(bytes(frames))


def make_sunrise(work):
    for i in range(FRAMES):
        sunrise_frame(i).save(os.path.join(work, f'sun_{i:03d}.png'))
    wav = os.path.join(work, 'tune.wav')
    plucked_wav(wav, [392, 523.25, 659.25, 783.99, 659.25, 523.25, 587.33, 783.99], SECONDS)
    subprocess.run(
        [
            'ffmpeg', '-y', '-loglevel', 'error',
            '-framerate', str(FPS), '-i', os.path.join(work, 'sun_%03d.png'),
            '-i', wav,
            '-c:v', 'libx264', '-profile:v', 'main', '-pix_fmt', 'yuv420p', '-crf', '30',
            '-preset', 'slow', '-g', '24', '-movflags', '+faststart',
            '-c:a', 'aac', '-b:a', '64k', '-ac', '1',
            '-shortest',
            os.path.join(HERE, 'sunrise.mp4'),
        ],
        check=True,
    )


# ---------------------------------------------------------------------------
# bouncing-ball.gif
# ---------------------------------------------------------------------------

BALL_SIZE, BALL_FRAMES = 160, 16


def ball_frame(i):
    s = BALL_SIZE * 4
    image = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    t = i / BALL_FRAMES
    # Up and down on a parabola, squashed where it lands
    height = 1 - (2 * t - 1) ** 2
    radius = s * 0.16
    ground = s * 0.9
    squash = max(0.0, 1 - height / 0.12) * 0.35
    rx = radius * (1 + squash)
    ry = radius * (1 - squash * 0.8)
    cy = ground - ry - height * s * 0.58
    cx = s / 2
    # Its shadow, smaller as it rises
    shadow = radius * (1.1 - 0.6 * height)
    draw.ellipse([cx - shadow, ground - shadow * 0.22, cx + shadow, ground + shadow * 0.22], fill=(20, 16, 40, 150))
    color = mix((236, 72, 153), (168, 85, 247), height)
    draw.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=color + (255,))
    # A highlight
    hx, hy, hr = cx - rx * 0.35, cy - ry * 0.4, radius * 0.28
    draw.ellipse([hx - hr, hy - hr * 0.8, hx + hr, hy + hr * 0.8], fill=(255, 255, 255, 170))
    return image.resize((BALL_SIZE, BALL_SIZE), Image.LANCZOS)


def make_ball(work):
    for i in range(BALL_FRAMES):
        ball_frame(i).save(os.path.join(work, f'ball_{i:02d}.png'))
    frames = os.path.join(work, 'ball_%02d.png')
    palette = os.path.join(work, 'palette.png')
    subprocess.run(
        ['ffmpeg', '-y', '-loglevel', 'error', '-framerate', '20', '-i', frames,
         '-vf', 'palettegen=reserve_transparent=1:max_colors=64', palette],
        check=True,
    )
    subprocess.run(
        ['ffmpeg', '-y', '-loglevel', 'error', '-framerate', '20', '-i', frames, '-i', palette,
         '-lavfi', 'paletteuse=alpha_threshold=128:dither=none', '-loop', '0',
         os.path.join(HERE, 'bouncing-ball.gif')],
        check=True,
    )


if __name__ == '__main__':
    work = tempfile.mkdtemp(prefix='quar-help-media-')
    try:
        make_sunrise(work)
        make_ball(work)
    finally:
        shutil.rmtree(work)
    for name in ('sunrise.mp4', 'bouncing-ball.gif'):
        print(name, os.path.getsize(os.path.join(HERE, name)), 'bytes')
