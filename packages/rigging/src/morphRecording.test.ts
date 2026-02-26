import { describe, it, expect } from 'vitest';
import {
  createMorphTarget,
  applyBrushDisplacement,
  compactMorphOffsets,
  morphOffsetsToDense,
} from './morphRecording';
import type { MorphVertexOffset } from '@quar/types';

// ---------------------------------------------------------------------------
// createMorphTarget
// ---------------------------------------------------------------------------

describe('createMorphTarget', () => {
  it('creates with correct fields', () => {
    const target = createMorphTarget('t1', 'Elbow Fix', 45);
    expect(target.id).toBe('t1');
    expect(target.name).toBe('Elbow Fix');
    expect(target.driverValue).toBe(45);
    expect(target.offsets).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// applyBrushDisplacement
// ---------------------------------------------------------------------------

describe('applyBrushDisplacement', () => {
  // 3 vertices in a line: (0,0), (5,0), (100,0)
  const vertices = new Float32Array([0, 0, 5, 0, 100, 0]);

  it('displaces vertices within radius', () => {
    const result = applyBrushDisplacement([], 0, 0, 10, 1.0, 3, 4, 'constant', vertices);
    // Vertex 0 at (0,0) is at center → should get full displacement
    const v0 = result.find((o) => o.vertexIndex === 0);
    expect(v0).toBeDefined();
    expect(v0!.dx).toBeCloseTo(3);
    expect(v0!.dy).toBeCloseTo(4);

    // Vertex 1 at (5,0) is within radius=10
    const v1 = result.find((o) => o.vertexIndex === 1);
    expect(v1).toBeDefined();
  });

  it('does not displace vertices outside radius', () => {
    const result = applyBrushDisplacement([], 0, 0, 10, 1.0, 3, 4, 'constant', vertices);
    const v2 = result.find((o) => o.vertexIndex === 2);
    expect(v2).toBeUndefined(); // vertex 2 at (100,0) is way outside
  });

  it('applies linear falloff', () => {
    const result = applyBrushDisplacement([], 0, 0, 10, 1.0, 10, 0, 'linear', vertices);
    // Vertex 1 at (5,0) → dist=5, falloff = 1-5/10 = 0.5
    const v1 = result.find((o) => o.vertexIndex === 1);
    expect(v1!.dx).toBeCloseTo(5.0); // 10 * 1.0 * 0.5
  });

  it('applies smooth falloff', () => {
    const result = applyBrushDisplacement([], 0, 0, 10, 1.0, 10, 0, 'smooth', vertices);
    // Vertex 1 at (5,0) → dist=5, t=0.5, smoothstep(0.5) = 0.5*0.5*(3-2*0.5) = 0.5
    const v1 = result.find((o) => o.vertexIndex === 1);
    expect(v1!.dx).toBeCloseTo(5.0); // smoothstep(0.5) ≈ 0.5
  });

  it('accumulates with existing offsets', () => {
    const existing: MorphVertexOffset[] = [{ vertexIndex: 0, dx: 2, dy: 3 }];
    const result = applyBrushDisplacement(existing, 0, 0, 10, 1.0, 1, 1, 'constant', vertices);
    const v0 = result.find((o) => o.vertexIndex === 0);
    expect(v0!.dx).toBeCloseTo(3); // 2 + 1
    expect(v0!.dy).toBeCloseTo(4); // 3 + 1
  });

  it('returns copy when strength is zero', () => {
    const existing: MorphVertexOffset[] = [{ vertexIndex: 0, dx: 5, dy: 5 }];
    const result = applyBrushDisplacement(existing, 0, 0, 10, 0, 10, 10, 'linear', vertices);
    expect(result).toHaveLength(1);
    expect(result[0]!.dx).toBe(5);
  });

  it('handles negative direction (push instead of pull)', () => {
    const result = applyBrushDisplacement([], 0, 0, 10, 1.0, -5, -5, 'constant', vertices);
    const v0 = result.find((o) => o.vertexIndex === 0);
    expect(v0!.dx).toBeCloseTo(-5);
    expect(v0!.dy).toBeCloseTo(-5);
  });
});

// ---------------------------------------------------------------------------
// compactMorphOffsets
// ---------------------------------------------------------------------------

describe('compactMorphOffsets', () => {
  it('removes near-zero offsets', () => {
    const offsets: MorphVertexOffset[] = [
      { vertexIndex: 0, dx: 0.0001, dy: 0.0001 },
      { vertexIndex: 1, dx: 5, dy: 5 },
    ];
    const result = compactMorphOffsets(offsets);
    expect(result).toHaveLength(1);
    expect(result[0]!.vertexIndex).toBe(1);
  });

  it('keeps non-zero offsets', () => {
    const offsets: MorphVertexOffset[] = [{ vertexIndex: 0, dx: 1, dy: 0 }];
    expect(compactMorphOffsets(offsets)).toHaveLength(1);
  });

  it('handles empty array', () => {
    expect(compactMorphOffsets([])).toEqual([]);
  });

  it('respects custom epsilon', () => {
    const offsets: MorphVertexOffset[] = [{ vertexIndex: 0, dx: 0.5, dy: 0 }];
    expect(compactMorphOffsets(offsets, 1.0)).toHaveLength(0);
    expect(compactMorphOffsets(offsets, 0.1)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// morphOffsetsToDense
// ---------------------------------------------------------------------------

describe('morphOffsetsToDense', () => {
  it('converts sparse to dense', () => {
    const offsets: MorphVertexOffset[] = [
      { vertexIndex: 0, dx: 5, dy: 10 },
      { vertexIndex: 2, dx: 3, dy: 4 },
    ];
    const dense = morphOffsetsToDense(offsets, 4);
    expect(dense.length).toBe(8); // 4 vertices * 2
    expect(dense[0]).toBe(5); // vertex 0, dx
    expect(dense[1]).toBe(10); // vertex 0, dy
    expect(dense[2]).toBe(0); // vertex 1, dx (no offset)
    expect(dense[4]).toBe(3); // vertex 2, dx
    expect(dense[5]).toBe(4); // vertex 2, dy
  });

  it('returns zeroes for empty offsets', () => {
    const dense = morphOffsetsToDense([], 3);
    expect(dense.length).toBe(6);
    for (let i = 0; i < dense.length; i++) {
      expect(dense[i]).toBe(0);
    }
  });

  it('ignores out-of-range vertex indices', () => {
    const offsets: MorphVertexOffset[] = [
      { vertexIndex: 10, dx: 99, dy: 99 }, // out of range
      { vertexIndex: -1, dx: 99, dy: 99 }, // negative
    ];
    const dense = morphOffsetsToDense(offsets, 3);
    for (let i = 0; i < dense.length; i++) {
      expect(dense[i]).toBe(0);
    }
  });

  it('round-trips with sparse offsets', () => {
    const offsets: MorphVertexOffset[] = [{ vertexIndex: 1, dx: 7, dy: 8 }];
    const dense = morphOffsetsToDense(offsets, 3);
    expect(dense[2]).toBe(7); // vertex 1, dx
    expect(dense[3]).toBe(8); // vertex 1, dy
  });
});
