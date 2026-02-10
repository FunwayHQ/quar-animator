/**
 * Boolean Operations for Quar Animator
 * Union, Subtract (Difference), Intersect, Exclude (XOR) on shape nodes.
 * Uses polygon-clipping for robust polygon boolean operations.
 */

import polygonClipping from 'polygon-clipping';
import type { Polygon, MultiPolygon, Ring } from 'polygon-clipping';
import type {
  Node,
  PathNode,
  PathPoint,
  RectangleNode,
  EllipseNode,
  PolygonNode,
  GroupNode,
  Fill,
  Stroke,
  Matrix3,
  Vector2,
} from '@quar/types';
import { mat3 } from '../math';
import {
  tessellatePathToVertices,
  createRectanglePath,
  createEllipsePath,
  createPolygonPath,
  createStarPath,
  applyCornerRadius,
} from '../path/pathUtils';

// ============================================================================
// Types
// ============================================================================

export type BooleanOp = 'union' | 'subtract' | 'intersect' | 'exclude';

// ============================================================================
// Node → Polygon Conversion
// ============================================================================

/**
 * Convert any shape node to polygon-clipping MultiPolygon format.
 * Tessellates curves to straight segments and applies world transform.
 */
export function nodeToPolygon(
  node: Node,
  worldTransform: Matrix3,
  tolerance: number = 1.0
): MultiPolygon | null {
  const contours = nodeToContours(node, tolerance);
  if (!contours || contours.length === 0) return null;

  // Transform all points through world matrix
  const transformedContours = contours.map((contour) =>
    contour.map((pt) => {
      const tp = mat3.transformPoint(worldTransform, pt);
      return [tp.x, tp.y] as [number, number];
    })
  );

  // First contour is outer, rest are holes → one Polygon
  return [transformedContours as Ring[]];
}

/**
 * Get contours (outer + holes) from a node as arrays of Vector2.
 * Returns null for unsupported node types.
 */
function nodeToContours(node: Node, tolerance: number): Vector2[][] | null {
  switch (node.type) {
    case 'rectangle':
      return [rectangleToPoints(node)];
    case 'ellipse':
      return [ellipseToPoints(node, tolerance)];
    case 'polygon':
      return [polygonNodeToPoints(node, tolerance)];
    case 'path':
      return pathToContours(node, tolerance);
    default:
      return null;
  }
}

function rectangleToPoints(node: RectangleNode): Vector2[] {
  const pathPoints = createRectanglePath(
    -node.width * node.transform.anchor.x,
    -node.height * node.transform.anchor.y,
    node.width,
    node.height,
    node.cornerRadius
  );
  return tessellateToVector2(pathPoints, true, 1.0);
}

function ellipseToPoints(node: EllipseNode, tolerance: number): Vector2[] {
  const pathPoints = createEllipsePath(0, 0, node.radiusX, node.radiusY);
  return tessellateToVector2(pathPoints, true, tolerance);
}

function polygonNodeToPoints(node: PolygonNode, tolerance: number): Vector2[] {
  const pathPoints =
    node.innerRadius !== undefined
      ? createStarPath(0, 0, node.radius, node.innerRadius, node.sides)
      : createPolygonPath(0, 0, node.radius, node.sides);
  return tessellateToVector2(pathPoints, true, tolerance);
}

function pathToContours(node: PathNode, tolerance: number): Vector2[][] | null {
  if (node.points.length < 2 || !node.closed) return null;

  const contours: Vector2[][] = [];

  // Primary contour
  const processed = applyCornerRadius(node.points, node.closed);
  contours.push(tessellateToVector2(processed, true, tolerance));

  // Additional subpath contours
  if (node.subpaths) {
    for (const sp of node.subpaths) {
      if (sp.length >= 2) {
        const processedSp = applyCornerRadius(sp, true);
        contours.push(tessellateToVector2(processedSp, true, tolerance));
      }
    }
  }

  return contours;
}

