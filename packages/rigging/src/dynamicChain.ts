/**
 * Dynamic Bone Chain Solver for Quar Animator
 * Verlet integration physics for secondary motion (hair, cloth, tails).
 *
 * Pipeline: FK → IK → **Physics** → Smart Bones → Vitruvian → Skinning
 * Root bone is kinematic (FK-driven), children are simulated.
 */

import type {
  DynamicChain,
  DynamicChainState,
  DynamicParticle,
  Vector2,
  WindSettings,
} from '@quar/types';

/**
 * Minimal scene graph interface for dynamic chain evaluation.
 */
export interface DynamicChainSceneGraph {
  getNode(id: string):
    | {
        type: string;
        length: number;
        parent: string | null;
        transform: { position: Vector2; rotation: number };
      }
    | undefined;
  updateNode(id: string, data: Record<string, unknown>): void;
  getWorldTransform(id: string): {
    a: number;
    b: number;
    c: number;
    d: number;
    tx: number;
    ty: number;
  };
}

// ============================================================================
// Vector helpers
// ============================================================================

function v2dist(a: Vector2, b: Vector2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

const DEG_TO_RAD = Math.PI / 180;

/**
 * Get the world-space position of a bone's root joint.
 */
function getBoneWorldPos(boneId: string, sg: DynamicChainSceneGraph): Vector2 | null {
  const node = sg.getNode(boneId);
  if (!node || node.type !== 'bone') return null;
  const wt = sg.getWorldTransform(boneId);
  return { x: wt.tx, y: wt.ty };
}

/**
 * Get the world-space position of a bone's tip.
 */
function getBoneWorldTip(boneId: string, sg: DynamicChainSceneGraph): Vector2 | null {
  const node = sg.getNode(boneId);
  if (!node || node.type !== 'bone') return null;
  const wt = sg.getWorldTransform(boneId);
  const tipX = node.length;
  return {
    x: wt.a * tipX + wt.tx,
    y: wt.b * tipX + wt.ty,
  };
}

/**
 * Initialize chain state from the current bone positions.
 * Creates particles at each bone joint position + final tip.
 * Particle 0 = root bone root, Particle N = last bone tip.
 */
export function initializeChainState(
  chain: DynamicChain,
  sceneGraph: DynamicChainSceneGraph
): DynamicChainState | null {
  if (chain.boneIds.length === 0) return null;

  const particles: DynamicParticle[] = [];

  // First particle = root bone's world position
  const rootPos = getBoneWorldPos(chain.boneIds[0]!, sceneGraph);
  if (!rootPos) return null;

  particles.push({
    position: { ...rootPos },
    prevPosition: { ...rootPos },
    restLength: 0,
    restAngle: 0,
    mass: 1,
  });

  // One particle per bone tip
  for (let i = 0; i < chain.boneIds.length; i++) {
    const boneId = chain.boneIds[i]!;
    const tipPos = getBoneWorldTip(boneId, sceneGraph);
    if (!tipPos) return null;

    const node = sceneGraph.getNode(boneId);
    if (!node) return null;

    // Rest length = bone length
    const restLength = node.length;

    // Rest angle = current bone world rotation
    const wt = sceneGraph.getWorldTransform(boneId);
    const restAngle = Math.atan2(wt.b, wt.a);

    particles.push({
      position: { ...tipPos },
      prevPosition: { ...tipPos },
      restLength,
      restAngle,
      mass: 1,
    });
  }

  return {
    chainId: chain.id,
    particles,
    initialized: true,
  };
}

/**
 * Compute wind force at a given time, including turbulence.
 */
export function computeWindForce(wind: WindSettings, time: number): Vector2 {
  if (!wind.enabled || wind.strength <= 0) return { x: 0, y: 0 };

  const baseAngle = wind.direction * DEG_TO_RAD;

  // Add turbulence via sine oscillation
  const turbOffset = wind.turbulence * Math.sin(time * wind.frequency * Math.PI * 2);
  const angle = baseAngle + turbOffset * 0.5;

  const strength = wind.strength * (1 + turbOffset * 0.3);

  return {
    x: Math.cos(angle) * strength,
    y: Math.sin(angle) * strength,
  };
}

/**
 * Step a dynamic chain simulation forward by dt seconds.
 *
 * Algorithm:
 * 1. Pin particle 0 to FK root bone position (kinematic)
 * 2. Apply gravity + wind + damping forces via Verlet integration
 * 3. Apply distance constraints (maintain bone lengths)
 * 4. Apply angular constraints (stiffness toward rest pose)
 * 5. Optionally freeze an axis
 */
export function stepDynamicChain(
  chain: DynamicChain,
  state: DynamicChainState,
  sceneGraph: DynamicChainSceneGraph,
  dt: number,
  windForce: Vector2
): void {
  if (!state.initialized || state.particles.length < 2) return;
  if (dt <= 0 || dt > 0.1) return; // Guard against huge timesteps

  const { particles } = state;
  const { damping, gravity, gravityAngle, stiffness, windInfluence, elasticity, freezeAxis } =
    chain;

  // 1. Pin root to FK position
  const rootPos = getBoneWorldPos(chain.boneIds[0]!, sceneGraph);
  if (rootPos) {
    particles[0]!.position = { ...rootPos };
    particles[0]!.prevPosition = { ...rootPos };
  }

  // Gravity direction
  const gravAngleRad = gravityAngle * DEG_TO_RAD;
  const gravX = Math.cos(gravAngleRad) * gravity;
  const gravY = Math.sin(gravAngleRad) * gravity;

  // 2. Verlet integration for non-root particles
  const dampFactor = 1 - damping;
  for (let i = 1; i < particles.length; i++) {
    const p = particles[i]!;
    const vx = (p.position.x - p.prevPosition.x) * dampFactor;
    const vy = (p.position.y - p.prevPosition.y) * dampFactor;

    // Accumulated force
    const fx = gravX + windForce.x * windInfluence;
    const fy = gravY + windForce.y * windInfluence;

    const newX = p.position.x + vx + fx * dt * dt;
    const newY = p.position.y + vy + fy * dt * dt;

    p.prevPosition = { ...p.position };
    p.position = { x: newX, y: newY };
  }

  // 3. Distance constraints (several iterations for stability)
  const constraintIterations = 3;
  for (let iter = 0; iter < constraintIterations; iter++) {
    for (let i = 1; i < particles.length; i++) {
      const parent = particles[i - 1]!;
      const child = particles[i]!;
      const restLen = child.restLength;
      if (restLen <= 0) continue;

      const dx = child.position.x - parent.position.x;
      const dy = child.position.y - parent.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 1e-10) continue;

      const diff = (dist - restLen) / dist;

      // Root is kinematic (weight 0), others share correction
      if (i === 1) {
        // Only child moves (root is pinned)
        child.position.x -= dx * diff;
        child.position.y -= dy * diff;
      } else {
        // Split correction between parent and child
        const correction = diff * 0.5;
        parent.position.x += dx * correction;
        parent.position.y += dy * correction;
        child.position.x -= dx * correction;
        child.position.y -= dy * correction;
      }
    }
  }

  // 4. Angular stiffness (blend toward rest angle)
  if (stiffness > 0) {
    for (let i = 1; i < particles.length; i++) {
      const parent = particles[i - 1]!;
      const child = particles[i]!;
      const restAngle = child.restAngle;
      const restLen = child.restLength;
      if (restLen <= 0) continue;

      // Current angle from parent to child
      const dx = child.position.x - parent.position.x;
      const dy = child.position.y - parent.position.y;
      const currentAngle = Math.atan2(dy, dx);

      // Blend toward rest angle
      let angleDiff = restAngle - currentAngle;
      // Normalize to [-PI, PI]
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

      const blendedAngle = currentAngle + angleDiff * stiffness;
      const dist = v2dist(parent.position, child.position);

      child.position.x = parent.position.x + Math.cos(blendedAngle) * dist;
      child.position.y = parent.position.y + Math.sin(blendedAngle) * dist;
    }
  }

  // 5. Freeze axis (before elasticity so frozen axes aren't undone by springs)
  if (freezeAxis) {
    for (let i = 1; i < particles.length; i++) {
      if (freezeAxis === 'x') {
        // Freeze horizontal movement — keep x from rest chain
        let restX = particles[0]!.position.x;
        for (let j = 1; j <= i; j++) {
          restX += Math.cos(particles[j]!.restAngle) * particles[j]!.restLength;
        }
        particles[i]!.position.x = restX;
      } else if (freezeAxis === 'y') {
        // Freeze vertical movement — keep y from rest chain
        let restY = particles[0]!.position.y;
        for (let j = 1; j <= i; j++) {
          restY += Math.sin(particles[j]!.restAngle) * particles[j]!.restLength;
        }
        particles[i]!.position.y = restY;
      }
    }
  }

  // 6. Elasticity (spring back to rest positions)
  if (elasticity > 0) {
    // Compute rest positions from root
    let restX = particles[0]!.position.x;
    let restY = particles[0]!.position.y;

    for (let i = 1; i < particles.length; i++) {
      const p = particles[i]!;
      restX += Math.cos(p.restAngle) * p.restLength;
      restY += Math.sin(p.restAngle) * p.restLength;

      p.position.x += (restX - p.position.x) * elasticity;
      p.position.y += (restY - p.position.y) * elasticity;
    }
  }
}

