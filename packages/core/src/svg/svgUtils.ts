/**
 * SVG Import Utilities
 * Color parsing, transform parsing, unit conversion, style resolution
 */

import type { Color, Transform, Vector2 } from '@quar/types';

// ============================================================================
// Named CSS Colors (148 standard colors)
// ============================================================================

const NAMED_COLORS: Record<string, string> = {
  aliceblue: '#f0f8ff', antiquewhite: '#faebd7', aqua: '#00ffff',
  aquamarine: '#7fffd4', azure: '#f0ffff', beige: '#f5f5dc',
  bisque: '#ffe4c4', black: '#000000', blanchedalmond: '#ffebcd',
  blue: '#0000ff', blueviolet: '#8a2be2', brown: '#a52a2a',
  burlywood: '#deb887', cadetblue: '#5f9ea0', chartreuse: '#7fff00',
  chocolate: '#d2691e', coral: '#ff7f50', cornflowerblue: '#6495ed',
  cornsilk: '#fff8dc', crimson: '#dc143c', cyan: '#00ffff',
  darkblue: '#00008b', darkcyan: '#008b8b', darkgoldenrod: '#b8860b',
  darkgray: '#a9a9a9', darkgreen: '#006400', darkgrey: '#a9a9a9',
  darkkhaki: '#bdb76b', darkmagenta: '#8b008b', darkolivegreen: '#556b2f',
  darkorange: '#ff8c00', darkorchid: '#9932cc', darkred: '#8b0000',
  darksalmon: '#e9967a', darkseagreen: '#8fbc8f', darkslateblue: '#483d8b',
  darkslategray: '#2f4f4f', darkslategrey: '#2f4f4f', darkturquoise: '#00ced1',
  darkviolet: '#9400d3', deeppink: '#ff1493', deepskyblue: '#00bfff',
  dimgray: '#696969', dimgrey: '#696969', dodgerblue: '#1e90ff',
  firebrick: '#b22222', floralwhite: '#fffaf0', forestgreen: '#228b22',
  fuchsia: '#ff00ff', gainsboro: '#dcdcdc', ghostwhite: '#f8f8ff',
  gold: '#ffd700', goldenrod: '#daa520', gray: '#808080',
  green: '#008000', greenyellow: '#adff2f', grey: '#808080',
  honeydew: '#f0fff0', hotpink: '#ff69b4', indianred: '#cd5c5c',
  indigo: '#4b0082', ivory: '#fffff0', khaki: '#f0e68c',
  lavender: '#e6e6fa', lavenderblush: '#fff0f5', lawngreen: '#7cfc00',
  lemonchiffon: '#fffacd', lightblue: '#add8e6', lightcoral: '#f08080',
  lightcyan: '#e0ffff', lightgoldenrodyellow: '#fafad2', lightgray: '#d3d3d3',
  lightgreen: '#90ee90', lightgrey: '#d3d3d3', lightpink: '#ffb6c1',
  lightsalmon: '#ffa07a', lightseagreen: '#20b2aa', lightskyblue: '#87cefa',
  lightslategray: '#778899', lightslategrey: '#778899', lightsteelblue: '#b0c4de',
  lightyellow: '#ffffe0', lime: '#00ff00', limegreen: '#32cd32',
  linen: '#faf0e6', magenta: '#ff00ff', maroon: '#800000',
  mediumaquamarine: '#66cdaa', mediumblue: '#0000cd', mediumorchid: '#ba55d3',
  mediumpurple: '#9370db', mediumseagreen: '#3cb371', mediumslateblue: '#7b68ee',
  mediumspringgreen: '#00fa9a', mediumturquoise: '#48d1cc', mediumvioletred: '#c71585',
  midnightblue: '#191970', mintcream: '#f5fffa', mistyrose: '#ffe4e1',
  moccasin: '#ffe4b5', navajowhite: '#ffdead', navy: '#000080',
  oldlace: '#fdf5e6', olive: '#808000', olivedrab: '#6b8e23',
  orange: '#ffa500', orangered: '#ff4500', orchid: '#da70d6',
  palegoldenrod: '#eee8aa', palegreen: '#98fb98', paleturquoise: '#afeeee',
  palevioletred: '#db7093', papayawhip: '#ffefd5', peachpuff: '#ffdab9',
  peru: '#cd853f', pink: '#ffc0cb', plum: '#dda0dd',
  powderblue: '#b0e0e6', purple: '#800080', rebeccapurple: '#663399',
  red: '#ff0000', rosybrown: '#bc8f8f', royalblue: '#4169e1',
  saddlebrown: '#8b4513', salmon: '#fa8072', sandybrown: '#f4a460',
  seagreen: '#2e8b57', seashell: '#fff5ee', sienna: '#a0522d',
  silver: '#c0c0c0', skyblue: '#87ceeb', slateblue: '#6a5acd',
  slategray: '#708090', slategrey: '#708090', snow: '#fffafa',
  springgreen: '#00ff7f', steelblue: '#4682b4', tan: '#d2b48c',
  teal: '#008080', thistle: '#d8bfd8', tomato: '#ff6347',
  turquoise: '#40e0d0', violet: '#ee82ee', wheat: '#f5deb3',
  white: '#ffffff', whitesmoke: '#f5f5f5', yellow: '#ffff00',
  yellowgreen: '#9acd32',
};

