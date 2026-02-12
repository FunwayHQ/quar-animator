/**
 * IK Chain Evaluator for Quar Animator
 * Evaluates all enabled IK chains: reads target positions, solves, applies results.
 */

import type { IKChain, Node, Vector2 } from '@quar/types';
import { extractIKJoints, solveFABRIK, applyIKResult, type IKSceneGraph } from './ik';

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

    const targetWT = sceneGraph.getWorldTransform(chain.targetNodeId);
    const target: Vector2 = { x: targetWT.tx, y: targetWT.ty };

    // Read pole target position if present
    let poleTarget: Vector2 | undefined;
    if (chain.poleTargetNodeId) {
      const poleNode = sceneGraph.getNode(chain.poleTargetNodeId);
      if (poleNode) {
        const poleWT = sceneGraph.getWorldTransform(chain.poleTargetNodeId);
        poleTarget = { x: poleWT.tx, y: poleWT.ty };
      }
    }

    // Extract current joint positions from scene graph
    const joints = extractIKJoints(chain.rootBoneId, chain.endEffectorBoneId, sceneGraph);
    if (joints.length === 0) continue;

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
  }
}
