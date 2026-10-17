/**
 * Moving layers into and out of groups without them jumping on screen.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SceneGraph, createGroupNode, mat3 } from '@quar/core';
import { addKeyframe, createTimeline, getOrCreateTrack } from '@quar/animation';
import type { Matrix3, RectangleNode, SkinData, Transform } from '@quar/types';
import { placeSkinData } from '@quar/rigging';
import {
  mapPlacement,
  placementOf,
  reparentMatrix,
  reparentRestPose,
  reparentTimeline,
} from './reparent';
import { useEditorStore } from './editorStore';

function transform(overrides: Partial<Transform> = {}): Transform {
  return {
    position: { x: 0, y: 0 },
    rotation: 0,
    scale: { x: 1, y: 1 },
    anchor: { x: 0.5, y: 0.5 },
    skew: { x: 0, y: 0 },
    ...overrides,
  };
}

function rect(id: string, t: Partial<Transform> = {}): RectangleNode {
  return {
    id,
    name: id,
    type: 'rectangle',
    parent: null,
    children: [],
    transform: transform(t),
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    width: 40,
    height: 20,
    cornerRadius: [0, 0, 0, 0],
    fills: [],
    strokes: [],
  };
}

function group(id: string, t: Partial<Transform> = {}) {
  return { ...createGroupNode(id, id), transform: transform(t) };
}

function expectSameMatrix(actual: Matrix3, expected: Matrix3) {
  for (const key of ['a', 'b', 'c', 'd', 'tx', 'ty'] as const) {
    expect(actual[key]).toBeCloseTo(expected[key], 6);
  }
}

/** Moves `id` under `parentId` keeping placement, and checks it didn't move on screen. */
function moveAndCheck(sg: SceneGraph, id: string, parentId: string | null) {
  const before = sg.getWorldTransform(id);
  const m = reparentMatrix(sg, id, parentId)!;
  const node = sg.getNode(id)!;
  const placement = mapPlacement(placementOf(node.transform), m);
  sg.moveNode(id, parentId);
  sg.updateNode(id, {
    transform: {
      ...node.transform,
      position: { x: placement['transform.position.x'], y: placement['transform.position.y'] },
      rotation: placement['transform.rotation'],
      scale: { x: placement['transform.scale.x'], y: placement['transform.scale.y'] },
    },
  });
  expectSameMatrix(sg.getWorldTransform(id), before);
  return sg.getNode(id)!.transform;
}

describe('placement maths', () => {
  let sg: SceneGraph;

  beforeEach(() => {
    sg = new SceneGraph();
  });

  it('is a no-op within the same parent', () => {
    sg.addNode(rect('r'));
    expect(reparentMatrix(sg, 'r', null)).toBeNull();
  });

  it('adds the group offset when leaving an offset group', () => {
    sg.addNode(group('g', { position: { x: 300, y: -40 } }));
    sg.addNode(rect('r', { position: { x: 10, y: 20 } }), 'g');
    const moved = moveAndCheck(sg, 'r', null);
    expect(moved.position.x).toBeCloseTo(309.5);
    expect(moved.rotation).toBe(0);
  });

  it('folds in a rotated, scaled group', () => {
    sg.addNode(group('g', { position: { x: 50, y: 50 }, rotation: 30, scale: { x: 2, y: 2 } }));
    sg.addNode(rect('r', { position: { x: 10, y: 0 }, rotation: 15 }), 'g');
    const moved = moveAndCheck(sg, 'r', null);
    expect(moved.rotation).toBeCloseTo(45);
    expect(moved.scale.x).toBeCloseTo(2);
  });

  it('keeps flips as flips under a mirrored group', () => {
    sg.addNode(group('g', { position: { x: 100, y: 0 }, scale: { x: -1, y: 1 } }));
    sg.addNode(rect('r', { position: { x: 10, y: 5 }, rotation: 20 }), 'g');
    const moved = moveAndCheck(sg, 'r', null);
    expect(moved.scale.x).toBeCloseTo(-1);
    expect(moved.rotation).toBeCloseTo(-20);
  });

  it('moves between two transformed groups', () => {
    sg.addNode(group('from', { position: { x: -80, y: 30 }, rotation: -45 }));
    sg.addNode(
      group('to', { position: { x: 200, y: 10 }, rotation: 90, scale: { x: 0.5, y: 0.5 } })
    );
    sg.addNode(rect('r', { position: { x: 5, y: 5 }, scale: { x: 1.5, y: 1.5 } }), 'from');
    moveAndCheck(sg, 'r', 'to');
  });

  it('places the node as closely as possible under an unevenly scaled group', () => {
    // Exact would need skew, which isn't rendered: the position is still exact
    sg.addNode(group('g', { position: { x: 0, y: 0 }, scale: { x: 2, y: 1 } }));
    sg.addNode(rect('r', { position: { x: 10, y: 10 }, rotation: 30 }), 'g');
    const before = sg.getWorldTransform('r');
    const m = reparentMatrix(sg, 'r', null)!;
    const placement = mapPlacement(placementOf(sg.getNode('r')!.transform), m);
    expect(placement['transform.position.x']).toBeCloseTo(
      before.tx + 0.5 * before.a + 0.5 * before.c
    );
    expect(Number.isFinite(placement['transform.rotation'])).toBe(true);
  });

  it('keeps whole turns of rotation', () => {
    const spun = mapPlacement(
      { ...placementOf(transform()), 'transform.rotation': 720 },
      mat3.rotate(mat3.identity(), Math.PI / 6)
    );
    expect(spun['transform.rotation']).toBeCloseTo(750);
  });
});

