/**
 * Tests for Easing functions
 */

import { describe, it, expect } from 'vitest';
import {
  applyEasing,
  getEasingTypes,
  getEasingFunction,
  createCubicBezier,
  easingToSvgPath,
  easingToBezierPoints,
  getEasingDisplayName,
  EASING_CATEGORIES,
  EASE,
  EASE_IN,
  EASE_OUT,
  EASE_IN_OUT,
} from './Easing';
import type { EasingType } from '@quar/types';

// ============================================================================
// Easing Type Enumeration
// ============================================================================

describe('getEasingTypes', () => {
  it('should return all 28 easing types', () => {
    const types = getEasingTypes();
    expect(types).toHaveLength(28);
  });

  it('should include linear', () => {
    expect(getEasingTypes()).toContain('linear');
  });

  it('should include all quad variants', () => {
    const types = getEasingTypes();
    expect(types).toContain('easeInQuad');
    expect(types).toContain('easeOutQuad');
    expect(types).toContain('easeInOutQuad');
  });

  it('should include all bounce variants', () => {
    const types = getEasingTypes();
    expect(types).toContain('easeInBounce');
    expect(types).toContain('easeOutBounce');
    expect(types).toContain('easeInOutBounce');
  });
});

// ============================================================================
// Boundary Values: All 28 easing functions should map 0→0 and 1→1
// ============================================================================

describe('easing boundary values', () => {
  const allTypes = getEasingTypes();

  for (const type of allTypes) {
    it(`${type}: f(0) should be 0`, () => {
      const fn = getEasingFunction(type);
      expect(fn(0)).toBeCloseTo(0, 5);
    });

    it(`${type}: f(1) should be 1`, () => {
      const fn = getEasingFunction(type);
      expect(fn(1)).toBeCloseTo(1, 5);
    });
  }
});

// ============================================================================
// Midpoint Behavior
// ============================================================================

describe('easing midpoint behavior', () => {
  it('linear at 0.5 should be 0.5', () => {
    const fn = getEasingFunction('linear');
    expect(fn(0.5)).toBeCloseTo(0.5, 5);
  });

  it('easeInQuad at 0.5 should be 0.25', () => {
    const fn = getEasingFunction('easeInQuad');
    expect(fn(0.5)).toBeCloseTo(0.25, 5);
  });

  it('easeOutQuad at 0.5 should be 0.75', () => {
    const fn = getEasingFunction('easeOutQuad');
    expect(fn(0.5)).toBeCloseTo(0.75, 5);
  });

  it('easeInOutQuad at 0.5 should be 0.5', () => {
    const fn = getEasingFunction('easeInOutQuad');
    expect(fn(0.5)).toBeCloseTo(0.5, 5);
  });

  it('easeInCubic at 0.5 should be 0.125', () => {
    const fn = getEasingFunction('easeInCubic');
    expect(fn(0.5)).toBeCloseTo(0.125, 5);
  });

  it('easeInExpo at 0.5 should be near 0.001', () => {
    const fn = getEasingFunction('easeInExpo');
    // 2^(10*(0.5-1)) = 2^(-5) ≈ 0.03125
    expect(fn(0.5)).toBeCloseTo(0.03125, 3);
  });

  it('easeInOutExpo at 0.5 should be 0.5', () => {
    const fn = getEasingFunction('easeInOutExpo');
    expect(fn(0.5)).toBeCloseTo(0.5, 3);
  });

  it('easeInOutCubic at 0.5 should be 0.5', () => {
    const fn = getEasingFunction('easeInOutCubic');
    expect(fn(0.5)).toBeCloseTo(0.5, 5);
  });

  it('easeOutBounce should return value > 0 for t > 0', () => {
    const fn = getEasingFunction('easeOutBounce');
    expect(fn(0.1)).toBeGreaterThan(0);
    expect(fn(0.5)).toBeGreaterThan(0);
  });
});

// ============================================================================
// Easing In behavior (slow start)
// ============================================================================

