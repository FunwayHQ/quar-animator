// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { generateSpriteSheetMetadata } from './spriteSheetMetadata';
import { packGrid, packMaxRects } from './binPacking';
import type { PackResult } from './binPacking';
import { exportSpriteSheet } from './spriteSheet';
import type { FrameRenderContext } from './frameRenderer';

const mockFrameRenderer = vi.hoisted(() => ({
  preloadTextures: vi.fn(async () => {}),
  renderFrame: vi.fn(() => ({ width: 20, height: 10 })),
  dispose: vi.fn(),
}));

/** The video pictures decoded for each frame, stood in for: what's prepared, in order */
const videoFrames = vi.hoisted(() => ({
  made: [] as Array<{ shots: unknown[]; size: unknown; sources: unknown }>,
  log: [] as string[],
  provider: () => null,
  disposed: 0,
}));

vi.mock('./video/exportFrames', () => ({
  createExportVideoFrames: (shots: unknown[], size: unknown, sources: unknown) => {
    videoFrames.made.push({ shots, size, sources });
    videoFrames.log = [];
    videoFrames.disposed = 0;
    return {
      provider: videoFrames.provider,
      problems: [],
      prepare: async (index: number) => {
        await Promise.resolve();
        videoFrames.log.push(`prepare ${index}`);
      },
      dispose: () => {
        videoFrames.disposed++;
      },
    };
  },
}));

vi.mock('./frameRenderer', async (importOriginal) => {
  // The shot plan as it is: only the renderer is stood in for
  const actual = await importOriginal<typeof import('./frameRenderer')>();
  return {
    framePlan: actual.framePlan,
    preloadShots: actual.preloadShots,
    createFrameRenderer: () => mockFrameRenderer,
    getFrameRenderRoots: (ctx: { sceneGraph: { getRootNodes: () => unknown[] } }) =>
      ctx.sceneGraph.getRootNodes(),
  };
});

// ============================================================================
// generateSpriteSheetMetadata
// ============================================================================

