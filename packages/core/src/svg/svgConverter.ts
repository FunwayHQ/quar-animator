/**
 * SVG Converter
 * Converts parsed SVG elements to Quar node types.
 */

import type {
  Node, GroupNode, RectangleNode, EllipseNode, PathNode,
  Fill, Stroke, Color, Gradient, GradientStop, Transform, Vector2,
} from '@quar/types';
import { createDefaultTransform } from '../SceneGraph';
import { parseSvgTransform, parseSvgColor, parseUrlRef, type ResolvedStyle } from './svgUtils';
import { parseSvgPath } from './svgPathParser';
import type {
  ParsedSvg, SvgElement, SvgRect, SvgEllipse, SvgCircle,
  SvgLine, SvgPolygon, SvgPolyline, SvgPath, SvgGroup,
  SvgDefs, ParsedGradient,
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
  generateId: () => string,
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

  return { nodes: allNodes, rootIds };
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

function convertElement(element: SvgElement, ctx: ConvertContext): Node[] {
  switch (element.tag) {
    case 'rect': return [convertRect(element, ctx)];
    case 'ellipse': return [convertEllipse(element, ctx)];
    case 'circle': return [convertCircle(element, ctx)];
    case 'line': return [convertLine(element, ctx)];
    case 'polygon': return [convertPolygon(element, ctx)];
    case 'polyline': return [convertPolyline(element, ctx)];
    case 'path': return convertPath(element, ctx);
    case 'g': return [convertGroup(element, ctx)];
    default: return [];
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
    name: el.id || 'Rectangle',
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
    fills: convertFills(el.style, ctx.defs),
    strokes: convertStrokes(el.style, ctx.defs),
  };

  ctx.allNodes.push(node);
  return node;
}

function convertEllipse(el: SvgEllipse, ctx: ConvertContext): EllipseNode {
  const transform = buildTransform(el.cx, el.cy, el.transform, ctx.viewBoxHeight);

  const node: EllipseNode = {
    id: ctx.generateId(),
    name: el.id || 'Ellipse',
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
    fills: convertFills(el.style, ctx.defs),
    strokes: convertStrokes(el.style, ctx.defs),
  };

  ctx.allNodes.push(node);
  return node;
}

function convertCircle(el: SvgCircle, ctx: ConvertContext): EllipseNode {
  const transform = buildTransform(el.cx, el.cy, el.transform, ctx.viewBoxHeight);

  const node: EllipseNode = {
    id: ctx.generateId(),
    name: el.id || 'Circle',
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
    fills: convertFills(el.style, ctx.defs),
    strokes: convertStrokes(el.style, ctx.defs),
  };

  ctx.allNodes.push(node);
  return node;
}

function convertLine(el: SvgLine, ctx: ConvertContext): PathNode {
  const transform = buildPathTransform(el.transform, ctx.viewBoxHeight);

  const node: PathNode = {
    id: ctx.generateId(),
    name: el.id || 'Line',
    type: 'path',
    parent: null,
    children: [],
    transform,
    visible: true,
    locked: false,
    opacity: el.style.opacity,
    blendMode: 'normal',
    points: [
      { position: { x: el.x1, y: ctx.viewBoxHeight - el.y1 }, handleIn: null, handleOut: null, type: 'corner' },
      { position: { x: el.x2, y: ctx.viewBoxHeight - el.y2 }, handleIn: null, handleOut: null, type: 'corner' },
    ],
    closed: false,
    fills: [],
    strokes: convertStrokes(el.style, ctx.defs),
  };

  ctx.allNodes.push(node);
  return node;
}

function convertPolygon(el: SvgPolygon, ctx: ConvertContext): PathNode {
  const transform = buildPathTransform(el.transform, ctx.viewBoxHeight);

  const points = el.points.map(p => ({
    position: { x: p.x, y: ctx.viewBoxHeight - p.y },
    handleIn: null,
    handleOut: null,
    type: 'corner' as const,
  }));

  const node: PathNode = {
    id: ctx.generateId(),
    name: el.id || 'Polygon',
    type: 'path',
    parent: null,
    children: [],
    transform,
    visible: true,
    locked: false,
    opacity: el.style.opacity,
    blendMode: 'normal',
    points,
    closed: true,
    fills: convertFills(el.style, ctx.defs),
    strokes: convertStrokes(el.style, ctx.defs),
  };

  ctx.allNodes.push(node);
  return node;
}

function convertPolyline(el: SvgPolyline, ctx: ConvertContext): PathNode {
  const transform = buildPathTransform(el.transform, ctx.viewBoxHeight);

  const points = el.points.map(p => ({
    position: { x: p.x, y: ctx.viewBoxHeight - p.y },
    handleIn: null,
    handleOut: null,
    type: 'corner' as const,
  }));

  const node: PathNode = {
    id: ctx.generateId(),
    name: el.id || 'Polyline',
    type: 'path',
    parent: null,
    children: [],
    transform,
    visible: true,
    locked: false,
    opacity: el.style.opacity,
    blendMode: 'normal',
    points,
    closed: false,
    fills: [],
    strokes: convertStrokes(el.style, ctx.defs),
  };

  ctx.allNodes.push(node);
  return node;
}

function convertPath(el: SvgPath, ctx: ConvertContext): PathNode[] {
  const subpaths = parseSvgPath(el.d);
  const nodes: PathNode[] = [];

  for (const subpath of subpaths) {
    if (subpath.points.length < 2) continue;

    const transform = buildPathTransform(el.transform, ctx.viewBoxHeight);

    // Flip Y for all points and handles
    const points = subpath.points.map(p => ({
      position: { x: p.position.x, y: ctx.viewBoxHeight - p.position.y },
      handleIn: p.handleIn ? { x: p.handleIn.x, y: -p.handleIn.y } : null,
      handleOut: p.handleOut ? { x: p.handleOut.x, y: -p.handleOut.y } : null,
      type: p.type,
    }));

    const node: PathNode = {
      id: ctx.generateId(),
      name: el.id || 'Path',
      type: 'path',
      parent: null,
      children: [],
      transform,
      visible: true,
      locked: false,
      opacity: el.style.opacity,
      blendMode: 'normal',
      points,
      closed: subpath.closed,
      fills: subpath.closed ? convertFills(el.style, ctx.defs) : [],
      strokes: convertStrokes(el.style, ctx.defs),
    };

    ctx.allNodes.push(node);
    nodes.push(node);
  }

  return nodes;
}

function convertGroup(el: SvgGroup, ctx: ConvertContext): GroupNode {
  const svgTransform = el.transform ? parseSvgTransform(el.transform) : createDefaultTransform();
  // Flip Y for group transform position
  if (el.transform) {
    svgTransform.position.y = ctx.viewBoxHeight - svgTransform.position.y;
  }

  const group: GroupNode = {
    id: ctx.generateId(),
    name: el.id || 'Group',
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
    const svgTransform = parseSvgTransform(svgTransformAttr);
    // The SVG transform applies to the element's coordinate system.
    // We need to transform the center point through it.
    // For simple translate, rotate, scale: apply to center position.
    transform.position = {
      x: centerX + svgTransform.position.x,
      y: viewBoxHeight - (centerY + svgTransform.position.y),
    };
    transform.rotation = -svgTransform.rotation; // SVG clockwise → Quar counterclockwise
    transform.scale = svgTransform.scale;
    transform.skew = svgTransform.skew;
  } else {
    transform.position = { x: centerX, y: viewBoxHeight - centerY };
  }

  return transform;
}

/**
 * Build a Quar Transform for a path node.
 * Paths use anchor (0, 0), so the SVG transform only applies as-is.
 */
function buildPathTransform(
  svgTransformAttr: string | undefined,
  viewBoxHeight: number
): Transform {
  const transform = createDefaultTransform();
  transform.anchor = { x: 0, y: 0 };

  if (svgTransformAttr) {
    const svgTransform = parseSvgTransform(svgTransformAttr);
    transform.position = {
      x: svgTransform.position.x,
      y: -svgTransform.position.y, // Flip Y translation
    };
    transform.rotation = -svgTransform.rotation;
    transform.scale = svgTransform.scale;
    transform.skew = svgTransform.skew;
  }

  return transform;
}

// ============================================================================
// Fill / Stroke Conversion
// ============================================================================

function convertFills(style: ResolvedStyle, defs: SvgDefs): Fill[] {
  if (!style.fill) return [];

  // Check for gradient reference
  const gradRef = parseUrlRef(style.fill);
  if (gradRef) {
    const gradient = defs.gradients.get(gradRef);
    if (gradient) {
      return [{
        type: 'gradient',
        gradient: convertGradient(gradient),
        opacity: style.fillOpacity,
        visible: true,
      }];
    }
  }

  // Solid color
  const color = parseSvgColor(style.fill);
  if (!color) return [];

  return [{
    type: 'solid',
    color,
    opacity: style.fillOpacity,
    visible: true,
  }];
}

function convertStrokes(style: ResolvedStyle, defs: SvgDefs): Stroke[] {
  if (!style.stroke || style.strokeWidth <= 0) return [];

  const color = parseSvgColor(style.stroke) ?? { r: 0, g: 0, b: 0, a: 1 };

  // Check for gradient stroke
  let gradient: Gradient | undefined;
  const gradRef = parseUrlRef(style.stroke);
  if (gradRef) {
    const g = defs.gradients.get(gradRef);
    if (g) gradient = convertGradient(g);
  }

  return [{
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
  }];
}

function convertGradient(g: ParsedGradient): Gradient {
  const stops: GradientStop[] = g.stops.map(s => ({
    offset: s.offset,
    color: s.color,
  }));

  if (g.type === 'linear') {
    return {
      type: 'linear',
      stops,
      start: { x: g.x1 ?? 0, y: g.y1 ?? 0 },
      end: { x: g.x2 ?? 1, y: g.y2 ?? 0 },
    };
  }

  return {
    type: 'radial',
    stops,
    center: { x: g.cx ?? 0.5, y: g.cy ?? 0.5 },
    radius: g.r ?? 0.5,
  };
}
