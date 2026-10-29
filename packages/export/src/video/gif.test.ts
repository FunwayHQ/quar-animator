import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { GIFEncoder } from 'gifenc';
import { describe, expect, it } from 'vitest';

import { pixelOf, solid, writeTestGif, type Rgb } from '../__fixtures__/gifs';
import {
  createGifCompositor,
  decodeGifIndices,
  gifFrameAt,
  gifHasTransparency,
  gifMayBeTransparent,
  isGifData,
  isGifFile,
  readGif,
} from './gif';

/** The small GIFs the app's tests use (apps/web/src/test/fixtures/video, its README says what each is). */
function fixture(name: string): Uint8Array {
  return new Uint8Array(
    readFileSync(resolve(__dirname, '../../../../apps/web/src/test/fixtures/video', name))
  );
}

/** The colours the fixtures' frames are drawn in, frame by frame. */
const COLOURS: Rgb[] = [
  [230, 25, 75],
  [60, 180, 75],
  [255, 225, 25],
  [0, 130, 200],
  [245, 130, 48],
  [145, 30, 180],
  [70, 240, 240],
  [240, 50, 230],
  [210, 245, 60],
  [128, 128, 128],
];

const RED: Rgb = [255, 0, 0];
const GREEN: Rgb = [0, 255, 0];
const BLUE: Rgb = [0, 0, 255];
const WHITE: Rgb = [255, 255, 255];
const PALETTE: Rgb[] = [RED, GREEN, BLUE, WHITE];

const opaque = (colour: Rgb) => [...colour, 255];

/** Whether two pictures (or runs of indices) are the same, byte for byte (quicker than toEqual). */
const same = (a: ArrayLike<number>, b: ArrayLike<number>) =>
  Buffer.from(Uint8Array.from(a)).equals(Buffer.from(Uint8Array.from(b)));
const CLEAR = [0, 0, 0, 0];

/** How many white 5 px blocks the counter fixture's bar has (on row 3). */
function barBlocks(picture: Uint8ClampedArray, width: number): number {
  let x = 0;
  while (
    x < width &&
    pixelOf(picture, width, x, 3)[0] === 255 &&
    pixelOf(picture, width, x, 3)[2] === 255
  )
    x++;
  return x / 5;
}

describe('readGif', () => {
  it('reads a GIF’s size, its frames and their delays', () => {
    const gif = readGif(fixture('gif-counter.gif'));
    expect(gif.width).toBe(64);
    expect(gif.height).toBe(36);
    expect(gif.frames.map((frame) => frame.duration)).toEqual([
      0.1, 0.1, 0.15, 0.05, 0.1, 0.15, 0.05, 0.1, 0.15, 0.05,
    ]);
    expect(gif.frames.map((frame) => frame.timestamp)).toEqual([
      0, 0.1, 0.2, 0.35, 0.4, 0.5, 0.65, 0.7, 0.8, 0.95,
    ]);
    expect(gif.duration).toBe(1);
  });

  it('plays a delay of 10 ms or less as 100 ms, as browsers do', () => {
    const gif = readGif(
      writeTestGif({
        width: 2,
        height: 2,
        palette: PALETTE,
        frames: [0, 1, 2, 7].map((delay, i) => ({
          width: 2,
          height: 2,
          pixels: solid(2, 2, i % 4),
          delay,
        })),
      })
    );
    expect(gif.frames.map((frame) => frame.duration)).toEqual([0.1, 0.1, 0.02, 0.07]);
    expect(gif.duration).toBeCloseTo(0.29, 9);
  });

  it('reads where each frame goes and how it’s disposed of', () => {
    const gif = readGif(fixture('gif-transparent.gif'));
    expect(gif.frames).toHaveLength(10);
    expect(gif.frames[0]).toMatchObject({ left: 4, top: 12, width: 12, height: 12, disposal: 2 });
    expect(gif.frames[0]!.transparentIndex).toBeGreaterThanOrEqual(0);
  });

  it('keeps the whole frames of a file cut short', () => {
    const bytes = fixture('gif-counter.gif');
    const gif = readGif(bytes.subarray(0, Math.floor(bytes.length * 0.6)));
    expect(gif.frames.length).toBeGreaterThan(0);
    expect(gif.frames.length).toBeLessThan(10);
  });

  it('throws for what isn’t a GIF, or has no pictures', () => {
    expect(() => readGif(fixture('not-a-video.mp4'))).toThrow();
    expect(() => readGif(fixture('gif-counter.gif').subarray(0, 40))).toThrow();
  });

  it('knows a GIF by its first bytes', async () => {
    expect(isGifData(fixture('gif-still.gif'))).toBe(true);
    expect(isGifData(fixture('clip-no-audio.mp4'))).toBe(false);
    expect(await isGifFile(new Blob([fixture('gif-counter.gif')]))).toBe(true);
    expect(await isGifFile(new Blob([fixture('clip-vp9-alpha.webm')]))).toBe(false);
  });
});

