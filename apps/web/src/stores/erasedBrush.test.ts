/**
 * Brush strokes the Eraser cut, given a new Width or Profile: redrawn from
 * their painted line, what was erased stays erased.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SceneGraph, createDefaultTransform } from '@quar/core';
import type { PathNode, PathPoint } from '@quar/types';
import { useEditorStore } from './editorStore';

const corner = (x: number, y: number): PathPoint => ({
  position: { x, y },
  handleIn: null,
  handleOut: null,
  type: 'corner',
});

/** The left piece of a stroke along x from -100 to 100, cut by a band across x = 0. */
function leftPiece(): PathNode {
  return {
    id: 'stroke',
    name: 'Brush Stroke',
    type: 'path',
    parent: null,
    children: [],
    transform: createDefaultTransform(),
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    points: [corner(-100, -5), corner(-5, -5), corner(-5, 5), corner(-100, 5)],
    closed: true,
    fills: [],
    strokes: [],
    brushData: {
      spine: [corner(-100, 0), corner(100, 0)],
      widths: [10, 10],
      profileId: null,
      erased: [
        [
          [
            { x: -5, y: -50 },
            { x: 5, y: -50 },
            { x: 5, y: 50 },
            { x: -5, y: 50 },
            { x: -5, y: -50 },
          ],
        ],
      ],
    },
  };
}

const extent = (node: PathNode) => {
  const points = [...node.points, ...(node.subpaths ?? []).flat()].map((p) => p.position);
  return {
    maxX: Math.max(...points.map((p) => p.x)),
    height: Math.max(...points.map((p) => p.y)) - Math.min(...points.map((p) => p.y)),
  };
};

describe('a brush stroke the Eraser cut', () => {
  let sg: SceneGraph;
  beforeEach(() => {
    sg = new SceneGraph();
    sg.addNode(leftPiece());
    useEditorStore.setState({ selectedNodeIds: new Set(['stroke']), undoStack: [] });
  });

  it('given a new Width, is redrawn that wide with the erased part still out', () => {
    useEditorStore.getState().setBrushStrokeBaseWidth(sg, 40);

    const stroke = sg.getNode<PathNode>('stroke')!;
    expect(stroke.brushData!.baseWidth).toBe(40);
    expect(extent(stroke).height).toBeGreaterThan(30);
    // Still the piece left of the cut: the right piece is another layer
    expect(extent(stroke).maxX).toBeLessThanOrEqual(-4.9);
  });

  it('given a new Profile, keeps the erased part out', () => {
    useEditorStore.getState().applyBrushStrokeProfile(sg, null);

    const stroke = sg.getNode<PathNode>('stroke')!;
    expect(extent(stroke).maxX).toBeLessThanOrEqual(-4.9);
  });
});
