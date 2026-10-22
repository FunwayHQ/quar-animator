/**
 * SVG export of one frame
 *
 * The scene as it is at a frame — keyframes, IK and physics, and shapes
 * bent by their bones, written as paths of their bent outlines — as SVG.
 * SVG can't skin or warp, so bound images are drawn unbent.
 */

import type { SceneGraph } from '@quar/core';
import { exportNodesToSvg, mat3, type SvgExportFrame } from '@quar/core';
import type { Node, PathNode, PathPoint, SymbolDefinition, Timeline } from '@quar/types';
import type { FrameRig } from './frameRenderer';
import { createScenePoser, rigHasPhysics, type PosedOutline } from './scenePosing';

export interface SvgFrameOptions {
  frame: number;
  /** Only these layers and what's in them (an artboard); else everything on the page */
  rootIds?: string[];
  /** Definitions symbol instances are drawn from */
  symbols?: SymbolDefinition[];
  /** The page rectangle to show (Y up), in place of the posed art's own bounds */
  viewport?: SvgExportFrame['viewport'];
  /** A color behind everything (the document background) */
  background?: SvgExportFrame['background'];
}

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

export function exportSvgFrame(
  scene: SceneGraph,
  timeline: Timeline,
  rig: FrameRig | undefined,
  options: SvgFrameOptions
): string {
  const poser = createScenePoser(scene, timeline, rig);
  // Physics only comes out right posed frame after frame, from the start
  for (let frame = rigHasPhysics(rig) ? 0 : options.frame; frame <= options.frame; frame++) {
    poser.poseAt(frame);
  }

  const posed = poser.scene;
  for (const [nodeId, outline] of poser.boundOutlines()) {
    const node = posed.getNode(nodeId);
    const path = node && bentPath(posed, node, outline);
    if (path) replaceNode(posed, path);
  }

  const roots = options.rootIds
    ? options.rootIds.flatMap((id) => posed.getNode(id) ?? [])
    : posed.getRootNodes();
  return exportNodesToSvg(roots, posed, options.symbols, {
    viewport: options.viewport,
    background: options.background,
  });
}
