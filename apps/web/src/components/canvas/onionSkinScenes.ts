/**
 * Onion-skin ghost scenes: the scene posed at another frame.
 *
 * A ghost is the whole scene as it would look at that frame — the timeline
 * applied to a copy of it, then IK — so groups' children, child bones and
 * meshes bound to bones ghost as they move, not just top-level layers.
 */

import { SceneGraph } from '@quar/core';
import { applyAnimatedValues, evaluateTimelineAtFrame } from '@quar/animation';
import { evaluateIKChains } from '@quar/rigging';
import type { IKChain, Node, Timeline } from '@quar/types';

/** A copy of the scene at `frame`: animated layers posed, IK solved. */
export function poseSceneAtFrame(
  scene: SceneGraph,
  timeline: Timeline,
  frame: number,
  ikChains: IKChain[]
): SceneGraph {
  const data = scene.toJSON();
  const ghost = new SceneGraph();
  ghost.fromJSON({
    // Copies of the layers (the ghost is posed without touching the scene).
    // Artboards lose their backgrounds: a ghost is the artwork, not its page
    nodes: data.nodes.map(
      (node) =>
        ({
          ...node,
          children: [...node.children],
          transform: { ...node.transform },
          ...(node.type === 'artboard' ? { fills: [] } : {}),
        }) as Node
    ),
    rootNodeIds: [...data.rootNodeIds],
  });
  for (const [nodeId, values] of evaluateTimelineAtFrame(timeline, frame)) {
    const node = ghost.getNode(nodeId);
    if (node) ghost.updateNode(nodeId, applyAnimatedValues(node, values) as Partial<Node>);
  }
  if (ikChains.some((chain) => chain.enabled)) evaluateIKChains(ikChains, ghost);
  return ghost;
}

/**
 * Posed ghost scenes, kept while nothing they depend on changes (the scene,
 * the timeline, the IK chains), so a still canvas doesn't pose them again
 * every frame.
 */
export class GhostSceneCache {
  private scenes = new Map<number, SceneGraph>();
  private inputs: unknown[] = [];

  get(inputs: unknown[], frame: number, pose: () => SceneGraph): SceneGraph {
    if (inputs.length !== this.inputs.length || inputs.some((v, i) => v !== this.inputs[i])) {
      this.scenes.clear();
      this.inputs = inputs;
    }
    let scene = this.scenes.get(frame);
    if (!scene) {
      scene = pose();
      this.scenes.set(frame, scene);
    }
    return scene;
  }

  /** Forget frames no longer shown. */
  keepOnly(frames: Set<number>): void {
    for (const frame of this.scenes.keys()) {
      if (!frames.has(frame)) this.scenes.delete(frame);
    }
  }
}
