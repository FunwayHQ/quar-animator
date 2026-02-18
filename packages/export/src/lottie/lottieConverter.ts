/**
 * Lottie Converter
 *
 * Pure functions converting Quar scene graph nodes → Lottie layers/shapes.
 *
 * Foundation scope: Rectangle, Ellipse, Path, Polygon → shape layers.
 * Groups → shape groups. Solid fills/strokes. Transform animation.
 * NOT covered: Gradients, Text, Images, Effects, Blend modes, Rigging, Symbols, Boolean ops.
 */

import type {
  Node,
  RectangleNode,
  EllipseNode,
  PathNode,
  PolygonNode,
  PathPoint,
  Fill,
  Stroke,
  Timeline,
  Transform,
} from '@quar/types';
import { findTrack } from '@quar/animation';
import type {
  LottieLayer,
  LottieShapeItem,
  LottieShapePath,
  LottieShapeRect,
  LottieShapeEllipse,
  LottieShapeFill,
  LottieShapeStroke,
  LottieShapeTransform,
  LottieTransform,
  LottieShapeVertices,
} from './lottieTypes';
import {
  trackToLottieAnimated,
  positionTracksToLottie,
  colorToLottieStatic,
  VALUE_TRANSFORMS,
} from './lottieKeyframes';

// ============================================================================
// Line Cap / Join Conversion
// ============================================================================

const CAP_MAP: Record<string, 1 | 2 | 3> = { butt: 1, round: 2, square: 3 };
const JOIN_MAP: Record<string, 1 | 2 | 3> = { miter: 1, round: 2, bevel: 3 };

// ============================================================================
// Node → Lottie Layer
// ============================================================================

/**
 * Convert a Quar scene graph node to a Lottie shape layer.
 * Returns null for unsupported node types.
 */
export function nodeToLottieLayer(
  node: Node,
  timeline: Timeline,
  layerIndex: number,
  canvasH: number,
  duration: number
): LottieLayer | null {
  const shapes = nodeToLottieShapes(node, timeline, canvasH);
  if (!shapes || shapes.length === 0) return null;

  return {
    ind: layerIndex,
    ty: 4, // Shape layer
    nm: node.name || `Layer ${layerIndex}`,
    ks: buildLottieTransform(node.transform, node.id, timeline, canvasH),
    ip: 0,
    op: duration,
    st: 0,
    shapes,
  };
}

/**
 * Route a node to the appropriate shape converter based on type.
 */
export function nodeToLottieShapes(
  node: Node,
  timeline: Timeline,
  _canvasH: number
): LottieShapeItem[] | null {
  switch (node.type) {
    case 'rectangle':
      return rectangleToLottieShapes(node, timeline);
    case 'ellipse':
      return ellipseToLottieShapes(node, timeline);
    case 'path':
      return pathToLottieShapes(node, timeline);
    case 'polygon':
      return polygonToLottieShapes(node, timeline);
    case 'group':
      return groupToLottieShapes();
    default:
      return null; // Text, Image, Bone, etc. not supported in foundation
  }
}

// ============================================================================
// Rectangle → Lottie
// ============================================================================

export function rectangleToLottieShapes(
  node: RectangleNode,
  timeline: Timeline,
  _canvasH?: number
): LottieShapeItem[] {
  const items: LottieShapeItem[] = [];

  // Shape: rectangle
  const widthTrack = findTrack<number>(timeline, node.id, 'width');
  const heightTrack = findTrack<number>(timeline, node.id, 'height');
  const crTrack = findTrack<number>(timeline, node.id, 'cornerRadius.0');

  const rect: LottieShapeRect = {
    ty: 'rc',
    nm: 'Rectangle',
    p: { a: 0, k: [0, 0] }, // Local center
    s: positionTracksToLottie(widthTrack, heightTrack, node.width, node.height),
    r: trackToLottieAnimated(crTrack, node.cornerRadius[0]),
  };
  items.push(rect);

  // Fill(s)
  items.push(...fillsToLottie(node.fills, node.id, timeline));

  // Stroke(s)
  items.push(...strokesToLottie(node.strokes, node.id, timeline));

  // Shape transform (identity — actual transform is on the layer)
  items.push(createShapeTransform());

  return items;
}

// ============================================================================
// Ellipse → Lottie
// ============================================================================

export function ellipseToLottieShapes(
  node: EllipseNode,
  timeline: Timeline,
  _canvasH?: number
): LottieShapeItem[] {
  const items: LottieShapeItem[] = [];

  const rxTrack = findTrack<number>(timeline, node.id, 'radiusX');
  const ryTrack = findTrack<number>(timeline, node.id, 'radiusY');

  const ellipse: LottieShapeEllipse = {
    ty: 'el',
    nm: 'Ellipse',
    p: { a: 0, k: [0, 0] },
    // Lottie ellipse size is full diameter, Quar stores radius — multiply by 2
    s: positionTracksToLottie(
      rxTrack,
      ryTrack,
      node.radiusX,
      node.radiusY,
      (v) => v * 2,
      (v) => v * 2
    ),
  };
  items.push(ellipse);

  items.push(...fillsToLottie(node.fills, node.id, timeline));
  items.push(...strokesToLottie(node.strokes, node.id, timeline));
  items.push(createShapeTransform());

  return items;
}