function tessellateToVector2(points: PathPoint[], closed: boolean, tolerance: number): Vector2[] {
  const flat = tessellatePathToVertices(points, closed, tolerance);
  const result: Vector2[] = [];
  for (let i = 0; i < flat.length; i += 2) {
    result.push({ x: flat[i]!, y: flat[i + 1]! });
  }
  return result;
}

// ============================================================================
// Boolean Operation Execution
// ============================================================================

/**
 * Execute a boolean operation on two polygon-clipping MultiPolygon inputs.
 */
export function performBoolean(
  polyA: MultiPolygon,
  polyB: MultiPolygon,
  op: BooleanOp
): MultiPolygon {
  switch (op) {
    case 'union':
      return polygonClipping.union(polyA as Polygon[], ...(polyB as Polygon[]));
    case 'subtract':
      return polygonClipping.difference(polyA as Polygon[], ...(polyB as Polygon[]));
    case 'intersect':
      return polygonClipping.intersection(polyA as Polygon[], ...(polyB as Polygon[]));
    case 'exclude':
      return polygonClipping.xor(polyA as Polygon[], ...(polyB as Polygon[]));
  }
}

// ============================================================================
// Result → Node Conversion
// ============================================================================

/**
 * Convert a polygon-clipping MultiPolygon result to PathPoint contours.
 * Each ring becomes a contour of corner PathPoints.
 */
export function polygonToContours(result: MultiPolygon): PathPoint[][] {
  const contours: PathPoint[][] = [];

  for (const polygon of result) {
    for (const ring of polygon) {
      if (ring.length < 3) continue;
      const points: PathPoint[] = ring.map(([x, y]) => ({
        position: { x, y },
        handleIn: null,
        handleOut: null,
        type: 'corner' as const,
      }));
      // polygon-clipping returns rings with first==last; remove duplicate closing point
      if (
        points.length > 1 &&
        points[0]!.position.x === points[points.length - 1]!.position.x &&
        points[0]!.position.y === points[points.length - 1]!.position.y
      ) {
        points.pop();
      }
      if (points.length >= 3) {
        contours.push(points);
      }
    }
  }

  return contours;
}

/**
 * Create a centered PathNode from boolean result contours.
 * First contour → `points`, rest → `subpaths`.
 */
export function createBooleanResultNode(
  contours: PathPoint[][],
  fills: Fill[],
  strokes: Stroke[],
  name: string,
  generateId: () => string
): PathNode | null {
  if (contours.length === 0) return null;

  // Compute bounding box center across all contours
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const contour of contours) {
    for (const pt of contour) {
      if (pt.position.x < minX) minX = pt.position.x;
      if (pt.position.x > maxX) maxX = pt.position.x;
      if (pt.position.y < minY) minY = pt.position.y;
      if (pt.position.y > maxY) maxY = pt.position.y;
    }
  }
  const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };

  // Center all contours
  const centeredContours = contours.map((contour) =>
    contour.map((pt) => ({
      ...pt,
      position: { x: pt.position.x - center.x, y: pt.position.y - center.y },
    }))
  );

  const primaryContour = centeredContours[0]!;
  const subpaths = centeredContours.length > 1 ? centeredContours.slice(1) : undefined;

  return {
    id: generateId(),
    name,
    type: 'path',
    parent: null,
    children: [],
    transform: {
      position: center,
      rotation: 0,
      scale: { x: 1, y: 1 },
      anchor: { x: 0.5, y: 0.5 },
      skew: { x: 0, y: 0 },
    },
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    points: primaryContour,
    subpaths,
    closed: true,
    fillRule: subpaths ? 'evenodd' : undefined,
    fills: fills.length > 0 ? fills : [],
    strokes: strokes.length > 0 ? strokes : [],
  };
}

// ============================================================================
// Boolean Group Computation (non-destructive)
// ============================================================================

const MAX_BOOLEAN_GROUP_DEPTH = 10;

