/**
 * SVG Exporter for Quar Animator
 * Converts Quar scene nodes into SVG markup for export.
 */

import type {
  Node,
  PathNode,
  RectangleNode,
  EllipseNode,
  PolygonNode,
  GroupNode,
  TextNode,
  ImageNode,
  PathPoint,
  Color,
  Fill,
  Stroke,
  Gradient,
  GradientStop,
  Transform,
} from '@quar/types';
import {
  forEachSegment,
  getAbsoluteControlPoints,
  createPolygonPath,
  createStarPath,
} from '../path/pathUtils';
import type { SceneGraph } from '../SceneGraph';

// ============================================================================
// Color Helpers
// ============================================================================

function colorToHex(color: Color): string {
  const r = Math.round(Math.max(0, Math.min(255, color.r)))
    .toString(16)
    .padStart(2, '0');
  const g = Math.round(Math.max(0, Math.min(255, color.g)))
    .toString(16)
    .padStart(2, '0');
  const b = Math.round(Math.max(0, Math.min(255, color.b)))
    .toString(16)
    .padStart(2, '0');
  return `#${r}${g}${b}`;
}

// ============================================================================
// SVG Path Commands
// ============================================================================

/**
 * Convert PathPoint array to SVG path `d` attribute string.
 * Coordinates are in local space (no Y-flip here — handled at SVG root).
 */
export function pathPointsToSvgD(points: PathPoint[], closed: boolean): string {
  if (points.length === 0) return '';

  const parts: string[] = [];
  const p0 = points[0]!;
  parts.push(`M${fmt(p0.position.x)},${fmt(p0.position.y)}`);

  forEachSegment(points, closed, (from, to) => {
    const { cp1, cp2 } = getAbsoluteControlPoints(from, to);
    const isLinear =
      cp1.x === from.position.x &&
      cp1.y === from.position.y &&
      cp2.x === to.position.x &&
      cp2.y === to.position.y;

    if (isLinear) {
      parts.push(`L${fmt(to.position.x)},${fmt(to.position.y)}`);
    } else {
      parts.push(
        `C${fmt(cp1.x)},${fmt(cp1.y)} ${fmt(cp2.x)},${fmt(cp2.y)} ${fmt(to.position.x)},${fmt(to.position.y)}`
      );
    }
  });

  if (closed) parts.push('Z');
  return parts.join('');
}

function fmt(n: number): string {
  return Number(n.toFixed(3)).toString();
}

// ============================================================================
// Fill & Stroke Attributes
// ============================================================================

let _defsIdCounter = 0;

function resetDefsCounter(): void {
  _defsIdCounter = 0;
}

function nextDefsId(prefix: string): string {
  return `${prefix}_${++_defsIdCounter}`;
}

function gradientStopToSvg(stop: GradientStop): string {
  const color = colorToHex(stop.color);
  const opacity =
    stop.color.a !== undefined && stop.color.a < 1 ? ` stop-opacity="${fmt(stop.color.a)}"` : '';
  return `<stop offset="${fmt(stop.offset)}" stop-color="${color}"${opacity}/>`;
}

function gradientToSvgDef(gradient: Gradient, id: string): string {
  const stops = gradient.stops.map(gradientStopToSvg).join('');

  if (gradient.type === 'linear') {
    const x1 = gradient.start ? fmt(gradient.start.x * 100) + '%' : '0%';
    const y1 = gradient.start ? fmt(gradient.start.y * 100) + '%' : '0%';
    const x2 = gradient.end ? fmt(gradient.end.x * 100) + '%' : '100%';
    const y2 = gradient.end ? fmt(gradient.end.y * 100) + '%' : '0%';
    return `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops}</linearGradient>`;
  }

  if (gradient.type === 'radial') {
    const cx = gradient.center ? fmt(gradient.center.x * 100) + '%' : '50%';
    const cy = gradient.center ? fmt(gradient.center.y * 100) + '%' : '50%';
    const r = gradient.radius != null ? fmt(gradient.radius * 100) + '%' : '50%';
    return `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">${stops}</radialGradient>`;
  }

  // Fallback: treat conic or unknown as linear
  return `<linearGradient id="${id}">${stops}</linearGradient>`;
}

