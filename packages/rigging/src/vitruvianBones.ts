/**
 * Vitruvian Bones Evaluation for Quar Animator
 * Bone group switching for different pose topologies.
 *
 * Pipeline: FK → IK → Physics → Smart Bones → **Vitruvian** → Skinning
 * Active group determines which bones are visible and which SkinData snapshots apply.
 */

import type { VitruvianController, BoneGroup, BoneGroupSkinSnapshot, SkinData } from '@quar/types';

/**
 * Minimal scene graph interface for Vitruvian evaluation.
 */
export interface VitruvianSceneGraph {
  getNode(id: string): { type: string; skinData?: SkinData } | undefined;
  updateNode(id: string, data: Record<string, unknown>): void;
}

/**
 * Get the active BoneGroup from a VitruvianController.
 * Returns undefined if controller is disabled or active group not found.
 */
export function getActiveGroup(controller: VitruvianController): BoneGroup | undefined {
  if (!controller.enabled) return undefined;
  return controller.groups.find((g) => g.id === controller.activeGroupId);
}

/**
 * Compute the set of bone IDs that should be hidden based on all enabled Vitruvian controllers.
 * A bone is hidden if it does NOT belong to any active group's boneIds.
 * Only bones that appear in at least one group of an enabled controller are affected.
 */
export function getBoneVisibility(controllers: VitruvianController[]): Set<string> {
  const hiddenBoneIds = new Set<string>();

  for (const controller of controllers) {
    if (!controller.enabled) continue;

    const activeGroup = getActiveGroup(controller);

    // Collect all bone IDs across all groups of this controller
    const allBoneIds = new Set<string>();
    for (const group of controller.groups) {
      for (const boneId of group.boneIds) {
        allBoneIds.add(boneId);
      }
    }

    // Bones in active group are visible; all others managed by this controller are hidden
    const activeBoneIds = activeGroup ? new Set(activeGroup.boneIds) : new Set<string>();

    for (const boneId of allBoneIds) {
      if (!activeBoneIds.has(boneId)) {
        hiddenBoneIds.add(boneId);
      }
    }
  }

  return hiddenBoneIds;
}

/**
 * Get the skin snapshots from the active group of a controller.
 * Returns empty array if controller is disabled or no active group.
 */
export function getActiveSkinSnapshots(controller: VitruvianController): BoneGroupSkinSnapshot[] {
  const group = getActiveGroup(controller);
  return group ? group.skinSnapshots : [];
}

/**
 * Apply skin snapshots to nodes in the scene graph.
 * Replaces the skinData on each node with the snapshot's skinData.
 */
export function applySkinSnapshots(
  snapshots: BoneGroupSkinSnapshot[],
  sceneGraph: VitruvianSceneGraph
): void {
  for (const snapshot of snapshots) {
    const node = sceneGraph.getNode(snapshot.nodeId);
    if (!node) continue;
    sceneGraph.updateNode(snapshot.nodeId, { skinData: snapshot.skinData });
  }
}

/**
 * Evaluate all Vitruvian controllers.
 * Returns the set of bone IDs that should be hidden.
 * Optionally applies skin snapshots from active groups to the scene graph.
 */
export function evaluateVitruvianControllers(
  controllers: VitruvianController[],
  sceneGraph?: VitruvianSceneGraph
): Set<string> {
  const hiddenBoneIds = getBoneVisibility(controllers);

  // Apply skin snapshots from each controller's active group
  if (sceneGraph) {
    for (const controller of controllers) {
      if (!controller.enabled) continue;
      const snapshots = getActiveSkinSnapshots(controller);
      if (snapshots.length > 0) {
        applySkinSnapshots(snapshots, sceneGraph);
      }
    }
  }

  return hiddenBoneIds;
}
