/**
 * Skin Binding for Quar Animator
 * Creates and manipulates mesh-to-bone bindings for skeletal deformation
 */

import type { Node, SkinData, VertexSkinEntry } from '@quar/types';
import type { FKBoneState } from './fk';
import { mul6 } from './cpuSkinning';

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

  // The mesh's own transform at bind time (world = parent × local), so later
  // changes to it can move the mesh relative to its skeleton
  const parentWorld = node.parent ? sceneGraph.getWorldTransform(node.parent) : null;
  const parentInverse = parentWorld
    ? invertMatrix6([
        parentWorld.a,
        parentWorld.b,
        parentWorld.c,
        parentWorld.d,
        parentWorld.tx,
        parentWorld.ty,
      ])
    : [1, 0, 0, 1, 0, 0];
  const meshBindLocal = parentInverse ? mul6(parentInverse, meshBindMatrix) : undefined;

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
    ...(meshBindLocal ? { meshBindLocal } : {}),
  };
}

/**
 * The skin data to deform a mesh with, given the mesh's current local
 * transform (6 elements). Skinning starts from where the mesh was bound;
 * whatever its own transform did since — a move, a rotation, a keyframed
 * animation, a paste offset — is applied on top, in bind space, so the mesh
 * moves relative to its skeleton. A shared parent moving both the skeleton
 * and the mesh is already in the bones and isn't applied twice. Bindings
 * without meshBindLocal deform from where they were bound, as before.
 */
export function placeSkinData(skinData: SkinData, currentLocal: number[]): SkinData {
  const bindLocal = skinData.meshBindLocal;
  if (!bindLocal) return skinData;
  const inverseBindLocal = invertMatrix6(bindLocal);
  if (!inverseBindLocal) return skinData;
  const since = mul6(inverseBindLocal, currentLocal);
  const unchanged = [1, 0, 0, 1, 0, 0].every((v, i) => Math.abs(since[i]! - v) < 1e-9);
  if (unchanged) return skinData;
  return { ...skinData, meshBindMatrix: mul6(skinData.meshBindMatrix, since) };
}

/** Vertex positions as stored in a binding (rounded, so files stay small). */
export function bindVertexPositions(vertices: ArrayLike<number>): number[] {
  return Array.from(vertices, (v) => Math.round(v * 1000) / 1000);
}

/** How many of the nearest bound vertices a new vertex blends its weights from. */
const FIT_NEIGHBOURS = 3;

/**
 * A binding fitted to the mesh's geometry as it is now. Weights are kept per
 * tessellated vertex, so editing a shape after binding it (a new size, a
 * corner radius, added points) renumbers its vertices. Each vertex of the new
 * geometry takes its weights from the nearest vertices the binding recorded
 * (blended by inverse distance; an unchanged vertex keeps its own), and the
 * fitted binding records the new geometry. Bindings that already match, and
 * older ones that recorded no vertices, are returned as they are.
 */
