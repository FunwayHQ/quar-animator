/**
 * Test fixture: a 200 × 40 arm bound, with a bending mesh, to two bones,
 * its elbow bending 90° over frames 0–10.
 */

import { SceneGraph, createBendMesh, shapeOutline } from '@quar/core';
import { addKeyframe, createTimeline, getOrCreateTrack } from '@quar/animation';
import {
  bindVertexPositions,
  computeAutoWeights,
  computeFKChain,
  createBoneNode,
  createSkinBinding,
} from '@quar/rigging';
import type { Node, RectangleNode, SkinData, Timeline } from '@quar/types';

export function armRect(): RectangleNode {
  return {
    id: 'arm',
    name: 'Arm',
    type: 'rectangle',
    parent: null,
    children: [],
    transform: {
      position: { x: 0, y: 0 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      anchor: { x: 0.5, y: 0.5 },
      skew: { x: 0, y: 0 },
    },
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    width: 200,
    height: 40,
    cornerRadius: [0, 0, 0, 0],
    fills: [{ type: 'solid', color: { r: 255, g: 0, b: 0, a: 1 }, opacity: 1, visible: true }],
    strokes: [],
  };
}

export function riggedArm(): { sg: SceneGraph; timeline: Timeline; outlineCount: number } {
  const sg = new SceneGraph();
  sg.addNode(createBoneNode('upper', 'Upper', { x: -100, y: 0 }, 100));
  sg.addNode(createBoneNode('lower', 'Lower', { x: 100, y: 0 }, 100), 'upper');
  const arm = armRect();
  sg.addNode(arm);
  const outline = shapeOutline(arm);
  if (!outline) throw new Error('The arm has no outline');
  const mesh = createBendMesh(outline.vertices);
  const skin = createSkinBinding('arm', ['upper', 'lower'], mesh.vertices.length / 2, sg);
  if (!skin) throw new Error('The arm could not be bound');
  const world = sg.getWorldTransform('arm');
  const positions = new Float32Array(mesh.vertices.length);
  for (let i = 0; i < mesh.vertices.length; i += 2) {
    positions[i] = world.a * mesh.vertices[i]! + world.c * mesh.vertices[i + 1]! + world.tx;
    positions[i + 1] = world.b * mesh.vertices[i]! + world.d * mesh.vertices[i + 1]! + world.ty;
  }
  const weighted = computeAutoWeights(skin, positions, computeFKChain('upper', sg));
  const skinData: SkinData = {
    ...weighted,
    bindVertices: bindVertexPositions(mesh.vertices),
    bendMesh: true,
  };
  sg.updateNode('arm', { skinData } as Partial<Node>);

  const timeline = createTimeline({ duration: 30, frameRate: 30 });
  const elbow = getOrCreateTrack<number>(timeline, 'lower', 'transform.rotation');
  addKeyframe(elbow, 0, 0);
  addKeyframe(elbow, 10, 90);
  return { sg, timeline, outlineCount: mesh.outlineVertexCount };
}
