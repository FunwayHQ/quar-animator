/**
 * IK under transformed parents, from a stable pose.
 */

import { describe, it, expect } from 'vitest';
import { SceneGraph, createGroupNode } from '@quar/core';
import type { BoneNode, IKChain, Node } from '@quar/types';
import { createBoneNode } from './boneHelpers';
import { evaluateIKChains } from './ikEvaluator';

function target(id: string, x: number, y: number, parent: string | null = null): Node {
  return {
    id,
    name: id,
    type: 'ik-target',
    parent,
    children: [],
    transform: {
      position: { x, y },
      rotation: 0,
      scale: { x: 1, y: 1 },
      anchor: { x: 0, y: 0 },
      skew: { x: 0, y: 0 },
    },
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    ikChainId: 'ik',
    targetType: 'effector',
  } as Node;
}

const chain = (rootBoneId: string, endEffectorBoneId: string): IKChain => ({
  id: 'ik',
  name: 'IK',
  rootBoneId,
  endEffectorBoneId,
  targetNodeId: 'target',
  maxIterations: 50,
  tolerance: 0.01,
  enabled: true,
});

/** Where the end bone's tip is now, in world space. */
function tip(sg: SceneGraph, boneId: string) {
  const w = sg.getWorldTransform(boneId);
  const length = (sg.getNode(boneId) as BoneNode).length;
  return { x: w.a * length + w.tx, y: w.b * length + w.ty };
}

/** upper (0,0)→(100,0), lower on its tip; optionally inside a parent layer. */
function arm(sg: SceneGraph, parent?: string, lowerHead = { x: 100, y: 0 }) {
  sg.addNode(createBoneNode('upper', 'Upper', { x: 0, y: 0 }, 100), parent);
  sg.addNode(createBoneNode('lower', 'Lower', lowerHead, 100), 'upper');
}

describe('IK under transformed parents', () => {
  it('reaches the target inside a scaled group', () => {
    const sg = new SceneGraph();
    sg.addNode({
      ...createGroupNode('g', 'G'),
      transform: {
        position: { x: 0, y: 0 },
        rotation: 0,
        scale: { x: 2, y: 2 },
        anchor: { x: 0, y: 0 },
        skew: { x: 0, y: 0 },
      },
    });
    arm(sg, 'g');
    // 400 units of arm in the world; a target 300 away
    sg.addNode(target('target', 200, 200));
    evaluateIKChains([chain('upper', 'lower')], sg);
    expect(tip(sg, 'lower').x).toBeCloseTo(200, 0);
    expect(tip(sg, 'lower').y).toBeCloseTo(200, 0);
  });

  it('reaches the target inside a mirrored group', () => {
    const sg = new SceneGraph();
    sg.addNode({
      ...createGroupNode('g', 'G'),
      transform: {
        position: { x: 0, y: 0 },
        rotation: 0,
        scale: { x: -1, y: 1 },
        anchor: { x: 0, y: 0 },
        skew: { x: 0, y: 0 },
      },
    });
    arm(sg, 'g');
    sg.addNode(target('target', -120, 90));
    evaluateIKChains([chain('upper', 'lower')], sg);
    expect(tip(sg, 'lower').x).toBeCloseTo(-120, 0);
    expect(tip(sg, 'lower').y).toBeCloseTo(90, 0);
  });

  it('reaches the target with a bone whose head is off its parent’s tip', () => {
    const sg = new SceneGraph();
    arm(sg, undefined, { x: 100, y: 20 });
    sg.addNode(target('target', 80, 120));
    evaluateIKChains([chain('upper', 'lower')], sg);
    expect(tip(sg, 'lower').x).toBeCloseTo(80, 0);
    expect(tip(sg, 'lower').y).toBeCloseTo(120, 0);
  });
});

describe('IK from a stable pose', () => {
  it('bends a straight chain to reach a target on its axis', () => {
    const sg = new SceneGraph();
    arm(sg);
    sg.addNode(target('target', 150, 0));
    evaluateIKChains([chain('upper', 'lower')], sg);
    expect(tip(sg, 'lower').x).toBeCloseTo(150, 0);
    expect(tip(sg, 'lower').y).toBeCloseTo(0, 0);
    expect(Math.abs((sg.getNode('lower') as BoneNode).transform.rotation)).toBeGreaterThan(30);
  });

  it('gives the same pose for the same target, whatever was solved before', () => {
    const sg = new SceneGraph();
    arm(sg);
    sg.getNode('upper')!.transform.rotation = 10;
    sg.addNode(target('target', 120, 80));
    const ik = [chain('upper', 'lower')];
    const pose = () => ['upper', 'lower'].map((id) => sg.getNode(id)!.transform.rotation);

    evaluateIKChains(ik, sg);
    const first = pose();
    sg.updateNode('target', {
      transform: { ...sg.getNode('target')!.transform, position: { x: -60, y: 150 } },
    });
    evaluateIKChains(ik, sg);
    sg.updateNode('target', {
      transform: { ...sg.getNode('target')!.transform, position: { x: 120, y: 80 } },
    });
    evaluateIKChains(ik, sg);

    pose().forEach((rotation, i) => expect(rotation).toBeCloseTo(first[i]!, 3));
  });

  it('leaves a chain alone whose target rides on it', () => {
    const sg = new SceneGraph();
    arm(sg);
    sg.addNode(target('target', 50, 50, 'lower'), 'lower');
    evaluateIKChains([chain('upper', 'lower')], sg);
    expect(sg.getNode('upper')!.transform.rotation).toBe(0);
    expect(sg.getNode('lower')!.transform.rotation).toBe(0);
  });

  it('keeps a joint within its limits, as a local rotation', () => {
    const sg = new SceneGraph();
    // The whole arm under a parent turned a quarter turn
    sg.addNode({
      ...createGroupNode('g', 'G'),
      transform: {
        position: { x: 0, y: 0 },
        rotation: 90,
        scale: { x: 1, y: 1 },
        anchor: { x: 0, y: 0 },
        skew: { x: 0, y: 0 },
      },
    });
    arm(sg, 'g');
    sg.updateNode('lower', { angleMin: 0, angleMax: 60 } as Partial<Node>);
    // Up the arm's axis, but bent the way the limits forbid
    sg.addNode(target('target', 60, 120));
    evaluateIKChains([chain('upper', 'lower')], sg);
    const elbow = sg.getNode('lower')!.transform.rotation;
    expect(elbow).toBeGreaterThanOrEqual(-1e-6);
    expect(elbow).toBeLessThanOrEqual(60 + 1e-6);
  });
});
