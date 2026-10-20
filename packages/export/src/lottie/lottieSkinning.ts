/**
 * Shapes bound to bones, baked for Lottie.
 *
 * Lottie has no skinning, so a bound shape's outline is deformed the way the
 * editor deforms it — timeline, IK, physics and Smart Bones, frame by frame —
 * and written as an animated path in the shape's own layer space. Lottie
 * can't warp images, so bound images are only reported.
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
import type { FrameRig } from '../frameRenderer';
import type { LottieShapeKeyframe, LottieShapePath, LottieShapeVertices } from './lottieTypes';

export interface SkinnedLottie {
  /** Each bound shape's outline as an animated path, by layer id */
  paths: Map<string, LottieShapePath>;
  /** Bound images, exported without their bend */
  unbentImageIds: string[];
}

const round = (v: number) => Math.round(v * 100) / 100;

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

/**
 * Bake every bound shape's outline over frames [first, last], posed as the
 * editor poses it.
 */
export function bakeSkinnedOutlines(
  scene: SceneGraph,
  timeline: Timeline,
  rig: FrameRig | undefined,
  first: number,
  last: number
): SkinnedLottie {
  const shapeIds: string[] = [];
  const unbentImageIds: string[] = [];
  scene.traverse((node) => {
    if (!(node as { skinData?: SkinData }).skinData) return;
    if (node.type === 'image') unbentImageIds.push(node.id);
    else if (boundOutline(node)) shapeIds.push(node.id);
  });
  const paths = new Map<string, LottieShapePath>();
  if (shapeIds.length === 0) return { paths, unbentImageIds };

  const posed = copyScene(scene);
  const animated = getAnimatedNodes(timeline);
  const dynamicStates = new Map<string, DynamicChainState>();
  const clock: DynamicChainClock = { lastFrame: null };
  const fitted = new Map<string, { outline: Float32Array; skin: SkinData }>();
  const series = new Map<string, LottieShapeVertices[]>(shapeIds.map((id) => [id, []]));

  for (let frame = first; frame <= last; frame++) {
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
    if (rig?.dynamicChains?.some((chain) => chain.enabled)) {
      evaluateDynamicChainsAtFrame(
        rig.dynamicChains,
        dynamicStates,
        posed as unknown as DynamicChainSceneGraph,
        frame,
        rig.frameRate,
        rig.wind,
        clock
      );
    }

    const outlines = new Map(shapeIds.map((id) => [id, boundOutline(posed.getNode(id)!)!]));
    const morphs = rig?.smartBoneActions?.length
      ? evaluateSmartBones(
          rig.smartBoneActions,
          posed,
          new Map(shapeIds.map((id) => [id, outlines.get(id)!.vertices.length / 2]))
        )
      : undefined;

    for (const nodeId of shapeIds) {
      const node = posed.getNode(nodeId)!;
      const outline = outlines.get(nodeId)!;
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

      const { position, rotation, scale, anchor } = node.transform;
      const local = mat3.compose(position, rotation, scale, anchor);
      const placed = placeSkinData(skin, [local.a, local.b, local.c, local.d, local.tx, local.ty]);
      const bones: Record<string, AffineTransform2D> = {};
      for (const boneId of Object.keys(placed.inverseBindMatrices)) {
        if (posed.getNode(boneId)) bones[boneId] = posed.getWorldTransform(boneId);
      }
      const world = deformVertices(outline.vertices, placed, bones, morphs?.get(nodeId));

      // Back into the layer's own space (Lottie y down)
      const inverse = mat3.invert(posed.getWorldTransform(nodeId));
      if (!inverse) continue;
      const v: number[][] = [];
      for (let i = 0; i < world.length; i += 2) {
        const p = mat3.transformPoint(inverse, { x: world[i]!, y: world[i + 1]! });
        v.push([round(p.x), round(-p.y)]);
      }
      const zero = v.map(() => [0, 0]);
      series.get(nodeId)!.push({ v, i: zero, o: zero, c: outline.closed });
    }
  }

  for (const [nodeId, frames] of series) {
    const path = animatedPath(frames, first);
    if (path) paths.set(nodeId, path);
  }
  return { paths, unbentImageIds };
}

/**
 * Per-frame outlines as a Lottie path: static when it never changes, else
 * keyframed — leaving out frames inside a stretch where it holds still, which
 * interpolate to the same outline anyway.
 */
function animatedPath(frames: LottieShapeVertices[], first: number): LottieShapePath | null {
  if (frames.length === 0) return null;
  const keys = frames.map((frame) => JSON.stringify(frame.v));
  if (keys.every((key) => key === keys[0])) {
    return { ty: 'sh', nm: 'Path', ks: { a: 0, k: frames[0]! } };
  }
  const kept = frames
    .map((_, i) => i)
    .filter(
      (i) =>
        i === 0 || i === frames.length - 1 || keys[i] !== keys[i - 1] || keys[i] !== keys[i + 1]
    );
  const keyframes = kept.map((index, k): LottieShapeKeyframe => {
    const vertices = frames[index]!;
    const nextIndex = kept[k + 1];
    const t = first + index;
    if (nextIndex === undefined) return { t, s: [vertices] };
    const next = frames[nextIndex]!;
    if (next.v.length !== vertices.v.length) return { t, s: [vertices], h: 1 };
    return { t, s: [vertices], e: [next], i: { x: [1], y: [1] }, o: { x: [0], y: [0] } };
  });
  return { ty: 'sh', nm: 'Path', ks: { a: 1, k: keyframes } };
}
