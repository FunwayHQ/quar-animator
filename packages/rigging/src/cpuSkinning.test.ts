import { describe, it, expect } from 'vitest';
import type { SkinData } from '@quar/types';
import { deformVertices, computeSkinMatrix } from './cpuSkinning';
import type { AffineTransform2D } from './cpuSkinning';

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
      b1: [1, 0, 0, 1, 0, 0], // identity IBM
    },
    meshBindMatrix: [1, 0, 0, 1, 0, 0], // identity mesh bind
    vertexCount: 2,
    ...overrides,
  };
}

describe('cpuSkinning', () => {
  // --------------------------------------------------------------------------
  // computeSkinMatrix
  // --------------------------------------------------------------------------

  describe('computeSkinMatrix', () => {
    it('multiplies bone transform * IBM correctly', () => {
      const boneWorld = translationTransform(10, 20);
      const ibm = [1, 0, 0, 1, -5, -5]; // translate by (-5,-5)
      const result = computeSkinMatrix(boneWorld, ibm);

      // Expected: translation(10,20) * translation(-5,-5) = translation(5,15)
      expect(result[0]).toBeCloseTo(1);
      expect(result[1]).toBeCloseTo(0);
      expect(result[2]).toBeCloseTo(0);
      expect(result[3]).toBeCloseTo(1);
      expect(result[4]).toBeCloseTo(5);
      expect(result[5]).toBeCloseTo(15);
    });

    it('handles identity matrices', () => {
      const result = computeSkinMatrix(identityTransform(), [1, 0, 0, 1, 0, 0]);
      expect(result).toEqual([1, 0, 0, 1, 0, 0]);
    });
  });

  // --------------------------------------------------------------------------
  // deformVertices
  // --------------------------------------------------------------------------

  describe('deformVertices', () => {
    it('returns original world positions with identity transforms', () => {
      const skinData = createSimpleSkinData();
      const vertices = new Float32Array([10, 20, 30, 40]);
      const boneTransforms: Record<string, AffineTransform2D> = {
        b1: identityTransform(),
      };

      const result = deformVertices(vertices, skinData, boneTransforms);

      // With all identity matrices, output = input
      expect(result[0]).toBeCloseTo(10);
      expect(result[1]).toBeCloseTo(20);
      expect(result[2]).toBeCloseTo(30);
      expect(result[3]).toBeCloseTo(40);
    });

    it('translates vertices with bone translation', () => {
      // Bone was at identity at bind time, now moved to (50, 0)
      const skinData = createSimpleSkinData();
      const vertices = new Float32Array([0, 0, 10, 0]);
      const boneTransforms: Record<string, AffineTransform2D> = {
        b1: translationTransform(50, 0),
      };

      const result = deformVertices(vertices, skinData, boneTransforms);

      // skinMatrix = boneWorld * IBM * meshBind = translate(50,0) * I * I
      // v' = skinMatrix * v = (0+50, 0) and (10+50, 0)
      expect(result[0]).toBeCloseTo(50);
      expect(result[1]).toBeCloseTo(0);
      expect(result[2]).toBeCloseTo(60);
      expect(result[3]).toBeCloseTo(0);
    });

    it('rotates vertices with bone rotation', () => {
      const skinData = createSimpleSkinData();
      const vertices = new Float32Array([10, 0, 0, 10]);
      const boneTransforms: Record<string, AffineTransform2D> = {
        b1: rotationTransform(90),
      };

      const result = deformVertices(vertices, skinData, boneTransforms);

      // 90° rotation: (10,0) → (0,10), (0,10) → (-10,0)
      expect(result[0]).toBeCloseTo(0);
      expect(result[1]).toBeCloseTo(10);
      expect(result[2]).toBeCloseTo(-10);
      expect(result[3]).toBeCloseTo(0);
    });

    it('blends vertices with partial weights between two bones', () => {
      const skinData: SkinData = {
        vertices: [
          {
            influences: [
              { boneId: 'b1', weight: 0.5 },
              { boneId: 'b2', weight: 0.5 },
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

      const vertices = new Float32Array([0, 0]);
      const boneTransforms: Record<string, AffineTransform2D> = {
        b1: translationTransform(100, 0),
        b2: translationTransform(0, 100),
      };

      const result = deformVertices(vertices, skinData, boneTransforms);

      // 50% bone1 (100,0) + 50% bone2 (0,100) = (50, 50)
      expect(result[0]).toBeCloseTo(50);
      expect(result[1]).toBeCloseTo(50);
    });

    it('returns bind-pose positions for vertices with no weights', () => {
      const skinData: SkinData = {
        vertices: [{ influences: [] }],
        inverseBindMatrices: { b1: [1, 0, 0, 1, 0, 0] },
        meshBindMatrix: [1, 0, 0, 1, 25, 30],
        vertexCount: 1,
      };

      const vertices = new Float32Array([5, 10]);
      const boneTransforms: Record<string, AffineTransform2D> = {
        b1: identityTransform(),
      };

      const result = deformVertices(vertices, skinData, boneTransforms);

      // No weights → meshBindMatrix * vertex = (5+25, 10+30) = (30, 40)
      expect(result[0]).toBeCloseTo(30);
      expect(result[1]).toBeCloseTo(40);
    });

    it('handles mesh bind matrix translation', () => {
      // Mesh was at position (100, 50) at bind time
      const skinData: SkinData = {
        vertices: [{ influences: [{ boneId: 'b1', weight: 1.0 }] }],
        inverseBindMatrices: {
          b1: [1, 0, 0, 1, -100, -50], // IBM of bone at (100, 50) at bind time
        },
        meshBindMatrix: [1, 0, 0, 1, 100, 50],
        vertexCount: 1,
      };

      const vertices = new Float32Array([0, 0]); // Local origin of mesh

      // Bone hasn't moved from bind pose
      const boneTransforms: Record<string, AffineTransform2D> = {
        b1: translationTransform(100, 50),
      };

      const result = deformVertices(vertices, skinData, boneTransforms);

      // Should be at mesh world position: (100, 50)
      expect(result[0]).toBeCloseTo(100);
      expect(result[1]).toBeCloseTo(50);
    });

    it('multi-bone blending produces interpolated result', () => {
      const skinData: SkinData = {
        vertices: [
          {
            influences: [
              { boneId: 'b1', weight: 0.75 },
              { boneId: 'b2', weight: 0.25 },
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

      const vertices = new Float32Array([0, 0]);
      const boneTransforms: Record<string, AffineTransform2D> = {
        b1: translationTransform(100, 0),
        b2: translationTransform(0, 100),
      };

      const result = deformVertices(vertices, skinData, boneTransforms);

      // 75% (100,0) + 25% (0,100) = (75, 25)
      expect(result[0]).toBeCloseTo(75);
      expect(result[1]).toBeCloseTo(25);
    });

    it('deforms a 4-vertex image quad with bone translation', () => {
      // Simulates an image node: 4 vertices forming a quad [BL, BR, TL, TR]
      const skinData: SkinData = {
        vertices: [
          { influences: [{ boneId: 'b1', weight: 1.0 }] },
          { influences: [{ boneId: 'b1', weight: 1.0 }] },
          { influences: [{ boneId: 'b1', weight: 1.0 }] },
          { influences: [{ boneId: 'b1', weight: 1.0 }] },
        ],
        inverseBindMatrices: { b1: [1, 0, 0, 1, 0, 0] },
        meshBindMatrix: [1, 0, 0, 1, 0, 0],
        vertexCount: 4,
      };

      // Image quad: BL(-50,-50), BR(50,-50), TL(-50,50), TR(50,50)
      const vertices = new Float32Array([-50, -50, 50, -50, -50, 50, 50, 50]);
      const boneTransforms: Record<string, AffineTransform2D> = {
        b1: translationTransform(30, 20),
      };

      const result = deformVertices(vertices, skinData, boneTransforms);

      // All vertices shifted by (30, 20)
      expect(result[0]).toBeCloseTo(-20); // BL x
      expect(result[1]).toBeCloseTo(-30); // BL y
      expect(result[2]).toBeCloseTo(80); // BR x
      expect(result[3]).toBeCloseTo(-30); // BR y
      expect(result[4]).toBeCloseTo(-20); // TL x
      expect(result[5]).toBeCloseTo(70); // TL y
      expect(result[6]).toBeCloseTo(80); // TR x
      expect(result[7]).toBeCloseTo(70); // TR y
    });

    it('deforms a 4-vertex image quad with two-bone split weights', () => {
      // Left two vertices bound to bone1, right two to bone2
      const skinData: SkinData = {
        vertices: [
          { influences: [{ boneId: 'b1', weight: 1.0 }] }, // BL
          { influences: [{ boneId: 'b2', weight: 1.0 }] }, // BR
          { influences: [{ boneId: 'b1', weight: 1.0 }] }, // TL
          { influences: [{ boneId: 'b2', weight: 1.0 }] }, // TR
        ],
        inverseBindMatrices: {
          b1: [1, 0, 0, 1, 0, 0],
          b2: [1, 0, 0, 1, 0, 0],
        },
        meshBindMatrix: [1, 0, 0, 1, 0, 0],
        vertexCount: 4,
      };

      const vertices = new Float32Array([-50, -50, 50, -50, -50, 50, 50, 50]);
      const boneTransforms: Record<string, AffineTransform2D> = {
        b1: translationTransform(0, 0), // bone1 stays in place
        b2: translationTransform(20, 0), // bone2 moves right by 20
      };

      const result = deformVertices(vertices, skinData, boneTransforms);

      // Left vertices (bone1) unchanged
      expect(result[0]).toBeCloseTo(-50);
      expect(result[1]).toBeCloseTo(-50);
      expect(result[4]).toBeCloseTo(-50);
      expect(result[5]).toBeCloseTo(50);
      // Right vertices (bone2) shifted right by 20
      expect(result[2]).toBeCloseTo(70);
      expect(result[3]).toBeCloseTo(-50);
      expect(result[6]).toBeCloseTo(70);
      expect(result[7]).toBeCloseTo(50);
    });

    it('deforms a 4-vertex image quad with rotation', () => {
      const skinData: SkinData = {
        vertices: [
          { influences: [{ boneId: 'b1', weight: 1.0 }] },
          { influences: [{ boneId: 'b1', weight: 1.0 }] },
          { influences: [{ boneId: 'b1', weight: 1.0 }] },
          { influences: [{ boneId: 'b1', weight: 1.0 }] },
        ],
        inverseBindMatrices: { b1: [1, 0, 0, 1, 0, 0] },
        meshBindMatrix: [1, 0, 0, 1, 0, 0],
        vertexCount: 4,
      };

      // Simple quad: unit square at origin
      const vertices = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);
      const boneTransforms: Record<string, AffineTransform2D> = {
        b1: rotationTransform(90),
      };

      const result = deformVertices(vertices, skinData, boneTransforms);

      // 90° rotation: (x,y) → (-y, x)
      expect(result[0]).toBeCloseTo(0); // (0,0) → (0,0)
      expect(result[1]).toBeCloseTo(0);
      expect(result[2]).toBeCloseTo(0); // (1,0) → (0,1)
      expect(result[3]).toBeCloseTo(1);
      expect(result[4]).toBeCloseTo(-1); // (0,1) → (-1,0)
      expect(result[5]).toBeCloseTo(0);
      expect(result[6]).toBeCloseTo(-1); // (1,1) → (-1,1)
      expect(result[7]).toBeCloseTo(1);
    });
  });
});
