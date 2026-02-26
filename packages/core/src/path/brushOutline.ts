/**
 * Brush outline generation utility for Quar Animator
 *
 * Generates a closed variable-width outline from a spine curve and per-point widths.
 * Extracted from BrushTool for reuse in profile reshaping.
 */

import type { BrushProfile, PathPoint, Vector2 } from '@quar/types';
import { vec2 } from '../math';
import { tessellatePathToPoints } from './pathUtils';

/**
 * Generate a closed outline from spine points with variable width.
 * Tessellates the spine, computes perpendicular offsets per sample,
 * and returns the outline as corner PathPoints.
 *
 * When `profile` is provided, each sample's width is multiplied by the
 * linearly-interpolated profile value at that position along the path.
 */
export function generateBrushOutline(
  spinePoints: PathPoint[],
  widths: number[],
  profile?: BrushProfile
): PathPoint[] {
  if (spinePoints.length < 2) return spinePoints;

  // Tessellate spine into dense sample points
  const sampleCount = Math.max(spinePoints.length * 8, 40);
  const tessellated: Vector2[] = tessellatePathToPoints(spinePoints, false, 0.5);

  if (tessellated.length < 2) return spinePoints;

  // Resample to uniform arc-length spacing
  const totalLength = computePolylineLength(tessellated);
  if (totalLength < 0.001) return spinePoints;

  const step = totalLength / (sampleCount - 1);

  // Build cumulative distances
  const cumDist: number[] = [0];
  for (let i = 1; i < tessellated.length; i++) {
    cumDist.push(cumDist[i - 1]! + vec2.distance(tessellated[i - 1]!, tessellated[i]!));
  }

  const samples: Vector2[] = [];
  const sampleWidths: number[] = [];
  // Extract profile samples (cast to satisfy ESLint — @quar/types resolves as any)
  const profileSamples: number[] | undefined = profile
    ? (profile as { samples: number[] }).samples
    : undefined;

  for (let s = 0; s < sampleCount; s++) {
    const targetDist = s * step;
    const t = targetDist / totalLength;

    // Find segment in tessellated array
    let segIdx = 0;
    while (segIdx < cumDist.length - 2 && cumDist[segIdx + 1]! < targetDist) {
      segIdx++;
    }
    const segLen = cumDist[segIdx + 1]! - cumDist[segIdx]!;
    const localT = segLen > 0.0001 ? (targetDist - cumDist[segIdx]!) / segLen : 0;

    const p = vec2.lerp(
      tessellated[segIdx]!,
      tessellated[Math.min(segIdx + 1, tessellated.length - 1)]!,
      localT
    );
    samples.push(p);

    // Interpolate width at this t
    const widthT = t * (widths.length - 1);
    const wLo = Math.floor(widthT);
    const wHi = Math.min(wLo + 1, widths.length - 1);
    const wFrac = widthT - wLo;
    let w =
      (widths[wLo] ?? widths[0]!) +
      wFrac * ((widths[wHi] ?? widths[0]!) - (widths[wLo] ?? widths[0]!));

    // Apply profile multiplier if provided
    if (profileSamples && profileSamples.length >= 2) {
      const profileT = t * (profileSamples.length - 1);
      const pLo = Math.floor(profileT);
      const pHi = Math.min(pLo + 1, profileSamples.length - 1);
      const pFrac = profileT - pLo;
      const sLo = profileSamples[pLo] ?? 1;
      const sHi = profileSamples[pHi] ?? 1;
      const multiplier = sLo + pFrac * (sHi - sLo);
      w *= multiplier;
    }

    sampleWidths.push(w);
  }

  // Compute perpendicular offsets
  const leftSide: Vector2[] = [];
  const rightSide: Vector2[] = [];
  let lastPerpX = 0;
  let lastPerpY = 1;

  for (let i = 0; i < samples.length; i++) {
    const curr = samples[i]!;
    const prev = i > 0 ? samples[i - 1]! : null;
    const next = i < samples.length - 1 ? samples[i + 1]! : null;

    let dx = 0;
    let dy = 0;
    if (prev && next) {
      dx = next.x - prev.x;
      dy = next.y - prev.y;
    } else if (next) {
      dx = next.x - curr.x;
      dy = next.y - curr.y;
    } else if (prev) {
      dx = curr.x - prev.x;
      dy = curr.y - prev.y;
    }

    const len = Math.sqrt(dx * dx + dy * dy);
    let perpX: number;
    let perpY: number;
    if (len < 0.001) {
      perpX = lastPerpX;
      perpY = lastPerpY;
    } else {
      perpX = -dy / len;
      perpY = dx / len;
      lastPerpX = perpX;
      lastPerpY = perpY;
    }

    const halfWidth = Math.max(sampleWidths[i]! / 2, 0.5);
    leftSide.push({
      x: curr.x + perpX * halfWidth,
      y: curr.y + perpY * halfWidth,
    });
    rightSide.push({
      x: curr.x - perpX * halfWidth,
      y: curr.y - perpY * halfWidth,
    });
  }

  // Only add round caps at narrow (tapered) ends. At wide ends the semicircular
  // cap can curve inward and create a concave artifact. A flat connection
  // (left↔right) looks clean for wide ends.
  const capPoints = 4;
  const maxSampleWidth = Math.max(...sampleWidths);
  const capThreshold = maxSampleWidth * 0.3;
  const startWidth = sampleWidths[0]!;
  const endWidth = sampleWidths[sampleWidths.length - 1]!;

  // Combine: [start cap] + left forward + [end cap] + right reversed
  const outline: PathPoint[] = [];

  // Start cap — only for narrow starts
  if (startWidth < capThreshold) {
    const startCap = generateRoundCap(samples[0]!, leftSide[0]!, rightSide[0]!, capPoints, true);
    for (const p of startCap) {
      outline.push(cornerPoint(p));
    }
  }

  // Left side forward
  for (const p of leftSide) {
    outline.push(cornerPoint(p));
  }

  // End cap — only for narrow ends
  if (endWidth < capThreshold) {
    const endCap = generateRoundCap(
      samples[samples.length - 1]!,
      leftSide[leftSide.length - 1]!,
      rightSide[rightSide.length - 1]!,
      capPoints,
      false
    );
    for (const p of endCap) {
      outline.push(cornerPoint(p));
    }
  }

  // Right side reversed
  for (let i = rightSide.length - 1; i >= 0; i--) {
    outline.push(cornerPoint(rightSide[i]!));
  }

  return outline;
}