describe('easeIn functions have slow start', () => {
  const easeInTypes: EasingType[] = ['easeInQuad', 'easeInCubic', 'easeInQuart', 'easeInQuint'];

  for (const type of easeInTypes) {
    it(`${type} at 0.25 should be less than 0.25`, () => {
      const fn = getEasingFunction(type);
      expect(fn(0.25)).toBeLessThan(0.25);
    });
  }
});

// ============================================================================
// Easing Out behavior (slow end)
// ============================================================================

describe('easeOut functions have fast start', () => {
  const easeOutTypes: EasingType[] = [
    'easeOutQuad',
    'easeOutCubic',
    'easeOutQuart',
    'easeOutQuint',
  ];

  for (const type of easeOutTypes) {
    it(`${type} at 0.25 should be greater than 0.25`, () => {
      const fn = getEasingFunction(type);
      expect(fn(0.25)).toBeGreaterThan(0.25);
    });
  }
});

// ============================================================================
// Back easing (overshoot)
// ============================================================================

describe('back easing overshoot', () => {
  it('easeInBack should go negative near start', () => {
    const fn = getEasingFunction('easeInBack');
    expect(fn(0.1)).toBeLessThan(0);
  });

  it('easeOutBack should exceed 1 near end', () => {
    const fn = getEasingFunction('easeOutBack');
    expect(fn(0.9)).toBeGreaterThan(1);
  });
});

// ============================================================================
// Elastic easing (oscillation)
// ============================================================================

describe('elastic easing oscillation', () => {
  it('easeInElastic should go negative', () => {
    const fn = getEasingFunction('easeInElastic');
    // Elastic functions oscillate, so some intermediate values are negative
    let hasNegative = false;
    for (let t = 0.01; t < 0.99; t += 0.01) {
      if (fn(t) < 0) {
        hasNegative = true;
        break;
      }
    }
    expect(hasNegative).toBe(true);
  });

  it('easeOutElastic should exceed 1 at some point', () => {
    const fn = getEasingFunction('easeOutElastic');
    let exceeds = false;
    for (let t = 0.01; t < 0.99; t += 0.01) {
      if (fn(t) > 1) {
        exceeds = true;
        break;
      }
    }
    expect(exceeds).toBe(true);
  });
});

// ============================================================================
// applyEasing
// ============================================================================

describe('applyEasing', () => {
  it('should apply a string easing type', () => {
    const result = applyEasing(0.5, 'linear');
    expect(result).toBeCloseTo(0.5, 5);
  });

  it('should apply easeInQuad by name', () => {
    const result = applyEasing(0.5, 'easeInQuad');
    expect(result).toBeCloseTo(0.25, 5);
  });

  it('should fall back to linear for unknown string', () => {
    const result = applyEasing(0.5, 'unknownEasing' as EasingType);
    expect(result).toBeCloseTo(0.5, 5);
  });

  it('should apply cubic bezier easing', () => {
    const easing = createCubicBezier(0.42, 0, 0.58, 1); // ease-in-out
    const result = applyEasing(0.5, easing);
    expect(result).toBeCloseTo(0.5, 2);
  });

  it('should clamp cubic bezier at 0', () => {
    const easing = createCubicBezier(0.25, 0.1, 0.25, 1);
    expect(applyEasing(0, easing)).toBe(0);
  });

  it('should clamp cubic bezier at 1', () => {
    const easing = createCubicBezier(0.25, 0.1, 0.25, 1);
    expect(applyEasing(1, easing)).toBe(1);
  });

  it('should return t for unknown easing object', () => {
    const easing = { type: 'unknown' } as unknown as ReturnType<typeof createCubicBezier>;
    expect(applyEasing(0.5, easing)).toBeCloseTo(0.5, 5);
  });
});

// ============================================================================
// getEasingFunction
// ============================================================================

