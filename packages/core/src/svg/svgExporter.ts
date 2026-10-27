/**
 * SVG Exporter for Quar Animator
 * Converts Quar scene nodes into SVG markup for export.
 */

import type {
  BlendMode,
  Node,
  PathNode,
  RectangleNode,
  EllipseNode,
  PolygonNode,
  GroupNode,
  TextNode,
  ImageNode,
  ArtboardNode,
  SymbolInstanceNode,
  SymbolDefinition,
  PathPoint,
  Color,
  Effect,
  Fill,
  Stroke,
  Gradient,
  GradientStop,
  Matrix3,
  Transform,
} from '@quar/types';
import { trimPathToProgress } from '../path/pathReveal';
import { isDocumentImage } from '../rendering/imageSource';
import {
  forEachSegment,
  getAbsoluteControlPoints,
  createPolygonPath,
  createStarPath,
} from '../path/pathUtils';
import { resolveSymbolInstance, getResolvedRootNodes } from '../symbols/symbolResolver';
import { SceneGraph } from '../SceneGraph';
import { mat3 } from '../math';
import { nodeToPolygon, performBoolean } from '../boolean/booleanOps';
import { getTextBox } from '../font/textLayout';
import { getTextNodeBounds, getTextNodeLines } from '../font/textMetrics';
import { getTextLocalBounds } from '../font/textPlacement';
import { linearGradientFromAngle } from '../gradient/gradientUtils';
import { colorToHex as colorToUpperHex } from '../color/colorHex';

// ============================================================================
// Color Helpers
// ============================================================================

