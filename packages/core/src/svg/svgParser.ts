/**
 * SVG DOM Parser
 * Parses SVG string into an intermediate representation using DOMParser.
 */

import type { Color, Vector2 } from '@quar/types';
import {
  parseSvgColor,
  parseSvgLength,
  parseSvgPoints,
  resolveStyle,
  type ResolvedStyle,
} from './svgUtils';

// ============================================================================
// Types
// ============================================================================

export interface ParsedSvg {
  viewBox: { x: number; y: number; width: number; height: number } | null;
  width: number;
  height: number;
  defs: SvgDefs;
  elements: SvgElement[];
}

export interface SvgDefs {
  gradients: Map<string, ParsedGradient>;
}

export interface ParsedGradient {
  type: 'linear' | 'radial';
  stops: { offset: number; color: Color }[];
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  cx?: number;
  cy?: number;
  r?: number;
  fx?: number;
  fy?: number;
  gradientUnits: 'objectBoundingBox' | 'userSpaceOnUse';
  gradientTransform?: string;
  spreadMethod: 'pad' | 'reflect' | 'repeat';
}

interface SvgElementBase {
  tag: string;
  id?: string;
  transform?: string;
  style: ResolvedStyle;
}

export interface SvgRect extends SvgElementBase {
  tag: 'rect';
  x: number;
  y: number;
  width: number;
  height: number;
  rx?: number;
  ry?: number;
}

export interface SvgEllipse extends SvgElementBase {
  tag: 'ellipse';
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

export interface SvgCircle extends SvgElementBase {
  tag: 'circle';
  cx: number;
  cy: number;
  r: number;
}

export interface SvgLine extends SvgElementBase {
  tag: 'line';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface SvgPolygon extends SvgElementBase {
  tag: 'polygon';
  points: Vector2[];
}

export interface SvgPolyline extends SvgElementBase {
  tag: 'polyline';
  points: Vector2[];
}

export interface SvgPath extends SvgElementBase {
  tag: 'path';
  d: string;
  fillRule?: 'nonzero' | 'evenodd';
}

export interface SvgGroup extends SvgElementBase {
  tag: 'g';
  children: SvgElement[];
}

export type SvgElement =
  | SvgRect
  | SvgEllipse
  | SvgCircle
  | SvgLine
  | SvgPolygon
  | SvgPolyline
  | SvgPath
  | SvgGroup;

// ============================================================================
// Main Parser
// ============================================================================

/**
 * Parse an SVG string into a structured intermediate representation.
 */
export function parseSvg(svgString: string): ParsedSvg {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, 'image/svg+xml');

  // Check for parse errors
  const errorNode = doc.querySelector('parsererror');
  if (errorNode) {
    throw new Error(`SVG parse error: ${errorNode.textContent}`);
  }

  const svgEl = doc.documentElement;
  if (svgEl.tagName.toLowerCase() !== 'svg') {
    throw new Error('Root element is not <svg>');
  }

  // Parse dimensions
  const viewBox = parseViewBox(svgEl.getAttribute('viewBox'));
  const width = parseSvgLength(svgEl.getAttribute('width') || '') || viewBox?.width || 300;
  const height = parseSvgLength(svgEl.getAttribute('height') || '') || viewBox?.height || 150;

  // Collect defs
  const defs = collectDefs(svgEl);

  // Walk children (excluding defs)
  const elements = walkChildren(svgEl, defs, undefined);

