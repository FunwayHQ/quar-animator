/**
 * Forward Kinematics for Quar Animator
 * FK computation, rotation constraints, and bone posing
 */

import type { BoneNode, Node, Vector2 } from '@quar/types';

/** Minimal SceneGraph interface used by FK functions */
interface BoneSceneGraph {
  getNode(id: string): Node | undefined;
  updateNode(id: string, data: Partial<Node>): void;
  getWorldTransform(id: string): {
    a: number;
    b: number;
    c: number;
    d: number;
    tx: number;
    ty: number;
  };
}

export interface FKBoneState {
  boneId: string;
  worldPos: Vector2;
  worldTip: Vector2;
  worldRotation: number; // Degrees
}

/**
 * Clamp a rotation angle to a bone's constraint range.
 * Returns the original angle if no constraints are set.
 */
export function clampBoneRotation(bone: BoneNode, angle: number): number {
  if (bone.angleMin == null && bone.angleMax == null) return angle;

  const min = bone.angleMin ?? -Infinity;
  const max = bone.angleMax ?? Infinity;
  return Math.max(min, Math.min(max, angle));
}

/**
 * Compute FK chain state for a root bone and all its descendants.
 * Returns world positions, tips, and rotations for each bone.
 */
export function computeFKChain(rootBoneId: string, sceneGraph: BoneSceneGraph): FKBoneState[] {
  const states: FKBoneState[] = [];

  function traverse(boneId: string): void {
    const node = sceneGraph.getNode(boneId);
    if (!node || node.type !== 'bone') return;

    const bone = node as BoneNode;
    const worldTransform = sceneGraph.getWorldTransform(boneId);

    // Extract world position (translation component of world matrix)
    const worldPos: Vector2 = { x: worldTransform.tx, y: worldTransform.ty };

    // Transform the tip point through world matrix
    const tipX = bone.length;
    const wx = worldTransform.a * tipX + worldTransform.tx;
    const wy = worldTransform.b * tipX + worldTransform.ty;
    const worldTip: Vector2 = { x: wx, y: wy };

    // Extract world rotation from matrix (atan2 of the first column)
    const worldRotation = Math.atan2(worldTransform.b, worldTransform.a) * (180 / Math.PI);

    states.push({ boneId, worldPos, worldTip, worldRotation });

    // Recurse into children
    for (const childId of bone.children) {
      traverse(childId);
    }
  }

  traverse(rootBoneId);
  return states;
}

/**
 * Set a bone's rotation with constraint enforcement.
 */
export function poseBone(boneId: string, rotation: number, sceneGraph: BoneSceneGraph): void {
  const node = sceneGraph.getNode(boneId);
  if (!node || node.type !== 'bone') return;

  const bone = node as BoneNode;
  const clamped = clampBoneRotation(bone, rotation);

  sceneGraph.updateNode(boneId, {
    transform: {
      ...bone.transform,
      rotation: clamped,
    },
  });
}
