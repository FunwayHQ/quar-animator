/**
 * SVG Converter
 * Converts parsed SVG elements to Quar node types.
 */

import type {
  Node,
  GroupNode,
  RectangleNode,
  EllipseNode,
  PathNode,
  PathPoint,
  Fill,
  Stroke,
  Gradient,
  GradientStop,
  Transform,
  Vector2,
} from '@quar/types';
import { createDefaultTransform } from '../SceneGraph';
import { getNodeLocalBounds } from '../gradient/gradientUtils';
import { clonePathPoint } from '../path/pathUtils';
import { getShapeOutlinePoints } from '../path/shapeToPath';
import {
  parseSvgTransform,
  parseSvgColor,
  paintColor,
  parseUrlRef,
  parseSvgTransformToMatrix,
  decomposeMatrix,
  type ResolvedStyle,
} from './svgUtils';
import { parseSvgPath } from './svgPathParser';
import type {
  ParsedSvg,
  SvgElement,
  SvgRect,
  SvgEllipse,
  SvgCircle,
  SvgLine,
  SvgPolygon,
  SvgPolyline,
  SvgPath,
  SvgGroup,
  SvgDefs,
  ParsedGradient,
} from './svgParser';

// ============================================================================
// Main Converter
// ============================================================================

/**
 * Convert a parsed SVG into Quar node types.
 * Returns a flat array of root-level nodes (groups contain children via scene graph).
 */
export function convertSvgToNodes(
  parsed: ParsedSvg,
  generateId: () => string
): { nodes: Node[]; rootIds: string[] } {
  const viewBoxHeight = parsed.viewBox?.height ?? parsed.height;
  const allNodes: Node[] = [];

  const ctx: ConvertContext = {
    generateId,
    defs: parsed.defs,
    viewBoxHeight,
    allNodes,
  };

  const rootIds: string[] = [];

  for (const element of parsed.elements) {
    const nodes = convertElement(element, ctx);
    for (const node of nodes) {
      rootIds.push(node.id);
    }
  }

  // Layers don't draw skew: a sheared shape's whole transform goes into its
  // outline instead, so it looks as the SVG draws it (and exports that way)
  for (let i = 0; i < allNodes.length; i++) {
    const baked = bakeShear(allNodes[i]!);
    if (baked) allNodes[i] = baked;
  }

  return { nodes: allNodes, rootIds };
}

/**
 * A shape whose transform shears it, as a path with the transform's whole
 * linear part applied to its points (and handles): rotation 0, scale 1, no
 * skew. Same id, so its parent and masks still find it. Null when there's no
 * shear (a skew of 0° or 180° — the latter a mirror, kept by the scale), or
 * for layers without an outline of their own (groups).
 */
function bakeShear(node: Node): PathNode | null {
  const { rotation, scale, skew } = node.transform;
  const phi = (skew.x * Math.PI) / 180;
  if (Math.abs(Math.sin(phi)) < 1e-9) return null;
  const outline = getShapeOutlinePoints(node);
  if (!outline) return null;

  // The SVG matrix's linear part, rebuilt from what decomposeMatrix kept:
  // column 1 from the rotation (stored negated, Y-up) and scale.x; column 2
  // from its dot product and determinant with column 1 (the skew angle and
  // both scales)
  const theta = (-rotation * Math.PI) / 180;
  const sx = scale.x;
  const sy = Math.abs(scale.y);
  const a = sx * Math.cos(theta);
  const b = sx * Math.sin(theta);
  const dot = sx * sy * Math.sin(phi);
  const det = sx * sy * Math.cos(phi);
  const c = (a * dot - b * det) / (sx * sx);
  const d = (b * dot + a * det) / (sx * sx);
  // In the layer's Y-up space: F·M·F with F = diag(1, -1)
  const map = (v: Vector2): Vector2 => ({ x: a * v.x - c * v.y, y: -b * v.x + d * v.y });
  const bake = (points: PathPoint[]): PathPoint[] =>
    points.map((pt) => ({
      ...pt,
      position: map(pt.position),
      handleIn: pt.handleIn ? map(pt.handleIn) : null,
      handleOut: pt.handleOut ? map(pt.handleOut) : null,
    }));

  const { id, name, parent, children, visible, locked, opacity, blendMode } = node;
  return {
    id,
    name,
    type: 'path',
    parent,
    children,
    transform: { ...createDefaultTransform(), position: { ...node.transform.position } },
    visible,
    locked,
    opacity,
    blendMode,
    points: bake(outline.points),
    ...(outline.subpaths ? { subpaths: outline.subpaths.map(bake) } : {}),
    closed: outline.closed,
    ...(node.type === 'path' && node.fillRule ? { fillRule: node.fillRule } : {}),
    fills: ('fills' in node ? node.fills : undefined) ?? [],
    strokes: ('strokes' in node ? node.strokes : undefined) ?? [],
  };
}

