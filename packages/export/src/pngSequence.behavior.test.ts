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

vi.mock('./frameRenderer', async (importOriginal) => {
  // The shot plan as it is: only the renderer is stood in for
  const actual = await importOriginal<typeof import('./frameRenderer')>();
  return {
    framePlan: actual.framePlan,
    preloadShots: actual.preloadShots,
    createFrameRenderer: mocks.createFrameRenderer,
    getFrameCount: mocks.getFrameCount,
    generateFrameFilenames: mocks.generateFrameFilenames,
    getFrameRenderRoots: (ctx: { sceneGraph: { getRootNodes: () => unknown[] } }) =>
      ctx.sceneGraph.getRootNodes(),
  };
});

import { exportPngSequence } from './pngSequence';

describe('exportPngSequence', () => {
  let renderer: {
    preloadTextures: ReturnType<typeof vi.fn>;
    renderFrame: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
  };
  let context: FrameRenderContext;
  // What the renderer's canvas gives as PNGs, frame by frame (the last again once they run out)
  let pngs: Array<Blob | null>;
  const png = (text: string) => new TextEncoder().encode(text) as unknown as Blob;

  beforeEach(() => {
    vi.clearAllMocks();
    pngs = [png('png')];
    const screen = {
      width: 10,
      height: 10,
      toBlob: (done: (blob: Blob | null) => void) =>
        done((pngs.length > 1 ? pngs.shift() : pngs[0]) ?? null),
    };
    renderer = {
      preloadTextures: vi.fn().mockResolvedValue(undefined),
      renderFrame: vi.fn(() => screen),
      dispose: vi.fn(),
    };
    mocks.createFrameRenderer.mockReturnValue(renderer);
    context = {
      sceneGraph: { getRootNodes: vi.fn().mockReturnValue([{ id: 'root' }]) } as any,
      timeline: { tracks: [] } as any,
    };
  });

  it('renders the inclusive range, reports progress, and returns a readable ZIP', async () => {
    pngs = [png('first-frame'), png('second-frame')];
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
    expect(renderer.renderFrame.mock.calls).toEqual([
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

  it('numbers every frame of the slides, one after another', async () => {
    const outro = { ...context, name: 'outro' } as FrameRenderContext;
    const archive = await exportPngSequence(context, {
      startFrame: 0,
      endFrame: 0,
      width: 64,
      height: 36,
      filenamePattern: 'slide_{N}',
      slides: [
        { ctx: context, frameCount: 2 },
        { ctx: outro, frameCount: 1 },
      ],
    });
    const zip = await JSZip.loadAsync(await archive.arrayBuffer());
    expect(renderer.renderFrame.mock.calls).toEqual([
      [context, 0],
      [context, 1],
      [outro, 0],
    ]);
    expect(Object.keys(zip.files).sort()).toEqual(['slide_0.png', 'slide_1.png', 'slide_2.png']);
  });

  it('numbers the frames of the transitions between the slides too', async () => {
    // Canvases the transition frames are blended on, each giving its PNG
    vi.stubGlobal('document', {
      createElement: () => {
        const canvas = {
          width: 0,
          height: 0,
          getContext: () => context,
          toBlob: (done: (blob: Blob | null) => void) => done(png('blend')),
        };
        const context = {
          canvas,
          save: vi.fn(),
          restore: vi.fn(),
          setTransform: vi.fn(),
          clearRect: vi.fn(),
          fillRect: vi.fn(),
          beginPath: vi.fn(),
          rect: vi.fn(),
          clip: vi.fn(),
          drawImage: vi.fn(),
          globalAlpha: 1,
          globalCompositeOperation: 'source-over',
          fillStyle: '',
        };
        return canvas;
      },
    });
    const outro = { ...context, name: 'outro' } as FrameRenderContext;
    const archive = await exportPngSequence(context, {
      startFrame: 0,
      endFrame: 0,
      width: 64,
      height: 36,
      filenamePattern: 'slide_{N}',
      frameRate: 10,
      slides: [
        { ctx: context, frameCount: 2 },
        { ctx: outro, frameCount: 1, transition: { type: 'wipe', duration: 0.3 } },
      ],
    });
    vi.unstubAllGlobals();
    const zip = await JSZip.loadAsync(await archive.arrayBuffer());
    // 2 + 3 frames of wipe (0.3 s at 10 fps) + 1
    expect(Object.keys(zip.files).sort()).toEqual([
      'slide_0.png',
      'slide_1.png',
      'slide_2.png',
      'slide_3.png',
      'slide_4.png',
      'slide_5.png',
    ]);
    await expect(zip.file('slide_3.png')!.async('string')).resolves.toBe('blend');
    // The incoming slide's first frame drawn once for the wipe, then shown
    expect(renderer.renderFrame.mock.calls).toEqual([
      [context, 0],
      [context, 1],
      [outro, 0],
      [outro, 0],
    ]);
  });

  it('skips null frame blobs and always disposes after a rendering failure', async () => {
    pngs = [null, png('never')];
    const screen = renderer.renderFrame();
    renderer.renderFrame.mockReset();
    renderer.renderFrame.mockReturnValueOnce(screen).mockImplementationOnce(() => {
      throw new Error('GPU lost');
    });

    await expect(
      exportPngSequence(context, { startFrame: 0, endFrame: 1, width: 10, height: 10 })
    ).rejects.toThrow('GPU lost');

    expect(renderer.renderFrame).toHaveBeenCalledTimes(2);
    expect(renderer.dispose).toHaveBeenCalledOnce();
  });

  it('omits a frame when the canvas cannot produce a PNG blob', async () => {
    pngs = [null, png('second-frame')];

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
