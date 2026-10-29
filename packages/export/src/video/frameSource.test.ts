import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createVideoFrameSource,
  type VideoFrameSource,
  type VideoFrameSourceOptions,
} from './frameSource';

/**
 * mediabunny stood in for (Node can't decode): a video of `fps` frames a
 * second whose CanvasSink draws frame i (at i / fps seconds) into the next
 * canvas of its pool, as the real one does.
 */
const mocks = vi.hoisted(() => ({
  fps: 30,
  duration: 2,
  first: 0,
  width: 160,
  height: 90,
  alpha: false,
  hasTrack: true,
  sinkOptions: null as null | { poolSize?: number },
  pool: [] as Array<{ canvas: number }>,
  nextCanvas: 0,
  drawn: [] as number[],
  seeks: [] as number[],
  runs: [] as number[],
  stopped: 0,
  disposed: 0,
  /** While set, every decode waits for it */
  hold: null as null | Promise<void>,
}));

vi.mock('mediabunny', () => {
  const frameCount = () => Math.round(mocks.duration * mocks.fps);
  const indexAt = (t: number) =>
    Math.max(0, Math.min(frameCount() - 1, Math.floor(t * mocks.fps + 1e-9)));
  const draw = (index: number) => {
    const size = Math.max(1, mocks.sinkOptions?.poolSize ?? 0);
    const slot = mocks.nextCanvas;
    mocks.nextCanvas = (slot + 1) % size;
    mocks.pool[slot] ??= { canvas: slot };
    mocks.drawn.push(index);
    return { canvas: mocks.pool[slot], timestamp: index / mocks.fps, duration: 1 / mocks.fps };
  };
  return {
    ALL_FORMATS: [],
    BlobSource: class {},
    Input: class {
      async getPrimaryVideoTrack() {
        if (!mocks.hasTrack) return null;
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
      constructor(_track: unknown, options: { poolSize?: number }) {
        mocks.sinkOptions = options;
      }
      async getCanvas(t: number) {
        mocks.seeks.push(t);
        await mocks.hold;
        return draw(indexAt(t));
      }
      async *canvases(start: number) {
        mocks.runs.push(start);
        try {
          for (let i = indexAt(start); i < frameCount(); i++) {
            await mocks.hold;
            yield draw(i);
          }
        } finally {
          mocks.stopped++;
        }
      }
    },
  };
});

const file = new Blob(['video'], { type: 'video/mp4' });

/** The sources a test made: settling waits for them to open */
let opened: VideoFrameSource[] = [];

function open(options?: VideoFrameSourceOptions): VideoFrameSource {
  const source = createVideoFrameSource(file, options);
  opened.push(source);
  return source;
}

/** Lets the decoding that's under way finish. */
async function settle() {
  await Promise.allSettled(opened.map((source) => source.ready));
  for (let i = 0; i < 20; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

/** Holds every decode until the returned function is called. */
function holdDecoding(): () => void {
  let release = () => {};
  mocks.hold = new Promise<void>((resolve) => (release = resolve));
  return () => {
    mocks.hold = null;
    release();
  };
}

const frameNumber = (pick: { frame: { timestamp: number } } | null) =>
  pick ? Math.round(pick.frame.timestamp * mocks.fps) : null;

describe('createVideoFrameSource', () => {
  beforeEach(() => {
    opened = [];
    Object.assign(mocks, {
      fps: 30,
      duration: 2,
      first: 0,
      width: 160,
      height: 90,
      alpha: false,
      hasTrack: true,
      sinkOptions: null,
      pool: [],
      nextCanvas: 0,
      drawn: [],
      seeks: [],
      runs: [],
      stopped: 0,
      disposed: 0,
      hold: null,
    });
  });

  it('decodes a moment it’s asked for, showing nothing until it’s there', async () => {
    const source = open();
    expect(source.frameAt(0.5)).toBeNull();
    await settle();
    expect(mocks.seeks).toHaveLength(1);
    const pick = source.frameAt(0.5);
    expect(frameNumber(pick)).toBe(15);
    expect(pick?.distance).toBe(0);
  });

  it('decodes at the video’s own size, at most 1920 px on its long side', async () => {
    open();
    await settle();
    expect(mocks.sinkOptions).toEqual({ alpha: false, poolSize: 6 });

    Object.assign(mocks, { width: 3840, height: 2160 });
    open();
    await settle();
    expect(mocks.sinkOptions).toEqual({ width: 1920, alpha: false, poolSize: 6 });

    Object.assign(mocks, { width: 2160, height: 3840, alpha: true });
    open({ keep: 4 });
    await settle();
    expect(mocks.sinkOptions).toEqual({ height: 1920, alpha: true, poolSize: 4 });
  });

  it('shows the nearest picture decoded while the one asked for decodes', async () => {
    const source = open();
    source.frameAt(0.5);
    await settle();
    const release = holdDecoding();
    const pick = source.frameAt(1);
    expect(frameNumber(pick)).toBe(15);
    expect(pick?.distance).toBeCloseTo(1 - 16 / 30, 3);
    release();
    await settle();
    expect(frameNumber(source.frameAt(1))).toBe(30);
  });

  it('gives each picture a key of its own, the same while it’s the one shown', async () => {
    const source = open();
    source.frameAt(0.5);
    await settle();
    const a = source.frameAt(0.5)?.frame.key;
    expect(source.frameAt(0.51)?.frame.key).toBe(a);
    source.frameAt(1);
    await settle();
    expect(source.frameAt(1)?.frame.key).not.toBe(a);
  });

  it('decodes on through the video while it plays, not seeking each frame', async () => {
    const source = open();
    for (let frame = 0; frame < 20; frame++) {
      source.frameAt(frame / 30, true);
      await settle();
      expect(frameNumber(source.frameAt(frame / 30, true))).toBe(frame);
    }
    expect(mocks.seeks).toEqual([]);
    expect(mocks.runs).toHaveLength(1);
  });

  it('decodes a few frames ahead of the playhead, no more', async () => {
    const source = open();
    source.frameAt(0, true);
    await settle();
    // Ready before they're asked for: the pool's six, but the one shown and the one before
    const ahead = source.frameAt(3 / 30, true);
    expect(frameNumber(ahead)).toBe(3);
    expect(ahead?.distance).toBe(0);
    await settle();
    expect(Math.max(...mocks.drawn)).toBe(3 + 4);
  });

  it('seeks when the playhead jumps, letting go of the run it was decoding', async () => {
    const source = open();
    source.frameAt(0, true);
    await settle();
    source.frameAt(1.5);
    await settle();
    expect(mocks.stopped).toBe(1);
    expect(mocks.seeks).toHaveLength(1);
    expect(frameNumber(source.frameAt(1.5))).toBe(45);
  });

  it('starts a new run where the playhead jumps while playing, or loops round', async () => {
    mocks.duration = 10;
    const source = open();
    source.frameAt(0, true);
    await settle();
    source.frameAt(5, true);
    await settle();
    expect(frameNumber(source.frameAt(5, true))).toBe(150);
    source.frameAt(0, true);
    await settle();
    expect(frameNumber(source.frameAt(0, true))).toBe(0);
    expect(mocks.runs.map((t) => Math.round(t * 30))).toEqual([0, 150, 0]);
    expect(mocks.seeks).toEqual([]);
  });

  it('steps on from the run it has, rather than seeking, a frame at a time', async () => {
    const source = open();
    source.frameAt(0, true);
    await settle();
    // Stopped, then stepped on past the frames decoded ahead
    source.frameAt(10 / 30);
    await settle();
    expect(frameNumber(source.frameAt(10 / 30))).toBe(10);
    expect(mocks.seeks).toEqual([]);
  });

  it('decodes only the latest of the moments asked for while it was busy', async () => {
    const source = open();
    await settle();
    const release = holdDecoding();
    source.frameAt(0.1);
    await settle();
    source.frameAt(0.2);
    source.frameAt(0.3);
    source.frameAt(0.4);
    release();
    await settle();
    expect(mocks.seeks.map((t) => Math.round(t * 10))).toEqual([1, 4]);
    expect(frameNumber(source.frameAt(0.4))).toBe(12);
  });

  it('keeps a handful of pictures, letting go of those drawn over', async () => {
    const source = open({ keep: 3 });
    for (const t of [0.1, 0.5, 0.9]) {
      source.frameAt(t);
      await settle();
    }
    expect(source.frameAt(0.1)?.distance).toBe(0);
    source.frameAt(1.3);
    await settle();
    // 0.1's canvas now holds 1.3: the nearest kept is 0.5's
    expect(frameNumber(source.frameAt(0.1))).toBe(15);
    expect(mocks.pool).toHaveLength(3);
  });

  it('asks for nothing before the video starts or after it ends', async () => {
    mocks.first = 0.1;
    const source = open();
    source.frameAt(0);
    await settle();
    source.frameAt(5);
    await settle();
    expect(mocks.seeks[0]).toBeCloseTo(0.1, 4);
    expect(mocks.seeks[1]).toBeLessThan(2);
    expect(frameNumber(source.frameAt(5))).toBe(59);
  });

  it('lets the video go when disposed, decoding nothing more', async () => {
    const source = open();
    source.frameAt(0, true);
    await settle();
    source.dispose();
    await settle();
    expect(mocks.disposed).toBe(1);
    expect(mocks.stopped).toBe(1);
    expect(source.frameAt(0.5)).toBeNull();
    await settle();
    expect(mocks.seeks).toEqual([]);
  });

  it('shows nothing of a video that can’t be opened', async () => {
    mocks.hasTrack = false;
    const source = open();
    await expect(source.ready).rejects.toThrow();
    expect(source.frameAt(0)).toBeNull();
  });
});