  return { viewBox, width, height, defs, elements };
}

// ============================================================================
// ViewBox
// ============================================================================

function parseViewBox(
  attr: string | null
): { x: number; y: number; width: number; height: number } | null {
  if (!attr) return null;
  const parts = attr
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (parts.length < 4 || parts.some(isNaN)) return null;
  if (parts[2]! <= 0 || parts[3]! <= 0) return null;
  return { x: parts[0]!, y: parts[1]!, width: parts[2]!, height: parts[3]! };
}

// ============================================================================
// Defs Collection
// ============================================================================

function collectDefs(svgEl: Element): SvgDefs {
  const defs: SvgDefs = {
    gradients: new Map(),
  };

  // Find all <defs> sections and collect gradients from them
  const defsElements = svgEl.querySelectorAll('defs');
  for (const defsEl of defsElements) {
    collectGradients(defsEl, defs.gradients);
  }

  // Also check for gradients directly under <svg> (some SVGs put them outside <defs>)
  collectGradients(svgEl, defs.gradients);

  // Resolve gradient href inheritance
  resolveGradientInheritance(defs.gradients);

  return defs;
}

function collectGradients(parent: Element, gradients: Map<string, ParsedGradient>): void {
  for (const el of parent.querySelectorAll('linearGradient, radialGradient')) {
    const id = el.getAttribute('id');
    if (!id) continue;

    const type = el.tagName.toLowerCase() === 'lineargradient' ? 'linear' : 'radial';
    const gradient: ParsedGradient = {
      type,
      stops: parseGradientStops(el),
      gradientUnits:
        (el.getAttribute('gradientUnits') as 'objectBoundingBox' | 'userSpaceOnUse') ||
        'objectBoundingBox',
      gradientTransform: el.getAttribute('gradientTransform') || undefined,
      spreadMethod: (el.getAttribute('spreadMethod') as 'pad' | 'reflect' | 'repeat') || 'pad',
    };

    if (type === 'linear') {
      const x1 = el.getAttribute('x1');
      const y1 = el.getAttribute('y1');
      const x2 = el.getAttribute('x2');
      const y2 = el.getAttribute('y2');
      if (x1 !== null) gradient.x1 = parseFloat(x1);
      if (y1 !== null) gradient.y1 = parseFloat(y1);
      if (x2 !== null) gradient.x2 = parseFloat(x2);
      if (y2 !== null) gradient.y2 = parseFloat(y2);
    } else {
      const cx = el.getAttribute('cx');
      const cy = el.getAttribute('cy');
      const r = el.getAttribute('r');
      const fx = el.getAttribute('fx');
      const fy = el.getAttribute('fy');
      if (cx !== null) gradient.cx = parseFloat(cx);
      if (cy !== null) gradient.cy = parseFloat(cy);
      if (r !== null) gradient.r = parseFloat(r);
      if (fx !== null) gradient.fx = parseFloat(fx);
      if (fy !== null) gradient.fy = parseFloat(fy);
    }

    // Store href for later inheritance resolution
    const href =
      el.getAttribute('href') || el.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
    if (href) {
      (gradient as ParsedGradient & { _href?: string })._href = href.replace('#', '');
    }

    gradients.set(id, gradient);
  }
}

function parseGradientStops(gradientEl: Element): { offset: number; color: Color }[] {
  const stops: { offset: number; color: Color }[] = [];

  for (const stopEl of gradientEl.querySelectorAll('stop')) {
    const offsetAttr = stopEl.getAttribute('offset') || '0';
    let offset = parseFloat(offsetAttr);
    if (offsetAttr.endsWith('%')) offset = parseFloat(offsetAttr) / 100;
    offset = Math.max(0, Math.min(1, offset));

    // Stop color from style or attribute
    const style = stopEl.getAttribute('style') || '';
    const stopColorAttr = stopEl.getAttribute('stop-color') || '';
    const stopOpacityAttr = stopEl.getAttribute('stop-opacity');

    // Parse inline style for stop-color and stop-opacity
    let stopColor = stopColorAttr;
    let stopOpacity = stopOpacityAttr ? parseFloat(stopOpacityAttr) : 1;

    if (style) {
      const styleMap = parseSimpleStyle(style);
      if (styleMap['stop-color']) stopColor = styleMap['stop-color'];
      if (styleMap['stop-opacity']) stopOpacity = parseFloat(styleMap['stop-opacity']);
    }

    const color = parseSvgColor(stopColor || '#000000') || { r: 0, g: 0, b: 0, a: 1 };
    color.a *= stopOpacity;

    stops.push({ offset, color });
  }

  return stops;
}

function resolveGradientInheritance(gradients: Map<string, ParsedGradient>): void {
  const visited = new Set<string>();
  for (const [id, gradient] of gradients) {
    const href = (gradient as ParsedGradient & { _href?: string })._href;
    if (!href) continue;

    // Detect self-reference and circular references
    if (href === id || visited.has(id)) {
      delete (gradient as ParsedGradient & { _href?: string })._href;
      continue;
    }
    visited.add(id);

    const parent = gradients.get(href);
    if (!parent) continue;

    // Inherit stops if none defined
    if (gradient.stops.length === 0 && parent.stops.length > 0) {
      gradient.stops = [...parent.stops];
    }

    // Inherit coordinates if not set
    if (gradient.type === 'linear') {
      if (gradient.x1 === undefined) gradient.x1 = parent.x1;
      if (gradient.y1 === undefined) gradient.y1 = parent.y1;
      if (gradient.x2 === undefined) gradient.x2 = parent.x2;
      if (gradient.y2 === undefined) gradient.y2 = parent.y2;
    } else {
      if (gradient.cx === undefined) gradient.cx = parent.cx;
      if (gradient.cy === undefined) gradient.cy = parent.cy;
      if (gradient.r === undefined) gradient.r = parent.r;
    }

    // Clean up internal property
    delete (gradient as ParsedGradient & { _href?: string })._href;
  }
}

function parseSimpleStyle(style: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const decl of style.split(';')) {
    const [prop, ...valParts] = decl.split(':');
    if (prop && valParts.length) {
      result[prop.trim()] = valParts.join(':').trim();
    }
  }
  return result;
}

