/**
 * ShapeRenderer's caches: geometry that hasn't changed isn't tessellated or
 * outlined again on the next frame.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { GroupNode, PathNode, PathPoint, RectangleNode, Stroke } from '@quar/types';

const counts = vi.hoisted(() => ({ tessellate: 0, outline: 0, corners: 0 }));

vi.mock('../path/pathUtils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../path/pathUtils')>();
  return {
    ...actual,
    tessellatePathToVertices: (...args: Parameters<typeof actual.tessellatePathToVertices>) => {
      counts.tessellate++;
      return actual.tessellatePathToVertices(...args);
    },
    generateStrokeOutlineVertices: (
      ...args: Parameters<typeof actual.generateStrokeOutlineVertices>
    ) => {
      counts.outline++;
      return actual.generateStrokeOutlineVertices(...args);
    },
    applyCornerRadius: (...args: Parameters<typeof actual.applyCornerRadius>) => {
      counts.corners++;
      return actual.applyCornerRadius(...args);
    },
  };
});

const { ShapeRenderer } = await import('./ShapeRenderer');
const { WebGLRenderer } = await import('./WebGLRenderer');
const { SceneGraph, createDefaultTransform, createGroupNode } = await import('../SceneGraph');
const { mat3 } = await import('../math');
const { createMockWebGL2Context } = await import('../test/setup');

function corner(x: number, y: number): PathPoint {
  return { position: { x, y }, handleIn: null, handleOut: null, type: 'corner' };
}

const stroke: Stroke = {
  color: { r: 0, g: 0, b: 0, a: 1 },
  width: 2,
  opacity: 1,
  visible: true,
};

/** A square with a square hole: two contours. */
function compoundPath(strokes: Stroke[]): PathNode {
  return {
    id: 'frame',
    name: 'Frame',
    type: 'path',
    parent: null,
    children: [],
    transform: createDefaultTransform(),
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    closed: true,
    points: [corner(0, 0), corner(100, 0), corner(100, 100), corner(0, 100)],
    subpaths: [[corner(25, 25), corner(25, 75), corner(75, 75), corner(75, 25)]],
    fills: [{ type: 'solid', color: { r: 200, g: 0, b: 0, a: 1 }, opacity: 1, visible: true }],
    strokes,
  };
}