interface ConvertContext {
  generateId: () => string;
  defs: SvgDefs;
  viewBoxHeight: number;
  allNodes: Node[];
}

// ============================================================================
// Element Dispatch
// ============================================================================

/** The longest layer name an SVG element's id gives. */
const MAX_LAYER_NAME = 100;

/**
 * A layer's name from an SVG element's id, which is anyone's to write:
 * control characters become spaces, and invisible formatting ones (those
 * that turn text around or hide it) are left out, so a name reads as it is;
 * runs of space are made one, and it's cut at 100 characters. The shape's
 * kind when nothing's left.
 */
function layerName(id: string | undefined, fallback: string): string {
  const name = (id ?? '')
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\p{Cf}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  return name ? Array.from(name).slice(0, MAX_LAYER_NAME).join('').trimEnd() : fallback;
}

function convertElement(element: SvgElement, ctx: ConvertContext): Node[] {
  switch (element.tag) {
    case 'rect':
      return [convertRect(element, ctx)];
    case 'ellipse':
      return [convertEllipse(element, ctx)];
    case 'circle':
      return [convertCircle(element, ctx)];
    case 'line':
      return [convertLine(element, ctx)];
    case 'polygon':
      return [convertPolygon(element, ctx)];
    case 'polyline':
      return convertPolyline(element, ctx);
    case 'path':
      return convertPath(element, ctx);
    case 'g':
      return [convertGroup(element, ctx)];
    default:
      return [];
  }
}

// ============================================================================
// Shape Converters
// ============================================================================

function convertRect(el: SvgRect, ctx: ConvertContext): RectangleNode {
  // SVG rect: top-left (x,y) + width/height
  // Quar rect: center position + anchor(0.5, 0.5) + width/height
  const centerX = el.x + el.width / 2;
  const centerY = el.y + el.height / 2;

  const transform = buildTransform(centerX, centerY, el.transform, ctx.viewBoxHeight);

  // Corner radius: SVG rx/ry
  const rx = el.rx ?? el.ry ?? 0;
  const ry = el.ry ?? el.rx ?? 0;
  const cr = Math.min(rx, ry, el.width / 2, el.height / 2);

  const node: RectangleNode = {
    id: ctx.generateId(),
    name: layerName(el.id, 'Rectangle'),
    type: 'rectangle',
    parent: null,
    children: [],
    transform,
    visible: true,
    locked: false,
    opacity: el.style.opacity,
    blendMode: 'normal',
    width: el.width,
    height: el.height,
    cornerRadius: [cr, cr, cr, cr],
    fills: [],
    strokes: [],
  };
  paintShape(node, el.style, { x: centerX, y: centerY }, ctx);

  ctx.allNodes.push(node);
  return node;
}

function convertEllipse(el: SvgEllipse, ctx: ConvertContext): EllipseNode {
  const transform = buildTransform(el.cx, el.cy, el.transform, ctx.viewBoxHeight);

  const node: EllipseNode = {
    id: ctx.generateId(),
    name: layerName(el.id, 'Ellipse'),
    type: 'ellipse',
    parent: null,
    children: [],
    transform,
    visible: true,
    locked: false,
    opacity: el.style.opacity,
    blendMode: 'normal',
    radiusX: el.rx,
    radiusY: el.ry,
    fills: [],
    strokes: [],
  };
  paintShape(node, el.style, { x: el.cx, y: el.cy }, ctx);

  ctx.allNodes.push(node);
  return node;
}

function convertCircle(el: SvgCircle, ctx: ConvertContext): EllipseNode {
  const transform = buildTransform(el.cx, el.cy, el.transform, ctx.viewBoxHeight);

  const node: EllipseNode = {
    id: ctx.generateId(),
    name: layerName(el.id, 'Circle'),
    type: 'ellipse',
    parent: null,
    children: [],
    transform,
    visible: true,
    locked: false,
    opacity: el.style.opacity,
    blendMode: 'normal',
    radiusX: el.r,
    radiusY: el.r,
    fills: [],
    strokes: [],
  };
  paintShape(node, el.style, { x: el.cx, y: el.cy }, ctx);

  ctx.allNodes.push(node);
  return node;
}

