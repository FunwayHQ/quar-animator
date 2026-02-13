/**
 * Outline Stroke for Quar Animator
 * Converts a node's stroke into a filled PathNode.
 */

import type { Node, PathNode, PathPoint, Stroke, Vector2 } from '@quar/types';
import { getShapeOutlinePoints } from './shapeToPath';
import {
  tessellatePathToVertices,
  generateStrokeOutlineVertices,
  createCornerPoint,
  getPathBounds,
  applyCornerRadius,
} from './pathUtils';

// ============================================================================
// RDP Simplification + Auto-Smooth
// ============================================================================

/** Max perpendicular distance for RDP simplification (world units) */
const RDP_TOLERANCE = 0.5;

/**
 * Ramer-Douglas-Peucker polyline simplification.
 * Returns indices of points to keep.
 */
function rdpSimplify(points: Vector2[], tolerance: number): number[] {
  if (points.length <= 2) {
    return points.map((_, i) => i);
  }

  const keep: boolean[] = Array.from({ length: points.length }, () => false);
  keep[0] = true;
  keep[points.length - 1] = true;

  rdpRecurse(points, 0, points.length - 1, tolerance * tolerance, keep);

  const indices: number[] = [];
  for (let i = 0; i < keep.length; i++) {
    if (keep[i]) indices.push(i);
  }
  return indices;
}

function rdpRecurse(
  points: Vector2[],
  start: number,
  end: number,
  toleranceSq: number,
  keep: boolean[]
): void {
  if (end - start < 2) return;

  let maxDistSq = 0;
  let maxIdx = start;

  const sx = points[start].x,
    sy = points[start].y;
  const ex = points[end].x,
    ey = points[end].y;
  const dx = ex - sx,
    dy = ey - sy;
  const lenSq = dx * dx + dy * dy;

  for (let i = start + 1; i < end; i++) {
    const px = points[i].x - sx;
    const py = points[i].y - sy;

    let distSq: number;
    if (lenSq < 1e-10) {
      distSq = px * px + py * py;
    } else {
      const t = Math.max(0, Math.min(1, (px * dx + py * dy) / lenSq));
      const projX = px - t * dx;
      const projY = py - t * dy;
      distSq = projX * projX + projY * projY;
    }

    if (distSq > maxDistSq) {
      maxDistSq = distSq;
      maxIdx = i;
    }
  }

  if (maxDistSq > toleranceSq) {
    keep[maxIdx] = true;
    rdpRecurse(points, start, maxIdx, toleranceSq, keep);
    rdpRecurse(points, maxIdx, end, toleranceSq, keep);
  }
}

/**
 * Convert a flat vertex array region into PathPoints using RDP simplification.
 * All positions are exact (subset of original offset vertices), avoiding any
 * approximation error that would cause stroke thinning at curves.
 */
function simplifyToCornerPoints(verts: Float32Array, startIdx: number, count: number): PathPoint[] {
  if (count < 2) return [];

  // Extract vertices
  const points: Vector2[] = [];
  for (let i = 0; i < count; i++) {
    const idx = (startIdx + i) * 2;
    points.push({ x: verts[idx], y: verts[idx + 1] });
  }

  // RDP simplify — reduces point count while keeping exact positions
  const indices = rdpSimplify(points, RDP_TOLERANCE);

  return indices.map((i) => createCornerPoint(points[i]));
}

// ============================================================================
// Main
// ============================================================================

/**
 * Convert a node's stroke to a filled PathNode.
 * The stroke outline is tessellated into line segments, then the stroke width
 * is applied as a polygon offset to create a closed filled path.
 *
 * @param node The node whose stroke to outline
 * @param strokeIndex Which stroke to outline (0 for first visible)
 * @param generateId Function to generate unique IDs
 * @returns PathNode with the stroke outline as fill, or null if no valid stroke
 */
