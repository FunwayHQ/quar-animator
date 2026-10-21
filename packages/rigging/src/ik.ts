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
  /** Where the bone pivots, in world space */
  worldPos: Vector2;
  /** World distance from this joint to the next one (the last: to the bone's tip) */
  boneLength: number;
  angleMin?: number;
  angleMax?: number;
  /** World rotation (degrees) of the chain root's parent, so the root's local
   * rotation is expressed correctly when the chain sits under a rotated parent. */
  rootParentWorldRotation?: number;
  /** The bone's local rotation in the pose the solve starts from (degrees) */
  localRotation?: number;
  /** The bone's parent frame is mirrored: its world angle turns against its local rotation */
  mirrored?: boolean;
  /** Last joint only: the end effector's tip, in world space */
  tipWorld?: Vector2;
}

/** Result of an IK solve */
export interface IKSolveResult {
  /** boneId → new local rotation (degrees), root first */
  rotations: Map<string, number>;
  converged: boolean;
  endEffectorError: number;
  /** The solved joints, root first, then the tip (world space) */
  positions?: Vector2[];
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
  return (((deg % 360) + 540) % 360) - 180;
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
    const bone = joints[0]!;
    const rootParentRot = bone.rootParentWorldRotation ?? 0;
    const toTarget = v2sub(target, bone.worldPos);
    let angle = Math.atan2(toTarget.y, toTarget.x) * (180 / Math.PI);
    // Express as a local rotation under the (possibly rotated) parent.
    if (rootParentRot) angle = normalizeAngle(angle - rootParentRot);
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
      positions: [
        { ...bone.worldPos },
        v2add(bone.worldPos, v2scale(v2normalize(toTarget), bone.boneLength)),
      ],
    };
  }

  // Build working positions array (one extra for end effector tip)
  const positions: Vector2[] = joints.map((j) => ({ ...j.worldPos }));
  // Add end effector tip position (last bone's tip)
  const lastJoint = joints[joints.length - 1]!;
  const secondToLast = joints.length >= 2 ? joints[joints.length - 2] : null;
  // The tip as extracted, else from the last joint along the direction of the last bone
  if (lastJoint.tipWorld) {
    positions.push({ ...lastJoint.tipWorld });
  } else if (secondToLast) {
    const dir = v2normalize(v2sub(lastJoint.worldPos, secondToLast.worldPos));
    positions.push(v2add(lastJoint.worldPos, v2scale(dir, lastJoint.boneLength)));
  } else {
    positions.push({ x: lastJoint.worldPos.x + lastJoint.boneLength, y: lastJoint.worldPos.y });
  }

  // Bone lengths: distance from positions[i] to positions[i+1]
  const boneLengths: number[] = [];
  for (let i = 0; i < joints.length; i++) {
    boneLengths.push(joints[i]!.boneLength);
  }

  const rootPos: Vector2 = { ...positions[0]! };
  const totalLength = boneLengths.reduce((sum, l) => sum + l, 0);
  // The starting pose, for angle limits (which are local rotations)
  const rest = restAngles(positions, joints);
  const distToTarget = v2dist(rootPos, target);

  // Unreachable target: extend fully toward target
  if (distToTarget > totalLength) {
    if (distToTarget < 1e-10) return { rotations: new Map(), converged: true, endEffectorError: 0 }; // target at root — no solution
    const dir = v2normalize(v2sub(target, rootPos));
    positions[0] = { ...rootPos };
    for (let i = 0; i < boneLengths.length; i++) {
      positions[i + 1] = v2add(positions[i]!, v2scale(dir, boneLengths[i]!));
    }
  } else {
    // A straight two-bone chain can remain straight under FABRIK when the
    // target lies on its axis. Seed the exact bend selected by the pole.
    if (poleTarget && joints.length === 2) {
      positions[2] = { ...target };
      applyPoleTarget(positions, boneLengths, poleTarget);
      applyConstraints(positions, boneLengths, joints, rootPos, rest);
    } else if (
      !poleTarget &&
      isStraight(positions) &&
      v2dist(positions[positions.length - 1]!, target) > tolerance &&
      distToTarget < totalLength - tolerance
    ) {
      // FABRIK can't bend a straight chain toward a target on its axis: start it bent
      bendSlightly(positions, boneLengths, joints);
    }

    // FABRIK iterations
    for (let iter = 0; iter < maxIterations; iter++) {
      const endIdx = positions.length - 1;

      // Check convergence
      const error = v2dist(positions[endIdx]!, target);
      if (error <= tolerance) break;

      // === Backward pass: start from end effector, move toward root ===
      positions[endIdx] = { ...target };
      for (let i = endIdx - 1; i >= 0; i--) {
        const dir = v2normalize(v2sub(positions[i]!, positions[i + 1]!));
        positions[i] = v2add(positions[i + 1]!, v2scale(dir, boneLengths[i]!));
      }

      // === Forward pass: start from root, move toward end effector ===
      positions[0] = { ...rootPos };
      for (let i = 0; i < boneLengths.length; i++) {
        const dir = v2normalize(v2sub(positions[i + 1]!, positions[i]!));
        positions[i + 1] = v2add(positions[i]!, v2scale(dir, boneLengths[i]!));
      }

      // === Pole target projection ===
      if (poleTarget && joints.length >= 2) {
        applyPoleTarget(positions, boneLengths, poleTarget);
      }

      // === Constraint pass ===
      applyConstraints(positions, boneLengths, joints, rootPos, rest);
    }
  }

  // Convert positions to local rotations
  const rotations = new Map<string, number>();
  joints.forEach((joint, i) => rotations.set(joint.boneId, localAngle(positions, i, joints, rest)));

  const endEffectorError = v2dist(positions[positions.length - 1]!, target);

  return {
    rotations,
    converged: endEffectorError <= tolerance,
    endEffectorError,
    positions,
  };
}

