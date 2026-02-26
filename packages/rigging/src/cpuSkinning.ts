/**
 * CPU Skinning for Quar Animator
 * Linear Blend Skinning (LBS) on CPU for mesh deformation
 */

import type { SkinData } from '@quar/types';

/** 2D affine transform components */
export interface AffineTransform2D {
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
}

/**
 * Multiply two 2D affine matrices represented as 6-element arrays [a,b,c,d,tx,ty].
 * Returns [a,b,c,d,tx,ty] of the product.
 */
export function mul6(m1: number[], m2: number[]): number[] {
  const a1 = m1[0]!;
  const b1 = m1[1]!;
  const c1 = m1[2]!;
  const d1 = m1[3]!;
  const tx1 = m1[4]!;
  const ty1 = m1[5]!;
  const a2 = m2[0]!;
  const b2 = m2[1]!;
  const c2 = m2[2]!;
  const d2 = m2[3]!;
  const tx2 = m2[4]!;
  const ty2 = m2[5]!;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * tx2 + c1 * ty2 + tx1,
    b1 * tx2 + d1 * ty2 + ty1,
  ];
}

/**
 * Compute the skin matrix for a single bone: boneWorldTransform * inverseBindMatrix
 */
export function computeSkinMatrix(
  boneWorldTransform: AffineTransform2D,
  inverseBindMatrix: number[]
): number[] {
  const boneM = [
    boneWorldTransform.a,
    boneWorldTransform.b,
    boneWorldTransform.c,
    boneWorldTransform.d,
    boneWorldTransform.tx,
    boneWorldTransform.ty,
  ];
  return mul6(boneM, inverseBindMatrix);
}

/**
 * Deform vertices using Linear Blend Skinning (LBS).
 *
 * For each vertex: v' = sum(weight_i * skinMatrix_i * meshBindMatrix * v)
 * where skinMatrix_i = boneWorldTransform_i * inverseBindMatrix_i
 *
 * @param vertices - Source bind-pose vertices (xy pairs, local to mesh)
 * @param skinData - Skin binding data with weights and matrices
 * @param boneWorldTransforms - Current bone world transforms keyed by bone ID
 * @param morphOffsets - Optional dense Float32Array of xy offset pairs to add before skinning
 * @returns Deformed vertices in world space (Float32Array of xy pairs)
 */
export function deformVertices(
  vertices: Float32Array,
  skinData: SkinData,
  boneWorldTransforms: Record<string, AffineTransform2D>,
  morphOffsets?: Float32Array
): Float32Array {
  // Apply morph offsets to bind-pose vertices before skinning
  let sourceVertices = vertices;
  if (morphOffsets && morphOffsets.length === vertices.length) {
    const morphed = new Float32Array(vertices.length);
    for (let i = 0; i < vertices.length; i++) morphed[i] = vertices[i]! + morphOffsets[i]!;
    sourceVertices = morphed;
  }

  const numVertices = sourceVertices.length / 2;
  const result = new Float32Array(sourceVertices.length);

  // Pre-compute full skin matrices: boneWorld * IBM * meshBind
  const skinMatrices: Record<string, number[]> = {};
  for (const boneId of Object.keys(skinData.inverseBindMatrices)) {
    const boneWorld = boneWorldTransforms[boneId];
    if (!boneWorld) continue;
    const ibm = skinData.inverseBindMatrices[boneId]!;
    const boneTimesIBM = computeSkinMatrix(boneWorld, ibm);
    skinMatrices[boneId] = mul6(boneTimesIBM, skinData.meshBindMatrix);
  }

  for (let i = 0; i < numVertices; i++) {
    const vx = sourceVertices[i * 2]!;
    const vy = sourceVertices[i * 2 + 1]!;

    const entry = i < skinData.vertices.length ? skinData.vertices[i] : null;

    if (!entry || entry.influences.length === 0) {
      // No weights — transform through meshBindMatrix only (bind pose in world)
      const m = skinData.meshBindMatrix;
      result[i * 2] = m[0]! * vx + m[2]! * vy + m[4]!;
      result[i * 2 + 1] = m[1]! * vx + m[3]! * vy + m[5]!;
      continue;
    }

    let outX = 0;
    let outY = 0;
    let totalWeight = 0;

    for (const inf of entry.influences) {
      const sm = skinMatrices[inf.boneId];
      if (!sm) continue;

      const w = inf.weight;
      outX += w * (sm[0]! * vx + sm[2]! * vy + sm[4]!);
      outY += w * (sm[1]! * vx + sm[3]! * vy + sm[5]!);
      totalWeight += w;
    }

    if (totalWeight <= 0.001) {
      // Near-zero weight — fallback to bind pose
      const m = skinData.meshBindMatrix;
      result[i * 2] = m[0]! * vx + m[2]! * vy + m[4]!;
      result[i * 2 + 1] = m[1]! * vx + m[3]! * vy + m[5]!;
    } else {
      if (Math.abs(totalWeight - 1.0) > 0.001) {
        // Normalize if weights don't sum to 1
        outX /= totalWeight;
        outY /= totalWeight;
      }
      result[i * 2] = outX;
      result[i * 2 + 1] = outY;
    }
  }

  return result;
}