export function fitSkinToVertices(skinData: SkinData, vertices: ArrayLike<number>): SkinData {
  const count = Math.floor(vertices.length / 2);
  if (skinData.vertices.length === count) return skinData;
  const bind = skinData.bindVertices;
  const bindCount = bind ? Math.min(bind.length / 2, skinData.vertices.length) : 0;
  if (!bind || bindCount === 0 || count === 0) return skinData;

  const nearIndex = new Int32Array(FIT_NEIGHBOURS);
  const nearDist = new Float64Array(FIT_NEIGHBOURS);
  const fitted: VertexSkinEntry[] = [];
  for (let i = 0; i < count; i++) {
    const x = vertices[i * 2]!;
    const y = vertices[i * 2 + 1]!;
    nearIndex.fill(-1);
    nearDist.fill(Infinity);
    for (let j = 0; j < bindCount; j++) {
      const dx = bind[j * 2]! - x;
      const dy = bind[j * 2 + 1]! - y;
      const d = dx * dx + dy * dy;
      if (d >= nearDist[FIT_NEIGHBOURS - 1]!) continue;
      let k = FIT_NEIGHBOURS - 1;
      while (k > 0 && nearDist[k - 1]! > d) {
        nearDist[k] = nearDist[k - 1]!;
        nearIndex[k] = nearIndex[k - 1]!;
        k--;
      }
      nearDist[k] = d;
      nearIndex[k] = j;
    }

    const blended = new Map<string, number>();
    if (nearDist[0]! < 1e-6) {
      for (const inf of skinData.vertices[nearIndex[0]!]!.influences) {
        blended.set(inf.boneId, inf.weight);
      }
    } else {
      let total = 0;
      for (let k = 0; k < FIT_NEIGHBOURS && nearIndex[k]! >= 0; k++) total += 1 / nearDist[k]!;
      for (let k = 0; k < FIT_NEIGHBOURS && nearIndex[k]! >= 0; k++) {
        const share = 1 / nearDist[k]! / total;
        for (const inf of skinData.vertices[nearIndex[k]!]!.influences) {
          blended.set(inf.boneId, (blended.get(inf.boneId) ?? 0) + inf.weight * share);
        }
      }
    }
    fitted.push(
      normalizeWeights({
        influences: [...blended].map(([boneId, weight]) => ({ boneId, weight })),
      })
    );
  }

  return {
    ...skinData,
    vertices: fitted,
    vertexCount: count,
    bindVertices: bindVertexPositions(vertices),
  };
}

/**
 * How far a bend spreads either side of a joint, as a share of the shorter
 * bone there: about the thickness of a limb, so the joint bends like a sleeve.
 */
const JOINT_BLEND = 0.3;

interface WeightBone {
  id: string;
  head: { x: number; y: number };
  tip: { x: number; y: number };
  dir: { x: number; y: number };
  length: number;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x < edge0 ? 0 : 1;
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * How much of a vertex, at `v`, belongs past the joint where `from` meets
 * `to` (0 = all `from`, 1 = all `to`). Measured along the bones from the
 * joint — not by distance to each bone — so the bend is the same across the
 * width of the shape, and the edges don't kink at the elbow.
 */
function jointShare(v: { x: number; y: number }, from: WeightBone, to: WeightBone): number {
  let ax = from.dir.x + to.dir.x;
  let ay = from.dir.y + to.dir.y;
  const length = Math.hypot(ax, ay);
  if (length < 1e-9) return 0.5; // folded straight back: no way across
  ax /= length;
  ay /= length;
  const along = (v.x - to.head.x) * ax + (v.y - to.head.y) * ay;
  const r = JOINT_BLEND * Math.min(from.length, to.length);
  return smoothstep(-r, r, along);
}

/**
 * Whether a place (world space, as the vertices and bones are) is part of what
 * a layer shows: inside a shape's outline, or on an image's opaque pixels.
 */
export type ShapeTest = (x: number, y: number) => boolean;

/** The places along a bone its envelope is measured at */
const ENVELOPE_SAMPLES = 9;
/** Where two bones' envelopes are about as close, as a share of an envelope */
const ENVELOPE_BLEND = 0.25;

/**
 * How far the shape reaches to the side of a bone — the radius of its
 * envelope: at places along the bone, the distance to the nearer edge, and
 * the median of those (a limb's half-thickness; a trunk's half-width). Null
 * when the bone runs outside the shape.
 */
function envelopeRadius(bone: WeightBone, inside: ShapeTest, reach: number): number | null {
  const step = Math.max(reach / 800, 0.25);
  const nx = -bone.dir.y;
  const ny = bone.dir.x;
  const widths: number[] = [];
  for (let k = 1; k <= ENVELOPE_SAMPLES; k++) {
    const t = k / (ENVELOPE_SAMPLES + 1);
    const px = bone.head.x + (bone.tip.x - bone.head.x) * t;
    const py = bone.head.y + (bone.tip.y - bone.head.y) * t;
    if (!inside(px, py)) continue;
    const toEdge = (side: number) => {
      let d = step;
      while (d < reach && inside(px + nx * d * side, py + ny * d * side)) d += step;
      return d;
    };
    widths.push(Math.min(toEdge(1), toEdge(-1)));
  }
  if (widths.length === 0) return null;
  widths.sort((a, b) => a - b);
  return widths[Math.floor(widths.length / 2)]!;
}

/**
 * Each bone's envelope radius against the shape. Bones outside it take the
 * median of the others'; none is thinner than a sixth of its length.
 */
function envelopeRadii(
  bones: WeightBone[],
  inside: ShapeTest,
  vertexPositions: Float32Array
): Map<string, number> {
  // How far to look for an edge: past everything there is (the mesh and the bones)
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const extend = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };
  for (let i = 0; i < vertexPositions.length; i += 2) {
    extend(vertexPositions[i]!, vertexPositions[i + 1]!);
  }
  for (const bone of bones) {
    extend(bone.head.x, bone.head.y);
    extend(bone.tip.x, bone.tip.y);
  }
  const reach = 2 * Math.max(Math.hypot(maxX - minX, maxY - minY), 1);
  const measured = new Map<string, number>();
  for (const bone of bones) {
    const radius = envelopeRadius(bone, inside, reach);
    if (radius !== null) measured.set(bone.id, radius);
  }
  const known = [...measured.values()].sort((a, b) => a - b);
  const fallback = known.length > 0 ? known[Math.floor(known.length / 2)]! : reach / 4;
  const radii = new Map<string, number>();
  for (const bone of bones) {
    radii.set(bone.id, Math.max(measured.get(bone.id) ?? fallback, bone.length / 6, 1e-6));
  }
  return radii;
}