describe('gifFrameAt', () => {
  const gif = readGif(fixture('gif-counter.gif'));

  it('is the frame showing at a moment', () => {
    expect(gifFrameAt(gif, 0)).toBe(0);
    expect(gifFrameAt(gif, 0.0999)).toBe(0);
    expect(gifFrameAt(gif, 0.1)).toBe(1);
    expect(gifFrameAt(gif, 0.36)).toBe(3);
    expect(gifFrameAt(gif, 0.96)).toBe(9);
  });

  it('is the last frame past the end, none before the start', () => {
    expect(gifFrameAt(gif, 5)).toBe(9);
    expect(gifFrameAt(gif, -0.01)).toBe(-1);
    expect(gifFrameAt(gif, Number.NaN)).toBe(-1);
  });
});

describe('decodeGifIndices', () => {
  it('decodes a picture whose codes fill the table, as another encoder wrote it', () => {
    // Noise in 256 colours, so the LZW table fills and starts again many times
    const width = 160;
    const height = 120;
    const pixels = new Uint8Array(width * height);
    let seed = 7;
    for (let i = 0; i < pixels.length; i++) {
      seed = (seed * 1103515245 + 12345) >>> 0;
      pixels[i] = i % 3 === 0 ? (seed >>> 16) & 0xff : (pixels[i - 1] ?? 0);
    }
    const palette = Array.from({ length: 256 }, (_, i) => [i, 255 - i, (i * 7) & 0xff]);
    const encoder = GIFEncoder();
    encoder.writeFrame(pixels, width, height, { palette });
    encoder.finish();
    const bytes = encoder.bytes();
    const gif = readGif(bytes);
    const out = new Uint8Array(width * height);
    expect(decodeGifIndices(bytes, gif.frames[0]!, out)).toBe(width * height);
    expect(same(out, pixels)).toBe(true);
  });

  it('gives what it can of a picture cut short', () => {
    const bytes = writeTestGif({
      width: 8,
      height: 8,
      palette: PALETTE,
      frames: [{ width: 8, height: 8, pixels: solid(8, 8, 2) }],
    });
    const gif = readGif(bytes);
    const frame = gif.frames[0]!;
    // Its data's first sub-block shortened to a few bytes, then the end
    const cut = bytes.slice();
    cut[frame.dataOffset] = 6;
    cut[frame.dataOffset + 7] = 0;
    const out = new Uint8Array(64);
    const count = decodeGifIndices(cut, frame, out);
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(64);
    expect([...out.subarray(0, count)].every((index) => index === 2)).toBe(true);
  });
});

