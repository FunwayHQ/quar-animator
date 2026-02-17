/**
 * GraphEditorUtils — Pure utility functions for the animation curve graph editor.
 *
 * Tangent handles are a visual editing layer on top of the easing system.
 * The easing field on Keyframe remains the source of truth for interpolation.
 * Only cubic-bezier and linear easings support tangent handle editing.
 */

import type { EasingFunction, Keyframe, PropertyTrack, TangentMode, Vector2 } from '@quar/types';
import { easingToBezierPoints, applyEasing, createCubicBezier } from './Easing';

// ============================================================================
// Types
// ============================================================================

export interface GraphViewTransform {
  offsetX: number; // horizontal scroll in pixels
  offsetY: number; // vertical scroll in pixels
  scaleX: number; // pixels per frame
  scaleY: number; // pixels per value unit
  viewWidth: number;
  viewHeight: number;
}

export interface TangentPair {
  tangentIn: Vector2;
  tangentOut: Vector2;
}

export interface TangentHandleHit {
  keyframeId: string;
  side: 'in' | 'out';
}

// ============================================================================
// Track Colors
// ============================================================================

const TRACK_COLORS = [
  '#ff4444', // red
  '#44bb44', // green
  '#4488ff', // blue
  '#ffbb33', // yellow/orange
  '#44dddd', // cyan
  '#dd44dd', // magenta
  '#ff8844', // orange
  '#aa66ff', // purple
  '#88dd44', // lime
  '#ff6699', // pink
];

/**
 * Get a distinct color for a track by index.
 */
export function getTrackColor(index: number): string {
  return TRACK_COLORS[index % TRACK_COLORS.length];
}

// ============================================================================
// Easing Editability
// ============================================================================

/**
 * Returns true if the easing can be edited via tangent handles
 * (cubic bezier or linear). Preset easings like bounce/elastic/spring
 * are displayed as sampled polylines but not editable via handles.
 */
export function isEasingEditable(easing: EasingFunction): boolean {
  if (typeof easing === 'string') {
    return easing === 'linear';
  }
  return easing.type === 'cubicBezier';
}

// ============================================================================
// Coordinate Transforms
// ============================================================================

/**
 * Convert graph-space (frame, value) to screen-space pixel coordinates.
 * X: frame * scaleX - offsetX
 * Y: viewHeight/2 - (value * scaleY - offsetY)  (Y-down in screen space)
 */
export function graphToScreen(
  frame: number,
  value: number,
  transform: GraphViewTransform
): { x: number; y: number } {
  const x = frame * transform.scaleX - transform.offsetX;
  const y = transform.viewHeight / 2 - (value * transform.scaleY - transform.offsetY);
  return { x, y };
}

/**
 * Convert screen-space pixel coordinates to graph-space (frame, value).
 */
export function screenToGraph(
  screenX: number,
  screenY: number,
  transform: GraphViewTransform
): { frame: number; value: number } {
  const frame = (screenX + transform.offsetX) / transform.scaleX;
  const value = (transform.viewHeight / 2 - screenY + transform.offsetY) / transform.scaleY;
  return { frame, value };
}

// ============================================================================
// Tangent ↔ Easing Conversion
// ============================================================================

/**
 * Convert an easing function to visual tangent handles in absolute frame/value space.
 * Returns null for non-editable easings.
 *
 * The bezier control points [x1,y1,x2,y2] are in normalized [0,1] space.
 * We scale them to the actual time/value span between keyframes.
 *
 * tangentOut = outgoing handle from prevKf (relative to prevKf position)
 * tangentIn = incoming handle to nextKf (relative to nextKf position)
 */
export function easingToTangents(
  easing: EasingFunction,
  prevTime: number,
  prevValue: number,
  nextTime: number,
  nextValue: number
): TangentPair | null {
  const points = easingToBezierPoints(easing);
  if (!points) return null;

  const [x1, y1, x2, y2] = points;
  const dt = nextTime - prevTime;
  const dv = nextValue - prevValue;

  // tangentOut is relative to prev keyframe (positive = forward)
  const tangentOut: Vector2 = { x: x1 * dt, y: y1 * dv };
  // tangentIn is relative to next keyframe (negative = backward toward prev)
  const tangentIn: Vector2 = { x: (x2 - 1) * dt, y: (y2 - 1) * dv };

  return { tangentIn, tangentOut };
}

/**
 * Convert tangent handles back to a CubicBezierEasing.
 *
 * tangentOut: relative to the start keyframe (outgoing)
 * tangentIn: relative to the end keyframe (incoming)
 * dt: time span between keyframes
 * dv: value span between keyframes
 */
