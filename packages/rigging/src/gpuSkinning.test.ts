import { describe, it, expect } from 'vitest';
import type { SkinData } from '@quar/types';
import {
  MAX_BONES_GPU,
  buildBoneIdToIndex,
  packSkinnedVertices,
  computeBoneMatrixUniforms,
} from './gpuSkinning';
import { mul6, deformVertices } from './cpuSkinning';
import type { AffineTransform2D } from './cpuSkinning';

// Helpers
function identityTransform(): AffineTransform2D {
  return { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
}

function translationTransform(tx: number, ty: number): AffineTransform2D {
  return { a: 1, b: 0, c: 0, d: 1, tx, ty };
}

function rotationTransform(degrees: number, tx = 0, ty = 0): AffineTransform2D {
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { a: cos, b: sin, c: -sin, d: cos, tx, ty };
}

function createSimpleSkinData(overrides?: Partial<SkinData>): SkinData {
  return {
    vertices: [
      { influences: [{ boneId: 'b1', weight: 1.0 }] },
      { influences: [{ boneId: 'b1', weight: 1.0 }] },
    ],
    inverseBindMatrices: {
      b1: [1, 0, 0, 1, 0, 0],
    },
    meshBindMatrix: [1, 0, 0, 1, 0, 0],
    vertexCount: 2,
    ...overrides,
  };
}

// Simulate GPU skinning math: skinned = Σ(w * M[idx] * pos)
function simulateGPUSkinning(
  px: number,
  py: number,
  boneIndices: number[],
  boneWeights: number[],
  boneMatrices: Float32Array
): [number, number] {
  let sx = 0,
    sy = 0,
    totalWeight = 0;
  for (let i = 0; i < 4; i++) {
    const w = boneWeights[i];
    if (w <= 0) continue;
    const idx = boneIndices[i];
    if (idx < 0 || idx >= MAX_BONES_GPU) continue;
    const off = idx * 9;
    // Column-major mat3: [col0.x, col0.y, 0, col1.x, col1.y, 0, col2.x, col2.y, 1]
    // pos3 = (px, py, 1)
    // result.x = col0.x * px + col1.x * py + col2.x
    // result.y = col0.y * px + col1.y * py + col2.y
    const rx = boneMatrices[off] * px + boneMatrices[off + 3] * py + boneMatrices[off + 6];
    const ry = boneMatrices[off + 1] * px + boneMatrices[off + 4] * py + boneMatrices[off + 7];
    sx += w * rx;
    sy += w * ry;
    totalWeight += w;
  }
  if (totalWeight <= 0) return [px, py];
  if (Math.abs(totalWeight - 1.0) > 0.001) {
    sx /= totalWeight;
    sy /= totalWeight;
  }
  return [sx, sy];
}

describe('gpuSkinning', () => {
  // --------------------------------------------------------------------------
  // mul6
  // --------------------------------------------------------------------------

  describe('mul6', () => {
    it('identity × identity = identity', () => {
      const I = [1, 0, 0, 1, 0, 0];
      const result = mul6(I, I);
      expect(result).toEqual([1, 0, 0, 1, 0, 0]);
    });

    it('translation × translation = combined translation', () => {
      const t1 = [1, 0, 0, 1, 10, 20];
      const t2 = [1, 0, 0, 1, 30, 40];
      const result = mul6(t1, t2);
      expect(result[4]).toBeCloseTo(40);
      expect(result[5]).toBeCloseTo(60);
    });

    it('rotation × translation = correct affine product', () => {
      const rad = Math.PI / 2;
      const rot = [Math.cos(rad), Math.sin(rad), -Math.sin(rad), Math.cos(rad), 0, 0];
      const trans = [1, 0, 0, 1, 10, 0];
      const result = mul6(rot, trans);
      // Rotation by 90° of translation (10,0) → translation should become (0,10) part
      expect(result[4]).toBeCloseTo(0);
      expect(result[5]).toBeCloseTo(10);
    });
  });

  // --------------------------------------------------------------------------
  // buildBoneIdToIndex
  // --------------------------------------------------------------------------

  describe('buildBoneIdToIndex', () => {
    it('maps bone IDs to sequential indices', () => {
      const skinData = createSimpleSkinData({
        inverseBindMatrices: {
          boneA: [1, 0, 0, 1, 0, 0],
          boneB: [1, 0, 0, 1, 0, 0],
          boneC: [1, 0, 0, 1, 0, 0],
        },
      });
      const map = buildBoneIdToIndex(skinData);
      expect(map.size).toBe(3);
      const values = [...map.values()].sort();
      expect(values).toEqual([0, 1, 2]);
    });

    it('returns empty map for SkinData with no inverseBindMatrices', () => {
      const skinData = createSimpleSkinData({
        inverseBindMatrices: {},
      });
      const map = buildBoneIdToIndex(skinData);
      expect(map.size).toBe(0);
    });

    it('deterministic ordering matches Object.keys', () => {
      const ibm: Record<string, number[]> = {};
      for (let i = 0; i < 5; i++) {
        ibm[`bone_${i}`] = [1, 0, 0, 1, 0, 0];
      }
      const skinData = createSimpleSkinData({ inverseBindMatrices: ibm });
      const map = buildBoneIdToIndex(skinData);
      const keys = Object.keys(ibm);
      for (let i = 0; i < keys.length; i++) {
        expect(map.get(keys[i])).toBe(i);
      }
    });
  });

  // --------------------------------------------------------------------------
  // packSkinnedVertices
  // --------------------------------------------------------------------------

  describe('packSkinnedVertices', () => {
    it('correct interleaved layout for single-bone vertex', () => {
      const skinData = createSimpleSkinData();
      const boneIdToIndex = new Map([['b1', 0]]);
      const vertices = new Float32Array([10, 20, 30, 40]);

      const packed = packSkinnedVertices(vertices, skinData, boneIdToIndex);

      // 2 vertices × 10 floats = 20
      expect(packed.length).toBe(20);

      // Vertex 0: [10, 20, 0, -1, -1, -1, 1.0, 0, 0, 0]
      expect(packed[0]).toBe(10); // px
      expect(packed[1]).toBe(20); // py
      expect(packed[2]).toBe(0); // boneIdx0
      expect(packed[3]).toBe(-1); // boneIdx1
      expect(packed[6]).toBeCloseTo(1.0); // weight0
      expect(packed[7]).toBe(0); // weight1
    });

    it('vertex with 1 influence: remaining slots = -1 (indices), 0 (weights)', () => {
      const skinData = createSimpleSkinData();
      const boneIdToIndex = new Map([['b1', 0]]);
      const vertices = new Float32Array([5, 10, 15, 20]);

      const packed = packSkinnedVertices(vertices, skinData, boneIdToIndex);

      // Check first vertex remaining slots
      expect(packed[3]).toBe(-1); // boneIdx1
      expect(packed[4]).toBe(-1); // boneIdx2
      expect(packed[5]).toBe(-1); // boneIdx3
      expect(packed[7]).toBe(0); // weight1
      expect(packed[8]).toBe(0); // weight2
      expect(packed[9]).toBe(0); // weight3
    });

    it('vertex with 4 influences: all slots filled correctly', () => {
      const skinData: SkinData = {
        vertices: [
          {
            influences: [
              { boneId: 'b1', weight: 0.4 },
              { boneId: 'b2', weight: 0.3 },
              { boneId: 'b3', weight: 0.2 },
              { boneId: 'b4', weight: 0.1 },
            ],
          },
        ],
        inverseBindMatrices: {
          b1: [1, 0, 0, 1, 0, 0],
          b2: [1, 0, 0, 1, 0, 0],
          b3: [1, 0, 0, 1, 0, 0],
          b4: [1, 0, 0, 1, 0, 0],
        },
        meshBindMatrix: [1, 0, 0, 1, 0, 0],
        vertexCount: 1,
      };
      const boneIdToIndex = new Map([
        ['b1', 0],
        ['b2', 1],
        ['b3', 2],
        ['b4', 3],
      ]);
      const vertices = new Float32Array([100, 200]);

      const packed = packSkinnedVertices(vertices, skinData, boneIdToIndex);

      expect(packed[2]).toBe(0); // boneIdx0
      expect(packed[3]).toBe(1); // boneIdx1
      expect(packed[4]).toBe(2); // boneIdx2
      expect(packed[5]).toBe(3); // boneIdx3
      expect(packed[6]).toBeCloseTo(0.4);
      expect(packed[7]).toBeCloseTo(0.3);
      expect(packed[8]).toBeCloseTo(0.2);
      expect(packed[9]).toBeCloseTo(0.1);
    });

    it('vertex with 2 influences: correct partial packing', () => {
      const skinData: SkinData = {
        vertices: [
          {
            influences: [
              { boneId: 'b1', weight: 0.6 },
              { boneId: 'b2', weight: 0.4 },
            ],
          },
        ],
        inverseBindMatrices: {
          b1: [1, 0, 0, 1, 0, 0],
          b2: [1, 0, 0, 1, 0, 0],
        },
        meshBindMatrix: [1, 0, 0, 1, 0, 0],
        vertexCount: 1,
      };
      const boneIdToIndex = new Map([
        ['b1', 0],
        ['b2', 1],
      ]);
      const vertices = new Float32Array([50, 60]);

      const packed = packSkinnedVertices(vertices, skinData, boneIdToIndex);

      expect(packed[2]).toBe(0); // boneIdx0
      expect(packed[3]).toBe(1); // boneIdx1
      expect(packed[4]).toBe(-1); // boneIdx2 (unused)
      expect(packed[5]).toBe(-1); // boneIdx3 (unused)
      expect(packed[6]).toBeCloseTo(0.6);
      expect(packed[7]).toBeCloseTo(0.4);
      expect(packed[8]).toBe(0);
      expect(packed[9]).toBe(0);
    });

    it('vertices beyond skinData.vertices.length: indices=-1, weights=0', () => {
      const skinData = createSimpleSkinData(); // 2 vertex entries
      const boneIdToIndex = new Map([['b1', 0]]);
      // 3 vertices — third is beyond skinData.vertices.length
      const vertices = new Float32Array([0, 0, 10, 10, 20, 20]);

      const packed = packSkinnedVertices(vertices, skinData, boneIdToIndex);

      // Third vertex (index 2) should have all -1 indices and 0 weights
      const base = 2 * 10;
      expect(packed[base]).toBe(20); // px
      expect(packed[base + 1]).toBe(20); // py
      expect(packed[base + 2]).toBe(-1);
      expect(packed[base + 3]).toBe(-1);
      expect(packed[base + 4]).toBe(-1);
      expect(packed[base + 5]).toBe(-1);
      expect(packed[base + 6]).toBe(0);
      expect(packed[base + 7]).toBe(0);
    });

    it('bone ID not in boneIdToIndex is skipped', () => {
      const skinData: SkinData = {
        vertices: [
          {
            influences: [
              { boneId: 'unknown_bone', weight: 0.5 },
              { boneId: 'b1', weight: 0.5 },
            ],
          },
        ],
        inverseBindMatrices: {
          b1: [1, 0, 0, 1, 0, 0],
          unknown_bone: [1, 0, 0, 1, 0, 0],
        },
        meshBindMatrix: [1, 0, 0, 1, 0, 0],
        vertexCount: 1,
      };
      // Only b1 is in the map — unknown_bone is skipped
      const boneIdToIndex = new Map([['b1', 0]]);
      const vertices = new Float32Array([5, 10]);

      const packed = packSkinnedVertices(vertices, skinData, boneIdToIndex);

      // Only slot 0 should be filled (b1), unknown_bone skipped
      expect(packed[2]).toBe(0); // boneIdx0 = b1's index
      expect(packed[3]).toBe(-1); // boneIdx1 (unknown_bone skipped)
      expect(packed[6]).toBeCloseTo(0.5); // b1 weight
      expect(packed[7]).toBe(0); // no second weight
    });
  });

  // --------------------------------------------------------------------------
  // computeBoneMatrixUniforms
  // --------------------------------------------------------------------------

  describe('computeBoneMatrixUniforms', () => {
    it('all-identity transforms produce identity mat3s', () => {
      const skinData = createSimpleSkinData();
      const boneIdToIndex = new Map([['b1', 0]]);
      const boneWorldTransforms: Record<string, AffineTransform2D> = {
        b1: identityTransform(),
      };

      const result = computeBoneMatrixUniforms(skinData, boneIdToIndex, boneWorldTransforms);

      // Identity mat3 column-major: [1,0,0, 0,1,0, 0,0,1]
      expect(result[0]).toBeCloseTo(1);
      expect(result[1]).toBeCloseTo(0);
      expect(result[2]).toBeCloseTo(0);
      expect(result[3]).toBeCloseTo(0);
      expect(result[4]).toBeCloseTo(1);
      expect(result[5]).toBeCloseTo(0);
      expect(result[6]).toBeCloseTo(0);
      expect(result[7]).toBeCloseTo(0);
      expect(result[8]).toBeCloseTo(1);
    });

    it('translation-only bone: correct column-major mat3 encoding', () => {
      const skinData = createSimpleSkinData();
      const boneIdToIndex = new Map([['b1', 0]]);
      const boneWorldTransforms: Record<string, AffineTransform2D> = {
        b1: translationTransform(50, 30),
      };

      const result = computeBoneMatrixUniforms(skinData, boneIdToIndex, boneWorldTransforms);

      // finalMatrix = translate(50,30) × I × I = [1,0,0,1,50,30]
      // col-major mat3: [1, 0, 0,  0, 1, 0,  50, 30, 1]
      expect(result[0]).toBeCloseTo(1);
      expect(result[1]).toBeCloseTo(0);
      expect(result[3]).toBeCloseTo(0);
      expect(result[4]).toBeCloseTo(1);
      expect(result[6]).toBeCloseTo(50);
      expect(result[7]).toBeCloseTo(30);
      expect(result[8]).toBeCloseTo(1);
    });

    it('rotation bone: correct mat3 values', () => {
      const skinData = createSimpleSkinData();
      const boneIdToIndex = new Map([['b1', 0]]);
      const boneWorldTransforms: Record<string, AffineTransform2D> = {
        b1: rotationTransform(90),
      };

      const result = computeBoneMatrixUniforms(skinData, boneIdToIndex, boneWorldTransforms);

      // 90° rotation: a=cos(90)≈0, b=sin(90)≈1, c=-sin(90)≈-1, d=cos(90)≈0
      // Affine [0, 1, -1, 0, 0, 0]
      // Col-major mat3: [0, 1, 0,  -1, 0, 0,  0, 0, 1]
      expect(result[0]).toBeCloseTo(0);
      expect(result[1]).toBeCloseTo(1);
      expect(result[3]).toBeCloseTo(-1);
      expect(result[4]).toBeCloseTo(0);
      expect(result[6]).toBeCloseTo(0);
      expect(result[7]).toBeCloseTo(0);
    });

    it('bone index ≥ maxBones is skipped (slot stays identity)', () => {
      const ibm: Record<string, number[]> = {};
      for (let i = 0; i < 5; i++) ibm[`b${i}`] = [1, 0, 0, 1, 0, 0];

      const skinData = createSimpleSkinData({ inverseBindMatrices: ibm });
      const boneIdToIndex = new Map<string, number>();
      for (let i = 0; i < 5; i++) boneIdToIndex.set(`b${i}`, i);

      const boneWorldTransforms: Record<string, AffineTransform2D> = {};
      for (let i = 0; i < 5; i++) {
        boneWorldTransforms[`b${i}`] = translationTransform(i * 10, 0);
      }

      // Only allow maxBones=3 — bones at index 3,4 should stay identity
      const result = computeBoneMatrixUniforms(skinData, boneIdToIndex, boneWorldTransforms, 3);

      // Slot 0 should have tx=0
      expect(result[6]).toBeCloseTo(0);
      // Slot 1 should have tx=10
      expect(result[1 * 9 + 6]).toBeCloseTo(10);
      // Slot 2 should have tx=20
      expect(result[2 * 9 + 6]).toBeCloseTo(20);
    });

    it('missing bone world transform leaves slot as identity', () => {
      const skinData: SkinData = {
        vertices: [{ influences: [{ boneId: 'b1', weight: 1.0 }] }],
        inverseBindMatrices: {
          b1: [1, 0, 0, 1, 0, 0],
          b2: [1, 0, 0, 1, 0, 0],
        },
        meshBindMatrix: [1, 0, 0, 1, 0, 0],
        vertexCount: 1,
      };
      const boneIdToIndex = new Map([
        ['b1', 0],
        ['b2', 1],
      ]);
      // Only provide transform for b1, not b2
      const boneWorldTransforms: Record<string, AffineTransform2D> = {
        b1: translationTransform(100, 0),
      };

      const result = computeBoneMatrixUniforms(skinData, boneIdToIndex, boneWorldTransforms);

      // Slot 1 (b2) should remain identity
      expect(result[1 * 9 + 0]).toBeCloseTo(1);
      expect(result[1 * 9 + 4]).toBeCloseTo(1);
      expect(result[1 * 9 + 6]).toBeCloseTo(0);
      expect(result[1 * 9 + 7]).toBeCloseTo(0);
    });
  });

  // --------------------------------------------------------------------------
  // GPU vs CPU equivalence
  // --------------------------------------------------------------------------

  describe('GPU vs CPU equivalence', () => {
    it('single bone translation matches deformVertices output', () => {
      const skinData = createSimpleSkinData();
      const boneIdToIndex = new Map([['b1', 0]]);
      const boneWorldTransforms: Record<string, AffineTransform2D> = {
        b1: translationTransform(50, 30),
      };

      const vertices = new Float32Array([10, 20, 30, 40]);

      // CPU result
      const cpuResult = deformVertices(vertices, skinData, boneWorldTransforms);

      // GPU simulation
      const boneMatrices = computeBoneMatrixUniforms(skinData, boneIdToIndex, boneWorldTransforms);
      const packed = packSkinnedVertices(vertices, skinData, boneIdToIndex);

      for (let i = 0; i < 2; i++) {
        const base = i * 10;
        const px = packed[base];
        const py = packed[base + 1];
        const bi = [packed[base + 2], packed[base + 3], packed[base + 4], packed[base + 5]];
        const bw = [packed[base + 6], packed[base + 7], packed[base + 8], packed[base + 9]];

        const [gx, gy] = simulateGPUSkinning(px, py, bi, bw, boneMatrices);

        expect(gx).toBeCloseTo(cpuResult[i * 2], 4);
        expect(gy).toBeCloseTo(cpuResult[i * 2 + 1], 4);
      }
    });

    it('two-bone blended vertex matches deformVertices output', () => {
      const skinData: SkinData = {
        vertices: [
          {
            influences: [
              { boneId: 'b1', weight: 0.6 },
              { boneId: 'b2', weight: 0.4 },
            ],
          },
        ],
        inverseBindMatrices: {
          b1: [1, 0, 0, 1, 0, 0],
          b2: [1, 0, 0, 1, 0, 0],
        },
        meshBindMatrix: [1, 0, 0, 1, 0, 0],
        vertexCount: 1,
      };
      const boneIdToIndex = new Map([
        ['b1', 0],
        ['b2', 1],
      ]);
      const boneWorldTransforms: Record<string, AffineTransform2D> = {
        b1: translationTransform(100, 0),
        b2: translationTransform(0, 100),
      };

      const vertices = new Float32Array([0, 0]);

      // CPU: 0.6*(100,0) + 0.4*(0,100) = (60, 40)
      const cpuResult = deformVertices(vertices, skinData, boneWorldTransforms);

      // GPU simulation
      const boneMatrices = computeBoneMatrixUniforms(skinData, boneIdToIndex, boneWorldTransforms);
      const packed = packSkinnedVertices(vertices, skinData, boneIdToIndex);

      const base = 0;
      const [gx, gy] = simulateGPUSkinning(
        packed[base],
        packed[base + 1],
        [packed[base + 2], packed[base + 3], packed[base + 4], packed[base + 5]],
        [packed[base + 6], packed[base + 7], packed[base + 8], packed[base + 9]],
        boneMatrices
      );

      expect(gx).toBeCloseTo(cpuResult[0], 4);
      expect(gy).toBeCloseTo(cpuResult[1], 4);
    });

    it('rotation + meshBind transform matches CPU deformVertices', () => {
      const skinData: SkinData = {
        vertices: [{ influences: [{ boneId: 'b1', weight: 1.0 }] }],
        inverseBindMatrices: {
          b1: [1, 0, 0, 1, -50, -25], // Bone was at (50,25) at bind time
        },
        meshBindMatrix: [1, 0, 0, 1, 50, 25], // Mesh was at (50,25)
        vertexCount: 1,
      };
      const boneIdToIndex = new Map([['b1', 0]]);
      const boneWorldTransforms: Record<string, AffineTransform2D> = {
        b1: rotationTransform(45, 50, 25), // Bone rotated 45° around (50,25)
      };

      const vertices = new Float32Array([10, 0]); // Local vertex

      // CPU result
      const cpuResult = deformVertices(vertices, skinData, boneWorldTransforms);

      // GPU simulation
      const boneMatrices = computeBoneMatrixUniforms(skinData, boneIdToIndex, boneWorldTransforms);
      const packed = packSkinnedVertices(vertices, skinData, boneIdToIndex);

      const [gx, gy] = simulateGPUSkinning(
        packed[0],
        packed[1],
        [packed[2], packed[3], packed[4], packed[5]],
        [packed[6], packed[7], packed[8], packed[9]],
        boneMatrices
      );

      expect(gx).toBeCloseTo(cpuResult[0], 3);
      expect(gy).toBeCloseTo(cpuResult[1], 3);
    });
  });
});