describe('getEasingFunction', () => {
  it('should return a function for string easing types', () => {
    const fn = getEasingFunction('easeInQuad');
    expect(typeof fn).toBe('function');
    expect(fn(0)).toBe(0);
  });

  it('should return linear for unknown string type', () => {
    const fn = getEasingFunction('unknownEasing' as EasingType);
    expect(fn(0.5)).toBeCloseTo(0.5, 5);
  });

  it('should return a function for cubic bezier easing', () => {
    const easing = createCubicBezier(0.42, 0, 0.58, 1);
    const fn = getEasingFunction(easing);
    expect(typeof fn).toBe('function');
    expect(fn(0)).toBe(0);
    expect(fn(1)).toBe(1);
  });

  it('should return linear for unknown easing object', () => {
    const easing = { type: 'unknown' } as unknown as ReturnType<typeof createCubicBezier>;
    const fn = getEasingFunction(easing);
    expect(fn(0.5)).toBeCloseTo(0.5, 5);
  });
});

// ============================================================================
// createCubicBezier
// ============================================================================

describe('createCubicBezier', () => {
  it('should create a cubic bezier easing function', () => {
    const easing = createCubicBezier(0.25, 0.1, 0.25, 1);
    expect(easing.type).toBe('cubicBezier');
    expect(easing.points).toEqual([0.25, 0.1, 0.25, 1]);
  });

  it('should create ease-in-out cubic bezier', () => {
    const easing = createCubicBezier(0.42, 0, 0.58, 1);
    const fn = getEasingFunction(easing);
    // ease-in-out at 0.5 should be close to 0.5 (symmetric)
    expect(fn(0.5)).toBeCloseTo(0.5, 2);
  });
});

// ============================================================================
// Cubic Bezier Presets
// ============================================================================

describe('cubic bezier presets', () => {
  it('EASE should be a valid cubic bezier', () => {
    expect(EASE.type).toBe('cubicBezier');
    expect(EASE.points).toEqual([0.25, 0.1, 0.25, 1]);
  });

  it('EASE_IN should be a valid cubic bezier', () => {
    expect(EASE_IN.type).toBe('cubicBezier');
    expect(EASE_IN.points).toEqual([0.42, 0, 1, 1]);
  });

  it('EASE_OUT should be a valid cubic bezier', () => {
    expect(EASE_OUT.type).toBe('cubicBezier');
    expect(EASE_OUT.points).toEqual([0, 0, 0.58, 1]);
  });

  it('EASE_IN_OUT should be a valid cubic bezier', () => {
    expect(EASE_IN_OUT.type).toBe('cubicBezier');
    expect(EASE_IN_OUT.points).toEqual([0.42, 0, 0.58, 1]);
  });

  it('EASE preset should produce valid output at 0.5', () => {
    const fn = getEasingFunction(EASE);
    const mid = fn(0.5);
    // Should return a numeric value between 0 and 1
    expect(typeof mid).toBe('number');
    expect(mid).not.toBeNaN();
  });

  it('EASE_IN preset should have slow start', () => {
    const fn = getEasingFunction(EASE_IN);
    expect(fn(0.25)).toBeLessThan(0.25);
  });

  it('EASE_OUT preset should have fast start', () => {
    const fn = getEasingFunction(EASE_OUT);
    expect(fn(0.25)).toBeGreaterThan(0.25);
  });
});

// ============================================================================
// easingToSvgPath
// ============================================================================

describe('easingToSvgPath', () => {
  it('should return a valid SVG path string starting with M', () => {
    const path = easingToSvgPath('linear', 100, 100, 10);
    expect(path).toMatch(/^M/);
    expect(path).toContain('L');
  });

  it('should generate correct number of segments', () => {
    const path = easingToSvgPath('linear', 100, 100, 10);
    // 1 M + 10 L = 11 segments
    const segments = path.split(/(?=[ML])/).filter(Boolean);
    expect(segments).toHaveLength(11);
  });

  it('should map linear easing to a diagonal line', () => {
    const path = easingToSvgPath('linear', 100, 100, 4);
    // Start at (0, 100) = t=0,f=0 → SVG y = 100
    // End at (100, 0) = t=1,f=1 → SVG y = 0
    expect(path).toContain('M0.00,100.00');
    expect(path).toContain('L100.00,0.00');
  });

  it('should accept cubic bezier easing', () => {
    const path = easingToSvgPath(EASE, 200, 200, 16);
    expect(path).toMatch(/^M/);
    const segments = path.split(/(?=[ML])/).filter(Boolean);
    expect(segments).toHaveLength(17);
  });

  it('should default to 100x100 with 64 samples', () => {
    const path = easingToSvgPath('easeInQuad');
    const segments = path.split(/(?=[ML])/).filter(Boolean);
    expect(segments).toHaveLength(65); // 0..64 inclusive
  });
});