/**
 * Convert simulated particle positions back to bone rotations.
 * Each bone's rotation = angle from parent particle to child particle,
 * converted from world-space to local-space.
 */
export function applyChainToBones(
  chain: DynamicChain,
  state: DynamicChainState,
  sceneGraph: DynamicChainSceneGraph
): void {
  if (!state.initialized || state.particles.length < 2) return;

  const { particles } = state;

  for (let i = 0; i < chain.boneIds.length; i++) {
    const boneId = chain.boneIds[i]!;
    const node = sceneGraph.getNode(boneId);
    if (!node || node.type !== 'bone') continue;

    const parentParticle = particles[i]!;
    const childParticle = particles[i + 1]!;

    // World angle from parent particle to child particle
    const dx = childParticle.position.x - parentParticle.position.x;
    const dy = childParticle.position.y - parentParticle.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1e-10) continue; // skip degenerate (coincident) bone
    const worldAngle = Math.atan2(dy, dx);

    // Convert world angle to local rotation:
    // For root bone (no parent), local rotation = world angle in degrees
    // For child bones, subtract parent's accumulated world angle
    let localAngleDeg: number;

    if (i === 0) {
      // Root bone: may have a non-bone parent, get parent world rotation
      const parentId = node.parent;
      if (parentId) {
        const parentWt = sceneGraph.getWorldTransform(parentId);
        const parentWorldAngle = Math.atan2(parentWt.b, parentWt.a);
        localAngleDeg = (worldAngle - parentWorldAngle) / DEG_TO_RAD;
      } else {
        localAngleDeg = worldAngle / DEG_TO_RAD;
      }
    } else {
      // Child bone: parent is previous bone
      const parentBoneParticle = particles[i - 1]!;
      const parentBoneChildParticle = particles[i]!;
      const parentWorldAngle = Math.atan2(
        parentBoneChildParticle.position.y - parentBoneParticle.position.y,
        parentBoneChildParticle.position.x - parentBoneParticle.position.x
      );
      localAngleDeg = (worldAngle - parentWorldAngle) / DEG_TO_RAD;
    }

    sceneGraph.updateNode(boneId, {
      transform: { ...node.transform, rotation: localAngleDeg },
    });
  }
}