function convertLine(el: SvgLine, ctx: ConvertContext): PathNode {
  const points = [
    {
      position: { x: el.x1, y: ctx.viewBoxHeight - el.y1 },
      handleIn: null,
      handleOut: null,
      type: 'corner' as const,
    },
    {
      position: { x: el.x2, y: ctx.viewBoxHeight - el.y2 },
      handleIn: null,
      handleOut: null,
      type: 'corner' as const,
    },
  ];

  // Center the path so rotation/scale works correctly
  const { centeredPoints, center } = centerPathPoints(points);

  const transform = buildCenteredPathTransform(center, el.transform, ctx.viewBoxHeight);

  const node: PathNode = {
    id: ctx.generateId(),
    name: layerName(el.id, 'Line'),
    type: 'path',
    parent: null,
    children: [],
    transform,
    visible: true,
    locked: false,
    opacity: el.style.opacity,
    blendMode: 'normal',
    points: centeredPoints,
    closed: false,
    fills: [],
    strokes: [],
  };
  paintShape(node, el.style, flippedOrigin(center, ctx), ctx, false);

  ctx.allNodes.push(node);
  return node;
}

function convertPolygon(el: SvgPolygon, ctx: ConvertContext): PathNode {
  const rawPoints = el.points.map((p) => ({
    position: { x: p.x, y: ctx.viewBoxHeight - p.y },
    handleIn: null,
    handleOut: null,
    type: 'corner' as const,
  }));

  // Center the path so rotation/scale works correctly
  const { centeredPoints, center } = centerPathPoints(rawPoints);

  const transform = buildCenteredPathTransform(center, el.transform, ctx.viewBoxHeight);

  const node: PathNode = {
    id: ctx.generateId(),
    name: layerName(el.id, 'Polygon'),
    type: 'path',
    parent: null,
    children: [],
    transform,
    visible: true,
    locked: false,
    opacity: el.style.opacity,
    blendMode: 'normal',
    points: centeredPoints,
    closed: true,
    fills: [],
    strokes: [],
  };
  paintShape(node, el.style, flippedOrigin(center, ctx), ctx);

  ctx.allNodes.push(node);
  return node;
}

function convertPolyline(el: SvgPolyline, ctx: ConvertContext): PathNode[] {
  const rawPoints = el.points.map((p) => ({
    position: { x: p.x, y: ctx.viewBoxHeight - p.y },
    handleIn: null,
    handleOut: null,
    type: 'corner' as const,
  }));

  return convertContour(el, rawPoints, false, layerName(el.id, 'Polyline'), ctx);
}

function convertPath(el: SvgPath, ctx: ConvertContext): PathNode[] {
  const parsedSubpaths = parseSvgPath(el.d);

  // Flip Y for all subpaths
  const flippedSubpaths = parsedSubpaths
    .filter((sp) => sp.points.length >= 2)
    .map((sp) => ({
      points: sp.points.map((p) => ({
        position: { x: p.position.x, y: ctx.viewBoxHeight - p.position.y },
        handleIn: p.handleIn ? { x: p.handleIn.x, y: -p.handleIn.y } : null,
        handleOut: p.handleOut ? { x: p.handleOut.x, y: -p.handleOut.y } : null,
        type: p.type,
      })),
      closed: sp.closed,
    }));

  if (flippedSubpaths.length === 0) return [];

  // Check if this is a compound path (multiple closed subpaths)
  const closedSubpaths = flippedSubpaths.filter((sp) => sp.closed);
  if (closedSubpaths.length > 1) {
    // Compound path: merge all closed subpaths into a single PathNode with subpaths/fillRule
    return [convertCompoundPath(el, closedSubpaths, flippedSubpaths, ctx, el.fillRule)];
  }

  // Simple path(s): one node per subpath, centered
  return flippedSubpaths.flatMap((sp) =>
    convertContour(el, sp.points, sp.closed, layerName(el.id, 'Path'), ctx)
  );
}

/**
 * The nodes for one contour of a <path> or <polyline> (points Y-flipped).
 * SVG fills an open contour as if it were closed, but Quar fills only closed
 * paths: so an open contour whose fill shows comes in closed, and when it's
 * stroked too, the stroke stays on an open copy drawn over that fill
 * (closing the stroked one would stroke an edge the SVG doesn't draw).
 */
