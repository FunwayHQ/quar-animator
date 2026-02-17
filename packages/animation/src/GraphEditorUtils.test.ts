import { describe, it, expect } from 'vitest';
import {
  getTrackColor,
  isEasingEditable,
  graphToScreen,
  screenToGraph,
  easingToTangents,
  tangentsToEasing,
  computeAutoTangent,
  getEffectiveTangent,
  enforceTangentMode,
  fitKeyframesToView,
  findNearestKeyframe,
  findNearestTangentHandle,
  findKeyframesInRect,
  sampleCurveSegment,
  buildTrackCurvePath,
  getValueRange,
} from './GraphEditorUtils';
import type { GraphViewTransform } from './GraphEditorUtils';
import { createCubicBezier } from './Easing';
import type { Keyframe, PropertyTrack } from '@quar/types';

// ============================================================================
// Track Colors
// ============================================================================

describe('getTrackColor', () => {
  it('returns distinct colors for indices 0-9', () => {
    const colors = new Set<string>();
    for (let i = 0; i < 10; i++) {
      colors.add(getTrackColor(i));
    }
    expect(colors.size).toBe(10);
  });

  it('wraps around for indices >= 10', () => {
    expect(getTrackColor(10)).toBe(getTrackColor(0));
    expect(getTrackColor(11)).toBe(getTrackColor(1));
  });

  it('returns a hex color string', () => {
    expect(getTrackColor(0)).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

// ============================================================================
// Easing Editability
// ============================================================================

describe('isEasingEditable', () => {
  it('returns true for linear', () => {
    expect(isEasingEditable('linear')).toBe(true);
  });

  it('returns true for cubic bezier', () => {
    expect(isEasingEditable(createCubicBezier(0.4, 0, 0.2, 1))).toBe(true);
  });

  it('returns false for named preset easings', () => {
    expect(isEasingEditable('easeInBounce')).toBe(false);
    expect(isEasingEditable('easeOutElastic')).toBe(false);
    expect(isEasingEditable('easeInQuad')).toBe(false);
  });
});

// ============================================================================
// Coordinate Transforms
// ============================================================================

describe('graphToScreen', () => {
  const t: GraphViewTransform = {
    offsetX: 0,
    offsetY: 0,
    scaleX: 10,
    scaleY: 50,
    viewWidth: 800,
    viewHeight: 400,
  };

  it('converts origin correctly', () => {
    const pos = graphToScreen(0, 0, t);
    expect(pos.x).toBe(0);
    expect(pos.y).toBe(200); // viewHeight/2
  });

  it('converts positive frame/value', () => {
    const pos = graphToScreen(10, 2, t);
    expect(pos.x).toBe(100); // 10 * 10
    expect(pos.y).toBe(100); // 200 - 2*50
  });

  it('applies offset', () => {
    const t2: GraphViewTransform = { ...t, offsetX: 50, offsetY: 25 };
    const pos = graphToScreen(10, 1, t2);
    expect(pos.x).toBe(50); // 10*10 - 50
    expect(pos.y).toBe(175); // 200 - (1*50 - 25)
  });
});

describe('screenToGraph', () => {
  const t: GraphViewTransform = {
    offsetX: 0,
    offsetY: 0,
    scaleX: 10,
    scaleY: 50,
    viewWidth: 800,
    viewHeight: 400,
  };

  it('is inverse of graphToScreen at origin', () => {
    const screen = graphToScreen(5, 3, t);
    const graph = screenToGraph(screen.x, screen.y, t);
    expect(graph.frame).toBeCloseTo(5);
    expect(graph.value).toBeCloseTo(3);
  });

  it('round-trips with offset', () => {
    const t2: GraphViewTransform = { ...t, offsetX: 100, offsetY: -50 };
    const screen = graphToScreen(20, -1, t2);
    const graph = screenToGraph(screen.x, screen.y, t2);
    expect(graph.frame).toBeCloseTo(20);
    expect(graph.value).toBeCloseTo(-1);
  });
});

// ============================================================================
// Tangent ↔ Easing Conversion
// ============================================================================

describe('easingToTangents', () => {
  it('returns null for non-editable easings', () => {
    expect(easingToTangents('easeInBounce', 0, 0, 30, 100)).toBeNull();
  });

  it('returns tangents for linear easing', () => {
    const result = easingToTangents('linear', 0, 0, 30, 100);
    expect(result).not.toBeNull();
    // linear: [0,0,1,1] → tangentOut = (0,0), tangentIn = (0,0)
    expect(result!.tangentOut.x).toBeCloseTo(0);
    expect(result!.tangentOut.y).toBeCloseTo(0);
    expect(result!.tangentIn.x).toBeCloseTo(0);
    expect(result!.tangentIn.y).toBeCloseTo(0);
  });

  it('returns tangents for cubic bezier', () => {
    const easing = createCubicBezier(0.25, 0.1, 0.75, 0.9);
    const result = easingToTangents(easing, 0, 0, 30, 100);
    expect(result).not.toBeNull();
    // tangentOut.x = 0.25 * 30 = 7.5
    expect(result!.tangentOut.x).toBeCloseTo(7.5);
    // tangentOut.y = 0.1 * 100 = 10
    expect(result!.tangentOut.y).toBeCloseTo(10);
    // tangentIn.x = (0.75 - 1) * 30 = -7.5
    expect(result!.tangentIn.x).toBeCloseTo(-7.5);
    // tangentIn.y = (0.9 - 1) * 100 = -10
    expect(result!.tangentIn.y).toBeCloseTo(-10);
  });
});

describe('tangentsToEasing', () => {
  it('returns linear when dt is 0', () => {
    expect(tangentsToEasing({ x: 0, y: 0 }, { x: 0, y: 0 }, 0, 100)).toBe('linear');
  });

  it('returns linear for near-zero tangents', () => {
    const result = tangentsToEasing({ x: 0, y: 0 }, { x: 0, y: 0 }, 30, 100);
    expect(result).toBe('linear');
  });

  it('returns cubic bezier for non-trivial tangents', () => {
    const result = tangentsToEasing({ x: 7.5, y: 10 }, { x: -7.5, y: -10 }, 30, 100);
    expect(result).not.toBe('linear');
    expect(typeof result).toBe('object');
    if (typeof result === 'object') {
      expect(result.type).toBe('cubicBezier');
      expect(result.points[0]).toBeCloseTo(0.25);
      expect(result.points[1]).toBeCloseTo(0.1);
      expect(result.points[2]).toBeCloseTo(0.75);
      expect(result.points[3]).toBeCloseTo(0.9);
    }
  });

  it('clamps x1/x2 to [0,1]', () => {
    // tangentOut.x = -5 → x1 clamped to 0
    const result = tangentsToEasing({ x: -5, y: 50 }, { x: 0, y: 0 }, 30, 100);
    if (typeof result === 'object') {
      expect(result.points[0]).toBe(0);
    }
  });

  it('round-trips with easingToTangents', () => {
    const original = createCubicBezier(0.4, 0, 0.2, 1);
    const tangents = easingToTangents(original, 0, 0, 30, 100)!;
    const rebuilt = tangentsToEasing(tangents.tangentOut, tangents.tangentIn, 30, 100);
    expect(typeof rebuilt).toBe('object');
    if (typeof rebuilt === 'object' && typeof original === 'object') {
      expect(rebuilt.points[0]).toBeCloseTo(original.points[0], 2);
      expect(rebuilt.points[1]).toBeCloseTo(original.points[1], 2);
      expect(rebuilt.points[2]).toBeCloseTo(original.points[2], 2);
      expect(rebuilt.points[3]).toBeCloseTo(original.points[3], 2);
    }
  });
});

// ============================================================================
// Auto Tangent
// ============================================================================

describe('computeAutoTangent', () => {
  it('returns flat tangents when no neighbors', () => {
    const result = computeAutoTangent(null, { time: 10, value: 50 }, null);
    expect(result.tangentIn.y).toBeCloseTo(0);
    expect(result.tangentOut.y).toBeCloseTo(0);
  });

  it('computes Catmull-Rom slope with both neighbors', () => {
    const result = computeAutoTangent(
      { time: 0, value: 0 },
      { time: 10, value: 50 },
      { time: 20, value: 100 }
    );
    // slope = (100-0)/(20-0) = 5
    // tangentOut.x = (20-10)/3 ≈ 3.33
    // tangentOut.y = 5 * 3.33 ≈ 16.67
    expect(result.tangentOut.x).toBeCloseTo(10 / 3);
    expect(result.tangentOut.y).toBeCloseTo(50 / 3);
  });

  it('computes one-sided tangent at start', () => {
    const result = computeAutoTangent(null, { time: 0, value: 0 }, { time: 30, value: 90 });
    expect(result.tangentOut.x).toBeCloseTo(10); // 30/3
    expect(result.tangentOut.y).toBeCloseTo(30); // slope 3 * 10
  });

  it('computes one-sided tangent at end', () => {
    const result = computeAutoTangent({ time: 0, value: 0 }, { time: 30, value: 90 }, null);
    expect(result.tangentIn.x).toBeCloseTo(-10); // -(30-0)/3
    expect(result.tangentIn.y).toBeCloseTo(-30); // -slope*10
  });
});

// ============================================================================
// Get Effective Tangent
// ============================================================================

describe('getEffectiveTangent', () => {
  const makeKf = (
    time: number,
    value: number,
    overrides: Partial<Keyframe<number>> = {}
  ): Keyframe<number> => ({
    id: `kf-${time}`,
    time,
    value,
    easing: 'linear',
    ...overrides,
  });

  it('uses stored tangent in non-auto mode', () => {
    const kf = makeKf(10, 50, {
      tangentMode: 'free',
      tangentOut: { x: 5, y: 20 },
    });
    const result = getEffectiveTangent(kf, 'out', null, makeKf(20, 100));
    expect(result).toEqual({ x: 5, y: 20 });
  });

  it('computes auto tangent in auto mode', () => {
    const kf = makeKf(10, 50, { tangentMode: 'auto' });
    const result = getEffectiveTangent(kf, 'out', makeKf(0, 0), makeKf(20, 100));
    // Catmull-Rom: slope = 100/20 = 5, dt = 10/3
    expect(result.x).toBeCloseTo(10 / 3);
    expect(result.y).toBeCloseTo(50 / 3);
  });

  it('returns linear tangent in linear mode', () => {
    const kf = makeKf(10, 50, { tangentMode: 'linear' });
    const next = makeKf(40, 200);
    const result = getEffectiveTangent(kf, 'out', null, next);
    expect(result.x).toBeCloseTo(10); // 30/3
    expect(result.y).toBeCloseTo(50); // 150/3
  });
});

// ============================================================================
// Enforce Tangent Mode
// ============================================================================

describe('enforceTangentMode', () => {
  it('returns unchanged for free mode', () => {
    const tIn = { x: -5, y: -10 };
    const tOut = { x: 5, y: 20 };
    const result = enforceTangentMode(tIn, tOut, 'free', 'out');
    expect(result.tangentIn).toEqual(tIn);
    expect(result.tangentOut).toEqual(tOut);
  });

  it('mirrors tangent in smooth mode', () => {
    const tIn = { x: -5, y: -10 };
    const tOut = { x: 8, y: 3 };
    const result = enforceTangentMode(tIn, tOut, 'smooth', 'out');
    // Edited side is 'out', so tangentIn should be mirrored from tangentOut
    const outLen = Math.sqrt(64 + 9);
    const inLen = Math.sqrt(result.tangentIn.x ** 2 + result.tangentIn.y ** 2);
    expect(inLen).toBeCloseTo(outLen);
    // Direction should be opposite
    const dot = result.tangentIn.x * tOut.x + result.tangentIn.y * tOut.y;
    expect(dot).toBeLessThan(0);
  });

  it('preserves magnitude in aligned mode', () => {
    const tIn = { x: -3, y: -4 }; // len = 5
    const tOut = { x: 6, y: 8 }; // len = 10
    const result = enforceTangentMode(tIn, tOut, 'aligned', 'out');
    // tangentIn should keep its original magnitude (5) but align opposite to tangentOut
    const inLen = Math.sqrt(result.tangentIn.x ** 2 + result.tangentIn.y ** 2);
    expect(inLen).toBeCloseTo(5);
  });
});

// ============================================================================
// View Fitting
// ============================================================================

describe('fitKeyframesToView', () => {
  it('returns default for empty keyframes', () => {
    const result = fitKeyframesToView([], 800, 400);
    expect(result.scaleX).toBeGreaterThan(0);
    expect(result.scaleY).toBeGreaterThan(0);
    expect(result.viewWidth).toBe(800);
    expect(result.viewHeight).toBe(400);
  });

  it('fits keyframes into view', () => {
    const keyframes = [
      { time: 0, value: 0 },
      { time: 30, value: 100 },
      { time: 60, value: 50 },
    ];
    const result = fitKeyframesToView(keyframes, 800, 400, 40);
    expect(result.scaleX).toBeGreaterThan(0);
    expect(result.scaleY).toBeGreaterThan(0);
    expect(result.viewWidth).toBe(800);
    expect(result.viewHeight).toBe(400);
  });

  it('handles single keyframe', () => {
    const keyframes = [{ time: 10, value: 50 }];
    const result = fitKeyframesToView(keyframes, 800, 400);
    expect(result.scaleX).toBeGreaterThan(0);
    expect(result.scaleY).toBeGreaterThan(0);
  });

  it('handles keyframes with same value', () => {
    const keyframes = [
      { time: 0, value: 50 },
      { time: 30, value: 50 },
    ];
    const result = fitKeyframesToView(keyframes, 800, 400);
    expect(result.scaleY).toBeGreaterThan(0);
  });
});

// ============================================================================
// Hit Testing
// ============================================================================

describe('findNearestKeyframe', () => {
  const t: GraphViewTransform = {
    offsetX: 0,
    offsetY: 0,
    scaleX: 10,
    scaleY: 50,
    viewWidth: 800,
    viewHeight: 400,
  };

  const keyframes = [
    { id: 'kf1', time: 0, value: 0 },
    { id: 'kf2', time: 10, value: 2 },
    { id: 'kf3', time: 20, value: -1 },
  ];

  it('finds the nearest keyframe within threshold', () => {
    const kf2screen = graphToScreen(10, 2, t);
    const result = findNearestKeyframe(
      { x: kf2screen.x + 3, y: kf2screen.y + 3 },
      keyframes,
      t,
      10
    );
    expect(result?.id).toBe('kf2');
  });

  it('returns null when outside threshold', () => {
    const result = findNearestKeyframe({ x: 500, y: 500 }, keyframes, t, 5);
    expect(result).toBeNull();
  });
});

describe('findNearestTangentHandle', () => {
  const t: GraphViewTransform = {
    offsetX: 0,
    offsetY: 0,
    scaleX: 10,
    scaleY: 50,
    viewWidth: 800,
    viewHeight: 400,
  };

  it('finds tangentOut handle', () => {
    const keyframes = [
      {
        id: 'kf1',
        time: 10,
        value: 2,
        tangentOut: { x: 5, y: 1 },
        tangentIn: undefined,
        easing: createCubicBezier(0.4, 0, 0.2, 1),
      },
    ];
    const handlePos = graphToScreen(15, 3, t); // 10+5, 2+1
    const result = findNearestTangentHandle({ x: handlePos.x, y: handlePos.y }, keyframes, t, 10);
    expect(result?.keyframeId).toBe('kf1');
    expect(result?.side).toBe('out');
  });

  it('returns null for non-editable easing', () => {
    const keyframes = [
      {
        id: 'kf1',
        time: 10,
        value: 2,
        tangentOut: { x: 5, y: 1 },
        tangentIn: undefined,
        easing: 'easeInBounce' as const,
      },
    ];
    const handlePos = graphToScreen(15, 3, t);
    const result = findNearestTangentHandle({ x: handlePos.x, y: handlePos.y }, keyframes, t, 10);
    expect(result).toBeNull();
  });
});

describe('findKeyframesInRect', () => {
  const t: GraphViewTransform = {
    offsetX: 0,
    offsetY: 0,
    scaleX: 10,
    scaleY: 50,
    viewWidth: 800,
    viewHeight: 400,
  };

  it('finds keyframes within rectangle', () => {
    const keyframes = [
      { id: 'kf1', time: 0, value: 0 },
      { id: 'kf2', time: 10, value: 2 },
      { id: 'kf3', time: 50, value: -1 },
    ];
    const kf1pos = graphToScreen(0, 0, t);
    const kf2pos = graphToScreen(10, 2, t);
    // Rectangle that encompasses kf1 and kf2
    const result = findKeyframesInRect(
      {
        x: kf1pos.x - 5,
        y: Math.min(kf1pos.y, kf2pos.y) - 5,
        width: kf2pos.x - kf1pos.x + 10,
        height: Math.abs(kf2pos.y - kf1pos.y) + 10,
      },
      keyframes,
      t
    );
    expect(result).toContain('kf1');
    expect(result).toContain('kf2');
    expect(result).not.toContain('kf3');
  });

  it('handles inverted rectangles (negative width/height)', () => {
    const keyframes = [{ id: 'kf1', time: 5, value: 1 }];
    const pos = graphToScreen(5, 1, t);
    // Draw rect from bottom-right to top-left
    const result = findKeyframesInRect(
      { x: pos.x + 5, y: pos.y + 5, width: -10, height: -10 },
      keyframes,
      t
    );
    expect(result).toContain('kf1');
  });
});

// ============================================================================
// Curve Sampling
// ============================================================================

describe('sampleCurveSegment', () => {
  it('returns correct number of samples', () => {
    const points = sampleCurveSegment(0, 0, 30, 100, 'linear', 10);
    expect(points.length).toBe(11); // 0 to 10 inclusive
  });

  it('starts and ends at keyframe values', () => {
    const points = sampleCurveSegment(5, 10, 35, 90, 'linear', 20);
    expect(points[0].frame).toBeCloseTo(5);
    expect(points[0].value).toBeCloseTo(10);
    expect(points[points.length - 1].frame).toBeCloseTo(35);
    expect(points[points.length - 1].value).toBeCloseTo(90);
  });

  it('linear easing produces straight line', () => {
    const points = sampleCurveSegment(0, 0, 30, 90, 'linear', 30);
    // Midpoint should be exactly halfway
    const mid = points[15];
    expect(mid.frame).toBeCloseTo(15);
    expect(mid.value).toBeCloseTo(45);
  });

  it('ease-in produces slow start', () => {
    const easeIn = createCubicBezier(0.42, 0, 1, 1);
    const points = sampleCurveSegment(0, 0, 30, 100, easeIn, 30);
    // At 25% of time, value should be < 25% (slow start)
    const quarterIdx = Math.round(30 * 0.25);
    expect(points[quarterIdx].value).toBeLessThan(25);
  });
});

describe('buildTrackCurvePath', () => {
  const t: GraphViewTransform = {
    offsetX: 0,
    offsetY: 0,
    scaleX: 10,
    scaleY: 50,
    viewWidth: 800,
    viewHeight: 400,
  };

  it('returns empty string for empty track', () => {
    const track: PropertyTrack<number> = {
      id: 't1',
      nodeId: 'n1',
      property: 'x',
      keyframes: [],
    };
    expect(buildTrackCurvePath(track, t)).toBe('');
  });

  it('returns M command for single keyframe', () => {
    const track: PropertyTrack<number> = {
      id: 't1',
      nodeId: 'n1',
      property: 'x',
      keyframes: [{ id: 'kf1', time: 10, value: 5, easing: 'linear' }],
    };
    const path = buildTrackCurvePath(track, t);
    expect(path).toMatch(/^M/);
  });

  it('generates path with M and L commands for multiple keyframes', () => {
    const track: PropertyTrack<number> = {
      id: 't1',
      nodeId: 'n1',
      property: 'x',
      keyframes: [
        { id: 'kf1', time: 0, value: 0, easing: 'linear' },
        { id: 'kf2', time: 30, value: 100, easing: 'linear' },
      ],
    };
    const path = buildTrackCurvePath(track, t);
    expect(path).toContain('M');
    expect(path).toContain('L');
    expect(path.length).toBeGreaterThan(10);
  });
});

// ============================================================================
// Value Range
// ============================================================================

describe('getValueRange', () => {
  it('returns default for empty tracks', () => {
    const result = getValueRange([]);
    expect(result.min).toBe(0);
    expect(result.max).toBe(1);
  });

  it('returns min/max across tracks', () => {
    const tracks: PropertyTrack<number>[] = [
      {
        id: 't1',
        nodeId: 'n1',
        property: 'x',
        keyframes: [
          { id: 'kf1', time: 0, value: 10, easing: 'linear' },
          { id: 'kf2', time: 30, value: 50, easing: 'linear' },
        ],
      },
      {
        id: 't2',
        nodeId: 'n1',
        property: 'y',
        keyframes: [
          { id: 'kf3', time: 0, value: -20, easing: 'linear' },
          { id: 'kf4', time: 30, value: 80, easing: 'linear' },
        ],
      },
    ];
    const result = getValueRange(tracks);
    expect(result.min).toBe(-20);
    expect(result.max).toBe(80);
  });

  it('adds margin when all values are the same', () => {
    const tracks: PropertyTrack<number>[] = [
      {
        id: 't1',
        nodeId: 'n1',
        property: 'x',
        keyframes: [
          { id: 'kf1', time: 0, value: 50, easing: 'linear' },
          { id: 'kf2', time: 30, value: 50, easing: 'linear' },
        ],
      },
    ];
    const result = getValueRange(tracks);
    expect(result.min).toBeLessThan(50);
    expect(result.max).toBeGreaterThan(50);
  });
});
