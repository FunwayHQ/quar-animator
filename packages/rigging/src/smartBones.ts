/**
 * Smart Bones Evaluation for Quar Animator
 * Corrective morph targets driven by bone rotation.
 *
 * Pipeline: FK → IK → Smart Bones evaluation → Skinning
 * Morph offsets are applied to bind-pose vertices BEFORE LBS skinning.
 */

import type { SmartBoneAction, MorphVertexOffset, MorphTarget } from '@quar/types';

/**
 * Minimal scene graph interface for reading bone rotation.
 * Keeps this module independent of the full SceneGraph class.
 */
export interface SmartBoneSceneGraph {
  getNode(id: string): { type: string; transform: { rotation: number } } | undefined;
}

/**
 * Read the current driver value from the scene graph.
 * Currently only supports 'transform.rotation' on bone nodes.
 * Returns null if the bone doesn't exist or isn't a bone.
 */
export function readDriverValue(
  driver: { boneId: string; property: string },
  sceneGraph: SmartBoneSceneGraph
): number | null {
  const node = sceneGraph.getNode(driver.boneId);
  if (!node || node.type !== 'bone') return null;

  if (driver.property === 'transform.rotation') {
    return node.transform.rotation;
  }

  return null;
}

/**
 * Compute linear blend weight from driver value within [rangeMin, rangeMax].
 * Returns 0 when driverValue <= rangeMin, 1 when >= rangeMax.
 * Supports inverted ranges (rangeMin > rangeMax).
 */
export function computeBlendWeight(
  driverValue: number,
  rangeMin: number,
  rangeMax: number
): number {
  if (rangeMin === rangeMax) return driverValue >= rangeMin ? 1 : 0;
  const t = (driverValue - rangeMin) / (rangeMax - rangeMin);
  return Math.max(0, Math.min(1, t));
}

/**
 * Interpolate between two sparse morph offset arrays.
 * Both arrays are keyed by vertexIndex. Missing entries in either
 * set are treated as zero displacement.
 */
export function interpolateMorphOffsets(
  offsetsA: MorphVertexOffset[],
  offsetsB: MorphVertexOffset[],
  t: number
): MorphVertexOffset[] {
  if (t <= 0) return offsetsA.length > 0 ? offsetsA.map((o) => ({ ...o })) : [];
  if (t >= 1) return offsetsB.length > 0 ? offsetsB.map((o) => ({ ...o })) : [];

  // Build lookup from vertexIndex to offset for both sets
  const mapA = new Map<number, MorphVertexOffset>();
  for (const o of offsetsA) mapA.set(o.vertexIndex, o);

  const mapB = new Map<number, MorphVertexOffset>();
  for (const o of offsetsB) mapB.set(o.vertexIndex, o);

  // Union of all vertex indices
  const allIndices = new Set<number>([...mapA.keys(), ...mapB.keys()]);
  const result: MorphVertexOffset[] = [];

  for (const idx of allIndices) {
    const a = mapA.get(idx);
    const b = mapB.get(idx);
    const ax = a ? a.dx : 0;
    const ay = a ? a.dy : 0;
    const bx = b ? b.dx : 0;
    const by = b ? b.dy : 0;

    result.push({
      vertexIndex: idx,
      dx: ax + (bx - ax) * t,
      dy: ay + (by - ay) * t,
    });
  }

  return result;
}

/**
 * Evaluate a single Smart Bone action.
 * Finds the two bracketing morph targets based on the current driver value
 * and interpolates between them.
 *
 * @param action - The Smart Bone action to evaluate
 * @param sceneGraph - Scene graph for reading bone rotation
 * @param nodeVertexCounts - Map of nodeId → vertex count for creating dense arrays
 * @returns Map of nodeId → Float32Array of xy offset pairs, or null if inactive
 */