describe('keyframes and rest poses', () => {
  const offset = mat3.create(1, 0, 0, 1, 100, 50);

  it('shifts position keyframes by the group offset', () => {
    const timeline = createTimeline({ duration: 60 });
    const x = getOrCreateTrack<number>(timeline, 'r', 'transform.position.x');
    addKeyframe(x, 0, 0);
    addKeyframe(x, 30, 40);
    const next = reparentTimeline(timeline, 'r', placementOf(transform()), offset);
    expect(next.tracks[0]!.keyframes.map((kf) => kf.value)).toEqual([100, 140]);
  });

  it('converts each keyframe with the rest of the placement at its time', () => {
    // Rotating parent: x keyframes depend on y at the same moment
    const timeline = createTimeline({ duration: 60 });
    const x = getOrCreateTrack<number>(timeline, 'r', 'transform.position.x');
    const y = getOrCreateTrack<number>(timeline, 'r', 'transform.position.y');
    const rotation = getOrCreateTrack<number>(timeline, 'r', 'transform.rotation');
    addKeyframe(x, 0, 10);
    addKeyframe(x, 20, 10);
    addKeyframe(y, 0, 0);
    addKeyframe(y, 20, 20);
    addKeyframe(rotation, 0, 0);
    addKeyframe(rotation, 20, 360);
    const quarterTurn = mat3.rotate(mat3.identity(), Math.PI / 2);
    const next = reparentTimeline(timeline, 'r', placementOf(transform()), quarterTurn);
    const values = (property: string) =>
      next.tracks.find((track) => track.property === property)!.keyframes.map((kf) => kf.value);
    // (10, 0) → (0, 10); (10, 20) → (-20, 10)
    expect(values('transform.position.x')).toEqual([expect.closeTo(0), expect.closeTo(-20)]);
    expect(values('transform.position.y')).toEqual([expect.closeTo(10), expect.closeTo(10)]);
    expect(values('transform.rotation')).toEqual([expect.closeTo(90), expect.closeTo(450)]);
  });

  it('leaves other nodes and properties alone', () => {
    const timeline = createTimeline({ duration: 60 });
    addKeyframe(getOrCreateTrack<number>(timeline, 'other', 'transform.position.x'), 0, 5);
    addKeyframe(getOrCreateTrack<number>(timeline, 'r', 'opacity'), 0, 0.5);
    expect(reparentTimeline(timeline, 'r', placementOf(transform()), offset)).toBe(timeline);
  });

  it('converts a sequence rest pose', () => {
    const pose = { 'transform.position.x': 10, 'transform.position.y': 20, opacity: 1 };
    expect(reparentRestPose(pose, placementOf(transform()), offset)).toEqual({
      'transform.position.x': 110,
      'transform.position.y': 70,
      opacity: 1,
    });
  });
});