describe('generateSpriteSheetMetadata', () => {
  const packResult: PackResult = packGrid(4, 64, 64, 2, 0);

  it('leaves out frames the packer couldn’t place (they aren’t in the image)', () => {
    // Three 300-px frames in a 600 × 300 atlas: the third doesn't fit
    const packed = packMaxRects(
      Array.from({ length: 3 }, () => ({ width: 300, height: 300 })),
      600,
      300
    );
    expect(packed.rects.some((rect) => rect.x < 0)).toBe(true);
    const meta = generateSpriteSheetMetadata(
      packed,
      { startFrame: 0, endFrame: 2, frameWidth: 300, frameHeight: 300 },
      'sheet.png'
    );
    const frames = Object.values(meta.frames);
    expect(frames).toHaveLength(2);
    for (const { frame } of frames) expect(frame.x >= 0 && frame.y >= 0).toBe(true);
  });

  it('generates correct structure', () => {
    const meta = generateSpriteSheetMetadata(
      packResult,
      { startFrame: 0, endFrame: 3, frameWidth: 64, frameHeight: 64 },
      'sheet.png'
    );
    expect(meta.meta.app).toBe('Quar Animator');
    expect(meta.meta.image).toBe('sheet.png');
    expect(meta.meta.format).toBe('RGBA8888');
    expect(meta.meta.size).toEqual({ w: 128, h: 128 });
  });

  it('generates correct number of frame entries', () => {
    const meta = generateSpriteSheetMetadata(
      packResult,
      { startFrame: 0, endFrame: 3, frameWidth: 64, frameHeight: 64 },
      'sheet.png'
    );
    const frameKeys = Object.keys(meta.frames);
    expect(frameKeys).toHaveLength(4);
  });

  it('frame entries have correct positions', () => {
    const meta = generateSpriteSheetMetadata(
      packResult,
      { startFrame: 0, endFrame: 3, frameWidth: 64, frameHeight: 64 },
      'sheet.png'
    );
    const entries = Object.values(meta.frames);
    // First frame at (0,0)
    expect(entries[0].frame).toEqual({ x: 0, y: 0, w: 64, h: 64 });
    // Second frame at (64,0)
    expect(entries[1].frame).toEqual({ x: 64, y: 0, w: 64, h: 64 });
  });

  it('frame entries have correct sourceSize', () => {
    const meta = generateSpriteSheetMetadata(
      packResult,
      { startFrame: 0, endFrame: 3, frameWidth: 64, frameHeight: 64 },
      'sheet.png'
    );
    for (const entry of Object.values(meta.frames)) {
      expect(entry.sourceSize).toEqual({ w: 64, h: 64 });
      expect(entry.trimmed).toBe(false);
    }
  });

  it('uses custom filename pattern', () => {
    const meta = generateSpriteSheetMetadata(
      packResult,
      { startFrame: 0, endFrame: 3, frameWidth: 64, frameHeight: 64, filenamePattern: 'shot_{N}' },
      'sheet.png'
    );
    const keys = Object.keys(meta.frames);
    expect(keys[0]).toBe('shot_0.png');
    expect(keys[3]).toBe('shot_3.png');
  });

  it('handles non-zero start frame', () => {
    const result = packGrid(3, 32, 32, 3, 0);
    const meta = generateSpriteSheetMetadata(
      result,
      { startFrame: 10, endFrame: 12, frameWidth: 32, frameHeight: 32 },
      'out.png'
    );
    const keys = Object.keys(meta.frames);
    expect(keys[0]).toBe('frame_10.png');
    expect(keys[2]).toBe('frame_12.png');
  });

  it('handles packed layout with rotation', () => {
    const packResult: PackResult = {
      rects: [
        { frameIndex: 0, x: 0, y: 0, width: 100, height: 50, rotated: false },
        { frameIndex: 1, x: 0, y: 50, width: 50, height: 100, rotated: true },
      ],
      atlasWidth: 100,
      atlasHeight: 150,
    };
    const meta = generateSpriteSheetMetadata(
      packResult,
      { startFrame: 0, endFrame: 1, frameWidth: 100, frameHeight: 50 },
      'atlas.png'
    );
    const entries = Object.values(meta.frames);
    expect(entries[0].rotated).toBe(false);
    expect(entries[1].rotated).toBe(true);
  });

  it('empty pack result produces empty frames', () => {
    const emptyResult: PackResult = { rects: [], atlasWidth: 0, atlasHeight: 0 };
    const meta = generateSpriteSheetMetadata(
      emptyResult,
      { startFrame: 0, endFrame: -1, frameWidth: 64, frameHeight: 64 },
      'empty.png'
    );
    expect(Object.keys(meta.frames)).toHaveLength(0);
  });

  it('spriteSourceSize fields are correct', () => {
    const pack = packGrid(2, 120, 80, 2, 0);
    const meta = generateSpriteSheetMetadata(
      pack,
      { startFrame: 0, endFrame: 1, frameWidth: 120, frameHeight: 80 },
      'test.png'
    );
    const entries = Object.values(meta.frames);
    for (const entry of entries) {
      expect(entry.spriteSourceSize).toEqual({ x: 0, y: 0, w: 120, h: 80 });
    }
  });

  it('meta.scale is 1', () => {
    const meta = generateSpriteSheetMetadata(
      packResult,
      { startFrame: 0, endFrame: 3, frameWidth: 64, frameHeight: 64 },
      'sheet.png'
    );
    expect(meta.meta.scale).toBe(1);
  });

  it('meta.version is 1.0.0', () => {
    const meta = generateSpriteSheetMetadata(
      packResult,
      { startFrame: 0, endFrame: 3, frameWidth: 64, frameHeight: 64 },
      'sheet.png'
    );
    expect(meta.meta.version).toBe('1.0.0');
  });

  it('uses fallback filename for out-of-range rects', () => {
    const pack: PackResult = {
      rects: [{ frameIndex: 999, x: 0, y: 0, width: 32, height: 32, rotated: false }],
      atlasWidth: 32,
      atlasHeight: 32,
    };
    const meta = generateSpriteSheetMetadata(
      pack,
      { startFrame: 0, endFrame: 0, frameWidth: 32, frameHeight: 32 },
      'test.png'
    );
    // frameIndex 999 has no filename generated (only frame 0), uses fallback
    const keys = Object.keys(meta.frames);
    expect(keys).toHaveLength(1);
    expect(keys[0]).toBe('frame_999.png');
  });

  it('metadata size matches pack result', () => {
    const pack = packGrid(9, 100, 100, 3, 5);
    const meta = generateSpriteSheetMetadata(
      pack,
      { startFrame: 0, endFrame: 8, frameWidth: 100, frameHeight: 100 },
      's.png'
    );
    expect(meta.meta.size.w).toBe(pack.atlasWidth);
    expect(meta.meta.size.h).toBe(pack.atlasHeight);
  });

  it('uses the final image dimensions when the atlas is padded to powers of two', () => {
    const pack = packGrid(2, 20, 10, 2, 0);
    const meta = generateSpriteSheetMetadata(
      pack,
      {
        startFrame: 0,
        endFrame: 1,
        frameWidth: 20,
        frameHeight: 10,
        imageSize: { width: 64, height: 16 },
      },
      'power-of-two.png'
    );
    expect(meta.meta.size).toEqual({ w: 64, h: 16 });
  });
});

