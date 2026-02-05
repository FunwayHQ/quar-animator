/**
 * PenToolOverlay - Renders control points and bezier handles while drawing with PenTool
 */

import type { PathPoint, Vector2 } from '@quar/types';
import type { Camera } from '@quar/core';
import styles from './PenToolOverlay.module.css';

// ============================================================================
// Types
// ============================================================================

export interface PenToolOverlayProps {
  points: PathPoint[];
  camera: Camera | null;
  onHandlePointerDown?: (
    pointIndex: number,
    handleType: 'in' | 'out',
    e: React.PointerEvent
  ) => void;
  onPointPointerDown?: (pointIndex: number, e: React.PointerEvent) => void;
}

// ============================================================================
// Component
// ============================================================================

export function PenToolOverlay({
  points,
  camera,
  onHandlePointerDown,
  onPointPointerDown,
}: PenToolOverlayProps) {
  if (!camera || points.length === 0) return null;

  // Convert world position to screen position (inline function, no hook needed)
  const toScreen = (pos: Vector2): Vector2 => camera.worldToScreen(pos);

  return (
    <svg className={styles.overlay}>
      {/* Render handle lines and handles for each point */}
      {points.map((point, index) => {
        const screenPos = toScreen(point.position);

        return (
          <g key={index}>
            {/* Handle In line and circle */}
            {point.handleIn && (
              <>
                <line
                  className={styles.handleLine}
                  x1={screenPos.x}
                  y1={screenPos.y}
                  x2={screenPos.x + point.handleIn.x * camera.zoom}
                  y2={screenPos.y - point.handleIn.y * camera.zoom}
                />
                <circle
                  className={styles.handle}
                  cx={screenPos.x + point.handleIn.x * camera.zoom}
                  cy={screenPos.y - point.handleIn.y * camera.zoom}
                  r={5}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    onHandlePointerDown?.(index, 'in', e);
                  }}
                />
              </>
            )}

            {/* Handle Out line and circle */}
            {point.handleOut && (
              <>
                <line
                  className={styles.handleLine}
                  x1={screenPos.x}
                  y1={screenPos.y}
                  x2={screenPos.x + point.handleOut.x * camera.zoom}
                  y2={screenPos.y - point.handleOut.y * camera.zoom}
                />
                <circle
                  className={styles.handle}
                  cx={screenPos.x + point.handleOut.x * camera.zoom}
                  cy={screenPos.y - point.handleOut.y * camera.zoom}
                  r={5}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    onHandlePointerDown?.(index, 'out', e);
                  }}
                />
              </>
            )}

            {/* Control point */}
            <rect
              className={styles.point}
              x={screenPos.x - 4}
              y={screenPos.y - 4}
              width={8}
              height={8}
              onPointerDown={(e) => {
                e.stopPropagation();
                onPointPointerDown?.(index, e);
              }}
            />
          </g>
        );
      })}
    </svg>
  );
}

export default PenToolOverlay;