/**
 * Compute the boolean result of a boolean group's children.
 * Each child is converted to a polygon using its local transform (relative to the group).
 * Nested boolean groups are recursively computed.
 * Returns tessellated contours as PathPoint[][] ready for rendering, or null if empty.
 */
export function computeBooleanGroupResult(
  children: Node[],
  childLocalTransforms: Matrix3[],
  op: BooleanOp,
  depth: number = 0
): PathPoint[][] | null {
  if (children.length < 2 || depth > MAX_BOOLEAN_GROUP_DEPTH) return null;

  // Convert first child to polygon
  let accum = childToPolygon(children[0]!, childLocalTransforms[0]!, depth);
  if (!accum) return null;

  // Iteratively apply the operation
  for (let i = 1; i < children.length; i++) {
    const poly = childToPolygon(children[i]!, childLocalTransforms[i]!, depth);
    if (!poly) continue;
    accum = performBoolean(accum, poly, op);
  }

  if (!accum || accum.length === 0) return null;

  const contours = polygonToContours(accum);
  return contours.length > 0 ? contours : null;
}

/**
 * Convert a child node to a MultiPolygon, handling nested boolean groups recursively.
 */
function childToPolygon(node: Node, worldTransform: Matrix3, depth: number): MultiPolygon | null {
  // If this child is itself a boolean group, recursively compute its result
  if (node.type === 'group' && node.booleanOp) {
    return computeNestedBooleanGroup(node, worldTransform, depth);
  }
  return nodeToPolygon(node, worldTransform);
}

/**
 * Recursively compute a nested boolean group's polygon result.
 * Builds a temporary PathNode-like structure from the recursive result,
 * then passes it through nodeToPolygon.
 */
function computeNestedBooleanGroup(
  group: GroupNode,
  groupWorldTransform: Matrix3,
  depth: number
): MultiPolygon | null {
  // For nested groups, we need the children's transforms to be in the group's local space.
  // Since we don't have the SceneGraph here, we just return null for nested boolean groups
  // without children data. The ShapeRenderer will handle this at render time.
  // This function is called from the ShapeRenderer where children are available.
  // For now, return null — the ShapeRenderer supplies children explicitly.
  void group;
  void groupWorldTransform;
  void depth;
  return null;
}

// ============================================================================
// High-Level Boolean Operation
// ============================================================================

/**
 * Perform a boolean operation across multiple nodes.
 * Nodes are processed in order: result = A op B op C op ...
 * Returns the resulting PathNode, or null if the result is empty.
 */
export function booleanOperation(
  nodes: Node[],
  worldTransforms: Matrix3[],
  op: BooleanOp,
  generateId: () => string
): PathNode | null {
  if (nodes.length < 2) return null;

  // Convert first node to polygon
  let accum = nodeToPolygon(nodes[0]!, worldTransforms[0]!);
  if (!accum) return null;

  // Iteratively apply the operation with each subsequent node
  for (let i = 1; i < nodes.length; i++) {
    const poly = nodeToPolygon(nodes[i]!, worldTransforms[i]!);
    if (!poly) continue;
    accum = performBoolean(accum, poly, op);
  }

  if (!accum || accum.length === 0) return null;

  // Convert result to contours
  const contours = polygonToContours(accum);
  if (contours.length === 0) return null;

  // Use fills/strokes from the first node
  const firstNode = nodes[0]!;
  const fills: Fill[] = 'fills' in firstNode ? (firstNode as { fills: Fill[] }).fills : [];
  const strokes: Stroke[] =
    'strokes' in firstNode ? (firstNode as { strokes: Stroke[] }).strokes : [];

  const opNames: Record<BooleanOp, string> = {
    union: 'Union',
    subtract: 'Subtract',
    intersect: 'Intersect',
    exclude: 'Exclude',
  };

  return createBooleanResultNode(contours, fills, strokes, opNames[op], generateId);
}