// ============================================================================
// Color Parsing
// ============================================================================

/**
 * Parse an SVG/CSS color string to a Color object.
 * Supports: #rgb, #rrggbb, #rrggbbaa, rgb(), rgba(), hsl(), hsla(), named colors.
 * Returns null for 'none', 'inherit', 'currentColor', or invalid values.
 */
export function parseSvgColor(value: string): Color | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();

  if (trimmed === 'none' || trimmed === 'inherit' || trimmed === 'currentcolor' || trimmed === 'transparent') {
    return trimmed === 'transparent' ? { r: 0, g: 0, b: 0, a: 0 } : null;
  }

  // Named color
  const named = NAMED_COLORS[trimmed];
  if (named) return parseHexColor(named);

  // Hex color
  if (trimmed.startsWith('#')) return parseHexColor(trimmed);

  // rgb() / rgba()
  const rgbMatch = trimmed.match(/^rgba?\(\s*([^)]+)\s*\)$/);
  if (rgbMatch) return parseRgbFunction(rgbMatch[1]!);

  // hsl() / hsla()
  const hslMatch = trimmed.match(/^hsla?\(\s*([^)]+)\s*\)$/);
  if (hslMatch) return parseHslFunction(hslMatch[1]!);

  return null;
}

function parseHexColor(hex: string): Color | null {
  const h = hex.replace('#', '');
  if (h.length === 3) {
    return {
      r: parseInt(h[0]! + h[0]!, 16),
      g: parseInt(h[1]! + h[1]!, 16),
      b: parseInt(h[2]! + h[2]!, 16),
      a: 1,
    };
  }
  if (h.length === 4) {
    return {
      r: parseInt(h[0]! + h[0]!, 16),
      g: parseInt(h[1]! + h[1]!, 16),
      b: parseInt(h[2]! + h[2]!, 16),
      a: parseInt(h[3]! + h[3]!, 16) / 255,
    };
  }
  if (h.length === 6) {
    return {
      r: parseInt(h.substring(0, 2), 16),
      g: parseInt(h.substring(2, 4), 16),
      b: parseInt(h.substring(4, 6), 16),
      a: 1,
    };
  }
  if (h.length === 8) {
    return {
      r: parseInt(h.substring(0, 2), 16),
      g: parseInt(h.substring(2, 4), 16),
      b: parseInt(h.substring(4, 6), 16),
      a: parseInt(h.substring(6, 8), 16) / 255,
    };
  }
  return null;
}