/**
 * Build SVG fill attributes from a Fill. Returns [attrs string, optional defs element].
 */
export function fillToSvgAttrs(fill: Fill | undefined, defs: string[]): string {
  if (!fill || fill.type === 'none' || !fill.visible) {
    return 'fill="none"';
  }

  if (fill.type === 'solid' && fill.color) {
    const hex = colorToHex(fill.color);
    const opacity = fill.opacity * (fill.color.a ?? 1);
    const opacityAttr = opacity < 1 ? ` fill-opacity="${fmt(opacity)}"` : '';
    return `fill="${hex}"${opacityAttr}`;
  }

  if (fill.type === 'gradient' && fill.gradient) {
    const id = nextDefsId('grad');
    defs.push(gradientToSvgDef(fill.gradient, id));
    const opacityAttr = fill.opacity < 1 ? ` fill-opacity="${fmt(fill.opacity)}"` : '';
    return `fill="url(#${id})"${opacityAttr}`;
  }

  return 'fill="none"';
}

/**
 * Build SVG stroke attributes from a Stroke. Returns [attrs string, optional defs element].
 */
export function strokeToSvgAttrs(stroke: Stroke | undefined, defs: string[]): string {
  if (!stroke || !stroke.visible || stroke.width <= 0) {
    return '';
  }

  const parts: string[] = [];

  if (stroke.gradient) {
    const id = nextDefsId('sgrad');
    defs.push(gradientToSvgDef(stroke.gradient, id));
    parts.push(`stroke="url(#${id})"`);
  } else {
    parts.push(`stroke="${colorToHex(stroke.color)}"`);
  }

  parts.push(`stroke-width="${fmt(stroke.width)}"`);

  const opacity = stroke.opacity * (stroke.color.a ?? 1);
  if (opacity < 1) {
    parts.push(`stroke-opacity="${fmt(opacity)}"`);
  }

  if (stroke.cap && stroke.cap !== 'butt') {
    parts.push(`stroke-linecap="${stroke.cap}"`);
  }

  if (stroke.join && stroke.join !== 'miter') {
    parts.push(`stroke-linejoin="${stroke.join}"`);
  }

  if (stroke.dashArray && stroke.dashArray.length > 0) {
    parts.push(`stroke-dasharray="${stroke.dashArray.map(fmt).join(' ')}"`);
    if (stroke.dashOffset) {
      parts.push(`stroke-dashoffset="${fmt(stroke.dashOffset)}"`);
    }
  }

  return parts.join(' ');
}

// ============================================================================
// Transform
// ============================================================================

/**
 * Build SVG transform attribute from a Transform.
 */
export function transformToSvgAttr(transform: Transform): string {
  const parts: string[] = [];

  if (transform.position.x !== 0 || transform.position.y !== 0) {
    parts.push(`translate(${fmt(transform.position.x)},${fmt(transform.position.y)})`);
  }

  if (transform.rotation !== 0) {
    parts.push(`rotate(${fmt(transform.rotation)})`);
  }

  if (transform.scale.x !== 1 || transform.scale.y !== 1) {
    parts.push(`scale(${fmt(transform.scale.x)},${fmt(transform.scale.y)})`);
  }

  return parts.length > 0 ? ` transform="${parts.join(' ')}"` : '';
}

// ============================================================================
// Node → SVG Element
// ============================================================================

/**
 * Convert a single node to an SVG element string.
 * Recursive for groups.
 */