export function outlineStroke(
  node: Node,
  strokeIndex: number,
  generateId: () => string
): PathNode | null {
  // Find the target stroke
  const strokes: Stroke[] | undefined = (node as { strokes?: Stroke[] }).strokes;
  if (!strokes || strokes.length === 0) return null;

  const stroke = strokes[strokeIndex];
  if (!stroke || !stroke.visible) return null;

  // Get shape outline points
  const outline = getShapeOutlinePoints(node);
  if (!outline || outline.points.length < 2) return null;

  // Process each contour (primary + subpaths)
  const allContours: PathPoint[][] = [outline.points];
  if (outline.subpaths) {
    allContours.push(...outline.subpaths);
  }

  const resultContours: PathPoint[][] = [];

  for (const contour of allContours) {
    if (contour.length < 2) continue;

    // Apply per-vertex corner radius before tessellation
    const resolvedContour = applyCornerRadius(contour, outline.closed);

    // Tessellate the contour to line segments
    const vertices = tessellatePathToVertices(resolvedContour, outline.closed, 0.5);
    const numVertices = vertices.length / 2;
    if (numVertices < 2) continue;

    // Generate the stroke outline polygon
    const outlineVerts = generateStrokeOutlineVertices(
      vertices,
      numVertices,
      stroke.width,
      outline.closed,
      stroke.align ?? 'center'
    );

    if (outlineVerts.length < 6) continue; // Need at least 3 points

    if (outline.closed) {
      // For closed paths, generateStrokeOutlineVertices returns
      // [leftSide(outer)... rightSideReversed(inner)...] as one polygon.
      // Split into two separate closed contours (outer ring + inner ring).
      // Use RDP simplification for clean output with exact geometry.
      const innerCount = outlineVerts.length / 2 - numVertices;
      const outerPoints = simplifyToCornerPoints(outlineVerts, 0, numVertices);
      const innerPoints = simplifyToCornerPoints(outlineVerts, numVertices, innerCount);
      if (outerPoints.length >= 3) resultContours.push(outerPoints);
      if (innerPoints.length >= 3) resultContours.push(innerPoints);
    } else {
      // Open paths: single combined polygon (ribbon shape).
      const totalVerts = outlineVerts.length / 2;
      const points = simplifyToCornerPoints(outlineVerts, 0, totalVerts);
      if (points.length >= 3) resultContours.push(points);
    }
  }

  if (resultContours.length === 0) return null;

  // Compute AABB of all contours for centering
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const contour of resultContours) {
    const b = getPathBounds(contour, true);
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  // Center all contour points at origin
  const centeredContours = resultContours.map((contour) =>
    contour.map((pt) =>
      createCornerPoint({
        x: pt.position.x - centerX,
        y: pt.position.y - centerY,
      })
    )
  );

  const primaryPoints = centeredContours[0];
  const additionalSubpaths = centeredContours.slice(1);

  // Compute world position: node transform position + local center * scale
  const sx = node.transform.scale.x;
  const sy = node.transform.scale.y;
  const worldX = node.transform.position.x + centerX * sx;
  const worldY = node.transform.position.y + centerY * sy;

  // Build fill from the stroke color
  const fill = {
    type: stroke.type as 'solid' | 'gradient',
    color: stroke.color,
    opacity: stroke.opacity,
    visible: true,
    gradient: (stroke as { gradient?: unknown }).gradient,
  };

  return {
    id: generateId(),
    name: `${node.name} (Stroke Outline)`,
    type: 'path',
    parent: node.parent,
    children: [],
    transform: {
      position: { x: worldX, y: worldY },
      rotation: node.transform.rotation,
      scale: { x: sx, y: sy },
      anchor: { x: 0.5, y: 0.5 },
      skew: { ...node.transform.skew },
    },
    visible: node.visible,
    locked: false,
    opacity: node.opacity,
    blendMode: node.blendMode,
    effects: node.effects ? [...node.effects] : undefined,
    points: primaryPoints,
    subpaths: additionalSubpaths.length > 0 ? additionalSubpaths : undefined,
    closed: true,
    fillRule: 'evenodd',
    fills: [fill as PathNode['fills'][number]],
    strokes: [],
  };
}