// ============================================================================
// Path → Lottie
// ============================================================================

export function pathToLottieShapes(
  node: PathNode,
  timeline: Timeline,
  _canvasH?: number
): LottieShapeItem[] {
  const items: LottieShapeItem[] = [];

  // Convert primary path
  const vertices = pathPointsToLottieVertices(node.points, node.closed);
  const shapePath: LottieShapePath = {
    ty: 'sh',
    nm: 'Path',
    ks: { a: 0, k: vertices },
  };
  items.push(shapePath);

  // Convert subpaths
  if (node.subpaths) {
    for (let i = 0; i < node.subpaths.length; i++) {
      const subVertices = pathPointsToLottieVertices(node.subpaths[i], true);
      const subPath: LottieShapePath = {
        ty: 'sh',
        nm: `Subpath ${i + 1}`,
        ks: { a: 0, k: subVertices },
      };
      items.push(subPath);
    }
  }

  items.push(...fillsToLottie(node.fills, node.id, timeline, node.fillRule));
  items.push(...strokesToLottie(node.strokes, node.id, timeline));
  items.push(createShapeTransform());

  return items;
}

// ============================================================================
// Polygon → Lottie (converted to path vertices)
// ============================================================================

export function polygonToLottieShapes(
  node: PolygonNode,
  timeline: Timeline,
  _canvasH?: number
): LottieShapeItem[] {
  const items: LottieShapeItem[] = [];

  // Generate polygon vertices
  const points = generatePolygonPoints(node);
  const vertices = pathPointsToLottieVertices(points, true);
  const shapePath: LottieShapePath = {
    ty: 'sh',
    nm: 'Polygon',
    ks: { a: 0, k: vertices },
  };
  items.push(shapePath);

  items.push(...fillsToLottie(node.fills, node.id, timeline));
  items.push(...strokesToLottie(node.strokes, node.id, timeline));
  items.push(createShapeTransform());

  return items;
}

// ============================================================================
// Group → Lottie Shape Group
// ============================================================================

export function groupToLottieShapes(): LottieShapeItem[] {
  // Groups in Lottie are "gr" shape items
  // We return a single group item, but children need to be resolved by the caller
  // since we don't have access to child nodes here.
  // The exporter handles group children traversal.
  return [];
}

// ============================================================================
// Path Points → Lottie Vertices
// ============================================================================

/**
 * Convert Quar PathPoints to Lottie shape vertex format.
 *
 * Lottie uses:
 * - v: absolute vertex positions [[x, y], ...]
 * - i: in-tangent handles RELATIVE to vertex
 * - o: out-tangent handles RELATIVE to vertex
 * - c: whether the path is closed
 *
 * Note: Quar handles are absolute positions, Lottie handles are relative to the vertex.
 * Quar is Y-up, but path points are in local space so we don't Y-flip here
 * (the layer transform handles the Y-flip).
 */
export function pathPointsToLottieVertices(
  points: PathPoint[],
  closed: boolean
): LottieShapeVertices {
  const v: number[][] = [];
  const i: number[][] = [];
  const o: number[][] = [];

  for (const pt of points) {
    v.push([pt.position.x, pt.position.y]);

    // In-handle (relative to vertex)
    if (pt.handleIn) {
      i.push([pt.handleIn.x - pt.position.x, pt.handleIn.y - pt.position.y]);
    } else {
      i.push([0, 0]);
    }

    // Out-handle (relative to vertex)
    if (pt.handleOut) {
      o.push([pt.handleOut.x - pt.position.x, pt.handleOut.y - pt.position.y]);
    } else {
      o.push([0, 0]);
    }
  }

  return { v, i, o, c: closed };
}

// ============================================================================
// Fills → Lottie
// ============================================================================

/**
 * Convert Quar fills to Lottie fill shape items.
 * Only solid fills are supported in the foundation.
 */
export function fillsToLottie(
  fills: Fill[] | undefined,
  nodeId: string,
  timeline: Timeline,
  fillRule?: 'nonzero' | 'evenodd'
): LottieShapeFill[] {
  if (!fills) return [];

  const result: LottieShapeFill[] = [];
  for (let idx = 0; idx < fills.length; idx++) {
    const fill = fills[idx];
    if (!fill.visible || fill.type !== 'solid' || !fill.color) continue;

    // Color tracks reserved for future animated color support
    const _colorTrackR = findTrack<number>(timeline, nodeId, `fills.${idx}.color.r`);
    const _colorTrackG = findTrack<number>(timeline, nodeId, `fills.${idx}.color.g`);
    const _colorTrackB = findTrack<number>(timeline, nodeId, `fills.${idx}.color.b`);

    // Static color (animation support deferred for color tracks with multiple components)
    const lottieFill: LottieShapeFill = {
      ty: 'fl',
      nm: `Fill ${idx + 1}`,
      c: colorToLottieStatic(fill.color),
      o: { a: 0, k: fill.opacity * 100 },
    };

    if (fillRule === 'evenodd') {
      lottieFill.r = 2;
    }

    result.push(lottieFill);
  }

  return result;
}

