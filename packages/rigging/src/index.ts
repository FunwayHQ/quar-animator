/**
 * @quar/rigging
 * Bones, IK, and weight painting for Quar Animator
 */

// Placeholder exports - to be implemented in Phase 2
export const RIGGING_VERSION = '0.1.0';

export interface Bone {
  id: string;
  name: string;
  parent: string | null;
  children: string[];
  position: { x: number; y: number };
  rotation: number;
  length: number;
  visible: boolean;
}

export interface Skeleton {
  id: string;
  name: string;
  bones: Map<string, Bone>;
  rootBones: string[];
}

// Placeholder function
export function createBone(
  id: string,
  name: string,
  position: { x: number; y: number },
  length: number
): Bone {
  return {
    id,
    name,
    parent: null,
    children: [],
    position,
    rotation: 0,
    length,
    visible: true,
  };
}

export function createSkeleton(id: string, name: string): Skeleton {
  return {
    id,
    name,
    bones: new Map(),
    rootBones: [],
  };
}