/**
 * Compute automatic weights from where each vertex sits along the bones.
 * A vertex belongs to its nearest bone; near a joint it bends smoothly over
 * to the bone on the other side (connected bones: one's tip at the other's
 * head). Near a bone it isn't connected to, it blends where the two are
 * about as close.
 *
 * Given the layer's shape, nearness is measured against each bone's envelope
 * — how far the shape reaches to its side — so a trunk keeps what's under a
 * limb: the fur under a raised arm is nearer the arm bone than the spine, but
 * well outside the arm's thickness and inside the body's width.
 */
export function computeAutoWeights(
  skinData: SkinData,
  vertexPositions: Float32Array, // xy pairs in world space
  boneStates: FKBoneState[],
  shape?: ShapeTest
): SkinData {
  const bones: WeightBone[] = [];
  for (const state of boneStates) {
    if (!skinData.inverseBindMatrices[state.boneId]) continue;
    if (bones.some((bone) => bone.id === state.boneId)) continue;
    const dx = state.worldTip.x - state.worldPos.x;
    const dy = state.worldTip.y - state.worldPos.y;
    const length = Math.hypot(dx, dy);
    bones.push({
      id: state.boneId,
      head: state.worldPos,
      tip: state.worldTip,
      dir: length > 1e-9 ? { x: dx / length, y: dy / length } : { x: 1, y: 0 },
      length,
    });
  }

  // Joints: a bone whose head sits on another bone's tip
  const parentAt = new Map<string, WeightBone>();
  const childrenAt = new Map<string, WeightBone[]>();
  for (const child of bones) {
    for (const parent of bones) {
      if (parent === child) continue;
      const gap = Math.hypot(child.head.x - parent.tip.x, child.head.y - parent.tip.y);
      if (gap > Math.max(1, 0.02 * Math.min(parent.length, child.length))) continue;
      if (!parentAt.has(child.id)) parentAt.set(child.id, parent);
      childrenAt.set(parent.id, [...(childrenAt.get(parent.id) ?? []), child]);
    }
  }

  const numVertices = vertexPositions.length / 2;
  const newVertices: VertexSkinEntry[] = [];
  // Without a shape, plain distance (each envelope 1)
  const radii = shape ? envelopeRadii(bones, shape, vertexPositions) : null;

  for (let i = 0; i < numVertices; i++) {
    const v = { x: vertexPositions[i * 2]!, y: vertexPositions[i * 2 + 1]! };
    const distances = bones
      .map((bone) => ({
        bone,
        dist:
          pointToSegmentDistance(v.x, v.y, bone.head.x, bone.head.y, bone.tip.x, bone.tip.y) /
          (radii?.get(bone.id) ?? 1),
      }))
      .sort((a, b) => a.dist - b.dist);
    const nearest = distances[0];
    if (!nearest) {
      newVertices.push({ influences: [] });
      continue;
    }

    const own = nearest.bone;
    const weights = new Map<string, number>([[own.id, 1]]);
    const related = new Set<string>([own.id]);

    // Bending back toward the bone before the joint at its head...
    const parent = parentAt.get(own.id);
    if (parent) {
      related.add(parent.id);
      const back = 1 - jointShare(v, parent, own);
      weights.set(parent.id, back);
      weights.set(own.id, 1 - back);
    }
    // ...and on toward the bone after the joint at its tip
    let next: { bone: WeightBone; share: number } | null = null;
    for (const child of childrenAt.get(own.id) ?? []) {
      related.add(child.id);
      const share = jointShare(v, own, child);
      if (!next || share > next.share) next = { bone: child, share };
    }
    if (next && next.share > 0) {
      const ownWeight = weights.get(own.id) ?? 0;
      const share = Math.min(next.share, ownWeight);
      weights.set(own.id, ownWeight - share);
      weights.set(next.bone.id, (weights.get(next.bone.id) ?? 0) + share);
    }

    // Blend with a nearby bone it isn't connected to, where both are about as close
    const other = distances.find((entry) => !related.has(entry.bone.id));
    if (other) {
      // (Against envelopes, distances are in envelopes, not world units)
      const r = radii ? ENVELOPE_BLEND : JOINT_BLEND * Math.min(own.length, other.bone.length);
      const share = 0.5 * (1 - smoothstep(0, Math.max(r, 1e-9), other.dist - nearest.dist));
      if (share > 0) {
        for (const [boneId, weight] of weights) weights.set(boneId, weight * (1 - share));
        weights.set(other.bone.id, share);
      }
    }

    newVertices.push(
      normalizeWeights({
        influences: [...weights]
          .filter(([, weight]) => weight > 0.001)
          .map(([boneId, weight]) => ({ boneId, weight })),
      })
    );
  }

  if (shape) followNearestInside(newVertices, vertexPositions, shape);

  return {
    ...skinData,
    vertices: newVertices,
  };
}

