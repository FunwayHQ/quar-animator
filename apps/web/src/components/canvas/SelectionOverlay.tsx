/**
 * SelectionOverlay Component
 * Renders selection bounds and transform handles as SVG overlay
 */

import type { SelectionBounds, TransformHandle } from '@quar/core';
import styles from './SelectionOverlay.module.css';

// ============================================================================
// Types
// ============================================================================

export interface SelectionOverlayProps {
  /** Selection bounds in screen coordinates (or null if no selection) */
  bounds: SelectionBounds | null;
  /** Transform handles with screen positions */
  handles: TransformHandle[];
  /** Size of transform handles in pixels */
  handleSize?: number;
  /** Rotation angle in degrees */
  rotation?: number;
  /** Callback when a handle is clicked/dragged */
  onHandlePointerDown?: (handle: TransformHandle, event: React.PointerEvent) => void;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_HANDLE_SIZE = 8;

// ============================================================================
// Component
// ============================================================================

export function SelectionOverlay({
  bounds,
  handles,
  handleSize = DEFAULT_HANDLE_SIZE,
  rotation = 0,
  onHandlePointerDown,
}: SelectionOverlayProps) {
  if (!bounds) {
    return null;
  }

  const { rect, center } = bounds;

  // Ensure valid dimensions (SVG doesn't accept negative values)
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }

  const halfHandle = handleSize / 2;

  // Calculate the transform for rotation around the center
  // Note: In screen coordinates, Y is inverted, so we negate the rotation
  const rotationTransform =
    rotation !== 0 ? `rotate(${-rotation} ${center.x} ${center.y})` : undefined;

  return (
    <svg className={styles.overlay} data-testid="selection-overlay">
      <g transform={rotationTransform}>
        {/* Selection bounds rectangle (dashed) */}
        <rect
          className={styles.selectionBounds}
          x={rect.x}
          y={rect.y}
          width={rect.width}
          height={rect.height}
          data-testid="selection-bounds"
        />

        {/* Resize handles (squares at corners and edge midpoints) */}
        {handles
          .filter((handle) => !handle.position.startsWith('rotate-'))
          .map((handle) => (
            <rect
              key={handle.position}
              className={styles.handle}
              x={handle.screenPosition.x - halfHandle}
              y={handle.screenPosition.y - halfHandle}
              width={handleSize}
              height={handleSize}
              style={{ cursor: handle.cursor }}
              onPointerDown={(e) => onHandlePointerDown?.(handle, e)}
              data-testid={`handle-${handle.position}`}
            />
          ))}
      </g>
    </svg>
  );
}

export default SelectionOverlay;
