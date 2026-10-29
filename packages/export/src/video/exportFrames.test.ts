import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SceneGraph } from '@quar/core';
import type { VideoFrameImage } from '@quar/core';
import { createTimeline, createTrack, scopedTimeline } from '@quar/animation';
import { inTimelineScope } from '@quar/core';
import type { Node, SymbolDefinition, Timeline, Video, VideoClip, VideoNode } from '@quar/types';
import { sampleSlides, sampleTimeline, type Shot } from '../exportUtils';
import type { FrameRenderContext } from '../frameRenderer';
import { artboard, base } from '../__fixtures__/pdfNodes';
import { createExportVideoFrames, type ExportVideoFrames } from './exportFrames';

/**
 * mediabunny stood in for (Node can't decode): each file is a video of
 * `fps` frames a second; a CanvasSink's canvasesAtTimestamps draws, for
 * each moment it's given (read one at a time, as it decodes), the frame
 * showing then into the next canvas of its pool, as the real one does.
 */
interface FakeVideo {
  fps: number;
  duration: number;
  width: number;
  height: number;
  /** The frame decoding fails at */
  failAt?: number;
  /** The frame decoding never gets past */
  stallAt?: number;
}

const mocks = vi.hoisted(() => ({
  files: new Map<Blob, FakeVideo>(),
  inputs: 0,
  disposed: 0,
  sinks: [] as Array<{ width?: number; height?: number; poolSize?: number; alpha?: boolean }>,
  /** Each run's moments, as it read them */
  runs: [] as number[][],
  /** The frames drawn, in order */
  drawn: [] as number[],
  stopped: 0,
}));

vi.mock('mediabunny', () => {
  class BlobSource {
    constructor(readonly file: Blob) {}
  }
  return {
    ALL_FORMATS: [],
    BlobSource,
    Input: class {
      readonly video: FakeVideo | undefined;
      constructor(options: { source: BlobSource }) {
        mocks.inputs++;
        this.video = mocks.files.get(options.source.file);
      }
      async getPrimaryVideoTrack() {
        const video = this.video;
        if (!video) throw new Error('Not a video.');
        return {
          video,
          getDisplayWidth: async () => video.width,
          getDisplayHeight: async () => video.height,
          getFirstTimestamp: async () => 0,
          computeDuration: async () => video.duration,
          canBeTransparent: async () => false,
        };
      }
      dispose() {
        mocks.disposed++;
      }
    },
    CanvasSink: class {
      readonly pool: Array<{ canvas: number; frame?: number }>;
      next = 0;
      constructor(
        readonly track: { video: FakeVideo },
        options: { width?: number; height?: number; poolSize?: number; alpha?: boolean }
      ) {
        mocks.sinks.push(options);
        this.pool = Array.from({ length: Math.max(1, options.poolSize ?? 1) }, (_, canvas) => ({
          canvas,
        }));
      }
      async *canvasesAtTimestamps(timestamps: Iterable<number>) {
        const { video } = this.track;
        const run: number[] = [];
        mocks.runs.push(run);
        try {
          for (const t of timestamps) {
            run.push(t);
            const frame = Math.min(
              Math.round(video.duration * video.fps) - 1,
              Math.floor(t * video.fps + 1e-9)
            );
            await Promise.resolve();
            if (frame === video.stallAt) await new Promise(() => {});
            if (frame === video.failAt) throw new Error('Decoding failed.');
            const slot = this.pool[this.next]!;
            this.next = (this.next + 1) % this.pool.length;
            slot.frame = frame;
            mocks.drawn.push(frame);
            yield { canvas: slot, timestamp: frame / video.fps, duration: 1 / video.fps };
          }
        } finally {
          mocks.stopped++;
        }
      }
    },
  };
});

/** A file for a fake video (30 fps, 4 s, 1280 × 720 unless said otherwise). */
function file(more: Partial<FakeVideo> = {}): Blob {
  const blob = new Blob(['video']);
  mocks.files.set(blob, { fps: 30, duration: 4, width: 1280, height: 720, ...more });
  return blob;
}

