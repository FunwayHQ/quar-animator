/**
 * Tests for artwork bounds: what a scene draws, framed
 */

import { describe, it, expect } from 'vitest';
import type { Node } from '@quar/types';
import { SceneGraph, createDefaultTransform, createGroupNode } from '../SceneGraph';
import { getArtworkBounds, padRect, widenToAspect } from './artworkBounds';
import { createTestVideoNode } from '../test/setup';

function rect(id: string, x: number, y: number, w: number, h: number, stroke = 0): Node {
  return {
    id,
    name: id,
    type: 'rectangle',
    parent: null,
    children: [],
    transform: { ...createDefaultTransform(), position: { x, y } },
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    width: w,
    height: h,
    cornerRadius: [0, 0, 0, 0],
    fills: [],
    strokes: stroke
      ? [
          {
            color: { r: 0, g: 0, b: 0, a: 1 },
            width: stroke,
            opacity: 1,
            cap: 'butt',
            join: 'miter',
            visible: true,
          },
        ]
      : [],
  } as Node;
}

describe('getArtworkBounds', () => {
  it('covers every visible shape', () => {
    const sg = new SceneGraph();
    sg.addNode(rect('a', 0, 0, 100, 100));
    sg.addNode(rect('b', 300, 200, 50, 50));

    expect(getArtworkBounds(sg)).toEqual({
      rect: { x: -50, y: -50, width: 375, height: 275 },
      strokePadding: 0,
    });
  });

  it('leaves out rig helpers, hidden layers and faded-out ones', () => {
    const sg = new SceneGraph();
    sg.addNode(rect('shape', 0, 0, 100, 100));
    sg.addNode({
      ...rect('bone', 900, 900, 10, 10),
      type: 'bone',
      length: 200,
      boneStyle: 'octahedral',
      boneColor: '#fff',
    } as unknown as Node);
    const hidden = createGroupNode('hidden', 'Hidden');
    hidden.visible = false;
    sg.addNode(hidden);
    sg.addNode(rect('inside-hidden', -900, 0, 10, 10), 'hidden');
    sg.addNode({ ...rect('faded', 0, -900, 10, 10), opacity: 0 });

    expect(getArtworkBounds(sg)?.rect).toEqual({ x: -50, y: -50, width: 100, height: 100 });
  });

  it('reports how far strokes reach past the shapes', () => {
    const sg = new SceneGraph();
    sg.addNode(rect('a', 0, 0, 100, 100, 12));
    expect(getArtworkBounds(sg)?.strokePadding).toBe(6);
  });

  it('takes in video layers, as pictures, and the symbols they’re in', () => {
    const sg = new SceneGraph();
    sg.addNode(createTestVideoNode('video', 0, 0, 160, 90));
    const inSymbol = createTestVideoNode('in-symbol', 0, 0, 40, 20);
    const symbols = [
      {
        id: 'clip',
        name: 'Clip',
        sceneGraphJSON: { nodes: [inSymbol], rootNodeIds: [inSymbol.id] },
      },
    ];
    sg.addNode({
      ...rect('instance', 500, 0, 1, 1),
      type: 'symbol-instance',
      symbolId: 'clip',
      overrides: [],
    } as unknown as Node);

    expect(getArtworkBounds(sg, symbols)?.rect).toEqual({ x: -80, y: -45, width: 600, height: 90 });
  });

  it('is null for a scene that draws nothing', () => {
    expect(getArtworkBounds(new SceneGraph())).toBeNull();
  });
});

describe('padRect and widenToAspect', () => {
  it('pads every side', () => {
    expect(padRect({ x: 0, y: 0, width: 10, height: 20 }, 5)).toEqual({
      x: -5,
      y: -5,
      width: 20,
      height: 30,
    });
  });

  it('grows the short side about the center to the ratio asked for', () => {
    expect(widenToAspect({ x: 0, y: 0, width: 100, height: 100 }, 2)).toEqual({
      x: -50,
      y: 0,
      width: 200,
      height: 100,
    });
    expect(widenToAspect({ x: 0, y: 0, width: 100, height: 100 }, 0.5)).toEqual({
      x: 0,
      y: -50,
      width: 100,
      height: 200,
    });
  });

  it('leaves a rectangle alone for a ratio that makes no sense', () => {
    const r = { x: 1, y: 2, width: 3, height: 4 };
    expect(widenToAspect(r, Number.NaN)).toBe(r);
    expect(widenToAspect(r, 0)).toBe(r);
  });
});
