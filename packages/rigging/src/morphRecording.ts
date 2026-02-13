/**
 * Morph Recording Utilities for Quar Animator
 * Functions for creating and manipulating morph targets during recording.
 */

import type { MorphTarget, MorphVertexOffset } from '@quar/types';

/**
 * Create a new empty morph target.
 */
export function createMorphTarget(id: string, name: string, driverValue: number): MorphTarget {
  return {
    id,
    name,
    driverValue,
    offsets: {},
  };
}

/**
 * Falloff function types for brush displacement.
 */
export type FalloffType = 'linear' | 'smooth' | 'constant';

/**
 * Apply brush displacement to morph offsets.
 * Displaces vertices within the brush radius based on a drag direction vector.
 *
 * @param currentOffsets - Existing morph offsets for this node
 * @param worldX - Brush center X in world space
 * @param worldY - Brush center Y in world space
 * @param radius - Brush radius in world units
 * @param strength - Brush strength multiplier (0..1)
 * @param directionX - Displacement direction X (world-space delta)
 * @param directionY - Displacement direction Y (world-space delta)
 * @param falloff - Falloff type: 'linear', 'smooth', or 'constant'
 * @param vertexWorldPositions - Flat Float32Array of xy pairs for all vertices
 * @returns Updated morph offsets array
 */
export function applyBrushDisplacement(
  currentOffsets: MorphVertexOffset[],
  worldX: number,
  worldY: number,
  radius: number,
  strength: number,
  directionX: number,
  directionY: number,
  falloff: FalloffType,
  vertexWorldPositions: Float32Array
): MorphVertexOffset[] {
  if (radius <= 0 || strength === 0) return [...currentOffsets];

  const radiusSq = radius * radius;
  const numVertices = vertexWorldPositions.length / 2;

  // Build lookup of existing offsets by vertex index
  const offsetMap = new Map<number, MorphVertexOffset>();
  for (const o of currentOffsets) {
    offsetMap.set(o.vertexIndex, { ...o });
  }

  for (let i = 0; i < numVertices; i++) {
    const vx = vertexWorldPositions[i * 2];
    const vy = vertexWorldPositions[i * 2 + 1];
    const dx = vx - worldX;
    const dy = vy - worldY;
    const distSq = dx * dx + dy * dy;

    if (distSq > radiusSq) continue;

    const dist = Math.sqrt(distSq);
    let falloffFactor: number;

    switch (falloff) {
      case 'constant':
        falloffFactor = 1.0;
        break;
      case 'smooth': {
        const t = 1.0 - dist / radius;
        falloffFactor = t * t * (3 - 2 * t); // smoothstep
        break;
      }
      case 'linear':
      default:
        falloffFactor = 1.0 - dist / radius;
        break;
    }

    const effectiveStrength = strength * falloffFactor;
    const offsetDx = directionX * effectiveStrength;
    const offsetDy = directionY * effectiveStrength;

    const existing = offsetMap.get(i);
    if (existing) {
      existing.dx += offsetDx;
      existing.dy += offsetDy;
    } else {
      offsetMap.set(i, { vertexIndex: i, dx: offsetDx, dy: offsetDy });
    }
  }

  return Array.from(offsetMap.values());
}

/**
 * Remove morph offsets with magnitude below epsilon (cleanup near-zero entries).
 */
export function compactMorphOffsets(
  offsets: MorphVertexOffset[],
  epsilon: number = 0.001
): MorphVertexOffset[] {
  return offsets.filter((o) => {
    const mag = Math.sqrt(o.dx * o.dx + o.dy * o.dy);
    return mag >= epsilon;
  });
}

/**
 * Convert sparse morph offsets to a dense Float32Array of xy pairs.
 * Out-of-range vertex indices are ignored.
 */
export function morphOffsetsToDense(
  offsets: MorphVertexOffset[],
  vertexCount: number
): Float32Array {
  const dense = new Float32Array(vertexCount * 2);
  for (const o of offsets) {
    if (o.vertexIndex >= 0 && o.vertexIndex < vertexCount) {
      dense[o.vertexIndex * 2] += o.dx;
      dense[o.vertexIndex * 2 + 1] += o.dy;
    }
  }
  return dense;
}
