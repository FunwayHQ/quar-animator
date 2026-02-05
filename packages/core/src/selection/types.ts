/**
 * Selection Types for Quar Animator
 * Defines types for selection infrastructure including transform handles
 */

import type { Rect, Vector2 } from '@quar/types';

// ============================================================================
// Handle Position Types
// ============================================================================

/**
 * Position identifiers for transform handles
 * - 8 resize handles at corners and edge midpoints
 * - 1 rotation handle above the selection
 */
export type HandlePosition =
  | 'top-left'
  | 'top'
  | 'top-right'
  | 'right'
  | 'bottom-right'
  | 'bottom'
  | 'bottom-left'
  | 'left'
  | 'rotation';

// ============================================================================
// Selection Bounds Types
// ============================================================================

/**
 * Bounding box for selected nodes with center point
 */
export interface SelectionBounds {
  /** Axis-aligned bounding rectangle in world space */
  rect: Rect;
  /** Center point of the selection */
  center: Vector2;
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Configuration for selection handles
 */
export interface SelectionConfig {
  /** Visual size of handles in screen pixels (default: 8) */
  handleSize: number;
  /** Hit radius for handle interaction in screen pixels (default: 12) */
  handleHitRadius: number;
  /** Distance of rotation handle above the bounds in screen pixels (default: 20) */
  rotationHandleOffset: number;
}

/**
 * Default selection configuration
 */
export const DEFAULT_SELECTION_CONFIG: SelectionConfig = {
  handleSize: 8,
  handleHitRadius: 12,
  rotationHandleOffset: 20,
};

// ============================================================================
// Transform Handle Types
// ============================================================================

/**
 * A single transform handle with position and metadata
 */
export interface TransformHandle {
  /** Position identifier for this handle */
  position: HandlePosition;
  /** Screen position of the handle center */
  screenPosition: Vector2;
  /** CSS cursor style for this handle */
  cursor: string;
}