function convertContour(
  el: SvgPath | SvgPolyline,
  points: PathPoint[],
  closed: boolean,
  name: string,
  ctx: ConvertContext
): PathNode[] {
  // Center the path so rotation/scale works correctly
  const { centeredPoints, center } = centerPathPoints(points);
  const pathNode = (nodeName: string, nodeClosed: boolean): PathNode => {
    const node: PathNode = {
      id: ctx.generateId(),
      name: nodeName,
      type: 'path',
      parent: null,
      children: [],
      transform: buildCenteredPathTransform(center, el.transform, ctx.viewBoxHeight),
      visible: true,
      locked: false,
      opacity: el.style.opacity,
      blendMode: 'normal',
      points: centeredPoints.map(clonePathPoint),
      closed: nodeClosed,
      fills: [],
      strokes: [],
    };
    paintShape(node, el.style, flippedOrigin(center, ctx), ctx);
    return node;
  };

  const node = pathNode(name, closed);
  const nodes = [node];
  if (!closed) {
    if (!fillShows(node.fills) || !enclosesArea(points)) {
      node.fills = [];
    } else if (node.strokes.length === 0) {
      node.closed = true;
    } else {
      const fill = pathNode(`${name} Fill`, true);
      fill.strokes = [];
      node.fills = [];
      nodes.unshift(fill);
    }
  }

  ctx.allNodes.push(...nodes);
  return nodes;
}

/** Whether any of these fills would show. */
function fillShows(fills: Fill[]): boolean {
  return fills.some((f) => f.opacity > 0 && (f.color?.a ?? 1) > 0);
}

/**
 * Whether closing a contour would enclose any area: not when its points and
 * handles all lie on one line, as a straight run's do.
 */
function enclosesArea(points: PathPoint[]): boolean {
  const spots: Vector2[] = [];
  for (const { position: p, handleIn, handleOut } of points) {
    spots.push(p);
    if (handleIn) spots.push({ x: p.x + handleIn.x, y: p.y + handleIn.y });
    if (handleOut) spots.push({ x: p.x + handleOut.x, y: p.y + handleOut.y });
  }
  const first = spots[0];
  if (!first) return false;
  // The line through the first spot and the one farthest from it
  let far = first;
  let farSq = 0;
  for (const s of spots) {
    const dSq = (s.x - first.x) ** 2 + (s.y - first.y) ** 2;
    if (dSq > farSq) {
      farSq = dSq;
      far = s;
    }
  }
  if (farSq === 0) return false;
  const length = Math.sqrt(farSq);
  const ux = (far.x - first.x) / length;
  const uy = (far.y - first.y) / length;
  return spots.some((s) => Math.abs((s.x - first.x) * uy - (s.y - first.y) * ux) > length * 1e-6);
}

/**
 * Convert a compound SVG path (multiple closed subpaths) into a single PathNode
 * with subpaths and fillRule for proper hole rendering.
 */
function convertCompoundPath(
  el: SvgPath,
  closedSubpaths: { points: import('@quar/types').PathPoint[]; closed: boolean }[],
  allSubpaths: { points: import('@quar/types').PathPoint[]; closed: boolean }[],
  ctx: ConvertContext,
  fillRule?: 'nonzero' | 'evenodd'
): PathNode {
  // Gather all points from all subpaths for bounding box computation
  const allPoints = allSubpaths.flatMap((sp) => sp.points);
  const { center } = centerPathPoints(allPoints);

  // Center each subpath's points relative to the shared center
  const centeredContours = closedSubpaths.map((sp) =>
    sp.points.map((p) => ({
      ...p,
      position: { x: p.position.x - center.x, y: p.position.y - center.y },
    }))
  );

  // Also include open subpaths (strokes only) — center them too
  const openSubpaths = allSubpaths.filter((sp) => !sp.closed);
  const centeredOpen = openSubpaths.map((sp) =>
    sp.points.map((p) => ({
      ...p,
      position: { x: p.position.x - center.x, y: p.position.y - center.y },
    }))
  );

  // First closed contour → points, rest → subpaths
  const primaryContour = centeredContours[0]!;
  const additionalContours = centeredContours.slice(1);

  // Include open subpaths in additionalContours if any
  const subpaths = [...additionalContours, ...centeredOpen];

  const transform = buildCenteredPathTransform(center, el.transform, ctx.viewBoxHeight);

  const node: PathNode = {
    id: ctx.generateId(),
    name: layerName(el.id, 'Path'),
    type: 'path',
    parent: null,
    children: [],
    transform,
    visible: true,
    locked: false,
    opacity: el.style.opacity,
    blendMode: 'normal',
    points: primaryContour,
    subpaths: subpaths.length > 0 ? subpaths : undefined,
    closed: true,
    fillRule: fillRule ?? 'nonzero',
    fills: [],
    strokes: [],
  };
  paintShape(node, el.style, flippedOrigin(center, ctx), ctx);

  ctx.allNodes.push(node);
  return node;
}