/** SVG colors are written in lower case: '#ff8000'. */
function colorToHex(color: Color): string {
  return colorToUpperHex(color).toLowerCase();
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
  const pct = (n: number) => fmt(n * 100) + '%';

  // Quar's normalized gradient Y runs up the shape, and so does SVG's
  // bounding-box Y here: every shape is drawn inside the root's scale(1,-1)
  if (gradient.type === 'radial') {
    const cx = gradient.center ? pct(gradient.center.x) : '50%';
    const cy = gradient.center ? pct(gradient.center.y) : '50%';
    const r = gradient.radius != null ? pct(gradient.radius) : '50%';
    const focal = gradient.focal
      ? ` fx="${pct(gradient.focal.x)}" fy="${pct(gradient.focal.y)}"`
      : '';
    return `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}"${focal}>${stops}</radialGradient>`;
  }

  // Linear: its ends, or — as the canvas does without them — its angle.
  // SVG has no conic gradient; one is drawn as a linear ramp at its angle.
  const fromAngle = linearGradientFromAngle(gradient.angle ?? 0);
  const start = (gradient.type === 'linear' && gradient.start) || fromAngle.start;
  const end = (gradient.type === 'linear' && gradient.end) || fromAngle.end;
  return `<linearGradient id="${id}" x1="${pct(start.x)}" y1="${pct(start.y)}" x2="${pct(end.x)}" y2="${pct(end.y)}">${stops}</linearGradient>`;
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

  // Only names SVG knows: a crafted file can hold any string here, and one
  // written as is could close the attribute and add markup of its own
  if (stroke.cap === 'round' || stroke.cap === 'square') {
    parts.push(`stroke-linecap="${stroke.cap}"`);
  }

  if (stroke.join === 'round' || stroke.join === 'bevel') {
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
/** The translate/rotate/scale part-string for a node transform (no wrapper), so
 *  text/image can append a local counter-flip. */
function transformParts(transform: Transform): string {
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

  return parts.join(' ');
}

export function transformToSvgAttr(transform: Transform): string {
  const parts = transformParts(transform);
  return parts ? ` transform="${parts}"` : '';
}

// ============================================================================
// Node → SVG Element
// ============================================================================

/**
 * Convert a single node to an SVG element string.
 * Recursive for groups.
 */
export function nodeToSvgElement(
  node: Node,
  sceneGraph: SceneGraph,
  defs: string[],
  symbolDefs?: Map<string, SymbolDefinition>
): string {
  return withEffects(node, nodeElement(node, sceneGraph, defs, symbolDefs), defs);
}

function nodeElement(
  node: Node,
  sceneGraph: SceneGraph,
  defs: string[],
  symbolDefs?: Map<string, SymbolDefinition>
): string {
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
      return groupToSvg(node, sceneGraph, defs, symbolDefs);
    case 'artboard':
      return artboardToSvg(node, sceneGraph, defs, symbolDefs);
    case 'symbol-instance':
      return symbolInstanceToSvg(node, defs, symbolDefs);
    case 'bone':
    case 'ik-target':
      return ''; // Non-visual nodes
    default:
      return '';
  }
}

// ============================================================================
// Effects and blending
// ============================================================================

/**
 * The blend modes written, all but normal. Only these: a crafted file can
 * hold any string as a blend mode, and one written as is could close the
 * style attribute and add markup of its own.
 */
const BLEND_MODES: ReadonlySet<string> = new Set<BlendMode>([
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'hard-light',
  'soft-light',
  'difference',
  'exclusion',
  'hue',
  'saturation',
  'color',
  'luminosity',
]);

/**
 * A node's drop shadows and layer blur as an SVG filter, and its blend mode,
 * on a group around it — drawn as the canvas draws them: blurs with
 * sigma = radius / 3 (the canvas's Gaussian), offsets in the node's parent
 * space (Y up under the root flip, so a negative offsetY falls below),
 * shadows behind the (possibly blurred) shape. The canvas doesn't draw
 * inner shadows or a shadow's spread yet, so neither is written.
 */
function withEffects(node: Node, element: string, defs: string[]): string {
  if (!element) return element;
  const effects = (node.effects ?? []).filter(
    (e): e is Effect => e.visible && (e.type === 'drop-shadow' || e.type === 'layer-blur')
  );
  const blend = BLEND_MODES.has(node.blendMode) ? node.blendMode : null;
  if (effects.length === 0 && !blend) return element;

  let filterAttr = '';
  if (effects.length > 0) {
    const id = nextDefsId('fx');
    const primitives: string[] = [];
    const merge: string[] = [];
    let shape = 'SourceGraphic';
    effects.forEach((effect, i) => {
      if (effect.type === 'drop-shadow') {
        const sigma = fmt(Math.max(effect.blur, 0) / 3);
        const opacity = fmt(effect.opacity * (effect.color.a ?? 1));
        primitives.push(
          `<feGaussianBlur in="SourceAlpha" stdDeviation="${sigma}" result="b${i}"/>`,
          `<feOffset in="b${i}" dx="${fmt(effect.offsetX)}" dy="${fmt(effect.offsetY)}" result="o${i}"/>`,
          `<feFlood flood-color="${colorToHex(effect.color)}" flood-opacity="${opacity}" result="c${i}"/>`,
          `<feComposite in="c${i}" in2="o${i}" operator="in" result="s${i}"/>`
        );
        merge.push(`<feMergeNode in="s${i}"/>`);
      } else if (effect.type === 'layer-blur' && shape === 'SourceGraphic') {
        primitives.push(
          `<feGaussianBlur in="SourceGraphic" stdDeviation="${fmt(Math.max(effect.radius, 0) / 3)}" result="blurred"/>`
        );
        shape = 'blurred';
      }
    });
    merge.push(`<feMergeNode in="${shape}"/>`);
    // Room for blur and offsets beyond the shape's box
    defs.push(
      `<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%" color-interpolation-filters="sRGB">${primitives.join('')}<feMerge>${merge.join('')}</feMerge></filter>`
    );
    filterAttr = ` filter="url(#${id})"`;
  }
  const blendAttr = blend ? ` style="mix-blend-mode:${blend}"` : '';
  return `<g${filterAttr}${blendAttr}>${element}</g>`;
}

function rectangleToSvg(node: RectangleNode, defs: string[]): string {
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
    return paintedShape('path', ` d="${d}"`, node.fills, node.strokes, tfAttr, opacityAttr, defs);
  }

  return paintedShape(
    'rect',
    ` x="${fmt(-anchorX)}" y="${fmt(-anchorY)}" width="${fmt(node.width)}" height="${fmt(node.height)}"${rxRy}`,
    node.fills,
    node.strokes,
    tfAttr,
    opacityAttr,
    defs
  );
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
  const tfAttr = transformToSvgAttr(node.transform);
  const opacityAttr = node.opacity < 1 ? ` opacity="${fmt(node.opacity)}"` : '';

  // Ellipse center: anchor-based offset
  const cx = node.radiusX * (1 - 2 * node.transform.anchor.x);
  const cy = node.radiusY * (1 - 2 * node.transform.anchor.y);

  return paintedShape(
    'ellipse',
    ` cx="${fmt(cx)}" cy="${fmt(cy)}" rx="${fmt(node.radiusX)}" ry="${fmt(node.radiusY)}"`,
    node.fills,
    node.strokes,
    tfAttr,
    opacityAttr,
    defs
  );
}

function polygonToSvg(node: PolygonNode, defs: string[]): string {
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
  return paintedShape('path', ` d="${d}"`, node.fills, node.strokes, tfAttr, opacityAttr, defs);
}