export function tangentsToEasing(
  tangentOut: Vector2,
  tangentIn: Vector2,
  dt: number,
  dv: number
): EasingFunction {
  if (dt === 0) return 'linear';

  // Normalize tangent to [0,1] bezier space
  const x1 = Math.max(0, Math.min(1, tangentOut.x / dt));
  const y1 = dv !== 0 ? tangentOut.y / dv : 0;
  const x2 = Math.max(0, Math.min(1, 1 + tangentIn.x / dt));
  const y2 = dv !== 0 ? 1 + tangentIn.y / dv : 1;

  // Check if effectively linear
  if (
    Math.abs(x1) < 0.001 &&
    Math.abs(y1) < 0.001 &&
    Math.abs(x2 - 1) < 0.001 &&
    Math.abs(y2 - 1) < 0.001
  ) {
    return 'linear';
  }

  return createCubicBezier(x1, y1, x2, y2);
}

/**
 * Compute automatic tangent for a keyframe using Catmull-Rom style.
 * If prev or next is null, uses a flat tangent (zero slope).
 */
export function computeAutoTangent(
  prev: { time: number; value: number } | null,
  current: { time: number; value: number },
  next: { time: number; value: number } | null
): TangentPair {
  // Default: flat tangent
  let slopeIn = 0;
  let slopeOut = 0;

  if (prev && next) {
    // Catmull-Rom: slope = (next.value - prev.value) / (next.time - prev.time)
    const totalDt = next.time - prev.time;
    if (totalDt > 0) {
      const slope = (next.value - prev.value) / totalDt;
      slopeIn = slope;
      slopeOut = slope;
    }
  } else if (prev && !next) {
    // Last keyframe: slope from prev
    const dt = current.time - prev.time;
    if (dt > 0) {
      slopeIn = (current.value - prev.value) / dt;
    }
  } else if (!prev && next) {
    // First keyframe: slope toward next
    const dt = next.time - current.time;
    if (dt > 0) {
      slopeOut = (next.value - current.value) / dt;
    }
  }

  // tangent length = 1/3 of the span to adjacent keyframe
  const dtIn = prev ? (current.time - prev.time) / 3 : 1;
  const dtOut = next ? (next.time - current.time) / 3 : 1;

  return {
    tangentIn: { x: -dtIn, y: -slopeIn * dtIn },
    tangentOut: { x: dtOut, y: slopeOut * dtOut },
  };
}

/**
 * Get the effective tangent for a keyframe, using stored tangent or computing from mode.
 */
export function getEffectiveTangent(
  keyframe: Keyframe<number>,
  side: 'in' | 'out',
  prevKf: Keyframe<number> | null,
  nextKf: Keyframe<number> | null
): Vector2 {
  const mode = keyframe.tangentMode ?? 'auto';

  if (mode === 'linear') {
    // Linear: tangent points directly at adjacent keyframe
    if (side === 'out' && nextKf) {
      const dt = nextKf.time - keyframe.time;
      const dv = nextKf.value - keyframe.value;
      return { x: dt / 3, y: dv / 3 };
    }
    if (side === 'in' && prevKf) {
      const dt = prevKf.time - keyframe.time;
      const dv = prevKf.value - keyframe.value;
      return { x: dt / 3, y: dv / 3 };
    }
    return { x: 0, y: 0 };
  }

  // Check stored tangent first
  const stored = side === 'in' ? keyframe.tangentIn : keyframe.tangentOut;
  if (stored && mode !== 'auto') {
    return stored;
  }

  // Auto: compute from neighbors
  const auto = computeAutoTangent(
    prevKf ? { time: prevKf.time, value: prevKf.value } : null,
    { time: keyframe.time, value: keyframe.value },
    nextKf ? { time: nextKf.time, value: nextKf.value } : null
  );

  return side === 'in' ? auto.tangentIn : auto.tangentOut;
}

/**
 * Enforce tangent mode constraints after one side is edited.
 *
 * - smooth: equal angle AND magnitude (mirror)
 * - aligned: equal angle, independent magnitude
 * - free: fully independent
 * - linear: zero-length (computed on the fly)
 * - auto: computed from neighbors
 */
