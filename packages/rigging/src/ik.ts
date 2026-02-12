/**
 * FABRIK IK Solver for Quar Animator
 * Forward And Backward Reaching Inverse Kinematics
 */

import type { BoneNode, Node, Vector2 } from '@quar/types';

/** Minimal SceneGraph interface used by IK functions */
export interface IKSceneGraph {
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

/** A joint in the IK chain with world-space data */
export interface IKJoint {
  boneId: string;
  worldPos: Vector2;
  boneLength: number;
  angleMin?: number;
  angleMax?: number;
}

/** Result of an IK solve */
export interface IKSolveResult {
  /** boneId → new local rotation (degrees) */
  rotations: Map<string, number>;
  converged: boolean;
  endEffectorError: number;
}

/** Configuration for the FABRIK solver */
export interface FABRIKConfig {
  joints: IKJoint[];
  target: Vector2;
  poleTarget?: Vector2;
  maxIterations: number;
  tolerance: number;
}

/** IK chain definition stored in editor state */
export interface IKChain {
  id: string;
  name: string;
  rootBoneId: string;
  endEffectorBoneId: string;
  targetNodeId: string;
  poleTargetNodeId?: string;
  maxIterations: number;
  tolerance: number;
  enabled: boolean;
}

// ============================================================================
// Vector helpers (local, avoids importing @quar/core)
// ============================================================================

function v2dist(a: Vector2, b: Vector2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function v2sub(a: Vector2, b: Vector2): Vector2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

function v2add(a: Vector2, b: Vector2): Vector2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

function v2scale(v: Vector2, s: number): Vector2 {
  return { x: v.x * s, y: v.y * s };
}

function v2normalize(v: Vector2): Vector2 {
  const len = Math.sqrt(v.x * v.x + v.y * v.y);
  if (len < 1e-10) return { x: 1, y: 0 };
  return { x: v.x / len, y: v.y / len };
}

function v2dot(a: Vector2, b: Vector2): number {
  return a.x * b.x + a.y * b.y;
}

/**
 * Normalize angle to [-180, 180] range (degrees).
 */
function normalizeAngle(deg: number): number {
  let a = deg % 360;
  if (a > 180) a -= 360;
  if (a < -180) a += 360;
  return a;
}

// ============================================================================
// FABRIK Solver
// ============================================================================

/**
 * Solve an IK chain using the FABRIK algorithm.
 *
 * The joints array is ordered root-to-tip. Each joint has a world position
 * and a bone length (the distance from this joint to the next).
 * The last joint is the end effector — its bone length is unused.
 *
 * Returns new local rotations for each bone.
 */
export function solveFABRIK(config: FABRIKConfig): IKSolveResult {
  const { joints, target, poleTarget, maxIterations, tolerance } = config;

  if (joints.length === 0) {
    return { rotations: new Map(), converged: true, endEffectorError: 0 };
  }

  if (joints.length === 1) {
    // Single bone: just rotate toward target
    const bone = joints[0];
    const toTarget = v2sub(target, bone.worldPos);
    let angle = Math.atan2(toTarget.y, toTarget.x) * (180 / Math.PI);
    if (bone.angleMin != null || bone.angleMax != null) {
      const min = bone.angleMin ?? -Infinity;
      const max = bone.angleMax ?? Infinity;
      angle = Math.max(min, Math.min(max, angle));
    }
    const dist = v2dist(bone.worldPos, target);
    return {
      rotations: new Map([[bone.boneId, angle]]),
      converged: dist <= bone.boneLength + tolerance,
      endEffectorError: Math.max(0, dist - bone.boneLength),
    };
  }

  // Build working positions array (one extra for end effector tip)
  const positions: Vector2[] = joints.map((j) => ({ ...j.worldPos }));
  // Add end effector tip position (last bone's tip)
  const lastJoint = joints[joints.length - 1];
  const secondToLast = joints.length >= 2 ? joints[joints.length - 2] : null;
  // Compute tip from last joint's world pos + its bone length in the direction of last bone
  if (secondToLast) {
    const dir = v2normalize(v2sub(lastJoint.worldPos, secondToLast.worldPos));
    positions.push(v2add(lastJoint.worldPos, v2scale(dir, lastJoint.boneLength)));
  } else {
    positions.push({ x: lastJoint.worldPos.x + lastJoint.boneLength, y: lastJoint.worldPos.y });
  }

  // Bone lengths: distance from positions[i] to positions[i+1]
  const boneLengths: number[] = [];
  for (let i = 0; i < joints.length; i++) {
    boneLengths.push(joints[i].boneLength);
  }

  const rootPos = { ...positions[0] };
  const totalLength = boneLengths.reduce((sum, l) => sum + l, 0);
  const distToTarget = v2dist(rootPos, target);

  // Unreachable target: extend fully toward target
  if (distToTarget > totalLength) {
    const dir = v2normalize(v2sub(target, rootPos));
    positions[0] = { ...rootPos };
    for (let i = 0; i < boneLengths.length; i++) {
      positions[i + 1] = v2add(positions[i], v2scale(dir, boneLengths[i]));
    }
  } else {
    // FABRIK iterations
    for (let iter = 0; iter < maxIterations; iter++) {
      const endIdx = positions.length - 1;

      // Check convergence
      const error = v2dist(positions[endIdx], target);
      if (error <= tolerance) break;

      // === Backward pass: start from end effector, move toward root ===
      positions[endIdx] = { ...target };
      for (let i = endIdx - 1; i >= 0; i--) {
        const dir = v2normalize(v2sub(positions[i], positions[i + 1]));
        positions[i] = v2add(positions[i + 1], v2scale(dir, boneLengths[i]));
      }

      // === Forward pass: start from root, move toward end effector ===
      positions[0] = { ...rootPos };
      for (let i = 0; i < boneLengths.length; i++) {
        const dir = v2normalize(v2sub(positions[i + 1], positions[i]));
        positions[i + 1] = v2add(positions[i], v2scale(dir, boneLengths[i]));
      }

      // === Pole target projection ===
      if (poleTarget && joints.length >= 3) {
        applyPoleTarget(positions, boneLengths, poleTarget);
      }

      // === Constraint pass ===
      applyConstraints(positions, boneLengths, joints, rootPos);
    }
  }

  // Convert positions to local rotations
  const rotations = positionsToRotations(positions, joints);

  const endEffectorError = v2dist(positions[positions.length - 1], target);

  return {
    rotations,
    converged: endEffectorError <= tolerance,
    endEffectorError,
  };
}

/**
 * Apply pole target to mid-chain joints.
 * Projects intermediate joints toward the pole target plane.
 */
function applyPoleTarget(positions: Vector2[], boneLengths: number[], poleTarget: Vector2): void {
  if (positions.length <= 3) {
    // Only one middle joint — project it toward the pole target
    const root = positions[0];
    const end = positions[positions.length - 1];

    // Chain axis from root to end effector
    const chainDir = v2normalize(v2sub(end, root));
    const chainLen = v2dist(root, end);
    if (chainLen < 1e-10) return;

    // For the middle joint, project pole target onto perpendicular
    const mid = positions[1];
    const midRel = v2sub(mid, root);
    const projLen = v2dot(midRel, chainDir);
    const projOnChain = v2add(root, v2scale(chainDir, projLen));

    // Direction from chain to pole target
    const poleRel = v2sub(poleTarget, projOnChain);
    const poleDist = Math.sqrt(poleRel.x * poleRel.x + poleRel.y * poleRel.y);
    if (poleDist < 1e-10) return;

    // Distance from chain axis to current mid joint
    const currentOff = v2sub(mid, projOnChain);
    const offDist = Math.sqrt(currentOff.x * currentOff.x + currentOff.y * currentOff.y);
    if (offDist < 1e-10) return;

    // Move mid joint to same distance but in pole target direction
    const poleDir = v2normalize(poleRel);
    positions[1] = v2add(projOnChain, v2scale(poleDir, offDist));

    // Re-enforce bone lengths
    const dir0 = v2normalize(v2sub(positions[1], positions[0]));
    positions[1] = v2add(positions[0], v2scale(dir0, boneLengths[0]));
    const dir1 = v2normalize(v2sub(positions[2], positions[1]));
    positions[2] = v2add(positions[1], v2scale(dir1, boneLengths[1]));
    return;
  }

  // For longer chains, apply pole target to the middle joints
  const root = positions[0];
  const end = positions[positions.length - 1];
  const chainDir = v2normalize(v2sub(end, root));
  const chainLen = v2dist(root, end);
  if (chainLen < 1e-10) return;

  for (let i = 1; i < positions.length - 1; i++) {
    const joint = positions[i];
    const jointRel = v2sub(joint, root);
    const projLen = v2dot(jointRel, chainDir);
    const projOnChain = v2add(root, v2scale(chainDir, projLen));

    const poleRel = v2sub(poleTarget, projOnChain);
    const poleDist = Math.sqrt(poleRel.x * poleRel.x + poleRel.y * poleRel.y);
    if (poleDist < 1e-10) continue;

    const currentOff = v2sub(joint, projOnChain);
    const offDist = Math.sqrt(currentOff.x * currentOff.x + currentOff.y * currentOff.y);
    if (offDist < 1e-10) continue;

    const poleDir = v2normalize(poleRel);
    positions[i] = v2add(projOnChain, v2scale(poleDir, offDist));
  }

  // Re-enforce bone lengths from root forward
  for (let i = 0; i < positions.length - 2; i++) {
    const dir = v2normalize(v2sub(positions[i + 1], positions[i]));
    positions[i + 1] = v2add(positions[i], v2scale(dir, boneLengths[i]));
  }
}

/**
 * Apply angle constraints to the chain joints.
 * Re-enforces bone lengths after constraint application.
 */
function applyConstraints(
  positions: Vector2[],
  boneLengths: number[],
  joints: IKJoint[],
  rootPos: Vector2
): void {
  positions[0] = { ...rootPos };

  for (let i = 0; i < joints.length; i++) {
    const joint = joints[i];
    if (joint.angleMin == null && joint.angleMax == null) continue;

    // Compute current angle of bone i (from positions[i] to positions[i+1])
    const dir = v2sub(positions[i + 1], positions[i]);
    const angle = Math.atan2(dir.y, dir.x) * (180 / Math.PI);

    // Clamp to constraints
    const min = joint.angleMin ?? -Infinity;
    const max = joint.angleMax ?? Infinity;
    const clamped = Math.max(min, Math.min(max, angle));

    if (Math.abs(clamped - angle) > 0.001) {
      // Reposition next joint at clamped angle
      const rad = clamped * (Math.PI / 180);
      positions[i + 1] = {
        x: positions[i].x + Math.cos(rad) * boneLengths[i],
        y: positions[i].y + Math.sin(rad) * boneLengths[i],
      };

      // Re-enforce downstream bone lengths
      for (let j = i + 1; j < boneLengths.length; j++) {
        const d = v2normalize(v2sub(positions[j + 1], positions[j]));
        positions[j + 1] = v2add(positions[j], v2scale(d, boneLengths[j]));
      }
    }
  }
}

/**
 * Convert solved world positions back to local rotations per bone.
 *
 * For bone i, the rotation is the angle from positions[i] to positions[i+1]
 * in world space. For the root bone, this is the absolute world rotation.
 * For child bones, we subtract the parent's world rotation to get local rotation.
 */
function positionsToRotations(positions: Vector2[], joints: IKJoint[]): Map<string, number> {
  const rotations = new Map<string, number>();
  const worldRotations: number[] = [];

  for (let i = 0; i < joints.length; i++) {
    const dir = v2sub(positions[i + 1], positions[i]);
    const worldAngle = Math.atan2(dir.y, dir.x) * (180 / Math.PI);
    worldRotations.push(worldAngle);

    // Local rotation = world rotation - parent's world rotation
    // Root bone: local = world (no parent)
    let localAngle: number;
    if (i === 0) {
      localAngle = worldAngle;
    } else {
      localAngle = normalizeAngle(worldAngle - worldRotations[i - 1]);
    }

    rotations.set(joints[i].boneId, localAngle);
  }

  return rotations;
}

// ============================================================================
// Scene Graph Integration
// ============================================================================

/**
 * Extract IK joints from a bone chain in the scene graph.
 * Returns joints ordered root-to-tip.
 *
 * @param rootBoneId - The root bone of the IK chain
 * @param endBoneId - The end effector bone
 * @param sceneGraph - Scene graph to read bone data from
 */
export function extractIKJoints(
  rootBoneId: string,
  endBoneId: string,
  sceneGraph: IKSceneGraph
): IKJoint[] {
  // Walk from end effector to root, collecting bones
  const chain: BoneNode[] = [];
  let currentId: string | null = endBoneId;

  while (currentId) {
    const node = sceneGraph.getNode(currentId);
    if (!node || node.type !== 'bone') break;
    chain.unshift(node as BoneNode);
    if (currentId === rootBoneId) break;
    currentId = node.parent;
  }

  // Validate chain starts at root
  if (chain.length === 0 || chain[0].id !== rootBoneId) {
    return [];
  }

  // Build IKJoint array with world positions
  return chain.map((bone) => {
    const wt = sceneGraph.getWorldTransform(bone.id);
    return {
      boneId: bone.id,
      worldPos: { x: wt.tx, y: wt.ty },
      boneLength: bone.length,
      angleMin: bone.angleMin,
      angleMax: bone.angleMax,
    };
  });
}

/**
 * Apply IK solve result to the scene graph.
 * Sets each bone's rotation (with FK constraint clamping via poseBone pattern).
 */
export function applyIKResult(result: IKSolveResult, sceneGraph: IKSceneGraph): void {
  for (const [boneId, rotation] of result.rotations) {
    const node = sceneGraph.getNode(boneId);
    if (!node || node.type !== 'bone') continue;

    const bone = node as BoneNode;

    // Apply constraint clamping
    let clamped = rotation;
    if (bone.angleMin != null || bone.angleMax != null) {
      const min = bone.angleMin ?? -Infinity;
      const max = bone.angleMax ?? Infinity;
      clamped = Math.max(min, Math.min(max, clamped));
    }

    sceneGraph.updateNode(boneId, {
      transform: {
        ...bone.transform,
        rotation: clamped,
      },
    });
  }
}