function pathToSvg(node: PathNode, defs: string[]): string {
  const tfAttr = transformToSvgAttr(node.transform);
  const opacityAttr = node.opacity < 1 ? ` opacity="${fmt(node.opacity)}"` : '';

  // Drawing on: as on the canvas, each contour's stroke trimmed to the
  // progress, open, and no fill
  if (node.strokeProgress !== undefined && node.strokeProgress < 1) {
    const progress = Math.max(0, Math.min(1, node.strokeProgress));
    const drawn = [node.points, ...(node.subpaths ?? [])]
      .map((points) => trimPathToProgress(points, node.closed, progress))
      .filter((points) => points.length >= 2);
    if (drawn.length === 0) return '';
    const d = drawn.map((points) => pathPointsToSvgD(points, false)).join(' ');
    return paintedShape('path', ` d="${d}"`, [], node.strokes, tfAttr, opacityAttr, defs);
  }

  // Build d from primary contour + subpaths
  let d = pathPointsToSvgD(node.points, node.closed);
  if (node.subpaths) {
    for (const sp of node.subpaths) {
      d += ' ' + pathPointsToSvgD(sp, true);
    }
  }

  const fillRule = node.fillRule === 'evenodd' ? ' fill-rule="evenodd"' : '';

  return paintedShape(
    'path',
    ` d="${d}"${fillRule}`,
    node.fills,
    node.strokes,
    tfAttr,
    opacityAttr,
    defs
  );
}

function textToSvg(node: TextNode, defs: string[]): string {
  // The root export wraps everything in scale(1,-1) to convert Y-up geometry to
  // SVG Y-down, but the SVG engine already lays out <text> glyphs in Y-down, so
  // append a local scale(1,-1) to cancel the double flip (else text is mirrored).
  const parts = transformParts(node.transform);
  const tfAttr = ` transform="${parts ? parts + ' ' : ''}scale(1,-1)"`;
  const opacityAttr = node.opacity < 1 ? ` opacity="${fmt(node.opacity)}"` : '';

  // Numbers and names SVG knows only: a crafted file can hold any string here
  const weight = Number(node.fontWeight);
  const fontAttrs = [
    `font-family="${escapeXml(node.fontFamily)}"`,
    `font-size="${fmt(Number(node.fontSize))}"`,
  ];
  if (weight !== 400) fontAttrs.push(`font-weight="${fmt(weight)}"`);
  if (node.fontStyle === 'italic') fontAttrs.push('font-style="italic"');
  if (node.textAlign !== 'left')
    fontAttrs.push(`text-anchor="${textAlignToAnchor(node.textAlign)}"`);
  if (node.letterSpacing !== 0) fontAttrs.push(`letter-spacing="${fmt(node.letterSpacing)}"`);

  const content = textLinesToSvg(node);
  return paintedShape(
    'text',
    ` ${fontAttrs.join(' ')}`,
    node.fills,
    node.strokes,
    tfAttr,
    opacityAttr,
    defs,
    content
  );
}

/**
 * A text node's lines as tspans, broken, aligned and offset for the anchor as
 * the canvas sets them. Y runs down here: the <text> cancels the root flip.
 */
function textLinesToSvg(node: TextNode): string {
  const lines = getTextNodeLines(node);
  const width = getTextBox(node)?.width ?? Math.max(...lines.map((line) => line.width), 1);

  let offsetX = 0;
  let offsetY = 0;
  const { x: ax, y: ay } = node.transform.anchor;
  if (ax !== 0 || ay !== 0) {
    const bounds = getTextNodeBounds(node);
    offsetX = -(bounds.x + bounds.width * ax);
    offsetY = -(bounds.y + bounds.height * ay);
  }
  const alignX = node.textAlign === 'center' ? width / 2 : node.textAlign === 'right' ? width : 0;
  const lineHeight = node.fontSize * node.lineHeight;

  return lines
    .map(
      (line, i) =>
        `<tspan x="${fmt(alignX + offsetX)}" y="${fmt(i * lineHeight - offsetY)}">${escapeXml(line.text)}</tspan>`
    )
    .join('');
}

/** Apply every fill and stroke in the same order as the canvas renderer. */
function paintedShape(
  tag: string,
  geometry: string,
  fills: Fill[] | undefined,
  strokes: Stroke[] | undefined,
  transformAttr: string,
  opacityAttr: string,
  defs: string[],
  innerContent?: string
): string {
  const visibleFills = (fills ?? []).filter((fill) => fill.visible && fill.type !== 'none');
  const visibleStrokes = (strokes ?? []).filter((stroke) => stroke.visible && stroke.width > 0);
  const render = (fillAttr: string, strokeAttr = '', tf = transformAttr, opacity = opacityAttr) =>
    innerContent !== undefined
      ? `<${tag}${geometry} ${fillAttr}${strokeAttr ? ` ${strokeAttr}` : ''}${tf}${opacity}>${innerContent}</${tag}>`
      : `<${tag}${geometry} ${fillAttr}${strokeAttr ? ` ${strokeAttr}` : ''}${tf}${opacity}/>`;

  if (visibleFills.length <= 1 && visibleStrokes.length <= 1) {
    const fill = fillToSvgAttrs(visibleFills[0], defs);
    const stroke = strokeToSvgAttrs(visibleStrokes[0], defs);
    return render(fill, stroke);
  }

  // SVG applies opacity per element; group the duplicate geometry so node
  // opacity composites the complete stack just as it does in the renderer.
  const elements: string[] = [];
  for (const fill of visibleFills) {
    const fillAttr = fillToSvgAttrs(fill, defs);
    elements.push(render(fillAttr, '', '', ''));
  }
  if (visibleFills.length === 0 && visibleStrokes.length === 0) {
    elements.push(render('fill="none"', '', '', ''));
  }
  for (const stroke of visibleStrokes) {
    elements.push(render('fill="none"', strokeToSvgAttrs(stroke, defs), '', ''));
  }
  return `<g${transformAttr}${opacityAttr}>${elements.join('')}</g>`;
}

