/**
 * Copying, pasting and deleting rigged layers.
 *
 * Layers are copied with what they need to paste back faithfully: where each
 * copied root sat, and the rigging among the copied layers (IK chains,
 * dynamic chains, Smart Bone actions), recreated with the pasted layers' ids.
 * Deleting layers removes the rigging that depended on them.
 */

import { normalizeWeights } from '@quar/rigging';
import type {
  DynamicChain,
  IKChain,
  Matrix3,
  Node,
  SkinData,
  SmartBoneAction,
  Transform,
  VitruvianController,
} from '@quar/types';
import { applyPlacement, mapPlacement, placementOf, reparentMatrix } from './reparent';

export interface ClipboardExtras {
  /** For each copied root: its parent when copied, and its placement at the top level. */
  roots: Record<string, { parentId: string | null; rootTransform: Transform }>;
  ikChains: IKChain[];
  dynamicChains: DynamicChain[];
  smartBoneActions: SmartBoneAction[];
}

interface Rigging {
  ikChains: IKChain[];
  dynamicChains: DynamicChain[];
  smartBoneActions: SmartBoneAction[];
}

interface GraphLike {
  getNode(id: string): Node | undefined;
  getWorldTransform(id: string): Matrix3;
}

/** What to keep with copied layers (`copied` = every copied id, descendants included). */
export function captureClipboardExtras(
  sceneGraph: GraphLike,
  clones: Node[],
  copied: Set<string>,
  rigging: Rigging
): ClipboardExtras {
  const roots: ClipboardExtras['roots'] = {};
  for (const clone of clones) {
    if (clone.parent && copied.has(clone.parent)) continue;
    const m = reparentMatrix(sceneGraph, clone.id, null);
    roots[clone.id] = {
      parentId: clone.parent,
      rootTransform: m
        ? applyPlacement(clone.transform, mapPlacement(placementOf(clone.transform), m))
        : structuredClone(clone.transform),
    };
  }
  return {
    roots,
    ikChains: structuredClone(
      rigging.ikChains.filter(
        (chain) =>
          copied.has(chain.rootBoneId) &&
          copied.has(chain.endEffectorBoneId) &&
          copied.has(chain.targetNodeId)
      )
    ),
    dynamicChains: structuredClone(
      rigging.dynamicChains.filter(
        (chain) => copied.has(chain.rootBoneId) && chain.boneIds.every((id) => copied.has(id))
      )
    ),
    smartBoneActions: structuredClone(
      rigging.smartBoneActions.filter((action) => copied.has(action.driver.boneId))
    ),
  };
}

/** A binding pointed at the pasted bones wherever they were pasted too. */
export function remapSkinData(skin: SkinData, newIds: Map<string, string>): SkinData {
  const id = (boneId: string) => newIds.get(boneId) ?? boneId;
  return {
    ...skin,
    inverseBindMatrices: Object.fromEntries(
      Object.entries(skin.inverseBindMatrices).map(([boneId, ibm]) => [id(boneId), ibm])
    ),
    vertices: skin.vertices.map((entry) => ({
      ...entry,
      influences: entry.influences.map((inf) => ({ ...inf, boneId: id(inf.boneId) })),
    })),
  };
}