export function nodeToSvgElement(node: Node, sceneGraph: SceneGraph, defs: string[]): string {
  switch (node.type) {
    case 'rectangle':
      return rectangleToSvg(node, defs);
    case 'ellipse':
      return ellipseToSvg(node, defs);
    case 'polygon':
      return polygonToSvg(node, defs);
    case 'path':
      return pathToSvg(node, defs);
    case 'text':
      return textToSvg(node, defs);
    case 'image':
      return imageToSvg(node, defs);
    case 'group':
      return groupToSvg(node, sceneGraph, defs);
    case 'bone':
    case 'ik-target':
      return ''; // Non-visual nodes
    default:
      return '';
  }
}

function rectangleToSvg(node: RectangleNode, defs: string[]): string {
  const fillAttr = fillToSvgAttrs(node.fills[0], defs);
  const strokeAttr = strokeToSvgAttrs(node.strokes[0], defs);
  const tfAttr = transformToSvgAttr(node.transform);
  const opacityAttr = node.opacity < 1 ? ` opacity="${fmt(node.opacity)}"` : '';

  // Anchor offset: rectangle uses anchor (0.5, 0.5) typically
  const anchorX = node.transform.anchor.x * node.width;
  const anchorY = node.transform.anchor.y * node.height;

  const [tl, tr, br, bl] = node.cornerRadius;
  const hasUniformRadius = tl === tr && tr === br && br === bl && tl > 0;
  const hasPerVertexRadius = !hasUniformRadius && (tl > 0 || tr > 0 || br > 0 || bl > 0);

  let rxRy = '';
  if (hasUniformRadius) {
    rxRy = ` rx="${fmt(tl)}" ry="${fmt(tl)}"`;
  }

  if (hasPerVertexRadius) {
    // SVG <rect> doesn't support per-corner radius natively; use a <path> instead
    const d = roundedRectPath(node.width, node.height, tl, tr, br, bl, anchorX, anchorY);
    return `<path d="${d}" ${fillAttr}${strokeAttr ? ' ' + strokeAttr : ''}${tfAttr}${opacityAttr}/>`;
  }

  return `<rect x="${fmt(-anchorX)}" y="${fmt(-anchorY)}" width="${fmt(node.width)}" height="${fmt(node.height)}"${rxRy} ${fillAttr}${strokeAttr ? ' ' + strokeAttr : ''}${tfAttr}${opacityAttr}/>`;
}

function roundedRectPath(
  w: number,
  h: number,
  tl: number,
  tr: number,
  br: number,
  bl: number,
  ax: number,
  ay: number
): string {
  const x = -ax;
  const y = -ay;
  return [
    `M${fmt(x + tl)},${fmt(y)}`,
    `L${fmt(x + w - tr)},${fmt(y)}`,
    tr > 0 ? `A${fmt(tr)},${fmt(tr)} 0 0 1 ${fmt(x + w)},${fmt(y + tr)}` : '',
    `L${fmt(x + w)},${fmt(y + h - br)}`,
    br > 0 ? `A${fmt(br)},${fmt(br)} 0 0 1 ${fmt(x + w - br)},${fmt(y + h)}` : '',
    `L${fmt(x + bl)},${fmt(y + h)}`,
    bl > 0 ? `A${fmt(bl)},${fmt(bl)} 0 0 1 ${fmt(x)},${fmt(y + h - bl)}` : '',
    `L${fmt(x)},${fmt(y + tl)}`,
    tl > 0 ? `A${fmt(tl)},${fmt(tl)} 0 0 1 ${fmt(x + tl)},${fmt(y)}` : '',
    'Z',
  ]
    .filter(Boolean)
    .join('');
}

function ellipseToSvg(node: EllipseNode, defs: string[]): string {
  const fillAttr = fillToSvgAttrs(node.fills[0], defs);
  const strokeAttr = strokeToSvgAttrs(node.strokes[0], defs);
  const tfAttr = transformToSvgAttr(node.transform);
  const opacityAttr = node.opacity < 1 ? ` opacity="${fmt(node.opacity)}"` : '';

  // Ellipse center: anchor-based offset
  const cx = node.radiusX * (1 - 2 * node.transform.anchor.x);
  const cy = node.radiusY * (1 - 2 * node.transform.anchor.y);

  return `<ellipse cx="${fmt(cx)}" cy="${fmt(cy)}" rx="${fmt(node.radiusX)}" ry="${fmt(node.radiusY)}" ${fillAttr}${strokeAttr ? ' ' + strokeAttr : ''}${tfAttr}${opacityAttr}/>`;
}

