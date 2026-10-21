/**
 * Shapes bound to bones, baked for Lottie.
 *
 * Lottie has no skinning, so a bound shape's outline is deformed the way the
 * editor deforms it — timeline, IK, physics and Smart Bones, frame by frame —
 * and written as an animated path in the shape's own layer space. Lottie
 * can't warp images, so bound images are only reported.
 */

import type { SceneGraph } from '@quar/core';
import { boundOutline, mat3 } from '@quar/core';
import type { Node, SkinData, Timeline } from '@quar/types';
import type { FrameRig } from '../frameRenderer';
import { createScenePoser } from '../scenePosing';
import type { LottieShapeKeyframe, LottieShapePath, LottieShapeVertices } from './lottieTypes';

export interface SkinnedLottie {
  /** Each bound shape's outline as an animated path, by layer id */
  paths: Map<string, LottieShapePath>;
  /** Bound images, exported without their bend */
  unbentImageIds: string[];
}

const round = (v: number) => Math.round(v * 100) / 100;

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
  scene.traverse((node: Node) => {
    if (!(node as { skinData?: SkinData }).skinData) return;
    if (node.type === 'image') unbentImageIds.push(node.id);
    else if (boundOutline(node)) shapeIds.push(node.id);
  });
  const paths = new Map<string, LottieShapePath>();
  if (shapeIds.length === 0) return { paths, unbentImageIds };

  const poser = createScenePoser(scene, timeline, rig);
  const series = new Map<string, LottieShapeVertices[]>(shapeIds.map((id) => [id, []]));
  for (let frame = first; frame <= last; frame++) {
    poser.poseAt(frame);
    for (const [nodeId, outline] of poser.boundOutlines()) {
      // Back into the layer's own space (Lottie y down)
      const inverse = mat3.invert(poser.scene.getWorldTransform(nodeId));
      if (!inverse) continue;
      const v: number[][] = [];
      for (let i = 0; i < outline.world.length; i += 2) {
        const p = mat3.transformPoint(inverse, { x: outline.world[i]!, y: outline.world[i + 1]! });
        v.push([round(p.x), round(-p.y)]);
      }
      const zero = v.map(() => [0, 0]);
      series.get(nodeId)?.push({ v, i: zero, o: zero, c: outline.closed });
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
