/**
 * Bone Helpers for Quar Animator
 * Utility functions for creating and manipulating bones in the scene graph
 */

import type { BoneNode, BoneStyle, Node, Vector2 } from '@quar/types';

/** Minimal SceneGraph interface used by bone helpers */
interface BoneSceneGraph {
  getNode(id: string): Node | undefined;
  updateNode(id: string, data: Partial<Node>): void;
  moveNode(id: string, parentId: string): void;
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
 * Create a BoneNode with proper defaults.
 * Bones use anchor (0,0) — they pivot at their root joint.
 */
export function createBoneNode(
  id: string,
  name: string,
  position: Vector2,
  length: number,
  rotation = 0,
  boneStyle: BoneStyle = 'octahedral',
  boneColor = '#E0E0E0'
): BoneNode {
  return {
    id,
    name,
    type: 'bone',
    parent: null,
    children: [],
    transform: {
      position: { x: position.x, y: position.y },
      rotation,
      scale: { x: 1, y: 1 },
      anchor: { x: 0, y: 0 },
      skew: { x: 0, y: 0 },
    },
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    length,
    boneStyle,
    boneColor,
  };
}

/**
 * Chain a child bone to a parent bone's tip.
 * Sets child position to {x: parent.length, y: 0} in parent-local space
 * and parents it in the scene graph.
 */
export function chainBone(
  parentBone: BoneNode,
  childBoneId: string,
  sceneGraph: BoneSceneGraph
): void {
  const child = sceneGraph.getNode(childBoneId);
  if (!child || child.type !== 'bone') return;

  // Position at parent's tip in parent-local space
  sceneGraph.updateNode(childBoneId, {
    transform: {
      ...child.transform,
      position: { x: parentBone.length, y: 0 },
    },
  });

  // Set parent-child relationship
  sceneGraph.moveNode(childBoneId, parentBone.id);
}

/**
 * Walk the parent chain from a bone to the root, returning root-to-leaf array.
 */
export function getBoneChain(boneId: string, sceneGraph: BoneSceneGraph): BoneNode[] {
  const chain: BoneNode[] = [];
  let currentId: string | null = boneId;

  while (currentId) {
    const node = sceneGraph.getNode(currentId);
    if (!node || node.type !== 'bone') break;
    chain.unshift(node as BoneNode);
    currentId = node.parent;
  }

  return chain;
}

/**
 * Get the tip position of a bone in local space.
 */
export function getBoneTip(bone: BoneNode): Vector2 {
  return { x: bone.length, y: 0 };
}

/**
 * Get the tip position of a bone in world space.
 * Transforms the local tip through the full world matrix.
 */
export function getBoneWorldTip(boneId: string, sceneGraph: BoneSceneGraph): Vector2 | null {
  const node = sceneGraph.getNode(boneId);
  if (!node || node.type !== 'bone') return null;

  const bone = node as BoneNode;
  const worldTransform = sceneGraph.getWorldTransform(boneId);

  // Transform the tip point (bone.length, 0) through the world matrix
  // worldTransform is a Matrix3 = [a, b, c, d, e, f, 0, 0, 1] in column-major
  const tipX = bone.length;
  const tipY = 0;
  const wx = worldTransform.a * tipX + worldTransform.c * tipY + worldTransform.tx;
  const wy = worldTransform.b * tipX + worldTransform.d * tipY + worldTransform.ty;

  return { x: wx, y: wy };
}
