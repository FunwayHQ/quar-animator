/**
 * Easing functions for animation interpolation
 */

import type { EasingFunction, EasingType } from '@quar/types';

// ============================================================================
// Power Functions
// ============================================================================

const easeInQuad = (t: number): number => t * t;
const easeOutQuad = (t: number): number => t * (2 - t);
const easeInOutQuad = (t: number): number => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);

const easeInCubic = (t: number): number => t * t * t;
const easeOutCubic = (t: number): number => (t - 1) * (t - 1) * (t - 1) + 1;
const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;

const easeInQuart = (t: number): number => t * t * t * t;
const easeOutQuart = (t: number): number => 1 - (t - 1) * (t - 1) * (t - 1) * (t - 1);
const easeInOutQuart = (t: number): number =>
  t < 0.5 ? 8 * t * t * t * t : 1 - 8 * (t - 1) * (t - 1) * (t - 1) * (t - 1);

const easeInQuint = (t: number): number => t * t * t * t * t;
const easeOutQuint = (t: number): number => 1 + (t - 1) * (t - 1) * (t - 1) * (t - 1) * (t - 1);
const easeInOutQuint = (t: number): number =>
  t < 0.5 ? 16 * t * t * t * t * t : 1 + 16 * (t - 1) * (t - 1) * (t - 1) * (t - 1) * (t - 1);

// ============================================================================
// Exponential Functions
// ============================================================================

const easeInExpo = (t: number): number => (t === 0 ? 0 : Math.pow(2, 10 * (t - 1)));
const easeOutExpo = (t: number): number => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));
const easeInOutExpo = (t: number): number => {
  if (t === 0) return 0;
  if (t === 1) return 1;
  if (t < 0.5) return Math.pow(2, 20 * t - 10) / 2;
  return (2 - Math.pow(2, -20 * t + 10)) / 2;
};

// ============================================================================
// Circular Functions
// ============================================================================

const easeInCirc = (t: number): number => 1 - Math.sqrt(1 - t * t);
const easeOutCirc = (t: number): number => Math.sqrt(1 - (t - 1) * (t - 1));
const easeInOutCirc = (t: number): number =>
  t < 0.5
    ? (1 - Math.sqrt(1 - 4 * t * t)) / 2
    : (Math.sqrt(1 - (-2 * t + 2) * (-2 * t + 2)) + 1) / 2;

// ============================================================================
// Back Functions
// ============================================================================

const c1 = 1.70158;
const c2 = c1 * 1.525;
const c3 = c1 + 1;

const easeInBack = (t: number): number => c3 * t * t * t - c1 * t * t;
const easeOutBack = (t: number): number => 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
const easeInOutBack = (t: number): number =>
  t < 0.5
    ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
    : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2;

// ============================================================================
// Elastic Functions
// ============================================================================

const c4 = (2 * Math.PI) / 3;
const c5 = (2 * Math.PI) / 4.5;

const easeInElastic = (t: number): number => {
  if (t === 0) return 0;
  if (t === 1) return 1;
  return -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * c4);
};

const easeOutElastic = (t: number): number => {
  if (t === 0) return 0;
  if (t === 1) return 1;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
};

const easeInOutElastic = (t: number): number => {
  if (t === 0) return 0;
  if (t === 1) return 1;
  if (t < 0.5) {
    return -(Math.pow(2, 20 * t - 10) * Math.sin((20 * t - 11.125) * c5)) / 2;
  }
  return (Math.pow(2, -20 * t + 10) * Math.sin((20 * t - 11.125) * c5)) / 2 + 1;
};

// ============================================================================
// Bounce Functions
// ============================================================================

const easeOutBounce = (t: number): number => {
  const n1 = 7.5625;
  const d1 = 2.75;

  if (t < 1 / d1) {
    return n1 * t * t;
  } else if (t < 2 / d1) {
    return n1 * (t -= 1.5 / d1) * t + 0.75;
  } else if (t < 2.5 / d1) {
    return n1 * (t -= 2.25 / d1) * t + 0.9375;
  } else {
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  }
};

