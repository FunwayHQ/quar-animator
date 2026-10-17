/**
 * A bound mesh follows its own transform: moving, rotating or animating it
 * after binding moves it relative to its skeleton.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SceneGraph, createGroupNode, mat3 } from '@quar/core';
import type { RectangleNode, SkinData } from '@quar/types';
import { createBoneNode } from './boneHelpers';
import { createSkinBinding, placeSkinData } from './skinBinding';
import { deformVertices } from './cpuSkinning';

function rect(x: number, y: number): RectangleNode {
  return {
    id: 'mesh',
    name: 'Mesh',
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
    width: 100,
    height: 40,
    cornerRadius: [0, 0, 0, 0],
    fills: [],
    strokes: [],
  };
}

/** Local matrix of a node, as the scene graph composes it. */
function localOf(sg: SceneGraph, id: string): number[] {
  const { position, rotation, scale, anchor } = sg.getNode(id)!.transform;
  const m = mat3.compose(position, rotation, scale, anchor);
  return [m.a, m.b, m.c, m.d, m.tx, m.ty];
}

const vertices = new Float32Array([-50, -20, 50, -20, 50, 20, -50, 20]);

/** Bind the mesh fully to one bone. */
function bind(sg: SceneGraph): SkinData {
  const skin = createSkinBinding('mesh', ['bone'], 4, sg)!;
  skin.vertices = skin.vertices.map(() => ({ influences: [{ boneId: 'bone', weight: 1 }] }));
  return skin;
}

function deform(sg: SceneGraph, skin: SkinData): number[] {
  const placed = placeSkinData(skin, localOf(sg, 'mesh'));
  return Array.from(deformVertices(vertices, placed, { bone: sg.getWorldTransform('bone') }));
}

describe('bound meshes follow their own transform', () => {
  let sg: SceneGraph;

  beforeEach(() => {
    sg = new SceneGraph();
  });

  it('records the mesh’s own transform at bind time', () => {
    sg.addNode({
      ...createGroupNode('group', 'Group'),
      transform: { ...rect(0, 0).transform, position: { x: 300, y: 10 } },
    });
    sg.addNode(createBoneNode('bone', 'Bone', { x: 0, y: 0 }, 80), 'group');
    sg.addNode(rect(50, 50), 'group');
    const skin = createSkinBinding('mesh', ['bone'], 4, sg)!;
    skin.meshBindLocal!.forEach((v, i) => expect(v).toBeCloseTo(localOf(sg, 'mesh')[i]!, 9));
  });

  it('moves with the mesh when the mesh itself moves', () => {
    sg.addNode(createBoneNode('bone', 'Bone', { x: 0, y: 0 }, 80));
    sg.addNode(rect(50, 50));
    const skin = bind(sg);
    const before = deform(sg, skin);

    sg.updateNode('mesh', { transform: { ...rect(150, 70).transform } });
    const after = deform(sg, skin);
    after.forEach((v, i) => expect(v).toBeCloseTo(before[i]! + (i % 2 === 0 ? 100 : 20), 6));
  });

  it('still bends with its bones after moving', () => {
    sg.addNode(createBoneNode('bone', 'Bone', { x: 0, y: 0 }, 80));
    sg.addNode(rect(50, 0));
    const skin = bind(sg);
    sg.updateNode('mesh', { transform: { ...rect(50, 100).transform } });
    sg.updateNode('bone', { transform: { ...sg.getNode('bone')!.transform, rotation: 90 } });
    // A vertex at the mesh's right end swings a quarter turn about the bone
    const [x, y] = deform(sg, skin).slice(2, 4);
    const world = sg.getWorldTransform('bone');
    const atRest = mat3.transformPoint(
      mat3.compose({ x: 50, y: 100 }, 0, { x: 1, y: 1 }, { x: 0.5, y: 0.5 }),
      { x: 50, y: -20 }
    );
    const expected = mat3.transformPoint(world, atRest);
    expect(x).toBeCloseTo(expected.x, 6);
    expect(y).toBeCloseTo(expected.y, 6);
  });

  it('moves once, not twice, when a shared parent moves skeleton and mesh together', () => {
    sg.addNode(createGroupNode('group', 'Group'));
    sg.addNode(createBoneNode('bone', 'Bone', { x: 0, y: 0 }, 80), 'group');
    sg.addNode(rect(50, 50), 'group');
    const skin = bind(sg);
    const before = deform(sg, skin);

    sg.updateNode('group', {
      transform: { ...sg.getNode('group')!.transform, position: { x: 100, y: 0 } },
    });
    const after = deform(sg, skin);
    after.forEach((v, i) => expect(v).toBeCloseTo(before[i]! + (i % 2 === 0 ? 100 : 0), 6));
  });

  it('changes nothing until the mesh moves, and leaves older bindings alone', () => {
    sg.addNode(createBoneNode('bone', 'Bone', { x: 0, y: 0 }, 80));
    sg.addNode(rect(50, 50));
    const skin = bind(sg);
    expect(placeSkinData(skin, localOf(sg, 'mesh'))).toBe(skin);
    const { meshBindLocal: _ignored, ...older } = skin;
    expect(placeSkinData(older, [1, 0, 0, 1, 500, 0])).toBe(older);
  });
});
