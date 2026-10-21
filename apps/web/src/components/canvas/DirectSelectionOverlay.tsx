/**
 * DirectSelectionOverlay - Renders control points and bezier handles for path editing
 */

import type { PathNode, PathPoint, Vector2, Matrix3, ImageNode } from '@quar/types';
import {
  type Camera,
  type PathSkinPose,
  type SceneGraph,
  mat3,
  pointFrameLookup,
  posedSegmentPoints,
} from '@quar/core';
import styles from './DirectSelectionOverlay.module.css';

// ============================================================================
// Types
// ============================================================================

export interface DirectSelectionOverlayProps {
  pathNodes: PathNode[];
  imageNodes?: ImageNode[];
  selectedPoints: Array<{ nodeId: string; pointIndex: number }>;
  camera: Camera | null;
  sceneGraph: SceneGraph | null;
  /** A bound layer's skinning now, so its points show where its bones draw them */
  getSkinPose?: (nodeId: string) => PathSkinPose | null;
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
    for (const sp of node.subpaths) b.push(b[b.length - 1]! + sp.length);
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
 * Get the world transform matrix for a path node, parent chain included.
 * Like the scene graph and the tool, it leaves out the normalized anchor
 * (applying it drew points and handles half a unit, times the scale, off).
 */
function getNodeWorldMatrix(node: PathNode, sceneGraph: SceneGraph | null): Matrix3 {
  if (sceneGraph?.getNode(node.id)) {
    return sceneGraph.getWorldTransform(node.id);
  }
  return mat3.compose(node.transform.position, node.transform.rotation, node.transform.scale);
}

/** A bound layer's skinning now (null when it isn't bound). */
function skinPoseOf(
  node: PathNode | ImageNode,
  getSkinPose: DirectSelectionOverlayProps['getSkinPose']
): PathSkinPose | null {
  return node.skinData ? (getSkinPose?.(node.id) ?? null) : null;
}

/** Where each point (flat index) is drawn: the node's world matrix, or its bones' posing. */
function pointFramesOf(
  node: PathNode | ImageNode,
  points: PathPoint[],
  sceneGraph: SceneGraph | null,
  pose: PathSkinPose | null
): (index: number) => Matrix3 {
  return pointFrameLookup(points, getNodeWorldMatrix(node as PathNode, sceneGraph), pose);
}

/**
 * Where a point's handle (an offset from it, in local space) is on screen:
 * the handle's end goes through the same matrices as the point, so the
 * camera decides how it maps (zoom, flip and any rotation).
 */
function handleScreenPos(
  frame: Matrix3,
  point: PathPoint,
  handle: Vector2,
  toScreen: (pos: Vector2) => Vector2
): Vector2 {
  return toScreen(
    mat3.transformPoint(frame, {
      x: point.position.x + handle.x,
      y: point.position.y + handle.y,
    })
  );
}

// ============================================================================
// Component
// ============================================================================

/** Get 4 virtual corner PathPoints for an image node [BL, BR, TL, TR]. */
function getImagePoints(node: ImageNode): PathPoint[] {
  const ax = node.transform.anchor.x;
  const ay = node.transform.anchor.y;
  const x0 = -node.width * ax;
  const y0 = -node.height * ay;
  const x1 = x0 + node.width;
  const y1 = y0 + node.height;
  const vo = node.vertexOffsets;
  return [
    {
      position: { x: x0 + (vo?.[0]?.x ?? 0), y: y0 + (vo?.[0]?.y ?? 0) },
      type: 'corner',
      handleIn: null,
      handleOut: null,
    },
    {
      position: { x: x1 + (vo?.[1]?.x ?? 0), y: y0 + (vo?.[1]?.y ?? 0) },
      type: 'corner',
      handleIn: null,
      handleOut: null,
    },
    {
      position: { x: x0 + (vo?.[2]?.x ?? 0), y: y1 + (vo?.[2]?.y ?? 0) },
      type: 'corner',
      handleIn: null,
      handleOut: null,
    },
    {
      position: { x: x1 + (vo?.[3]?.x ?? 0), y: y1 + (vo?.[3]?.y ?? 0) },
      type: 'corner',
      handleIn: null,
      handleOut: null,
    },
  ];
}

export function DirectSelectionOverlay({
  pathNodes,
  imageNodes,
  selectedPoints,
  camera,
  sceneGraph,
  getSkinPose,
}: DirectSelectionOverlayProps) {
  if (!camera || (pathNodes.length === 0 && (!imageNodes || imageNodes.length === 0))) return null;

  const toScreen = (pos: Vector2): Vector2 => camera.worldToScreen(pos);

  return (
    <svg className={styles.overlay}>
      {pathNodes.map((node) => {
        const allPts = getAllPoints(node);
        const contours = getContours(node);
        const starts = getSubpathBoundaries(node);
        const pose = skinPoseOf(node, getSkinPose);
        const frame = pointFramesOf(node, allPts, sceneGraph, pose);

        return (
          <g key={node.id}>
            {/* Path outline connecting points — one <path> per contour */}
            {contours.map((contour, ci) =>
              contour.length >= 2 ? (
                <path
                  key={`outline-${ci}`}
                  className={styles.pathOutline}
                  d={buildContourD(contour, starts[ci]!, node.closed, toScreen, frame, pose)}
                />
              ) : null
            )}

            {/* Bezier handle lines and circles for selected points */}
            {allPts.map((point: PathPoint, index: number) => {
              const selected = isPointSelected(selectedPoints, node.id, index);
              if (!selected) return null;

              const screenPos = toScreen(mat3.transformPoint(frame(index), point.position));

              return (
                <g key={`handles-${index}`}>
                  {point.handleIn &&
                    (() => {
                      const { x: hx, y: hy } = handleScreenPos(
                        frame(index),
                        point,
                        point.handleIn,
                        toScreen
                      );
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
                      const { x: hx, y: hy } = handleScreenPos(
                        frame(index),
                        point,
                        point.handleOut,
                        toScreen
                      );
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
              const screenPos = toScreen(mat3.transformPoint(frame(index), point.position));

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

      {/* Image node vertices — 4 corner control points */}
      {imageNodes?.map((node) => {
        const pts = getImagePoints(node);
        const frame = pointFramesOf(node, pts, sceneGraph, skinPoseOf(node, getSkinPose));

        return (
          <g key={node.id}>
            {/* Quad outline */}
            {(() => {
              const transformPt = (index: number) =>
                toScreen(mat3.transformPoint(frame(index), pts[index]!.position));
              const bl = transformPt(0);
              const br = transformPt(1);
              const tl = transformPt(2);
              const tr = transformPt(3);
              return (
                <path
                  className={styles.pathOutline}
                  d={`M ${bl.x} ${bl.y} L ${br.x} ${br.y} L ${tr.x} ${tr.y} L ${tl.x} ${tl.y} Z`}
                />
              );
            })()}

            {/* Corner control points */}
            {pts.map((point, index) => {
              const selected = isPointSelected(selectedPoints, node.id, index);
              const screenPos = toScreen(mat3.transformPoint(frame(index), point.position));
              return (
                <rect
                  key={`img-point-${index}`}
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
 * `start` is its first point's flat index, for where each point is drawn.
 */
function buildContourD(
  contour: PathPoint[],
  start: number,
  closed: boolean,
  toScreen: (pos: Vector2) => Vector2,
  frame: (index: number) => Matrix3,
  pose: PathSkinPose | null
): string {
  if (contour.length < 2) return '';

  const screenOf = (i: number) =>
    toScreen(mat3.transformPoint(frame(start + i), contour[i]!.position));
  /** The curve from point i to point j, or a line when neither has a handle. */
  const segment = (i: number, j: number, end: Vector2): string => {
    const from = contour[i]!;
    const to = contour[j]!;
    // A bound path's segments bend with its bones: drawn through points along them
    const posed = pose ? posedSegmentPoints(from, to, pose) : null;
    if (posed) {
      return posed
        .slice(1)
        .map((point) => toScreen(point))
        .map(({ x, y }) => `L ${x} ${y}`)
        .join(' ');
    }
    if (!from.handleOut && !to.handleIn) return `L ${end.x} ${end.y}`;
    // Cubic bezier — the control points go through the same mapping
    const cp1 = from.handleOut
      ? handleScreenPos(frame(start + i), from, from.handleOut, toScreen)
      : screenOf(i);
    const cp2 = to.handleIn ? handleScreenPos(frame(start + j), to, to.handleIn, toScreen) : end;
    return `C ${cp1.x} ${cp1.y} ${cp2.x} ${cp2.y} ${end.x} ${end.y}`;
  };

  const first = screenOf(0);
  const parts: string[] = [`M ${first.x} ${first.y}`];
  for (let i = 1; i < contour.length; i++) parts.push(segment(i - 1, i, screenOf(i)));

  // Close path if needed
  if (closed && contour.length >= 3) {
    const last = contour.length - 1;
    // A straight closing segment is a Z, unless the bones bend it
    const curved = pose || contour[last]!.handleOut || contour[0]!.handleIn;
    parts.push(curved ? segment(last, 0, first) : 'Z');
  }

  return parts.join(' ');
}

export default DirectSelectionOverlay;