/** The starting pose's segment angles and local rotations (degrees). */
interface RestAngles {
  /** World angle of each segment; [-1] is the chain root's parent */
  segments: number[];
  parent: number;
  locals: number[];
}

function segmentAngle(positions: Vector2[], i: number): number {
  const dir = v2sub(positions[i + 1]!, positions[i]!);
  return Math.atan2(dir.y, dir.x) * (180 / Math.PI);
}

function restAngles(positions: Vector2[], joints: IKJoint[]): RestAngles {
  const parent = joints[0]?.rootParentWorldRotation ?? 0;
  const segments = joints.map((_, i) => segmentAngle(positions, i));
  const locals = joints.map(
    (joint, i) =>
      joint.localRotation ?? normalizeAngle(segments[i]! - (i === 0 ? parent : segments[i - 1]!))
  );
  return { segments, parent, locals };
}

/**
 * Bone i's local rotation for the joints where they are: its rotation at the
 * start, turned by how much its segment turned relative to its parent's
 * (against it under a mirrored parent).
 */
function localAngle(positions: Vector2[], i: number, joints: IKJoint[], rest: RestAngles): number {
  const sign = joints[i]!.mirrored ? -1 : 1;
  const parentNow = i === 0 ? rest.parent : segmentAngle(positions, i - 1);
  const parentRest = i === 0 ? rest.parent : rest.segments[i - 1]!;
  const turned = normalizeAngle(
    segmentAngle(positions, i) - parentNow - (rest.segments[i]! - parentRest)
  );
  return rest.locals[i]! + sign * turned;
}

/** Whether every segment of the chain points the same way. */
function isStraight(positions: Vector2[]): boolean {
  if (positions.length < 3) return false;
  const first = v2normalize(v2sub(positions[1]!, positions[0]!));
  for (let i = 1; i < positions.length - 1; i++) {
    const dir = v2normalize(v2sub(positions[i + 1]!, positions[i]!));
    if (Math.abs(first.x * dir.y - first.y * dir.x) > 1e-3 || v2dot(first, dir) < 0) return false;
  }
  return true;
}

