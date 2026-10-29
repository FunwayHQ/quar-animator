/**
 * Keyframes of layers the Eraser cut. Each stays the same layer (its id),
 * so its keyframes carry on — all but those that shaped its old outline
 * (Shape and point keyframes, a shape's size), which a new outline can't
 * follow. Each piece cut off it gets the same keyframes, as the pieces of a
 * path cut at a point do.
 */

import type { PropertyTrack, Timeline } from '@quar/types';
import type { ErasedLayer } from '@quar/core';
import { tracksForCopy } from './pathCommands';
import { SHAPE_GEOMETRY } from './shapeToPathAnimation';

/** A path's Shape keyframes and those of its points. */
const OUTLINE = /^(points|subpaths)(\.|$)/;

export function tracksAfterErase(timeline: Timeline, cuts: ErasedLayer[]): Timeline {
  const cut = new Set(cuts.map((layer) => layer.id));
  const outlives = (track: PropertyTrack) =>
    !cut.has(track.nodeId) ||
    !(OUTLINE.test(track.property) || SHAPE_GEOMETRY.test(track.property));
  const kept = timeline.tracks.filter(outlives);
  const keptTimeline = { ...timeline, tracks: kept };
  const copied = cuts.flatMap(({ id, copies }) =>
    copies.flatMap((copyId) => tracksForCopy(keptTimeline, id, copyId))
  );
  if (kept.length === timeline.tracks.length && copied.length === 0) return timeline;
  return { ...timeline, tracks: [...kept, ...copied] };
}
