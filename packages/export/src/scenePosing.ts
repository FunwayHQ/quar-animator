/**
 * Scene Posing for exports
 *
 * A copy of a scene posed frame by frame as the editor poses it — the
 * timeline, then IK and physics chains — and its bound shapes' outlines as
 * their bones and Smart Bones deform them. Exports that can't skin (Lottie,
 * SVG) and the region a whole-scene export frames read the rig from here.
 */

import { SceneGraph, boundOutline, mat3 } from '@quar/core';
import { applyAnimatedValues, evaluateNodeAtFrame, getAnimatedNodes } from '@quar/animation';
import {
  deformVertices,
  evaluateDynamicChainsAtFrame,
  evaluateIKChains,
  evaluateSmartBones,
  fitSkinToVertices,
  placeSkinData,
  type AffineTransform2D,
  type DynamicChainClock,
  type DynamicChainSceneGraph,
} from '@quar/rigging';
import type { DynamicChainState, Node, SkinData, Timeline } from '@quar/types';
import type { FrameRig } from './frameRenderer';

/** A bound shape's outline where its bones have it now. */
export interface PosedOutline {
  /** World-space vertices (x, y pairs) */
  world: Float32Array;
  closed: boolean;
}

export interface ScenePoser {
  /** The posed copy (the scene it was made from is never touched) */
  readonly scene: SceneGraph;
  /** Pose the copy at a frame; physics steps on from the frame posed before. */
  poseAt(frame: number): void;
  /** Each bound shape's outline as its bones (and Smart Bones) deform it now, by layer id. */
  boundOutlines(): Map<string, PosedOutline>;
}

/** A copy of the scene to pose without touching it. */
function copyScene(scene: SceneGraph): SceneGraph {
  const data = scene.toJSON();
  const copy = new SceneGraph();
  copy.fromJSON({
    nodes: data.nodes.map(
      (node) =>
        ({ ...node, children: [...node.children], transform: { ...node.transform } }) as Node
    ),
    rootNodeIds: [...data.rootNodeIds],
  });
  return copy;
}

/** Whether the rig has physics, which only comes out right posed frame after frame. */
export function rigHasPhysics(rig: FrameRig | undefined): boolean {
  return rig?.dynamicChains?.some((chain) => chain.enabled) ?? false;
}

export function createScenePoser(
  scene: SceneGraph,
  timeline: Timeline,
  rig: FrameRig | undefined
): ScenePoser {
  const posed = copyScene(scene);
  const animated = getAnimatedNodes(timeline);
  const dynamicStates = new Map<string, DynamicChainState>();
  const clock: DynamicChainClock = { lastFrame: null };
  const fitted = new Map<string, { outline: Float32Array; skin: SkinData }>();

  const boundShapeIds: string[] = [];
  scene.traverse((node) => {
    const skinned = (node as { skinData?: SkinData }).skinData;
    if (skinned && node.type !== 'image' && boundOutline(node)) boundShapeIds.push(node.id);
  });

  return {
    scene: posed,

    poseAt(frame) {
      // The timeline, from each layer as it is in the scene
      for (const nodeId of animated) {
        const original = scene.getNode(nodeId);
        if (!original) continue;
        const values = evaluateNodeAtFrame(timeline, nodeId, frame);
        if (values.size > 0) {
          posed.updateNode(nodeId, applyAnimatedValues(original, values) as Partial<Node>);
        }
      }
      // Then the rig, in the editor's order
      if (rig?.ikChains?.length) evaluateIKChains(rig.ikChains, posed);
      if (rig && rigHasPhysics(rig)) {
        evaluateDynamicChainsAtFrame(
          rig.dynamicChains ?? [],
          dynamicStates,
          posed as unknown as DynamicChainSceneGraph,
          frame,
          rig.frameRate,
          rig.wind,
          clock
        );
      }
    },

    boundOutlines() {
      const shapes = boundShapeIds.flatMap((id) => {
        const node = posed.getNode(id);
        const outline = node && boundOutline(node);
        return node && outline ? [{ nodeId: id, node, outline }] : [];
      });
      const morphs = rig?.smartBoneActions?.length
        ? evaluateSmartBones(
            rig.smartBoneActions,
            posed,
            new Map(shapes.map(({ nodeId, outline }) => [nodeId, outline.vertices.length / 2]))
          )
        : undefined;

      const outlines = new Map<string, PosedOutline>();
      for (const { nodeId, node, outline } of shapes) {
        // Weights for the outline (refitted only when the outline changes)
        const known = fitted.get(nodeId);
        const sameOutline =
          known &&
          known.outline.length === outline.vertices.length &&
          known.outline.every((v, i) => v === outline.vertices[i]);
        const skin = sameOutline
          ? known.skin
          : fitSkinToVertices((node as { skinData: SkinData }).skinData, outline.vertices);
        if (!sameOutline) fitted.set(nodeId, { outline: outline.vertices, skin });

        // The local matrix as the scene graph builds it (geometry applies the anchor)
        const { position, rotation, scale } = node.transform;
        const local = mat3.compose(position, rotation, scale);
        const placed = placeSkinData(skin, [
          local.a,
          local.b,
          local.c,
          local.d,
          local.tx,
          local.ty,
        ]);
        const bones: Record<string, AffineTransform2D> = {};
        for (const boneId of Object.keys(placed.inverseBindMatrices)) {
          if (posed.getNode(boneId)) bones[boneId] = posed.getWorldTransform(boneId);
        }
        outlines.set(nodeId, {
          world: deformVertices(outline.vertices, placed, bones, morphs?.get(nodeId)),
          closed: outline.closed,
        });
      }
      return outlines;
    },
  };
}
