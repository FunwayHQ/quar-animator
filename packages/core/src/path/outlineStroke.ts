/**
 * Outline Stroke for Quar Animator
 * Converts a node's stroke into a filled PathNode.
 */

import type { Node, PathNode, PathPoint, Stroke, Vector2 } from '@quar/types';
import { getShapeOutlinePoints } from './shapeToPath';
import {
  tessellatePathToVertices,
  generateStrokeOutlineVertices,
  getPathBounds,
  applyCornerRadius,
} from './pathUtils';
import { schneiderFitCurve, curvesToPathPoints } from './schneider';

/** Max squared error for Schneider curve fitting on stroke outlines */
const OUTLINE_FIT_ERROR = 1.0;

/**
 * Convert a flat vertex array region into smooth PathPoints via curve fitting.
 * For closed contours, appends the first vertex to close the loop before fitting,
 * then removes the duplicate endpoint.
 */
function fitVerticesToCurve(
  verts: Float32Array,
  startIdx: number,
  count: number,
  closed: boolean
): PathPoint[] {
  if (count < 2) return [];

  const points: Vector2[] = [];
  for (let i = 0; i < count; i++) {
    const idx = (startIdx + i) * 2;
    points.push({ x: verts[idx], y: verts[idx + 1] });
  }

  if (closed && points.length >= 3) {
    // Close the loop for fitting
    points.push({ x: points[0].x, y: points[0].y });
  }

  const curves = schneiderFitCurve(points, OUTLINE_FIT_ERROR);
  if (curves.length === 0) return [];

  const pathPoints = curvesToPathPoints(curves);

  if (closed && pathPoints.length >= 2) {
    // Remove duplicate closing point — path is closed implicitly.
    // Transfer its handleIn to the first point so the closing segment
    // renders as a smooth curve (not a straight line).
    const closingPoint = pathPoints.pop()!;
    pathPoints[0].handleIn = closingPoint.handleIn;
  }

  return pathPoints;
}

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
      // Use curve fitting to produce smooth bezier curves instead of many corner points.
      const innerCount = outlineVerts.length / 2 - numVertices;
      const outerPoints = fitVerticesToCurve(outlineVerts, 0, numVertices, true);
      const innerPoints = fitVerticesToCurve(outlineVerts, numVertices, innerCount, true);
      if (outerPoints.length >= 3) resultContours.push(outerPoints);
      if (innerPoints.length >= 3) resultContours.push(innerPoints);
    } else {
      // Open paths: single combined polygon (ribbon shape).
      // Fit curves for smooth result.
      const totalVerts = outlineVerts.length / 2;
      const points = fitVerticesToCurve(outlineVerts, 0, totalVerts, false);
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

  // Center all contour points at origin (preserving bezier handles)
  const centeredContours = resultContours.map((contour) =>
    contour.map((pt) => ({
      ...pt,
      position: {
        x: pt.position.x - centerX,
        y: pt.position.y - centerY,
      },
    }))
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