function parseRgbFunction(args: string): Color | null {
  const parts = args.split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3) return null;

  const parseChannel = (s: string): number => {
    if (s.endsWith('%')) return Math.round((parseFloat(s) / 100) * 255);
    return Math.round(parseFloat(s));
  };

  const r = clamp(parseChannel(parts[0]!), 0, 255);
  const g = clamp(parseChannel(parts[1]!), 0, 255);
  const b = clamp(parseChannel(parts[2]!), 0, 255);
  const a = parts[3] !== undefined
    ? clamp(parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]), 0, 1)
    : 1;

  if (isNaN(r) || isNaN(g) || isNaN(b) || isNaN(a)) return null;
  return { r, g, b, a };
}

function parseHslFunction(args: string): Color | null {
  const parts = args.split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3) return null;

  const h = ((parseFloat(parts[0]!) % 360) + 360) % 360;
  const s = clamp(parseFloat(parts[1]!) / 100, 0, 1);
  const l = clamp(parseFloat(parts[2]!) / 100, 0, 1);
  const a = parts[3] !== undefined
    ? clamp(parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]), 0, 1)
    : 1;

  if (isNaN(h) || isNaN(s) || isNaN(l) || isNaN(a)) return null;

  // HSL to RGB conversion
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  let r1: number, g1: number, b1: number;
  if (h < 60) { r1 = c; g1 = x; b1 = 0; }
  else if (h < 120) { r1 = x; g1 = c; b1 = 0; }
  else if (h < 180) { r1 = 0; g1 = c; b1 = x; }
  else if (h < 240) { r1 = 0; g1 = x; b1 = c; }
  else if (h < 300) { r1 = x; g1 = 0; b1 = c; }
  else { r1 = c; g1 = 0; b1 = x; }

  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
    a,
  };
}

// ============================================================================
// Transform Parsing
// ============================================================================

/**
 * Parse an SVG transform attribute string into a decomposed Transform.
 * Supports: translate, rotate, scale, matrix, skewX, skewY.
 * Multiple transforms are composed left-to-right.
 */
export function parseSvgTransform(attr: string): Transform {
  const defaultTransform: Transform = {
    position: { x: 0, y: 0 },
    rotation: 0,
    scale: { x: 1, y: 1 },
    anchor: { x: 0.5, y: 0.5 },
    skew: { x: 0, y: 0 },
  };

  if (!attr || !attr.trim()) return defaultTransform;

  // Parse all transform functions and compose their matrices
  const matrix = parseSvgTransformToMatrix(attr);

  // Decompose the composed matrix
  return decomposeMatrix(matrix);
}

/** Intermediate 2D affine matrix [a, b, c, d, tx, ty] */
type Mat2D = [number, number, number, number, number, number];

function identityMatrix(): Mat2D {
  return [1, 0, 0, 1, 0, 0];
}

function multiplyMatrices(a: Mat2D, b: Mat2D): Mat2D {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

/**
 * Parse SVG transform string to a composed 2D affine matrix.
 */
export function parseSvgTransformToMatrix(attr: string): Mat2D {
  let result = identityMatrix();
  const regex = /(\w+)\s*\(([^)]*)\)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(attr)) !== null) {
    const fn = match[1]!.toLowerCase();
    const args = match[2]!.split(/[\s,]+/).filter(Boolean).map(Number);
    let m: Mat2D;

    switch (fn) {
      case 'translate': {
        const tx = args[0] || 0;
        const ty = args[1] ?? 0;
        m = [1, 0, 0, 1, tx, ty];
        break;
      }
      case 'scale': {
        const sx = args[0] ?? 1;
        const sy = args[1] ?? sx;
        m = [sx, 0, 0, sy, 0, 0];
        break;
      }
      case 'rotate': {
        const deg = args[0] || 0;
        const cx = args[1] || 0;
        const cy = args[2] || 0;
        const rad = (deg * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        if (cx !== 0 || cy !== 0) {
          // rotate(deg, cx, cy) = translate(cx,cy) rotate(deg) translate(-cx,-cy)
          const t1: Mat2D = [1, 0, 0, 1, cx, cy];
          const r: Mat2D = [cos, sin, -sin, cos, 0, 0];
          const t2: Mat2D = [1, 0, 0, 1, -cx, -cy];
          m = multiplyMatrices(multiplyMatrices(t1, r), t2);
        } else {
          m = [cos, sin, -sin, cos, 0, 0];
        }
        break;
      }
      case 'skewx': {
        const rad = ((args[0] || 0) * Math.PI) / 180;
        m = [1, 0, Math.tan(rad), 1, 0, 0];
        break;
      }
      case 'skewy': {
        const rad = ((args[0] || 0) * Math.PI) / 180;
        m = [1, Math.tan(rad), 0, 1, 0, 0];
        break;
      }
      case 'matrix': {
        m = [
          args[0] ?? 1, args[1] ?? 0,
          args[2] ?? 0, args[3] ?? 1,
          args[4] ?? 0, args[5] ?? 0,
        ];
        break;
      }
      default:
        continue;
    }

    result = multiplyMatrices(result, m);
  }

  return result;
}