describe('Sprite Sheet - Grid + MaxRects Integration', () => {
  it('grid packing produces valid metadata', () => {
    const pack = packGrid(12, 50, 50, 4, 2);
    const meta = generateSpriteSheetMetadata(
      pack,
      { startFrame: 0, endFrame: 11, frameWidth: 50, frameHeight: 50 },
      'grid.png'
    );
    expect(Object.keys(meta.frames)).toHaveLength(12);
    // All positions should be non-negative
    for (const entry of Object.values(meta.frames)) {
      expect(entry.frame.x).toBeGreaterThanOrEqual(0);
      expect(entry.frame.y).toBeGreaterThanOrEqual(0);
    }
  });

  it('maxrects packing produces valid metadata', () => {
    const frames = Array.from({ length: 6 }, () => ({ width: 80, height: 80 }));
    const pack = packMaxRects(frames, 512, 512, 4);
    const meta = generateSpriteSheetMetadata(
      pack,
      { startFrame: 0, endFrame: 5, frameWidth: 80, frameHeight: 80 },
      'packed.png'
    );
    expect(Object.keys(meta.frames)).toHaveLength(6);
  });

  it('frame entries do not overlap in grid layout', () => {
    const pack = packGrid(4, 100, 100, 2, 0);
    const rects = pack.rects;
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i];
        const b = rects[j];
        const overlapsX = a.x < b.x + b.width && b.x < a.x + a.width;
        const overlapsY = a.y < b.y + b.height && b.y < a.y + a.height;
        expect(overlapsX && overlapsY).toBe(false);
      }
    }
  });
});

describe('exportSpriteSheet', () => {
  it('allocates and positions frames at the rendered pixel size', async () => {
    const draws: number[][] = [];
    const atlas = {
      width: 0,
      height: 0,
      getContext: () => ({
        drawImage: (_image: unknown, x: number, y: number) => draws.push([x, y]),
      }),
      toBlob: (callback: (blob: Blob) => void) => callback(new Blob(['png'])),
    };
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag, options) =>
      tag === 'canvas'
        ? (atlas as unknown as HTMLCanvasElement)
        : originalCreateElement(tag, options)
    );

    try {
      const context = {
        sceneGraph: { getRootNodes: () => [] },
      } as unknown as FrameRenderContext;
      const result = await exportSpriteSheet(context, {
        startFrame: 0,
        endFrame: 1,
        frameWidth: 10,
        frameHeight: 5,
        layout: 'grid',
        columns: 2,
        multiplier: 2,
        powerOfTwo: true,
      });
      const metadata = JSON.parse(result.metadata) as {
        meta: { size: { w: number; h: number } };
        frames: Record<string, { sourceSize: { w: number; h: number } }>;
      };

      expect([atlas.width, atlas.height]).toEqual([64, 16]);
      expect(draws).toEqual([
        [0, 0],
        [20, 0],
      ]);
      expect(metadata.meta.size).toEqual({ w: 64, h: 16 });
      expect(Object.values(metadata.frames).map((frame) => frame.sourceSize)).toEqual([
        { w: 20, h: 10 },
        { w: 20, h: 10 },
      ]);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('decodes the video layers’ pictures for each frame before drawing it, then lets them go', async () => {
    mockFrameRenderer.renderFrame.mockImplementation(((_: unknown, frame: number) => {
      videoFrames.log.push(`render ${frame}`);
      return { width: 20, height: 10 };
    }) as never);
    const videoFile = () => new Blob(['video']);
    const context = { sceneGraph: { getRootNodes: () => [] } } as unknown as FrameRenderContext;
    const atlas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: () => {} }),
      toBlob: (callback: (blob: Blob) => void) => callback(new Blob(['png'])),
    };
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag, options) =>
      tag === 'canvas'
        ? (atlas as unknown as HTMLCanvasElement)
        : originalCreateElement(tag, options)
    );
    try {
      await exportSpriteSheet(context, {
        startFrame: 4,
        endFrame: 5,
        frameWidth: 10,
        frameHeight: 5,
        layout: 'grid',
        multiplier: 2,
        videoFile,
      });
    } finally {
      vi.restoreAllMocks();
      mockFrameRenderer.renderFrame.mockImplementation(() => ({ width: 20, height: 10 }));
    }

    expect(videoFrames.log).toEqual(['prepare 0', 'render 4', 'prepare 1', 'render 5']);
    expect(videoFrames.made.at(-1)).toMatchObject({
      size: { width: 10, height: 5, multiplier: 2 },
      sources: { videoFile },
    });
    expect(videoFrames.disposed).toBe(1);
  });

  it('fails when packed frames exceed the atlas instead of returning a partial sheet', async () => {
    mockFrameRenderer.preloadTextures.mockClear();
    const context = {
      sceneGraph: { getRootNodes: () => [] },
    } as unknown as FrameRenderContext;

    await expect(
      exportSpriteSheet(context, {
        startFrame: 0,
        endFrame: 0,
        frameWidth: 4097,
        frameHeight: 8,
        layout: 'packed',
      })
    ).rejects.toThrow(/too large for the 4096 × 4096 atlas/);
    expect(mockFrameRenderer.preloadTextures).not.toHaveBeenCalled();
  });
});
