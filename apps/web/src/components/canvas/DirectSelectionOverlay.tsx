/**
 * DirectSelectionOverlay - Renders control points and bezier handles for path editing
 */

import type { PathNode, PathPoint, Vector2, Matrix3 } from '@quar/types';
import { type Camera, type SceneGraph, mat3 } from '@quar/core';
import styles from './DirectSelectionOverlay.module.css';

// ============================================================================
// Types
// ============================================================================

export interface DirectSelectionOverlayProps {
  pathNodes: PathNode[];
  selectedPoints: Array<{ nodeId: string; pointIndex: number }>;
  camera: Camera | null;
  sceneGraph: SceneGraph | null;
}

// ============================================================================
// Subpath Helpers
// ============================================================================

/** Merge node.points + node.subpaths[] into a single flat array. */
function getAllPoints(node: PathNode): PathPoint[] {
  if (!node.subpaths || node.subpaths.length === 0) return node.points;
  const result: PathPoint[] = [...node.points];
  for (const sp of node.subpaths) result.push(...sp);
  return result;
}

/** Return start indices of each contour: [0, points.length, ...] */
function getSubpathBoundaries(node: PathNode): number[] {
  const b = [0, node.points.length];
  if (node.subpaths) {
    for (const sp of node.subpaths) b.push(b[b.length - 1] + sp.length);
  }
  return b;
}