export function enforceTangentMode(
  tangentIn: Vector2,
  tangentOut: Vector2,
  mode: TangentMode,
  editedSide: 'in' | 'out'
): TangentPair {
  if (mode === 'free' || mode === 'auto' || mode === 'linear') {
    return { tangentIn, tangentOut };
  }

  const edited = editedSide === 'in' ? tangentIn : tangentOut;
  const editedLen = Math.sqrt(edited.x * edited.x + edited.y * edited.y);

  if (editedLen < 0.0001) {
    return { tangentIn, tangentOut };
  }

  // Direction: opposite side points in opposite direction
  const dirX = -edited.x / editedLen;
  const dirY = -edited.y / editedLen;

  if (mode === 'smooth') {
    // Mirror: same angle and magnitude
    const mirrored: Vector2 = { x: dirX * editedLen, y: dirY * editedLen };
    if (editedSide === 'in') {
      return { tangentIn, tangentOut: mirrored };
    } else {
      return { tangentIn: mirrored, tangentOut };
    }
  }

  if (mode === 'aligned') {
    // Same angle, keep other side's magnitude
    const other = editedSide === 'in' ? tangentOut : tangentIn;
    const otherLen = Math.sqrt(other.x * other.x + other.y * other.y);
    const aligned: Vector2 = { x: dirX * otherLen, y: dirY * otherLen };
    if (editedSide === 'in') {
      return { tangentIn, tangentOut: aligned };
    } else {
      return { tangentIn: aligned, tangentOut };
    }
  }

  return { tangentIn, tangentOut };
}

// ============================================================================
// View Fitting
// ============================================================================

/**
 * Compute a GraphViewTransform that fits the given keyframes into the view with padding.
 */
export function fitKeyframesToView(
  keyframes: Array<{ time: number; value: number }>,
  viewWidth: number,
  viewHeight: number,
  padding: number = 40
): GraphViewTransform {
  if (keyframes.length === 0) {
    return {
      offsetX: 0,
      offsetY: 0,
      scaleX: 10,
      scaleY: 50,
      viewWidth,
      viewHeight,
    };
  }

  let minTime = Infinity,
    maxTime = -Infinity;
  let minVal = Infinity,
    maxVal = -Infinity;

  for (const kf of keyframes) {
    if (kf.time < minTime) minTime = kf.time;
    if (kf.time > maxTime) maxTime = kf.time;
    if (kf.value < minVal) minVal = kf.value;
    if (kf.value > maxVal) maxVal = kf.value;
  }

  const timeRange = maxTime - minTime || 1;
  const valueRange = maxVal - minVal || 1;

  const usableWidth = viewWidth - padding * 2;
  const usableHeight = viewHeight - padding * 2;

  const scaleX = Math.max(1, usableWidth / timeRange);
  const scaleY = Math.max(1, usableHeight / valueRange);

  // Center the content
  const midTime = (minTime + maxTime) / 2;
  const midVal = (minVal + maxVal) / 2;

  const offsetX = midTime * scaleX - viewWidth / 2;
  const offsetY = midVal * scaleY - viewHeight / 2;

  return { offsetX, offsetY, scaleX, scaleY, viewWidth, viewHeight };
}

// ============================================================================
// Hit Testing
// ============================================================================

/**
 * Find the nearest keyframe to a screen position within a threshold.
 */
export function findNearestKeyframe(
  screenPos: { x: number; y: number },
  keyframes: Array<{ id: string; time: number; value: number }>,
  transform: GraphViewTransform,
  threshold: number = 10
): { id: string; time: number; value: number } | null {
  let nearest: { id: string; time: number; value: number } | null = null;
  let nearestDist = threshold;

  for (const kf of keyframes) {
    const pos = graphToScreen(kf.time, kf.value, transform);
    const dx = pos.x - screenPos.x;
    const dy = pos.y - screenPos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = kf;
    }
  }

  return nearest;
}

/**
 * Find the nearest tangent handle to a screen position within a threshold.
 */
export function findNearestTangentHandle(
  screenPos: { x: number; y: number },
  keyframes: Array<{
    id: string;
    time: number;
    value: number;
    tangentIn?: Vector2;
    tangentOut?: Vector2;
    easing: EasingFunction;
  }>,
  transform: GraphViewTransform,
  threshold: number = 10
): TangentHandleHit | null {
  let nearest: TangentHandleHit | null = null;
  let nearestDist = threshold;

  for (const kf of keyframes) {
    if (!isEasingEditable(kf.easing)) continue;

    // Check tangentIn handle
    if (kf.tangentIn) {
      const basePos = graphToScreen(kf.time, kf.value, transform);
      const handlePos = graphToScreen(
        kf.time + kf.tangentIn.x,
        kf.value + kf.tangentIn.y,
        transform
      );
      const dx = handlePos.x - screenPos.x;
      const dy = handlePos.y - screenPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = { keyframeId: kf.id, side: 'in' };
      }
    }

    // Check tangentOut handle
    if (kf.tangentOut) {
      const handlePos = graphToScreen(
        kf.time + kf.tangentOut.x,
        kf.value + kf.tangentOut.y,
        transform
      );
      const dx = handlePos.x - screenPos.x;
      const dy = handlePos.y - screenPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = { keyframeId: kf.id, side: 'out' };
      }
    }
  }

  return nearest;
}

