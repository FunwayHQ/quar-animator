/**
 * Path Editing for Quar Animator
 * Adding and deleting points of a path (all its contours, by flat index),
 * and finding the segment under the pointer — shared by Direct Selection
 * and the Pen.
 */

import type { Matrix3, PathNode, PathPoint, Vector2 } from '@quar/types';
import { mat3, vec2 } from '../math';
import { bezier } from './bezier';
import { schneiderFitCurve, curvesToPathPoints } from './schneider';
import {
  getAbsoluteControlPoints,
  getAllPoints,
  getContourRange,
  getSubpathBoundaries,
  splitSegment,
} from './pathUtils';

/** A bound path's skinning as the renderer has it, indexed by mesh vertex. */
export interface PathSkinPose {
  /** The mesh's vertices at rest, in the path's local space (x, y pairs) */
  vertices: Float32Array;
  /** The same vertices where the bones have them now, in world space */
  deformed: Float32Array;
  /** How each vertex's skinning maps local offsets to world: [a, b, c, d] */
  linear: Float32Array;
}

/**
 * Where each of a bound path's points (flat index) is drawn: a map from the
 * path's local space to world that holds at that point — the skinning of the
 * mesh vertex nearest it, so the point sits where the bones have it and its
 * handles turn with it. Edits go back through its inverse. Null when `pose`
 * doesn't fit together (then the path's world matrix is right).
 */
export function posedPointFrames(points: PathPoint[], pose: PathSkinPose): Matrix3[] | null {
  const { vertices, deformed, linear } = pose;
  const count = vertices.length / 2;
  if (count === 0 || deformed.length !== vertices.length || linear.length !== count * 4) {
    return null;
  }
  return points.map(({ position }) => {
    let nearest = 0;
    let nearestDistance = Infinity;
    for (let v = 0; v < count; v++) {
      const distance =
        (vertices[v * 2]! - position.x) ** 2 + (vertices[v * 2 + 1]! - position.y) ** 2;
      if (distance < nearestDistance) {
        nearest = v;
        nearestDistance = distance;
      }
    }
    const a = linear[nearest * 4]!;
    const b = linear[nearest * 4 + 1]!;
    const c = linear[nearest * 4 + 2]!;
    const d = linear[nearest * 4 + 3]!;
    const vx = vertices[nearest * 2]!;
    const vy = vertices[nearest * 2 + 1]!;
    // At the vertex, where the bones have it; around it, as its skinning maps
    return {
      a,
      b,
      c,
      d,
      tx: deformed[nearest * 2]! - (a * vx + c * vy),
      ty: deformed[nearest * 2 + 1]! - (b * vx + d * vy),
    };
  });
}

/** Points sampled along each segment of a bound path, to draw and hit it as its bones bend it. */
export const POSED_SEGMENT_SAMPLES = 16;

/**
 * A segment of a bound path as its bones draw it: points along its curve
 * (at even steps of its parameter, ends included), each mapped as the mesh
 * nearest it is (posedPointFrames). Null when `pose` doesn't fit together.
 */
export function posedSegmentPoints(
  from: PathPoint,
  to: PathPoint,
  pose: PathSkinPose,
  samples = POSED_SEGMENT_SAMPLES
): Vector2[] | null {
  const { cp1, cp2 } = getAbsoluteControlPoints(from, to);
  const along = Array.from({ length: samples + 1 }, (_, k) =>
    bezier.cubicPoint(from.position, cp1, cp2, to.position, k / samples)
  );
  const frames = posedPointFrames(
    along.map((position) => ({ position, handleIn: null, handleOut: null, type: 'corner' })),
    pose
  );
  return frames ? along.map((point, k) => mat3.transformPoint(frames[k]!, point)) : null;
}

/**
 * Where each point (flat index) is drawn: its posedPointFrames when the node
 * is bound and `pose` fits, else the node's world matrix.
 */
export function pointFrameLookup(
  points: PathPoint[],
  world: Matrix3,
  pose: PathSkinPose | null
): (index: number) => Matrix3 {
  const frames = pose ? posedPointFrames(points, pose) : null;
  return (index) => frames?.[index] ?? world;
}

/** A path's points as a node stores them: the main contour, then any others. */
export interface PathContours {
  points: PathPoint[];
  subpaths: PathPoint[][] | undefined;
}

function toContours(contours: PathPoint[][]): PathContours {
  return {
    points: contours[0] ?? [],
    subpaths: contours.length > 1 ? contours.slice(1) : undefined,
  };
}