function textAlignToAnchor(align: string): string {
  if (align === 'center') return 'middle';
  if (align === 'right') return 'end';
  return 'start';
}

function imageToSvg(node: ImageNode, _defs: string[]): string {
  // Not a link to a picture elsewhere, for the SVG's viewers to fetch
  if (!isDocumentImage(node.src)) return '';
  const opacityAttr = node.opacity < 1 ? ` opacity="${fmt(node.opacity)}"` : '';

  const anchorX = node.transform.anchor.x * node.width;
  const anchorY = node.transform.anchor.y * node.height;

  // Un-mirror the raster inside the root scale(1,-1): scale(1,-1) flips the box,
  // translate(0, H-2*anchorY) shifts it back so the box region is invariant.
  const parts = transformParts(node.transform);
  const translateY = node.height - 2 * anchorY;
  const tfAttr = ` transform="${parts ? parts + ' ' : ''}translate(0,${fmt(translateY)}) scale(1,-1)"`;

  return `<image x="${fmt(-anchorX)}" y="${fmt(-anchorY)}" width="${fmt(node.width)}" height="${fmt(node.height)}" href="${escapeXml(node.src)}"${tfAttr}${opacityAttr}/>`;
}

function groupToSvg(
  node: GroupNode,
  sceneGraph: SceneGraph,
  defs: string[],
  symbolDefs?: Map<string, SymbolDefinition>
): string {
  const tfAttr = transformToSvgAttr(node.transform);
  const opacityAttr = node.opacity < 1 ? ` opacity="${fmt(node.opacity)}"` : '';
  if (node.booleanOp) return booleanGroupToSvg(node, sceneGraph, defs, tfAttr, opacityAttr);

  // A mask group: its mask layer isn't drawn, it clips (or masks) the rest
  const maskNode =
    node.maskNodeId && node.maskMode ? sceneGraph.getNode(node.maskNodeId) : undefined;
  const childElements: string[] = [];
  for (const childId of node.children) {
    const child = sceneGraph.getNode(childId);
    if (child && child.visible && child !== maskNode) {
      childElements.push(nodeToSvgElement(child, sceneGraph, defs, symbolDefs));
    }
  }
  let content = childElements.join('');
  if (maskNode && node.maskMode) {
    content = maskedContent(content, maskNode, node.maskMode, sceneGraph, defs, symbolDefs);
  }

  return `<g${tfAttr}${opacityAttr}>${content}</g>`;
}

/**
 * Content under a mask layer: a clipPath for a clip by one shape (a clipPath
 * can't hold groups), else an SVG mask reading the mask's alpha or luminance.
 */
function maskedContent(
  content: string,
  maskNode: Node,
  mode: NonNullable<GroupNode['maskMode']>,
  sceneGraph: SceneGraph,
  defs: string[],
  symbolDefs?: Map<string, SymbolDefinition>
): string {
  const maskElement = nodeToSvgElement(maskNode, sceneGraph, defs, symbolDefs);
  const id = nextDefsId('mask');
  const isShape = maskElement.startsWith('<') && !maskElement.startsWith('<g');
  if (mode === 'clip' && isShape) {
    defs.push(`<clipPath id="${id}">${maskElement}</clipPath>`);
    return `<g clip-path="url(#${id})">${content}</g>`;
  }
  // Masks cover everything, not just a margin around what they mask
  const maskType = mode === 'luminance' ? 'luminance' : 'alpha';
  defs.push(
    `<mask id="${id}" mask-type="${maskType}" maskUnits="userSpaceOnUse" x="-100000" y="-100000" width="200000" height="200000">${maskElement}</mask>`
  );
  return `<g mask="url(#${id})">${content}</g>`;
}

/**
 * A boolean group as the shape its operation makes, in the group's own
 * space (nested boolean groups worked out first), painted with the group's
 * fills and strokes.
 */
