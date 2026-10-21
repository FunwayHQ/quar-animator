/**
 * Tests for flipping layers
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SceneGraph, createDefaultTransform, mat3 } from '@quar/core';
import { createKeyframe, createTrack, evaluateTrack } from '@quar/animation';
import type { Matrix3, Node, RectangleNode } from '@quar/types';
import { flipInParentSpace, flipMatrix, flipPlacement, flippableLayers } from './flip';
import { applyPlacement, placementOf, type Placement } from './reparent';
import { useEditorStore } from './editorStore';

function placement(x: number, y: number, rotation: number, sx: number, sy: number): Placement {
  return {
    'transform.position.x': x,
    'transform.position.y': y,
    'transform.rotation': rotation,
    'transform.scale.x': sx,
    'transform.scale.y': sy,
  };
}

function matrixOf(p: Placement): Matrix3 {
  return mat3.compose(
    { x: p['transform.position.x'], y: p['transform.position.y'] },
    p['transform.rotation'],
    { x: p['transform.scale.x'], y: p['transform.scale.y'] }
  );
}

function expectSameMatrix(actual: Matrix3, expected: Matrix3) {
  for (const key of ['a', 'b', 'c', 'd', 'tx', 'ty'] as const) {
    expect(actual[key]).toBeCloseTo(expected[key]);
  }
}

describe('flipPlacement', () => {
  const start = placement(30, 10, 25, 2, 1.5);

  it('flips horizontally: X mirrored about the line, X scale negated, rotation reversed', () => {
    const flipped = flipPlacement(start, flipMatrix('horizontal', { x: 100, y: 0 }), 'horizontal');
    expect(flipped).toEqual(placement(170, 10, -25, -2, 1.5));
  });

  it('flips vertically with the Y scale negated (no half turn)', () => {
    const flipped = flipPlacement(start, flipMatrix('vertical', { x: 0, y: 50 }), 'vertical');
    expect(flipped).toEqual(placement(30, 90, -25, 2, -1.5));
  });

  it('is the mirror image on the canvas, also under a rotated, scaled parent', () => {
    const parent = mat3.compose({ x: 40, y: -20 }, 30, { x: 2, y: 2 });
    for (const axis of ['horizontal', 'vertical'] as const) {
      const flip = flipMatrix(axis, { x: 15, y: 25 });
      const flipped = flipPlacement(start, flipInParentSpace(flip, parent), axis);
      expectSameMatrix(
        mat3.multiply(parent, matrixOf(flipped)),
        mat3.multiply(flip, mat3.multiply(parent, matrixOf(start)))
      );
    }
  });

  it('flipping twice gives back the layer', () => {
    const flip = flipMatrix('horizontal', { x: 7, y: 0 });
    const twice = flipPlacement(flipPlacement(start, flip, 'horizontal'), flip, 'horizontal');
    for (const [key, value] of Object.entries(start)) {
      expect(twice[key as keyof Placement]).toBeCloseTo(value);
    }
  });
});

describe('flippableLayers', () => {
  function node(id: string, extra: Partial<Node> = {}): Node {
    return {
      id,
      name: id,
      type: 'group',
      parent: null,
      children: [],
      transform: createDefaultTransform(),
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      ...extra,
    } as Node;
  }

  it('takes the topmost selected layers, skipping locked ones and bones', () => {
    const nodes = new Map<string, Node>([
      ['group', node('group')],
      ['child', node('child', { parent: 'group' })],
      ['locked', node('locked', { locked: true })],
      ['inLocked', node('inLocked', { parent: 'locked' })],
      ['bone', node('bone', { type: 'bone' } as Partial<Node>)],
      ['free', node('free')],
    ]);
    const sceneGraph = { getNode: (id: string) => nodes.get(id) };

    expect(
      flippableLayers(sceneGraph, ['group', 'child', 'locked', 'inLocked', 'bone', 'free'])
    ).toEqual(['group', 'free']);
  });
});

describe('flipLayers (store)', () => {
  let sceneGraph: SceneGraph;

  beforeEach(() => {
    useEditorStore.setState({ undoStack: [], redoStack: [], isDirty: false });
    sceneGraph = new SceneGraph();
    const transform = createDefaultTransform();
    transform.position = { x: 30, y: 0 };
    transform.rotation = 10;
    const rect: RectangleNode = {
      id: 'r',
      name: 'Rect',
      type: 'rectangle',
      parent: null,
      children: [],
      transform,
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      width: 20,
      height: 10,
      cornerRadius: [0, 0, 0, 0],
      fills: [],
      strokes: [],
    };
    sceneGraph.addNode(rect);
    // It slides right from x=30 to x=80 and turns from 10° to 40°
    useEditorStore.setState({
      timeline: {
        ...useEditorStore.getState().timeline,
        tracks: [
          createTrack('r', 'transform.position.x', [createKeyframe(0, 30), createKeyframe(10, 80)]),
          createTrack('r', 'transform.rotation', [createKeyframe(0, 10), createKeyframe(10, 40)]),
        ],
      },
    });
  });

  it('mirrors the layer and its keyframes, so it stays flipped as it animates', () => {
    useEditorStore.getState().flipLayers(sceneGraph, ['r'], 'horizontal', { x: 0, y: 0 });

    const flipped = sceneGraph.getNode('r')!;
    expect(flipped.transform.position.x).toBeCloseTo(-30);
    expect(flipped.transform.rotation).toBeCloseTo(-10);
    expect(flipped.transform.scale.x).toBeCloseTo(-1);

    const tracks = useEditorStore.getState().timeline.tracks;
    const track = (property: string) => tracks.find((t) => t.property === property)!;
    // Now it slides left, turning the other way
    expect(evaluateTrack(track('transform.position.x'), 10)).toBeCloseTo(-80);
    expect(evaluateTrack(track('transform.rotation'), 10)).toBeCloseTo(-40);
    expect(useEditorStore.getState().isDirty).toBe(true);
  });

  it('can be undone', () => {
    useEditorStore.getState().flipLayers(sceneGraph, ['r'], 'vertical', { x: 0, y: 5 });
    expect(sceneGraph.getNode('r')!.transform.scale.y).toBeCloseTo(-1);

    useEditorStore.getState().undo(sceneGraph);

    expect(sceneGraph.getNode('r')!.transform).toEqual(
      applyPlacement(createDefaultTransform(), {
        ...placementOf(createDefaultTransform()),
        'transform.position.x': 30,
        'transform.rotation': 10,
      })
    );
    const track = useEditorStore
      .getState()
      .timeline.tracks.find((t) => t.property === 'transform.rotation')!;
    expect(evaluateTrack(track, 10)).toBeCloseTo(40);
  });
});
