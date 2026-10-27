/**
 * A frame, posed
 *
 * The scene as an export draws it at a frame: its keyframes, then IK,
 * physics and Smart Bones, and each shape bent by its bones replaced by a
 * path of its bent outline. Bound images keep their skin (they bend as
 * meshes, which only the renderer draws).
 */

import { mat3, type SceneGraph } from '@quar/core';
import type { Node, PathNode, PathPoint, Timeline } from '@quar/types';
import type { FrameRig } from './frameRenderer';
import { createScenePoser, rigHasPhysics, type PosedOutline } from './scenePosing';

/** The bound shape as a path of its outline where its bones have it, in its own space. */
function bentPath(scene: SceneGraph, node: Node, outline: PosedOutline): PathNode | null {
  const inverse = mat3.invert(scene.getWorldTransform(node.id));
  if (!inverse || !('fills' in node) || !('strokes' in node)) return null;
  const points: PathPoint[] = [];
  for (let i = 0; i < outline.world.length; i += 2) {
    points.push({
      position: mat3.transformPoint(inverse, { x: outline.world[i]!, y: outline.world[i + 1]! }),
      handleIn: null,
      handleOut: null,
      type: 'corner',
    });
  }
  return {
    id: node.id,
    name: node.name,
    type: 'path',
    parent: node.parent,
    children: [],
    transform: node.transform,
    visible: node.visible,
    locked: node.locked,
    opacity: node.opacity,
    blendMode: node.blendMode,
    effects: node.effects,
    points,
    closed: outline.closed,
    fills: node.fills ?? [],
    strokes: node.strokes ?? [],
  };
}

/** Put `replacement` where the layer with its id is, among the same siblings. */
function replaceNode(scene: SceneGraph, replacement: Node): void {
  const parent = replacement.parent;
  const siblings = parent
    ? (scene.getNode(parent)?.children ?? [])
    : scene.getRootNodes().map((root) => root.id);
  const index = siblings.indexOf(replacement.id);
  scene.removeNode(replacement.id);
  scene.addNode(replacement, parent ?? undefined);
  if (index >= 0) scene.moveNode(replacement.id, parent ?? null, index);
}

/** A posed copy of `scene` at `frame` (the scene itself is never touched). */
export function poseFrame(
  scene: SceneGraph,
  timeline: Timeline,
  rig: FrameRig | undefined,
  frame: number
): SceneGraph {
  const poser = createScenePoser(scene, timeline, rig);
  // Physics only comes out right posed frame after frame, from the start
  for (let f = rigHasPhysics(rig) ? 0 : frame; f <= frame; f++) poser.poseAt(f);

  const posed = poser.scene;
  for (const [nodeId, outline] of poser.boundOutlines()) {
    const node = posed.getNode(nodeId);
    const path = node && bentPath(posed, node, outline);
    if (path) replaceNode(posed, path);
  }
  return posed;
}