function polygonToSvg(node: PolygonNode, defs: string[]): string {
  const fillAttr = fillToSvgAttrs(node.fills[0], defs);
  const strokeAttr = strokeToSvgAttrs(node.strokes[0], defs);
  const tfAttr = transformToSvgAttr(node.transform);
  const opacityAttr = node.opacity < 1 ? ` opacity="${fmt(node.opacity)}"` : '';

  let points: PathPoint[];
  if (node.innerRadius != null && node.innerRadius > 0) {
    points = createStarPath(
      0,
      0,
      node.radius,
      node.innerRadius,
      node.sides,
      Math.PI / 2,
      node.cornerRadius
    );
  } else {
    points = createPolygonPath(0, 0, node.radius, node.sides, Math.PI / 2, node.cornerRadius);
  }

  const d = pathPointsToSvgD(points, true);
  return `<path d="${d}" ${fillAttr}${strokeAttr ? ' ' + strokeAttr : ''}${tfAttr}${opacityAttr}/>`;
}

function pathToSvg(node: PathNode, defs: string[]): string {
  const fillAttr = fillToSvgAttrs(node.fills[0], defs);
  const strokeAttr = strokeToSvgAttrs(node.strokes[0], defs);
  const tfAttr = transformToSvgAttr(node.transform);
  const opacityAttr = node.opacity < 1 ? ` opacity="${fmt(node.opacity)}"` : '';

  // Build d from primary contour + subpaths
  let d = pathPointsToSvgD(node.points, node.closed);
  if (node.subpaths) {
    for (const sp of node.subpaths) {
      d += ' ' + pathPointsToSvgD(sp, true);
    }
  }

  const fillRule = node.fillRule === 'evenodd' ? ' fill-rule="evenodd"' : '';

  return `<path d="${d}"${fillRule} ${fillAttr}${strokeAttr ? ' ' + strokeAttr : ''}${tfAttr}${opacityAttr}/>`;
}

function textToSvg(node: TextNode, defs: string[]): string {
  const fillAttr = fillToSvgAttrs(node.fills[0], defs);
  const strokeAttr = strokeToSvgAttrs(node.strokes[0], defs);
  const tfAttr = transformToSvgAttr(node.transform);
  const opacityAttr = node.opacity < 1 ? ` opacity="${fmt(node.opacity)}"` : '';

  const fontAttrs = [`font-family="${escapeXml(node.fontFamily)}"`, `font-size="${node.fontSize}"`];
  if (node.fontWeight !== 400) fontAttrs.push(`font-weight="${node.fontWeight}"`);
  if (node.fontStyle !== 'normal') fontAttrs.push(`font-style="${node.fontStyle}"`);
  if (node.textAlign !== 'left')
    fontAttrs.push(`text-anchor="${textAlignToAnchor(node.textAlign)}"`);
  if (node.letterSpacing !== 0) fontAttrs.push(`letter-spacing="${fmt(node.letterSpacing)}"`);

  const content = escapeXml(node.content);
  return `<text ${fontAttrs.join(' ')} ${fillAttr}${strokeAttr ? ' ' + strokeAttr : ''}${tfAttr}${opacityAttr}>${content}</text>`;
}

function textAlignToAnchor(align: string): string {
  if (align === 'center') return 'middle';
  if (align === 'right') return 'end';
  return 'start';
}

function imageToSvg(node: ImageNode, _defs: string[]): string {
  const tfAttr = transformToSvgAttr(node.transform);
  const opacityAttr = node.opacity < 1 ? ` opacity="${fmt(node.opacity)}"` : '';

  const anchorX = node.transform.anchor.x * node.width;
  const anchorY = node.transform.anchor.y * node.height;

  return `<image x="${fmt(-anchorX)}" y="${fmt(-anchorY)}" width="${fmt(node.width)}" height="${fmt(node.height)}" href="${escapeXml(node.src)}"${tfAttr}${opacityAttr}/>`;
}

