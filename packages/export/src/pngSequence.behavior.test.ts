import { beforeEach, describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import type { FrameRenderContext } from './frameRenderer';

const mocks = vi.hoisted(() => ({
  createFrameRenderer: vi.fn(),
  getFrameCount: vi.fn((start: number, end: number) => Math.max(0, end - start + 1)),
  generateFrameFilenames: vi.fn(
    (pattern: string, start: number, end: number, extension: string) => {
      const width = String(end).length;
      return Array.from(
        { length: Math.max(0, end - start + 1) },
        (_, index) =>
          `${pattern.replace('{N}', String(start + index).padStart(width, '0'))}.${extension}`
      );
    }
  ),
}));

vi.mock('./frameRenderer', () => ({
  createFrameRenderer: mocks.createFrameRenderer,
  getFrameCount: mocks.getFrameCount,
  generateFrameFilenames: mocks.generateFrameFilenames,
  getFrameRenderRoots: (ctx: { sceneGraph: { getRootNodes: () => unknown[] } }) =>
    ctx.sceneGraph.getRootNodes(),
}));

import { exportPngSequence } from './pngSequence';

describe('exportPngSequence', () => {
  let renderer: {
    preloadTextures: ReturnType<typeof vi.fn>;
    renderFrameAsBlob: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
  };
  let context: FrameRenderContext;

  beforeEach(() => {
    vi.clearAllMocks();
    renderer = {
      preloadTextures: vi.fn().mockResolvedValue(undefined),
      renderFrameAsBlob: vi.fn(),
      dispose: vi.fn(),
    };
    mocks.createFrameRenderer.mockReturnValue(renderer);
    context = {
      sceneGraph: { getRootNodes: vi.fn().mockReturnValue([{ id: 'root' }]) } as any,
      timeline: { tracks: [] } as any,
    };
  });

  it('renders the inclusive range, reports progress, and returns a readable ZIP', async () => {
    renderer.renderFrameAsBlob
      .mockResolvedValueOnce(new TextEncoder().encode('first-frame') as unknown as Blob)
      .mockResolvedValueOnce(new TextEncoder().encode('second-frame') as unknown as Blob);
    const onProgress = vi.fn();

    const archive = await exportPngSequence(
      context,
      {
        startFrame: 2,
        endFrame: 3,
        width: 640,
        height: 360,
        multiplier: 2,
        backgroundColor: { r: 12, g: 34, b: 56, a: 1 },
        filenamePattern: 'shot_{N}',
      },
      onProgress
    );
    const zip = await JSZip.loadAsync(await archive.arrayBuffer());

    expect(mocks.createFrameRenderer).toHaveBeenCalledWith({
      width: 640,
      height: 360,
      multiplier: 2,
      backgroundColor: { r: 12, g: 34, b: 56, a: 1 },
    });
    expect(renderer.preloadTextures).toHaveBeenCalledWith(
      [{ id: 'root' }],
      context.sceneGraph,
      context.symbols
    );
    expect(renderer.renderFrameAsBlob.mock.calls).toEqual([
      [context, 2],
      [context, 3],
    ]);
    expect(Object.keys(zip.files).sort()).toEqual(['shot_2.png', 'shot_3.png']);
    await expect(zip.file('shot_2.png')!.async('string')).resolves.toBe('first-frame');
    await expect(zip.file('shot_3.png')!.async('string')).resolves.toBe('second-frame');
    expect(onProgress.mock.calls.map(([progress]) => progress)).toEqual([
      { phase: 'rendering', current: 1, total: 2, percentage: 50 },
      { phase: 'rendering', current: 2, total: 2, percentage: 100 },
      { phase: 'finalizing', current: 2, total: 2, percentage: 100 },
    ]);
    expect(renderer.dispose).toHaveBeenCalledOnce();
  });

  it('skips null frame blobs and always disposes after a rendering failure', async () => {
    renderer.renderFrameAsBlob
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error('GPU lost'));

    await expect(
      exportPngSequence(context, { startFrame: 0, endFrame: 1, width: 10, height: 10 })
    ).rejects.toThrow('GPU lost');

    expect(renderer.renderFrameAsBlob).toHaveBeenCalledTimes(2);
    expect(renderer.dispose).toHaveBeenCalledOnce();
  });

  it('omits a frame when the canvas cannot produce a PNG blob', async () => {
    renderer.renderFrameAsBlob
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(new TextEncoder().encode('second-frame') as unknown as Blob);

    const archive = await exportPngSequence(context, {
      startFrame: 0,
      endFrame: 1,
      width: 10,
      height: 10,
    });
    const zip = await JSZip.loadAsync(await archive.arrayBuffer());

    expect(Object.keys(zip.files)).toEqual(['frame_1.png']);
    await expect(zip.file('frame_1.png')!.async('string')).resolves.toBe('second-frame');
  });

  it('disposes the renderer if texture preloading fails', async () => {
    renderer.preloadTextures.mockRejectedValue(new Error('texture load failed'));

    await expect(
      exportPngSequence(context, { startFrame: 0, endFrame: 0, width: 10, height: 10 })
    ).rejects.toThrow('texture load failed');

    expect(renderer.dispose).toHaveBeenCalledOnce();
  });
});