/**
 * Find all keyframes whose screen position falls within a rectangle.
 */
export function findKeyframesInRect(
  rect: { x: number; y: number; width: number; height: number },
  keyframes: Array<{ id: string; time: number; value: number }>,
  transform: GraphViewTransform
): string[] {
  const ids: string[] = [];
  const rx = rect.x;
  const ry = rect.y;
  const rr = rect.x + rect.width;
  const rb = rect.y + rect.height;

  // Normalize in case rect is drawn right-to-left or bottom-to-top
  const left = Math.min(rx, rr);
  const right = Math.max(rx, rr);
  const top = Math.min(ry, rb);
  const bottom = Math.max(ry, rb);

  for (const kf of keyframes) {
    const pos = graphToScreen(kf.time, kf.value, transform);
    if (pos.x >= left && pos.x <= right && pos.y >= top && pos.y <= bottom) {
      ids.push(kf.id);
    }
  }

  return ids;
}

// ============================================================================
// Curve Sampling
// ============================================================================

/**
 * Sample the easing curve between two keyframes for SVG rendering.
 * Returns points in graph space (frame, value).
 */
export function sampleCurveSegment(
  kf1Time: number,
  kf1Value: number,
  kf2Time: number,
  kf2Value: number,
  easing: EasingFunction,
  numSamples: number = 32
): Array<{ frame: number; value: number }> {
  const points: Array<{ frame: number; value: number }> = [];
  const dt = kf2Time - kf1Time;
  const dv = kf2Value - kf1Value;

  for (let i = 0; i <= numSamples; i++) {
    const t = i / numSamples;
    const easedT = applyEasing(t, easing);
    points.push({
      frame: kf1Time + t * dt,
      value: kf1Value + easedT * dv,
    });
  }

  return points;
}

/**
 * Build an SVG path string for a track's animation curves in screen space.
 */
export function buildTrackCurvePath(
  track: PropertyTrack<number>,
  transform: GraphViewTransform,
  numSamples: number = 32
): string {
  const kfs = track.keyframes;
  if (kfs.length === 0) return '';

  const parts: string[] = [];

  // Single keyframe: just a dot position (no line)
  if (kfs.length === 1) {
    const pos = graphToScreen(kfs[0].time, kfs[0].value, transform);
    return `M${pos.x},${pos.y}`;
  }

  // Extend line from start to first keyframe (constant value)
  const firstPos = graphToScreen(kfs[0].time, kfs[0].value, transform);
  const leftEdge = graphToScreen(0, kfs[0].value, transform);
  if (leftEdge.x < firstPos.x) {
    parts.push(`M${leftEdge.x},${leftEdge.y} L${firstPos.x},${firstPos.y}`);
  }

  // Draw curve segments between keyframes
  for (let i = 0; i < kfs.length - 1; i++) {
    const kf1 = kfs[i];
    const kf2 = kfs[i + 1];
    // Easing convention: after.easing controls the incoming transition
    const easing = kf2.easing;
    const samples = sampleCurveSegment(
      kf1.time,
      kf1.value,
      kf2.time,
      kf2.value,
      easing,
      numSamples
    );

    for (let j = 0; j < samples.length; j++) {
      const pos = graphToScreen(samples[j].frame, samples[j].value, transform);
      if (i === 0 && j === 0) {
        parts.push(`M${pos.x.toFixed(1)},${pos.y.toFixed(1)}`);
      } else {
        parts.push(`L${pos.x.toFixed(1)},${pos.y.toFixed(1)}`);
      }
    }
  }

  // Extend line from last keyframe to the right (constant value)
  const lastKf = kfs[kfs.length - 1];
  const lastPos = graphToScreen(lastKf.time, lastKf.value, transform);
  const rightEdge = graphToScreen(lastKf.time + 30, lastKf.value, transform);
  parts.push(`L${rightEdge.x.toFixed(1)},${rightEdge.y.toFixed(1)}`);

  return parts.join(' ');
}

// ============================================================================
// Value Range
// ============================================================================

/**
 * Get the min/max value range across all tracks.
 */
export function getValueRange(tracks: PropertyTrack<number>[]): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;

  for (const track of tracks) {
    for (const kf of track.keyframes) {
      const v = kf.value;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }

  if (!isFinite(min)) {
    return { min: 0, max: 1 };
  }

  // Ensure a minimum range
  if (max - min < 0.001) {
    return { min: min - 0.5, max: max + 0.5 };
  }

  return { min, max };
}
