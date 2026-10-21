/**
 * Scene Extent for Quar Animator
 * Where a scene's artwork goes over its animation: the region an export of
 * the whole scene (no artboard chosen) frames — keyframes, and the rig on
 * top of them (IK, physics, shapes bent by their bones).
 */

import type { Node, Rect, SymbolDefinition, Timeline } from '@quar/types';
import type { SceneGraph } from '@quar/core';
import { getArtworkBounds, padRect } from '@quar/core';
import type { FrameRig } from './frameRenderer';
import { createScenePoser, rigHasPhysics } from './scenePosing';

/** At most this many frames are looked at; enough to follow any motion closely. */
const MAX_SAMPLES = 60;

/** Frames from first to last, evenly spaced, both ends included. */
export function sampleFrames(first: number, last: number, count = MAX_SAMPLES): number[] {
  if (last <= first) return [first];
  const step = Math.max(1, Math.ceil((last - first) / (count - 1)));
  const frames: number[] = [];
  for (let frame = first; frame < last; frame += step) frames.push(frame);
  frames.push(last);
  return frames;
}

/** Whether anything moves over time: keyframes, or a rig that poses itself. */
function isAnimated(timeline: Timeline, rig: FrameRig | undefined): boolean {
  return timeline.tracks.length > 0 || (rig?.ikChains?.length ?? 0) > 0 || rigHasPhysics(rig);
}

/** Half the widest visible stroke of a layer. */
function strokeHalfWidth(node: Node | undefined): number {
  if (!node || !('strokes' in node) || !Array.isArray(node.strokes)) return 0;
  return node.strokes.reduce(
    (widest, stroke) =>
      stroke.visible && stroke.width > 0 ? Math.max(widest, stroke.width / 2) : widest,
    0
  );
}

/** The bounds of world-space vertices (x, y pairs), or null without any. */
function verticesBounds(world: Float32Array): Rect | null {
  if (world.length < 2) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < world.length; i += 2) {
    minX = Math.min(minX, world[i]!);
    maxX = Math.max(maxX, world[i]!);
    minY = Math.min(minY, world[i + 1]!);
    maxY = Math.max(maxY, world[i + 1]!);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * The bounds of the scene's artwork (strokes included) over these frames
 * together, posed on a copy — the rig too, when given — so the scene itself
 * isn't touched. Null when nothing is drawn.
 */
export function getAnimatedArtworkBounds(
  sceneGraph: SceneGraph,
  timeline: Timeline,
  symbols: SymbolDefinition[],
  frames: number[],
  rig?: FrameRig
): Rect | null {
  const poser = createScenePoser(sceneGraph, timeline, rig);

  let union: Rect | null = null;
  const add = (rect: Rect) => {
    union = union ? unionRect(union, rect) : rect;
  };
  for (const frame of isAnimated(timeline, rig) ? frames : [frames[0] ?? 0]) {
    poser.poseAt(frame);
    // Shapes bound to bones are where their bones bend them
    const outlines = poser.boundOutlines();
    for (const [nodeId, outline] of outlines) {
      const rect = verticesBounds(outline.world);
      if (rect) add(padRect(rect, strokeHalfWidth(poser.scene.getNode(nodeId))));
    }
    const artwork = getArtworkBounds(poser.scene, symbols, new Set(outlines.keys()));
    if (artwork) add(padRect(artwork.rect, artwork.strokePadding));
  }
  return union;
}

function unionRect(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}
