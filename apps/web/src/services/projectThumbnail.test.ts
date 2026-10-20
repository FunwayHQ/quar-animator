/**
 * Tests for project thumbnails: what region they show and how they're drawn
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Node } from '@quar/types';
import { SceneGraph, createDefaultTransform, createGroupNode } from '@quar/core';

const mocks = vi.hoisted(() => ({
  createFrameRenderer: vi.fn(),
  preloadTextures: vi.fn(),
  renderFrameAsBlob: vi.fn(),
  dispose: vi.fn(),
  loadBundledFonts: vi.fn(),
}));

vi.mock('@quar/export', () => ({ createFrameRenderer: mocks.createFrameRenderer }));
vi.mock('./bundledFonts', () => ({ loadBundledFonts: mocks.loadBundledFonts }));

import {
  findThumbnailRegion,
  pickThumbnailScene,
  renderProjectThumbnail,
  thumbnailPixelSize,
  THUMBNAIL_MAX_WIDTH,
  THUMBNAIL_MAX_HEIGHT,
} from './projectThumbnail';
import type { ProjectData } from './projectSerializer';

// ============================================================================
// Fixtures
// ============================================================================

function base(id: string, x = 0, y = 0) {
  return {
    id,
    name: id,
    parent: null,
    children: [] as string[],
    transform: { ...createDefaultTransform(), position: { x, y } },
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal' as const,
  };
}

function rect(id: string, x: number, y: number, width: number, height: number, strokeWidth = 0) {
  return {
    ...base(id, x, y),
    type: 'rectangle',
    width,
    height,
    cornerRadius: 0,
    fills: [],
    strokes: strokeWidth
      ? [{ visible: true, width: strokeWidth, color: { r: 0, g: 0, b: 0, a: 1 } }]
      : [],
  } as unknown as Node;
}

function artboard(id: string, x: number, y: number, width: number, height: number) {
  return {
    ...base(id, x, y),
    type: 'artboard',
    width,
    height,
    fills: [],
    clipContent: true,
  } as Node;
}

function bone(id: string, x: number, y: number, length: number) {
  return {
    ...base(id, x, y),
    type: 'bone',
    length,
    boneStyle: 'diamond',
    boneColor: '#E0E0E0',
  } as unknown as Node;
}

function graph(...nodes: Array<[Node, string?]>): SceneGraph {
  const sg = new SceneGraph();
  for (const [node, parent] of nodes) sg.addNode(node, parent);
  return sg;
}

function project(
  pages: Array<{ id: string; nodes: Node[] }>,
  activePageId: string,
  extra: Partial<ProjectData> = {}
): ProjectData {
  return {
    version: '2.0',
    name: 'Test',
    createdAt: '2026-10-20T00:00:00.000Z',
    updatedAt: '2026-10-20T00:00:00.000Z',
    pages: pages.map((p) => {
      const sg = graph(...p.nodes.map((n) => [structuredClone(n)] as [Node]));
      return {
        id: p.id,
        name: p.id,
        sceneGraph: sg.toJSON(),
        timeline: undefined as never,
      };
    }),
    activePageId,
    settings: {
      timelineDuration: 60,
      frameRate: 24,
      autoKeyframe: false,
      onionSkin: undefined as never,
    },
    ...extra,
  } as ProjectData;
}

// ============================================================================
// Region
// ============================================================================

describe('findThumbnailRegion', () => {
  it('shows the first visible artboard, and only it', () => {
    const sg = graph(
      [rect('loose', 900, 900, 50, 50)],
      [artboard('hidden-board', 0, 0, 100, 100)],
      [artboard('board-1', 400, 300, 800, 600)],
      [artboard('board-2', 2000, 0, 200, 200)]
    );
    sg.updateNode('hidden-board', { visible: false });

    const region = findThumbnailRegion(sg);

    expect(region).toEqual({
      kind: 'artboard',
      bounds: { x: 0, y: 0, width: 800, height: 600 },
      rootIds: ['board-1'],
    });
  });

  it('frames all visible artwork, padded and widened to the card shape, when there is no artboard', () => {
    const sg = graph([rect('a', 50, 50, 100, 100)], [rect('b', 250, 50, 100, 100)]);

    const region = findThumbnailRegion(sg)!;

    // Artwork spans x 0..300, y 0..100; padded by 8% of 300 on every side
    expect(region.kind).toBe('content');
    expect(region.rootIds).toBeUndefined();
    expect(region.bounds.x).toBeCloseTo(-24);
    expect(region.bounds.width).toBeCloseTo(348);
    // Widened about the center to the 560×350 card shape
    expect(region.bounds.width / region.bounds.height).toBeCloseTo(
      THUMBNAIL_MAX_WIDTH / THUMBNAIL_MAX_HEIGHT
    );
    expect(region.bounds.y + region.bounds.height / 2).toBeCloseTo(50);
  });

  it('leaves out bones, hidden layers and fully transparent layers', () => {
    const group = createGroupNode('hidden-group', 'Hidden');
    group.visible = false;
    const faded = rect('faded', 5000, 5000, 10, 10);
    faded.opacity = 0;
    const sg = graph(
      [rect('shape', 50, 50, 100, 100)],
      [bone('arm', -1000, 0, 400)],
      [group],
      [rect('inside-hidden', 3000, 3000, 10, 10), 'hidden-group'],
      [faded]
    );

    const { bounds } = findThumbnailRegion(sg)!;

    expect(bounds.x).toBeGreaterThan(-100);
    expect(bounds.x + bounds.width).toBeLessThan(300);
  });

  it('leaves room for strokes', () => {
    const plain = findThumbnailRegion(graph([rect('a', 50, 50, 100, 100)]))!;
    const stroked = findThumbnailRegion(graph([rect('a', 50, 50, 100, 100, 20)]))!;

    expect(stroked.bounds.height - plain.bounds.height).toBeCloseTo(20);
  });

  it('is null for a page with nothing to show', () => {
    expect(findThumbnailRegion(new SceneGraph())).toBeNull();
    expect(findThumbnailRegion(graph([bone('only-bone', 0, 0, 100)]))).toBeNull();
  });
});

describe('thumbnailPixelSize', () => {
  it('fits the region in the largest thumbnail, keeping its shape', () => {
    expect(thumbnailPixelSize({ x: 0, y: 0, width: 1920, height: 1080 })).toEqual({
      width: 560,
      height: 315,
    });
    expect(thumbnailPixelSize({ x: 0, y: 0, width: 390, height: 844 })).toEqual({
      width: 162,
      height: 350,
    });
    // Small artwork is drawn larger, not left tiny
    expect(thumbnailPixelSize({ x: 0, y: 0, width: 16, height: 10 })).toEqual({
      width: 560,
      height: 350,
    });
  });
});

describe('pickThumbnailScene', () => {
  it('uses the page the project opens on', () => {
    const scene = pickThumbnailScene(
      project(
        [
          { id: 'p1', nodes: [artboard('board-p1', 0, 0, 100, 100)] },
          { id: 'p2', nodes: [artboard('board-p2', 0, 0, 300, 200)] },
        ],
        'p2'
      )
    )!;

    expect(scene.region.rootIds).toEqual(['board-p2']);
    expect(scene.frameRate).toBe(24);
  });

  it('falls back to the first page with something on it', () => {
    const scene = pickThumbnailScene(
      project(
        [
          { id: 'p1', nodes: [] },
          { id: 'p2', nodes: [] },
          { id: 'p3', nodes: [rect('shape', 0, 0, 10, 10)] },
        ],
        'p2'
      )
    )!;

    expect(scene.sceneGraph.getNode('shape')).toBeDefined();
  });

  it('is null when no page has anything to show', () => {
    expect(pickThumbnailScene(project([{ id: 'p1', nodes: [] }], 'p1'))).toBeNull();
  });
});

// ============================================================================
// Rendering
// ============================================================================

describe('renderProjectThumbnail', () => {
  const png = new Blob(['png'], { type: 'image/png' });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadBundledFonts.mockResolvedValue(undefined);
    mocks.renderFrameAsBlob.mockResolvedValue(png);
    mocks.createFrameRenderer.mockReturnValue({
      preloadTextures: mocks.preloadTextures,
      renderFrameAsBlob: mocks.renderFrameAsBlob,
      dispose: mocks.dispose,
    });
  });

  it('draws the artboard region as saved, with symbols and the rig, then frees the renderer', async () => {
    const symbols = [{ id: 'sym', name: 'Sym', sceneGraphJSON: { nodes: [], rootNodeIds: [] } }];
    const ikChains = [{ id: 'ik-1' }];
    const data = JSON.stringify(
      project([{ id: 'p1', nodes: [artboard('board', 400, 300, 800, 600)] }], 'p1', {
        symbols: symbols as never,
        rigging: { ikChains: ikChains as never },
      })
    );

    const result = await renderProjectThumbnail(data);

    expect(result).toEqual({ kind: 'artboard', png, background: { r: 26, g: 26, b: 26, a: 1 } });
    expect(mocks.loadBundledFonts).toHaveBeenCalled();
    expect(mocks.createFrameRenderer).toHaveBeenCalledWith({ width: 467, height: 350 });
    const [ctx, frame] = mocks.renderFrameAsBlob.mock.calls[0]!;
    expect(frame).toBe(0);
    expect(ctx.timeline.tracks).toEqual([]);
    expect(ctx.exportRootIds).toEqual(['board']);
    expect(ctx.viewportBounds).toEqual({ x: 0, y: 0, width: 800, height: 600 });
    expect(ctx.rig).toMatchObject({ ikChains, smartBoneActions: [], frameRate: 24 });
    expect(ctx.symbols).toEqual(symbols);
    expect(mocks.preloadTextures.mock.calls[0]![0].map((n: Node) => n.id)).toEqual(['board']);
    expect(mocks.dispose).toHaveBeenCalledOnce();
  });

  it('carries the document background, for loose artwork to be shown on', async () => {
    const data = JSON.stringify(
      project([{ id: 'p1', nodes: [rect('a', 0, 0, 10, 10)] }], 'p1', {
        settings: {
          timelineDuration: 60,
          frameRate: 24,
          autoKeyframe: false,
          onionSkin: undefined as never,
          backgroundColor: { r: 240, g: 236, b: 228, a: 1 },
        },
      })
    );

    await expect(renderProjectThumbnail(data)).resolves.toMatchObject({
      kind: 'content',
      background: { r: 240, g: 236, b: 228, a: 1 },
    });
  });

  it('resolves null without rendering when there is nothing to show', async () => {
    const data = JSON.stringify(project([{ id: 'p1', nodes: [] }], 'p1'));

    await expect(renderProjectThumbnail(data)).resolves.toBeNull();
    expect(mocks.createFrameRenderer).not.toHaveBeenCalled();
  });

  it('rejects, still freeing the renderer, when drawing fails', async () => {
    mocks.renderFrameAsBlob.mockResolvedValue(null);
    const data = JSON.stringify(project([{ id: 'p1', nodes: [rect('a', 0, 0, 10, 10)] }], 'p1'));

    await expect(renderProjectThumbnail(data)).rejects.toThrow('Could not encode');
    expect(mocks.dispose).toHaveBeenCalledOnce();
  });

  it('still renders when the bundled fonts fail to load', async () => {
    mocks.loadBundledFonts.mockRejectedValue(new Error('offline'));
    const data = JSON.stringify(project([{ id: 'p1', nodes: [rect('a', 0, 0, 10, 10)] }], 'p1'));

    await expect(renderProjectThumbnail(data)).resolves.toMatchObject({ kind: 'content' });
  });
});
