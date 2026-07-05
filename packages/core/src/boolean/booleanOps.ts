/**
 * Boolean Operations for Quar Animator
 * Union, Subtract (Difference), Intersect, Exclude (XOR) on shape nodes.
 * Uses polygon-clipping for robust polygon boolean operations.
 */

import polygonClipping from 'polygon-clipping';
import type { MultiPolygon, Ring } from 'polygon-clipping';
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

  // Single contour → one Polygon (fast path).
  if (transformedContours.length === 1) {
    return [transformedContours];
  }

  // Multiple contours: classify by even-odd nesting depth (matching the evenodd
  // fill rule the renderer uses) so DISJOINT subpaths become separate Polygons
  // instead of being lumped as holes of the first contour — which would treat
  // them as holes and silently destroy their area in later boolean/eraser ops.
  const rings = transformedContours;
  const depths = rings.map((ring, i) => {
    const rep = ring[0];
    if (!rep) return 0;
    let depth = 0;
    for (let j = 0; j < rings.length; j++) {
      if (j !== i && pointInRing(rep, rings[j]!)) depth++;
    }
    return depth;
  });

  // Even depth → exterior ring (its own Polygon); odd depth → hole.
  const polygons: MultiPolygon = [];
  const exteriorPolygonIndex = new Map<number, number>();
  for (let i = 0; i < rings.length; i++) {
    if (depths[i]! % 2 === 0) {
      exteriorPolygonIndex.set(i, polygons.length);
      polygons.push([rings[i]!]);
    }
  }

  // Assign each hole to its immediate container: the exterior ring that contains
  // it with the greatest nesting depth.
  for (let i = 0; i < rings.length; i++) {
    if (depths[i]! % 2 === 0) continue;
    const rep = rings[i]![0];
    let parent = -1;
    let parentDepth = -1;
    if (rep) {
      for (let j = 0; j < rings.length; j++) {
        if (j === i || depths[j]! % 2 !== 0) continue;
        if (depths[j]! > parentDepth && pointInRing(rep, rings[j]!)) {
          parent = j;
          parentDepth = depths[j]!;
        }
      }
    }
    if (parent >= 0) {
      polygons[exteriorPolygonIndex.get(parent)!]!.push(rings[i]!);
    } else {
      // No container found — keep the piece as its own Polygon.
      polygons.push([rings[i]!]);
    }
  }

  return polygons;
}

/**
 * Even-odd ray-cast point-in-ring test. `ring` is a closed contour of [x, y].
 */
function pointInRing(pt: [number, number], ring: Ring): boolean {
  const x = pt[0];
  const y = pt[1];
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]![0];
    const yi = ring[i]![1];
    const xj = ring[j]![0];
    const yj = ring[j]![1];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
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
      ? createStarPath(
          0,
          0,
          node.radius,
          node.innerRadius,
          node.sides,
          Math.PI / 2,
          node.cornerRadius
        )
      : createPolygonPath(0, 0, node.radius, node.sides, Math.PI / 2, node.cornerRadius);
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
  // polygon-clipping expects closed rings (first == last point).
  // tessellatePathToVertices removes the duplicate closing vertex (earcut needs it removed),
  // so re-add it here for polygon-clipping input.
  if (closed && result.length >= 3) {
    const first = result[0]!;
    const last = result[result.length - 1]!;
    if (Math.abs(first.x - last.x) > 1e-10 || Math.abs(first.y - last.y) > 1e-10) {
      result.push({ x: first.x, y: first.y });
    }
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
  // Pass polyB as a single geometry operand (not spread). Spreading a
  // multi-part MultiPolygon turns each piece into a separate operand, which is
  // wrong for intersect: intersection(A, ...[B1,B2]) computes A ∩ B1 ∩ B2
  // instead of A ∩ (B1 ∪ B2). The unspread form is correct for every op.
  switch (op) {
    case 'union':
      return polygonClipping.union(polyA, polyB);
    case 'subtract':
      return polygonClipping.difference(polyA, polyB);
    case 'intersect':
      return polygonClipping.intersection(polyA, polyB);
    case 'exclude':
      return polygonClipping.xor(polyA, polyB);
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
