import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { exportGif } from './gifExporter';

const rendererMock = vi.hoisted(() => ({
  preloadTextures: vi.fn(async () => {}),
  renderFrame: vi.fn((_: unknown, frame: number) => ({ frame }) as unknown as HTMLCanvasElement),
  dispose: vi.fn(),
}));

vi.mock('./frameRenderer', () => ({
  createFrameRenderer: () => rendererMock,
  getFrameCount: (start: number, end: number) => Math.max(0, end - start + 1),
}));

describe('exportGif', () => {
  let drawFrame = 0;

  beforeEach(() => {
    drawFrame = 0;
    vi.clearAllMocks();

    const context = {
      clearRect: vi.fn(),
      drawImage: vi.fn((source: { frame: number }) => {
        drawFrame = source.frame;
      }),
      getImageData: vi.fn(() => ({
        data:
          drawFrame % 2 === 0
            ? new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255])
            : new Uint8ClampedArray([0, 0, 255, 255, 255, 255, 0, 255]),
      })),
    };
    vi.stubGlobal('document', {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => context,
      }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('writes every requested frame into a valid animated GIF and reports progress', async () => {
    const progress = vi.fn();
    const blob = await exportGif(
      { sceneGraph: { getRootNodes: () => [] } as never, timeline: { tracks: [] } as never },
      { width: 2, height: 1, frameRate: 12, startFrame: 4, endFrame: 5 },
      progress
    );

    expect(blob?.type).toBe('image/gif');
    const signature = new TextDecoder().decode((await blob!.arrayBuffer()).slice(0, 6));
    expect(signature).toMatch(/^GIF8[79]a$/);
    expect(rendererMock.renderFrame).toHaveBeenCalledTimes(4);
    expect(progress.mock.calls.some(([item]) => item.phase === 'preparing')).toBe(true);
    expect(progress.mock.calls.some(([item]) => item.phase === 'encoding')).toBe(true);
    expect(progress.mock.calls.at(-1)?.[0]).toMatchObject({ phase: 'finalizing', percentage: 100 });
    expect(rendererMock.dispose).toHaveBeenCalledOnce();
  });

  it('releases the renderer if the export is canceled during palette preparation', async () => {
    const isCancelled = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    const blob = await exportGif(
      { sceneGraph: { getRootNodes: () => [] } as never, timeline: { tracks: [] } as never },
      { width: 2, height: 1, frameRate: 24, startFrame: 0, endFrame: 2 },
      undefined,
      isCancelled
    );

    expect(blob).toBeNull();
    expect(rendererMock.dispose).toHaveBeenCalledOnce();
  });
});