// ============================================================================
// Element Walking
// ============================================================================

function walkChildren(
  parent: Element,
  defs: SvgDefs,
  parentStyle: ResolvedStyle | undefined
): SvgElement[] {
  const elements: SvgElement[] = [];

  for (const child of parent.children) {
    const tag = child.tagName.toLowerCase();

    // Skip defs, metadata, title, desc, etc.
    if (
      tag === 'defs' ||
      tag === 'metadata' ||
      tag === 'title' ||
      tag === 'desc' ||
      tag === 'style' ||
      tag === 'clippath' ||
      tag === 'mask' ||
      tag === 'lineargradient' ||
      tag === 'radialgradient'
    ) {
      continue;
    }

    const style = resolveStyle(child, parentStyle);

    // Skip hidden elements
    if (style.display === 'none') continue;

    const base: SvgElementBase = {
      tag,
      id: child.getAttribute('id') || undefined,
      transform: child.getAttribute('transform') || undefined,
      style,
    };

    const parsed = parseElement(child, tag, base, defs, style);
    if (parsed) elements.push(parsed);
  }

  return elements;
}

function parseElement(
  el: Element,
  tag: string,
  base: SvgElementBase,
  defs: SvgDefs,
  style: ResolvedStyle
): SvgElement | null {
  switch (tag) {
    case 'rect': {
      return {
        ...base,
        tag: 'rect',
        x: parseFloat(el.getAttribute('x') || '0'),
        y: parseFloat(el.getAttribute('y') || '0'),
        width: parseFloat(el.getAttribute('width') || '0'),
        height: parseFloat(el.getAttribute('height') || '0'),
        rx: el.getAttribute('rx') ? parseFloat(el.getAttribute('rx')!) : undefined,
        ry: el.getAttribute('ry') ? parseFloat(el.getAttribute('ry')!) : undefined,
      } as SvgRect;
    }

    case 'ellipse': {
      return {
        ...base,
        tag: 'ellipse',
        cx: parseFloat(el.getAttribute('cx') || '0'),
        cy: parseFloat(el.getAttribute('cy') || '0'),
        rx: parseFloat(el.getAttribute('rx') || '0'),
        ry: parseFloat(el.getAttribute('ry') || '0'),
      } as SvgEllipse;
    }

    case 'circle': {
      return {
        ...base,
        tag: 'circle',
        cx: parseFloat(el.getAttribute('cx') || '0'),
        cy: parseFloat(el.getAttribute('cy') || '0'),
        r: parseFloat(el.getAttribute('r') || '0'),
      } as SvgCircle;
    }

    case 'line': {
      return {
        ...base,
        tag: 'line',
        x1: parseFloat(el.getAttribute('x1') || '0'),
        y1: parseFloat(el.getAttribute('y1') || '0'),
        x2: parseFloat(el.getAttribute('x2') || '0'),
        y2: parseFloat(el.getAttribute('y2') || '0'),
      } as SvgLine;
    }

    case 'polygon': {
      const pointsAttr = el.getAttribute('points') || '';
      return {
        ...base,
        tag: 'polygon',
        points: parseSvgPoints(pointsAttr),
      } as SvgPolygon;
    }

    case 'polyline': {
      const pointsAttr = el.getAttribute('points') || '';
      return {
        ...base,
        tag: 'polyline',
        points: parseSvgPoints(pointsAttr),
      } as SvgPolyline;
    }

    case 'path': {
      const d = el.getAttribute('d') || '';
      if (!d) return null;
      const fr = el.getAttribute('fill-rule') || '';
      const fillRule = fr === 'evenodd' ? ('evenodd' as const) : undefined; // SVG default is nonzero
      return {
        ...base,
        tag: 'path',
        d,
        ...(fillRule ? { fillRule } : {}),
      } as SvgPath;
    }

    case 'g': {
      const children = walkChildren(el, defs, style);
      return {
        ...base,
        tag: 'g',
        children,
      } as SvgGroup;
    }

    default:
      return null;
  }
}