// ============================================================================
// Strokes → Lottie
// ============================================================================

/**
 * Convert Quar strokes to Lottie stroke shape items.
 */
export function strokesToLottie(
  strokes: Stroke[] | undefined,
  nodeId: string,
  timeline: Timeline
): LottieShapeStroke[] {
  if (!strokes) return [];

  const result: LottieShapeStroke[] = [];
  for (let idx = 0; idx < strokes.length; idx++) {
    const stroke = strokes[idx];
    if (!stroke.visible) continue;

    const widthTrack = findTrack<number>(timeline, nodeId, `strokes.${idx}.width`);

    const lottieStroke: LottieShapeStroke = {
      ty: 'st',
      nm: `Stroke ${idx + 1}`,
      c: colorToLottieStatic(stroke.color),
      o: { a: 0, k: stroke.opacity * 100 },
      w: trackToLottieAnimated(widthTrack, stroke.width),
      lc: CAP_MAP[stroke.cap] ?? 2,
      lj: JOIN_MAP[stroke.join] ?? 1,
    };

    if (stroke.miterLimit) {
      lottieStroke.ml = stroke.miterLimit;
    }

    result.push(lottieStroke);
  }

  return result;
}

// ============================================================================
// Transform → Lottie
// ============================================================================

/**
 * Build a Lottie layer transform from a Quar node transform.
 *
 * Key conversions:
 * - Anchor: Quar normalized (0-1) → Lottie pixels. Y-flip for anchor.
 * - Position: Y-flip (canvasH - y)
 * - Scale: Quar 0-1 → Lottie 0-100
 * - Rotation: Quar stores degrees (same as Lottie), but Y-flip negates rotation
 * - Opacity: Quar 0-1 → Lottie 0-100
 */
export function buildLottieTransform(
  transform: Transform,
  nodeId: string,
  timeline: Timeline,
  canvasH: number
): LottieTransform {
  // Tracks
  const posXTrack = findTrack<number>(timeline, nodeId, 'transform.position.x');
  const posYTrack = findTrack<number>(timeline, nodeId, 'transform.position.y');
  const rotTrack = findTrack<number>(timeline, nodeId, 'transform.rotation');
  const scaleXTrack = findTrack<number>(timeline, nodeId, 'transform.scale.x');
  const scaleYTrack = findTrack<number>(timeline, nodeId, 'transform.scale.y');
  const opacityTrack = findTrack<number>(timeline, nodeId, 'opacity');

  const flipY = VALUE_TRANSFORMS.yFlip(canvasH);

  return {
    a: { a: 0, k: [0, 0] }, // Anchor at center (shapes are drawn relative to their own center)
    p: positionTracksToLottie(
      posXTrack,
      posYTrack,
      transform.position.x,
      transform.position.y,
      VALUE_TRANSFORMS.identity,
      flipY
    ),
    r: trackToLottieAnimated(rotTrack, -transform.rotation), // Negate for Y-flip
    s: positionTracksToLottie(
      scaleXTrack,
      scaleYTrack,
      transform.scale.x,
      transform.scale.y,
      VALUE_TRANSFORMS.scaleTo100,
      VALUE_TRANSFORMS.scaleTo100
    ),
    o: trackToLottieAnimated(opacityTrack, transform.opacity ?? 1, VALUE_TRANSFORMS.opacityTo100),
  };
}

// ============================================================================
// Helpers
// ============================================================================

function createShapeTransform(): LottieShapeTransform {
  return {
    ty: 'tr',
    p: { a: 0, k: [0, 0] },
    r: { a: 0, k: 0 },
    s: { a: 0, k: [100, 100] },
    o: { a: 0, k: 100 },
  };
}

/**
 * Generate polygon/star vertex points from a PolygonNode.
 * Returns corner PathPoints (no bezier handles).
 */
export function generatePolygonPoints(node: PolygonNode): PathPoint[] {
  const { sides, radius, innerRadius } = node;
  const points: PathPoint[] = [];
  const isStar = innerRadius != null && innerRadius > 0;
  const count = isStar ? sides * 2 : sides;

  for (let k = 0; k < count; k++) {
    const angle = (k / count) * Math.PI * 2 - Math.PI / 2; // Start from top
    // innerRadius is guaranteed non-null and > 0 when isStar is true
    const r = isStar && k % 2 === 1 ? (innerRadius ?? 0) : radius;
    points.push({
      position: { x: Math.cos(angle) * r, y: Math.sin(angle) * r },
      handleIn: null,
      handleOut: null,
      type: 'corner',
    });
  }

  return points;
}