const easeInBounce = (t: number): number => 1 - easeOutBounce(1 - t);

const easeInOutBounce = (t: number): number =>
  t < 0.5 ? (1 - easeOutBounce(1 - 2 * t)) / 2 : (1 + easeOutBounce(2 * t - 1)) / 2;

// ============================================================================
// Cubic Bezier
// ============================================================================

const cubicBezierCache = new Map<string, (t: number) => number>();

function getCachedCubicBezier(
  x1: number,
  y1: number,
  x2: number,
  y2: number
): (t: number) => number {
  const key = `${x1},${y1},${x2},${y2}`;
  let fn = cubicBezierCache.get(key);
  if (!fn) {
    fn = cubicBezier(x1, y1, x2, y2);
    cubicBezierCache.set(key, fn);
  }
  return fn;
}

function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  // Coefficients for x(t) = at^3 + bt^2 + ct where a,b,c derived from control points
  const ax = 1 - 3 * x2 + 3 * x1;
  const bx = 3 * x2 - 6 * x1;
  const cx = 3 * x1;

  const ay = 1 - 3 * y2 + 3 * y1;
  const by = 3 * y2 - 6 * y1;
  const cy = 3 * y1;

  // Newton-Raphson iteration for finding t given x
  const sampleCurveX = (t: number): number => {
    return ((ax * t + bx) * t + cx) * t;
  };

  const sampleCurveY = (t: number): number => {
    return ((ay * t + by) * t + cy) * t;
  };

  const sampleCurveDerivativeX = (t: number): number => {
    return (3 * ax * t + 2 * bx) * t + cx;
  };

  const solveCurveX = (x: number): number => {
    // Newton-Raphson iteration
    let t = x;
    for (let i = 0; i < 8; i++) {
      const xEst = sampleCurveX(t) - x;
      if (Math.abs(xEst) < 1e-6) return t;
      const d = sampleCurveDerivativeX(t);
      if (Math.abs(d) < 1e-6) break;
      t = t - xEst / d;
    }

    // Bisection fallback for when Newton-Raphson fails to converge
    let lo = 0;
    let hi = 1;
    t = x;
    for (let i = 0; i < 20; i++) {
      const xEst = sampleCurveX(t) - x;
      if (Math.abs(xEst) < 1e-6) return t;
      if (xEst > 0) {
        hi = t;
      } else {
        lo = t;
      }
      t = (lo + hi) / 2;
    }
    return t;
  };

  return (x: number): number => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    return sampleCurveY(solveCurveX(x));
  };
}

// ============================================================================
// Easing Map
// ============================================================================

const easingFunctions: Record<EasingType, (t: number) => number> = {
  linear: (t) => t,
  easeInQuad,
  easeOutQuad,
  easeInOutQuad,
  easeInCubic,
  easeOutCubic,
  easeInOutCubic,
  easeInQuart,
  easeOutQuart,
  easeInOutQuart,
  easeInQuint,
  easeOutQuint,
  easeInOutQuint,
  easeInExpo,
  easeOutExpo,
  easeInOutExpo,
  easeInCirc,
  easeOutCirc,
  easeInOutCirc,
  easeInBack,
  easeOutBack,
  easeInOutBack,
  easeInElastic,
  easeOutElastic,
  easeInOutElastic,
  easeInBounce,
  easeOutBounce,
  easeInOutBounce,
};

// ============================================================================
// Public API
// ============================================================================

/**
 * Apply an easing function to a normalized time value (0-1)
 */
export function applyEasing(t: number, easing: EasingFunction): number {
  if (typeof easing === 'string') {
    const fn = easingFunctions[easing];
    return fn ? fn(t) : t;
  }

  if (easing.type === 'cubicBezier') {
    const [x1, y1, x2, y2] = easing.points;
    return getCachedCubicBezier(x1, y1, x2, y2)(t);
  }

  return t;
}

