/**
 * Bake Dynamic Chain to Keyframes for Quar Animator
 * Simulates a dynamic chain frame-by-frame and records bone rotations as keyframes.
 */

import type { DynamicChain, DynamicChainState, WindSettings, Keyframe } from '@quar/types';
import {
  initializeChainState,
  stepDynamicChain,
  applyChainToBones,
  computeWindForce,
  type DynamicChainSceneGraph,
} from './dynamicChain';

/** Result of baking a dynamic chain: per-bone rotation keyframes */
export interface BakedChainKeyframes {
  /** Map of boneId → array of rotation keyframes */
  boneKeyframes: Map<string, Keyframe<number>[]>;
}

/**
 * Bake a dynamic chain's physics simulation into rotation keyframes.
 *
 * Runs the simulation from frame 0 to endFrame at the given frameRate,
 * recording each bone's world-space-derived local rotation at each frame.
 *
 * @param chain - The dynamic chain configuration
 * @param sceneGraph - Scene graph for reading bone transforms
 * @param endFrame - Last frame to simulate (inclusive)
 * @param frameRate - Frames per second
 * @param wind - Global wind settings
 * @param applyAnimationAtFrame - Callback to apply FK animation at a given frame
 *                                (should evaluate timeline and update bone transforms)
 * @returns Baked keyframes per bone, or null if chain can't be initialized
 */
export function bakeDynamicChainToKeyframes(
  chain: DynamicChain,
  sceneGraph: DynamicChainSceneGraph,
  endFrame: number,
  frameRate: number,
  wind: WindSettings,
  applyAnimationAtFrame: (frame: number) => void
): BakedChainKeyframes | null {
  if (chain.boneIds.length === 0 || endFrame < 0 || frameRate <= 0) return null;

  const dt = 1 / frameRate;

  // Initialize result map
  const boneKeyframes = new Map<string, Keyframe<number>[]>();
  for (const boneId of chain.boneIds) {
    boneKeyframes.set(boneId, []);
  }

  // Apply animation at frame 0 to set initial bone positions
  applyAnimationAtFrame(0);

  // Initialize chain state from frame 0 positions
  const state: DynamicChainState | null = initializeChainState(chain, sceneGraph);
  if (!state) return null;

  // Simulate frame by frame
  for (let frame = 0; frame <= endFrame; frame++) {
    const time = frame * dt;

    // Apply FK animation at this frame (drives root bone + sets rest poses)
    applyAnimationAtFrame(frame);

    // Step physics (skip frame 0 — it's the initial state)
    if (frame > 0) {
      const windForce = computeWindForce(wind, time);
      stepDynamicChain(chain, state, sceneGraph, dt, windForce);
      applyChainToBones(chain, state, sceneGraph);
    }

    // Record bone rotations as keyframes
    for (const boneId of chain.boneIds) {
      const node = sceneGraph.getNode(boneId);
      if (!node) continue;

      const keyframes = boneKeyframes.get(boneId);
      if (!keyframes) continue;

      keyframes.push({
        id: `baked_${boneId}_${frame}`,
        time: frame,
        value: node.transform.rotation,
        easing: 'linear',
      });
    }
  }

  return { boneKeyframes };
}
