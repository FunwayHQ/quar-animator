/**
 * Scene Extent for Quar Animator
 * Where a scene's artwork goes over its animation: the region an export of
 * the whole scene (no artboard chosen) frames.
 */

import type { Node, Rect, SymbolDefinition, Timeline } from '@quar/types';
import { SceneGraph, getArtworkBounds, padRect } from '@quar/core';
import { applyAnimatedValues, evaluateNodeAtFrame } from '@quar/animation';

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

/**
 * The bounds of the scene's artwork (strokes included) over these frames
 * together, posed on a copy so the scene itself isn't touched. Null when
 * nothing is drawn.
 */
export function getAnimatedArtworkBounds(
  sceneGraph: SceneGraph,
  timeline: Timeline,
  symbols: SymbolDefinition[],
  frames: number[]
): Rect | null {
  const copy = new SceneGraph();
  copy.fromJSON(structuredClone(sceneGraph.toJSON()));
  const animated = [...new Set(timeline.tracks.map((track) => track.nodeId))];

  let union: Rect | null = null;
  for (const frame of animated.length > 0 ? frames : [frames[0] ?? 0]) {
    for (const nodeId of animated) {
      const node = copy.getNode(nodeId);
      if (!node) continue;
      const values = evaluateNodeAtFrame(timeline, nodeId, frame);
      if (values.size > 0)
        copy.updateNode(nodeId, applyAnimatedValues(node, values) as Partial<Node>);
    }
    const artwork = getArtworkBounds(copy, symbols);
    if (!artwork) continue;
    const rect = padRect(artwork.rect, artwork.strokePadding);
    union = union ? unionRect(union, rect) : rect;
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