describe('createGifCompositor', () => {
  it('draws each frame over the one before, where it changed', () => {
    const bytes = fixture('gif-counter.gif');
    const gif = readGif(bytes);
    // Every frame after the first is only the part that changed
    expect(gif.frames.slice(1).every((frame) => frame.width < 64)).toBe(true);
    const compositor = createGifCompositor(bytes, gif);
    for (let i = 0; i < 10; i++) {
      const picture = compositor.pictureAt(i);
      expect(pixelOf(picture, 64, 31, 19)).toEqual(opaque(COLOURS[i]!));
      expect(barBlocks(picture, 64)).toBe(i + 1);
      // The background, drawn by the first frame alone
      expect(pixelOf(picture, 64, 60, 32)).toEqual(opaque([32, 32, 32]));
    }
  });

  it('gives the same pictures in any order: going back starts again from a picture it kept', () => {
    const bytes = fixture('gif-counter.gif');
    const gif = readGif(bytes);
    const inOrder = createGifCompositor(bytes, gif);
    const expected = gif.frames.map((_, i) => inOrder.pictureAt(i).slice());
    for (const keepBytes of [0, 64 * 36 * 4 * 3, undefined]) {
      const compositor = createGifCompositor(bytes, gif, { keepBytes });
      for (const i of [7, 2, 9, 0, 9, 5, 5, 6, 3, 8, 1, 4]) {
        expect(same(compositor.pictureAt(i), expected[i]!)).toBe(true);
      }
    }
  });

  it('keeps no more pictures than it’s given room for', () => {
    const bytes = fixture('gif-counter.gif');
    const gif = readGif(bytes);
    const picture = 64 * 36 * 4;
    const compositor = createGifCompositor(bytes, gif, { keepBytes: picture * 3 });
    for (let i = 0; i < 10; i++) compositor.pictureAt(i);
    for (let i = 9; i >= 0; i--) compositor.pictureAt(i);
    expect(compositor.keptPictures).toBeLessThanOrEqual(3);
    expect(compositor.keptPictures).toBeGreaterThan(0);
    const none = createGifCompositor(bytes, gif, { keepBytes: 0 });
    for (let i = 0; i < 10; i++) none.pictureAt(i);
    expect(none.keptPictures).toBe(0);
  });

  it('clears a frame disposed of to the background, leaving it transparent', () => {
    const bytes = fixture('gif-transparent.gif');
    const gif = readGif(bytes);
    const compositor = createGifCompositor(bytes, gif);
    for (let i = 0; i < 10; i++) {
      const picture = compositor.pictureAt(i);
      const x = 4 + 5 * i;
      expect(pixelOf(picture, 64, x + 6, 18)).toEqual(opaque(COLOURS[i]!));
      // Where the square was a frame ago, and the corners: nothing
      if (i > 0) expect(pixelOf(picture, 64, x - 3, 18)).toEqual(CLEAR);
      expect(pixelOf(picture, 64, 0, 0)).toEqual(CLEAR);
      expect(pixelOf(picture, 64, 63, 35)).toEqual(CLEAR);
    }
  });

  it('puts back what a frame covered when it says so, and clears what it says to', () => {
    const bytes = writeTestGif({
      width: 8,
      height: 4,
      palette: PALETTE,
      frames: [
        { width: 8, height: 4, pixels: solid(8, 4, 0) },
        // Green over the left half, then put back (red again)
        { left: 0, top: 0, width: 4, height: 4, pixels: solid(4, 4, 1), disposal: 3 },
        // Blue over the right half, then cleared
        { left: 4, top: 0, width: 4, height: 4, pixels: solid(4, 4, 2), disposal: 2 },
        // White in the top left corner, left there
        { left: 0, top: 0, width: 2, height: 2, pixels: solid(2, 2, 3), disposal: 1 },
      ],
    });
    const compositor = createGifCompositor(bytes, readGif(bytes));
    const at = (frame: number, x: number, y: number) =>
      pixelOf(compositor.pictureAt(frame), 8, x, y);
    expect(at(1, 1, 1)).toEqual(opaque(GREEN));
    expect(at(1, 6, 1)).toEqual(opaque(RED));
    expect(at(2, 1, 1)).toEqual(opaque(RED));
    expect(at(2, 6, 1)).toEqual(opaque(BLUE));
    expect(at(3, 0, 0)).toEqual(opaque(WHITE));
    expect(at(3, 3, 3)).toEqual(opaque(RED));
    expect(at(3, 6, 1)).toEqual(CLEAR);
    // Back to the frame that was put back, and on again
    expect(at(1, 6, 1)).toEqual(opaque(RED));
    expect(at(2, 1, 1)).toEqual(opaque(RED));
    expect(at(3, 6, 1)).toEqual(CLEAR);
  });

  it('draws only the colours that aren’t its transparent one', () => {
    const bytes = writeTestGif({
      width: 4,
      height: 1,
      palette: PALETTE,
      frames: [
        { width: 4, height: 1, pixels: [0, 0, 0, 0] },
        { width: 4, height: 1, pixels: [3, 1, 3, 2], transparentIndex: 3 },
      ],
    });
    const picture = createGifCompositor(bytes, readGif(bytes)).pictureAt(1);
    expect([0, 1, 2, 3].map((x) => pixelOf(picture, 4, x, 0))).toEqual([
      opaque(RED),
      opaque(GREEN),
      opaque(RED),
      opaque(BLUE),
    ]);
  });

  it('puts an interlaced frame’s rows where they go, and a frame’s own palette', () => {
    const height = 11;
    const rows = Array.from({ length: height }, (_, row) => row % 4);
    const bytes = writeTestGif({
      width: 3,
      height,
      palette: [WHITE, WHITE],
      frames: [
        {
          width: 3,
          height,
          pixels: rows.flatMap((colour) => [colour, colour, colour]),
          palette: PALETTE,
          interlaced: true,
        },
      ],
    });
    const gif = readGif(bytes);
    expect(gif.frames[0]!.interlaced).toBe(true);
    const picture = createGifCompositor(bytes, gif).pictureAt(0);
    for (let row = 0; row < height; row++) {
      expect(pixelOf(picture, 3, 1, row)).toEqual(opaque(PALETTE[row % 4]!));
    }
  });

  it('leaves what’s past the GIF’s edge undrawn', () => {
    const bytes = writeTestGif({
      width: 4,
      height: 4,
      palette: PALETTE,
      frames: [{ left: 2, top: 2, width: 4, height: 4, pixels: solid(4, 4, 1) }],
    });
    const picture = createGifCompositor(bytes, readGif(bytes)).pictureAt(0);
    expect(pixelOf(picture, 4, 3, 3)).toEqual(opaque(GREEN));
    expect(pixelOf(picture, 4, 1, 1)).toEqual(CLEAR);
  });
});