function convertGroup(el: SvgGroup, ctx: ConvertContext): GroupNode {
  const svgTransform = el.transform ? parseSvgTransform(el.transform) : createDefaultTransform();
  if (el.transform) {
    // A group transform is a RELATIVE parent->child delta (leaf children are
    // already Y-flipped with the global viewBox height), so the Y delta is just
    // negated — not flipped about viewBoxHeight (which added a full viewBox
    // offset). Rotation is negated to match buildTransform's Y-flip convention.
    svgTransform.position.y = -svgTransform.position.y;
    svgTransform.rotation = -svgTransform.rotation;
  }

  const group: GroupNode = {
    id: ctx.generateId(),
    name: layerName(el.id, 'Group'),
    type: 'group',
    parent: null,
    children: [],
    transform: svgTransform,
    visible: true,
    locked: false,
    opacity: el.style.opacity,
    blendMode: 'normal',
  };

  ctx.allNodes.push(group);

  // Convert children and wire parent/children
  for (const child of el.children) {
    const childNodes = convertElement(child, ctx);
    for (const childNode of childNodes) {
      childNode.parent = group.id;
      group.children.push(childNode.id);
    }
  }

  return group;
}

// ============================================================================
// Path Centering
// ============================================================================

/**
 * Compute bounding box center of path points and offset all points so the center is at origin.
 * Returns the centered points and the original center.
 */
function centerPathPoints(points: import('@quar/types').PathPoint[]): {
  centeredPoints: import('@quar/types').PathPoint[];
  center: import('@quar/types').Vector2;
} {
  if (points.length === 0) {
    return { centeredPoints: [], center: { x: 0, y: 0 } };
  }

  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const p of points) {
    if (p.position.x < minX) minX = p.position.x;
    if (p.position.x > maxX) maxX = p.position.x;
    if (p.position.y < minY) minY = p.position.y;
    if (p.position.y > maxY) maxY = p.position.y;
  }

  const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };

  const centeredPoints = points.map((p) => ({
    ...p,
    position: { x: p.position.x - center.x, y: p.position.y - center.y },
    // Handles are relative offsets — no change needed
  }));

  return { centeredPoints, center };
}

/**
 * Build a Quar Transform for a centered path node.
 * Position is at the computed center, anchor is (0.5, 0.5).
 * SVG transforms are applied on top.
 */
function buildCenteredPathTransform(
  center: import('@quar/types').Vector2,
  svgTransformAttr: string | undefined,
  viewBoxHeight: number
): Transform {
  const transform = createDefaultTransform();
  // Anchor at center — matches rectangle/ellipse pattern
  transform.anchor = { x: 0.5, y: 0.5 };

  if (svgTransformAttr) {
    // `center` is already in Y-up space, so reconstruct the SVG-space center Y
    // before applying the matrix, then flip back. Same center-through-matrix fix
    // as buildTransform (reduces to the old center+translation for translate).
    const m = parseSvgTransformToMatrix(svgTransformAttr);
    const [a, b, c, d, tx, ty] = m;
    const cySvg = viewBoxHeight - center.y;
    const tX = a * center.x + c * cySvg + tx;
    const tYsvg = b * center.x + d * cySvg + ty;
    transform.position = { x: tX, y: viewBoxHeight - tYsvg };
    const dec = decomposeMatrix(m);
    transform.rotation = -dec.rotation;
    transform.scale = dec.scale;
    transform.skew = dec.skew;
  } else {
    transform.position = { x: center.x, y: center.y };
  }

  return transform;
}

// ============================================================================
// Transform Building
// ============================================================================

/**
 * Build a Quar Transform for a shape with a known center point.
 * Applies SVG transform on top of the center position.
 */