/** The copied rigging, for the pasted layers (`newIds`: old id → pasted id). */
export function pastedRigging(
  extras: ClipboardExtras,
  newIds: Map<string, string>,
  newId: (prefix: string) => string
): Rigging & { chainIdForTarget: Map<string, string> } {
  const id = (old: string) => newIds.get(old) ?? old;
  const chainIdForTarget = new Map<string, string>();
  const ikChains = extras.ikChains.map((chain) => {
    const copy: IKChain = {
      ...structuredClone(chain),
      id: newId('ik'),
      rootBoneId: id(chain.rootBoneId),
      endEffectorBoneId: id(chain.endEffectorBoneId),
      targetNodeId: id(chain.targetNodeId),
      ...(chain.poleTargetNodeId ? { poleTargetNodeId: id(chain.poleTargetNodeId) } : {}),
    };
    chainIdForTarget.set(chain.targetNodeId, copy.id);
    return copy;
  });
  const dynamicChains = extras.dynamicChains.map((chain) => ({
    ...structuredClone(chain),
    id: newId('dc'),
    rootBoneId: id(chain.rootBoneId),
    boneIds: chain.boneIds.map(id),
  }));
  const smartBoneActions = extras.smartBoneActions.map((action) => ({
    ...structuredClone(action),
    id: newId('sba'),
    driver: { ...action.driver, boneId: id(action.driver.boneId) },
    targets: action.targets.map((target) => ({
      ...structuredClone(target),
      id: newId('mt'),
      offsets: Object.fromEntries(
        Object.entries(target.offsets).map(([nodeId, offsets]) => [id(nodeId), offsets])
      ),
    })),
  }));
  return { ikChains, dynamicChains, smartBoneActions, chainIdForTarget };
}

export interface RemovalCleanup {
  ikChains: IKChain[];
  dynamicChains: DynamicChain[];
  smartBoneActions: SmartBoneAction[];
  vitruvianControllers: VitruvianController[];
  /** IK targets whose chain lost a bone: inert now, so they go too. */
  orphanedTargets: string[];
  /** Bindings that lost bones (undefined: the mesh lost all of them and is unbound). */
  skinUpdates: Array<{ nodeId: string; skinData: SkinData | undefined }>;
}

/**
 * The rigging that remains once `removed` layers (descendants included) are
 * gone, and the layers it leaves behind to update.
 */
export function cleanupAfterRemoval(
  removed: Set<string>,
  rigging: Rigging & { vitruvianControllers: VitruvianController[] },
  remainingNodes: Node[]
): RemovalCleanup {
  const gone = (id: string | undefined) => id !== undefined && removed.has(id);
  const brokenChains = rigging.ikChains.filter(
    (chain) =>
      gone(chain.rootBoneId) ||
      gone(chain.endEffectorBoneId) ||
      gone(chain.targetNodeId) ||
      gone(chain.poleTargetNodeId)
  );
  const orphanedTargets = brokenChains
    .map((chain) => chain.targetNodeId)
    .filter((id) => !removed.has(id));

  const skinUpdates: RemovalCleanup['skinUpdates'] = [];
  for (const node of remainingNodes) {
    const skin = (node as { skinData?: SkinData }).skinData;
    if (!skin || !Object.keys(skin.inverseBindMatrices).some(gone)) continue;
    const inverseBindMatrices = Object.fromEntries(
      Object.entries(skin.inverseBindMatrices).filter(([boneId]) => !gone(boneId))
    );
    skinUpdates.push({
      nodeId: node.id,
      skinData:
        Object.keys(inverseBindMatrices).length === 0
          ? undefined
          : {
              ...skin,
              inverseBindMatrices,
              vertices: skin.vertices.map((entry) =>
                normalizeWeights({
                  ...entry,
                  influences: entry.influences.filter((inf) => !gone(inf.boneId)),
                })
              ),
            },
    });
  }

  return {
    ikChains: rigging.ikChains.filter((chain) => !brokenChains.includes(chain)),
    dynamicChains: rigging.dynamicChains.filter(
      (chain) => !gone(chain.rootBoneId) && !chain.boneIds.some(gone)
    ),
    smartBoneActions: rigging.smartBoneActions.filter((action) => !gone(action.driver.boneId)),
    vitruvianControllers: rigging.vitruvianControllers.map((controller) => ({
      ...controller,
      groups: controller.groups.map((group) => ({
        ...group,
        boneIds: group.boneIds.filter((id) => !gone(id)),
      })),
    })),
    orphanedTargets,
    skinUpdates,
  };
}