/** Split getAllPoints into individual contour arrays. */
function getContours(node: PathNode): PathPoint[][] {
  const allPts = getAllPoints(node);
  const boundaries = getSubpathBoundaries(node);
  const contours: PathPoint[][] = [];
  for (let c = 0; c < boundaries.length - 1; c++) {
    contours.push(allPts.slice(boundaries[c], boundaries[c + 1]));
  }
  return contours;
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
 * Get the world transform matrix for a path node.
 * For nested nodes (children of groups), includes parent chain.
 */
function getNodeWorldMatrix(node: PathNode, sceneGraph: SceneGraph | null): Matrix3 {
  if (node.parent && sceneGraph) {
    return sceneGraph.getWorldTransform(node.id);
  }
  return mat3.compose(
    node.transform.position,
    node.transform.rotation,
    node.transform.scale,
    node.transform.anchor
  );
}

/**
 * Get the world position of a path point (applying full transform: position + rotation + scale).
 */
function getPointWorldPos(
  node: PathNode,
  point: PathPoint,
  sceneGraph: SceneGraph | null
): Vector2 {
  return mat3.transformPoint(getNodeWorldMatrix(node, sceneGraph), point.position);
}

/**
 * Transform a local-space handle offset to world-space offset (rotation + scale only, no translation).
 */
function getHandleWorldOffset(
  node: PathNode,
  handle: Vector2,
  sceneGraph: SceneGraph | null
): Vector2 {
  const m = getNodeWorldMatrix(node, sceneGraph);
  // Linear part only (no translation) to transform direction vectors
  return mat3.transformPoint({ a: m.a, b: m.b, c: m.c, d: m.d, tx: 0, ty: 0 }, handle);
}

// ============================================================================
// Component
// ============================================================================

export function DirectSelectionOverlay({
  pathNodes,
  selectedPoints,
  camera,
  sceneGraph,
}: DirectSelectionOverlayProps) {
  if (!camera || pathNodes.length === 0) return null;

  const toScreen = (pos: Vector2): Vector2 => camera.worldToScreen(pos);
  const zoom = camera.zoom;

  return (
    <svg className={styles.overlay}>
      {pathNodes.map((node) => {
        const allPts = getAllPoints(node);
        const contours = getContours(node);

        return (
          <g key={node.id}>
            {/* Path outline connecting points — one <path> per contour */}
            {contours.map((contour, ci) =>
              contour.length >= 2 ? (
                <path
                  key={`outline-${ci}`}
                  className={styles.pathOutline}
                  d={buildContourD(node, contour, node.closed, toScreen, zoom, sceneGraph)}
                />
              ) : null
            )}

            {/* Bezier handle lines and circles for selected points */}
            {allPts.map((point: PathPoint, index: number) => {
              const selected = isPointSelected(selectedPoints, node.id, index);
              if (!selected) return null;

              const screenPos = toScreen(getPointWorldPos(node, point, sceneGraph));

              return (
                <g key={`handles-${index}`}>
                  {point.handleIn &&
                    (() => {
                      const wo = getHandleWorldOffset(node, point.handleIn, sceneGraph);
                      const hx = screenPos.x + wo.x * zoom;
                      const hy = screenPos.y - wo.y * zoom;
                      return (
                        <>
                          <line
                            className={styles.handleLine}
                            x1={screenPos.x}
                            y1={screenPos.y}
                            x2={hx}
                            y2={hy}
                          />
                          <circle className={styles.handle} cx={hx} cy={hy} r={4} />
                        </>
                      );
                    })()}
                  {point.handleOut &&
                    (() => {
                      const wo = getHandleWorldOffset(node, point.handleOut, sceneGraph);
                      const hx = screenPos.x + wo.x * zoom;
                      const hy = screenPos.y - wo.y * zoom;
                      return (
                        <>
                          <line
                            className={styles.handleLine}
                            x1={screenPos.x}
                            y1={screenPos.y}
                            x2={hx}
                            y2={hy}
                          />
                          <circle className={styles.handle} cx={hx} cy={hy} r={4} />
                        </>
                      );
                    })()}
                </g>
              );
            })}

            {/* Control points (rendered on top of handles) */}
            {allPts.map((point: PathPoint, index: number) => {
              const selected = isPointSelected(selectedPoints, node.id, index);
              const screenPos = toScreen(getPointWorldPos(node, point, sceneGraph));

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
        );
      })}
    </svg>
  );
}

/**
 * Build SVG path d attribute for a single contour (for visual reference).
 */
function buildContourD(
  node: PathNode,
  contour: PathPoint[],
  closed: boolean,
  toScreen: (pos: Vector2) => Vector2,
  zoom: number,
  sceneGraph: SceneGraph | null
): string {
  if (contour.length < 2) return '';

  const parts: string[] = [];

  for (let i = 0; i < contour.length; i++) {
    const p = contour[i];
    const screen = toScreen(getPointWorldPos(node, p, sceneGraph));

    if (i === 0) {
      parts.push(`M ${screen.x} ${screen.y}`);
    } else {
      const prev = contour[i - 1];
      const prevScreen = toScreen(getPointWorldPos(node, prev, sceneGraph));

      if (prev.handleOut || p.handleIn) {
        // Cubic bezier — transform handle offsets through node rotation+scale
        const ho = prev.handleOut
          ? getHandleWorldOffset(node, prev.handleOut, sceneGraph)
          : { x: 0, y: 0 };
        const hi = p.handleIn ? getHandleWorldOffset(node, p.handleIn, sceneGraph) : { x: 0, y: 0 };
        const cp1x = prevScreen.x + ho.x * zoom;
        const cp1y = prevScreen.y - ho.y * zoom;
        const cp2x = screen.x + hi.x * zoom;
        const cp2y = screen.y - hi.y * zoom;
        parts.push(`C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${screen.x} ${screen.y}`);
      } else {
        parts.push(`L ${screen.x} ${screen.y}`);
      }
    }
  }

  // Close path if needed
  if (closed && contour.length >= 3) {
    const first = contour[0];
    const last = contour[contour.length - 1];
    const firstScreen = toScreen(getPointWorldPos(node, first, sceneGraph));
    const lastScreen = toScreen(getPointWorldPos(node, last, sceneGraph));

    if (last.handleOut || first.handleIn) {
      const ho = last.handleOut
        ? getHandleWorldOffset(node, last.handleOut, sceneGraph)
        : { x: 0, y: 0 };
      const hi = first.handleIn
        ? getHandleWorldOffset(node, first.handleIn, sceneGraph)
        : { x: 0, y: 0 };
      const cp1x = lastScreen.x + ho.x * zoom;
      const cp1y = lastScreen.y - ho.y * zoom;
      const cp2x = firstScreen.x + hi.x * zoom;
      const cp2y = firstScreen.y - hi.y * zoom;
      parts.push(`C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${firstScreen.x} ${firstScreen.y}`);
    } else {
      parts.push('Z');
    }
  }

  return parts.join(' ');
}

export default DirectSelectionOverlay;