/**
 * Decompose a 2D affine matrix [a, b, c, d, tx, ty] into Transform components.
 */
export function decomposeMatrix(m: Mat2D): Transform {
  const [a, b, c, d, tx, ty] = m;

  const scaleX = Math.sqrt(a * a + b * b);
  const scaleY = Math.sqrt(c * c + d * d);

  // Determine sign of scale (check determinant)
  const det = a * d - b * c;
  const signY = det < 0 ? -1 : 1;

  const rotation = Math.atan2(b, a) * (180 / Math.PI);

  // Skew
  const skewX = Math.atan2(a * c + b * d, a * d - b * c) * (180 / Math.PI);

  return {
    position: { x: tx, y: ty },
    rotation,
    scale: { x: scaleX, y: scaleY * signY },
    anchor: { x: 0.5, y: 0.5 },
    skew: { x: skewX, y: 0 },
  };
}

// ============================================================================
// Length / Unit Parsing
// ============================================================================

/**
 * Parse an SVG length value to a number in pixels.
 * Supports: px, pt, em (approx), %, unitless.
 */
export function parseSvgLength(value: string, reference?: number): number {
  if (!value) return 0;
  const trimmed = value.trim();

  if (trimmed.endsWith('%')) {
    const pct = parseFloat(trimmed) / 100;
    return reference !== undefined ? pct * reference : pct;
  }
  if (trimmed.endsWith('pt')) {
    return parseFloat(trimmed) * (4 / 3); // 1pt = 1.333px
  }
  if (trimmed.endsWith('em')) {
    return parseFloat(trimmed) * 16; // Approximate: 1em = 16px
  }
  if (trimmed.endsWith('px')) {
    return parseFloat(trimmed);
  }

  return parseFloat(trimmed) || 0;
}

// ============================================================================
// Style Resolution
// ============================================================================

export interface ResolvedStyle {
  fill: string | null;
  fillOpacity: number;
  stroke: string | null;
  strokeWidth: number;
  strokeOpacity: number;
  strokeLinecap: 'butt' | 'round' | 'square';
  strokeLinejoin: 'miter' | 'round' | 'bevel';
  strokeMiterlimit: number;
  strokeDasharray: number[] | null;
  strokeDashoffset: number;
  opacity: number;
  display: string;
  visibility: string;
}

const DEFAULT_STYLE: ResolvedStyle = {
  fill: '#000000', // SVG default fill is black
  fillOpacity: 1,
  stroke: null,
  strokeWidth: 1,
  strokeOpacity: 1,
  strokeLinecap: 'butt',
  strokeLinejoin: 'miter',
  strokeMiterlimit: 4,
  strokeDasharray: null,
  strokeDashoffset: 0,
  opacity: 1,
  display: 'inline',
  visibility: 'visible',
};

