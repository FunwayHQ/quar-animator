// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Node, Timeline } from '@quar/types';

const mocks = vi.hoisted(() => ({
  gl: null as any,
  rendererOptions: [] as any[],
  shapeRendererInstances: [] as any[],
  rendererDispose: vi.fn(),
  shapeRendererDispose: vi.fn(),
  render: vi.fn(),
  preloadTextures: vi.fn(),
  evaluateTimelineAtFrame: vi.fn(),
  applyAnimatedValues: vi.fn(),
  mat3Create: vi.fn((...values: number[]) => values),
  mat3Multiply: vi.fn(() => new Float32Array([1, 0, 0, 1, 0, 0])),
  setDrawRigHelpers: vi.fn(),
  setSymbolDefinitions: vi.fn(),
  loseContext: vi.fn(),
  evaluateIKChains: vi.fn(),
  evaluateDynamicChainsAtFrame: vi.fn(),
  evaluateSmartBones: vi.fn(() => new Map()),
  resetDynamicChainStates: vi.fn(),
}));

vi.mock('@quar/core', () => ({
  WebGLRenderer: class {
    context = mocks.gl;
    dispose = mocks.rendererDispose;

    constructor(options: unknown) {
      mocks.rendererOptions.push(options);
    }
  },
  ShapeRenderer: class {
    render = mocks.render;
    preloadTextures = mocks.preloadTextures;
    setDrawRigHelpers = mocks.setDrawRigHelpers;
    setSymbolDefinitions = mocks.setSymbolDefinitions;
    dispose = mocks.shapeRendererDispose;

    constructor() {
      mocks.shapeRendererInstances.push(this);
    }
  },
  mat3: { create: mocks.mat3Create, multiply: mocks.mat3Multiply },
}));

vi.mock('@quar/animation', () => ({
  evaluateTimelineAtFrame: mocks.evaluateTimelineAtFrame,
  applyAnimatedValues: mocks.applyAnimatedValues,
}));

vi.mock('@quar/rigging', () => ({
  evaluateIKChains: mocks.evaluateIKChains,
  evaluateDynamicChainsAtFrame: mocks.evaluateDynamicChainsAtFrame,
  evaluateSmartBones: mocks.evaluateSmartBones,
  resetDynamicChainStates: mocks.resetDynamicChainStates,
}));

import { createFrameRenderer, getFrameRenderRoots } from './frameRenderer';

function createSceneGraph(node: Record<string, unknown>) {
  return {
    getNode: vi.fn((id: string) => (id === node.id ? node : null)),
    updateNode: vi.fn((_id: string, patch: Record<string, unknown>) => Object.assign(node, patch)),
    getRootNodes: vi.fn(() => [node]),
  };
}