/** The flat index of the point a segment (starting at segmentIndex) ends on. */
export function segmentEndIndex(
  node: Pick<PathNode, 'points' | 'subpaths'>,
  segmentIndex: number
): number {
  const { start, end } = getContourRange(getSubpathBoundaries(node), segmentIndex);
  return start + ((segmentIndex - start + 1) % (end - start));
}

/**
 * The path with a point split into the segment that starts at segmentIndex,
 * t (the cubic's parameter) along it, keeping its shape; the new point is
 * at flat index segmentIndex + 1.
 */
export function insertPathPoint(
  node: Pick<PathNode, 'points' | 'subpaths'>,
  segmentIndex: number,
  t: number
): PathContours {
  const allPts = getAllPoints(node);
  const boundaries = getSubpathBoundaries(node);
  const endIndex = segmentEndIndex(node, segmentIndex);
  const split = splitSegment(allPts[segmentIndex]!, allPts[endIndex]!, t);

  const newAll = [...allPts];
  newAll[segmentIndex] = split.start;
  newAll[endIndex] = split.end;
  newAll.splice(segmentIndex + 1, 0, split.point);

  // Rebuild the contours, the one split growing by a point
  const contours: PathPoint[][] = [];
  let offset = 0;
  for (let c = 0; c < boundaries.length - 1; c++) {
    const cStart = boundaries[c]!;
    const cEnd = boundaries[c + 1]!;
    const extra = cStart <= segmentIndex && segmentIndex < cEnd ? 1 : 0;
    contours.push(newAll.slice(offset, offset + (cEnd - cStart) + extra));
    offset += cEnd - cStart + extra;
  }
  return toContours(contours);
}

/**
 * The path with these points (flat indices) deleted, contours left empty
 * dropped; null when fewer than two points would remain.
 */
export function deletePathPoints(
  node: Pick<PathNode, 'points' | 'subpaths'>,
  indices: Iterable<number>
): PathContours | null {
  const allPts = getAllPoints(node);
  const boundaries = getSubpathBoundaries(node);
  const deleted = new Set(indices);

  const contours: PathPoint[][] = [];
  for (let c = 0; c < boundaries.length - 1; c++) {
    const start = boundaries[c] ?? 0;
    const end = boundaries[c + 1] ?? allPts.length;
    const contour = allPts.slice(start, end).filter((_point, i) => !deleted.has(start + i));
    if (contour.length > 0) contours.push(contour);
  }
  const remaining = contours.reduce((sum, contour) => sum + contour.length, 0);
  return remaining < 2 ? null : toContours(contours);
}

/**
 * The segment of the path nearest `worldPos` within `radius`: its index (the
 * flat index it starts at), how far along it (t, the curve's parameter) and
 * how far away. A bound path (`pose`) is measured as its bones draw it.
 */
export function nearestPathSegment(
  node: PathNode,
  toWorld: Matrix3,
  worldPos: Vector2,
  radius: number,
  pose: PathSkinPose | null = null
): { segmentIndex: number; t: number; distance: number } | null {
  const allPts = getAllPoints(node);
  const boundaries = getSubpathBoundaries(node);
  const world = (v: Vector2) => mat3.transformPoint(toWorld, v);
  let best: { segmentIndex: number; t: number; distance: number } | null = null;

  for (let c = 0; c < boundaries.length - 1; c++) {
    const start = boundaries[c]!;
    const contourLength = boundaries[c + 1]! - start;
    const segments = node.closed ? contourLength : contourLength - 1;
    for (let local = 0; local < segments; local++) {
      const segmentIndex = start + local;
      const p1 = allPts[segmentIndex]!;
      const p2 = allPts[start + ((local + 1) % contourLength)]!;
      const posed = pose ? posedSegmentPoints(p1, p2, pose) : null;
      let nearest: { t: number; distance: number };
      if (posed) {
        nearest = nearestOnPolyline(posed, worldPos);
      } else {
        const { cp1, cp2 } = getAbsoluteControlPoints(p1, p2);
        // An affine map keeps a bezier a bezier, with the same t along it
        nearest = bezier.nearestPoint(
          world(p1.position),
          world(cp1),
          world(cp2),
          world(p2.position),
          worldPos
        );
      }
      if (nearest.distance < radius && (!best || nearest.distance < best.distance)) {
        best = { segmentIndex, t: nearest.t, distance: nearest.distance };
      }
    }
  }
  return best;
}

