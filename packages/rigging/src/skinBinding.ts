/**
 * Skin Binding for Quar Animator
 * Creates and manipulates mesh-to-bone bindings for skeletal deformation
 */

import type { Node, SkinData, VertexSkinEntry, VertexBoneWeight } from '@quar/types';
import type { FKBoneState } from './fk';

/** Minimal SceneGraph interface used by skin binding */
interface SkinSceneGraph {
  getNode(id: string): Node | undefined;
  getWorldTransform(id: string): {
    a: number;
    b: number;
    c: number;
    d: number;
    tx: number;
    ty: number;
  };
}

/**
 * Invert a 2D affine matrix [a,b,c,d,tx,ty].
 * Returns 6-element array or null if singular.
 */
function invertMatrix6(m: number[]): number[] | null {
  const a = m[0]!,
    b = m[1]!,
    c = m[2]!,
    d = m[3]!,
    tx = m[4]!,
    ty = m[5]!;
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-12) return null;
  const invDet = 1 / det;
  return [
    d * invDet,
    -b * invDet,
    -c * invDet,
    a * invDet,
    (c * ty - d * tx) * invDet,
    (b * tx - a * ty) * invDet,
  ];
}

/**
 * Create a skin binding for a node with the given bones.
 * Captures inverse bind matrices for each bone and the mesh's world matrix.
 *
 * @param nodeId - The mesh node to bind
 * @param boneIds - Bones to bind to
 * @param vertexCount - Number of tessellated vertices
 * @param sceneGraph - Scene graph for world transforms
 * @returns SkinData or null if binding fails
 */
export function createSkinBinding(
  nodeId: string,
  boneIds: string[],
  vertexCount: number,
  sceneGraph: SkinSceneGraph
): SkinData | null {
  if (boneIds.length === 0 || vertexCount <= 0) return null;

  const node = sceneGraph.getNode(nodeId);
  if (!node) return null;

  // Capture mesh bind matrix
  const meshWorld = sceneGraph.getWorldTransform(nodeId);
  const meshBindMatrix = [
    meshWorld.a,
    meshWorld.b,
    meshWorld.c,
    meshWorld.d,
    meshWorld.tx,
    meshWorld.ty,
  ];

  // Capture inverse bind matrix for each bone
  const inverseBindMatrices: Record<string, number[]> = {};
  for (const boneId of boneIds) {
    const boneNode = sceneGraph.getNode(boneId);
    if (!boneNode || boneNode.type !== 'bone') continue;

    const boneWorld = sceneGraph.getWorldTransform(boneId);
    const boneMatrix = [
      boneWorld.a,
      boneWorld.b,
      boneWorld.c,
      boneWorld.d,
      boneWorld.tx,
      boneWorld.ty,
    ];
    const ibm = invertMatrix6(boneMatrix);
    if (!ibm) continue;
    inverseBindMatrices[boneId] = ibm;
  }

  if (Object.keys(inverseBindMatrices).length === 0) return null;

  // Initialize all vertices with empty influences
  const vertices: VertexSkinEntry[] = [];
  for (let i = 0; i < vertexCount; i++) {
    vertices.push({ influences: [] });
  }

  return {
    vertices,
    inverseBindMatrices,
    meshBindMatrix,
    vertexCount,
  };
}

/**
 * Compute automatic weights based on nearest-bone distance.
 * For each vertex, finds the 2 nearest bone segments and assigns inverse-distance weights.
 */
