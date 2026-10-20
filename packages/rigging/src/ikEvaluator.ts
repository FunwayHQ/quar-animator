/**
 * IK Chain Evaluator for Quar Animator
 * Evaluates all enabled IK chains: reads target positions, solves, applies results.
 */

import type { IKChain, Vector2 } from '@quar/types';
import { extractIKJoints, solveFABRIK, applyIKResult, type IKSceneGraph } from './ik';

/**
 * Per scene graph, for each bone IK has posed: the rotation it had before
 * (authored by hand or by animation) and the rotation IK wrote.
 */
const posedBones = new WeakMap<object, Map<string, { authored: number; written: number }>>();

/**
 * The local rotations to solve from: each bone's own rotation, or — while it
 * still holds the rotation IK last gave it — the one it had before. Solving
 * from the authored pose every frame makes the result depend only on that
 * pose and the target, not on the frames solved before.
 */
function startRotations(sceneGraph: IKSceneGraph, boneIds: string[]): Map<string, number> {
  let memory = posedBones.get(sceneGraph);
  if (!memory) {
    memory = new Map();
    posedBones.set(sceneGraph, memory);
  }
  const rotations = new Map<string, number>();
  for (const boneId of boneIds) {
    const node = sceneGraph.getNode(boneId);
    if (!node) continue;
    const current = node.transform.rotation;
    const known = memory.get(boneId);
    if (known && Math.abs(current - known.written) < 1e-6) {
      rotations.set(boneId, known.authored);
    } else {
      memory.set(boneId, { authored: current, written: current });
      rotations.set(boneId, current);
    }
  }
  return rotations;
}

function rememberWritten(sceneGraph: IKSceneGraph, boneIds: string[]): void {
  const memory = posedBones.get(sceneGraph);
  if (!memory) return;
  for (const boneId of boneIds) {
    const known = memory.get(boneId);
    const node = sceneGraph.getNode(boneId);
    if (known && node) known.written = node.transform.rotation;
  }
}

/** Whether a layer sits under one of these bones (it moves when they do). */
function isInside(sceneGraph: IKSceneGraph, nodeId: string, boneIds: Set<string>): boolean {
  let id = sceneGraph.getNode(nodeId)?.parent ?? null;
  while (id) {
    if (boneIds.has(id)) return true;
    id = sceneGraph.getNode(id)?.parent ?? null;
  }
  return false;
}

/**
 * Evaluate all enabled IK chains.
 * Reads each target node's world position, solves FABRIK, and applies
 * the resulting bone rotations to the scene graph.
 *
 * Should be called AFTER FK animation is applied to all nodes (including IK targets),
 * but BEFORE skinning in the render loop.
 */
export function evaluateIKChains(ikChains: IKChain[], sceneGraph: IKSceneGraph): void {
  for (const chain of ikChains) {
    if (!chain.enabled) continue;

    // Read target node position
    const targetNode = sceneGraph.getNode(chain.targetNodeId);
    if (!targetNode) continue;

    // The chain's bones, solved from their authored pose
    const probe = extractIKJoints(chain.rootBoneId, chain.endEffectorBoneId, sceneGraph);
    if (probe.length === 0) continue;
    const boneIds = probe.map((joint) => joint.boneId);
    const chainBoneIds = new Set(boneIds);
    // A target riding on its own chain would chase itself round in circles
    if (isInside(sceneGraph, chain.targetNodeId, chainBoneIds)) continue;

    const targetWT = sceneGraph.getWorldTransform(chain.targetNodeId);
    const target: Vector2 = { x: targetWT.tx, y: targetWT.ty };

    // Read pole target position if present
    let poleTarget: Vector2 | undefined;
    if (chain.poleTargetNodeId) {
      const poleNode = sceneGraph.getNode(chain.poleTargetNodeId);
      if (poleNode && !isInside(sceneGraph, chain.poleTargetNodeId, chainBoneIds)) {
        const poleWT = sceneGraph.getWorldTransform(chain.poleTargetNodeId);
        poleTarget = { x: poleWT.tx, y: poleWT.ty };
      }
    }

    const joints = extractIKJoints(
      chain.rootBoneId,
      chain.endEffectorBoneId,
      sceneGraph,
      startRotations(sceneGraph, boneIds)
    );

    // Solve
    const result = solveFABRIK({
      joints,
      target,
      poleTarget,
      maxIterations: chain.maxIterations,
      tolerance: chain.tolerance,
    });

    // Apply rotations to bones
    applyIKResult(result, sceneGraph);
    rememberWritten(sceneGraph, boneIds);
  }
}
