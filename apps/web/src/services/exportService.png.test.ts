import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SceneGraph } from '@quar/core';
import type { ArtboardNode } from '@quar/types';
import { exportSelectionAsPng } from './exportService';

const mocks = vi.hoisted(() => ({
  preload: vi.fn(async () => {}),
  render: vi.fn(),
  shapeDispose: vi.fn(),
  rendererDispose: vi.fn(),
  loseContext: vi.fn(),
  setVideoFrames: vi.fn(),
  /** The video pictures asked for, stood in for */
  videoFrames: [] as Array<{ shots: Array<{ ctx: unknown; frame: number }>; size: unknown }>,
  prepared: [] as number[],
  disposed: 0,
}));

vi.mock('@quar/export', () => ({
  createExportVideoFrames: (
    shots: Array<{ ctx: unknown; frame: number }>,
    size: unknown,
    sources: unknown
  ) => {
    mocks.videoFrames.push({ shots, size, sources } as never);
    return {
      provider: () => null,
      problems: [],
      prepare: async (index: number) => {
        mocks.prepared.push(index);
      },
      dispose: () => {
        mocks.disposed++;
      },
    };
  },
}));

vi.mock('@quar/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@quar/core')>();
  return {
    ...actual,
    WebGLRenderer: class {
      context = {
        viewport: vi.fn(),
        clearColor: vi.fn(),
        clear: vi.fn(),
        COLOR_BUFFER_BIT: 1,
        getExtension: (name: string) =>
          name === 'WEBGL_lose_context' ? { loseContext: mocks.loseContext } : null,
      };
      dispose = mocks.rendererDispose;
    },
    ShapeRenderer: class {
      preloadTextures = mocks.preload;
      render = mocks.render;
      dispose = mocks.shapeDispose;
      setVideoFrames = mocks.setVideoFrames;
    },
  };
});

function makeArtboard(): ArtboardNode {
  return {
    id: 'artboard',
    name: 'Artboard',
    type: 'artboard',
    parent: null,
    children: [],
    transform: {
      position: { x: 0, y: 0 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      anchor: { x: 0.5, y: 0.5 },
      skew: { x: 0, y: 0 },
    },
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    width: 100,
    height: 100,
    fills: [{ type: 'solid', color: { r: 255, g: 0, b: 0, a: 1 }, opacity: 1, visible: true }],
    clipContent: true,
  };
}

describe('artboard PNG export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.videoFrames = [];
    mocks.prepared = [];
    mocks.disposed = 0;
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) =>
      callback(null)
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders a background-free copy without changing the live artboard', async () => {
    const graph = new SceneGraph();
    const artboard = makeArtboard();
    graph.addNode(artboard);
    const updateNode = vi.spyOn(graph, 'updateNode');

    await exportSelectionAsPng([artboard], graph, { includeBackground: false });

    const renderGraph = mocks.render.mock.calls[0]?.[0] as SceneGraph;
    expect(renderGraph).not.toBe(graph);
    expect((renderGraph.getNode('artboard') as ArtboardNode).fills).toEqual([]);
    expect((graph.getNode('artboard') as ArtboardNode).fills).toHaveLength(1);
    expect(updateNode).not.toHaveBeenCalled();
    expect(mocks.shapeDispose).toHaveBeenCalledOnce();
    expect(mocks.rendererDispose).toHaveBeenCalledOnce();
  });

  it('draws its video layers at the moment shown, decoded before it’s drawn', async () => {
    const graph = new SceneGraph();
    const artboard = makeArtboard();
    graph.addNode(artboard);
    const timeline = { id: 't', name: 'T', duration: 60, frameRate: 30, tracks: [], markers: [] };
    const videoFile = () => new Blob(['video']);
    mocks.render.mockImplementationOnce(() => expect(mocks.prepared).toEqual([0]));

    await exportSelectionAsPng([artboard], graph, {
      multiplier: 2,
      moment: { timeline, frame: 12 },
      videoFile,
    });

    expect(mocks.videoFrames).toHaveLength(1);
    const [{ shots, size }] = mocks.videoFrames as [(typeof mocks.videoFrames)[number]];
    expect(shots).toEqual([
      {
        ctx: expect.objectContaining({
          timeline,
          exportRootIds: ['artboard'],
          viewportBounds: { x: -50, y: -50, width: 100, height: 100 },
        }),
        frame: 12,
      },
    ]);
    expect(size).toEqual({ width: 200, height: 200 });
    expect(mocks.setVideoFrames).toHaveBeenCalledWith(expect.any(Function));
    expect(mocks.disposed).toBe(1);
  });

  it('hands its WebGL context back to the browser when done', async () => {
    const graph = new SceneGraph();
    const artboard = makeArtboard();
    graph.addNode(artboard);

    await exportSelectionAsPng([artboard], graph);

    // Released at once, not left for garbage collection to count against the
    // browser's limit (past it, the editor's own canvas can lose its context)
    expect(mocks.loseContext).toHaveBeenCalledOnce();
    expect(mocks.rendererDispose.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.loseContext.mock.invocationCallOrder[0]!
    );
  });

  it('hands its WebGL context back when rendering fails', async () => {
    const graph = new SceneGraph();
    const artboard = makeArtboard();
    graph.addNode(artboard);
    mocks.render.mockImplementationOnce(() => {
      throw new Error('context lost');
    });

    await expect(exportSelectionAsPng([artboard], graph)).rejects.toThrow('context lost');

    expect(mocks.shapeDispose).toHaveBeenCalledOnce();
    expect(mocks.rendererDispose).toHaveBeenCalledOnce();
    expect(mocks.loseContext).toHaveBeenCalledOnce();
  });

  it('preserves the live artboard and disposes renderers if preload fails', async () => {
    const graph = new SceneGraph();
    const artboard = makeArtboard();
    graph.addNode(artboard);
    mocks.preload.mockRejectedValueOnce(new Error('texture failed'));

    await expect(
      exportSelectionAsPng([artboard], graph, { includeBackground: false })
    ).rejects.toThrow('texture failed');

    expect((graph.getNode('artboard') as ArtboardNode).fills).toHaveLength(1);
    expect(mocks.shapeDispose).toHaveBeenCalledOnce();
    expect(mocks.rendererDispose).toHaveBeenCalledOnce();
    expect(mocks.loseContext).toHaveBeenCalledOnce();
  });
});
