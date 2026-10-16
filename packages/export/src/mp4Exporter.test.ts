import { beforeEach, describe, expect, it, vi } from 'vitest';
import { exportMp4 } from './mp4Exporter';

const mocks = vi.hoisted(() => ({
  canEncodeVideo: vi.fn(),
  renderer: {
    preloadTextures: vi.fn(async () => {}),
    renderFrame: vi.fn((_: unknown, frame: number) => ({ frame }) as unknown as HTMLCanvasElement),
    dispose: vi.fn(),
  },
  output: null as null | {
    videoSource: unknown;
    trackMetadata: unknown;
    state: 'pending' | 'started' | 'finalizing' | 'finalized' | 'canceled';
    target: { buffer: ArrayBuffer | null };
  },
  source: null as null | {
    canvas: unknown;
    config: unknown;
    frames: Array<[number, number]>;
    closed: boolean;
  },
}));

vi.mock('./frameRenderer', () => ({
  createFrameRenderer: () => mocks.renderer,
  getFrameCount: (start: number, end: number) => Math.max(0, end - start + 1),
  getFrameRenderRoots: (ctx: { sceneGraph: { getRootNodes: () => unknown[] } }) =>
    ctx.sceneGraph.getRootNodes(),
}));

vi.mock('mediabunny', () => ({
  canEncodeVideo: mocks.canEncodeVideo,
  Quality: class {
    constructor(readonly quality: string) {}
  },
  BufferTarget: class {
    buffer: ArrayBuffer | null = null;
  },
  Mp4OutputFormat: class {
    constructor(readonly options: unknown) {}
  },
  CanvasSource: class {
    frames: Array<[number, number]> = [];
    closed = false;
    constructor(
      readonly canvas: unknown,
      readonly config: unknown
    ) {
      mocks.source = this;
    }
    async add(timestamp: number, duration: number) {
      this.frames.push([timestamp, duration]);
    }
    close() {
      this.closed = true;
    }
  },
  Output: class {
    target: { buffer: ArrayBuffer | null };
    state: 'pending' | 'started' | 'finalizing' | 'finalized' | 'canceled' = 'pending';
    constructor(options: { target: { buffer: ArrayBuffer | null } }) {
      this.target = options.target;
      mocks.output = this as never;
    }
    addVideoTrack(source: unknown, metadata: unknown) {
      if (mocks.output) {
        mocks.output.videoSource = source;
        mocks.output.trackMetadata = metadata;
      }
    }
    async start() {
      this.state = 'started';
    }
    async finalize() {
      this.state = 'finalizing';
      this.target.buffer = new ArrayBuffer(8);
      this.state = 'finalized';
    }
    async cancel() {
      this.state = 'canceled';
    }
  },
}));

