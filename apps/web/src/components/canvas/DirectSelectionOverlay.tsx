/**
 * DirectSelectionOverlay - Renders control points and bezier handles for path editing
 */

import type { PathNode, PathPoint, Vector2 } from '@quar/types';
import type { Camera } from '@quar/core';
import styles from './DirectSelectionOverlay.module.css';

// ============================================================================
// Types
// ============================================================================

export interface DirectSelectionOverlayProps {
  pathNodes: PathNode[];
  selectedPoints: Array<{ nodeId: string; pointIndex: number }>;
  camera: Camera | null;
}

// ============================================================================
// Helpers
// ============================================================================

function isPointSelected(
  selectedPoints: Array<{ nodeId: string; pointIndex: number }>,
  nodeId: string,
  pointIndex: number
): boolean {
  return selectedPoints.some((sp) => sp.nodeId === nodeId && sp.pointIndex === pointIndex);
}

/**
 * Get the world position of a path point (local position + node position)
 */
function getPointWorldPos(node: PathNode, point: PathPoint): Vector2 {
  return {
    x: point.position.x + node.transform.position.x,
    y: point.position.y + node.transform.position.y,
  };
}

// ============================================================================
// Component
// ============================================================================

export function DirectSelectionOverlay({
  pathNodes,
  selectedPoints,
  camera,
}: DirectSelectionOverlayProps) {
  if (!camera || pathNodes.length === 0) return null;

  const toScreen = (pos: Vector2): Vector2 => camera.worldToScreen(pos);
  const zoom = camera.zoom;

  return (
    <svg className={styles.overlay}>
      {pathNodes.map((node) => (
        <g key={node.id}>
          {/* Path outline connecting points */}
          {node.points.length >= 2 && (
            <path className={styles.pathOutline} d={buildPathD(node, toScreen, zoom)} />
          )}

          {/* Bezier handle lines and circles for selected points */}
          {node.points.map((point: PathPoint, index: number) => {
            const selected = isPointSelected(selectedPoints, node.id, index);
            if (!selected) return null;

            const screenPos = toScreen(getPointWorldPos(node, point));

            return (
              <g key={`handles-${index}`}>
                {point.handleIn && (
                  <>
                    <line
                      className={styles.handleLine}
                      x1={screenPos.x}
                      y1={screenPos.y}
                      x2={screenPos.x + point.handleIn.x * zoom}
                      y2={screenPos.y - point.handleIn.y * zoom}
                    />
                    <circle
                      className={styles.handle}
                      cx={screenPos.x + point.handleIn.x * zoom}
                      cy={screenPos.y - point.handleIn.y * zoom}
                      r={4}
                    />
                  </>
                )}
                {point.handleOut && (
                  <>
                    <line
                      className={styles.handleLine}
                      x1={screenPos.x}
                      y1={screenPos.y}
                      x2={screenPos.x + point.handleOut.x * zoom}
                      y2={screenPos.y - point.handleOut.y * zoom}
                    />
                    <circle
                      className={styles.handle}
                      cx={screenPos.x + point.handleOut.x * zoom}
                      cy={screenPos.y - point.handleOut.y * zoom}
                      r={4}
                    />
                  </>
                )}
              </g>
            );
          })}

          {/* Control points (rendered on top of handles) */}
          {node.points.map((point: PathPoint, index: number) => {
            const selected = isPointSelected(selectedPoints, node.id, index);
            const screenPos = toScreen(getPointWorldPos(node, point));

            return (
              <rect
                key={`point-${index}`}
                className={selected ? styles.pointSelected : styles.point}
                x={screenPos.x - 4}
                y={screenPos.y - 4}
                width={8}
                height={8}
                transform={`rotate(45 ${screenPos.x} ${screenPos.y})`}
              />
            );
          })}
        </g>
      ))}
    </svg>
  );
}

/**
 * Build SVG path d attribute for the path outline (for visual reference)
 */
function buildPathD(node: PathNode, toScreen: (pos: Vector2) => Vector2, zoom: number): string {
  const points = node.points;
  if (points.length < 2) return '';

  const parts: string[] = [];

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const screen = toScreen(getPointWorldPos(node, p));

    if (i === 0) {
      parts.push(`M ${screen.x} ${screen.y}`);
    } else {
      const prev = points[i - 1];
      const prevScreen = toScreen(getPointWorldPos(node, prev));

      if (prev.handleOut || p.handleIn) {
        // Cubic bezier
        const cp1x = prevScreen.x + (prev.handleOut?.x ?? 0) * zoom;
        const cp1y = prevScreen.y - (prev.handleOut?.y ?? 0) * zoom;
        const cp2x = screen.x + (p.handleIn?.x ?? 0) * zoom;
        const cp2y = screen.y - (p.handleIn?.y ?? 0) * zoom;
        parts.push(`C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${screen.x} ${screen.y}`);
      } else {
        parts.push(`L ${screen.x} ${screen.y}`);
      }
    }
  }

  // Close path if needed
  if (node.closed && points.length >= 3) {
    const first = points[0];
    const last = points[points.length - 1];
    const firstScreen = toScreen(getPointWorldPos(node, first));
    const lastScreen = toScreen(getPointWorldPos(node, last));

    if (last.handleOut || first.handleIn) {
      const cp1x = lastScreen.x + (last.handleOut?.x ?? 0) * zoom;
      const cp1y = lastScreen.y - (last.handleOut?.y ?? 0) * zoom;
      const cp2x = firstScreen.x + (first.handleIn?.x ?? 0) * zoom;
      const cp2y = firstScreen.y - (first.handleIn?.y ?? 0) * zoom;
      parts.push(`C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${firstScreen.x} ${firstScreen.y}`);
    } else {
      parts.push('Z');
    }
  }

  return parts.join(' ');
}

export default DirectSelectionOverlay;
