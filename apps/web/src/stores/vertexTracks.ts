/**
 * Vertex Tracks for Quar Animator
 * A path's per-point keyframes are named by each point's place (points.3.…,
 * subpaths.0.2.…), so adding or deleting a point would leave every later
 * point on another point's keyframes. These keep them on their points, as
 * After Effects does: a deleted point's keyframes go with it, and a point
 * split into a curve is keyed at every keyframe time, from the curve as it is
 * then, so the animation keeps its shape.
 */

import type { EasingFunction, PathNode, PathPoint, PropertyTrack, Timeline } from '@quar/types';
import { getAllPoints, splitSegment, type PathPointsChange } from '@quar/core';
import {
  applyAnimatedValues,
  createKeyframe,
  createTrack,
  evaluateNodeAtFrame,
} from '@quar/animation';

/** A per-point property: points.<i>.<rest> or subpaths.<s>.<i>.<rest> */
const POINT_PROPERTY = /^(?:points\.(\d+)|subpaths\.(\d+)\.(\d+))\.(.+)$/;

/** The handle properties a split can change, keyed as x/y pairs. */
const HANDLES = ['handleIn', 'handleOut'] as const;

/** A path's contour lengths, main contour first. */
function contourLengths(node: { points: PathPoint[]; subpaths?: PathPoint[][] }): number[] {
  return [node.points.length, ...(node.subpaths ?? []).map((contour) => contour.length)];
}

function pointPrefix(contour: number, index: number): string {
  return contour === 0 ? `points.${index}` : `subpaths.${contour - 1}.${index}`;
}

/** The flat index of (contour, index), or null when it isn't a point of the path. */
function toFlat(lengths: number[], contour: number, index: number): number | null {
  if (contour >= lengths.length || index >= lengths[contour]!) return null;
  return lengths.slice(0, contour).reduce((sum, length) => sum + length, 0) + index;
}

function fromFlat(lengths: number[], flat: number): [number, number] {
  let rest = flat;
  for (let contour = 0; contour < lengths.length; contour++) {
    if (rest < lengths[contour]!) return [contour, rest];
    rest -= lengths[contour]!;
  }
  return [lengths.length - 1, rest];
}

/**
 * Where each old point ends up (flat index, or null when deleted), and the
 * contour lengths afterwards.
 */
function remapping(
  lengths: number[],
  change: PathPointsChange
): { map: (flat: number) => number | null; newLengths: number[] } {
  if (change.kind === 'insert') {
    const [contour] = fromFlat(lengths, change.segmentIndex);
    return {
      map: (flat) => (flat <= change.segmentIndex ? flat : flat + 1),
      newLengths: lengths.map((length, c) => (c === contour ? length + 1 : length)),
    };
  }
  if (change.kind === 'extend') {
    // Points added to the main contour: at its start every point moves along
    const added = change.points.length;
    return {
      map: (flat) => (change.at === 'start' || flat >= lengths[0]! ? flat + added : flat),
      newLengths: lengths.map((length, c) => (c === 0 ? length + added : length)),
    };
  }
  const deleted = new Set(change.indices);
  const newFlat = new Map<number, number>();
  const newLengths: number[] = [];
  let flat = 0;
  let next = 0;
  for (const length of lengths) {
    let kept = 0;
    for (let i = 0; i < length; i++, flat++) {
      if (deleted.has(flat)) continue;
      newFlat.set(flat, next++);
      kept++;
    }
    // A contour left empty goes, and the ones after it move up
    if (kept > 0) newLengths.push(kept);
  }
  return { map: (old) => newFlat.get(old) ?? null, newLengths };
}

/** A track's keyframe at this time, given a value (replacing one already there). */
function keyAt(
  track: PropertyTrack,
  time: number,
  value: number,
  easing: EasingFunction
): PropertyTrack {
  const keyframes = track.keyframes.filter((keyframe) => keyframe.time !== time);
  keyframes.push(createKeyframe(time, value, easing));
  keyframes.sort((a, b) => a.time - b.time);
  return { ...track, keyframes };
}

/**
 * The timeline with this path's per-point keyframes kept on their points
 * after `change`. `before` is the path as it was when changed (its values
 * fill in what the tracks don't animate). Returns the same timeline when
 * there's nothing to move.
 */
export function remapVertexTracks(
  timeline: Timeline,
  nodeId: string,
  before: PathNode,
  change: PathPointsChange
): Timeline {
  const lengths = contourLengths(before);
  const { map, newLengths } = remapping(lengths, change);
  let changed = false;

  const tracks: PropertyTrack[] = [];
  for (const track of timeline.tracks) {
    if (track.nodeId !== nodeId) {
      tracks.push(track);
      continue;
    }
    if (track.property === 'points') {
      const reshaped = reshapeShapeKeyframes(track, lengths, change);
      if (reshaped !== track) changed = true;
      tracks.push(reshaped);
      continue;
    }
    const match = POINT_PROPERTY.exec(track.property);
    const flat = match
      ? match[1] !== undefined
        ? toFlat(lengths, 0, Number(match[1]))
        : toFlat(lengths, Number(match[2]) + 1, Number(match[3]))
      : null;
    if (!match || flat === null) {
      tracks.push(track);
      continue;
    }
    const moved = map(flat);
    changed = true;
    if (moved === null) continue; // the point was deleted
    const [contour, index] = fromFlat(newLengths, moved);
    tracks.push({ ...track, property: `${pointPrefix(contour, index)}.${match[4]}` });
  }

  if (change.kind === 'insert') {
    const keyed = keyInsertedPoint(timeline, tracks, nodeId, before, change, lengths, newLengths);
    if (keyed !== tracks) return { ...timeline, tracks: keyed };
  }
  return changed ? { ...timeline, tracks } : timeline;
}

