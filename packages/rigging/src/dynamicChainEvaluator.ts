/**
 * Dynamic Chain Evaluator for Quar Animator
 * Orchestrates Verlet physics simulation across all enabled dynamic chains.
 *
 * Manages transient simulation state and calls the solver each frame.
 */

import type { DynamicChain, DynamicChainState, WindSettings } from '@quar/types';
import {
  initializeChainState,
  stepDynamicChain,
  applyChainToBones,
  computeWindForce,
  type DynamicChainSceneGraph,
} from './dynamicChain';

/**
 * Evaluate all enabled dynamic chains for one simulation step.
 *
 * @param chains - All dynamic chain configurations
 * @param stateMap - Mutable map of chainId → simulation state (managed by caller)
 * @param sceneGraph - Scene graph for reading/writing bone transforms
 * @param dt - Time delta in seconds since last step
 * @param wind - Global wind settings
 * @param time - Current time in seconds (for wind turbulence)
 */
export function evaluateDynamicChains(
  chains: DynamicChain[],
  stateMap: Map<string, DynamicChainState>,
  sceneGraph: DynamicChainSceneGraph,
  dt: number,
  wind: WindSettings,
  time: number
): void {
  const windForce = computeWindForce(wind, time);

  for (const chain of chains) {
    if (!chain.enabled) continue;
    if (chain.boneIds.length === 0) continue;

    // Initialize state if not yet done
    let state = stateMap.get(chain.id);
    if (!state || !state.initialized) {
      const newState = initializeChainState(chain, sceneGraph);
      if (!newState) continue;
      stateMap.set(chain.id, newState);
      state = newState;
    }

    // Step simulation
    stepDynamicChain(chain, state, sceneGraph, dt, windForce);

    // Apply results to bones
    applyChainToBones(chain, state, sceneGraph);
  }
}

/**
 * Reset all dynamic chain states (e.g., on seek, stop, or chain configuration change).
 */
export function resetDynamicChainStates(stateMap: Map<string, DynamicChainState>): void {
  stateMap.clear();
}