/**
 * Bend a straight chain a few degrees at each joint: toward the side its
 * angle limits allow, else counter-clockwise.
 */
function bendSlightly(positions: Vector2[], boneLengths: number[], joints: IKJoint[]): void {
  let side = 1;
  for (const joint of joints.slice(1)) {
    const sign = joint.mirrored ? -1 : 1;
    if (joint.angleMin != null && joint.angleMin >= 0) {
      side = sign;
      break;
    }
    if (joint.angleMax != null && joint.angleMax <= 0) {
      side = -sign;
      break;
    }
  }
  // The joints off the root–tip line, so the first pass doesn't straighten them again:
  // the first segment turned back, each joint after it turned the other way
  const step = (side * 10 * Math.PI) / 180;
  let angle =
    Math.atan2(positions[1]!.y - positions[0]!.y, positions[1]!.x - positions[0]!.x) - step;
  for (let i = 0; i < boneLengths.length; i++) {
    positions[i + 1] = {
      x: positions[i]!.x + Math.cos(angle) * boneLengths[i]!,
      y: positions[i]!.y + Math.sin(angle) * boneLengths[i]!,
    };
    angle += (2 * step) / Math.max(1, boneLengths.length - 1);
  }
}

/**
 * Apply pole target to mid-chain joints.
 * Projects intermediate joints toward the pole target plane.
 */
function applyPoleTarget(positions: Vector2[], boneLengths: number[], poleTarget: Vector2): void {
  if (positions.length === 3) {
    // The middle joint has two circle-intersection solutions. Choose the one
    // on the pole side even when the initial chain is perfectly straight.
    const root = positions[0]!;
    const end = positions[2]!;
    const chainLen = v2dist(root, end);
    if (chainLen < 1e-10) return;
    const axis = v2normalize(v2sub(end, root));
    const firstLength = boneLengths[0]!;
    const secondLength = boneLengths[1]!;
    const along =
      (firstLength * firstLength - secondLength * secondLength + chainLen * chainLen) /
      (2 * chainLen);
    const height = Math.sqrt(Math.max(0, firstLength * firstLength - along * along));
    const poleOffset = v2sub(poleTarget, root);
    const side = axis.x * poleOffset.y - axis.y * poleOffset.x >= 0 ? 1 : -1;
    positions[1] = {
      x: root.x + axis.x * along - axis.y * height * side,
      y: root.y + axis.y * along + axis.x * height * side,
    };
    return;
  }

  // For longer chains, apply pole target to the middle joints
  const root = positions[0]!;
  const end = positions[positions.length - 1]!;
  const chainDir = v2normalize(v2sub(end, root));
  const chainLen = v2dist(root, end);
  if (chainLen < 1e-10) return;

  for (let i = 1; i < positions.length - 1; i++) {
    const joint = positions[i]!;
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
    const dir = v2normalize(v2sub(positions[i + 1]!, positions[i]!));
    positions[i + 1] = v2add(positions[i]!, v2scale(dir, boneLengths[i]!));
  }
}

/**
 * Apply angle limits (local rotations) to the chain joints.
 * Re-enforces bone lengths after constraint application.
 */
function applyConstraints(
  positions: Vector2[],
  boneLengths: number[],
  joints: IKJoint[],
  rootPos: Vector2,
  rest: RestAngles
): void {
  positions[0] = { ...rootPos };

  for (let i = 0; i < joints.length; i++) {
    const joint = joints[i]!;
    if (joint.angleMin == null && joint.angleMax == null) continue;

    const local = localAngle(positions, i, joints, rest);
    const min = joint.angleMin ?? -Infinity;
    const max = joint.angleMax ?? Infinity;
    const clamped = Math.max(min, Math.min(max, local));

    if (Math.abs(clamped - local) > 0.001) {
      // Turn the segment back by the excess, and the joint with it
      const sign = joint.mirrored ? -1 : 1;
      const rad = (segmentAngle(positions, i) + sign * (clamped - local)) * (Math.PI / 180);
      positions[i + 1] = {
        x: positions[i]!.x + Math.cos(rad) * boneLengths[i]!,
        y: positions[i]!.y + Math.sin(rad) * boneLengths[i]!,
      };

      // Re-enforce downstream bone lengths
      for (let j = i + 1; j < boneLengths.length; j++) {
        const d = v2normalize(v2sub(positions[j + 1]!, positions[j]!));
        positions[j + 1] = v2add(positions[j]!, v2scale(d, boneLengths[j]!));
      }
    }
  }
}

