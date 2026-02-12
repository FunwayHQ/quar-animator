/**
 * Tests for IK Chain Evaluator
 */

import { describe, it, expect } from 'vitest';
import { evaluateIKChains } from './ikEvaluator';
import type { IKChain, Node, BoneNode, Vector2 } from '@quar/types';
import { createBoneNode } from './boneHelpers';

// ============================================================================
// Mock Scene Graph
// ============================================================================

function createMockSG(
  bones: BoneNode[],
  extras: Array<{ id: string; type: string; position: Vector2 }> = []
) {
  const nodes = new Map<string, any>();
  for (const bone of bones) nodes.set(bone.id, bone);
  for (const extra of extras) {
    nodes.set(extra.id, {
      id: extra.id,
      type: extra.type,
      name: extra.id,
      parent: null,
      children: [],
      transform: {
        position: { x: extra.position.x, y: extra.position.y },
        rotation: 0,
        scale: { x: 1, y: 1 },
        anchor: { x: 0, y: 0 },
        skew: { x: 0, y: 0 },
      },
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      ikChainId: '',
      targetType: 'effector',
    });
  }

  function getWorldTransform(id: string) {
    const chain: any[] = [];
    let currentId: string | null = id;
    while (currentId) {
      const node = nodes.get(currentId);
      if (!node) break;
      chain.unshift(node);
      currentId = node.parent;
    }

    let a = 1,
      b = 0,
      c = 0,
      d = 1,
      tx = 0,
      ty = 0;
    for (const node of chain) {
      const rad = ((node.transform?.rotation ?? 0) * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const px = node.transform?.position?.x ?? 0;
      const py = node.transform?.position?.y ?? 0;

      const na = a * cos + c * sin;
      const nb = b * cos + d * sin;
      const nc = a * -sin + c * cos;
      const nd = b * -sin + d * cos;
      const ntx = a * px + c * py + tx;
      const nty = b * px + d * py + ty;

      a = na;
      b = nb;
      c = nc;
      d = nd;
      tx = ntx;
      ty = nty;
    }

    return { a, b, c, d, tx, ty };
  }

  return {
    nodes,
    getNode(id: string) {
      return nodes.get(id);
    },
    updateNode(id: string, data: Partial<Node>) {
      const existing = nodes.get(id);
      if (existing) nodes.set(id, { ...existing, ...data });
    },
    getWorldTransform,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('evaluateIKChains', () => {
  it('skips disabled chains', () => {
    const root = createBoneNode('root', 'Root', { x: 0, y: 0 }, 100, 0);
    const sg = createMockSG(
      [root],
      [{ id: 'target', type: 'ik-target', position: { x: 0, y: 100 } }]
    );

    const chains: IKChain[] = [
      {
        id: 'chain1',
        name: 'Chain 1',
        rootBoneId: 'root',
        endEffectorBoneId: 'root',
        targetNodeId: 'target',
        maxIterations: 10,
        tolerance: 0.5,
        enabled: false,
      },
    ];

    evaluateIKChains(chains, sg);

    // Bone should not have rotated
    expect(sg.nodes.get('root')!.transform.rotation).toBe(0);
  });

  it('solves a single-bone IK chain', () => {
    const root = createBoneNode('root', 'Root', { x: 0, y: 0 }, 100, 0);
    const sg = createMockSG(
      [root],
      [{ id: 'target', type: 'ik-target', position: { x: 0, y: 100 } }]
    );

    const chains: IKChain[] = [
      {
        id: 'chain1',
        name: 'Chain 1',
        rootBoneId: 'root',
        endEffectorBoneId: 'root',
        targetNodeId: 'target',
        maxIterations: 10,
        tolerance: 0.5,
        enabled: true,
      },
    ];

    evaluateIKChains(chains, sg);

    // Root bone should rotate toward target (0, 100) → 90 degrees
    const rotation = sg.nodes.get('root')!.transform.rotation;
    expect(rotation).toBeCloseTo(90, 0);
  });

  it('solves a 2-bone IK chain', () => {
    const root = createBoneNode('root', 'Root', { x: 0, y: 0 }, 100, 0);
    const child = createBoneNode('child', 'Child', { x: 100, y: 0 }, 100, 0);
    child.parent = 'root';
    root.children = ['child'];

    // Target at (50, 150) — not on the initial chain axis, forces actual bending
    const sg = createMockSG(
      [root, child],
      [{ id: 'target', type: 'ik-target', position: { x: 50, y: 150 } }]
    );

    const chains: IKChain[] = [
      {
        id: 'chain1',
        name: 'Chain 1',
        rootBoneId: 'root',
        endEffectorBoneId: 'child',
        targetNodeId: 'target',
        maxIterations: 20,
        tolerance: 0.5,
        enabled: true,
      },
    ];

    evaluateIKChains(chains, sg);

    // Both bones should have updated rotations
    const rootRot = sg.nodes.get('root')!.transform.rotation;
    const childRot = sg.nodes.get('child')!.transform.rotation;
    expect(rootRot).not.toBe(0);
    expect(typeof childRot).toBe('number');
  });

  it('skips chain if target node missing', () => {
    const root = createBoneNode('root', 'Root', { x: 0, y: 0 }, 100, 0);
    const sg = createMockSG([root]);

    const chains: IKChain[] = [
      {
        id: 'chain1',
        name: 'Chain 1',
        rootBoneId: 'root',
        endEffectorBoneId: 'root',
        targetNodeId: 'nonexistent',
        maxIterations: 10,
        tolerance: 0.5,
        enabled: true,
      },
    ];

    // Should not throw
    evaluateIKChains(chains, sg);
    expect(sg.nodes.get('root')!.transform.rotation).toBe(0);
  });

  it('skips chain if bone chain invalid', () => {
    const root = createBoneNode('root', 'Root', { x: 0, y: 0 }, 100, 0);
    const sg = createMockSG(
      [root],
      [{ id: 'target', type: 'ik-target', position: { x: 0, y: 100 } }]
    );

    const chains: IKChain[] = [
      {
        id: 'chain1',
        name: 'Chain 1',
        rootBoneId: 'root',
        endEffectorBoneId: 'nonexistent', // Invalid end bone
        targetNodeId: 'target',
        maxIterations: 10,
        tolerance: 0.5,
        enabled: true,
      },
    ];

    evaluateIKChains(chains, sg);
    expect(sg.nodes.get('root')!.transform.rotation).toBe(0);
  });

  it('uses pole target when specified', () => {
    const root = createBoneNode('root', 'Root', { x: 0, y: 0 }, 100, 0);
    const child = createBoneNode('child', 'Child', { x: 100, y: 0 }, 100, 0);
    child.parent = 'root';
    root.children = ['child'];

    const sg = createMockSG(
      [root, child],
      [
        { id: 'target', type: 'ik-target', position: { x: 100, y: 0 } },
        { id: 'pole', type: 'ik-target', position: { x: 50, y: 100 } },
      ]
    );

    const chains: IKChain[] = [
      {
        id: 'chain1',
        name: 'Chain 1',
        rootBoneId: 'root',
        endEffectorBoneId: 'child',
        targetNodeId: 'target',
        poleTargetNodeId: 'pole',
        maxIterations: 20,
        tolerance: 0.5,
        enabled: true,
      },
    ];

    evaluateIKChains(chains, sg);
    // Should solve without errors
    expect(typeof sg.nodes.get('root')!.transform.rotation).toBe('number');
  });

  it('evaluates multiple chains', () => {
    const b1 = createBoneNode('b1', 'B1', { x: 0, y: 0 }, 100, 0);
    const b2 = createBoneNode('b2', 'B2', { x: 200, y: 0 }, 100, 0);

    const sg = createMockSG(
      [b1, b2],
      [
        { id: 't1', type: 'ik-target', position: { x: 0, y: 100 } },
        { id: 't2', type: 'ik-target', position: { x: 200, y: 100 } },
      ]
    );

    const chains: IKChain[] = [
      {
        id: 'chain1',
        name: 'Chain 1',
        rootBoneId: 'b1',
        endEffectorBoneId: 'b1',
        targetNodeId: 't1',
        maxIterations: 10,
        tolerance: 0.5,
        enabled: true,
      },
      {
        id: 'chain2',
        name: 'Chain 2',
        rootBoneId: 'b2',
        endEffectorBoneId: 'b2',
        targetNodeId: 't2',
        maxIterations: 10,
        tolerance: 0.5,
        enabled: true,
      },
    ];

    evaluateIKChains(chains, sg);

    expect(sg.nodes.get('b1')!.transform.rotation).toBeCloseTo(90, 0);
    expect(sg.nodes.get('b2')!.transform.rotation).toBeCloseTo(90, 0);
  });

  it('handles empty chains array', () => {
    const root = createBoneNode('root', 'Root', { x: 0, y: 0 }, 100, 0);
    const sg = createMockSG([root]);

    // Should not throw
    evaluateIKChains([], sg);
    expect(sg.nodes.get('root')!.transform.rotation).toBe(0);
  });

  it('ignores missing pole target gracefully', () => {
    const root = createBoneNode('root', 'Root', { x: 0, y: 0 }, 100, 0);
    const sg = createMockSG(
      [root],
      [{ id: 'target', type: 'ik-target', position: { x: 0, y: 100 } }]
    );

    const chains: IKChain[] = [
      {
        id: 'chain1',
        name: 'Chain 1',
        rootBoneId: 'root',
        endEffectorBoneId: 'root',
        targetNodeId: 'target',
        poleTargetNodeId: 'missing-pole',
        maxIterations: 10,
        tolerance: 0.5,
        enabled: true,
      },
    ];

    // Should solve without pole target
    evaluateIKChains(chains, sg);
    expect(sg.nodes.get('root')!.transform.rotation).toBeCloseTo(90, 0);
  });
});