describe('editor actions keep layers in place', () => {
  const store = () => useEditorStore.getState();
  let sg: SceneGraph;

  beforeEach(() => {
    store().resetProject();
    store().clearHistory();
    sg = new SceneGraph();
  });

  it('ungroups without moving the children or their animation', () => {
    sg.addNode(group('g', { position: { x: -374, y: -44 } }));
    sg.addNode(rect('logo-bg', { position: { x: -621, y: 45 } }), 'g');
    const x = getOrCreateTrack<number>(store().timeline, 'logo-bg', 'transform.position.x');
    addKeyframe(x, 0, -621);
    addKeyframe(x, 30, -600);
    const before = sg.getWorldTransform('logo-bg');

    store().setSelection(['g']);
    store().ungroupSelection(sg);

    expectSameMatrix(sg.getWorldTransform('logo-bg'), before);
    const keyframes = store().timeline.tracks.find((t) => t.nodeId === 'logo-bg')!.keyframes;
    expect(keyframes.map((kf) => kf.value)).toEqual([-995.5, -974.5]);

    // One undo step restores the group, the position and the keyframes
    store().undo(sg);
    expect(sg.getNode('logo-bg')!.parent).toBe('g');
    expect(sg.getNode('logo-bg')!.transform.position.x).toBe(-621);
    expect(store().timeline.tracks[0]!.keyframes[0]!.value).toBe(-621);
  });

  it('moves a layer out of a group in place (Layers panel drag)', () => {
    sg.addNode(group('g', { position: { x: 300, y: 0 }, rotation: 10 }));
    sg.addNode(rect('r', { position: { x: 20, y: 30 } }), 'g');
    const before = sg.getWorldTransform('r');
    store().moveNodeKeepingPlacement(sg, 'r', null, 0);
    expect(sg.getNode('r')!.parent).toBeNull();
    expectSameMatrix(sg.getWorldTransform('r'), before);
  });

  it('groups objects from different groups without moving them, keeping numbers in place', () => {
    sg.addNode(group('g', { position: { x: 100, y: 100 } }));
    sg.addNode(rect('inside', { position: { x: 10, y: 10 } }), 'g');
    sg.addNode(rect('outside', { position: { x: 50, y: 50 } }));
    const inside = sg.getWorldTransform('inside');
    const outside = sg.getWorldTransform('outside');

    store().setSelection(['inside', 'outside']);
    store().groupSelection(sg);

    expectSameMatrix(sg.getWorldTransform('inside'), inside);
    expectSameMatrix(sg.getWorldTransform('outside'), outside);
    // A new group adds no offset, so a root object keeps its exact position
    expect(sg.getNode('outside')!.transform.position).toEqual({ x: 50, y: 50 });
  });

  it('keeps a bound mesh where it is drawn when it changes parent', () => {
    const local = (id: string) => {
      const { position, rotation, scale, anchor } = sg.getNode(id)!.transform;
      const m = mat3.compose(position, rotation, scale, anchor);
      return [m.a, m.b, m.c, m.d, m.tx, m.ty];
    };
    sg.addNode(group('g', { position: { x: 300, y: 40 }, rotation: 20 }));
    const mesh = rect('mesh', { position: { x: 10, y: 20 } });
    const bindLocal = (() => {
      const m = mat3.compose(mesh.transform.position, 0, { x: 1, y: 1 }, mesh.transform.anchor);
      return [m.a, m.b, m.c, m.d, m.tx, m.ty];
    })();
    const skinData: SkinData = {
      vertices: [],
      inverseBindMatrices: { bone: [1, 0, 0, 1, 0, 0] },
      meshBindMatrix: bindLocal,
      meshBindLocal: bindLocal,
      vertexCount: 0,
    };
    sg.addNode({ ...mesh, skinData } as unknown as RectangleNode);
    // Moved a little since binding, then into the rotated group
    sg.updateNode('mesh', { transform: { ...mesh.transform, position: { x: 30, y: 25 } } });
    const before = placeSkinData(skinData, local('mesh')).meshBindMatrix;

    store().moveNodeKeepingPlacement(sg, 'mesh', 'g');
    const moved = (sg.getNode('mesh') as unknown as { skinData: SkinData }).skinData;
    const after = placeSkinData(moved, local('mesh')).meshBindMatrix;
    after.forEach((v, i) => expect(v).toBeCloseTo(before[i]!, 9));
  });

  it('moves an Animation Sequence step with its object', () => {
    sg.addNode(group('g', { position: { x: 200, y: 0 } }));
    sg.addNode(rect('r', { position: { x: 10, y: 0 } }), 'g');
    store().addSequenceSteps(sg, ['r'], 'slide-in', { duration: 20 });
    const restX = () => store().animationSequence.restPoses['r']!['transform.position.x'];
    const endX = () => {
      const track = store().timeline.tracks.find(
        (t) => t.nodeId === 'r' && t.property === 'transform.position.x'
      )!;
      return track.keyframes[track.keyframes.length - 1]!.value;
    };
    expect(restX()).toBe(10);
    expect(endX()).toBe(10);

    store().moveNodeKeepingPlacement(sg, 'r', null);
    expect(restX()).toBeCloseTo(209.5);
    // The slide's keyframes were regenerated from the moved rest pose
    expect(endX()).toBeCloseTo(209.5);
  });
});
