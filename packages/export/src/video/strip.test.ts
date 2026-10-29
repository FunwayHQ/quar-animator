import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeVideoStrip, stillIndexAt, stripRate, stripTimes } from './strip';

/** A canvas as the browser's page has them: WebP encoded where the browser can. */
function pageCanvas(label: string, webp = true) {
  return {
    toDataURL: vi.fn((type: string) =>
      type === 'image/webp' && !webp
        ? `data:image/png;base64,${label}`
        : `data:${type};base64,${label}`
    ),
  };
}

const mocks = vi.hoisted(() => ({
  sinkOptions: null as unknown,
  asked: [] as number[],
  stills: [] as Array<unknown>,
  disposed: 0,
  firstTimestamp: 0,
}));

vi.mock('mediabunny', () => {
  class InputVideoTrack {
    async getFirstTimestamp() {
      return mocks.firstTimestamp;
    }
  }
  return {
    ALL_FORMATS: [],
    BlobSource: class {
      constructor(readonly blob: Blob) {}
    },
    Input: class {
      async getPrimaryVideoTrack() {
        return new InputVideoTrack();
      }
      dispose() {
        mocks.disposed++;
      }
    },
    CanvasSink: class {
      constructor(_track: unknown, options: unknown) {
        mocks.sinkOptions = options;
      }
      async *canvasesAtTimestamps(timestamps: Iterable<number>) {
        let i = 0;
        for (const t of timestamps) {
          mocks.asked.push(t);
          const canvas = mocks.stills[i++];
          yield canvas === null ? null : { canvas, timestamp: t, duration: 1 / 30 };
        }
      }
    },
  };
});

const file = new Blob(['video'], { type: 'video/mp4' });

describe('the stills a strip is taken at', () => {
  it('takes four a second, fewer past a minute (240 at most)', () => {
    expect(stripRate(2)).toBe(4);
    expect(stripRate(60)).toBe(4);
    expect(stripRate(120)).toBe(2);
    expect(stripRate(600)).toBe(0.4);
  });

  it('takes them from the start, while the video lasts', () => {
    expect(stripTimes(2, 4)).toEqual([0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75]);
    expect(stripTimes(1.1, 4)).toEqual([0, 0.25, 0.5, 0.75, 1]);
    expect(stripTimes(120, 2)).toHaveLength(240);
  });

  it('takes at least one, however short the video', () => {
    expect(stripTimes(0.1, 4)).toEqual([0]);
  });

  it('finds the still nearest a moment', () => {
    const strip = { rate: 4, height: 90, frames: ['a', 'b', 'c', 'd'] };
    expect(stillIndexAt(strip, 0)).toBe(0);
    expect(stillIndexAt(strip, 0.3)).toBe(1);
    expect(stillIndexAt(strip, 0.4)).toBe(2);
    expect(stillIndexAt(strip, 9)).toBe(3);
    expect(stillIndexAt(strip, -1)).toBe(0);
  });
});

describe('makeVideoStrip', () => {
  beforeEach(() => {
    mocks.sinkOptions = null;
    mocks.asked = [];
    mocks.stills = [];
    mocks.disposed = 0;
    mocks.firstTimestamp = 0;
  });

  it('decodes small WebP stills at the strip’s moments, reporting how far it has got', async () => {
    mocks.stills = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((label) => pageCanvas(label));
    const progress = vi.fn();
    const strip = await makeVideoStrip(
      file,
      { duration: 2, height: 720, hasAlpha: false },
      progress
    );
    expect(mocks.sinkOptions).toEqual({ height: 160, alpha: false, poolSize: 1 });
    expect(mocks.asked).toEqual([0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75]);
    expect(strip).toEqual({
      rate: 4,
      height: 160,
      frames: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((l) => `data:image/webp;base64,${l}`),
    });
    expect(progress).toHaveBeenLastCalledWith(1);
    expect(progress).toHaveBeenCalledWith(0.5);
    expect(mocks.disposed).toBe(1);
  });

  it('keeps a video smaller than the strip at its own height', async () => {
    mocks.stills = [pageCanvas('a')];
    const strip = await makeVideoStrip(file, { duration: 0.2, height: 90, hasAlpha: false });
    expect(mocks.sinkOptions).toMatchObject({ height: 90 });
    expect(strip.height).toBe(90);
  });

  it('falls back to JPEG where the browser can’t write WebP', async () => {
    mocks.stills = [pageCanvas('a', false)];
    const strip = await makeVideoStrip(file, { duration: 0.2, height: 90, hasAlpha: false });
    expect(strip.frames).toEqual(['data:image/jpeg;base64,a']);
  });

  it('keeps a transparent video’s stills transparent, as PNG', async () => {
    mocks.stills = [pageCanvas('a'), pageCanvas('b'), pageCanvas('c'), pageCanvas('d')];
    const strip = await makeVideoStrip(file, { duration: 1, height: 90, hasAlpha: true });
    expect(mocks.sinkOptions).toMatchObject({ alpha: true });
    expect(strip.frames).toEqual(['a', 'b', 'c', 'd'].map((l) => `data:image/png;base64,${l}`));
  });

  it('takes no still before the video’s first frame', async () => {
    mocks.firstTimestamp = 0.1;
    mocks.stills = [pageCanvas('a'), pageCanvas('b')];
    await makeVideoStrip(file, { duration: 0.5, height: 90, hasAlpha: false });
    expect(mocks.asked).toEqual([0.1, 0.25]);
  });

  it('fills a moment that gave no picture with its neighbour’s', async () => {
    mocks.stills = [null, pageCanvas('b'), null, pageCanvas('d')];
    const strip = await makeVideoStrip(file, { duration: 1, height: 90, hasAlpha: false });
    expect(strip.frames).toEqual(['b', 'b', 'b', 'd'].map((l) => `data:image/webp;base64,${l}`));
  });

  it('says so when no picture could be decoded', async () => {
    mocks.stills = [null];
    await expect(
      makeVideoStrip(file, { duration: 0.2, height: 90, hasAlpha: false })
    ).rejects.toThrow('No pictures could be decoded');
    expect(mocks.disposed).toBe(1);
  });

  it('encodes an offscreen canvas’s stills too', async () => {
    const offscreen = (label: string, webp: boolean) => ({
      convertToBlob: vi.fn(
        async ({ type }: { type: string }) =>
          new Blob([label], { type: type === 'image/webp' && !webp ? 'image/png' : type })
      ),
    });
    mocks.stills = [offscreen('hi', true)];
    const webp = await makeVideoStrip(file, { duration: 0.2, height: 90, hasAlpha: false });
    expect(webp.frames).toEqual([`data:image/webp;base64,${btoa('hi')}`]);
    mocks.stills = [offscreen('hi', false)];
    const jpeg = await makeVideoStrip(file, { duration: 0.2, height: 90, hasAlpha: false });
    expect(jpeg.frames).toEqual([`data:image/jpeg;base64,${btoa('hi')}`]);
  });
});