describe('gifHasTransparency', () => {
  it('is false for a GIF whose frames cover each other, true for one that shows through', async () => {
    const counter = fixture('gif-counter.gif');
    expect(await gifHasTransparency(counter, readGif(counter))).toBe(false);
    const transparent = fixture('gif-transparent.gif');
    expect(await gifHasTransparency(transparent, readGif(transparent))).toBe(true);
  });

  it('sees a frame put back to show nothing', async () => {
    const bytes = writeTestGif({
      width: 2,
      height: 1,
      palette: PALETTE,
      frames: [
        { width: 2, height: 1, pixels: [0, 0], disposal: 2 },
        { width: 2, height: 1, pixels: [1, 1], disposal: 3 },
        { width: 1, height: 1, pixels: [2] },
      ],
    });
    expect(await gifHasTransparency(bytes, readGif(bytes))).toBe(true);
  });

  it('is false where a transparent colour only lets the frame before show', async () => {
    const bytes = writeTestGif({
      width: 2,
      height: 1,
      palette: PALETTE,
      frames: [
        { width: 2, height: 1, pixels: [0, 0] },
        { width: 2, height: 1, pixels: [3, 1], transparentIndex: 3 },
      ],
    });
    const gif = readGif(bytes);
    expect(gifMayBeTransparent(gif)).toBe(true);
    expect(await gifHasTransparency(bytes, gif)).toBe(false);
  });
});
