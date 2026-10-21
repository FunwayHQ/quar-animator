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
  /** The line on to the pointer, and whether a click there closes the path */
  rubberBand?: { to: Vector2; closing: boolean } | null;
  camera: Camera | null;
  onHandlePointerDown?: (
    pointIndex: number,
    handleType: 'in' | 'out',
    e: React.PointerEvent
  ) => void;
  onPointPointerDown?: (pointIndex: number, e: React.PointerEvent) => void;
  /**
   * Pointer moves over the points and handles: the canvas below doesn't get
   * them, and the Pen needs them (its line to the pointer, closing on the first point)
   */
  onPointerMove?: (e: React.MouseEvent) => void;
}

// ============================================================================
// Component
// ============================================================================

export function PenToolOverlay({
  points,
  rubberBand,
  camera,
  onHandlePointerDown,
  onPointPointerDown,
  onPointerMove,
}: PenToolOverlayProps) {
  if (!camera || points.length === 0) return null;
  const closing = rubberBand?.closing ?? false;

  // Convert world position to screen position (inline function, no hook needed)
  const toScreen = (pos: Vector2): Vector2 => camera.worldToScreen(pos);
  /** A point's handle end on screen (handles are world-space offsets while drawing). */
  const handleEnd = (point: PathPoint, handle: Vector2 | null): Vector2 =>
    toScreen(
      handle ? { x: point.position.x + handle.x, y: point.position.y + handle.y } : point.position
    );

  // The path so far, each segment curving along its handles
  const pathD = points
    .map((point, i) => {
      const end = toScreen(point.position);
      if (i === 0) return `M ${end.x} ${end.y}`;
      const prev = points[i - 1]!;
      const c1 = handleEnd(prev, prev.handleOut);
      const c2 = handleEnd(point, point.handleIn);
      return `C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${end.x} ${end.y}`;
    })
    .join(' ');

  // On to the pointer: out along the last point's handle (to the first point, if closing)
  const last = points[points.length - 1]!;
  const bandEnd = rubberBand
    ? closing
      ? points[0]!
      : { position: rubberBand.to, handleIn: null, handleOut: null, type: 'corner' as const }
    : null;
  const bandD = bandEnd
    ? (() => {
        const from = toScreen(last.position);
        const c1 = handleEnd(last, last.handleOut);
        const c2 = handleEnd(bandEnd, bandEnd.handleIn);
        const to = toScreen(bandEnd.position);
        return `M ${from.x} ${from.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${to.x} ${to.y}`;
      })()
    : null;

  return (
    <svg className={styles.overlay}>
      {points.length > 1 && (
        <path className={styles.pathPreview} d={pathD} data-testid="pen-path-preview" />
      )}
      {bandD && <path className={styles.rubberBand} d={bandD} data-testid="pen-rubber-band" />}
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
                  onMouseMove={onPointerMove}
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
                  onMouseMove={onPointerMove}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    onHandlePointerDown?.(index, 'out', e);
                  }}
                />
              </>
            )}

            {/* Control point (the first one lit up when a click would close the path) */}
            <rect
              className={
                index === 0 && closing ? `${styles.point} ${styles.pointClosing}` : styles.point
              }
              data-testid={index === 0 ? 'pen-first-point' : undefined}
              onMouseMove={onPointerMove}
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