function buildTransform(
  centerX: number,
  centerY: number,
  svgTransformAttr: string | undefined,
  viewBoxHeight: number
): Transform {
  const transform = createDefaultTransform();

  if (svgTransformAttr) {
    // Transform the center THROUGH the full affine matrix. rotate/scale/matrix
    // have non-identity linear parts that move the center even when their
    // translation is 0 — the old code added only the decomposed translation, so
    // a rotated/scaled shape stayed at its untransformed spot. (Reduces exactly
    // to center+translation for pure-translate.)
    const m = parseSvgTransformToMatrix(svgTransformAttr);
    const [a, b, c, d, tx, ty] = m;
    const tCx = a * centerX + c * centerY + tx;
    const tCy = b * centerX + d * centerY + ty;
    transform.position = { x: tCx, y: viewBoxHeight - tCy };
    const dec = decomposeMatrix(m);
    transform.rotation = -dec.rotation; // SVG clockwise → Quar counterclockwise
    transform.scale = dec.scale;
    transform.skew = dec.skew;
  } else {
    transform.position = { x: centerX, y: viewBoxHeight - centerY };
  }

  return transform;
}

// buildPathTransform removed — all paths now use buildCenteredPathTransform for proper rotation

// ============================================================================
// Fill / Stroke Conversion
// ============================================================================

/**
 * Where a shape sits in its SVG user space, for placing its gradients: the
 * user point at the shape's local origin (local Y runs up, SVG Y down), and
 * its local bounds — what the renderer spreads a gradient over.
 */
interface GradientFrame {
  origin: Vector2;
  bounds: () => [number, number, number, number];
}

type ShapeNode = RectangleNode | EllipseNode | PathNode;

/** The user point at the local origin of a path centered on `center` (already Y-flipped). */
function flippedOrigin(center: Vector2, ctx: ConvertContext): Vector2 {
  return { x: center.x, y: ctx.viewBoxHeight - center.y };
}

/** Give a converted shape its fills and strokes, gradients placed on it. */
function paintShape(
  node: ShapeNode,
  style: ResolvedStyle,
  origin: Vector2,
  ctx: ConvertContext,
  filled = true
): void {
  let bounds: [number, number, number, number] | null = null;
  const frame: GradientFrame = {
    origin,
    bounds: () => (bounds ??= getNodeLocalBounds(node)),
  };
  node.fills = filled ? convertFills(style, ctx.defs, frame) : [];
  node.strokes = convertStrokes(style, ctx.defs, frame);
}

function convertFills(style: ResolvedStyle, defs: SvgDefs, frame: GradientFrame): Fill[] {
  if (!style.fill) return [];

  // Check for gradient reference
  const gradRef = parseUrlRef(style.fill);
  if (gradRef) {
    const gradient = defs.gradients.get(gradRef);
    if (gradient) {
      return [
        {
          type: 'gradient',
          gradient: convertGradient(gradient, frame),
          opacity: style.fillOpacity,
          visible: true,
        },
      ];
    }
  }

  // Solid color
  const color = parseSvgColor(paintColor(style.fill, style));
  if (!color) return [];

  return [
    {
      type: 'solid',
      color,
      opacity: style.fillOpacity,
      visible: true,
    },
  ];
}

function convertStrokes(style: ResolvedStyle, defs: SvgDefs, frame: GradientFrame): Stroke[] {
  if (!style.stroke || style.strokeWidth <= 0) return [];

  const color = parseSvgColor(paintColor(style.stroke, style)) ?? { r: 0, g: 0, b: 0, a: 1 };

  // Check for gradient stroke
  let gradient: Gradient | undefined;
  const gradRef = parseUrlRef(style.stroke);
  if (gradRef) {
    const g = defs.gradients.get(gradRef);
    if (g) gradient = convertGradient(g, frame);
  }

  return [
    {
      color,
      width: style.strokeWidth,
      opacity: style.strokeOpacity,
      cap: style.strokeLinecap,
      join: style.strokeLinejoin,
      miterLimit: style.strokeMiterlimit,
      dashArray: style.strokeDasharray ?? undefined,
      dashOffset: style.strokeDashoffset || undefined,
      gradient,
      visible: true,
      align: 'center',
    },
  ];
}

type Affine = ReturnType<typeof parseSvgTransformToMatrix>;

function applyAffine(m: Affine, p: Vector2): Vector2 {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
}

