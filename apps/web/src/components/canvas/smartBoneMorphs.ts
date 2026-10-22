/**
 * Smart Bone morph offsets for the canvas, worked out again only when what
 * they depend on changes: the actions, the values of their driver bones and
 * the vertex counts of the meshes they bend.
 *
 * The renderer repacks a skinned mesh's vertices whenever its morph offsets
 * are a different array from last frame, so handing it the same arrays while
 * nothing moves spares that work (and the allocations) on every frame.
 */

import { evaluateSmartBones, readDriverValue } from '@quar/rigging';
import type { SmartBoneSceneGraph } from '@quar/rigging';
import type { SmartBoneAction } from '@quar/types';

type Evaluate = typeof evaluateSmartBones;

interface Evaluated {
  actions: SmartBoneAction[];
  driverValues: (number | null)[];
  vertexCounts: Map<string, number>;
  offsets: Map<string, Float32Array>;
}

function sameDriverValues(a: (number | null)[], b: (number | null)[]): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}

function sameVertexCounts(a: Map<string, number>, b: Map<string, number>): boolean {
  if (a.size !== b.size) return false;
  for (const [id, count] of a) {
    if (b.get(id) !== count) return false;
  }
  return true;
}

/**
 * A function giving the morph offsets for the actions, as evaluateSmartBones
 * does, but returning last call's map (the same arrays) while the actions,
 * their drivers' values and the vertex counts are unchanged. The result is
 * shared between calls: don't change it.
 */
export function createSmartBoneMorphCache(evaluate: Evaluate = evaluateSmartBones) {
  let last: Evaluated | null = null;
  return (
    actions: SmartBoneAction[],
    sceneGraph: SmartBoneSceneGraph,
    vertexCounts: Map<string, number>
  ): Map<string, Float32Array> => {
    const driverValues = actions.map((action) => readDriverValue(action.driver, sceneGraph));
    if (
      last &&
      last.actions === actions &&
      sameDriverValues(last.driverValues, driverValues) &&
      sameVertexCounts(last.vertexCounts, vertexCounts)
    ) {
      return last.offsets;
    }
    const offsets = evaluate(actions, sceneGraph, vertexCounts);
    last = { actions, driverValues, vertexCounts, offsets };
    return offsets;
  };
}