export function evaluateSmartBoneAction(
  action: SmartBoneAction,
  sceneGraph: SmartBoneSceneGraph,
  nodeVertexCounts: Map<string, number>
): Map<string, Float32Array> | null {
  if (!action.enabled) return null;
  if (action.targets.length === 0) return null;

  const driverValue = readDriverValue(action.driver, sceneGraph);
  if (driverValue === null) return null;

  const blendWeight = computeBlendWeight(
    driverValue,
    action.driver.rangeMin,
    action.driver.rangeMax
  );

  // Sort targets by driverValue ascending
  const sorted = [...action.targets].sort((a, b) => a.driverValue - b.driverValue);

  const result = new Map<string, Float32Array>();

  // Collect all affected node IDs across all targets
  const nodeIds = new Set<string>();
  for (const target of sorted) {
    for (const nid of Object.keys(target.offsets)) nodeIds.add(nid);
  }

  for (const nodeId of nodeIds) {
    const vertexCount = nodeVertexCounts.get(nodeId);
    if (!vertexCount || vertexCount <= 0) continue;

    // Find bracketing targets for this blend weight mapped to driver value space
    const currentDriverVal =
      action.driver.rangeMin + blendWeight * (action.driver.rangeMax - action.driver.rangeMin);

    // Find lower and upper bracketing targets
    let lower: MorphTarget | null = null;
    let upper: MorphTarget | null = null;

    for (let i = 0; i < sorted.length; i++) {
      const entry = sorted[i];
      if (!entry) continue;
      if (entry.driverValue <= currentDriverVal) {
        lower = entry;
      }
      if (entry.driverValue >= currentDriverVal && !upper) {
        upper = entry;
      }
    }

    let offsets: MorphVertexOffset[];

    if (!lower && !upper) {
      continue;
    } else if (!lower) {
      // Before the first target: ramp from the rest pose (zero displacement) up
      // to the first target as the driver moves from rangeMin to its driverValue
      // — previously the FULL morph was applied even at rest.
      const denom = upper!.driverValue - action.driver.rangeMin;
      const t = denom !== 0 ? (currentDriverVal - action.driver.rangeMin) / denom : 1;
      offsets = interpolateMorphOffsets([], upper!.offsets[nodeId] ?? [], t);
    } else if (!upper || lower === upper) {
      // At or past a single target
      offsets = (lower.offsets[nodeId] ?? []).map((o) => ({ ...o }));
    } else {
      // Between two targets — interpolate
      const t =
        upper.driverValue === lower.driverValue
          ? 0
          : (currentDriverVal - lower.driverValue) / (upper.driverValue - lower.driverValue);
      offsets = interpolateMorphOffsets(
        lower.offsets[nodeId] ?? [],
        upper.offsets[nodeId] ?? [],
        t
      );
    }

    // Convert sparse offsets to dense Float32Array
    const dense = new Float32Array(vertexCount * 2);
    for (const o of offsets) {
      if (o.vertexIndex >= 0 && o.vertexIndex < vertexCount) {
        dense[o.vertexIndex * 2] = (dense[o.vertexIndex * 2] ?? 0) + o.dx;
        dense[o.vertexIndex * 2 + 1] = (dense[o.vertexIndex * 2 + 1] ?? 0) + o.dy;
      }
    }

    // Accumulate into result
    const existing = result.get(nodeId);
    if (existing) {
      for (let i = 0; i < existing.length; i++) existing[i] = (existing[i] ?? 0) + (dense[i] ?? 0);
    } else {
      result.set(nodeId, dense);
    }
  }

  return result.size > 0 ? result : null;
}

/**
 * Evaluate all enabled Smart Bone actions and accumulate morph offsets additively.
 *
 * @param actions - All Smart Bone actions
 * @param sceneGraph - Scene graph for reading bone transforms
 * @param nodeVertexCounts - Map of nodeId → tessellated vertex count
 * @returns Map of nodeId → Float32Array of accumulated xy offset pairs
 */
export function evaluateSmartBones(
  actions: SmartBoneAction[],
  sceneGraph: SmartBoneSceneGraph,
  nodeVertexCounts: Map<string, number>
): Map<string, Float32Array> {
  const accumulated = new Map<string, Float32Array>();

  for (const action of actions) {
    const result = evaluateSmartBoneAction(action, sceneGraph, nodeVertexCounts);
    if (!result) continue;

    for (const [nodeId, offsets] of result) {
      const existing = accumulated.get(nodeId);
      if (existing) {
        for (let i = 0; i < Math.min(existing.length, offsets.length); i++) {
          existing[i] = (existing[i] ?? 0) + (offsets[i] ?? 0);
        }
      } else {
        accumulated.set(nodeId, new Float32Array(offsets));
      }
    }
  }

  return accumulated;
}

/**
 * Apply dense morph offsets to bind-pose vertices.
 * Creates a new Float32Array with offsets added to vertex positions.
 * If morphOffsets is null/undefined or mismatched length, returns original vertices.
 */
export function applyMorphOffsets(
  vertices: Float32Array,
  morphOffsets: Float32Array | null | undefined
): Float32Array {
  if (!morphOffsets || morphOffsets.length !== vertices.length) return vertices;

  const result = new Float32Array(vertices.length);
  for (let i = 0; i < vertices.length; i++) {
    result[i] = (vertices[i] ?? 0) + (morphOffsets[i] ?? 0);
  }
  return result;
}
