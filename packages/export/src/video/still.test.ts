import { beforeEach, describe, expect, it, vi } from 'vitest';

import { decodeVideoStill, stripStillAt, videoStillsAt } from './still';

/**
 * mediabunny stood in for (Node can't decode): a video of 30 frames a
 * second whose CanvasSink gives, for a moment, a canvas labelled with the
 * frame shown there (or null before its first, as the real one does).
 */
const mocks = vi.hoisted(() => ({
  fps: 30,
  duration: 2,
  first: 0,
  width: 1280,
  height: 720,
  alpha: false,
  /** A canvas as the page has them; else an OffscreenCanvas */
  page: true,
  /** Moments that give no picture */
  broken: new Set<number>(),
  failOpen: false,
  sinkOptions: [] as unknown[],
  asked: [] as number[],
  opened: 0,
  disposed: 0,
}));

vi.mock('mediabunny', () => {
  const frameAt = (t: number) =>
    Math.min(mocks.fps * mocks.duration - 1, Math.floor(t * mocks.fps + 1e-9));
  const canvas = (label: string) =>
    mocks.page
      ? {
          toDataURL: (type: string, quality?: number) =>
            `data:${type};base64,${label}@${quality ?? ''}`,
        }
      : {
          convertToBlob: async ({ type }: { type: string }) => new Blob([`${label}`], { type }),
        };
  return {
    ALL_FORMATS: [],
    BlobSource: class {},
    Input: class {
      constructor() {
        mocks.opened++;
        if (mocks.failOpen) throw new Error('not a video');
      }
      async getPrimaryVideoTrack() {
        return {
          getDisplayWidth: async () => mocks.width,
          getDisplayHeight: async () => mocks.height,
          getFirstTimestamp: async () => mocks.first,
          computeDuration: async () => mocks.duration,
          canBeTransparent: async () => mocks.alpha,
        };
      }
      dispose() {
        mocks.disposed++;
      }
    },
    CanvasSink: class {
      constructor(_track: unknown, options: unknown) {
        mocks.sinkOptions.push(options);
      }
      async getCanvas(t: number) {
        mocks.asked.push(t);
        if (t < mocks.first) return null;
        const frame = frameAt(t);
        if (mocks.broken.has(frame)) return null;
        return {
          canvas: canvas(`f${frame}`),
          timestamp: frame / mocks.fps,
          duration: 1 / mocks.fps,
        };
      }
    },
  };
});

const file = new Blob(['video'], { type: 'video/mp4' });
const strip = {
  rate: 4,
  height: 90,
  frames: ['data:image/webp;base64,s0', 'data:image/webp;base64,s1', 'data:image/webp;base64,s2'],
};

beforeEach(() => {
  Object.assign(mocks, {
    fps: 30,
    duration: 2,
    first: 0,
    width: 1280,
    height: 720,
    alpha: false,
    page: true,
    broken: new Set<number>(),
    failOpen: false,
    sinkOptions: [],
    asked: [],
    opened: 0,
    disposed: 0,
  });
});

describe('decodeVideoStill', () => {
  it('decodes the picture shown at a moment, at the video’s own size, and lets the file go', async () => {
    const still = await decodeVideoStill(file, 0.5);
    expect(still).toMatchObject({ toDataURL: expect.any(Function) });
    expect((still as HTMLCanvasElement).toDataURL('image/png')).toContain('f15');
    expect(mocks.sinkOptions).toEqual([{ alpha: false }]);
    expect(mocks.disposed).toBe(1);
  });

  it('is no bigger than asked, its shape kept', async () => {
    await decodeVideoStill(file, 0, { maxSize: 640 });
    mocks.width = 720;
    mocks.height = 1280;
    await decodeVideoStill(file, 0, { maxSize: 640 });
    expect(mocks.sinkOptions).toEqual([
      { alpha: false, width: 640 },
      { alpha: false, height: 640 },
    ]);
  });

  it('is never bigger than the video', async () => {
    await decodeVideoStill(file, 0, { maxSize: 4000 });
    expect(mocks.sinkOptions).toEqual([{ alpha: false }]);
  });

  it('keeps a video’s transparency', async () => {
    mocks.alpha = true;
    await decodeVideoStill(file, 0);
    expect(mocks.sinkOptions).toEqual([{ alpha: true }]);
  });

  it('asks inside the video: from its first picture to just short of its end', async () => {
    mocks.first = 0.1;
    await decodeVideoStill(file, 0);
    await decodeVideoStill(file, 5);
    expect(mocks.asked[0]).toBeCloseTo(0.1, 4);
    expect(mocks.asked[1]).toBeLessThan(2);
    expect(mocks.asked[1]).toBeGreaterThan(1.99);
  });

  it('lands a moment on a frame boundary in the frame it begins', async () => {
    const still = await decodeVideoStill(file, 10 / 30);
    expect((still as HTMLCanvasElement).toDataURL('image/png')).toContain('f10');
  });

  it('is null where nothing decodes, the file let go all the same', async () => {
    mocks.broken.add(3);
    expect(await decodeVideoStill(file, 0.1)).toBeNull();
    expect(mocks.disposed).toBe(1);
  });
});

describe('videoStillsAt', () => {
  it('decodes each moment as a JPEG, opening the file once', async () => {
    const stills = await videoStillsAt({ file, strip }, [0, 1]);
    expect(stills).toEqual(['data:image/jpeg;base64,f0@0.9', 'data:image/jpeg;base64,f30@0.9']);
    expect(mocks.opened).toBe(1);
    expect(mocks.disposed).toBe(1);
  });

  it('writes a PNG where the video may be transparent', async () => {
    mocks.alpha = true;
    const [still] = await videoStillsAt({ file, strip, hasAlpha: true }, [0]);
    expect(still).toBe('data:image/png;base64,f0@0.9');
  });

  it('encodes an OffscreenCanvas’s picture too', async () => {
    mocks.page = false;
    const [still] = await videoStillsAt({ file }, [0.5]);
    expect(still).toBe(`data:image/jpeg;base64,${btoa('f15')}`);
  });

  it('decodes no bigger than asked', async () => {
    await videoStillsAt({ file }, [0], { maxSize: 320 });
    expect(mocks.sinkOptions).toEqual([{ alpha: false, width: 320 }]);
  });

  it('shows the strip’s nearest still where a moment won’t decode', async () => {
    mocks.broken.add(15);
    const stills = await videoStillsAt({ file, strip }, [0, 0.5]);
    expect(stills).toEqual(['data:image/jpeg;base64,f0@0.9', 'data:image/webp;base64,s2']);
  });

  it('shows the strip’s stills when the file can’t be read, or isn’t there', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.failOpen = true;
    expect(await videoStillsAt({ file, strip }, [0.25, 9])).toEqual([
      'data:image/webp;base64,s1',
      'data:image/webp;base64,s2',
    ]);
    expect(await videoStillsAt({ strip }, [0])).toEqual(['data:image/webp;base64,s0']);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it('is null for a moment with neither a picture nor a strip', async () => {
    mocks.broken.add(0);
    expect(await videoStillsAt({ file }, [0])).toEqual([null]);
    expect(await videoStillsAt({}, [0])).toEqual([null]);
  });
});

describe('stripStillAt', () => {
  it('is the still nearest a moment, null with none', () => {
    expect(stripStillAt(strip, 0.3)).toBe('data:image/webp;base64,s1');
    expect(stripStillAt({ rate: 4, height: 90, frames: [] }, 0)).toBeNull();
    expect(stripStillAt(undefined, 0)).toBeNull();
  });
});
