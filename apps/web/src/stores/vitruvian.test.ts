/**
 * Switching Vitruvian bone groups.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SceneGraph, createDefaultTransform } from '@quar/core';
import { createBoneNode } from '@quar/rigging';
import type { RectangleNode, SkinData } from '@quar/types';
import { useEditorStore } from './editorStore';

const store = () => useEditorStore.getState();

const boundTo = (boneId: string): SkinData => ({
  vertices: [{ influences: [{ boneId, weight: 1 }] }],
  inverseBindMatrices: { [boneId]: [1, 0, 0, 1, 0, 0] },
  meshBindMatrix: [1, 0, 0, 1, 0, 0],
  vertexCount: 1,
});

const skinOf = (sg: SceneGraph) =>
  (sg.getNode('mesh') as RectangleNode & { skinData?: SkinData }).skinData!;

describe('Vitruvian groups', () => {
  let sg: SceneGraph;
  let controllerId: string;
  let front: string;
  let side: string;

  beforeEach(() => {
    store().resetProject();
    store().clearHistory();
    sg = new SceneGraph();
    sg.addNode(createBoneNode('front-arm', 'Front arm', { x: 0, y: 0 }, 50));
    sg.addNode(createBoneNode('side-arm', 'Side arm', { x: 0, y: 0 }, 50));
    sg.addNode({
      id: 'mesh',
      name: 'Mesh',
      type: 'rectangle',
      parent: null,
      children: [],
      transform: createDefaultTransform(),
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      width: 10,
      height: 10,
      cornerRadius: [0, 0, 0, 0],
      fills: [],
      strokes: [],
      skinData: boundTo('front-arm'),
    } as RectangleNode);

    controllerId = store().createVitruvianController(sg, 'Views');
    front = store().vitruvianControllers[0]!.activeGroupId;
    store().setVitruvianGroupBones(sg, controllerId, front, ['front-arm'], true);
    store().captureVitruvianSkinSnapshots(controllerId, front, sg);
    side = store().addVitruvianGroup(sg, controllerId, 'Side', ['side-arm']);
    // The side view bound to its own arm
    sg.updateNode('mesh', { skinData: boundTo('side-arm') } as never);
    store().captureVitruvianSkinSnapshots(controllerId, side, sg);
    sg.updateNode('mesh', { skinData: boundTo('front-arm') } as never);
  });

  it('brings back each group’s bindings when switching', () => {
    store().setVitruvianActiveGroup(sg, controllerId, side);
    expect(Object.keys(skinOf(sg).inverseBindMatrices)).toEqual(['side-arm']);
    store().setVitruvianActiveGroup(sg, controllerId, front);
    expect(Object.keys(skinOf(sg).inverseBindMatrices)).toEqual(['front-arm']);
  });

  it('keeps the edits made while a group was active', () => {
    store().setVitruvianActiveGroup(sg, controllerId, side);
    const painted = { ...boundTo('side-arm'), vertexCount: 1, bindVertices: [1, 2] };
    sg.updateNode('mesh', { skinData: painted } as never);
    store().setVitruvianActiveGroup(sg, controllerId, front);
    store().setVitruvianActiveGroup(sg, controllerId, side);
    expect(skinOf(sg).bindVertices).toEqual([1, 2]);
  });

  it('undoes a switch', () => {
    store().setVitruvianActiveGroup(sg, controllerId, side);
    store().undo(sg);
    expect(store().vitruvianControllers[0]!.activeGroupId).toBe(front);
    expect(Object.keys(skinOf(sg).inverseBindMatrices)).toEqual(['front-arm']);
  });

  it('puts bones in a group and takes them out', () => {
    store().setVitruvianGroupBones(sg, controllerId, side, ['front-arm', 'side-arm'], true);
    const group = () => store().vitruvianControllers[0]!.groups.find((g) => g.id === side)!;
    expect(group().boneIds).toEqual(['side-arm', 'front-arm']);
    store().setVitruvianGroupBones(sg, controllerId, side, ['side-arm'], false);
    expect(group().boneIds).toEqual(['front-arm']);
  });
});
