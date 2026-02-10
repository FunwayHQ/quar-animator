/**
 * Outline Stroke for Quar Animator
 * Converts a node's stroke into a filled PathNode.
 */

import type { Node, PathNode, PathPoint, Stroke } from '@quar/types';
import { getShapeOutlinePoints } from './shapeToPath';
import {
  tessellatePathToVertices,
  generateStrokeOutlineVertices,
  createCornerPoint,
  getPathBounds,
} from './pathUtils';

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

    // Tessellate the contour to line segments
    const vertices = tessellatePathToVertices(contour, outline.closed, 0.5);
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

    // Convert Float32Array vertices back to PathPoints (corner points)
    const points: PathPoint[] = [];
    for (let i = 0; i < outlineVerts.length; i += 2) {
      points.push(
        createCornerPoint({
          x: outlineVerts[i],
          y: outlineVerts[i + 1],
        })
      );
    }
    resultContours.push(points);
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