// ============================================================================
// Helpers
// ============================================================================

export function cornerPoint(pos: Vector2): PathPoint {
  return {
    position: { ...pos },
    handleIn: null,
    handleOut: null,
    type: 'corner',
  };
}

export function computePolylineLength(points: Vector2[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += vec2.distance(points[i - 1]!, points[i]!);
  }
  return total;
}

/**
 * Generate a semicircular end cap.
 * @param center The endpoint of the stroke spine
 * @param leftPt The left offset point at this end
 * @param rightPt The right offset point at this end
 * @param numPoints Number of points in the semicircle
 * @param isStart Whether this is the start cap (rotates opposite)
 */
export function generateRoundCap(
  center: Vector2,
  leftPt: Vector2,
  rightPt: Vector2,
  numPoints: number,
  isStart: boolean
): Vector2[] {
  const radius = vec2.distance(leftPt, rightPt) / 2;
  if (radius < 0.01) return [];

  // Angle from center to the start of the arc
  const fromPt = isStart ? rightPt : leftPt;
  const startAngle = Math.atan2(fromPt.y - center.y, fromPt.x - center.x);

  const points: Vector2[] = [];
  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    const angle = startAngle + t * Math.PI; // semicircle = PI radians
    points.push({
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius,
    });
  }

  return points;
}
