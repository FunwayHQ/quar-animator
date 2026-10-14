import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SceneGraph } from '@quar/core';
import type { ArtboardNode } from '@quar/types';
import { exportSelectionAsPng } from './exportService';

const mocks = vi.hoisted(() => ({
  preload: vi.fn(async () => {}),
  render: vi.fn(),
  shapeDispose: vi.fn(),
  rendererDispose: vi.fn(),
}));

vi.mock('@quar/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@quar/core')>();
  return {
    ...actual,
    WebGLRenderer: class {
      context = { viewport: vi.fn(), clearColor: vi.fn(), clear: vi.fn(), COLOR_BUFFER_BIT: 1 };
      dispose = mocks.rendererDispose;
    },
    ShapeRenderer: class {
      preloadTextures = mocks.preload;
      render = mocks.render;
      dispose = mocks.shapeDispose;
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

describe('transparent artboard PNG export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
  });
});