// ============================================================================
// Scene Graph Integration
// ============================================================================

type Affine = { a: number; b: number; c: number; d: number; tx: number; ty: number };

const IDENTITY: Affine = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };

function multiply(m: Affine, n: Affine): Affine {
  return {
    a: m.a * n.a + m.c * n.b,
    b: m.b * n.a + m.d * n.b,
    c: m.a * n.c + m.c * n.d,
    d: m.b * n.c + m.d * n.d,
    tx: m.a * n.tx + m.c * n.ty + m.tx,
    ty: m.b * n.tx + m.d * n.ty + m.ty,
  };
}

function apply(m: Affine, p: Vector2): Vector2 {
  return { x: m.a * p.x + m.c * p.y + m.tx, y: m.b * p.x + m.d * p.y + m.ty };
}

/** A bone's local matrix with this rotation (as SceneGraph composes it: T·R·S·T(−anchor)). */
function localMatrix(bone: BoneNode, rotation: number): Affine {
  const { position, scale, anchor } = bone.transform;
  const rad = rotation * (Math.PI / 180);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const a = cos * scale.x;
  const b = sin * scale.x;
  const c = -sin * scale.y;
  const d = cos * scale.y;
  return {
    a,
    b,
    c,
    d,
    tx: position.x - (a * anchor.x + c * anchor.y),
    ty: position.y - (b * anchor.x + d * anchor.y),
  };
}

/** The chain's bones, root first, or [] when the end bone isn't under the root. */
function chainBones(rootBoneId: string, endBoneId: string, sceneGraph: IKSceneGraph): BoneNode[] {
  const chain: BoneNode[] = [];
  let currentId: string | null = endBoneId;
  while (currentId) {
    const node = sceneGraph.getNode(currentId);
    if (!node || node.type !== 'bone') break;
    chain.unshift(node);
    if (currentId === rootBoneId) break;
    currentId = node.parent;
  }
  return chain.length > 0 && chain[0]!.id === rootBoneId ? chain : [];
}

/**
 * Extract IK joints from a bone chain in the scene graph.
 * Returns joints ordered root-to-tip.
 *
 * @param rootBoneId - The root bone of the IK chain
 * @param endBoneId - The end effector bone
 * @param sceneGraph - Scene graph to read bone data from
 * @param startRotations - Local rotations to pose the chain with first (the
 *   pose before IK); bones not listed keep their current rotation
 */
export function extractIKJoints(
  rootBoneId: string,
  endBoneId: string,
  sceneGraph: IKSceneGraph,
  startRotations?: Map<string, number>
): IKJoint[] {
  const chain = chainBones(rootBoneId, endBoneId, sceneGraph);
  if (chain.length === 0) return [];

  // The chain's world matrices in the starting pose: scale, mirroring and
  // offset heads included
  const rootParent = chain[0]!.parent;
  let parentWorld: Affine = rootParent ? sceneGraph.getWorldTransform(rootParent) : IDENTITY;
  const rootParentWorldRotation = Math.atan2(parentWorld.b, parentWorld.a) * (180 / Math.PI);
  const posed = chain.map((bone) => {
    const rotation = startRotations?.get(bone.id) ?? bone.transform.rotation;
    const mirrored = parentWorld.a * parentWorld.d - parentWorld.b * parentWorld.c < 0;
    const pivot = apply(parentWorld, bone.transform.position);
    const world = multiply(parentWorld, localMatrix(bone, rotation));
    parentWorld = world;
    return { bone, rotation, mirrored, pivot, world };
  });

  return posed.map(({ bone, rotation, mirrored, pivot, world }, i) => {
    const next = posed[i + 1]?.pivot ?? apply(world, { x: bone.length, y: 0 });
    return {
      boneId: bone.id,
      worldPos: pivot,
      boneLength: v2dist(pivot, next),
      angleMin: bone.angleMin,
      angleMax: bone.angleMax,
      localRotation: rotation,
      mirrored,
      ...(i === 0 ? { rootParentWorldRotation } : {}),
      ...(i === posed.length - 1 ? { tipWorld: next } : {}),
    };
  });
}