function libraryEntry(id: string, frames = 16): Video {
  return {
    id,
    name: `${id}.mp4`,
    mimeType: 'video/mp4',
    byteLength: 5,
    width: 1280,
    height: 720,
    duration: 4,
    frameRate: 30,
    hasAlpha: false,
    strip: { rate: 4, height: 90, frames: Array.from({ length: frames }, (_, i) => `still:${i}`) },
  };
}

function videoLayer(id: string, clip: Partial<VideoClip> = {}, more: Partial<VideoNode> = {}) {
  return {
    ...base(id),
    type: 'video',
    videoId: `video-${id}`,
    width: 160,
    height: 90,
    naturalWidth: 1280,
    naturalHeight: 720,
    cornerRadius: [0, 0, 0, 0],
    clip: { start: 0, offset: 0, duration: 4, ...clip },
    ...more,
  } satisfies VideoNode;
}

function scene(entries: Array<[Node, string?]>): SceneGraph {
  const sg = new SceneGraph();
  for (const [node, parent] of entries) sg.addNode(structuredClone(node), parent);
  return sg;
}

const OUTPUT = { width: 320, height: 180 };

function context(sceneGraph: SceneGraph, more: Partial<FrameRenderContext> = {}) {
  return {
    sceneGraph,
    timeline: createTimeline({ frameRate: 30, duration: 120 }),
    viewportBounds: { x: -160, y: -90, width: 320, height: 180 },
    ...more,
  } satisfies FrameRenderContext;
}

/** Shots of `ctx` at the timeline frames a range exported at `fps` shows. */
function rangeShots(
  ctx: FrameRenderContext,
  startFrame: number,
  endFrame: number,
  fps = 30
): Shot<FrameRenderContext>[] {
  return sampleTimeline({ frameRate: 30, startFrame, endFrame, fps }).frames.map((frame) => ({
    ctx,
    frame,
  }));
}

let made: ExportVideoFrames[] = [];

function frames(
  shots: Shot<FrameRenderContext>[],
  sources: Parameters<typeof createExportVideoFrames>[2],
  options: Parameters<typeof createExportVideoFrames>[3] = {}
) {
  const source = createExportVideoFrames(shots, OUTPUT, sources, {
    loadStill: async (uri) => ({ still: uri }) as unknown as TexImageSource,
    ...options,
  });
  made.push(source);
  return source;
}

/** The frame of its video a layer shows now (null: nothing; a still: its URI). */
function shown(source: ExportVideoFrames, node: VideoNode): number | string | null {
  const image: VideoFrameImage | null = source.provider(node);
  if (!image) return null;
  const picture = image.source as unknown as { frame?: number; still?: string };
  return picture.still ?? picture.frame ?? null;
}

/** Each shot prepared in turn, and what the layers show for it. */
async function play(
  source: ExportVideoFrames,
  count: number,
  layers: VideoNode[]
): Promise<Array<Array<number | string | null>>> {
  const seen: Array<Array<number | string | null>> = [];
  for (let i = 0; i < count; i++) {
    await source.prepare(i);
    seen.push(layers.map((layer) => shown(source, layer)));
  }
  return seen;
}

const range = (from: number, to: number, step = 1) =>
  Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step);