/**
 * Get all available easing types
 */
export function getEasingTypes(): EasingType[] {
  return Object.keys(easingFunctions) as EasingType[];
}

/**
 * Get easing function by name
 */
export function getEasingFunction(easing: EasingFunction): (t: number) => number {
  if (typeof easing === 'string') {
    return easingFunctions[easing] ?? ((t) => t);
  }

  if (easing.type === 'cubicBezier') {
    const [x1, y1, x2, y2] = easing.points;
    return getCachedCubicBezier(x1, y1, x2, y2);
  }

  return (t) => t;
}

/**
 * Create a cubic bezier easing function
 */
export function createCubicBezier(x1: number, y1: number, x2: number, y2: number): EasingFunction {
  return {
    type: 'cubicBezier',
    points: [x1, y1, x2, y2],
  };
}

// Common cubic bezier presets
export const EASE = createCubicBezier(0.25, 0.1, 0.25, 1);
export const EASE_IN = createCubicBezier(0.42, 0, 1, 1);
export const EASE_OUT = createCubicBezier(0, 0, 0.58, 1);
export const EASE_IN_OUT = createCubicBezier(0.42, 0, 0.58, 1);

// ============================================================================
// SVG Path Generation
// ============================================================================

/**
 * Sample an easing function and return an SVG path `d` string.
 * Maps t→x (left to right), f(t)→y (SVG Y-down: 0 at top, height at bottom).
 */
export function easingToSvgPath(
  easing: EasingFunction,
  width: number = 100,
  height: number = 100,
  samples: number = 64
): string {
  const fn = getEasingFunction(easing);
  const parts: string[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const v = fn(t);
    const x = (t * width).toFixed(2);
    const y = ((1 - v) * height).toFixed(2);
    parts.push(`${i === 0 ? 'M' : 'L'}${x},${y}`);
  }
  return parts.join(' ');
}

// ============================================================================
// Easing Categories & Display Names
// ============================================================================

export interface EasingCategoryItem {
  label: string;
  value: EasingFunction;
}

export interface EasingCategory {
  name: string;
  items: EasingCategoryItem[];
}

export const EASING_CATEGORIES: EasingCategory[] = [
  {
    name: 'CSS Standard',
    items: [
      { label: 'Linear', value: 'linear' },
      { label: 'Ease', value: EASE },
      { label: 'Ease In', value: EASE_IN },
      { label: 'Ease Out', value: EASE_OUT },
      { label: 'Ease In Out', value: EASE_IN_OUT },
    ],
  },
  {
    name: 'Power',
    items: [
      { label: 'In Quad', value: 'easeInQuad' },
      { label: 'Out Quad', value: 'easeOutQuad' },
      { label: 'In Out Quad', value: 'easeInOutQuad' },
      { label: 'In Cubic', value: 'easeInCubic' },
      { label: 'Out Cubic', value: 'easeOutCubic' },
      { label: 'In Out Cubic', value: 'easeInOutCubic' },
      { label: 'In Quart', value: 'easeInQuart' },
      { label: 'Out Quart', value: 'easeOutQuart' },
      { label: 'In Out Quart', value: 'easeInOutQuart' },
      { label: 'In Quint', value: 'easeInQuint' },
      { label: 'Out Quint', value: 'easeOutQuint' },
      { label: 'In Out Quint', value: 'easeInOutQuint' },
    ],
  },
  {
    name: 'Expo & Circ',
    items: [
      { label: 'In Expo', value: 'easeInExpo' },
      { label: 'Out Expo', value: 'easeOutExpo' },
      { label: 'In Out Expo', value: 'easeInOutExpo' },
      { label: 'In Circ', value: 'easeInCirc' },
      { label: 'Out Circ', value: 'easeOutCirc' },
      { label: 'In Out Circ', value: 'easeInOutCirc' },
    ],
  },
  {
    name: 'Back',
    items: [
      { label: 'In Back', value: 'easeInBack' },
      { label: 'Out Back', value: 'easeOutBack' },
      { label: 'In Out Back', value: 'easeInOutBack' },
    ],
  },
  {
    name: 'Elastic & Bounce',
    items: [
      { label: 'In Elastic', value: 'easeInElastic' },
      { label: 'Out Elastic', value: 'easeOutElastic' },
      { label: 'In Out Elastic', value: 'easeInOutElastic' },
      { label: 'In Bounce', value: 'easeInBounce' },
      { label: 'Out Bounce', value: 'easeOutBounce' },
      { label: 'In Out Bounce', value: 'easeInOutBounce' },
    ],
  },
];

