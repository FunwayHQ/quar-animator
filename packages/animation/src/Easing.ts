/**
 * Easing functions for animation interpolation
 */

import type { EasingFunction, EasingType } from '@quar/types';

// ============================================================================
// Power Functions
// ============================================================================

const easeInQuad = (t: number): number => t * t;
const easeOutQuad = (t: number): number => t * (2 - t);
const easeInOutQuad = (t: number): number =>
  t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

const easeInCubic = (t: number): number => t * t * t;
const easeOutCubic = (t: number): number => --t * t * t + 1;
const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;

const easeInQuart = (t: number): number => t * t * t * t;
const easeOutQuart = (t: number): number => 1 - --t * t * t * t;
const easeInOutQuart = (t: number): number =>
  t < 0.5 ? 8 * t * t * t * t : 1 - 8 * --t * t * t * t;

const easeInQuint = (t: number): number => t * t * t * t * t;
const easeOutQuint = (t: number): number => 1 + --t * t * t * t * t;
const easeInOutQuint = (t: number): number =>
  t < 0.5 ? 16 * t * t * t * t * t : 1 + 16 * --t * t * t * t * t;

// ============================================================================
// Exponential Functions
// ============================================================================

const easeInExpo = (t: number): number =>
  t === 0 ? 0 : Math.pow(2, 10 * (t - 1));
const easeOutExpo = (t: number): number =>
  t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
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
const easeOutCirc = (t: number): number => Math.sqrt(1 - --t * t);
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
const easeOutBack = (t: number): number =>
  1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
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
  t < 0.5
    ? (1 - easeOutBounce(1 - 2 * t)) / 2
    : (1 + easeOutBounce(2 * t - 1)) / 2;

// ============================================================================
// Cubic Bezier
// ============================================================================

function cubicBezier(
  x1: number,
  y1: number,
  x2: number,
  y2: number
): (t: number) => number {
  // Newton-Raphson iteration for finding t given x
  const sampleCurveX = (t: number): number => {
    return ((1 - 3 * x2 + 3 * x1) * t + (3 * x2 - 6 * x1)) * t + 3 * x1;
  };

  const sampleCurveY = (t: number): number => {
    return ((1 - 3 * y2 + 3 * y1) * t + (3 * y2 - 6 * y1)) * t + 3 * y1;
  };

  const sampleCurveDerivativeX = (t: number): number => {
    return (3 - 9 * x2 + 9 * x1) * t * t + (6 * x2 - 12 * x1) * t + 3 * x1;
  };

  const solveCurveX = (x: number): number => {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const xEst = sampleCurveX(t) - x;
      if (Math.abs(xEst) < 1e-6) return t;
      const d = sampleCurveDerivativeX(t);
      if (Math.abs(d) < 1e-6) break;
      t = t - xEst / d;
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
    return cubicBezier(x1, y1, x2, y2)(t);
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
export function getEasingFunction(
  easing: EasingFunction
): (t: number) => number {
  if (typeof easing === 'string') {
    return easingFunctions[easing] ?? ((t) => t);
  }

  if (easing.type === 'cubicBezier') {
    const [x1, y1, x2, y2] = easing.points;
    return cubicBezier(x1, y1, x2, y2);
  }

  return (t) => t;
}

/**
 * Create a cubic bezier easing function
 */
export function createCubicBezier(
  x1: number,
  y1: number,
  x2: number,
  y2: number
): EasingFunction {
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