export function computeAutoWeights(
  skinData: SkinData,
  vertexPositions: Float32Array, // xy pairs in world space
  boneStates: FKBoneState[]
): SkinData {
  const numVertices = vertexPositions.length / 2;
  const newVertices: VertexSkinEntry[] = [];

  for (let i = 0; i < numVertices; i++) {
    const vx = vertexPositions[i * 2]!;
    const vy = vertexPositions[i * 2 + 1]!;

    // Compute distance to each bone segment
    const distances: { boneId: string; dist: number }[] = [];
    for (const state of boneStates) {
      if (!skinData.inverseBindMatrices[state.boneId]) continue;
      const dist = pointToSegmentDistance(
        vx,
        vy,
        state.worldPos.x,
        state.worldPos.y,
        state.worldTip.x,
        state.worldTip.y
      );
      distances.push({ boneId: state.boneId, dist });
    }

    // Sort by distance, take up to 2 nearest
    distances.sort((a, b) => a.dist - b.dist);
    const nearest = distances.slice(0, 2);

    if (nearest.length === 0) {
      newVertices.push({ influences: [] });
      continue;
    }

    if (nearest.length === 1 || nearest[1]!.dist === 0) {
      newVertices.push({ influences: [{ boneId: nearest[0]!.boneId, weight: 1.0 }] });
      continue;
    }

    // Inverse-distance weighting
    const invDist0 = nearest[0]!.dist === 0 ? 1e10 : 1 / nearest[0]!.dist;
    const invDist1 = nearest[1]!.dist === 0 ? 1e10 : 1 / nearest[1]!.dist;
    const totalInv = invDist0 + invDist1;

    const influences: VertexBoneWeight[] = [
      { boneId: nearest[0]!.boneId, weight: invDist0 / totalInv },
      { boneId: nearest[1]!.boneId, weight: invDist1 / totalInv },
    ];

    // Remove negligible weights
    const filtered = influences.filter((inf) => inf.weight > 0.001);
    newVertices.push(normalizeWeights({ influences: filtered }));
  }

  return {
    ...skinData,
    vertices: newVertices,
  };
}

/**
 * Point-to-line-segment distance.
 */
function pointToSegmentDistance(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    // Degenerate segment (point)
    const ex = px - ax;
    const ey = py - ay;
    return Math.sqrt(ex * ex + ey * ey);
  }

  // Project point onto segment, clamped to [0,1]
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const closestX = ax + t * dx;
  const closestY = ay + t * dy;
  const ex = px - closestX;
  const ey = py - closestY;
  return Math.sqrt(ex * ex + ey * ey);
}

/**
 * Normalize a vertex skin entry: weights sum to 1, remove zeros, cap at 4, sort descending.
 */
export function normalizeWeights(entry: VertexSkinEntry): VertexSkinEntry {
  // Remove zero or near-zero weights
  let influences = entry.influences.filter((inf) => inf.weight > 0.0001);

  // Sort by weight descending
  influences.sort((a, b) => b.weight - a.weight);

  // Cap at 4 influences
  influences = influences.slice(0, 4);

  // Normalize to sum to 1.0
  const total = influences.reduce((sum, inf) => sum + inf.weight, 0);
  if (total > 0) {
    influences = influences.map((inf) => ({
      boneId: inf.boneId,
      weight: inf.weight / total,
    }));
  }

  return { influences };
}

/**
 * Paint weight for a specific vertex and bone.
 * Modifies skinData in-place.
 */
export function paintWeight(
  skinData: SkinData,
  vertexIndex: number,
  boneId: string,
  delta: number,
  mode: 'add' | 'subtract'
): void {
  if (vertexIndex < 0 || vertexIndex >= skinData.vertices.length) return;

  const entry = skinData.vertices[vertexIndex]!;
  const influences = [...entry.influences.map((inf) => ({ ...inf }))];

  // Find existing influence for this bone
  const existing = influences.find((inf) => inf.boneId === boneId);

  if (mode === 'add') {
    const absDelta = Math.abs(delta);
    if (existing) {
      existing.weight = Math.min(1.0, existing.weight + absDelta);
    } else {
      influences.push({ boneId, weight: Math.min(1.0, absDelta) });
    }
  } else {
    // subtract
    if (existing) {
      existing.weight = Math.max(0, existing.weight - Math.abs(delta));
    }
    // If bone not present, nothing to subtract
  }

  // Renormalize: if the target bone's weight changed, redistribute remaining weight
  // among other bones proportionally
  const targetInf = influences.find((inf) => inf.boneId === boneId);
  const targetWeight = targetInf ? Math.max(0, Math.min(1, targetInf.weight)) : 0;

  if (targetInf) {
    targetInf.weight = targetWeight;
  }

  const othersTotal = influences
    .filter((inf) => inf.boneId !== boneId)
    .reduce((sum, inf) => sum + inf.weight, 0);

  const remaining = 1.0 - targetWeight;

  if (othersTotal > 0 && remaining > 0) {
    for (const inf of influences) {
      if (inf.boneId !== boneId) {
        inf.weight = (inf.weight / othersTotal) * remaining;
      }
    }
  } else if (remaining > 0 && othersTotal === 0 && targetWeight < 1.0) {
    // No other bones — target gets full weight
    if (targetInf) targetInf.weight = 1.0;
  }

  skinData.vertices[vertexIndex] = normalizeWeights({ influences });
}