describe('createExportVideoFrames', () => {
  beforeEach(() => {
    for (const source of made) source.dispose();
    made = [];
    mocks.files.clear();
    mocks.inputs = 0;
    mocks.disposed = 0;
    mocks.sinks = [];
    mocks.runs = [];
    mocks.drawn = [];
    mocks.stopped = 0;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('decodes each frame’s moment of the clip in one pass through the video, in order', async () => {
    const layer = videoLayer('clip');
    const ctx = context(scene([[layer]]));
    const shots = rangeShots(ctx, 0, 9);
    const source = frames(shots, { videoFile: () => file() });

    expect((await play(source, shots.length, [layer])).flat()).toEqual(range(0, 9));
    // One decoder, asked for the moments one after another, each once
    expect(mocks.inputs).toBe(1);
    expect(mocks.runs).toHaveLength(1);
    expect(mocks.runs[0]!.map((t) => Math.floor(t * 30 + 1e-9))).toEqual(range(0, 9));
    expect(mocks.drawn).toEqual(range(0, 9));
  });

  it('shows the moments between the timeline’s frames when it’s exported at another rate', async () => {
    const layer = videoLayer('clip');
    const ctx = context(scene([[layer]]));
    // 24 fps of a 30 fps timeline: frame k shows k / 24 s
    const shots = rangeShots(ctx, 0, 29, 24);
    const source = frames(shots, { videoFile: () => file() });

    const seen = (await play(source, shots.length, [layer])).flat();
    expect(seen).toEqual(range(0, 23).map((k) => Math.floor((k * 30) / 24 + 1e-9)));
    expect(mocks.runs).toHaveLength(1);
  });

  it('plays a clip at its speed, looped, from where it starts on the timeline', async () => {
    // From frame 5, a second of the video from 1 s at 2×, looped for a second and a half
    const layer = videoLayer('clip', {
      start: 5,
      offset: 1,
      duration: 0.4,
      speed: 2,
      loop: true,
      loopFor: 1.5,
    });
    const ctx = context(scene([[layer]]));
    const shots = rangeShots(ctx, 0, 59);
    const source = frames(shots, { videoFile: () => file() });

    const seen = (await play(source, shots.length, [layer])).flat();
    const expected = range(0, 59).map((frame) => {
      if (frame < 5 || frame >= 5 + 45) return null;
      // 2 video frames a timeline frame, over 12 frames of it from frame 30
      return 30 + (((frame - 5) * 2) % 12);
    });
    expect(seen).toEqual(expected);
    // Starting over is the same pass going back, not a decoder of its own
    expect(mocks.runs).toHaveLength(1);
  });

  it('holds a clip’s last frame after it ends, decoding it once; else shows nothing there', async () => {
    const held = videoLayer('held', { duration: 0.5, holdLastFrame: true });
    const gone = videoLayer('gone', { duration: 0.5 }, { videoId: 'video-held' });
    const ctx = context(scene([[held], [gone]]));
    const shots = rangeShots(ctx, 0, 29);
    const video = file();
    const source = frames(shots, { videoFile: () => video });

    const seen = await play(source, shots.length, [held, gone]);
    expect(seen.map(([frame]) => frame)).toEqual(range(0, 29).map((f) => Math.min(f, 14)));
    expect(seen.map(([, frame]) => frame)).toEqual(range(0, 29).map((f) => (f < 15 ? f : null)));
    // Each layer's 15 frames, and the held one's last once more for the moment it holds
    expect(mocks.drawn).toHaveLength(31);
  });

  it('keeps a picture’s key while it shows the same frame, so it isn’t uploaded again', async () => {
    const layer = videoLayer('slow', { speed: 0.5 });
    const ctx = context(scene([[layer]]));
    const shots = rangeShots(ctx, 0, 3);
    const source = frames(shots, { videoFile: () => file() });

    const keys: Array<string | number | undefined> = [];
    for (let i = 0; i < shots.length; i++) {
      await source.prepare(i);
      keys.push(source.provider(layer)?.key);
    }
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).toBe(keys[3]);
    expect(keys[1]).not.toBe(keys[2]);
  });

  it('shows the first picture of a clip of another timeline, decoded once', async () => {
    // The page exported: a layer in an artboard plays on the artboard's timeline
    const board = artboard('board', 0, 0, 400, 300);
    const layer = videoLayer('in-board', { offset: 1, start: 3 });
    const ctx = context(scene([[board], [layer, 'board']]));
    const shots = rangeShots(ctx, 0, 9);
    const source = frames(shots, { videoFile: () => file() });

    expect((await play(source, shots.length, [layer])).flat()).toEqual(range(0, 9).map(() => 30));
    expect(mocks.drawn).toEqual([30]);
  });

  it('plays a layer in the artboard exported on the artboard’s timeline', async () => {
    const board = artboard('board', 0, 0, 400, 300);
    const layer = videoLayer('in-board');
    const sg = scene([[board], [layer, 'board']]);
    const ctx = context(sg, { exportRootIds: ['board'] });
    const shots = rangeShots(ctx, 0, 4);
    const source = frames(shots, { videoFile: () => file() });

    expect((await play(source, shots.length, [layer])).flat()).toEqual(range(0, 4));
  });

  it('plays each slide’s videos on its own timeline, and holds them through a transition', async () => {
    const first = videoLayer('first');
    const second = videoLayer('second', { offset: 2 });
    const sg = scene([
      [artboard('a', 0, 0, 320, 180)],
      [first, 'a'],
      [artboard('b', 400, 0, 320, 180)],
      [second, 'b'],
    ]);
    const timeline: Timeline = createTimeline({
      frameRate: 30,
      artboards: {
        a: { duration: 4 },
        b: { duration: 3, transition: { type: 'fade', duration: 0.1, easing: 'linear' } },
      },
    });
    const slide = (id: string) => ({
      ctx: context(sg, {
        timeline: scopedTimeline(timeline, id, inTimelineScope(sg, id)),
        exportRootIds: [id],
      }),
      frameCount: timeline.artboards![id]!.duration,
      transition: timeline.artboards![id]!.transition ?? null,
    });
    const { shots } = sampleSlides([slide('a'), slide('b')], { frameRate: 30 });
    // Four of the first, the three of the transition, three of the second
    expect(shots).toHaveLength(10);
    const source = frames(shots, {
      videoFile: (id) => (id === 'video-first' || id === 'video-second' ? file() : undefined),
    });

    const seen = await play(source, shots.length, [first, second]);
    expect(seen).toEqual([
      [0, null],
      [1, null],
      [2, null],
      [3, null],
      // Held on the first slide's last frame, the second on its first
      [3, 60],
      [3, 60],
      [3, 60],
      [null, 60],
      [null, 61],
      [null, 62],
    ]);
    // Each frame decoded once: the transition holds the pictures it has
    expect(mocks.drawn).toEqual([0, 1, 2, 3, 60, 61, 62]);
  });

  it('starts over when the export draws its frames again (a GIF’s second pass)', async () => {
    const layer = videoLayer('clip');
    const ctx = context(scene([[layer]]));
    const shots = rangeShots(ctx, 0, 4);
    const source = frames(shots, { videoFile: () => file() });

    await play(source, shots.length, [layer]);
    expect((await play(source, shots.length, [layer])).flat()).toEqual(range(0, 4));
    expect(mocks.runs).toHaveLength(2);
    expect(mocks.runs[1]!.map((t) => Math.floor(t * 30 + 1e-9))).toEqual(range(0, 4));
  });

  it('decodes at the size the layer is drawn at on the export, never larger than the video', async () => {
    // 160 × 90 at 1:1; one keyed to twice its size; one far bigger than its video
    const plain = videoLayer('plain');
    const grows = videoLayer('grows');
    const huge = videoLayer('huge', {}, { width: 4000, height: 2250 });
    const sg = scene([[plain], [grows], [huge]]);
    const timeline = createTimeline({ frameRate: 30 });
    timeline.tracks.push(
      createTrack('grows', 'transform.scale.x', [
        { id: 'k1', time: 0, value: 1, easing: 'linear' },
        { id: 'k2', time: 3, value: 2, easing: 'linear' },
      ])
    );
    const ctx = context(sg, { timeline });
    const shots = rangeShots(ctx, 0, 0);
    const source = frames(shots, { videoFile: () => file() });
    await source.prepare(0);

    expect(mocks.sinks.map((options) => options.width)).toEqual([160, 320, undefined]);
    expect(mocks.sinks.every((options) => options.poolSize === 2)).toBe(true);
  });

  it('draws the strip’s still for each moment of a video whose file is missing, and says so', async () => {
    const layer = videoLayer('missing');
    const ctx = context(scene([[layer]]));
    const shots = rangeShots(ctx, 0, 30, 2);
    const source = frames(shots, {
      videos: [libraryEntry('video-missing')],
      videoFile: () => undefined,
    });

    // At 2 fps, half a second apart: the strip's 4 a second, every other still
    expect((await play(source, shots.length, [layer])).flat()).toEqual(['still:0', 'still:2']);
    expect(source.problems).toEqual(['video-missing.mp4']);
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(mocks.inputs).toBe(0);
  });

  it('goes on with the strip when a video stops decoding', async () => {
    const layer = videoLayer('breaks');
    const ctx = context(scene([[layer]]));
    const shots = rangeShots(ctx, 0, 22, 4);
    const source = frames(shots, {
      videos: [libraryEntry('video-breaks')],
      videoFile: () => file({ failAt: 15 }),
    });

    expect((await play(source, shots.length, [layer])).flat()).toEqual([0, 7, 'still:2']);
    expect(source.problems).toEqual(['video-breaks.mp4']);
  });

  it('gives up on a decoder that stalls, drawing nothing without a strip', async () => {
    const layer = videoLayer('stalls');
    const ctx = context(scene([[layer]]));
    const shots = rangeShots(ctx, 0, 2);
    const source = frames(shots, { videoFile: () => file({ stallAt: 1 }) }, { timeout: 20 });

    expect((await play(source, shots.length, [layer])).flat()).toEqual([0, null, null]);
    expect(source.problems).toEqual(['video-stalls']);
  });

  it('stops decoding and lets the files go when disposed, a frame being prepared too', async () => {
    const layer = videoLayer('clip');
    const ctx = context(scene([[layer]]));
    const shots = rangeShots(ctx, 0, 9);
    const source = frames(shots, { videoFile: () => file({ stallAt: 2 }) });
    await source.prepare(0);
    await source.prepare(1);

    const pending = source.prepare(2);
    source.dispose();
    await expect(pending).resolves.toBeUndefined();
    expect(mocks.disposed).toBe(1);
    expect(source.provider(layer)).toBeNull();
    // Nothing more is decoded
    await source.prepare(3);
    expect(mocks.drawn).toEqual([0, 1]);
  });

  it('decodes nothing for hidden layers or an export without videos', async () => {
    const hidden = videoLayer('hidden', {}, { visible: false });
    const ctx = context(scene([[hidden]]));
    const shots = rangeShots(ctx, 0, 2);
    const source = frames(shots, { videoFile: () => file() });

    expect((await play(source, shots.length, [hidden])).flat()).toEqual([null, null, null]);
    expect(mocks.inputs).toBe(0);
  });

  it('shows the first picture of a video in a symbol an instance draws', async () => {
    const inner = videoLayer('inner', { offset: 0.5 });
    const symbol: SymbolDefinition = {
      id: 'sym',
      name: 'Symbol',
      sceneGraphJSON: { nodes: [inner], rootNodeIds: ['inner'] },
    };
    const instance = {
      ...base('instance'),
      type: 'symbol-instance',
      symbolId: 'sym',
      overrides: [],
    };
    const ctx = context(scene([[instance as Node]]), { symbols: [symbol] });
    const shots = rangeShots(ctx, 0, 2);
    const source = frames(shots, { videoFile: () => file() });

    expect((await play(source, shots.length, [inner])).flat()).toEqual([15, 15, 15]);
    expect(mocks.drawn).toEqual([15]);
  });
});