describe('createFrameRenderer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.render.mockReset();
    mocks.rendererOptions.length = 0;
    mocks.shapeRendererInstances.length = 0;
    mocks.gl = {
      COLOR_BUFFER_BIT: 0x4000,
      viewport: vi.fn(),
      clearColor: vi.fn(),
      clear: vi.fn(),
      getExtension: vi.fn(() => ({ loseContext: mocks.loseContext })),
    };
    // Every node a track animates gets opacity 0.25
    mocks.evaluateTimelineAtFrame.mockImplementation(
      (timeline: { tracks: Array<{ nodeId: string }> }) =>
        new Map(timeline.tracks.map((track) => [track.nodeId, new Map([['opacity', 0.25]])]))
    );
    mocks.applyAnimatedValues.mockImplementation((node: Record<string, unknown>) => ({
      ...node,
      opacity: 0.25,
    }));
  });

  it('creates a scaled offscreen canvas and restores animated nodes after rendering', () => {
    const node = { id: 'shape-1', opacity: 1, position: { x: 10, y: 20 } };
    const sceneGraph = createSceneGraph(node);
    const timeline = { tracks: [{ nodeId: 'shape-1' }] } as unknown as Timeline;
    mocks.render.mockImplementation(() => expect(node.opacity).toBe(0.25));

    const handle = createFrameRenderer({
      width: 101,
      height: 49,
      multiplier: 1.5,
      backgroundColor: { r: 12, g: 34, b: 56, a: 0.75 },
    });
    const canvas = handle.renderFrame({ sceneGraph: sceneGraph as any, timeline }, 12);

    expect(canvas.width).toBe(152);
    expect(canvas.height).toBe(74);
    expect(mocks.rendererOptions[0]).toMatchObject({ preserveDrawingBuffer: true, alpha: true });
    expect(mocks.evaluateTimelineAtFrame).toHaveBeenCalledWith(timeline, 12);
    expect(mocks.gl.viewport).toHaveBeenCalledWith(0, 0, 152, 74);
    expect(mocks.gl.clearColor).toHaveBeenCalledWith(12 / 255, 34 / 255, 56 / 255, 0.75);
    expect(mocks.render).toHaveBeenCalledWith(
      sceneGraph,
      expect.any(Float32Array),
      new Set(),
      null,
      undefined,
      undefined
    );
    expect(node).toEqual({ id: 'shape-1', opacity: 1, position: { x: 10, y: 20 } });
    expect(sceneGraph.updateNode).toHaveBeenLastCalledWith('shape-1', {
      id: 'shape-1',
      opacity: 1,
      position: { x: 10, y: 20 },
    });
  });

  it('restores node state if WebGL rendering throws', () => {
    const node = { id: 'shape-1', opacity: 1 };
    const sceneGraph = createSceneGraph(node);
    const timeline = { tracks: [{ nodeId: 'shape-1' }] } as unknown as Timeline;
    mocks.render.mockImplementation(() => {
      throw new Error('draw failed');
    });
    const handle = createFrameRenderer({ width: 100, height: 100 });

    expect(() => handle.renderFrame({ sceneGraph: sceneGraph as any, timeline }, 4)).toThrow(
      'draw failed'
    );
    expect(node.opacity).toBe(1);
    expect(sceneGraph.updateNode).toHaveBeenLastCalledWith('shape-1', {
      id: 'shape-1',
      opacity: 1,
    });
  });

  it('uses a transparent clear by default, preloads textures, exports blobs, and disposes resources', async () => {
    const node = { id: 'shape-1', opacity: 1 };
    const sceneGraph = createSceneGraph(node);
    const timeline = { tracks: [] } as unknown as Timeline;
    const handle = createFrameRenderer({ width: 20, height: 30 });
    const canvas = mocks.rendererOptions[0].canvas as HTMLCanvasElement;
    const png = new Blob(['frame']);
    canvas.toBlob = vi.fn((callback: BlobCallback) => callback(png));

    await handle.preloadTextures([node as unknown as Node], sceneGraph as any);
    await expect(
      handle.renderFrameAsBlob({ sceneGraph: sceneGraph as any, timeline }, 0)
    ).resolves.toBe(png);
    handle.dispose();

    expect(mocks.preloadTextures).toHaveBeenCalledWith([node], sceneGraph);
    expect(mocks.gl.clearColor).toHaveBeenCalledWith(0, 0, 0, 0);
    expect(canvas.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/png');
    expect(mocks.shapeRendererDispose).toHaveBeenCalledOnce();
    expect(mocks.rendererDispose).toHaveBeenCalledOnce();
    expect(mocks.gl.getExtension).toHaveBeenCalledWith('WEBGL_lose_context');
    expect(mocks.loseContext).toHaveBeenCalledOnce();
  });

  it('hands the symbols over before preloading, so images inside them load', async () => {
    const node = { id: 'shape-1', opacity: 1 };
    const sceneGraph = createSceneGraph(node);
    const symbol = { id: 'sym-1', name: 'Photo', sceneGraphJSON: { nodes: [], rootNodeIds: [] } };
    const order: string[] = [];
    mocks.setSymbolDefinitions.mockImplementation(() => order.push('symbols'));
    mocks.preloadTextures.mockImplementation(() => order.push('preload'));
    const handle = createFrameRenderer({ width: 10, height: 10 });

    await handle.preloadTextures([node as unknown as Node], sceneGraph as any, [symbol as never]);

    expect(order).toEqual(['symbols', 'preload']);
    mocks.setSymbolDefinitions.mockReset();
    mocks.preloadTextures.mockReset();
  });

  it('hands the scene’s symbol definitions to the shape renderer, so instances draw', () => {
    const node = { id: 'shape-1', opacity: 1 };
    const sceneGraph = createSceneGraph(node);
    const timeline = { tracks: [] } as unknown as Timeline;
    const symbol = { id: 'sym-1', name: 'Star', sceneGraphJSON: { nodes: [], rootNodeIds: [] } };
    const symbols = [symbol as never];
    const handle = createFrameRenderer({ width: 10, height: 10 });

    handle.renderFrame({ sceneGraph: sceneGraph as any, timeline, symbols }, 0);
    handle.renderFrame({ sceneGraph: sceneGraph as any, timeline, symbols }, 1);
    expect(mocks.setSymbolDefinitions).toHaveBeenCalledOnce();
    expect(mocks.setSymbolDefinitions).toHaveBeenCalledWith(new Map([['sym-1', symbol]]));
  });

  it('maps the selected artboard bounds to the output and renders only that subtree', () => {
    const node = { id: 'artboard-1', opacity: 1 };
    const sceneGraph = createSceneGraph(node);
    const timeline = { tracks: [] } as unknown as Timeline;
    const handle = createFrameRenderer({ width: 400, height: 200 });

    handle.renderFrame(
      {
        sceneGraph: sceneGraph as any,
        timeline,
        exportRootIds: ['artboard-1'],
        viewportBounds: { x: 100, y: 200, width: 400, height: 200 },
      },
      0
    );

    expect(mocks.mat3Create).toHaveBeenCalledWith(1 / 200, 0, 0, 1 / 100, 0, 0);
    expect(mocks.mat3Create).toHaveBeenCalledWith(1, 0, 0, 1, -300, -300);
    expect(mocks.render).toHaveBeenCalledWith(
      sceneGraph,
      expect.any(Float32Array),
      new Set(),
      null,
      undefined,
      ['artboard-1']
    );
  });
});