/**
 * Vertices outside the shape (an image's transparent cells) take the weights
 * of the nearest vertex inside it. Weighed on their own, the cells beside a
 * limb went with the trunk (they're far outside the limb's thickness), and
 * every cell across the limb's edge stretched between the two as it moved.
 */
function followNearestInside(
  vertices: VertexSkinEntry[],
  positions: Float32Array,
  shape: ShapeTest
): void {
  const inside: number[] = [];
  const outside: number[] = [];
  for (let i = 0; i < vertices.length; i++) {
    (shape(positions[i * 2]!, positions[i * 2 + 1]!) ? inside : outside).push(i);
  }
  if (inside.length === 0) return;
  for (const i of outside) {
    const x = positions[i * 2]!;
    const y = positions[i * 2 + 1]!;
    let best = inside[0]!;
    let bestDist = Infinity;
    for (const j of inside) {
      const d = (positions[j * 2]! - x) ** 2 + (positions[j * 2 + 1]! - y) ** 2;
      if (d < bestDist) {
        bestDist = d;
        best = j;
      }
    }
    vertices[i] = { influences: vertices[best]!.influences.map((inf) => ({ ...inf })) };
  }
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
  } else if (remaining <= 0) {
    // Painted to full weight: the other bones let go of the vertex
    for (const inf of influences) {
      if (inf.boneId !== boneId) inf.weight = 0;
    }
  } else if (othersTotal === 0 && targetWeight < 1.0) {
    // No other bones — target gets full weight
    if (targetInf) targetInf.weight = 1.0;
  }

  skinData.vertices[vertexIndex] = normalizeWeights({ influences });
}
