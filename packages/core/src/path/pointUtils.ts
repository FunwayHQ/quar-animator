/**
 * Point Utilities for Quar Animator
 * Shared functions for point type conversion and handle symmetry
 * Used by PenTool and DirectSelectionTool
 */

import type { PathPoint, Vector2 } from '@quar/types';
import { vec2 } from '../math';

/** Default handle length when converting a corner point to smooth */
const DEFAULT_HANDLE_LENGTH = 30;

// ============================================================================
// Point Type Conversion
// ============================================================================

/**
 * Convert a point between corner and smooth types.
 *
 * - corner -> smooth: adds symmetric handles along the direction inferred
 *   from `prevPosition` / `nextPosition` neighbors (falls back to +X axis).
 * - smooth | symmetric -> corner: removes both handles.
 *
 * Returns a **new** PathPoint; the original is not mutated.
 *
 * @param point         The source point to convert.
 * @param prevPosition  Position of the previous neighbor (or null).
 * @param nextPosition  Position of the next neighbor (or null).
 * @param defaultHandleLength  Handle length when creating smooth handles (default 30).
 */
export function convertPointType(
  point: PathPoint,
  prevPosition: Vector2 | null,
  nextPosition: Vector2 | null,
  defaultHandleLength: number = DEFAULT_HANDLE_LENGTH
): PathPoint {
  if (point.type === 'corner') {
    // Convert to smooth with default handles
    let direction: Vector2 = { x: 1, y: 0 };

    if (prevPosition && nextPosition) {
      // Direction from prev to next
      const toNext = vec2.subtract(nextPosition, prevPosition);
      const len = vec2.length(toNext);
      if (len > 0) {
        direction = { x: toNext.x / len, y: toNext.y / len };
      }
    } else if (prevPosition) {
      // Direction from prev to this point
      const toPrev = vec2.subtract(point.position, prevPosition);
      const len = vec2.length(toPrev);
      if (len > 0) {
        direction = { x: toPrev.x / len, y: toPrev.y / len };
      }
    } else if (nextPosition) {
      // Direction from this point to next
      const toNext = vec2.subtract(nextPosition, point.position);
      const len = vec2.length(toNext);
      if (len > 0) {
        direction = { x: toNext.x / len, y: toNext.y / len };
      }
    }

    return {
      ...point,
      handleOut: {
        x: direction.x * defaultHandleLength,
        y: direction.y * defaultHandleLength,
      },
      handleIn: {
        x: -direction.x * defaultHandleLength,
        y: -direction.y * defaultHandleLength,
      },
      type: 'smooth',
    };
  } else {
    // Convert smooth/symmetric to corner (remove handles)
    return {
      ...point,
      handleIn: null,
      handleOut: null,
      type: 'corner',
    };
  }
}

// ============================================================================
// Handle Symmetry
// ============================================================================

/**
 * Update a handle on a path point, preserving symmetry for smooth/symmetric
 * point types.
 *
 * For **smooth** points the opposite handle keeps its original length but
 * mirrors the direction.  For **symmetric** points the opposite handle also
 * mirrors the length.  Corner points only update the target handle.
 *
 * Returns a **new** PathPoint; the original is not mutated.
 *
 * @param point          The source point (not mutated).
 * @param handleType     Which handle is being moved ('in' or 'out').
 * @param newHandleOffset  The new handle offset (relative to point.position).
 */
export function updateHandleWithSymmetry(
  point: PathPoint,
  handleType: 'in' | 'out',
  newHandleOffset: Vector2
): PathPoint {
  const result = { ...point };

  if (handleType === 'out') {
    result.handleOut = newHandleOffset;
    // For smooth/symmetric points, update the opposite handle
    if (point.type === 'smooth' || point.type === 'symmetric') {
      const length =
        point.type === 'symmetric' && point.handleIn
          ? vec2.length(newHandleOffset)
          : point.handleIn
            ? vec2.length(point.handleIn)
            : vec2.length(newHandleOffset);
      const direction = vec2.normalize({ x: -newHandleOffset.x, y: -newHandleOffset.y });
      result.handleIn = vec2.multiply(direction, length);
    }
  } else {
    result.handleIn = newHandleOffset;
    // For smooth/symmetric points, update the opposite handle
    if (point.type === 'smooth' || point.type === 'symmetric') {
      const length =
        point.type === 'symmetric' && point.handleOut
          ? vec2.length(newHandleOffset)
          : point.handleOut
            ? vec2.length(point.handleOut)
            : vec2.length(newHandleOffset);
      const direction = vec2.normalize({ x: -newHandleOffset.x, y: -newHandleOffset.y });
      result.handleOut = vec2.multiply(direction, length);
    }
  }

  return result;
}

/**
 * A point given a type, as Figma's handle mirroring: a corner's handles move
 * on their own (they're left as they are); a smooth point's are lined up,
 * keeping their lengths; a symmetric point's are lined up and evened out. A
 * point with no handles gets some along its neighbours first.
 */
export function setPointType(
  point: PathPoint,
  type: PathPoint['type'],
  prevPosition: Vector2 | null,
  nextPosition: Vector2 | null
): PathPoint {
  if (type === 'corner') return { ...point, type };
  const base =
    point.handleIn || point.handleOut
      ? point
      : convertPointType({ ...point, type: 'corner' }, prevPosition, nextPosition);
  const out = base.handleOut ?? (base.handleIn && vec2.multiply(base.handleIn, -1));
  const into = base.handleIn ?? (base.handleOut && vec2.multiply(base.handleOut, -1));
  // No handles to set (a point with no neighbours)
  if (!out || !into) return { ...base, type };
  // The line through the point both handles lean towards
  const lean = vec2.subtract(vec2.normalize(out), vec2.normalize(into));
  const direction = vec2.length(lean) > 1e-9 ? vec2.normalize(lean) : vec2.normalize(out);
  const outLength = vec2.length(out);
  const inLength = vec2.length(into);
  const even = (outLength + inLength) / 2;
  return {
    ...base,
    type,
    handleOut: vec2.multiply(direction, type === 'symmetric' ? even : outLength),
    handleIn: vec2.multiply(direction, -(type === 'symmetric' ? even : inLength)),
  };
}