describe('getFrameRenderRoots', () => {
  it('returns selected roots when an export scope is set and all scene roots otherwise', () => {
    const artboard = { id: 'artboard-1' } as Node;
    const outsideNode = { id: 'outside-1' } as Node;
    const sceneGraph = {
      getNode: (id: string) => (id === artboard.id ? artboard : undefined),
      getRootNodes: () => [artboard, outsideNode],
    };

    expect(
      getFrameRenderRoots({
        sceneGraph: sceneGraph as any,
        timeline: {} as Timeline,
        exportRootIds: ['artboard-1'],
      })
    ).toEqual([artboard]);
    expect(
      getFrameRenderRoots({ sceneGraph: sceneGraph as any, timeline: {} as Timeline })
    ).toEqual([artboard, outsideNode]);
  });
});

describe('exports pose rigs like the editor', () => {
  const bone = { id: 'bone', type: 'bone', transform: { rotation: 0 } };
  const mesh = { id: 'mesh', type: 'path', skinData: { vertexCount: 4 } };
  const nodes: Record<string, Record<string, unknown>> = { bone, mesh };
  const sceneGraph = {
    getNode: vi.fn((id: string) => nodes[id]),
    updateNode: vi.fn((id: string, patch: Record<string, unknown>) =>
      Object.assign(nodes[id]!, patch)
    ),
    getRootNodes: vi.fn(() => [bone, mesh]),
    traverse: vi.fn((visit: (node: unknown) => void) => {
      visit(bone);
      visit(mesh);
    }),
  };
  const timeline = { tracks: [] } as unknown as Timeline;
  const rig = {
    ikChains: [{ id: 'ik' }],
    dynamicChains: [{ id: 'hair', enabled: true }],
    smartBoneActions: [{ id: 'bulge' }],
    frameRate: 30,
  } as never;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.gl = { COLOR_BUFFER_BIT: 0x4000, viewport: vi.fn(), clearColor: vi.fn(), clear: vi.fn() };
    bone.transform.rotation = 0;
  });

  it('leaves bones out of the artwork', () => {
    createFrameRenderer({ width: 10, height: 10 });
    expect(mocks.setDrawRigHelpers).toHaveBeenCalledWith(false);
  });

  it('solves IK, then physics, then Smart Bones, and renders the morphs', () => {
    const morphs = new Map([['mesh', new Float32Array([1, 2])]]);
    mocks.evaluateSmartBones.mockReturnValue(morphs);
    mocks.evaluateIKChains.mockImplementation(() => {
      bone.transform = { rotation: 45 };
    });
    let rotationWhileDrawing = 0;
    mocks.render.mockImplementation(() => {
      rotationWhileDrawing = bone.transform.rotation;
    });

    const handle = createFrameRenderer({ width: 10, height: 10 });
    handle.renderFrame({ sceneGraph: sceneGraph as any, timeline, rig }, 3);

    const order = [
      mocks.evaluateIKChains,
      mocks.evaluateDynamicChainsAtFrame,
      mocks.evaluateSmartBones,
      mocks.render,
    ].map((fn) => fn.mock.invocationCallOrder[0]!);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(mocks.evaluateSmartBones).toHaveBeenCalledWith(
      [{ id: 'bulge' }],
      sceneGraph,
      new Map([['mesh', 4]])
    );
    expect(mocks.render.mock.calls[0]![4]).toBe(morphs);
    // Posed while drawing, back to the editor's pose afterwards
    expect(rotationWhileDrawing).toBe(45);
    expect(bone.transform.rotation).toBe(0);
  });

  it('steps physics a frame at a time and restarts it when a pass goes back', () => {
    const handle = createFrameRenderer({ width: 10, height: 10 });
    for (const frame of [0, 1, 2, 0, 1]) {
      handle.renderFrame({ sceneGraph: sceneGraph as any, timeline, rig }, frame);
    }
    const calls = mocks.evaluateDynamicChainsAtFrame.mock.calls;
    // Simulated up to each frame at the timeline's rate, on one clock that
    // restarts the simulation when a pass goes back
    expect(calls.map((call) => call[3])).toEqual([0, 1, 2, 0, 1]);
    expect(calls.every((call) => call[4] === 30)).toBe(true);
    expect(new Set(calls.map((call) => call[6])).size).toBe(1);
  });

  it('renders as before without a rig', () => {
    const handle = createFrameRenderer({ width: 10, height: 10 });
    handle.renderFrame({ sceneGraph: sceneGraph as any, timeline }, 0);
    expect(mocks.evaluateIKChains).not.toHaveBeenCalled();
    expect(mocks.render.mock.calls[0]![4]).toBeUndefined();
  });
});