function groupToSvg(node: GroupNode, sceneGraph: SceneGraph, defs: string[]): string {
  const tfAttr = transformToSvgAttr(node.transform);
  const opacityAttr = node.opacity < 1 ? ` opacity="${fmt(node.opacity)}"` : '';

  const childElements: string[] = [];
  for (const childId of node.children) {
    const child = sceneGraph.getNode(childId);
    if (child && child.visible) {
      childElements.push(nodeToSvgElement(child, sceneGraph, defs));
    }
  }

  return `<g${tfAttr}${opacityAttr}>${childElements.join('')}</g>`;
}

// ============================================================================
// Main Export Function
// ============================================================================

/**
 * Export an array of nodes to an SVG string.
 * Computes bounding box, applies Y-flip so the SVG renders correctly
 * (Quar uses Y-up, SVG uses Y-down).
 */
export function exportNodesToSvg(nodes: Node[], sceneGraph: SceneGraph): string {
  resetDefsCounter();

  // Compute combined bounds of all nodes
  const bounds = computeExportBounds(nodes, sceneGraph);
  if (!bounds) return '<svg xmlns="http://www.w3.org/2000/svg"></svg>';

  const { minX, minY, maxX, maxY } = bounds;
  const width = maxX - minX;
  const height = maxY - minY;

  const defs: string[] = [];
  const elements: string[] = [];

  for (const node of nodes) {
    if (!node.visible) continue;
    elements.push(nodeToSvgElement(node, sceneGraph, defs));
  }

  const defsBlock = defs.length > 0 ? `<defs>${defs.join('')}</defs>` : '';

  // Y-flip: SVG is Y-down, Quar is Y-up.
  // We apply scale(1,-1) and translate to flip coordinates.
  const flipTransform = `transform="scale(1,-1) translate(${fmt(-minX)},${fmt(-maxY)})"`;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmt(width)} ${fmt(height)}" width="${fmt(width)}" height="${fmt(height)}">`,
    defsBlock,
    `<g ${flipTransform}>`,
    elements.join(''),
    '</g>',
    '</svg>',
  ].join('');
}

// ============================================================================
// Bounds Computation
// ============================================================================

interface ExportBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function computeExportBounds(nodes: Node[], sceneGraph: SceneGraph): ExportBounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let found = false;

  for (const node of nodes) {
    if (!node.visible) continue;
    const b = getNodeWorldBounds(node, sceneGraph);
    if (b) {
      minX = Math.min(minX, b.minX);
      minY = Math.min(minY, b.minY);
      maxX = Math.max(maxX, b.maxX);
      maxY = Math.max(maxY, b.maxY);
      found = true;
    }
  }

  return found ? { minX, minY, maxX, maxY } : null;
}

function getNodeWorldBounds(node: Node, sceneGraph: SceneGraph): ExportBounds | null {
  const local = getLocalExtent(node, sceneGraph);
  if (!local) return null;

  const wt = sceneGraph.getWorldTransform(node.id);
  // Transform the 4 corners of the local extent through the world transform
  const corners = [
    { x: local.minX, y: local.minY },
    { x: local.maxX, y: local.minY },
    { x: local.maxX, y: local.maxY },
    { x: local.minX, y: local.maxY },
  ];

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const c of corners) {
    const tx = wt.a * c.x + wt.c * c.y + wt.tx;
    const ty = wt.b * c.x + wt.d * c.y + wt.ty;
    minX = Math.min(minX, tx);
    minY = Math.min(minY, ty);
    maxX = Math.max(maxX, tx);
    maxY = Math.max(maxY, ty);
  }

  return { minX, minY, maxX, maxY };
}