const EASING_DISPLAY_NAMES: Record<EasingType, string> = {
  linear: 'Linear',
  easeInQuad: 'Ease In Quad',
  easeOutQuad: 'Ease Out Quad',
  easeInOutQuad: 'Ease In Out Quad',
  easeInCubic: 'Ease In Cubic',
  easeOutCubic: 'Ease Out Cubic',
  easeInOutCubic: 'Ease In Out Cubic',
  easeInQuart: 'Ease In Quart',
  easeOutQuart: 'Ease Out Quart',
  easeInOutQuart: 'Ease In Out Quart',
  easeInQuint: 'Ease In Quint',
  easeOutQuint: 'Ease Out Quint',
  easeInOutQuint: 'Ease In Out Quint',
  easeInExpo: 'Ease In Expo',
  easeOutExpo: 'Ease Out Expo',
  easeInOutExpo: 'Ease In Out Expo',
  easeInCirc: 'Ease In Circ',
  easeOutCirc: 'Ease Out Circ',
  easeInOutCirc: 'Ease In Out Circ',
  easeInBack: 'Ease In Back',
  easeOutBack: 'Ease Out Back',
  easeInOutBack: 'Ease In Out Back',
  easeInElastic: 'Ease In Elastic',
  easeOutElastic: 'Ease Out Elastic',
  easeInOutElastic: 'Ease In Out Elastic',
  easeInBounce: 'Ease In Bounce',
  easeOutBounce: 'Ease Out Bounce',
  easeInOutBounce: 'Ease In Out Bounce',
};

/**
 * Get a human-readable display name for an easing function.
 */
export function getEasingDisplayName(easing: EasingFunction): string {
  if (typeof easing === 'string') {
    return EASING_DISPLAY_NAMES[easing] ?? easing;
  }
  if (easing.type === 'cubicBezier') {
    const [x1, y1, x2, y2] = easing.points;
    // Check if it matches a known CSS preset
    if (x1 === 0.25 && y1 === 0.1 && x2 === 0.25 && y2 === 1) return 'Ease';
    if (x1 === 0.42 && y1 === 0 && x2 === 1 && y2 === 1) return 'Ease In';
    if (x1 === 0 && y1 === 0 && x2 === 0.58 && y2 === 1) return 'Ease Out';
    if (x1 === 0.42 && y1 === 0 && x2 === 0.58 && y2 === 1) return 'Ease In Out';
    return `cubic-bezier(${x1}, ${y1}, ${x2}, ${y2})`;
  }
  return 'Linear';
}

/**
 * Check if an easing is a cubic bezier (either named CSS preset or explicit).
 * Returns the [x1, y1, x2, y2] control points, or null for non-bezier easings.
 */
export function easingToBezierPoints(
  easing: EasingFunction
): [number, number, number, number] | null {
  if (typeof easing === 'string') {
    // Named easings are NOT cubic bezier representable (Bounce, Elastic, etc.)
    // Except linear which is trivially representable
    if (easing === 'linear') return [0, 0, 1, 1];
    return null;
  }
  if (easing.type === 'cubicBezier') {
    return easing.points;
  }
  return null;
}
