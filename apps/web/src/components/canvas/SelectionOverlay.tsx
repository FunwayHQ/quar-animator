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
  /** Callback when a handle is clicked/dragged */
  onHandlePointerDown?: (handle: TransformHandle, event: React.PointerEvent) => void;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_HANDLE_SIZE = 8;
const ROTATION_HANDLE_RADIUS = 5;

// ============================================================================
// Component
// ============================================================================

export function SelectionOverlay({
  bounds,
  handles,
  handleSize = DEFAULT_HANDLE_SIZE,
  onHandlePointerDown,
}: SelectionOverlayProps) {
  if (!bounds) {
    return null;
  }

  const { rect } = bounds;

  // Ensure valid dimensions (SVG doesn't accept negative values)
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }

  const halfHandle = handleSize / 2;

  // Find rotation handle and its corresponding top-center handle
  const rotationHandle = handles.find((h) => h.position === 'rotation');
  const topHandle = handles.find((h) => h.position === 'top');

  return (
    <svg className={styles.overlay} data-testid="selection-overlay">
      {/* Selection bounds rectangle (dashed) */}
      <rect
        className={styles.selectionBounds}
        x={rect.x}
        y={rect.y}
        width={rect.width}
        height={rect.height}
        data-testid="selection-bounds"
      />

      {/* Line connecting rotation handle to selection */}
      {rotationHandle && topHandle && (
        <line
          className={styles.rotationLine}
          x1={topHandle.screenPosition.x}
          y1={topHandle.screenPosition.y}
          x2={rotationHandle.screenPosition.x}
          y2={rotationHandle.screenPosition.y}
          data-testid="rotation-line"
        />
      )}

      {/* Resize handles (squares at corners and edge midpoints) */}
      {handles
        .filter((handle) => handle.position !== 'rotation')
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

      {/* Rotation handle (circle above selection) */}
      {rotationHandle && (
        <circle
          className={styles.rotationHandle}
          cx={rotationHandle.screenPosition.x}
          cy={rotationHandle.screenPosition.y}
          r={ROTATION_HANDLE_RADIUS}
          style={{ cursor: rotationHandle.cursor }}
          onPointerDown={(e) => onHandlePointerDown?.(rotationHandle, e)}
          data-testid="handle-rotation"
        />
      )}
    </svg>
  );
}

export default SelectionOverlay;