describe('ShapeRenderer caches', () => {
  let shapeRenderer: InstanceType<typeof ShapeRenderer>;
  let sceneGraph: InstanceType<typeof SceneGraph>;
  let gl: ReturnType<typeof createMockWebGL2Context>;

  beforeEach(() => {
    const canvas = document.createElement('canvas');
    gl = createMockWebGL2Context();
    canvas.getContext = vi.fn().mockReturnValue(gl);
    shapeRenderer = new ShapeRenderer(new WebGLRenderer({ canvas }));
    sceneGraph = new SceneGraph();
    counts.tessellate = 0;
    counts.outline = 0;
    counts.corners = 0;
  });

  function frames(n: number) {
    for (let i = 0; i < n; i++) shapeRenderer.render(sceneGraph, mat3.identity());
  }

  it('strokes a compound path from its cached contours, each outline made once', () => {
    sceneGraph.addNode(compoundPath([stroke]));
    frames(1);
    const first = { ...counts };
    expect(first.tessellate).toBe(2); // one per contour
    expect(first.outline).toBe(2); // one stroke outline per contour

    frames(5);
    expect(counts).toEqual(first);
  });

  it('does no contour work for a compound path without a visible stroke', () => {
    sceneGraph.addNode(compoundPath([{ ...stroke, visible: false }]));
    frames(3);
    expect(counts.tessellate).toBe(2); // the fill's tessellation, once
    expect(counts.outline).toBe(0);
  });

  it('builds a path’s points only when its geometry changes, not every frame', () => {
    sceneGraph.addNode({ ...compoundPath([stroke]), subpaths: undefined });
    frames(5);
    expect(counts.corners).toBe(1);
    expect(counts.tessellate).toBe(1);
    sceneGraph.updateNode('frame', {
      points: [corner(0, 0), corner(120, 0), corner(120, 100), corner(0, 100)],
    } as Partial<PathNode>);
    frames(3);
    expect(counts.corners).toBe(2);
  });

  it('sees an unchanged path is unchanged without reading every point each frame', () => {
    const node = compoundPath([]);
    let reads = 0;
    const watched = node.points.map((p, i) =>
      i === 0
        ? p
        : Object.defineProperty({ ...p }, 'position', {
            get: () => {
              reads++;
              return p.position;
            },
          })
    );
    sceneGraph.addNode({ ...node, points: watched });
    frames(1);
    reads = 0;
    frames(5);
    expect(reads).toBe(0);
    expect(counts.tessellate).toBe(2);
  });

  it('tessellates again when a new path’s points were shifted in place', () => {
    // The Pen and Brush centre a node's points in place before adding it
    sceneGraph.addNode({ ...compoundPath([]), subpaths: undefined });
    frames(1);
    const node = sceneGraph.getNode('frame') as PathNode;
    for (const p of node.points) p.position.x -= 50;
    frames(1);
    expect(counts.tessellate).toBe(2);
  });

  describe('GPU buffers', () => {
    const uploads = () => vi.mocked(gl.bufferSubData).mock.calls.length;
    const ownBuffers = () =>
      vi.mocked(gl.bufferData).mock.calls.filter(([, , usage]) => usage === gl.STATIC_DRAW);
    beforeEach(() => {
      // A new object per VAO and buffer, as a real context gives
      gl.createVertexArray = vi.fn(() => ({}) as WebGLVertexArrayObject);
      gl.createBuffer = vi.fn(() => ({}) as WebGLBuffer);
      // Count from here: the renderer's own setup made its shared buffers already
      for (const fn of [gl.bufferData, gl.bufferSubData, gl.drawElements, gl.bindVertexArray]) {
        vi.mocked(fn).mockClear();
      }
      vi.mocked(gl.deleteBuffer).mockClear();
      vi.mocked(gl.deleteVertexArray).mockClear();
    });

    it('draws a shape that hasn’t changed from buffers of its own, uploaded once', () => {
      sceneGraph.addNode({ ...compoundPath([]), subpaths: undefined });
      frames(1);
      expect(uploads()).toBeGreaterThan(0); // the first frame goes through the shared buffers
      vi.mocked(gl.bufferSubData).mockClear();

      frames(1);
      expect(ownBuffers()).toHaveLength(2); // its vertices and its indices
      frames(5);
      expect(uploads()).toBe(0);
      expect(ownBuffers()).toHaveLength(2);
      expect(gl.drawElements).toHaveBeenCalledTimes(7);
    });

    it('binds the shape’s own vertex array to draw it, then the shared one again', () => {
      sceneGraph.addNode({ ...compoundPath([]), subpaths: undefined });
      frames(2);
      const binds = vi.mocked(gl.bindVertexArray).mock.calls.map(([vao]) => vao);
      const own = vi.mocked(gl.createVertexArray).mock.results.at(-1)?.value as unknown;
      const at = binds.lastIndexOf(own as WebGLVertexArrayObject);
      expect(at).toBeGreaterThan(-1);
      expect(binds[at + 1]).not.toBe(own); // put back for whatever draws next
    });

    it('keeps a compound shape’s fill and its strokes’ strips on the GPU', () => {
      sceneGraph.addNode(compoundPath([stroke]));
      frames(2);
      vi.mocked(gl.bufferSubData).mockClear();
      frames(3);
      expect(uploads()).toBe(0);
      // One fill (vertices + indices) and a strip per contour's stroke
      expect(ownBuffers()).toHaveLength(4);
    });

    it('leaves geometry made afresh each frame on the shared buffers', () => {
      sceneGraph.addNode({ ...compoundPath([]), subpaths: undefined });
      for (let x = 101; x < 106; x++) {
        sceneGraph.updateNode('frame', {
          points: [corner(0, 0), corner(x, 0), corner(x, 100), corner(0, 100)],
        } as Partial<PathNode>);
        frames(1);
      }
      expect(ownBuffers()).toHaveLength(0);
      expect(uploads()).toBe(10); // vertices and indices, every frame
    });

    it('frees the buffers of shapes no longer drawn, and all of them when disposed', () => {
      sceneGraph.addNode({ ...compoundPath([]), subpaths: undefined });
      sceneGraph.addNode({ ...compoundPath([]), id: 'other', subpaths: undefined });
      frames(2);
      expect(ownBuffers()).toHaveLength(4);

      sceneGraph.removeNode('other');
      shapeRenderer.invalidateCache('other');
      frames(400);
      expect(gl.deleteVertexArray).toHaveBeenCalledTimes(1);
      expect(gl.deleteBuffer).toHaveBeenCalledTimes(2);

      vi.mocked(gl.deleteVertexArray).mockClear();
      shapeRenderer.dispose();
      // The one still drawn, and the shared VAO
      expect(vi.mocked(gl.deleteVertexArray).mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('keeps one cached result per boolean group while its shapes are dragged', () => {
    const square = (id: string, x: number): RectangleNode => ({
      ...compoundPath([]),
      id,
      name: id,
      type: 'rectangle',
      width: 50,
      height: 50,
      cornerRadius: [0, 0, 0, 0],
      transform: { ...createDefaultTransform(), position: { x, y: 0 } },
    });
    const group: GroupNode = {
      ...createGroupNode('union', 'Union'),
      booleanOp: 'union',
      fills: compoundPath([]).fills,
      strokes: [stroke],
    };
    sceneGraph.addNode(group);
    sceneGraph.addNode(square('a', 0), 'union');
    sceneGraph.addNode(square('b', 30), 'union');
    const cache = (shapeRenderer as unknown as { geometryCache: Map<string, unknown> })
      .geometryCache;
    frames(1);
    const entries = cache.size;
    // Drag one square across 20 positions
    for (let x = 31; x <= 50; x++) {
      sceneGraph.updateNode('b', {
        transform: { ...createDefaultTransform(), position: { x, y: 0 } },
      } as Partial<RectangleNode>);
      frames(1);
    }
    expect(cache.size).toBe(entries);
    // Deleting the group frees its entry (the canvas invalidates removed nodes)
    shapeRenderer.invalidateCache('union');
    expect(cache.has('union')).toBe(false);
  });

  it('outlines again when the stroke changes, and only then', () => {
    sceneGraph.addNode(compoundPath([stroke]));
    frames(2);
    sceneGraph.updateNode('frame', { strokes: [{ ...stroke, width: 6 }] } as Partial<PathNode>);
    frames(2);
    expect(counts.tessellate).toBe(2);
    expect(counts.outline).toBe(4);
  });
});
