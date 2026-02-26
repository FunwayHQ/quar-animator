/**
 * GPU Skinning for Quar Animator
 * Pure functions for packing vertex data and computing bone matrix uniforms
 * for GPU-based Linear Blend Skinning via vertex shader.
 */

import type { SkinData } from '@quar/types';
import { mul6 } from './cpuSkinning';
import type { AffineTransform2D } from './cpuSkinning';

/** Maximum number of bones supported by the GPU skinning shader */
export const MAX_BONES_GPU = 32;

/**
 * Build a mapping from bone ID strings to sequential integer indices (0, 1, 2...).
 * These indices correspond to the `u_boneMatrices[idx]` uniform array slots in the shader.
 */
export function buildBoneIdToIndex(skinData: SkinData): Map<string, number> {
  const map = new Map<string, number>();
  let idx = 0;
  for (const boneId of Object.keys(skinData.inverseBindMatrices)) {
    if (idx >= MAX_BONES_GPU) break;
    map.set(boneId, idx);
    idx++;
  }
  return map;
}

/**
 * Pack bind-pose vertices with bone indices and weights into an interleaved Float32Array.
 * Layout per vertex: [px, py, boneIdx0, boneIdx1, boneIdx2, boneIdx3, weight0, weight1, weight2, weight3]
 * = 10 floats per vertex, stride = 40 bytes.
 *
 * Vertices beyond skinData.vertices.length get indices=-1 and weights=0 (bind-pose only).
 * Bone IDs not found in boneIdToIndex are skipped (slot stays -1/0).
 */
export function packSkinnedVertices(
  vertices: Float32Array,
  skinData: SkinData,
  boneIdToIndex: Map<string, number>,
  morphOffsets?: Float32Array
): Float32Array {
  const numVertices = vertices.length / 2;
  const packed = new Float32Array(numVertices * 10);

  for (let i = 0; i < numVertices; i++) {
    const base = i * 10;

    // Position (with optional morph offsets applied)
    let px = vertices[i * 2] ?? 0;
    let py = vertices[i * 2 + 1] ?? 0;
    if (morphOffsets && morphOffsets.length === vertices.length) {
      px += morphOffsets[i * 2] ?? 0;
      py += morphOffsets[i * 2 + 1] ?? 0;
    }
    packed[base] = px;
    packed[base + 1] = py;

    // Initialize bone indices to -1 and weights to 0
    packed[base + 2] = -1;
    packed[base + 3] = -1;
    packed[base + 4] = -1;
    packed[base + 5] = -1;
    packed[base + 6] = 0;
    packed[base + 7] = 0;
    packed[base + 8] = 0;
    packed[base + 9] = 0;

    const entry = i < skinData.vertices.length ? skinData.vertices[i] : null;
    if (!entry) continue;

    let slot = 0;
    for (const inf of entry.influences) {
      if (slot >= 4) break;
      const idx = boneIdToIndex.get(inf.boneId);
      if (idx === undefined) continue;
      packed[base + 2 + slot] = idx;
      packed[base + 6 + slot] = inf.weight;
      slot++;
    }
  }

  return packed;
}

/**
 * Convert a 2D affine transform [a,b,c,d,tx,ty] to a column-major 3x3 matrix (9 floats).
 *
 * The affine matrix:
 *   | a  c  tx |
 *   | b  d  ty |
 *   | 0  0  1  |
 *
 * Column-major layout for WebGL uniformMatrix3fv:
 *   [a, b, 0,  c, d, 0,  tx, ty, 1]
 */
function affineToMat3(m: number[]): number[] {
  return [m[0] ?? 0, m[1] ?? 0, 0, m[2] ?? 0, m[3] ?? 0, 0, m[4] ?? 0, m[5] ?? 0, 1];
}

/**
 * Compute bone matrix uniforms for the GPU skinning shader.
 * Returns a Float32Array of maxBones × 9 floats (column-major mat3 values).
 *
 * For each bone: finalMatrix = boneWorldTransform × inverseBindMatrix × meshBindMatrix
 * This matches the CPU skinning formula in deformVertices().
 *
 * Slots for bones not present or beyond maxBones are filled with identity mat3.
 */
export function computeBoneMatrixUniforms(
  skinData: SkinData,
  boneIdToIndex: Map<string, number>,
  boneWorldTransforms: Record<string, AffineTransform2D>,
  maxBones: number = MAX_BONES_GPU
): Float32Array {
  const result = new Float32Array(maxBones * 9);

  // Fill all slots with identity mat3
  for (let i = 0; i < maxBones; i++) {
    const off = i * 9;
    result[off] = 1; // col0.x
    result[off + 4] = 1; // col1.y
    result[off + 8] = 1; // col2.z
  }

  for (const [boneId, idx] of boneIdToIndex) {
    if (idx >= maxBones) continue;

    const boneWorld = boneWorldTransforms[boneId];
    if (!boneWorld) continue;

    const ibm = skinData.inverseBindMatrices[boneId];
    if (!ibm) continue;

    // boneWorld as 6-element array
    const boneM = [boneWorld.a, boneWorld.b, boneWorld.c, boneWorld.d, boneWorld.tx, boneWorld.ty];

    // finalBone = boneWorld × IBM × meshBind
    const boneTimesIBM = mul6(boneM, ibm);
    const finalMatrix = mul6(boneTimesIBM, skinData.meshBindMatrix);

    // Convert to column-major mat3 and store
    const mat3 = affineToMat3(finalMatrix);
    const off = idx * 9;
    for (let j = 0; j < 9; j++) {
      result[off + j] = mat3[j] ?? 0;
    }
  }

  return result;
}
