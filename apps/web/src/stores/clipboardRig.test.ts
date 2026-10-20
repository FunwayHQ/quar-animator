/**
 * Copying, pasting and deleting rigged layers.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SceneGraph, createGroupNode } from '@quar/core';
import { createBoneNode } from '@quar/rigging';
import { addKeyframe, getOrCreateTrack } from '@quar/animation';
import type { RectangleNode, SkinData } from '@quar/types';
import { useEditorStore } from './editorStore';

const store = () => useEditorStore.getState();

function rect(id: string, x = 0, y = 0): RectangleNode {
  return {
    id,
    name: id,
    type: 'rectangle',
    parent: null,
    children: [],
    transform: {
      position: { x, y },
      rotation: 0,
      scale: { x: 1, y: 1 },
      anchor: { x: 0.5, y: 0.5 },
      skew: { x: 0, y: 0 },
    },
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    width: 40,
    height: 10,
    cornerRadius: [0, 0, 0, 0],
    fills: [],
    strokes: [],
  };
}

const skinFor = (...boneIds: string[]): SkinData => ({
  vertices: [{ influences: boneIds.map((boneId) => ({ boneId, weight: 1 / boneIds.length })) }],
  inverseBindMatrices: Object.fromEntries(boneIds.map((id) => [id, [1, 0, 0, 1, 0, 0]])),
  meshBindMatrix: [1, 0, 0, 1, 0, 0],
  meshBindLocal: [1, 0, 0, 1, 0, 0],
  vertexCount: 1,
});

const skinOf = (sg: SceneGraph, id: string) =>
  (sg.getNode(id) as unknown as { skinData?: SkinData }).skinData;

describe('copying, pasting and deleting rigs', () => {
  let sg: SceneGraph;

  /** b1 → b2 arm, a mesh bound to both, an IK chain on b2. */
  function rig() {
    sg.addNode(createBoneNode('b1', 'Upper', { x: 0, y: 0 }, 100));
    sg.addNode(createBoneNode('b2', 'Lower', { x: 100, y: 0 }, 80), 'b1');
    sg.addNode({ ...rect('mesh'), skinData: skinFor('b1', 'b2') } as unknown as RectangleNode);
    store().createIKChain(sg, 'b2');
    return store().ikChains[0]!;
  }

  beforeEach(() => {
    store().resetProject();
    store().clearHistory();
    sg = new SceneGraph();
  });

  it('duplicates a child bone next to the original, under the same parent', () => {
    rig();
    store().setSelection(['b2']);
    store().duplicateSelection(sg);
    const [copy] = [...store().selectedNodeIds];
    expect(sg.getNode(copy!)!.parent).toBe('b1');
    // Its parent-relative placement, nudged by the paste offset
    expect(sg.getNode(copy!)!.transform.position).toEqual({ x: 120, y: -20 });
  });

  it('pastes a layer whose parent is gone where it was', () => {
    sg.addNode({
      ...createGroupNode('g', 'G'),
      transform: { ...rect('x').transform, position: { x: 300, y: 0 } },
    });
    sg.addNode(rect('r', 10, 20), 'g');
    store().setSelection(['r']);
    store().copySelection(sg);
    store().setSelection(['g']);
    store().deleteSelection(sg);

    store().pasteClipboard(sg);
    const [copy] = [...store().selectedNodeIds];
    expect(sg.getNode(copy!)!.parent).toBeNull();
    // (300, 0), plus (10, 20), plus the paste offset
    expect(sg.getNode(copy!)!.transform.position).toEqual({ x: 330, y: 0 });
  });

  it('gives a duplicated rig its own bones, chain and binding', () => {
    const original = rig();
    store().setSelection(['b1', 'mesh', original.targetNodeId]);
    store().duplicateSelection(sg);

    const pasted = [...store().selectedNodeIds];
    const bone = pasted.find((id) => sg.getNode(id)!.type === 'bone')!;
    const mesh = pasted.find((id) => sg.getNode(id)!.type === 'rectangle')!;
    const lower = sg.getNode(bone)!.children[0]!;
    expect(Object.keys(skinOf(sg, mesh)!.inverseBindMatrices).sort()).toEqual([bone, lower].sort());
    // The bones carry the mesh: it isn't offset on its own
    expect(sg.getNode(mesh)!.transform.position).toEqual({ x: 0, y: 0 });

    expect(store().ikChains).toHaveLength(2);
    const copy = store().ikChains[1]!;
    expect(copy).toMatchObject({ rootBoneId: bone, endEffectorBoneId: lower });
    expect(sg.getNode(copy.targetNodeId)).toMatchObject({ type: 'ik-target', ikChainId: copy.id });

    // Deleting the copy's target leaves the original chain alone
    store().setSelection([copy.targetNodeId]);
    store().deleteSelection(sg);
    expect(store().ikChains.map((chain) => chain.id)).toEqual([original.id]);
  });

  it('doesn’t paste an IK target copied without its bones', () => {
    const chain = rig();
    store().setSelection([chain.targetNodeId]);
    store().duplicateSelection(sg);
    expect(store().selectedNodeIds.size).toBe(0);
    expect(store().ikChains).toHaveLength(1);
  });

  it('removes the rigging that used a deleted bone', () => {
    const chain = rig();
    store().createDynamicChain(sg, 'b1');
    store().createSmartBoneAction(sg, 'b2');
    const controller = store().createVitruvianController(sg, 'Hands');
    store().addVitruvianGroup(sg, controller, 'Fist', ['b2']);
    addKeyframe(getOrCreateTrack<number>(store().timeline, 'b2', 'transform.rotation'), 200, 45);

    store().setSelection(['b1']);
    store().deleteSelection(sg);

    expect(store().ikChains).toEqual([]);
    expect(sg.getNode(chain.targetNodeId)).toBeUndefined();
    expect(store().dynamicChains).toEqual([]);
    expect(store().smartBoneActions).toEqual([]);
    expect(store().vitruvianControllers[0]!.groups.flatMap((group) => group.boneIds)).toEqual([]);
    expect(skinOf(sg, 'mesh')).toBeUndefined();
    // The child bone's keyframes went with it
    expect(store().timeline.tracks.some((track) => track.nodeId === 'b2')).toBe(false);

    store().undo(sg);
    expect(store().ikChains).toHaveLength(1);
    expect(skinOf(sg, 'mesh')).toBeDefined();
  });

  it('hands a deleted bone’s weight to the mesh’s other bones', () => {
    sg.addNode(createBoneNode('b1', 'A', { x: 0, y: 0 }, 50));
    sg.addNode(createBoneNode('b3', 'B', { x: 0, y: 50 }, 50));
    sg.addNode({ ...rect('mesh'), skinData: skinFor('b1', 'b3') } as unknown as RectangleNode);
    store().setSelection(['b3']);
    store().deleteSelection(sg);
    expect(skinOf(sg, 'mesh')!.vertices[0]!.influences).toEqual([{ boneId: 'b1', weight: 1 }]);
  });

  it('keeps a rig through cut and paste', () => {
    const chain = rig();
    store().setSelection(['b1', 'mesh', chain.targetNodeId]);
    store().cutSelection(sg);
    expect(store().ikChains).toEqual([]);

    store().pasteClipboard(sg);
    expect(store().ikChains).toHaveLength(1);
    const pasted = store().ikChains[0]!;
    expect(sg.getNode(pasted.rootBoneId)!.type).toBe('bone');
    expect(sg.getNode(pasted.targetNodeId)!.type).toBe('ik-target');
  });
});
