/**
 * ShapeRenderer's caches: geometry that hasn't changed isn't tessellated or
 * outlined again on the next frame.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PathNode, PathPoint, Stroke } from '@quar/types';

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
const { SceneGraph, createDefaultTransform } = await import('../SceneGraph');
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

  beforeEach(() => {
    const canvas = document.createElement('canvas');
    canvas.getContext = vi.fn().mockReturnValue(createMockWebGL2Context());
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

  it('outlines again when the stroke changes, and only then', () => {
    sceneGraph.addNode(compoundPath([stroke]));
    frames(2);
    sceneGraph.updateNode('frame', { strokes: [{ ...stroke, width: 6 }] } as Partial<PathNode>);
    frames(2);
    expect(counts.tessellate).toBe(2);
    expect(counts.outline).toBe(4);
  });
});
