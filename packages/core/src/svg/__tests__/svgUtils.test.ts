import { describe, it, expect } from 'vitest';
import {
  parseSvgColor, parseSvgTransform, parseSvgLength,
  parseUrlRef, parseSvgPoints, resolveStyle,
} from '../svgUtils';

// ============================================================================
// parseSvgColor
// ============================================================================

describe('parseSvgColor', () => {
  it('parses 3-digit hex', () => {
    expect(parseSvgColor('#f00')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(parseSvgColor('#abc')).toEqual({ r: 170, g: 187, b: 204, a: 1 });
  });

  it('parses 6-digit hex', () => {
    expect(parseSvgColor('#ff0000')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(parseSvgColor('#123456')).toEqual({ r: 18, g: 52, b: 86, a: 1 });
  });

  it('parses 8-digit hex with alpha', () => {
    const c = parseSvgColor('#ff000080');
    expect(c).toBeTruthy();
    expect(c!.r).toBe(255);
    expect(c!.a).toBeCloseTo(0.502, 2);
  });

  it('parses 4-digit hex with alpha', () => {
    const c = parseSvgColor('#f008');
    expect(c).toBeTruthy();
    expect(c!.r).toBe(255);
    expect(c!.a).toBeCloseTo(0.533, 2);
  });

  it('parses rgb()', () => {
    expect(parseSvgColor('rgb(255, 128, 0)')).toEqual({ r: 255, g: 128, b: 0, a: 1 });
  });

  it('parses rgba()', () => {
    const c = parseSvgColor('rgba(255, 128, 0, 0.5)');
    expect(c).toEqual({ r: 255, g: 128, b: 0, a: 0.5 });
  });

  it('parses rgb with percentages', () => {
    const c = parseSvgColor('rgb(100%, 0%, 50%)');
    expect(c).toBeTruthy();
    expect(c!.r).toBe(255);
    expect(c!.g).toBe(0);
    expect(c!.b).toBe(128);
  });

  it('parses hsl()', () => {
    const c = parseSvgColor('hsl(0, 100%, 50%)');
    expect(c).toBeTruthy();
    expect(c!.r).toBe(255);
    expect(c!.g).toBe(0);
    expect(c!.b).toBe(0);
  });

  it('parses hsla()', () => {
    const c = parseSvgColor('hsla(120, 100%, 50%, 0.75)');
    expect(c).toBeTruthy();
    expect(c!.r).toBe(0);
    expect(c!.g).toBe(255);
    expect(c!.b).toBe(0);
    expect(c!.a).toBe(0.75);
  });

  it('parses named colors', () => {
    expect(parseSvgColor('red')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(parseSvgColor('blue')).toEqual({ r: 0, g: 0, b: 255, a: 1 });
    expect(parseSvgColor('white')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseSvgColor('cornflowerblue')).toEqual({ r: 100, g: 149, b: 237, a: 1 });
  });

  it('returns null for none', () => {
    expect(parseSvgColor('none')).toBeNull();
  });

  it('returns null for inherit', () => {
    expect(parseSvgColor('inherit')).toBeNull();
  });

  it('returns transparent color for transparent', () => {
    expect(parseSvgColor('transparent')).toEqual({ r: 0, g: 0, b: 0, a: 0 });
  });

  it('returns null for empty string', () => {
    expect(parseSvgColor('')).toBeNull();
  });

  it('returns null for invalid', () => {
    expect(parseSvgColor('notacolor')).toBeNull();
  });

  it('is case insensitive', () => {
    expect(parseSvgColor('RED')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(parseSvgColor('#FF0000')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
  });

  it('trims whitespace', () => {
    expect(parseSvgColor('  #ff0000  ')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
  });

  it('handles hsl blue (240°)', () => {
    const c = parseSvgColor('hsl(240, 100%, 50%)');
    expect(c).toBeTruthy();
    expect(c!.r).toBe(0);
    expect(c!.g).toBe(0);
    expect(c!.b).toBe(255);
  });
});

// ============================================================================
// parseSvgTransform
// ============================================================================

describe('parseSvgTransform', () => {
  it('returns default for empty string', () => {
    const t = parseSvgTransform('');
    expect(t.position).toEqual({ x: 0, y: 0 });
    expect(t.rotation).toBeCloseTo(0);
    expect(t.scale).toEqual({ x: 1, y: 1 });
  });

  it('parses translate(tx, ty)', () => {
    const t = parseSvgTransform('translate(100, 200)');
    expect(t.position.x).toBeCloseTo(100);
    expect(t.position.y).toBeCloseTo(200);
  });

  it('parses translate with single arg (ty=0)', () => {
    const t = parseSvgTransform('translate(50)');
    expect(t.position.x).toBeCloseTo(50);
    expect(t.position.y).toBeCloseTo(0);
  });

  it('parses scale(sx, sy)', () => {
    const t = parseSvgTransform('scale(2, 3)');
    expect(t.scale.x).toBeCloseTo(2);
    expect(t.scale.y).toBeCloseTo(3);
  });

  it('parses scale with single arg (uniform)', () => {
    const t = parseSvgTransform('scale(2)');
    expect(t.scale.x).toBeCloseTo(2);
    expect(t.scale.y).toBeCloseTo(2);
  });

  it('parses rotate(deg)', () => {
    const t = parseSvgTransform('rotate(45)');
    expect(t.rotation).toBeCloseTo(45);
  });

  it('parses rotate(deg, cx, cy)', () => {
    // rotate(90, 50, 50) = translate(50,50) rotate(90) translate(-50,-50)
    // After composing: position should reflect the combined transform
    const t = parseSvgTransform('rotate(90, 50, 50)');
    expect(t.rotation).toBeCloseTo(90);
  });

  it('parses skewX(deg)', () => {
    const t = parseSvgTransform('skewX(30)');
    expect(t.skew.x).toBeCloseTo(30, 0);
  });

  it('parses matrix(a,b,c,d,e,f)', () => {
    // Identity matrix
    const t = parseSvgTransform('matrix(1,0,0,1,10,20)');
    expect(t.position.x).toBeCloseTo(10);
    expect(t.position.y).toBeCloseTo(20);
    expect(t.rotation).toBeCloseTo(0);
  });

  it('parses combined transforms', () => {
    const t = parseSvgTransform('translate(100, 0) scale(2)');
    expect(t.position.x).toBeCloseTo(100);
    expect(t.scale.x).toBeCloseTo(2);
  });
});

// ============================================================================
// parseSvgLength
// ============================================================================

describe('parseSvgLength', () => {
  it('parses unitless numbers', () => {
    expect(parseSvgLength('42')).toBe(42);
  });

  it('parses px values', () => {
    expect(parseSvgLength('100px')).toBe(100);
  });

  it('parses pt values (1pt = 1.333px)', () => {
    expect(parseSvgLength('12pt')).toBeCloseTo(16);
  });

  it('parses em values (1em ≈ 16px)', () => {
    expect(parseSvgLength('2em')).toBe(32);
  });

  it('parses percentage with reference', () => {
    expect(parseSvgLength('50%', 200)).toBe(100);
  });

  it('returns 0 for empty', () => {
    expect(parseSvgLength('')).toBe(0);
  });

  it('returns 0 for non-numeric', () => {
    expect(parseSvgLength('abc')).toBe(0);
  });
});

// ============================================================================
// parseUrlRef
// ============================================================================

describe('parseUrlRef', () => {
  it('parses url(#id)', () => {
    expect(parseUrlRef('url(#myGradient)')).toBe('myGradient');
  });

  it('parses url with quotes', () => {
    expect(parseUrlRef("url('#myGrad')")).toBe('myGrad');
    expect(parseUrlRef('url("#myGrad")')).toBe('myGrad');
  });

  it('returns null for non-url', () => {
    expect(parseUrlRef('#ff0000')).toBeNull();
    expect(parseUrlRef('red')).toBeNull();
  });
});

// ============================================================================
// parseSvgPoints
// ============================================================================

describe('parseSvgPoints', () => {
  it('parses comma-separated points', () => {
    expect(parseSvgPoints('10,20 30,40 50,60')).toEqual([
      { x: 10, y: 20 },
      { x: 30, y: 40 },
      { x: 50, y: 60 },
    ]);
  });

  it('parses space-separated points', () => {
    expect(parseSvgPoints('10 20 30 40')).toEqual([
      { x: 10, y: 20 },
      { x: 30, y: 40 },
    ]);
  });

  it('handles empty string', () => {
    expect(parseSvgPoints('')).toEqual([]);
  });
});

// ============================================================================
// resolveStyle
// ============================================================================

describe('resolveStyle', () => {
  it('resolves presentation attributes', () => {
    const doc = new DOMParser().parseFromString(
      '<svg><rect fill="red" stroke="blue" stroke-width="2" /></svg>',
      'image/svg+xml'
    );
    const rect = doc.querySelector('rect')!;
    const style = resolveStyle(rect);
    expect(style.fill).toBe('red');
    expect(style.stroke).toBe('blue');
    expect(style.strokeWidth).toBe(2);
  });

  it('inline style overrides attributes', () => {
    const doc = new DOMParser().parseFromString(
      '<svg><rect fill="red" style="fill:blue" /></svg>',
      'image/svg+xml'
    );
    const rect = doc.querySelector('rect')!;
    const style = resolveStyle(rect);
    expect(style.fill).toBe('blue');
  });

  it('inherits from parent style', () => {
    const parentStyle = {
      fill: 'green',
      fillOpacity: 0.5,
      stroke: null,
      strokeWidth: 1,
      strokeOpacity: 1,
      strokeLinecap: 'butt' as const,
      strokeLinejoin: 'miter' as const,
      strokeMiterlimit: 4,
      strokeDasharray: null,
      strokeDashoffset: 0,
      opacity: 0.8,
      display: 'inline',
      visibility: 'visible',
    };
    const doc = new DOMParser().parseFromString(
      '<svg><rect /></svg>',
      'image/svg+xml'
    );
    const rect = doc.querySelector('rect')!;
    const style = resolveStyle(rect, parentStyle);
    expect(style.fill).toBe('green');
    expect(style.opacity).toBe(0.8);
  });

  it('handles fill=none', () => {
    const doc = new DOMParser().parseFromString(
      '<svg><rect fill="none" /></svg>',
      'image/svg+xml'
    );
    const rect = doc.querySelector('rect')!;
    const style = resolveStyle(rect);
    expect(style.fill).toBeNull();
  });

  it('resolves stroke-dasharray', () => {
    const doc = new DOMParser().parseFromString(
      '<svg><line stroke-dasharray="5,10,5" /></svg>',
      'image/svg+xml'
    );
    const line = doc.querySelector('line')!;
    const style = resolveStyle(line);
    expect(style.strokeDasharray).toEqual([5, 10, 5]);
  });
});
