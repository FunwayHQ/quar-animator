import type { PathPoint, Vector2 } from '@quar/types';
import { clonePathPoint, getAbsoluteControlPoints } from './pathUtils';

interface SampledSegment {
  from: PathPoint;
  to: PathPoint;
  cp1: Vector2;
  cp2: Vector2;
  samples: Vector2[];
  length: number;
}

const CURVE_SAMPLES = 32;
const LENGTH_EPSILON = 1e-6;

/** Return an open prefix of a path at an arc-length progress between 0 and 1. */
export function trimPathToProgress(
  points: PathPoint[],
  closed: boolean,
  progress: number
): PathPoint[] {
  if (points.length < 2 || !Number.isFinite(progress) || progress <= 0) return [];
  if (progress >= 1) return points.map(clonePathPoint);

  const segmentCount = closed ? points.length : points.length - 1;
  const segments: SampledSegment[] = [];
  let totalLength = 0;
  for (let index = 0; index < segmentCount; index++) {
    const from = points[index]!;
    const to = points[(index + 1) % points.length]!;
    const { cp1, cp2 } = getAbsoluteControlPoints(from, to);
    const samples = Array.from({ length: CURVE_SAMPLES + 1 }, (_, sampleIndex) =>
      cubicPoint(from.position, cp1, cp2, to.position, sampleIndex / CURVE_SAMPLES)
    );
    let length = 0;
    for (let sampleIndex = 1; sampleIndex < samples.length; sampleIndex++) {
      length += distance(samples[sampleIndex - 1]!, samples[sampleIndex]!);
    }
    segments.push({ from, to, cp1, cp2, samples, length });
    totalLength += length;
  }
  if (totalLength <= LENGTH_EPSILON) return [];

  let remaining = totalLength * Math.min(1, progress);
  const result = [clonePathPoint(points[0]!)];
  for (const segment of segments) {
    if (segment.length <= LENGTH_EPSILON) continue;
    if (remaining >= segment.length - LENGTH_EPSILON) {
      result.push(clonePathPoint(segment.to));
      remaining = Math.max(0, remaining - segment.length);
      continue;
    }

    const t = parameterAtLength(segment.samples, remaining);
    const [q1, q2, endpoint] = splitCubicPrefix(
      segment.from.position,
      segment.cp1,
      segment.cp2,
      segment.to.position,
      t
    );
    const start = result[result.length - 1]!;
    start.handleOut = subtract(q1, segment.from.position);

    const endPoint = clonePathPoint(segment.to);
    endPoint.position = endpoint;
    endPoint.handleIn = subtract(q2, endpoint);
    endPoint.handleOut = null;
    endPoint.type = 'smooth';
    delete endPoint.cornerRadius;
    result.push(endPoint);
    break;
  }

  return result.length >= 2 ? result : [];
}

function parameterAtLength(samples: Vector2[], targetLength: number): number {
  let traversed = 0;
  for (let index = 1; index < samples.length; index++) {
    const segmentLength = distance(samples[index - 1]!, samples[index]!);
    if (traversed + segmentLength >= targetLength) {
      const fraction =
        segmentLength > LENGTH_EPSILON ? (targetLength - traversed) / segmentLength : 0;
      return (index - 1 + Math.max(0, Math.min(1, fraction))) / CURVE_SAMPLES;
    }
    traversed += segmentLength;
  }
  return 1;
}

function splitCubicPrefix(
  p0: Vector2,
  p1: Vector2,
  p2: Vector2,
  p3: Vector2,
  t: number
): [Vector2, Vector2, Vector2] {
  const a = lerp(p0, p1, t);
  const b = lerp(p1, p2, t);
  const c = lerp(p2, p3, t);
  const d = lerp(a, b, t);
  const e = lerp(b, c, t);
  const endpoint = lerp(d, e, t);
  return [a, d, endpoint];
}

function cubicPoint(p0: Vector2, p1: Vector2, p2: Vector2, p3: Vector2, t: number): Vector2 {
  const inverse = 1 - t;
  const inverseSquared = inverse * inverse;
  const tSquared = t * t;
  return {
    x:
      inverseSquared * inverse * p0.x +
      3 * inverseSquared * t * p1.x +
      3 * inverse * tSquared * p2.x +
      tSquared * t * p3.x,
    y:
      inverseSquared * inverse * p0.y +
      3 * inverseSquared * t * p1.y +
      3 * inverse * tSquared * p2.y +
      tSquared * t * p3.y,
  };
}

function lerp(from: Vector2, to: Vector2, t: number): Vector2 {
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
}

function subtract(a: Vector2, b: Vector2): Vector2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

function distance(a: Vector2, b: Vector2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}
