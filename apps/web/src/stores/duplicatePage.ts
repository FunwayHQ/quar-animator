/**
 * A page's copy with ids of its own. Every layer gets a new id, and
 * everything naming one follows it: parents, children, masks, bindings,
 * IK targets, keyframe tracks, artboard timelines, linked sounds and
 * sequence steps. The rigs kept for the whole project by bone id (IK and
 * dynamic chains, Smart Bone actions, Vitruvian controllers) are copied for
 * the copy's bones. Sharing ids, a change to one page's rig reached the
 * other, and deleting a bone on the copy removed the original's chain.
 */

import type {
  IKChain,
  DynamicChain,
  Node,
  SkinData,
  SmartBoneAction,
  SoundClip,
  Timeline,
  VitruvianController,
} from '@quar/types';
import type { AnimationSequence } from '@quar/animation';
import { pastedRigging, remapSkinData, type ClipboardExtras } from './clipboardRig';

export interface PageRigging {
  ikChains: IKChain[];
  dynamicChains: DynamicChain[];
  smartBoneActions: SmartBoneAction[];
  vitruvianControllers: VitruvianController[];
}

interface PageContent {
  sceneGraphJSON: { nodes: Node[]; rootNodeIds: string[] };
  timeline: Timeline;
  animationSequence: AnimationSequence;
}

/** The page's content with new ids, and the rigging its bones bring (to add to the project's). */
export function withNewIds(
  page: PageContent,
  rigging: PageRigging,
  newId: (prefix: string) => string
): { content: PageContent; added: PageRigging } {
  const nodes = page.sceneGraphJSON.nodes;
  const onPage = new Set(nodes.map((node) => node.id));
  const ids = new Map(nodes.map((node) => [node.id, newId('node')]));
  const id = (old: string) => ids.get(old) ?? old;

  // The rigs of this page's bones, copied for the copy's
  const rig = pastedRigging(
    {
      ikChains: rigging.ikChains.filter(
        (chain) =>
          onPage.has(chain.rootBoneId) &&
          onPage.has(chain.endEffectorBoneId) &&
          onPage.has(chain.targetNodeId)
      ),
      dynamicChains: rigging.dynamicChains.filter(
        (chain) => onPage.has(chain.rootBoneId) && chain.boneIds.every((b) => onPage.has(b))
      ),
      smartBoneActions: rigging.smartBoneActions.filter((action) =>
        onPage.has(action.driver.boneId)
      ),
    } as ClipboardExtras,
    ids,
    newId
  );
  const controllerIds = new Map<string, string>();
  const vitruvianControllers = rigging.vitruvianControllers
    .filter((controller) =>
      nodes.some((node) => node.type === 'vitruvian' && node.controllerId === controller.id)
    )
    .map((controller) => {
      const copy: VitruvianController = {
        ...structuredClone(controller),
        id: newId('vc'),
        groups: controller.groups.map((group) => ({
          ...structuredClone(group),
          boneIds: group.boneIds.map(id),
          skinSnapshots: group.skinSnapshots.map((snapshot) => ({
            nodeId: id(snapshot.nodeId),
            skinData: remapSkinData(snapshot.skinData, ids),
          })),
        })),
      };
      controllerIds.set(controller.id, copy.id);
      return copy;
    });

  const copied = nodes.map((original) => {
    const node = structuredClone(original);
    node.id = id(original.id);
    node.parent = original.parent ? id(original.parent) : null;
    node.children = original.children.map(id);
    if (node.type === 'group' && node.maskNodeId) node.maskNodeId = id(node.maskNodeId);
    if (node.type === 'ik-target') {
      node.ikChainId = rig.chainIdForTarget.get(original.id) ?? node.ikChainId;
    }
    if (node.type === 'vitruvian') {
      node.controllerId = controllerIds.get(node.controllerId) ?? node.controllerId;
    }
    const skin = (node as { skinData?: SkinData }).skinData;
    if (skin) (node as { skinData?: SkinData }).skinData = remapSkinData(skin, ids);
    return node;
  });

  const clips = (sounds: SoundClip[] | undefined) =>
    sounds?.map((clip) => (clip.linkedTo ? { ...clip, linkedTo: id(clip.linkedTo) } : clip));
  const timeline = structuredClone(page.timeline);
  timeline.tracks = timeline.tracks.map((track) => ({ ...track, nodeId: id(track.nodeId) }));
  if (timeline.sounds) timeline.sounds = clips(timeline.sounds);
  if (timeline.artboards) {
    timeline.artboards = Object.fromEntries(
      Object.entries(timeline.artboards).map(([artboardId, scope]) => [
        id(artboardId),
        scope.sounds ? { ...scope, sounds: clips(scope.sounds) } : scope,
      ])
    );
  }
  const sequence = structuredClone(page.animationSequence);
  sequence.steps = sequence.steps.map((step) => ({ ...step, nodeId: id(step.nodeId) }));
  sequence.restPoses = Object.fromEntries(
    Object.entries(sequence.restPoses).map(([nodeId, pose]) => [id(nodeId), pose])
  );

  return {
    content: {
      sceneGraphJSON: { nodes: copied, rootNodeIds: page.sceneGraphJSON.rootNodeIds.map(id) },
      timeline,
      animationSequence: sequence,
    },
    added: {
      ikChains: rig.ikChains,
      dynamicChains: rig.dynamicChains,
      smartBoneActions: rig.smartBoneActions,
      vitruvianControllers,
    },
  };
}