/**
 * Resolve the effective style for an SVG element.
 * Priority: style attribute > presentation attributes.
 * Inherits from parent style for inherited properties.
 */
export function resolveStyle(
  element: Element,
  parentStyle?: ResolvedStyle
): ResolvedStyle {
  const base: ResolvedStyle = parentStyle
    ? { ...parentStyle } // Inherit from parent
    : { ...DEFAULT_STYLE };

  // Parse inline style attribute
  const inlineStyle = parseInlineStyle(element.getAttribute('style') || '');

  // Helper: get value from inline style first, then attribute, then inherited
  const get = (prop: string, attr?: string): string | null => {
    return inlineStyle[prop] ?? element.getAttribute(attr ?? prop) ?? null;
  };

  const fill = get('fill');
  if (fill !== null) base.fill = fill === 'none' ? null : fill;

  const stroke = get('stroke');
  if (stroke !== null) base.stroke = stroke === 'none' ? null : stroke;

  const strokeWidth = get('stroke-width');
  if (strokeWidth !== null) base.strokeWidth = parseSvgLength(strokeWidth);

  const fillOpacity = get('fill-opacity');
  if (fillOpacity !== null) base.fillOpacity = clamp(parseFloat(fillOpacity), 0, 1);

  const strokeOpacity = get('stroke-opacity');
  if (strokeOpacity !== null) base.strokeOpacity = clamp(parseFloat(strokeOpacity), 0, 1);

  const opacity = get('opacity');
  if (opacity !== null) base.opacity = clamp(parseFloat(opacity), 0, 1);

  const strokeLinecap = get('stroke-linecap');
  if (strokeLinecap !== null) base.strokeLinecap = strokeLinecap as 'butt' | 'round' | 'square';

  const strokeLinejoin = get('stroke-linejoin');
  if (strokeLinejoin !== null) base.strokeLinejoin = strokeLinejoin as 'miter' | 'round' | 'bevel';

  const strokeMiterlimit = get('stroke-miterlimit');
  if (strokeMiterlimit !== null) base.strokeMiterlimit = parseFloat(strokeMiterlimit);

  const strokeDasharray = get('stroke-dasharray');
  if (strokeDasharray !== null) {
    if (strokeDasharray === 'none') {
      base.strokeDasharray = null;
    } else {
      base.strokeDasharray = strokeDasharray.split(/[\s,]+/).filter(Boolean).map(Number);
    }
  }

  const strokeDashoffset = get('stroke-dashoffset');
  if (strokeDashoffset !== null) base.strokeDashoffset = parseFloat(strokeDashoffset);

  const display = get('display');
  if (display !== null) base.display = display;

  const visibility = get('visibility');
  if (visibility !== null) base.visibility = visibility;

  return base;
}

function parseInlineStyle(style: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!style) return result;

  for (const declaration of style.split(';')) {
    const [prop, ...valueParts] = declaration.split(':');
    if (prop && valueParts.length > 0) {
      result[prop.trim()] = valueParts.join(':').trim();
    }
  }
  return result;
}

// ============================================================================
// URL Reference Parsing
// ============================================================================

/**
 * Parse a url(#id) reference from an SVG attribute value.
 * Returns the referenced ID or null.
 */
export function parseUrlRef(value: string): string | null {
  const match = value.match(/url\(\s*['"]?#([^'")\s]+)['"]?\s*\)/);
  return match ? match[1]! : null;
}

// ============================================================================
// Helpers
// ============================================================================

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Parse SVG points attribute (used by polygon/polyline).
 * Format: "x1,y1 x2,y2 ..." or "x1 y1 x2 y2 ..."
 */
export function parseSvgPoints(pointsAttr: string): Vector2[] {
  const numbers = pointsAttr.trim().split(/[\s,]+/).filter(Boolean).map(Number);
  const points: Vector2[] = [];
  for (let i = 0; i + 1 < numbers.length; i += 2) {
    points.push({ x: numbers[i]!, y: numbers[i + 1]! });
  }
  return points;
}