function getLocalExtent(node: Node, sceneGraph: SceneGraph): ExportBounds | null {
  switch (node.type) {
    case 'rectangle': {
      const ax = node.transform.anchor.x * node.width;
      const ay = node.transform.anchor.y * node.height;
      return { minX: -ax, minY: -ay, maxX: node.width - ax, maxY: node.height - ay };
    }
    case 'ellipse': {
      return { minX: -node.radiusX, minY: -node.radiusY, maxX: node.radiusX, maxY: node.radiusY };
    }
    case 'polygon': {
      const r = node.radius;
      return { minX: -r, minY: -r, maxX: r, maxY: r };
    }
    case 'path': {
      if (node.points.length === 0) return null;
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      for (const p of node.points) {
        minX = Math.min(minX, p.position.x);
        minY = Math.min(minY, p.position.y);
        maxX = Math.max(maxX, p.position.x);
        maxY = Math.max(maxY, p.position.y);
      }
      if (node.subpaths) {
        for (const sp of node.subpaths) {
          for (const p of sp) {
            minX = Math.min(minX, p.position.x);
            minY = Math.min(minY, p.position.y);
            maxX = Math.max(maxX, p.position.x);
            maxY = Math.max(maxY, p.position.y);
          }
        }
      }
      return { minX, minY, maxX, maxY };
    }
    case 'text': {
      // Approximate text bounds from font size
      const approxWidth = node.content.length * node.fontSize * 0.6;
      const approxHeight = node.fontSize * node.lineHeight;
      return { minX: 0, minY: -approxHeight, maxX: approxWidth, maxY: 0 };
    }
    case 'image': {
      const ax = node.transform.anchor.x * node.width;
      const ay = node.transform.anchor.y * node.height;
      return { minX: -ax, minY: -ay, maxX: node.width - ax, maxY: node.height - ay };
    }
    case 'group': {
      // Union of children world bounds, transformed back to group local
      let wMinX = Infinity,
        wMinY = Infinity,
        wMaxX = -Infinity,
        wMaxY = -Infinity;
      let found = false;
      for (const childId of node.children) {
        const child = sceneGraph.getNode(childId);
        if (!child || !child.visible) continue;
        const childBounds = getNodeWorldBounds(child, sceneGraph);
        if (childBounds) {
          wMinX = Math.min(wMinX, childBounds.minX);
          wMinY = Math.min(wMinY, childBounds.minY);
          wMaxX = Math.max(wMaxX, childBounds.maxX);
          wMaxY = Math.max(wMaxY, childBounds.maxY);
          found = true;
        }
      }
      if (!found) return null;
      // Transform world bounds back to group-local space by inverting the group's world transform
      const gwt = sceneGraph.getWorldTransform(node.id);
      const det = gwt.a * gwt.d - gwt.b * gwt.c;
      if (Math.abs(det) < 1e-10) return { minX: wMinX, minY: wMinY, maxX: wMaxX, maxY: wMaxY };
      const invDet = 1 / det;
      // Inverse affine: inv(M) * (p - t)
      const worldCorners = [
        { x: wMinX, y: wMinY },
        { x: wMaxX, y: wMinY },
        { x: wMaxX, y: wMaxY },
        { x: wMinX, y: wMaxY },
      ];
      let lMinX = Infinity,
        lMinY = Infinity,
        lMaxX = -Infinity,
        lMaxY = -Infinity;
      for (const c of worldCorners) {
        const dx = c.x - gwt.tx;
        const dy = c.y - gwt.ty;
        const lx = (gwt.d * dx - gwt.c * dy) * invDet;
        const ly = (-gwt.b * dx + gwt.a * dy) * invDet;
        lMinX = Math.min(lMinX, lx);
        lMinY = Math.min(lMinY, ly);
        lMaxX = Math.max(lMaxX, lx);
        lMaxY = Math.max(lMaxY, ly);
      }
      return { minX: lMinX, minY: lMinY, maxX: lMaxX, maxY: lMaxY };
    }
    default:
      return null;
  }
}

// ============================================================================
// XML Utilities
// ============================================================================

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