/**
 * Apply IK solve result to the scene graph, root first. With solved
 * positions, each bone is turned so that its next joint (or tip) lands on its
 * solved position, through its parent's world matrix as it is then, so scale,
 * mirroring and offset heads come out exact. Rotations are clamped to the
 * bone's limits and kept to the turn nearest the bone's current rotation.
 */
export function applyIKResult(result: IKSolveResult, sceneGraph: IKSceneGraph): void {
  const boneIds = [...result.rotations.keys()];
  boneIds.forEach((boneId, i) => {
    const node = sceneGraph.getNode(boneId);
    if (!node || node.type !== 'bone') return;
    const bone = node;

    let rotation = result.rotations.get(boneId);
    if (rotation === undefined) return;
    const solvedNext = result.positions?.[i + 1];
    if (solvedNext) {
      const aimed = aimRotation(bone, boneIds[i + 1], solvedNext, sceneGraph);
      if (aimed !== null) rotation = aimed;
    }
    rotation = bone.transform.rotation + normalizeAngle(rotation - bone.transform.rotation);

    // Apply constraint clamping
    let clamped = rotation;
    if (bone.angleMin != null || bone.angleMax != null) {
      const min = bone.angleMin ?? -Infinity;
      const max = bone.angleMax ?? Infinity;
      clamped = Math.max(min, Math.min(max, clamped));
    }

    // Skip the write when the pose is unchanged: evaluateIKChains runs every
    // frame in the render loop while any enabled chain exists, and updateNode
    // unconditionally invalidates the world transform and emits nodeChanged.
    if (Math.abs(clamped - bone.transform.rotation) < 1e-4) return;

    sceneGraph.updateNode(boneId, {
      transform: {
        ...bone.transform,
        rotation: clamped,
      },
    });
  });
}

/**
 * The local rotation that puts a bone's next joint (the next bone's head, or
 * its own tip) on `target`, given where its parent is now. Null if the parent
 * frame is degenerate or the target is on the pivot.
 */
function aimRotation(
  bone: BoneNode,
  nextBoneId: string | undefined,
  target: Vector2,
  sceneGraph: IKSceneGraph
): number | null {
  const parent: Affine = bone.parent ? sceneGraph.getWorldTransform(bone.parent) : IDENTITY;
  const det = parent.a * parent.d - parent.b * parent.c;
  if (Math.abs(det) < 1e-12) return null;
  const pivot = apply(parent, bone.transform.position);
  const dx = target.x - pivot.x;
  const dy = target.y - pivot.y;
  if (dx * dx + dy * dy < 1e-12) return null;
  // The direction in the parent's space
  const px = (parent.d * dx - parent.c * dy) / det;
  const py = (-parent.b * dx + parent.a * dy) / det;

  const nextNode = nextBoneId ? sceneGraph.getNode(nextBoneId) : undefined;
  const next = nextNode ? nextNode.transform.position : { x: bone.length, y: 0 };
  const { scale, anchor } = bone.transform;
  const wx = scale.x * (next.x - anchor.x);
  const wy = scale.y * (next.y - anchor.y);
  if (wx * wx + wy * wy < 1e-12) return null;
  return (Math.atan2(py, px) - Math.atan2(wy, wx)) * (180 / Math.PI);
}