/** The nearest place on a polyline of evenly spaced samples: t from 0 to 1 along it. */
function nearestOnPolyline(points: Vector2[], target: Vector2): { t: number; distance: number } {
  let best = { t: 0, distance: Infinity };
  const steps = points.length - 1;
  for (let k = 0; k < steps; k++) {
    const a = points[k]!;
    const b = points[k + 1]!;
    const ab = vec2.subtract(b, a);
    const lengthSq = vec2.dot(ab, ab);
    const u =
      lengthSq > 0
        ? Math.min(1, Math.max(0, vec2.dot(vec2.subtract(target, a), ab) / lengthSq))
        : 0;
    const distance = vec2.distance(target, vec2.lerp(a, b, u));
    if (distance < best.distance) best = { t: (k + u) / steps, distance };
  }
  return best;
}

/** The point of the path (flat index) nearest `worldPos` within `radius`, or null. */
export function nearestPathPoint(
  node: Pick<PathNode, 'points' | 'subpaths'>,
  toWorld: Matrix3,
  worldPos: Vector2,
  radius: number
): number | null {
  let best: number | null = null;
  let bestDistance = radius;
  getAllPoints(node).forEach((point, index) => {
    const world = mat3.transformPoint(toWorld, point.position);
    const distance = Math.hypot(world.x - worldPos.x, world.y - worldPos.y);
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  return best;
}

/** Where a path turns more sharply than this (degrees), a point stays when simplifying. */
const SHARP_TURN = 25;

/** The direction a point is left (out) and reached (in) along, from its handles or neighbours. */
function tangents(
  points: PathPoint[],
  i: number,
  closed: boolean
): { into?: Vector2; out?: Vector2 } {
  const n = points.length;
  const point = points[i]!;
  const prev = i > 0 ? points[i - 1] : closed ? points[n - 1] : undefined;
  const next = i < n - 1 ? points[i + 1] : closed ? points[0] : undefined;
  const into = prev
    ? point.handleIn
      ? vec2.multiply(point.handleIn, -1)
      : vec2.subtract(
          point.position,
          prev.handleOut ? vec2.add(prev.position, prev.handleOut) : prev.position
        )
    : undefined;
  const out = next
    ? (point.handleOut ??
      vec2.subtract(
        next.handleIn ? vec2.add(next.position, next.handleIn) : next.position,
        point.position
      ))
    : undefined;
  return { into, out };
}

/** Points along the segment from a to b, evenly in t, a included (b not). */
function sampleSegment(a: PathPoint, b: PathPoint, spacing: number): Vector2[] {
  const { cp1, cp2 } = getAbsoluteControlPoints(a, b);
  const length = bezier.cubicLength(a.position, cp1, cp2, b.position);
  const steps = Math.min(64, Math.max(4, Math.ceil(length / spacing)));
  const samples: Vector2[] = [];
  for (let k = 0; k < steps; k++) {
    samples.push(bezier.cubicPoint(a.position, cp1, cp2, b.position, k / steps));
  }
  return samples;
}

/**
 * A contour with fewer points, its shape kept within `tolerance`: points where
 * it turns sharply (and an open contour's ends) stay where they are, and the
 * stretches between them are refitted with as few smooth curves as hold the
 * shape (Schneider's fitting, as for brush strokes). The contour as it was
 * when that wouldn't remove any points.
 */
export function simplifyContour(
  points: PathPoint[],
  closed: boolean,
  tolerance: number
): PathPoint[] {
  const n = points.length;
  if (n < 3) return points;

  // The points that stay: sharp turns, and an open contour's ends
  const kept: number[] = [];
  for (let i = 0; i < n; i++) {
    const { into, out } = tangents(points, i, closed);
    if (!into || !out) {
      kept.push(i);
      continue;
    }
    const turn = Math.abs(vec2.angleBetween(into, out)) * (180 / Math.PI);
    if (turn > SHARP_TURN) kept.push(i);
  }
  if (closed && kept.length === 0) kept.push(0);

  // Each stretch from one kept point to the next, refitted
  const spacing = Math.max(tolerance, 0.01);
  const runs = closed ? kept.length : kept.length - 1;
  const result: PathPoint[] = [];
  for (let r = 0; r < runs; r++) {
    const from = kept[r]!;
    const to = kept[(r + 1) % kept.length]!;
    const samples: Vector2[] = [];
    for (let i = from; i !== to || samples.length === 0; i = (i + 1) % n) {
      samples.push(...sampleSegment(points[i]!, points[(i + 1) % n]!, spacing));
      if ((i + 1) % n === to) break;
    }
    samples.push({ ...points[to]!.position });
    const fitted = curvesToPathPoints(schneiderFitCurve(samples, tolerance * tolerance));
    if (fitted.length < 2) continue;
    // The run's first point is the kept point: take its handle out from the fit
    const start = { ...points[from]!, handleOut: fitted[0]!.handleOut };
    if (result.length === 0) result.push(start);
    else
      result[result.length - 1] = {
        ...result[result.length - 1]!,
        handleOut: fitted[0]!.handleOut,
      };
    result.push(...fitted.slice(1, -1));
    const end = fitted[fitted.length - 1]!;
    result.push({ ...points[to]!, handleIn: end.handleIn, handleOut: points[to]!.handleOut });
  }
  if (closed && result.length > 1) {
    // The loop ends on the point it started from: one point, both handles
    const last = result.pop();
    result[0] = { ...result[0]!, handleIn: last?.handleIn ?? null };
  }
  return result.length >= 2 && result.length < n ? result : points;
}

/** A point with no handle on one side: where a cut path now starts or ends. */
function endPoint(point: PathPoint, side: 'handleIn' | 'handleOut'): PathPoint {
  return { ...point, [side]: null };
}

/**
 * A contour cut at these points (its indices): the open pieces it falls into,
 * each cut point ending one piece and starting the next. A closed contour cut
 * at one point opens there; an open one isn't cut at its ends. The contour as
 * it was (one piece) when nothing is cut.
 */
export function cutContour(points: PathPoint[], closed: boolean, cuts: number[]): PathPoint[][] {
  const n = points.length;
  const at = [...new Set(cuts)]
    .filter((i) => i >= 0 && i < n && (closed || (i > 0 && i < n - 1)))
    .sort((a, b) => a - b);
  if (at.length === 0) return [points];

  const pieces: PathPoint[][] = [];
  if (closed) {
    // From each cut round to the next (the same one, with a single cut)
    for (let k = 0; k < at.length; k++) {
      const from = at[k]!;
      const to = at[(k + 1) % at.length]!;
      const piece: PathPoint[] = [];
      let i = from;
      do {
        piece.push(points[i]!);
        i = (i + 1) % n;
      } while (i !== to);
      piece.push(points[to]!);
      pieces.push(piece);
    }
  } else {
    const ends = [0, ...at, n - 1];
    for (let k = 0; k < ends.length - 1; k++) pieces.push(points.slice(ends[k], ends[k + 1]! + 1));
  }
  return pieces.map((piece) =>
    piece.map((point, i) =>
      i === 0
        ? endPoint(point, 'handleIn')
        : i === piece.length - 1
          ? endPoint(point, 'handleOut')
          : point
    )
  );
}

/**
 * Two open contours joined end to end, the end of `a` meeting the start of
 * `b`: one point where they meet (within `tolerance`), else a straight
 * segment between them.
 */
export function joinContours(a: PathPoint[], b: PathPoint[], tolerance: number): PathPoint[] {
  const last = a[a.length - 1];
  const first = b[0];
  if (!last || !first) return [...a, ...b];
  if (vec2.distance(last.position, first.position) <= tolerance) {
    const meeting: PathPoint = { ...last, handleOut: first.handleOut, type: 'corner' };
    return [...a.slice(0, -1), meeting, ...b.slice(1)];
  }
  return [...endPointsOpen(a, 'end'), ...endPointsOpen(b, 'start')];
}

/** A contour whose end (or start) gets no handle on its outer side. */
function endPointsOpen(points: PathPoint[], at: 'start' | 'end'): PathPoint[] {
  if (points.length === 0) return points;
  return at === 'end'
    ? [...points.slice(0, -1), endPoint(points[points.length - 1]!, 'handleOut')]
    : [endPoint(points[0]!, 'handleIn'), ...points.slice(1)];
}

/** A contour mapped by a matrix: positions as points, handles as directions. */
export function transformContour(points: PathPoint[], m: Matrix3): PathPoint[] {
  const direction = (v: Vector2 | null) =>
    v ? { x: m.a * v.x + m.c * v.y, y: m.b * v.x + m.d * v.y } : null;
  return points.map((point) => ({
    ...point,
    position: mat3.transformPoint(m, point.position),
    handleIn: direction(point.handleIn),
    handleOut: direction(point.handleOut),
  }));
}