function booleanGroupToSvg(
  node: GroupNode,
  sceneGraph: SceneGraph,
  defs: string[],
  tfAttr: string,
  opacityAttr: string
): string {
  const result = booleanGroupPolygon(node, sceneGraph, mat3.identity(), 0);
  if (!result || result.length === 0) return '';
  const d = result
    .flatMap((polygon) => polygon)
    .map((ring) => {
      // polygon-clipping closes each ring by repeating its first point
      const points = ring.length > 1 ? ring.slice(0, -1) : ring;
      if (points.length < 3) return '';
      return `${points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${fmt(x)},${fmt(y)}`).join('')}Z`;
    })
    .filter(Boolean)
    .join(' ');
  if (!d) return '';
  // The result's rings never overlap: holes are holes either way round
  return paintedShape(
    'path',
    ` d="${d}" fill-rule="evenodd"`,
    node.fills ?? [],
    node.strokes ?? [],
    tfAttr,
    opacityAttr,
    defs
  );
}

const MAX_BOOLEAN_DEPTH = 10;

/** A boolean group's result, its children placed by `toSpace` (the group's space → the result's). */
function booleanGroupPolygon(
  group: GroupNode,
  sceneGraph: SceneGraph,
  toSpace: Matrix3,
  depth: number
): ReturnType<typeof nodeToPolygon> {
  const op = group.booleanOp;
  if (!op || depth > MAX_BOOLEAN_DEPTH) return null;
  let accum: ReturnType<typeof nodeToPolygon> = null;
  for (const child of sceneGraph.getChildren(group.id)) {
    if (!child.visible) continue;
    const { position, rotation, scale } = child.transform;
    const placement = mat3.multiply(toSpace, mat3.compose(position, rotation, scale));
    const polygon =
      child.type === 'group' && child.booleanOp
        ? booleanGroupPolygon(child, sceneGraph, placement, depth + 1)
        : nodeToPolygon(child, placement);
    if (!polygon) continue;
    accum = accum ? performBoolean(accum, polygon, op) : polygon;
  }
  return accum;
}

function artboardToSvg(
  node: ArtboardNode,
  sceneGraph: SceneGraph,
  defs: string[],
  symbolDefs?: Map<string, SymbolDefinition>
): string {
  const tfAttr = transformToSvgAttr(node.transform);
  const opacityAttr = node.opacity < 1 ? ` opacity="${fmt(node.opacity)}"` : '';

  const elements: string[] = [];

  // Render artboard background
  if (node.fills && node.fills.length > 0) {
    const anchorX = node.transform.anchor.x * node.width;
    const anchorY = node.transform.anchor.y * node.height;
    elements.push(
      paintedShape(
        'rect',
        ` x="${fmt(-anchorX)}" y="${fmt(-anchorY)}" width="${fmt(node.width)}" height="${fmt(node.height)}"`,
        node.fills,
        [],
        '',
        '',
        defs
      )
    );
  }

  // Render children
  const children: string[] = [];
  for (const childId of node.children) {
    const child = sceneGraph.getNode(childId);
    if (child && child.visible) {
      children.push(nodeToSvgElement(child, sceneGraph, defs, symbolDefs));
    }
  }
  if (node.clipContent && children.length > 0) {
    // Its contents show only inside it, as on the canvas
    const id = nextDefsId('artboard');
    const anchorX = node.transform.anchor.x * node.width;
    const anchorY = node.transform.anchor.y * node.height;
    defs.push(
      `<clipPath id="${id}"><rect x="${fmt(-anchorX)}" y="${fmt(-anchorY)}" width="${fmt(node.width)}" height="${fmt(node.height)}"/></clipPath>`
    );
    elements.push(`<g clip-path="url(#${id})">${children.join('')}</g>`);
  } else {
    elements.push(...children);
  }

  return `<g${tfAttr}${opacityAttr}>${elements.join('')}</g>`;
}

/**
 * A symbol instance as the artwork of its symbol. `within` lists the symbols
 * it is already drawn inside of: an instance of one of those (a symbol placed
 * in itself) draws nothing, rather than forever.
 */
function symbolInstanceToSvg(
  node: SymbolInstanceNode,
  defs: string[],
  symbolDefs?: Map<string, SymbolDefinition>,
  within: ReadonlySet<string> = new Set()
): string {
  if (!symbolDefs || within.has(node.symbolId)) return '';
  const definition = symbolDefs.get(node.symbolId);
  if (!definition) return '';

  const tfAttr = transformToSvgAttr(node.transform);
  const opacityAttr = node.opacity < 1 ? ` opacity="${fmt(node.opacity)}"` : '';

  // Resolve the symbol instance (applies overrides)
  const resolvedNodes = resolveSymbolInstance(node, definition);
  const rootNodes = getResolvedRootNodes(resolvedNodes, definition);

  // Build a temporary node map for resolved nodes
  const nodeMap = new Map<string, Node>();
  for (const rn of resolvedNodes) nodeMap.set(rn.id, rn);

  const inside = new Set(within).add(node.symbolId);
  const childElements: string[] = [];
  for (const child of rootNodes) {
    if (!child.visible) continue;
    // Render resolved children using a temporary inline traversal
    childElements.push(renderResolvedNodeToSvg(child, nodeMap, defs, symbolDefs, inside));
  }

  return `<g${tfAttr}${opacityAttr}>${childElements.join('')}</g>`;
}

/**
 * Render a resolved (flattened) symbol node to SVG.
 * Uses the nodeMap from symbol resolution instead of the scene graph.
 * `within` lists the symbols the node is drawn inside of.
 */
function renderResolvedNodeToSvg(
  node: Node,
  nodeMap: Map<string, Node>,
  defs: string[],
  symbolDefs: Map<string, SymbolDefinition> | undefined,
  within: ReadonlySet<string>
): string {
  return withEffects(node, resolvedNodeElement(node, nodeMap, defs, symbolDefs, within), defs);
}

function resolvedNodeElement(
  node: Node,
  nodeMap: Map<string, Node>,
  defs: string[],
  symbolDefs: Map<string, SymbolDefinition> | undefined,
  within: ReadonlySet<string>
): string {
  // For leaf types, render directly
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
    case 'group': {
      const tfAttr = transformToSvgAttr(node.transform);
      const opacityAttr = node.opacity < 1 ? ` opacity="${fmt(node.opacity)}"` : '';
      const childElements: string[] = [];
      for (const childId of node.children) {
        const child = nodeMap.get(childId);
        if (child && child.visible) {
          childElements.push(renderResolvedNodeToSvg(child, nodeMap, defs, symbolDefs, within));
        }
      }
      return `<g${tfAttr}${opacityAttr}>${childElements.join('')}</g>`;
    }
    case 'symbol-instance':
      // A symbol placed inside this one draws its own artwork here
      return symbolInstanceToSvg(node, defs, symbolDefs, within);
    case 'bone':
    case 'ik-target':
      return '';
    default:
      return '';
  }
}

// ============================================================================
// Main Export Function
// ============================================================================

/**
 * Export an array of nodes to an SVG string.
 * Computes bounding box, applies Y-flip so the SVG renders correctly
 * (Quar uses Y-up, SVG uses Y-down).
 */
/** How an SVG export is framed. */
export interface SvgExportFrame {
  /**
   * The page rectangle (Y up: x, y is its bottom-left) the SVG shows, in place
   * of the nodes' own bounds — to keep the frame still across an animation.
   */
  viewport?: { x: number; y: number; width: number; height: number };
  /** A color behind everything (the document background), viewport-sized. */
  background?: Color;
}

export function exportNodesToSvg(
  nodes: Node[],
  sceneGraph: SceneGraph,
  symbolDefinitions?: import('@quar/types').SymbolDefinition[],
  frame: SvgExportFrame = {}
): string {
  resetDefsCounter();

  // Build symbol definitions map
  let symbolDefs: Map<string, SymbolDefinition> | undefined;
  if (symbolDefinitions && symbolDefinitions.length > 0) {
    symbolDefs = new Map();
    for (const s of symbolDefinitions) symbolDefs.set(s.id, s);
  }

  // The viewport asked for, or the nodes' combined bounds
  const viewport = frame.viewport;
  const bounds =
    viewport && viewport.width > 0 && viewport.height > 0
      ? {
          minX: viewport.x,
          minY: viewport.y,
          maxX: viewport.x + viewport.width,
          maxY: viewport.y + viewport.height,
        }
      : computeExportBounds(nodes, sceneGraph, symbolDefs);
  if (!bounds) return '<svg xmlns="http://www.w3.org/2000/svg"></svg>';

  const { minX, minY, maxX, maxY } = bounds;
  const width = maxX - minX;
  const height = maxY - minY;

  const defs: string[] = [];
  const elements: string[] = [];
  if (frame.background && (frame.background.a ?? 1) > 0) {
    const alpha = frame.background.a ?? 1;
    elements.push(
      `<rect x="${fmt(minX)}" y="${fmt(minY)}" width="${fmt(width)}" height="${fmt(height)}" fill="${colorToHex(frame.background)}"${alpha < 1 ? ` fill-opacity="${fmt(alpha)}"` : ''}/>`
    );
  }

  for (const node of nodes) {
    if (!node.visible) continue;
    elements.push(nodeToSvgElement(node, sceneGraph, defs, symbolDefs));
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

function computeExportBounds(
  nodes: Node[],
  sceneGraph: SceneGraph,
  symbolDefs?: Map<string, SymbolDefinition>
): ExportBounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let found = false;

  for (const node of nodes) {
    if (!node.visible) continue;
    const b = getNodeWorldBounds(node, sceneGraph, symbolDefs);
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

/** `within`: the symbols the node is drawn inside of (none at the top level) */
function getNodeWorldBounds(
  node: Node,
  sceneGraph: SceneGraph,
  symbolDefs?: Map<string, SymbolDefinition>,
  within: ReadonlySet<string> = new Set()
): ExportBounds | null {
  const local = getLocalExtent(node, sceneGraph, symbolDefs, within);
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

function getLocalExtent(
  node: Node,
  sceneGraph: SceneGraph,
  symbolDefs: Map<string, SymbolDefinition> | undefined,
  within: ReadonlySet<string>
): ExportBounds | null {
  let bounds: ExportBounds | null;
  switch (node.type) {
    case 'rectangle': {
      const ax = node.transform.anchor.x * node.width;
      const ay = node.transform.anchor.y * node.height;
      bounds = { minX: -ax, minY: -ay, maxX: node.width - ax, maxY: node.height - ay };
      break;
    }
    case 'ellipse': {
      bounds = { minX: -node.radiusX, minY: -node.radiusY, maxX: node.radiusX, maxY: node.radiusY };
      break;
    }
    case 'polygon': {
      const r = node.radius;
      bounds = { minX: -r, minY: -r, maxX: r, maxY: r };
      break;
    }
    case 'path': {
      bounds = pathLocalBounds(node);
      break;
    }
    case 'text': {
      const box = getTextLocalBounds(node);
      bounds = { minX: box.x, minY: box.y, maxX: box.x + box.width, maxY: box.y + box.height };
      break;
    }
    case 'image': {
      const ax = node.transform.anchor.x * node.width;
      const ay = node.transform.anchor.y * node.height;
      bounds = { minX: -ax, minY: -ay, maxX: node.width - ax, maxY: node.height - ay };
      break;
    }
    case 'artboard': {
      const ax = node.transform.anchor.x * node.width;
      const ay = node.transform.anchor.y * node.height;
      const artboardBounds = {
        minX: -ax,
        minY: -ay,
        maxX: node.width - ax,
        maxY: node.height - ay,
      };
      // A clipping artboard shows nothing past its edges
      bounds = node.clipContent
        ? artboardBounds
        : containerLocalBounds(node, sceneGraph, symbolDefs, artboardBounds, within);
      break;
    }
    case 'group': {
      bounds = containerLocalBounds(node, sceneGraph, symbolDefs, null, within);
      break;
    }
    case 'symbol-instance': {
      // A symbol placed inside one it's already drawn in draws nothing (see symbolInstanceToSvg)
      if (within.has(node.symbolId)) return null;
      const definition = symbolDefs?.get(node.symbolId);
      if (!definition) return null;
      const inside = new Set(within).add(node.symbolId);
      const resolvedNodes = resolveSymbolInstance(node, definition);
      const resolvedGraph = new SceneGraph();
      resolvedGraph.fromJSON({
        nodes: resolvedNodes,
        rootNodeIds: definition.sceneGraphJSON.rootNodeIds,
      });
      let localBounds: ExportBounds | null = null;
      for (const root of getResolvedRootNodes(resolvedNodes, definition)) {
        if (!root.visible) continue;
        localBounds = unionBounds(
          localBounds,
          getNodeWorldBounds(root, resolvedGraph, symbolDefs, inside)
        );
      }
      bounds = localBounds;
      break;
    }
    default:
      return null;
  }

  if (!bounds) return null;
  const strokePadding = getStrokePadding(node);
  return strokePadding > 0
    ? {
        minX: bounds.minX - strokePadding,
        minY: bounds.minY - strokePadding,
        maxX: bounds.maxX + strokePadding,
        maxY: bounds.maxY + strokePadding,
      }
    : bounds;
}

function containerLocalBounds(
  node: GroupNode | ArtboardNode,
  sceneGraph: SceneGraph,
  symbolDefs: Map<string, SymbolDefinition> | undefined,
  ownLocalBounds: ExportBounds | null,
  within: ReadonlySet<string>
): ExportBounds | null {
  const worldTransform = sceneGraph.getWorldTransform(node.id);
  let worldBounds = ownLocalBounds ? transformBounds(ownLocalBounds, worldTransform) : null;
  for (const childId of node.children) {
    const child = sceneGraph.getNode(childId);
    if (!child || !child.visible) continue;
    worldBounds = unionBounds(
      worldBounds,
      getNodeWorldBounds(child, sceneGraph, symbolDefs, within)
    );
  }
  return worldBounds ? inverseTransformBounds(worldBounds, worldTransform) : null;
}

function transformBounds(bounds: ExportBounds, matrix: Matrix3): ExportBounds {
  const corners = [
    { x: bounds.minX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.maxY },
    { x: bounds.minX, y: bounds.maxY },
  ];
  const points = corners.map((point) => ({
    x: matrix.a * point.x + matrix.c * point.y + matrix.tx,
    y: matrix.b * point.x + matrix.d * point.y + matrix.ty,
  }));
  return {
    minX: Math.min(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxX: Math.max(...points.map((point) => point.x)),
    maxY: Math.max(...points.map((point) => point.y)),
  };
}

function inverseTransformBounds(bounds: ExportBounds, matrix: Matrix3): ExportBounds {
  const determinant = matrix.a * matrix.d - matrix.b * matrix.c;
  if (Math.abs(determinant) < 1e-10) return bounds;
  const inverse = 1 / determinant;
  const corners = [
    { x: bounds.minX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.maxY },
    { x: bounds.minX, y: bounds.maxY },
  ];
  const points = corners.map((point) => {
    const dx = point.x - matrix.tx;
    const dy = point.y - matrix.ty;
    return {
      x: (matrix.d * dx - matrix.c * dy) * inverse,
      y: (-matrix.b * dx + matrix.a * dy) * inverse,
    };
  });
  return {
    minX: Math.min(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxX: Math.max(...points.map((point) => point.x)),
    maxY: Math.max(...points.map((point) => point.y)),
  };
}

function unionBounds(a: ExportBounds | null, b: ExportBounds | null): ExportBounds | null {
  if (!a) return b;
  if (!b) return a;
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

function getStrokePadding(node: Node): number {
  if (!['rectangle', 'ellipse', 'polygon', 'path', 'text'].includes(node.type)) return 0;
  if (!('strokes' in node) || !Array.isArray(node.strokes)) return 0;
  let padding = 0;
  for (const stroke of node.strokes) {
    if (!stroke.visible || stroke.width <= 0) continue;
    const alignmentPadding =
      stroke.align === 'outside' ? stroke.width : stroke.align === 'inside' ? 0 : stroke.width / 2;
    const joinPadding =
      stroke.join === 'miter' ? alignmentPadding * (stroke.miterLimit ?? 4) : alignmentPadding;
    const capPadding = stroke.cap === 'square' ? (stroke.width / 2) * Math.SQRT2 : 0;
    padding = Math.max(padding, joinPadding, capPadding);
  }
  return padding;
}

function pathLocalBounds(node: PathNode): ExportBounds | null {
  let bounds: ExportBounds | null = null;
  const includePoints = (points: PathPoint[], closed: boolean) => {
    if (points.length === 0) return;
    const contourBounds: ExportBounds = {
      minX: points[0]!.position.x,
      minY: points[0]!.position.y,
      maxX: points[0]!.position.x,
      maxY: points[0]!.position.y,
    };
    const addPoint = (x: number, y: number) => {
      contourBounds.minX = Math.min(contourBounds.minX, x);
      contourBounds.minY = Math.min(contourBounds.minY, y);
      contourBounds.maxX = Math.max(contourBounds.maxX, x);
      contourBounds.maxY = Math.max(contourBounds.maxY, y);
    };
    for (const point of points) addPoint(point.position.x, point.position.y);
    forEachSegment(points, closed, (from, to) => {
      const { cp1, cp2 } = getAbsoluteControlPoints(from, to);
      for (const t of cubicExtrema(from.position.x, cp1.x, cp2.x, to.position.x)) {
        const x = cubicValue(from.position.x, cp1.x, cp2.x, to.position.x, t);
        const y = cubicValue(from.position.y, cp1.y, cp2.y, to.position.y, t);
        addPoint(x, y);
      }
      for (const t of cubicExtrema(from.position.y, cp1.y, cp2.y, to.position.y)) {
        const x = cubicValue(from.position.x, cp1.x, cp2.x, to.position.x, t);
        const y = cubicValue(from.position.y, cp1.y, cp2.y, to.position.y, t);
        addPoint(x, y);
      }
    });
    bounds = unionBounds(bounds, contourBounds);
  };

  includePoints(node.points, node.closed);
  for (const subpath of node.subpaths ?? []) includePoints(subpath, true);
  return bounds;
}

function cubicExtrema(p0: number, p1: number, p2: number, p3: number): number[] {
  const a = -p0 + 3 * p1 - 3 * p2 + p3;
  const b = 3 * p0 - 6 * p1 + 3 * p2;
  const c = -3 * p0 + 3 * p1;
  const qa = 3 * a;
  const qb = 2 * b;
  if (Math.abs(qa) < 1e-12) {
    if (Math.abs(qb) < 1e-12) return [];
    const t = -c / qb;
    return t > 0 && t < 1 ? [t] : [];
  }
  const discriminant = qb * qb - 4 * qa * c;
  if (discriminant < 0) return [];
  const root = Math.sqrt(discriminant);
  return [(-qb + root) / (2 * qa), (-qb - root) / (2 * qa)].filter((t) => t > 0 && t < 1);
}

function cubicValue(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const mt = 1 - t;
  return mt ** 3 * p0 + 3 * mt ** 2 * t * p1 + 3 * mt * t ** 2 * p2 + t ** 3 * p3;
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