/**
 * Whole-shape keyframes (the "Shape" diamond keys the main contour): the
 * same point added or removed in each, when it has the same points.
 */
function reshapeShapeKeyframes(
  track: PropertyTrack,
  lengths: number[],
  change: PathPointsChange
): PropertyTrack {
  const mainLength = lengths[0]!;
  let changed = false;
  const keyframes = track.keyframes.map((keyframe) => {
    const points = keyframe.value as PathPoint[];
    if (!Array.isArray(points) || points.length !== mainLength) return keyframe;
    if (change.kind === 'delete') {
      const deleted = new Set(change.indices.filter((flat) => flat < mainLength));
      if (deleted.size === 0) return keyframe;
      changed = true;
      return { ...keyframe, value: points.filter((_point, i) => !deleted.has(i)) };
    }
    if (change.kind === 'extend') {
      // The new points, as drawn, in every shape
      changed = true;
      return {
        ...keyframe,
        value:
          change.at === 'start' ? [...change.points, ...points] : [...points, ...change.points],
      };
    }
    if (change.segmentIndex >= mainLength) return keyframe;
    const end = (change.segmentIndex + 1) % mainLength;
    const split = splitSegment(points[change.segmentIndex]!, points[end]!, change.t);
    const value = [...points];
    value[change.segmentIndex] = split.start;
    value[end] = split.end;
    value.splice(change.segmentIndex + 1, 0, split.point);
    changed = true;
    return { ...keyframe, value };
  });
  return changed ? { ...track, keyframes } : track;
}

/**
 * Key a point split into a curve at every time this path's points are keyed,
 * from the curve as it is then, along with the shortened handles either side
 * of it. A handle with nothing to show at some of those times is keyed as
 * zero there, so it doesn't drift in from the other keys.
 */
function keyInsertedPoint(
  timeline: Timeline,
  tracks: PropertyTrack[],
  nodeId: string,
  before: PathNode,
  change: Extract<PathPointsChange, { kind: 'insert' }>,
  lengths: number[],
  newLengths: number[]
): PropertyTrack[] {
  const isPointTrack = (track: PropertyTrack) =>
    track.nodeId === nodeId && POINT_PROPERTY.test(track.property);
  const times = [
    ...new Set(
      tracks.filter(isPointTrack).flatMap((track) => track.keyframes.map((kf) => kf.time))
    ),
  ].sort((a, b) => a - b);
  if (times.length === 0) return tracks;

  const [contour, local] = fromFlat(lengths, change.segmentIndex);
  const endFlat = toFlat(lengths, contour, (local + 1) % lengths[contour]!)!;
  const newPrefix = (flat: number) => pointPrefix(...fromFlat(newLengths, flat));
  const startPrefix = newPrefix(change.segmentIndex);
  const pointPrefixNew = newPrefix(change.segmentIndex + 1);
  const endPrefix = newPrefix(endFlat > change.segmentIndex ? endFlat + 1 : endFlat);

  // The value of each property to key, at each time
  const values = new Map<string, Map<number, number | null>>();
  const easings = new Map<number, EasingFunction>();
  const put = (property: string, time: number, value: number | null) => {
    if (!values.has(property)) values.set(property, new Map());
    values.get(property)!.set(time, value);
  };
  for (const time of times) {
    const posed = getAllPoints(
      applyAnimatedValues(before, evaluateNodeAtFrame(timeline, nodeId, time))
    );
    const split = splitSegment(posed[change.segmentIndex]!, posed[endFlat]!, change.t);
    put(`${pointPrefixNew}.position.x`, time, split.point.position.x);
    put(`${pointPrefixNew}.position.y`, time, split.point.position.y);
    for (const handle of HANDLES) {
      put(`${pointPrefixNew}.${handle}.x`, time, split.point[handle]?.x ?? null);
      put(`${pointPrefixNew}.${handle}.y`, time, split.point[handle]?.y ?? null);
    }
    put(`${startPrefix}.handleOut.x`, time, split.start.handleOut?.x ?? null);
    put(`${startPrefix}.handleOut.y`, time, split.start.handleOut?.y ?? null);
    put(`${endPrefix}.handleIn.x`, time, split.end.handleIn?.x ?? null);
    put(`${endPrefix}.handleIn.y`, time, split.end.handleIn?.y ?? null);
    easings.set(time, easingAt(tracks, nodeId, `${startPrefix}.position.x`, time));
  }

  const result = [...tracks];
  for (const [property, byTime] of values) {
    // A handle that's never there needs no track
    if ([...byTime.values()].every((value) => value === null)) continue;
    let index = result.findIndex((track) => track.nodeId === nodeId && track.property === property);
    if (index === -1) {
      result.push(createTrack(nodeId, property));
      index = result.length - 1;
    }
    let track = result[index]!;
    for (const [time, value] of byTime) {
      track = keyAt(track, time, value ?? 0, easings.get(time) ?? 'linear');
    }
    result[index] = track;
  }
  return result;
}

/** The easing the start point's keyframe at this time uses, so the new point moves with it. */
function easingAt(
  tracks: PropertyTrack[],
  nodeId: string,
  property: string,
  time: number
): EasingFunction {
  const own = tracks.find((track) => track.nodeId === nodeId && track.property === property);
  const keyframe =
    own?.keyframes.find((kf) => kf.time === time) ??
    tracks
      .filter((track) => track.nodeId === nodeId && POINT_PROPERTY.test(track.property))
      .flatMap((track) => track.keyframes)
      .find((kf) => kf.time === time);
  return keyframe?.easing ?? 'linear';
}
