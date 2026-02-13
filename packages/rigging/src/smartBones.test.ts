import { describe, it, expect } from 'vitest';
import {
  readDriverValue,
  computeBlendWeight,
  interpolateMorphOffsets,
  evaluateSmartBoneAction,
  evaluateSmartBones,
  applyMorphOffsets,
  type SmartBoneSceneGraph,
} from './smartBones';
import type { SmartBoneAction, MorphVertexOffset } from '@quar/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSG(nodes: Record<string, { type: string; rotation: number }>): SmartBoneSceneGraph {
  return {
    getNode(id: string) {
      const n = nodes[id];
      if (!n) return undefined;
      return { type: n.type, transform: { rotation: n.rotation } };
    },
  };
}

function makeAction(overrides: Partial<SmartBoneAction> = {}): SmartBoneAction {
  return {
    id: 'action-1',
    name: 'Test Action',
    driver: { boneId: 'bone-1', property: 'transform.rotation', rangeMin: 0, rangeMax: 90 },
    targets: [],
    enabled: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// readDriverValue
// ---------------------------------------------------------------------------

describe('readDriverValue', () => {
  it('reads bone rotation', () => {
    const sg = makeSG({ 'bone-1': { type: 'bone', rotation: 45 } });
    expect(readDriverValue({ boneId: 'bone-1', property: 'transform.rotation' }, sg)).toBe(45);
  });

  it('returns null for missing bone', () => {
    const sg = makeSG({});
    expect(readDriverValue({ boneId: 'bone-1', property: 'transform.rotation' }, sg)).toBeNull();
  });

  it('returns null for non-bone node', () => {
    const sg = makeSG({ 'rect-1': { type: 'rectangle', rotation: 30 } });
    expect(readDriverValue({ boneId: 'rect-1', property: 'transform.rotation' }, sg)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// computeBlendWeight
// ---------------------------------------------------------------------------

describe('computeBlendWeight', () => {
  it('returns 0 at rangeMin', () => {
    expect(computeBlendWeight(0, 0, 90)).toBe(0);
  });

  it('returns 1 at rangeMax', () => {
    expect(computeBlendWeight(90, 0, 90)).toBe(1);
  });

  it('returns 0.5 at midpoint', () => {
    expect(computeBlendWeight(45, 0, 90)).toBeCloseTo(0.5);
  });

  it('clamps below rangeMin', () => {
    expect(computeBlendWeight(-10, 0, 90)).toBe(0);
  });

  it('clamps above rangeMax', () => {
    expect(computeBlendWeight(100, 0, 90)).toBe(1);
  });

  it('handles inverted range (min > max)', () => {
    // rangeMin=90, rangeMax=0: at value 90 → t=0, at value 0 → t=1
    expect(computeBlendWeight(90, 90, 0)).toBe(0);
    expect(computeBlendWeight(0, 90, 0)).toBe(1);
    expect(computeBlendWeight(45, 90, 0)).toBeCloseTo(0.5);
  });

  it('handles equal range', () => {
    expect(computeBlendWeight(45, 45, 45)).toBe(1);
    expect(computeBlendWeight(44, 45, 45)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// interpolateMorphOffsets
// ---------------------------------------------------------------------------

describe('interpolateMorphOffsets', () => {
  it('returns A at t=0', () => {
    const a: MorphVertexOffset[] = [{ vertexIndex: 0, dx: 10, dy: 20 }];
    const b: MorphVertexOffset[] = [{ vertexIndex: 0, dx: 30, dy: 40 }];
    const result = interpolateMorphOffsets(a, b, 0);
    expect(result).toHaveLength(1);
    expect(result[0].dx).toBe(10);
    expect(result[0].dy).toBe(20);
  });

  it('returns B at t=1', () => {
    const a: MorphVertexOffset[] = [{ vertexIndex: 0, dx: 10, dy: 20 }];
    const b: MorphVertexOffset[] = [{ vertexIndex: 0, dx: 30, dy: 40 }];
    const result = interpolateMorphOffsets(a, b, 1);
    expect(result).toHaveLength(1);
    expect(result[0].dx).toBe(30);
    expect(result[0].dy).toBe(40);
  });

  it('interpolates at t=0.5', () => {
    const a: MorphVertexOffset[] = [{ vertexIndex: 0, dx: 0, dy: 0 }];
    const b: MorphVertexOffset[] = [{ vertexIndex: 0, dx: 10, dy: 20 }];
    const result = interpolateMorphOffsets(a, b, 0.5);
    expect(result[0].dx).toBeCloseTo(5);
    expect(result[0].dy).toBeCloseTo(10);
  });

  it('handles partial overlap (vertex only in A)', () => {
    const a: MorphVertexOffset[] = [{ vertexIndex: 0, dx: 10, dy: 10 }];
    const b: MorphVertexOffset[] = [{ vertexIndex: 1, dx: 20, dy: 20 }];
    const result = interpolateMorphOffsets(a, b, 0.5);
    expect(result).toHaveLength(2);
    const v0 = result.find((r) => r.vertexIndex === 0)!;
    const v1 = result.find((r) => r.vertexIndex === 1)!;
    expect(v0.dx).toBeCloseTo(5); // 10 → 0 at t=0.5
    expect(v1.dx).toBeCloseTo(10); // 0 → 20 at t=0.5
  });

  it('handles empty arrays', () => {
    expect(interpolateMorphOffsets([], [], 0.5)).toEqual([]);
  });

  it('handles boundary t < 0', () => {
    const a: MorphVertexOffset[] = [{ vertexIndex: 0, dx: 5, dy: 5 }];
    const b: MorphVertexOffset[] = [{ vertexIndex: 0, dx: 15, dy: 15 }];
    const result = interpolateMorphOffsets(a, b, -1);
    expect(result[0].dx).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// evaluateSmartBoneAction
// ---------------------------------------------------------------------------

describe('evaluateSmartBoneAction', () => {
  const nodeVertexCounts = new Map<string, number>([['mesh-1', 4]]);

  it('returns null when disabled', () => {
    const action = makeAction({ enabled: false });
    const sg = makeSG({ 'bone-1': { type: 'bone', rotation: 45 } });
    expect(evaluateSmartBoneAction(action, sg, nodeVertexCounts)).toBeNull();
  });

  it('returns null when no targets', () => {
    const action = makeAction({ targets: [] });
    const sg = makeSG({ 'bone-1': { type: 'bone', rotation: 45 } });
    expect(evaluateSmartBoneAction(action, sg, nodeVertexCounts)).toBeNull();
  });

  it('returns null when bone missing', () => {
    const action = makeAction({
      targets: [
        {
          id: 't1',
          name: 'Target 1',
          driverValue: 90,
          offsets: { 'mesh-1': [{ vertexIndex: 0, dx: 5, dy: 5 }] },
        },
      ],
    });
    const sg = makeSG({});
    expect(evaluateSmartBoneAction(action, sg, nodeVertexCounts)).toBeNull();
  });

  it('evaluates single target at full blend', () => {
    const action = makeAction({
      targets: [
        {
          id: 't1',
          name: 'Target 1',
          driverValue: 90,
          offsets: { 'mesh-1': [{ vertexIndex: 0, dx: 10, dy: 20 }] },
        },
      ],
    });
    const sg = makeSG({ 'bone-1': { type: 'bone', rotation: 90 } });
    const result = evaluateSmartBoneAction(action, sg, nodeVertexCounts);
    expect(result).not.toBeNull();
    const offsets = result!.get('mesh-1')!;
    expect(offsets[0]).toBeCloseTo(10); // dx at vertex 0
    expect(offsets[1]).toBeCloseTo(20); // dy at vertex 0
  });

  it('interpolates between two targets', () => {
    const action = makeAction({
      targets: [
        {
          id: 't1',
          name: 'Target at 0',
          driverValue: 0,
          offsets: { 'mesh-1': [{ vertexIndex: 0, dx: 0, dy: 0 }] },
        },
        {
          id: 't2',
          name: 'Target at 90',
          driverValue: 90,
          offsets: { 'mesh-1': [{ vertexIndex: 0, dx: 10, dy: 20 }] },
        },
      ],
    });
    // Bone at 45° → midpoint
    const sg = makeSG({ 'bone-1': { type: 'bone', rotation: 45 } });
    const result = evaluateSmartBoneAction(action, sg, nodeVertexCounts);
    expect(result).not.toBeNull();
    const offsets = result!.get('mesh-1')!;
    expect(offsets[0]).toBeCloseTo(5); // dx interpolated
    expect(offsets[1]).toBeCloseTo(10); // dy interpolated
  });

  it('handles multi-node offsets', () => {
    const vertexCounts = new Map<string, number>([
      ['mesh-1', 3],
      ['mesh-2', 2],
    ]);
    const action = makeAction({
      targets: [
        {
          id: 't1',
          name: 'Target',
          driverValue: 90,
          offsets: {
            'mesh-1': [{ vertexIndex: 1, dx: 5, dy: 5 }],
            'mesh-2': [{ vertexIndex: 0, dx: 3, dy: 3 }],
          },
        },
      ],
    });
    const sg = makeSG({ 'bone-1': { type: 'bone', rotation: 90 } });
    const result = evaluateSmartBoneAction(action, sg, vertexCounts);
    expect(result).not.toBeNull();
    expect(result!.has('mesh-1')).toBe(true);
    expect(result!.has('mesh-2')).toBe(true);
    expect(result!.get('mesh-1')![2]).toBeCloseTo(5); // vertex 1, dx
    expect(result!.get('mesh-2')![0]).toBeCloseTo(3); // vertex 0, dx
  });
});

// ---------------------------------------------------------------------------
// evaluateSmartBones
// ---------------------------------------------------------------------------

describe('evaluateSmartBones', () => {
  const nodeVertexCounts = new Map<string, number>([['mesh-1', 4]]);

  it('returns empty map for no actions', () => {
    const sg = makeSG({});
    const result = evaluateSmartBones([], sg, nodeVertexCounts);
    expect(result.size).toBe(0);
  });

  it('evaluates single action', () => {
    const action = makeAction({
      targets: [
        {
          id: 't1',
          name: 'Target',
          driverValue: 90,
          offsets: { 'mesh-1': [{ vertexIndex: 0, dx: 10, dy: 10 }] },
        },
      ],
    });
    const sg = makeSG({ 'bone-1': { type: 'bone', rotation: 90 } });
    const result = evaluateSmartBones([action], sg, nodeVertexCounts);
    expect(result.has('mesh-1')).toBe(true);
    expect(result.get('mesh-1')![0]).toBeCloseTo(10);
  });

  it('accumulates multiple actions additively', () => {
    const action1 = makeAction({
      id: 'a1',
      targets: [
        {
          id: 't1',
          name: 'T1',
          driverValue: 90,
          offsets: { 'mesh-1': [{ vertexIndex: 0, dx: 5, dy: 0 }] },
        },
      ],
    });
    const action2 = makeAction({
      id: 'a2',
      driver: { boneId: 'bone-2', property: 'transform.rotation', rangeMin: 0, rangeMax: 90 },
      targets: [
        {
          id: 't2',
          name: 'T2',
          driverValue: 90,
          offsets: { 'mesh-1': [{ vertexIndex: 0, dx: 3, dy: 0 }] },
        },
      ],
    });
    const sg = makeSG({
      'bone-1': { type: 'bone', rotation: 90 },
      'bone-2': { type: 'bone', rotation: 90 },
    });
    const result = evaluateSmartBones([action1, action2], sg, nodeVertexCounts);
    expect(result.get('mesh-1')![0]).toBeCloseTo(8); // 5 + 3
  });

  it('handles actions affecting different nodes', () => {
    const vertexCounts = new Map<string, number>([
      ['mesh-1', 2],
      ['mesh-2', 2],
    ]);
    const action1 = makeAction({
      id: 'a1',
      targets: [
        {
          id: 't1',
          name: 'T1',
          driverValue: 90,
          offsets: { 'mesh-1': [{ vertexIndex: 0, dx: 5, dy: 5 }] },
        },
      ],
    });
    const action2 = makeAction({
      id: 'a2',
      driver: { boneId: 'bone-2', property: 'transform.rotation', rangeMin: 0, rangeMax: 90 },
      targets: [
        {
          id: 't2',
          name: 'T2',
          driverValue: 90,
          offsets: { 'mesh-2': [{ vertexIndex: 0, dx: 3, dy: 3 }] },
        },
      ],
    });
    const sg = makeSG({
      'bone-1': { type: 'bone', rotation: 90 },
      'bone-2': { type: 'bone', rotation: 90 },
    });
    const result = evaluateSmartBones([action1, action2], sg, vertexCounts);
    expect(result.has('mesh-1')).toBe(true);
    expect(result.has('mesh-2')).toBe(true);
  });

  it('skips disabled actions', () => {
    const action = makeAction({
      enabled: false,
      targets: [
        {
          id: 't1',
          name: 'T1',
          driverValue: 90,
          offsets: { 'mesh-1': [{ vertexIndex: 0, dx: 10, dy: 10 }] },
        },
      ],
    });
    const sg = makeSG({ 'bone-1': { type: 'bone', rotation: 90 } });
    const result = evaluateSmartBones([action], sg, nodeVertexCounts);
    expect(result.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// applyMorphOffsets
// ---------------------------------------------------------------------------

describe('applyMorphOffsets', () => {
  it('adds offsets to vertices', () => {
    const verts = new Float32Array([10, 20, 30, 40]);
    const offsets = new Float32Array([1, 2, 3, 4]);
    const result = applyMorphOffsets(verts, offsets);
    expect(result[0]).toBe(11);
    expect(result[1]).toBe(22);
    expect(result[2]).toBe(33);
    expect(result[3]).toBe(44);
  });

  it('returns original vertices when offsets are null', () => {
    const verts = new Float32Array([10, 20]);
    expect(applyMorphOffsets(verts, null)).toBe(verts);
  });

  it('returns original vertices when length mismatch', () => {
    const verts = new Float32Array([10, 20, 30, 40]);
    const offsets = new Float32Array([1, 2]); // too short
    expect(applyMorphOffsets(verts, offsets)).toBe(verts);
  });
});