describe('exportMp4', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.output = null;
    mocks.source = null;
  });

  it('renders the selected range, muxes H.264 MP4, and reports progress', async () => {
    mocks.canEncodeVideo.mockResolvedValue(true);
    const progress = vi.fn();
    const blob = await exportMp4(
      { sceneGraph: { getRootNodes: () => [] } as never, timeline: { tracks: [] } as never },
      { width: 64, height: 48, frameRate: 24, startFrame: 10, endFrame: 12 },
      progress
    );

    expect(blob?.type).toBe('video/mp4');
    expect(mocks.canEncodeVideo).toHaveBeenCalledWith(
      'avc',
      expect.objectContaining({ width: 64, height: 48, frameRate: 24 })
    );
    expect(mocks.renderer.renderFrame).toHaveBeenCalledTimes(3);
    expect(mocks.source?.frames).toEqual([
      [0, 1 / 24],
      [1 / 24, 1 / 24],
      [2 / 24, 1 / 24],
    ]);
    expect(mocks.output?.trackMetadata).toEqual({ frameRate: 24 });
    expect(mocks.output?.state).toBe('finalized');
    expect(progress.mock.calls.at(-1)?.[0]).toMatchObject({ phase: 'finalizing', percentage: 100 });
    expect(mocks.renderer.dispose).toHaveBeenCalledOnce();
  });

  it('encodes at the chosen frame rate and playback speed', async () => {
    mocks.canEncodeVideo.mockResolvedValue(true);
    // 48 frames at 24 fps (2 s), at 12 fps and double speed: 1 s, 12 frames
    await exportMp4(
      { sceneGraph: { getRootNodes: () => [] } as never, timeline: { tracks: [] } as never },
      { width: 64, height: 48, frameRate: 24, startFrame: 0, endFrame: 47, fps: 12, speed: 2 }
    );
    expect(mocks.output?.trackMetadata).toEqual({ frameRate: 12 });
    const rendered = mocks.renderer.renderFrame.mock.calls.map(([, frame]) => frame);
    expect(rendered).toEqual([0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44]);
    expect(mocks.source?.frames).toHaveLength(12);
    expect(mocks.source?.frames.at(-1)).toEqual([11 / 12, 1 / 12]);
  });

  it('explains when the browser cannot encode H.264', async () => {
    mocks.canEncodeVideo.mockResolvedValue(false);

    await expect(
      exportMp4(
        { sceneGraph: { getRootNodes: () => [] } as never, timeline: { tracks: [] } as never },
        { width: 64, height: 48, frameRate: 24, startFrame: 0, endFrame: 1 }
      )
    ).rejects.toThrow(/does not support H\.264 MP4 encoding/i);
    expect(mocks.renderer.renderFrame).not.toHaveBeenCalled();
  });

  it('rejects odd frame dimensions with a clear message', async () => {
    await expect(
      exportMp4(
        { sceneGraph: { getRootNodes: () => [] } as never, timeline: { tracks: [] } as never },
        { width: 63, height: 48, frameRate: 24, startFrame: 0, endFrame: 1 }
      )
    ).rejects.toThrow(/even width and height/i);
    expect(mocks.canEncodeVideo).not.toHaveBeenCalled();
  });

  it('rejects reversed ranges and dimensions below one pixel', async () => {
    const ctx = { sceneGraph: { getRootNodes: () => [] }, timeline: { tracks: [] } } as never;

    await expect(
      exportMp4(ctx, { width: 64, height: 48, frameRate: 24, startFrame: 3, endFrame: 2 })
    ).rejects.toThrow('Choose a valid frame range');
    await expect(
      exportMp4(ctx, { width: 0, height: 48, frameRate: 24, startFrame: 0, endFrame: 1 })
    ).rejects.toThrow('at least 1 pixel');

    expect(mocks.canEncodeVideo).not.toHaveBeenCalled();
    expect(mocks.renderer.dispose).not.toHaveBeenCalled();
  });

  it('cleans up when canceled after texture preload but before encoding starts', async () => {
    mocks.canEncodeVideo.mockResolvedValue(true);
    const isCancelled = vi.fn().mockReturnValue(true);

    const result = await exportMp4(
      { sceneGraph: { getRootNodes: () => [] } as never, timeline: { tracks: [] } as never },
      { width: 64, height: 48, frameRate: 24, startFrame: 0, endFrame: 1 },
      undefined,
      isCancelled
    );

    expect(result).toBeNull();
    expect(mocks.renderer.preloadTextures).toHaveBeenCalledOnce();
    expect(mocks.renderer.renderFrame).not.toHaveBeenCalled();
    expect(mocks.renderer.dispose).toHaveBeenCalledOnce();
  });

  it('closes the source and cancels the output when interrupted during encoding', async () => {
    mocks.canEncodeVideo.mockResolvedValue(true);
    const isCancelled = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);

    const result = await exportMp4(
      { sceneGraph: { getRootNodes: () => [] } as never, timeline: { tracks: [] } as never },
      { width: 64, height: 48, frameRate: 24, startFrame: 0, endFrame: 1 },
      undefined,
      isCancelled
    );

    expect(result).toBeNull();
    expect(mocks.source?.closed).toBe(true);
    expect(mocks.output?.state).toBe('canceled');
    expect(mocks.renderer.dispose).toHaveBeenCalledOnce();
  });
});
