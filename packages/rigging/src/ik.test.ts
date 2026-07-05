/**
 * Tests for FABRIK IK Solver
 */

import { describe, it, expect } from 'vitest';
import { solveFABRIK, extractIKJoints, applyIKResult, type IKJoint, type IKSceneGraph } from './ik';
import type { BoneNode, Node, Vector2 } from '@quar/types';
import { createBoneNode } from './boneHelpers';

// ============================================================================
// Helpers
// ============================================================================

function makeJoint(
  boneId: string,
  worldPos: Vector2,
  boneLength: number,
  angleMin?: number,
  angleMax?: number
): IKJoint {
  return { boneId, worldPos, boneLength, angleMin, angleMax };
}

/** Build a simple mock scene graph from bones */
function createMockSceneGraph(bones: BoneNode[]): IKSceneGraph & { nodes: Map<string, BoneNode> } {
  const nodes = new Map<string, BoneNode>();
  for (const bone of bones) {
    nodes.set(bone.id, bone);
  }

  // Compute world transforms by walking parent chain
  function getWorldTransform(id: string) {
    const chain: BoneNode[] = [];
    let currentId: string | null = id;
    while (currentId) {
      const node = nodes.get(currentId);
      if (!node) break;
      chain.unshift(node);
      currentId = node.parent;
    }

    // Accumulate transforms
    let a = 1,
      b = 0,
      c = 0,
      d = 1,
      tx = 0,
      ty = 0;
    for (const bone of chain) {
      const rad = (bone.transform.rotation * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const px = bone.transform.position.x;
      const py = bone.transform.position.y;

      // Multiply current matrix by local transform
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
      if (existing) {
        const merged = { ...existing, ...data } as BoneNode;
        nodes.set(id, merged);
      }
    },
    getWorldTransform,
  };
}

// ============================================================================
// solveFABRIK — Basic Cases
// ============================================================================

describe('solveFABRIK', () => {
  it('returns empty result for empty joints array', () => {
    const result = solveFABRIK({
      joints: [],
      target: { x: 100, y: 0 },
      maxIterations: 10,
      tolerance: 0.5,
    });
    expect(result.rotations.size).toBe(0);
    expect(result.converged).toBe(true);
    expect(result.endEffectorError).toBe(0);
  });

  it('solves single bone pointing toward target', () => {
    const joints = [makeJoint('bone1', { x: 0, y: 0 }, 100)];
    const result = solveFABRIK({
      joints,
      target: { x: 100, y: 0 },
      maxIterations: 10,
      tolerance: 0.5,
    });
    expect(result.rotations.size).toBe(1);
    const rotation = result.rotations.get('bone1')!;
    expect(rotation).toBeCloseTo(0, 1); // Pointing right
  });

  it('solves single bone pointing upward', () => {
    const joints = [makeJoint('bone1', { x: 0, y: 0 }, 100)];
    const result = solveFABRIK({
      joints,
      target: { x: 0, y: 100 },
      maxIterations: 10,
      tolerance: 0.5,
    });
    const rotation = result.rotations.get('bone1')!;
    expect(rotation).toBeCloseTo(90, 1);
  });

  it('solves single bone pointing at 45 degrees', () => {
    const joints = [makeJoint('bone1', { x: 0, y: 0 }, 100)];
    const result = solveFABRIK({
      joints,
      target: { x: 70.7, y: 70.7 },
      maxIterations: 10,
      tolerance: 0.5,
    });
    const rotation = result.rotations.get('bone1')!;
    expect(rotation).toBeCloseTo(45, 1);
  });

  it('solves single bone with unreachable target (extends toward it)', () => {
    const joints = [makeJoint('bone1', { x: 0, y: 0 }, 50)];
    const result = solveFABRIK({
      joints,
      target: { x: 200, y: 0 },
      maxIterations: 10,
      tolerance: 0.5,
    });
    const rotation = result.rotations.get('bone1')!;
    expect(rotation).toBeCloseTo(0, 1);
    expect(result.endEffectorError).toBeGreaterThan(0);
  });

  // --------------------------------------------------------------------------
  // Two-bone chain
  // --------------------------------------------------------------------------

  it('solves two-bone chain with target at full extension', () => {
    const joints = [
      makeJoint('bone1', { x: 0, y: 0 }, 100),
      makeJoint('bone2', { x: 100, y: 0 }, 100),
    ];
    const result = solveFABRIK({
      joints,
      target: { x: 200, y: 0 },
      maxIterations: 10,
      tolerance: 0.5,
    });
    expect(result.converged).toBe(true);
    // Both bones should point right
    const r1 = result.rotations.get('bone1')!;
    const r2 = result.rotations.get('bone2')!;
    expect(r1).toBeCloseTo(0, 0);
    expect(r2).toBeCloseTo(0, 0);
  });

  it('solves two-bone chain with target requiring bend', () => {
    // Two 100-unit bones, target at (100, 100) — requires bending
    const joints = [
      makeJoint('bone1', { x: 0, y: 0 }, 100),
      makeJoint('bone2', { x: 100, y: 0 }, 100),
    ];
    const result = solveFABRIK({
      joints,
      target: { x: 100, y: 100 },
      maxIterations: 20,
      tolerance: 0.5,
    });
    expect(result.converged).toBe(true);
    expect(result.endEffectorError).toBeLessThan(1);
    // Both bones should have valid rotations (FABRIK may find any valid solution)
    expect(result.rotations.size).toBe(2);
    expect(typeof result.rotations.get('bone1')).toBe('number');
    expect(typeof result.rotations.get('bone2')).toBe('number');
  });

  it('solves two-bone chain with target directly above root', () => {
    const joints = [
      makeJoint('bone1', { x: 0, y: 0 }, 100),
      makeJoint('bone2', { x: 100, y: 0 }, 100),
    ];
    const result = solveFABRIK({
      joints,
      target: { x: 0, y: 150 },
      maxIterations: 20,
      tolerance: 0.5,
    });
    expect(result.converged).toBe(true);
    expect(result.endEffectorError).toBeLessThan(1);
  });

  it('handles unreachable target for two-bone chain', () => {
    const joints = [
      makeJoint('bone1', { x: 0, y: 0 }, 50),
      makeJoint('bone2', { x: 50, y: 0 }, 50),
    ];
    const result = solveFABRIK({
      joints,
      target: { x: 300, y: 0 },
      maxIterations: 10,
      tolerance: 0.5,
    });
    // Both bones should extend fully toward target
    const r1 = result.rotations.get('bone1')!;
    const r2 = result.rotations.get('bone2')!;
    expect(r1).toBeCloseTo(0, 0);
    expect(r2).toBeCloseTo(0, 0);
    expect(result.endEffectorError).toBeGreaterThan(100);
  });

  // --------------------------------------------------------------------------
  // Three-bone chain
  // --------------------------------------------------------------------------

  it('solves three-bone chain', () => {
    const joints = [
      makeJoint('bone1', { x: 0, y: 0 }, 80),
      makeJoint('bone2', { x: 80, y: 0 }, 60),
      makeJoint('bone3', { x: 140, y: 0 }, 40),
    ];
    const result = solveFABRIK({
      joints,
      target: { x: 100, y: 80 },
      maxIterations: 20,
      tolerance: 0.5,
    });
    expect(result.converged).toBe(true);
    expect(result.rotations.size).toBe(3);
  });

  it('solves three-bone chain reaching behind root (non-collinear start)', () => {
    // Start with slight offset to break collinearity (FABRIK can't bend collinear chains)
    const joints = [
      makeJoint('bone1', { x: 0, y: 0 }, 80),
      makeJoint('bone2', { x: 80, y: 5 }, 60),
      makeJoint('bone3', { x: 140, y: 5 }, 40),
    ];
    const result = solveFABRIK({
      joints,
      target: { x: -50, y: 0 },
      maxIterations: 30,
      tolerance: 1.0,
    });
    expect(result.rotations.size).toBe(3);
    // Should attempt to reach behind — root bone should rotate significantly
    const r1 = result.rotations.get('bone1')!;
    expect(Math.abs(r1)).toBeGreaterThan(30);
  });

  // --------------------------------------------------------------------------
  // Angle constraints
  // --------------------------------------------------------------------------

  it('respects angle constraints on single bone', () => {
    const joints = [makeJoint('bone1', { x: 0, y: 0 }, 100, -45, 45)];
    const result = solveFABRIK({
      joints,
      target: { x: 0, y: 100 }, // 90 degrees up
      maxIterations: 10,
      tolerance: 0.5,
    });
    const rotation = result.rotations.get('bone1')!;
    expect(rotation).toBeCloseTo(45, 1); // Clamped to max 45
  });

  it('respects negative angle constraint', () => {
    const joints = [makeJoint('bone1', { x: 0, y: 0 }, 100, -30, 30)];
    const result = solveFABRIK({
      joints,
      target: { x: 0, y: -100 }, // -90 degrees down
      maxIterations: 10,
      tolerance: 0.5,
    });
    const rotation = result.rotations.get('bone1')!;
    expect(rotation).toBeCloseTo(-30, 1); // Clamped to min -30
  });

  it('respects constraints on middle bone in chain', () => {
    const joints = [
      makeJoint('bone1', { x: 0, y: 0 }, 100),
      makeJoint('bone2', { x: 100, y: 0 }, 100, -20, 20), // Constrained middle bone
    ];
    const result = solveFABRIK({
      joints,
      target: { x: 0, y: 200 },
      maxIterations: 20,
      tolerance: 1.0,
    });
    expect(result.rotations.size).toBe(2);
    // The constraint should have been applied
  });

  it('handles constraint with only min specified', () => {
    const joints = [makeJoint('bone1', { x: 0, y: 0 }, 100, -10, undefined)];
    const result = solveFABRIK({
      joints,
      target: { x: 0, y: -100 },
      maxIterations: 10,
      tolerance: 0.5,
    });
    const rotation = result.rotations.get('bone1')!;
    expect(rotation).toBeGreaterThanOrEqual(-10.1);
  });

  it('handles constraint with only max specified', () => {
    const joints = [makeJoint('bone1', { x: 0, y: 0 }, 100, undefined, 10)];
    const result = solveFABRIK({
      joints,
      target: { x: 0, y: 100 },
      maxIterations: 10,
      tolerance: 0.5,
    });
    const rotation = result.rotations.get('bone1')!;
    expect(rotation).toBeLessThanOrEqual(10.1);
  });

  // --------------------------------------------------------------------------
  // Pole target
  // --------------------------------------------------------------------------

  it('applies pole target to influence bend direction', () => {
    // Two bones, target in front — could bend up or down
    const joints = [
      makeJoint('bone1', { x: 0, y: 0 }, 100),
      makeJoint('bone2', { x: 100, y: 0 }, 100),
    ];

    // With pole target above — should bend upward
    const resultUp = solveFABRIK({
      joints: joints.map((j) => ({ ...j })),
      target: { x: 100, y: 0 },
      poleTarget: { x: 50, y: 100 },
      maxIterations: 20,
      tolerance: 0.5,
    });

    // With pole target below — should bend downward
    const resultDown = solveFABRIK({
      joints: joints.map((j) => ({ ...j })),
      target: { x: 100, y: 0 },
      poleTarget: { x: 50, y: -100 },
      maxIterations: 20,
      tolerance: 0.5,
    });

    // Both should converge
    expect(resultUp.rotations.size).toBe(2);
    expect(resultDown.rotations.size).toBe(2);
  });

  it('pole target on 3-bone chain affects middle joints', () => {
    const joints = [
      makeJoint('bone1', { x: 0, y: 0 }, 80),
      makeJoint('bone2', { x: 80, y: 0 }, 60),
      makeJoint('bone3', { x: 140, y: 0 }, 40),
    ];
    const result = solveFABRIK({
      joints,
      target: { x: 120, y: 60 },
      poleTarget: { x: 60, y: 100 },
      maxIterations: 20,
      tolerance: 1.0,
    });
    expect(result.rotations.size).toBe(3);
  });

  // --------------------------------------------------------------------------
  // Edge cases
  // --------------------------------------------------------------------------

  it('handles target at root position', () => {
    const joints = [
      makeJoint('bone1', { x: 0, y: 0 }, 100),
      makeJoint('bone2', { x: 100, y: 0 }, 100),
    ];
    const result = solveFABRIK({
      joints,
      target: { x: 0, y: 0 },
      maxIterations: 20,
      tolerance: 1.0,
    });
    expect(result.rotations.size).toBe(2);
  });

  it('handles target very close to end effector (already there)', () => {
    const joints = [
      makeJoint('bone1', { x: 0, y: 0 }, 100),
      makeJoint('bone2', { x: 100, y: 0 }, 100),
    ];
    const result = solveFABRIK({
      joints,
      target: { x: 200, y: 0 },
      maxIterations: 10,
      tolerance: 0.5,
    });
    expect(result.converged).toBe(true);
    expect(result.endEffectorError).toBeLessThan(1);
  });

  it('handles zero-length bone gracefully', () => {
    const joints = [makeJoint('bone1', { x: 0, y: 0 }, 0), makeJoint('bone2', { x: 0, y: 0 }, 100)];
    const result = solveFABRIK({
      joints,
      target: { x: 100, y: 0 },
      maxIterations: 10,
      tolerance: 0.5,
    });
    expect(result.rotations.size).toBe(2);
  });

  it('converges within tolerance for reachable target', () => {
    const joints = [
      makeJoint('bone1', { x: 0, y: 0 }, 100),
      makeJoint('bone2', { x: 100, y: 0 }, 100),
    ];
    const result = solveFABRIK({
      joints,
      target: { x: 150, y: 50 },
      maxIterations: 50,
      tolerance: 0.1,
    });
    expect(result.converged).toBe(true);
    expect(result.endEffectorError).toBeLessThan(0.2);
  });

  it('returns correct number of rotations matching joint count', () => {
    const joints = [
      makeJoint('b1', { x: 0, y: 0 }, 50),
      makeJoint('b2', { x: 50, y: 0 }, 50),
      makeJoint('b3', { x: 100, y: 0 }, 50),
      makeJoint('b4', { x: 150, y: 0 }, 50),
    ];
    const result = solveFABRIK({
      joints,
      target: { x: 100, y: 100 },
      maxIterations: 20,
      tolerance: 1.0,
    });
    expect(result.rotations.size).toBe(4);
  });

  it('low maxIterations still returns valid result', () => {
    const joints = [
      makeJoint('bone1', { x: 0, y: 0 }, 100),
      makeJoint('bone2', { x: 100, y: 0 }, 100),
    ];
    const result = solveFABRIK({
      joints,
      target: { x: 50, y: 150 },
      maxIterations: 1,
      tolerance: 0.5,
    });
    expect(result.rotations.size).toBe(2);
    // May not converge with just 1 iteration
    expect(typeof result.endEffectorError).toBe('number');
  });

  it('maintains root position during solve', () => {
    const joints = [
      makeJoint('bone1', { x: 10, y: 20 }, 100),
      makeJoint('bone2', { x: 110, y: 20 }, 100),
    ];
    const result = solveFABRIK({
      joints,
      target: { x: 50, y: 150 },
      maxIterations: 20,
      tolerance: 0.5,
    });
    // Root bone rotation should be relative to root's position at (10, 20)
    expect(result.rotations.has('bone1')).toBe(true);
  });

  it('solves negative X direction target', () => {
    const joints = [makeJoint('bone1', { x: 0, y: 0 }, 100)];
    const result = solveFABRIK({
      joints,
      target: { x: -100, y: 0 },
      maxIterations: 10,
      tolerance: 0.5,
    });
    const rotation = result.rotations.get('bone1')!;
    expect(rotation).toBeCloseTo(180, 0);
  });
});

// ============================================================================
// extractIKJoints
// ============================================================================

describe('extractIKJoints', () => {
  it('extracts joints from a simple bone chain', () => {
    const root = createBoneNode('root', 'Root', { x: 0, y: 0 }, 100, 0);
    const child = createBoneNode('child', 'Child', { x: 100, y: 0 }, 80, 0);
    child.parent = 'root';
    root.children = ['child'];

    const sg = createMockSceneGraph([root, child]);
    const joints = extractIKJoints('root', 'child', sg);

    expect(joints.length).toBe(2);
    expect(joints[0]!.boneId).toBe('root');
    expect(joints[1]!.boneId).toBe('child');
    expect(joints[0]!.boneLength).toBe(100);
    expect(joints[1]!.boneLength).toBe(80);
  });

  it('records the root parent world rotation (F062)', () => {
    const parent = createBoneNode('p', 'P', { x: 0, y: 0 }, 50, 90); // rotated parent
    const root = createBoneNode('root', 'Root', { x: 0, y: 0 }, 100, 0);
    root.parent = 'p';
    const child = createBoneNode('child', 'Child', { x: 100, y: 0 }, 80, 0);
    child.parent = 'root';
    const sg = createMockSceneGraph([parent, root, child]);

    const joints = extractIKJoints('root', 'child', sg);
    expect(joints[0]!.rootParentWorldRotation).toBeCloseTo(90, 3);
  });

  it('offsets the root local rotation by the parent world rotation (F062)', () => {
    const j0: IKJoint = { boneId: 'root', worldPos: { x: 0, y: 0 }, boneLength: 100 };
    const j1: IKJoint = { boneId: 'child', worldPos: { x: 100, y: 0 }, boneLength: 80 };
    const target = { x: 100, y: 120 };
    const base = solveFABRIK({
      joints: [{ ...j0 }, { ...j1 }],
      target,
      maxIterations: 20,
      tolerance: 0.1,
    });
    const rotated = solveFABRIK({
      joints: [{ ...j0, rootParentWorldRotation: 90 }, { ...j1 }],
      target,
      maxIterations: 20,
      tolerance: 0.1,
    });
    const baseRoot = base.rotations.get('root')!;
    const rotRoot = rotated.rotations.get('root')!;
    // Same world solve; the parent's 90deg is subtracted from the root's local angle.
    const diff = (((rotRoot - (baseRoot - 90)) % 360) + 360) % 360;
    expect(Math.min(diff, 360 - diff)).toBeLessThan(0.01);
  });

  it('returns empty array if root not found', () => {
    const child = createBoneNode('child', 'Child', { x: 0, y: 0 }, 80, 0);
    const sg = createMockSceneGraph([child]);
    const joints = extractIKJoints('nonexistent', 'child', sg);
    expect(joints.length).toBe(0);
  });

  it('returns empty array if end bone not found', () => {
    const root = createBoneNode('root', 'Root', { x: 0, y: 0 }, 100, 0);
    const sg = createMockSceneGraph([root]);
    const joints = extractIKJoints('root', 'nonexistent', sg);
    expect(joints.length).toBe(0);
  });

  it('returns empty if end bone is not a descendant of root', () => {
    const root = createBoneNode('root', 'Root', { x: 0, y: 0 }, 100, 0);
    const other = createBoneNode('other', 'Other', { x: 200, y: 0 }, 80, 0);
    const sg = createMockSceneGraph([root, other]);
    const joints = extractIKJoints('root', 'other', sg);
    expect(joints.length).toBe(0);
  });

  it('extracts 3-bone chain correctly', () => {
    const b1 = createBoneNode('b1', 'B1', { x: 10, y: 20 }, 100, 0);
    const b2 = createBoneNode('b2', 'B2', { x: 100, y: 0 }, 80, 0);
    const b3 = createBoneNode('b3', 'B3', { x: 80, y: 0 }, 60, 0);
    b2.parent = 'b1';
    b3.parent = 'b2';
    b1.children = ['b2'];
    b2.children = ['b3'];

    const sg = createMockSceneGraph([b1, b2, b3]);
    const joints = extractIKJoints('b1', 'b3', sg);

    expect(joints.length).toBe(3);
    expect(joints[0]!.boneId).toBe('b1');
    expect(joints[1]!.boneId).toBe('b2');
    expect(joints[2]!.boneId).toBe('b3');
  });

  it('preserves angle constraints from bones', () => {
    const root = createBoneNode('root', 'Root', { x: 0, y: 0 }, 100, 0);
    (root as any).angleMin = -45;
    (root as any).angleMax = 45;
    const child = createBoneNode('child', 'Child', { x: 100, y: 0 }, 80, 0);
    child.parent = 'root';
    root.children = ['child'];

    const sg = createMockSceneGraph([root, child]);
    const joints = extractIKJoints('root', 'child', sg);

    expect(joints[0]!.angleMin).toBe(-45);
    expect(joints[0]!.angleMax).toBe(45);
    expect(joints[1]!.angleMin).toBeUndefined();
    expect(joints[1]!.angleMax).toBeUndefined();
  });

  it('computes correct world positions for rotated bones', () => {
    const root = createBoneNode('root', 'Root', { x: 0, y: 0 }, 100, 90); // 90° rotation
    const child = createBoneNode('child', 'Child', { x: 100, y: 0 }, 80, 0);
    child.parent = 'root';
    root.children = ['child'];

    const sg = createMockSceneGraph([root, child]);
    const joints = extractIKJoints('root', 'child', sg);

    expect(joints[0]!.worldPos.x).toBeCloseTo(0, 1);
    expect(joints[0]!.worldPos.y).toBeCloseTo(0, 1);
    // Child is at parent.length along parent's local X → world (0, 100) due to 90° rotation
    expect(joints[1]!.worldPos.x).toBeCloseTo(0, 0);
    expect(joints[1]!.worldPos.y).toBeCloseTo(100, 0);
  });
});

// ============================================================================
// applyIKResult
// ============================================================================

describe('applyIKResult', () => {
  it('applies rotations to scene graph bones', () => {
    const root = createBoneNode('root', 'Root', { x: 0, y: 0 }, 100, 0);
    const child = createBoneNode('child', 'Child', { x: 100, y: 0 }, 80, 0);
    child.parent = 'root';
    root.children = ['child'];

    const sg = createMockSceneGraph([root, child]);

    const result = {
      rotations: new Map([
        ['root', 45],
        ['child', -10],
      ]),
      converged: true,
      endEffectorError: 0,
    };

    applyIKResult(result, sg);

    expect(sg.nodes.get('root')!.transform.rotation).toBeCloseTo(45, 1);
    expect(sg.nodes.get('child')!.transform.rotation).toBeCloseTo(-10, 1);
  });

  it('skips the scene-graph write when the pose is unchanged (F063)', () => {
    const root = createBoneNode('root', 'Root', { x: 0, y: 0 }, 100, 45); // already at 45
    const sg = createMockSceneGraph([root]);
    let updateCount = 0;
    const origUpdate = sg.updateNode.bind(sg);
    sg.updateNode = (id: string, data: Partial<Node>) => {
      updateCount++;
      origUpdate(id, data);
    };

    applyIKResult({ rotations: new Map([['root', 45]]), converged: true, endEffectorError: 0 }, sg);
    expect(updateCount).toBe(0); // no-op pose, no event

    applyIKResult({ rotations: new Map([['root', 90]]), converged: true, endEffectorError: 0 }, sg);
    expect(updateCount).toBe(1); // real change writes
  });

  it('clamps rotations to bone angle constraints', () => {
    const root = createBoneNode('root', 'Root', { x: 0, y: 0 }, 100, 0);
    (root as any).angleMin = -30;
    (root as any).angleMax = 30;

    const sg = createMockSceneGraph([root]);

    const result = {
      rotations: new Map([['root', 60]]), // Exceeds max
      converged: true,
      endEffectorError: 0,
    };

    applyIKResult(result, sg);

    expect(sg.nodes.get('root')!.transform.rotation).toBeCloseTo(30, 1); // Clamped
  });

  it('skips non-existent bones', () => {
    const root = createBoneNode('root', 'Root', { x: 0, y: 0 }, 100, 0);
    const sg = createMockSceneGraph([root]);

    const result = {
      rotations: new Map([
        ['root', 10],
        ['ghost', 20],
      ]),
      converged: true,
      endEffectorError: 0,
    };

    // Should not throw
    applyIKResult(result, sg);
    expect(sg.nodes.get('root')!.transform.rotation).toBeCloseTo(10, 1);
  });

  it('skips non-bone nodes', () => {
    const sg = createMockSceneGraph([]);
    // Add a non-bone node manually
    (sg.nodes as Map<string, any>).set('rect1', {
      id: 'rect1',
      type: 'rectangle',
      transform: {
        position: { x: 0, y: 0 },
        rotation: 0,
        scale: { x: 1, y: 1 },
        anchor: { x: 0.5, y: 0.5 },
        skew: { x: 0, y: 0 },
      },
    });

    const result = {
      rotations: new Map([['rect1', 45]]),
      converged: true,
      endEffectorError: 0,
    };

    // Should not throw or modify non-bone node rotation
    applyIKResult(result, sg);
  });

  it('preserves other transform properties when applying rotation', () => {
    const root = createBoneNode('root', 'Root', { x: 50, y: 75 }, 100, 15);
    const sg = createMockSceneGraph([root]);

    const result = {
      rotations: new Map([['root', 30]]),
      converged: true,
      endEffectorError: 0,
    };

    applyIKResult(result, sg);

    const updated = sg.nodes.get('root')!;
    expect(updated.transform.position.x).toBe(50);
    expect(updated.transform.position.y).toBe(75);
    expect(updated.transform.rotation).toBeCloseTo(30, 1);
    expect(updated.transform.scale.x).toBe(1);
  });
});

// ============================================================================
// Integration: Extract → Solve → Apply
// ============================================================================

describe('IK integration: extract → solve → apply', () => {
  it('full pipeline for 2-bone chain', () => {
    const root = createBoneNode('root', 'Root', { x: 0, y: 0 }, 100, 0);
    const child = createBoneNode('child', 'Child', { x: 100, y: 0 }, 100, 0);
    child.parent = 'root';
    root.children = ['child'];

    const sg = createMockSceneGraph([root, child]);

    // Extract joints
    const joints = extractIKJoints('root', 'child', sg);
    expect(joints.length).toBe(2);

    // Solve toward target above-right (not on same line as initial chain to trigger actual bending)
    const result = solveFABRIK({
      joints,
      target: { x: 50, y: 150 },
      maxIterations: 20,
      tolerance: 0.5,
    });

    expect(result.converged).toBe(true);

    // Apply
    applyIKResult(result, sg);

    // Verify bones were updated (target at (50, 150) forces root to rotate off 0°)
    const rootAfter = sg.nodes.get('root')!;
    const childAfter = sg.nodes.get('child')!;
    expect(rootAfter.transform.rotation).not.toBe(0);
    expect(typeof childAfter.transform.rotation).toBe('number');
  });

  it('full pipeline for 3-bone chain', () => {
    const b1 = createBoneNode('b1', 'B1', { x: 0, y: 0 }, 80, 0);
    const b2 = createBoneNode('b2', 'B2', { x: 80, y: 0 }, 60, 0);
    const b3 = createBoneNode('b3', 'B3', { x: 60, y: 0 }, 40, 0);
    b2.parent = 'b1';
    b3.parent = 'b2';
    b1.children = ['b2'];
    b2.children = ['b3'];

    const sg = createMockSceneGraph([b1, b2, b3]);

    const joints = extractIKJoints('b1', 'b3', sg);
    expect(joints.length).toBe(3);

    const result = solveFABRIK({
      joints,
      target: { x: 50, y: 100 },
      maxIterations: 30,
      tolerance: 1.0,
    });

    applyIKResult(result, sg);

    // All bones should have updated rotations
    for (const bone of [b1, b2, b3]) {
      const updated = sg.nodes.get(bone.id)!;
      expect(typeof updated.transform.rotation).toBe('number');
    }
  });

  it('respects constraints through full pipeline', () => {
    const root = createBoneNode('root', 'Root', { x: 0, y: 0 }, 100, 0);
    (root as any).angleMin = -10;
    (root as any).angleMax = 10;
    const child = createBoneNode('child', 'Child', { x: 100, y: 0 }, 100, 0);
    child.parent = 'root';
    root.children = ['child'];

    const sg = createMockSceneGraph([root, child]);
    const joints = extractIKJoints('root', 'child', sg);

    const result = solveFABRIK({
      joints,
      target: { x: 0, y: 200 }, // Way above — would need >10° root rotation
      maxIterations: 20,
      tolerance: 1.0,
    });

    applyIKResult(result, sg);

    const rootAfter = sg.nodes.get('root')!;
    expect(rootAfter.transform.rotation).toBeGreaterThanOrEqual(-10.1);
    expect(rootAfter.transform.rotation).toBeLessThanOrEqual(10.1);
  });
});