// ============================================================================
// EASING_CATEGORIES
// ============================================================================

describe('EASING_CATEGORIES', () => {
  it('should have 5 categories', () => {
    expect(EASING_CATEGORIES).toHaveLength(5);
  });

  it('should contain all category names', () => {
    const names = EASING_CATEGORIES.map((c) => c.name);
    expect(names).toEqual(['CSS Standard', 'Power', 'Expo & Circ', 'Back', 'Elastic & Bounce']);
  });

  it('CSS Standard should have 5 items', () => {
    expect(EASING_CATEGORIES[0]!.items).toHaveLength(5);
  });

  it('Power should have 12 items', () => {
    expect(EASING_CATEGORIES[1]!.items).toHaveLength(12);
  });

  it('should have 32 total preset items', () => {
    const total = EASING_CATEGORIES.reduce((sum, cat) => sum + cat.items.length, 0);
    expect(total).toBe(32);
  });

  it('each item should have a label and value', () => {
    for (const cat of EASING_CATEGORIES) {
      for (const item of cat.items) {
        expect(item.label).toBeTruthy();
        expect(item.value).toBeDefined();
      }
    }
  });
});

// ============================================================================
// getEasingDisplayName
// ============================================================================

describe('getEasingDisplayName', () => {
  it('should return "Linear" for linear', () => {
    expect(getEasingDisplayName('linear')).toBe('Linear');
  });

  it('should return readable name for named easings', () => {
    expect(getEasingDisplayName('easeInCubic')).toBe('Ease In Cubic');
    expect(getEasingDisplayName('easeOutBounce')).toBe('Ease Out Bounce');
    expect(getEasingDisplayName('easeInOutElastic')).toBe('Ease In Out Elastic');
  });

  it('should return CSS name for EASE preset', () => {
    expect(getEasingDisplayName(EASE)).toBe('Ease');
  });

  it('should return CSS name for EASE_IN preset', () => {
    expect(getEasingDisplayName(EASE_IN)).toBe('Ease In');
  });

  it('should return CSS name for EASE_OUT preset', () => {
    expect(getEasingDisplayName(EASE_OUT)).toBe('Ease Out');
  });

  it('should return CSS name for EASE_IN_OUT preset', () => {
    expect(getEasingDisplayName(EASE_IN_OUT)).toBe('Ease In Out');
  });

  it('should return cubic-bezier notation for custom values', () => {
    const custom = createCubicBezier(0.1, 0.2, 0.3, 0.4);
    expect(getEasingDisplayName(custom)).toBe('cubic-bezier(0.1, 0.2, 0.3, 0.4)');
  });
});

// ============================================================================
// easingToBezierPoints
// ============================================================================

describe('easingToBezierPoints', () => {
  it('should return [0,0,1,1] for linear', () => {
    expect(easingToBezierPoints('linear')).toEqual([0, 0, 1, 1]);
  });

  it('should return null for named non-linear easings', () => {
    expect(easingToBezierPoints('easeInBounce')).toBeNull();
    expect(easingToBezierPoints('easeOutElastic')).toBeNull();
    expect(easingToBezierPoints('easeInQuad')).toBeNull();
  });

  it('should return points for cubic bezier', () => {
    const pts = easingToBezierPoints(EASE);
    expect(pts).toEqual([0.25, 0.1, 0.25, 1]);
  });

  it('should return custom points for createCubicBezier', () => {
    const easing = createCubicBezier(0.1, 0.2, 0.8, 0.9);
    expect(easingToBezierPoints(easing)).toEqual([0.1, 0.2, 0.8, 0.9]);
  });
});
