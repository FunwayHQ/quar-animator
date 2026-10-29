import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { canvasPixel, installFakeCanvases, type FakePicture } from '../__fixtures__/fakeCanvas';
import { solid, writeTestGif } from '../__fixtures__/gifs';
import { createGifCompositor, readGif } from './gif';
import { openGifMedia } from './gifMedia';
import { openVideoMedia } from './media';

/** The small GIFs the app's tests use (apps/web/src/test/fixtures/video, its README says what each is). */
function fixture(name: string): Blob {
  return new Blob(
    [readFileSync(resolve(__dirname, '../../../../apps/web/src/test/fixtures/video', name))],
    { type: 'image/gif' }
  );
}

/** The colours the fixtures' frames are drawn in, frame by frame. */
const COLOURS = [
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

/** The frame of the counter fixture a canvas shows: its square's colour, wherever the canvas is scaled to. */
function counterFrame(canvas: unknown, width = 64, height = 36): number {
  const pixel = canvasPixel(canvas, Math.floor((31 * width) / 64), Math.floor((19 * height) / 36));
  return COLOURS.findIndex((colour) => colour.every((value, i) => value === pixel[i]));
}

/**
 * The browser's ImageDecoder stood in for. A file (a stream) decodes frame
 * i to a picture of one colour, red i × 10, so a canvas shows which one was
 * drawn; bytes handed over at once (the trial GIF the decoder is tried on)
 * decode to the pictures they are — or, as WebKit's do, with what's
 * transparent made opaque black. Its tracks are known once they're ready,
 * as Chrome's are.
 */
class FakeImageDecoder {
  static supported = true;
  static frameCount: number | null = null;
  static failAt = -1;
  static dropsTransparency = false;
  static made: FakeImageDecoder[] = [];
  static async isTypeSupported(type: string) {
    return FakeImageDecoder.supported && type === 'image/gif';
  }

  readonly completed = Promise.resolve();
  readonly tracks: { ready: Promise<void>; selectedTrack: { frameCount: number } | null };
  readonly decoded: number[] = [];
  readonly trial: boolean;
  closed = false;
  framesClosed = 0;

  constructor(readonly init: { data: unknown; type: string }) {
    FakeImageDecoder.made.push(this);
    const { data } = init;
    this.trial = data instanceof Uint8Array;
    const count = this.trial
      ? readGif(data as Uint8Array).frames.length
      : (FakeImageDecoder.frameCount ?? 10);
    const tracks: FakeImageDecoder['tracks'] = {
      ready: new Promise((resolve) => setTimeout(resolve, 0)).then(() => {
        tracks.selectedTrack = { frameCount: count };
      }),
      selectedTrack: null,
    };
    this.tracks = tracks;
  }

  async decode({ frameIndex }: { frameIndex: number }) {
    if (frameIndex === FakeImageDecoder.failAt) throw new Error('Decoding failed.');
    this.decoded.push(frameIndex);
    const close = () => this.framesClosed++;
    if (this.trial) {
      const bytes = this.init.data as Uint8Array;
      const gif = readGif(bytes);
      const pixels = createGifCompositor(bytes, gif).pictureAt(frameIndex).slice();
      if (FakeImageDecoder.dropsTransparency) {
        for (let i = 3; i < pixels.length; i += 4) pixels[i] = 255;
      }
      const image: FakePicture & { close(): void } = {
        width: gif.width,
        height: gif.height,
        pixels,
        close,
      };
      return { image };
    }
    const image: FakePicture & { close(): void } = {
      width: 64,
      height: 36,
      pixels: new Uint8ClampedArray(64 * 36 * 4).map((_, i) =>
        i % 4 === 0 ? frameIndex * 10 : i % 4 === 3 ? 255 : 0
      ),
      close,
    };
    return { image };
  }

  close() {
    this.closed = true;
  }
}

/** A browser's ImageDecoder: a class of its own each time, so it's tried afresh. */
function useImageDecoder() {
  (globalThis as { ImageDecoder?: unknown }).ImageDecoder = class extends FakeImageDecoder {};
}

/** The decoders made for files (not the trial). */
const fileDecoders = () => FakeImageDecoder.made.filter((decoder) => !decoder.trial);

describe('openGifMedia', () => {
  let restoreCanvases = () => {};

  beforeEach(() => {
    restoreCanvases = installFakeCanvases();
    FakeImageDecoder.supported = true;
    FakeImageDecoder.frameCount = null;
    FakeImageDecoder.failAt = -1;
    FakeImageDecoder.dropsTransparency = false;
    FakeImageDecoder.made = [];
  });

  afterEach(() => {
    restoreCanvases();
    delete (globalThis as { ImageDecoder?: unknown }).ImageDecoder;
    vi.restoreAllMocks();
  });

  it('is what openVideoMedia opens a GIF with', async () => {
    const media = await openVideoMedia(fixture('gif-counter.gif'));
    expect(await media.track.computeDuration()).toBe(1);
    media.dispose();
  });

  it('has a track saying its size, its length and that it starts at once', async () => {
    const media = await openGifMedia(fixture('gif-counter.gif'));
    const { track } = media;
    expect(await track.getDisplayWidth()).toBe(64);
    expect(await track.getDisplayHeight()).toBe(36);
    expect(await track.getFirstTimestamp()).toBe(0);
    expect(await track.computeDuration()).toBe(1);
    expect(
      await (await openGifMedia(fixture('gif-transparent.gif'))).track.canBeTransparent()
    ).toBe(true);
  });

  it('says a GIF whose frames are all opaque and whole can’t be transparent', async () => {
    const opaque = writeTestGif({
      width: 2,
      height: 2,
      palette: [
        [255, 0, 0],
        [0, 0, 255],
      ],
      frames: [0, 1].map((colour) => ({ width: 2, height: 2, pixels: solid(2, 2, colour) })),
    });
    const media = await openGifMedia(new Blob([opaque], { type: 'image/gif' }));
    expect(await media.track.canBeTransparent()).toBe(false);
  });

  describe('composited here, without an ImageDecoder', () => {
    it('draws the picture showing at a moment, with its frame’s moment and delay', async () => {
      const media = await openGifMedia(fixture('gif-counter.gif'));
      const sink = media.canvasSink({});
      const shown = await sink.getCanvas(0.36);
      expect(shown).toMatchObject({ timestamp: 0.35, duration: 0.05 });
      expect(counterFrame(shown?.canvas)).toBe(3);
      expect(await sink.getCanvas(-0.01)).toBeNull();
      expect(counterFrame((await sink.getCanvas(9))?.canvas)).toBe(9);
    });

    it('plays on from the frame showing at a moment, to the end or a moment', async () => {
      const sink = (await openGifMedia(fixture('gif-counter.gif'))).canvasSink({});
      const played: number[] = [];
      for await (const frame of sink.canvases(0.42)) played.push(counterFrame(frame.canvas));
      expect(played).toEqual([4, 5, 6, 7, 8, 9]);
      const some: number[] = [];
      for await (const frame of sink.canvases(0, 0.4)) some.push(counterFrame(frame.canvas));
      expect(some).toEqual([0, 1, 2, 3]);
    });

    it('draws a picture for each moment asked, starting over where they do', async () => {
      const sink = (await openGifMedia(fixture('gif-counter.gif'))).canvasSink({ poolSize: 2 });
      const shown: Array<number | null> = [];
      for await (const frame of sink.canvasesAtTimestamps([-1, 0, 0.36, 0.96, 0.05, 0.51])) {
        shown.push(frame ? counterFrame(frame.canvas) : null);
      }
      expect(shown).toEqual([null, 0, 3, 9, 0, 5]);
    });

    it('draws into its pool’s canvases in turn, or a new one each time without one', async () => {
      const media = await openGifMedia(fixture('gif-counter.gif'));
      const pooled = media.canvasSink({ poolSize: 2 });
      const a = await pooled.getCanvas(0);
      const b = await pooled.getCanvas(0.1);
      const c = await pooled.getCanvas(0.2);
      expect(a?.canvas).not.toBe(b?.canvas);
      expect(c?.canvas).toBe(a?.canvas);
      expect(counterFrame(c?.canvas)).toBe(2);
      const unpooled = media.canvasSink({});
      expect((await unpooled.getCanvas(0))?.canvas).not.toBe((await unpooled.getCanvas(0))?.canvas);
    });

    it('draws at the size asked, its shape kept where only one side is', async () => {
      const media = await openGifMedia(fixture('gif-counter.gif'));
      const half = await media.canvasSink({ height: 18 }).getCanvas(0.36);
      expect(half?.canvas).toMatchObject({ width: 32, height: 18 });
      expect(counterFrame(half?.canvas, 32, 18)).toBe(3);
      const wide = await media.canvasSink({ width: 128 }).getCanvas(0.36);
      expect(wide?.canvas).toMatchObject({ width: 128, height: 72 });
      expect(counterFrame(wide?.canvas, 128, 72)).toBe(3);
    });

    it('keeps what’s transparent transparent', async () => {
      const sink = (await openGifMedia(fixture('gif-transparent.gif'))).canvasSink({});
      const shown = await sink.getCanvas(0.25);
      // Frame 2: its square at x = 14, nothing elsewhere
      expect(canvasPixel(shown?.canvas, 20, 18)).toEqual([...COLOURS[2]!, 255]);
      expect(canvasPixel(shown?.canvas, 2, 2)).toEqual([0, 0, 0, 0]);
    });

    it('reads the file’s bytes once for the sinks drawing it, and lets them go after', async () => {
      const file = fixture('gif-counter.gif');
      const read = vi.spyOn(file, 'arrayBuffer');
      const first = await openGifMedia(file);
      const second = await openGifMedia(file);
      await first.canvasSink({}).getCanvas(0.5);
      await second.canvasSink({}).getCanvas(0.7);
      // Once for its blocks, once for its pictures
      expect(read).toHaveBeenCalledTimes(2);
      first.dispose();
      second.dispose();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await (await openGifMedia(file)).canvasSink({}).getCanvas(0);
      expect(read).toHaveBeenCalledTimes(3);
    });

    it('draws nothing once it’s disposed of', async () => {
      const media = await openGifMedia(fixture('gif-counter.gif'));
      const sink = media.canvasSink({});
      media.dispose();
      await expect(sink.getCanvas(0)).rejects.toThrow();
    });
  });

  describe('with the browser’s ImageDecoder', () => {
    it('draws the frame showing at a moment, decoded by its index', async () => {
      useImageDecoder();
      const media = await openGifMedia(fixture('gif-counter.gif'));
      const sink = media.canvasSink({});
      const shown = await sink.getCanvas(0.36);
      expect(shown).toMatchObject({ timestamp: 0.35, duration: 0.05 });
      expect(canvasPixel(shown?.canvas, 0, 0)).toEqual([30, 0, 0, 255]);
      const [decoder] = fileDecoders();
      expect(decoder?.init.type).toBe('image/gif');
      expect(decoder?.decoded).toEqual([3]);
      expect(decoder?.framesClosed).toBe(1);
      media.dispose();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(decoder?.closed).toBe(true);
    });

    it('composites here where the decoder counts the frames otherwise', async () => {
      useImageDecoder();
      FakeImageDecoder.frameCount = 9;
      const sink = (await openGifMedia(fixture('gif-counter.gif'))).canvasSink({});
      expect(counterFrame((await sink.getCanvas(0.36))?.canvas)).toBe(3);
      expect(fileDecoders()[0]?.closed).toBe(true);
    });

    it('composites here where the browser’s decoder loses a GIF’s transparency (as WebKit’s does)', async () => {
      useImageDecoder();
      FakeImageDecoder.dropsTransparency = true;
      const sink = (await openGifMedia(fixture('gif-counter.gif'))).canvasSink({});
      expect(counterFrame((await sink.getCanvas(0.36))?.canvas)).toBe(3);
      // Tried, found wanting, closed; no file given it
      expect(FakeImageDecoder.made.map((decoder) => [decoder.trial, decoder.closed])).toEqual([
        [true, true],
      ]);
    });

    it('tries the browser’s decoder once', async () => {
      useImageDecoder();
      const file = fixture('gif-counter.gif');
      await (await openGifMedia(file)).canvasSink({}).getCanvas(0);
      await (await openGifMedia(file)).canvasSink({}).getCanvas(0.5);
      expect(FakeImageDecoder.made.filter((decoder) => decoder.trial)).toHaveLength(1);
      expect(fileDecoders()).toHaveLength(2);
    });

    it('composites here where the browser has no decoder for GIFs', async () => {
      useImageDecoder();
      FakeImageDecoder.supported = false;
      const sink = (await openGifMedia(fixture('gif-counter.gif'))).canvasSink({});
      expect(counterFrame((await sink.getCanvas(0.36))?.canvas)).toBe(3);
      expect(FakeImageDecoder.made).toEqual([]);
    });

    it('composites here from a frame the decoder fails at on', async () => {
      useImageDecoder();
      FakeImageDecoder.failAt = 5;
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const sink = (await openGifMedia(fixture('gif-counter.gif'))).canvasSink({});
      expect(canvasPixel((await sink.getCanvas(0.1))?.canvas, 0, 0)).toEqual([10, 0, 0, 255]);
      expect(counterFrame((await sink.getCanvas(0.5))?.canvas)).toBe(5);
      expect(counterFrame((await sink.getCanvas(0.1))?.canvas)).toBe(1);
      expect(fileDecoders()[0]?.closed).toBe(true);
    });
  });
});