/**
 * The map from a gradient's own coordinates to the shape's normalized bounds
 * (0–1, Y up), which is where Quar keeps gradient positions. Bounding-box
 * units are fractions of the shape's box from its top-left; user-space units
 * are SVG coordinates. The gradientTransform comes first in either case.
 */
function gradientToBounds(g: ParsedGradient, frame: GradientFrame): Affine {
  let toBounds: Affine;
  if (g.gradientUnits === 'userSpaceOnUse') {
    const [minX, minY, maxX, maxY] = frame.bounds();
    const w = maxX - minX || 1;
    const h = maxY - minY || 1;
    // local = (x - origin.x, origin.y - y), then normalized by the bounds
    toBounds = [1 / w, 0, 0, -1 / h, (-frame.origin.x - minX) / w, (frame.origin.y - minY) / h];
  } else {
    toBounds = [1, 0, 0, -1, 0, 1];
  }
  if (!g.gradientTransform) return toBounds;
  const t = parseSvgTransformToMatrix(g.gradientTransform);
  return [
    toBounds[0] * t[0] + toBounds[2] * t[1],
    toBounds[1] * t[0] + toBounds[3] * t[1],
    toBounds[0] * t[2] + toBounds[2] * t[3],
    toBounds[1] * t[2] + toBounds[3] * t[3],
    toBounds[0] * t[4] + toBounds[2] * t[5] + toBounds[4],
    toBounds[1] * t[4] + toBounds[3] * t[5] + toBounds[5],
  ];
}

/**
 * A linear gradient from `start` to `end` (gradient coordinates) as start/end
 * points in normalized bounds. The ramp is worked out as a function of the
 * normalized position, so its bands keep their true direction even where the
 * map stretches one axis more than the other. Null when it has no direction.
 */
function linearInBounds(
  m: Affine,
  start: Vector2,
  end: Vector2
): { start: Vector2; end: Vector2 } | null {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lenSq = dx * dx + dy * dy;
  const det = m[0] * m[3] - m[1] * m[2];
  if (lenSq < 1e-12 || Math.abs(det) < 1e-12) return null;
  // t(q) = g·q + c, from t(p) = (p - start)·d / |d|² with p = m⁻¹(q)
  const gx = (m[3] * dx - m[1] * dy) / det / lenSq;
  const gy = (-m[2] * dx + m[0] * dy) / det / lenSq;
  const c = -(m[4] * gx + m[5] * gy) - (start.x * dx + start.y * dy) / lenSq;
  const gSq = gx * gx + gy * gy;
  if (gSq < 1e-12) return null;
  const s = { x: (-c * gx) / gSq, y: (-c * gy) / gSq };
  return { start: s, end: { x: s.x + gx / gSq, y: s.y + gy / gSq } };
}

function convertGradient(g: ParsedGradient, frame: GradientFrame): Gradient {
  const stops: GradientStop[] = g.stops.map((s) => ({
    offset: s.offset,
    color: s.color,
  }));
  const m = gradientToBounds(g, frame);

  if (g.type === 'linear') {
    const points = linearInBounds(
      m,
      { x: g.x1 ?? 0, y: g.y1 ?? 0 },
      { x: g.x2 ?? 1, y: g.y2 ?? 0 }
    );
    if (!points) {
      // No direction: SVG paints the whole shape the last stop's color
      const last = stops[stops.length - 1];
      return {
        type: 'linear',
        stops: last
          ? [
              { ...last, offset: 0 },
              { ...last, offset: 1 },
            ]
          : stops,
        start: { x: 0, y: 0.5 },
        end: { x: 1, y: 0.5 },
      };
    }
    return { type: 'linear', stops, ...points };
  }

  // Quar's radial gradients are circles in normalized bounds: a circle the
  // map stretches unevenly keeps its area. The focal point (fx, fy) defaults
  // to the center, so only one set apart is kept.
  const det = m[0] * m[3] - m[1] * m[2];
  const cx = g.cx ?? 0.5;
  const cy = g.cy ?? 0.5;
  const radial: Gradient = {
    type: 'radial',
    stops,
    center: applyAffine(m, { x: cx, y: cy }),
    radius: (g.r ?? 0.5) * Math.sqrt(Math.abs(det)),
  };
  const fx = g.fx ?? cx;
  const fy = g.fy ?? cy;
  if (fx !== cx || fy !== cy) radial.focal = applyAffine(m, { x: fx, y: fy });
  return radial;
}
