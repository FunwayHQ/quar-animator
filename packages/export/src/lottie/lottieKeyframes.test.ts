import { describe, it, expect } from 'vitest';
import type { EasingFunction, PropertyTrack, Keyframe, Color } from '@quar/types';
import {
  quarEasingToLottieTangents,
  easingNeedsBaking,
  trackToLottieAnimated,
  quarKeyframeToLottie,
  positionTracksToLottie,
  colorToLottieAnimated,
  colorToLottieStatic,
  colorTracksToLottie,
  bakeTrackToLinearKeyframes,
  VALUE_TRANSFORMS,
  sampleTrackAt,
  collectUniqueTimes,
} from './lottieKeyframes';

// ============================================================================
// Helpers
// ============================================================================

function makeTrack(
  keyframes: Array<{ time: number; value: number; easing?: EasingFunction }>
): PropertyTrack<number> {
  return {
    id: 'track-1',
    nodeId: 'node-1',
    property: 'test',
    keyframes: keyframes.map((kf, i) => ({
      id: `kf-${i}`,
      time: kf.time,
      value: kf.value,
      easing: kf.easing ?? 'linear',
    })),
  };
}

const cubicEasing: EasingFunction = { type: 'cubicBezier', points: [0.42, 0, 0.58, 1] };

// ============================================================================
// quarEasingToLottieTangents
// ============================================================================

describe('quarEasingToLottieTangents', () => {
  it('converts linear easing', () => {
    const result = quarEasingToLottieTangents('linear');
    expect(result).toEqual({
      o: { x: [0], y: [0] },
      i: { x: [1], y: [1] },
    });
  });

  it('converts cubic bezier easing', () => {
    const result = quarEasingToLottieTangents(cubicEasing);
    expect(result).toEqual({
      o: { x: [0.42], y: [0] },
      i: { x: [0.58], y: [1] },
    });
  });

  it('returns null for named non-bezier easings', () => {
    expect(quarEasingToLottieTangents('easeInBounce')).toBeNull();
    expect(quarEasingToLottieTangents('easeOutElastic')).toBeNull();
    expect(quarEasingToLottieTangents('easeInBack')).toBeNull();
  });
});

describe('easingNeedsBaking', () => {
  it('linear does not need baking', () => {
    expect(easingNeedsBaking('linear')).toBe(false);
  });

  it('cubic bezier does not need baking', () => {
    expect(easingNeedsBaking(cubicEasing)).toBe(false);
  });

  it('bounce/elastic/back need baking', () => {
    expect(easingNeedsBaking('easeInBounce')).toBe(true);
    expect(easingNeedsBaking('easeOutElastic')).toBe(true);
  });
});

// ============================================================================
// VALUE_TRANSFORMS
// ============================================================================

describe('VALUE_TRANSFORMS', () => {
  it('identity returns same value', () => {
    expect(VALUE_TRANSFORMS.identity(42)).toBe(42);
  });

  it('yFlip flips Y coordinate', () => {
    const flip = VALUE_TRANSFORMS.yFlip(500);
    expect(flip(100)).toBe(400);
    expect(flip(0)).toBe(500);
  });

  it('scaleTo100 multiplies by 100', () => {
    expect(VALUE_TRANSFORMS.scaleTo100(0.5)).toBe(50);
    expect(VALUE_TRANSFORMS.scaleTo100(1)).toBe(100);
  });

  it('opacityTo100 multiplies by 100', () => {
    expect(VALUE_TRANSFORMS.opacityTo100(0.75)).toBe(75);
  });

  it('colorTo01 divides by 255', () => {
    expect(VALUE_TRANSFORMS.colorTo01(255)).toBeCloseTo(1);
    expect(VALUE_TRANSFORMS.colorTo01(0)).toBe(0);
    expect(VALUE_TRANSFORMS.colorTo01(127.5)).toBeCloseTo(0.5);
  });
});

// ============================================================================
// trackToLottieAnimated
// ============================================================================

describe('trackToLottieAnimated', () => {
  it('returns static value when no track', () => {
    const result = trackToLottieAnimated(undefined, 42);
    expect(result).toEqual({ a: 0, k: 42 });
  });

  it('returns static value when track has no keyframes', () => {
    const track = makeTrack([]);
    const result = trackToLottieAnimated(track, 10);
    expect(result).toEqual({ a: 0, k: 10 });
  });

  it('returns static value for single keyframe', () => {
    const track = makeTrack([{ time: 0, value: 50 }]);
    const result = trackToLottieAnimated(track, 0);
    expect(result).toEqual({ a: 0, k: 50 });
  });

  it('returns animated keyframes for multiple keyframes', () => {
    const track = makeTrack([
      { time: 0, value: 0 },
      { time: 30, value: 100, easing: 'linear' },
    ]);
    const result = trackToLottieAnimated(track, 0);
    expect(result.a).toBe(1);
    expect(Array.isArray(result.k)).toBe(true);
    const kfs = result.k as Array<{ t: number; s: number[] }>;
    expect(kfs).toHaveLength(2);
    expect(kfs[0].t).toBe(0);
    expect(kfs[0].s).toEqual([0]);
    expect(kfs[1].t).toBe(30);
    expect(kfs[1].s).toEqual([100]);
  });

  it('applies transform to values', () => {
    const track = makeTrack([{ time: 0, value: 0.5 }]);
    const result = trackToLottieAnimated(track, 0, VALUE_TRANSFORMS.opacityTo100);
    expect(result.k).toBe(50);
  });
});

// ============================================================================
// quarKeyframeToLottie
// ============================================================================

describe('quarKeyframeToLottie', () => {
  it('last keyframe has no end value', () => {
    const kf: Keyframe<number> = { id: 'k1', time: 30, value: 100, easing: 'linear' };
    const result = quarKeyframeToLottie(kf, undefined);
    expect(result.t).toBe(30);
    expect(result.s).toEqual([100]);
    expect(result.e).toBeUndefined();
    expect(result.i).toBeUndefined();
    expect(result.o).toBeUndefined();
  });

  it('includes end value and tangents when next keyframe exists', () => {
    const kf: Keyframe<number> = { id: 'k1', time: 0, value: 0, easing: 'linear' };
    const nextKf: Keyframe<number> = { id: 'k2', time: 30, value: 100, easing: cubicEasing };
    const result = quarKeyframeToLottie(kf, nextKf);
    expect(result.e).toEqual([100]);
    expect(result.o).toEqual({ x: [0.42], y: [0] });
    expect(result.i).toEqual({ x: [0.58], y: [1] });
  });

  it('sets hold flag for non-representable easings', () => {
    const kf: Keyframe<number> = { id: 'k1', time: 0, value: 0, easing: 'linear' };
    const nextKf: Keyframe<number> = { id: 'k2', time: 30, value: 100, easing: 'easeInBounce' };
    const result = quarKeyframeToLottie(kf, nextKf);
    expect(result.h).toBe(1);
  });
});

// ============================================================================
// positionTracksToLottie
// ============================================================================

describe('positionTracksToLottie', () => {
  it('returns static value when no tracks', () => {
    const result = positionTracksToLottie(undefined, undefined, 100, 200);
    expect(result).toEqual({ a: 0, k: [100, 200] });
  });

  it('applies transforms to static values', () => {
    const flipY = VALUE_TRANSFORMS.yFlip(500);
    const result = positionTracksToLottie(
      undefined,
      undefined,
      100,
      200,
      VALUE_TRANSFORMS.identity,
      flipY
    );
    expect(result).toEqual({ a: 0, k: [100, 300] }); // 500 - 200 = 300
  });

  it('generates animated keyframes from two tracks', () => {
    const trackX = makeTrack([
      { time: 0, value: 0 },
      { time: 30, value: 100 },
    ]);
    const trackY = makeTrack([
      { time: 0, value: 0 },
      { time: 30, value: 50 },
    ]);
    const result = positionTracksToLottie(trackX, trackY, 0, 0);
    expect(result.a).toBe(1);
    const kfs = result.k as Array<{ t: number; s: number[]; e?: number[] }>;
    expect(kfs).toHaveLength(2);
    expect(kfs[0].s).toEqual([0, 0]);
    expect(kfs[0].e).toEqual([100, 50]);
  });
});

// ============================================================================
// colorToLottieStatic
// ============================================================================

describe('colorToLottieStatic', () => {
  it('returns black for undefined color', () => {
    const result = colorToLottieStatic(undefined);
    expect(result).toEqual({ a: 0, k: [0, 0, 0, 1] });
  });

  it('converts Quar color to Lottie 0-1 range', () => {
    const color: Color = { r: 255, g: 128, b: 0, a: 0.5 };
    const result = colorToLottieStatic(color);
    expect(result.a).toBe(0);
    const k = result.k as number[];
    expect(k[0]).toBeCloseTo(1); // 255/255
    expect(k[1]).toBeCloseTo(0.502, 2); // 128/255
    expect(k[2]).toBe(0); // 0/255
    expect(k[3]).toBe(0.5); // alpha pass-through
  });
});

// ============================================================================
// colorTracksToLottie
// ============================================================================

describe('colorTracksToLottie', () => {
  it('returns static value when no tracks', () => {
    const color: Color = { r: 255, g: 0, b: 0, a: 1 };
    const result = colorTracksToLottie(undefined, undefined, undefined, undefined, color);
    expect(result.a).toBe(0);
    const k = result.k as number[];
    expect(k[0]).toBeCloseTo(1);
    expect(k[1]).toBe(0);
    expect(k[2]).toBe(0);
    expect(k[3]).toBe(1);
  });

  it('returns animated when tracks have multiple keyframes', () => {
    const trackR = makeTrack([
      { time: 0, value: 255 },
      { time: 30, value: 0 },
    ]);
    const color: Color = { r: 255, g: 0, b: 0, a: 1 };
    const result = colorTracksToLottie(trackR, undefined, undefined, undefined, color);
    expect(result.a).toBe(1);
  });
});

// ============================================================================
// bakeTrackToLinearKeyframes
// ============================================================================

describe('bakeTrackToLinearKeyframes', () => {
  it('returns empty for empty track', () => {
    const track = makeTrack([]);
    expect(bakeTrackToLinearKeyframes(track, 30)).toEqual([]);
  });

  it('returns single keyframe for one keyframe', () => {
    const track = makeTrack([{ time: 5, value: 42 }]);
    const result = bakeTrackToLinearKeyframes(track, 30);
    expect(result).toHaveLength(1);
    expect(result[0].t).toBe(5);
    expect(result[0].s).toEqual([42]);
  });

  it('bakes per-frame keyframes between first and last', () => {
    const track = makeTrack([
      { time: 0, value: 0 },
      { time: 4, value: 100 },
    ]);
    const result = bakeTrackToLinearKeyframes(track, 30);
    // Should have frames 0,1,2,3,4 = 5 keyframes
    expect(result).toHaveLength(5);
    expect(result[0].s).toEqual([0]);
    expect(result[4].s).toEqual([100]);
    // Intermediate should be interpolated
    expect(result[2].s[0]).toBeCloseTo(50);
  });

  it('applies transform to baked values', () => {
    const track = makeTrack([
      { time: 0, value: 0.5 },
      { time: 2, value: 1.0 },
    ]);
    const result = bakeTrackToLinearKeyframes(track, 30, VALUE_TRANSFORMS.opacityTo100);
    expect(result[0].s).toEqual([50]);
    expect(result[2].s).toEqual([100]);
  });
});

// ============================================================================
// sampleTrackAt / collectUniqueTimes
// ============================================================================

describe('sampleTrackAt', () => {
  it('returns default for undefined track', () => {
    expect(sampleTrackAt(undefined, 10, 42)).toBe(42);
  });

  it('returns default for empty track', () => {
    expect(sampleTrackAt(makeTrack([]), 10, 42)).toBe(42);
  });

  it('clamps to first keyframe before range', () => {
    const track = makeTrack([{ time: 5, value: 100 }]);
    expect(sampleTrackAt(track, 0, 0)).toBe(100);
  });

  it('clamps to last keyframe after range', () => {
    const track = makeTrack([
      { time: 0, value: 10 },
      { time: 10, value: 50 },
    ]);
    expect(sampleTrackAt(track, 20, 0)).toBe(50);
  });

  it('interpolates between keyframes', () => {
    const track = makeTrack([
      { time: 0, value: 0 },
      { time: 10, value: 100 },
    ]);
    expect(sampleTrackAt(track, 5, 0)).toBe(50);
  });
});

describe('collectUniqueTimes', () => {
  it('returns empty for no tracks', () => {
    expect(collectUniqueTimes()).toEqual([]);
  });

  it('collects and deduplicates times from multiple tracks', () => {
    const t1 = makeTrack([
      { time: 0, value: 0 },
      { time: 10, value: 0 },
    ]);
    const t2 = makeTrack([
      { time: 5, value: 0 },
      { time: 10, value: 0 },
    ]);
    expect(collectUniqueTimes(t1, t2)).toEqual([0, 5, 10]);
  });

  it('skips undefined tracks', () => {
    const t1 = makeTrack([{ time: 0, value: 0 }]);
    expect(collectUniqueTimes(t1, undefined)).toEqual([0]);
  });

  it('works with single track', () => {
    const t1 = makeTrack([
      { time: 5, value: 0 },
      { time: 15, value: 0 },
    ]);
    expect(collectUniqueTimes(t1)).toEqual([5, 15]);
  });

  it('handles four tracks with overlapping times', () => {
    const t1 = makeTrack([{ time: 0, value: 0 }]);
    const t2 = makeTrack([{ time: 5, value: 0 }]);
    const t3 = makeTrack([
      { time: 0, value: 0 },
      { time: 10, value: 0 },
    ]);
    const t4 = makeTrack([
      { time: 5, value: 0 },
      { time: 15, value: 0 },
    ]);
    expect(collectUniqueTimes(t1, t2, t3, t4)).toEqual([0, 5, 10, 15]);
  });
});

// ============================================================================
// Additional trackToLottieAnimated tests
// ============================================================================

describe('trackToLottieAnimated - additional', () => {
  it('handles 3+ keyframes', () => {
    const track = makeTrack([
      { time: 0, value: 0 },
      { time: 15, value: 50, easing: 'linear' },
      { time: 30, value: 100, easing: 'linear' },
    ]);
    const result = trackToLottieAnimated(track, 0);
    expect(result.a).toBe(1);
    const kfs = result.k as Array<{ t: number; s: number[] }>;
    expect(kfs).toHaveLength(3);
    expect(kfs[0].t).toBe(0);
    expect(kfs[1].t).toBe(15);
    expect(kfs[2].t).toBe(30);
  });
});

// ============================================================================
// Additional quarKeyframeToLottie tests
// ============================================================================

describe('quarKeyframeToLottie - additional', () => {
  it('linear easing produces correct tangent values', () => {
    const kf: Keyframe<number> = { id: 'k1', time: 0, value: 0, easing: 'linear' };
    const nextKf: Keyframe<number> = { id: 'k2', time: 30, value: 100, easing: 'linear' };
    const result = quarKeyframeToLottie(kf, nextKf);
    // Linear tangents: out at (0,0), in at (1,1)
    expect(result.o).toEqual({ x: [0], y: [0] });
    expect(result.i).toEqual({ x: [1], y: [1] });
  });

  it('applies value transform', () => {
    const kf: Keyframe<number> = { id: 'k1', time: 0, value: 0.5, easing: 'linear' };
    const nextKf: Keyframe<number> = { id: 'k2', time: 30, value: 1.0, easing: 'linear' };
    const result = quarKeyframeToLottie(kf, nextKf, VALUE_TRANSFORMS.opacityTo100);
    expect(result.s).toEqual([50]);
    expect(result.e).toEqual([100]);
  });
});

// ============================================================================
// Additional positionTracksToLottie tests
// ============================================================================

describe('positionTracksToLottie - additional', () => {
  it('returns animated when only X track has multiple keyframes', () => {
    const trackX = makeTrack([
      { time: 0, value: 0 },
      { time: 30, value: 200 },
    ]);
    const result = positionTracksToLottie(trackX, undefined, 0, 100);
    expect(result.a).toBe(1);
    const kfs = result.k as Array<{ s: number[] }>;
    expect(kfs[0].s).toEqual([0, 100]);
  });

  it('returns animated when only Y track has multiple keyframes', () => {
    const trackY = makeTrack([
      { time: 0, value: 50 },
      { time: 30, value: 200 },
    ]);
    const result = positionTracksToLottie(undefined, trackY, 100, 50);
    expect(result.a).toBe(1);
    const kfs = result.k as Array<{ s: number[] }>;
    expect(kfs[0].s).toEqual([100, 50]);
  });

  it('handles misaligned track times', () => {
    const trackX = makeTrack([
      { time: 0, value: 0 },
      { time: 20, value: 100 },
    ]);
    const trackY = makeTrack([
      { time: 10, value: 0 },
      { time: 30, value: 200 },
    ]);
    const result = positionTracksToLottie(trackX, trackY, 0, 0);
    expect(result.a).toBe(1);
    const kfs = result.k as Array<{ t: number }>;
    // Unique times: 0, 10, 20, 30
    expect(kfs.map((k) => k.t)).toEqual([0, 10, 20, 30]);
  });

  it('uses first keyframe value for static', () => {
    const trackX = makeTrack([{ time: 0, value: 42 }]);
    const trackY = makeTrack([{ time: 0, value: 99 }]);
    const result = positionTracksToLottie(trackX, trackY, 0, 0);
    expect(result.a).toBe(0);
    expect(result.k).toEqual([42, 99]);
  });
});

// ============================================================================
// colorToLottieAnimated
// ============================================================================

describe('colorToLottieAnimated', () => {
  it('returns track value divided by 255 for rgb component', () => {
    const track = makeTrack([{ time: 0, value: 128 }]);
    const result = colorToLottieAnimated(track, undefined, 'r');
    expect(result).toBeCloseTo(128 / 255);
  });

  it('returns track value as-is for alpha component', () => {
    const track = makeTrack([{ time: 0, value: 0.75 }]);
    const result = colorToLottieAnimated(track, undefined, 'a');
    expect(result).toBe(0.75);
  });

  it('returns default color component when no track', () => {
    const color: Color = { r: 200, g: 100, b: 50, a: 0.8 };
    expect(colorToLottieAnimated(undefined, color, 'r')).toBeCloseTo(200 / 255);
    expect(colorToLottieAnimated(undefined, color, 'g')).toBeCloseTo(100 / 255);
    expect(colorToLottieAnimated(undefined, color, 'b')).toBeCloseTo(50 / 255);
    expect(colorToLottieAnimated(undefined, color, 'a')).toBe(0.8);
  });

  it('returns fallback when no track and no default color', () => {
    expect(colorToLottieAnimated(undefined, undefined, 'r')).toBe(0);
    expect(colorToLottieAnimated(undefined, undefined, 'g')).toBe(0);
    expect(colorToLottieAnimated(undefined, undefined, 'b')).toBe(0);
    expect(colorToLottieAnimated(undefined, undefined, 'a')).toBe(1);
  });

  it('returns value from empty track using default', () => {
    const emptyTrack = makeTrack([]);
    const color: Color = { r: 255, g: 0, b: 0, a: 1 };
    expect(colorToLottieAnimated(emptyTrack, color, 'r')).toBeCloseTo(1);
  });
});

// ============================================================================
// Additional colorTracksToLottie tests
// ============================================================================

describe('colorTracksToLottie - additional', () => {
  it('animated output has correct keyframe structure', () => {
    const trackR = makeTrack([
      { time: 0, value: 255 },
      { time: 30, value: 0 },
    ]);
    const trackG = makeTrack([
      { time: 0, value: 0 },
      { time: 30, value: 128 },
    ]);
    const color: Color = { r: 255, g: 0, b: 0, a: 1 };
    const result = colorTracksToLottie(trackR, trackG, undefined, undefined, color);
    expect(result.a).toBe(1);
    const kfs = result.k as Array<{ t: number; s: number[]; e?: number[] }>;
    expect(kfs).toHaveLength(2);
    expect(kfs[0].t).toBe(0);
    expect(kfs[0].s[0]).toBeCloseTo(1); // 255/255
    expect(kfs[0].s[1]).toBe(0); // 0/255
    expect(kfs[0].e).toBeDefined();
    expect(kfs[0].e![0]).toBe(0); // 0/255
    expect(kfs[0].e![1]).toBeCloseTo(128 / 255);
  });

  it('last keyframe has no end value', () => {
    const trackR = makeTrack([
      { time: 0, value: 255 },
      { time: 30, value: 0 },
    ]);
    const color: Color = { r: 255, g: 0, b: 0, a: 1 };
    const result = colorTracksToLottie(trackR, undefined, undefined, undefined, color);
    const kfs = result.k as Array<{ e?: number[] }>;
    expect(kfs[kfs.length - 1].e).toBeUndefined();
  });

  it('alpha-only track produces animated result', () => {
    const trackA = makeTrack([
      { time: 0, value: 1 },
      { time: 30, value: 0 },
    ]);
    const color: Color = { r: 128, g: 128, b: 128, a: 1 };
    const result = colorTracksToLottie(undefined, undefined, undefined, trackA, color);
    expect(result.a).toBe(1);
  });

  it('handles undefined defaultColor', () => {
    const result = colorTracksToLottie(undefined, undefined, undefined, undefined, undefined);
    expect(result.a).toBe(0);
    const k = result.k as number[];
    expect(k).toEqual([0, 0, 0, 1]); // defaults: r=0, g=0, b=0, a=1
  });
});

// ============================================================================
// Additional bakeTrackToLinearKeyframes tests
// ============================================================================

describe('bakeTrackToLinearKeyframes - additional', () => {
  it('intermediate keyframes have linear tangents', () => {
    const track = makeTrack([
      { time: 0, value: 0 },
      { time: 3, value: 30 },
    ]);
    const result = bakeTrackToLinearKeyframes(track, 30);
    // Frames 0, 1, 2 should have linear tangents
    for (let i = 0; i < result.length - 1; i++) {
      expect(result[i].i).toEqual({ x: [1], y: [1] });
      expect(result[i].o).toEqual({ x: [0], y: [0] });
    }
    // Last frame should not have tangents
    expect(result[result.length - 1].i).toBeUndefined();
    expect(result[result.length - 1].o).toBeUndefined();
  });

  it('last frame has no end value', () => {
    const track = makeTrack([
      { time: 0, value: 0 },
      { time: 2, value: 100 },
    ]);
    const result = bakeTrackToLinearKeyframes(track, 30);
    expect(result[result.length - 1].e).toBeUndefined();
  });
});

// ============================================================================
// Additional sampleTrackAt tests
// ============================================================================

describe('sampleTrackAt - additional', () => {
  it('returns exact value when at a keyframe time', () => {
    const track = makeTrack([
      { time: 0, value: 10 },
      { time: 10, value: 50 },
      { time: 20, value: 100 },
    ]);
    expect(sampleTrackAt(track, 10, 0)).toBe(50);
  });

  it('handles zero-duration segment', () => {
    const track = makeTrack([
      { time: 5, value: 10 },
      { time: 5, value: 50 }, // same time → zero duration
    ]);
    expect(sampleTrackAt(track, 5, 0)).toBe(10); // returns first value
  });
});

// ============================================================================
// Additional quarEasingToLottieTangents tests
// ============================================================================

describe('quarEasingToLottieTangents - additional', () => {
  it('named easings (easeIn, easeOut, easeInOut) return null (need baking)', () => {
    expect(quarEasingToLottieTangents('easeIn')).toBeNull();
    expect(quarEasingToLottieTangents('easeOut')).toBeNull();
    expect(quarEasingToLottieTangents('easeInOut')).toBeNull();
  });

  it('converts custom cubic bezier with extreme values', () => {
    const easing: EasingFunction = { type: 'cubicBezier', points: [0, 1, 1, 0] };
    const result = quarEasingToLottieTangents(easing);
    expect(result).not.toBeNull();
    expect(result!.o).toEqual({ x: [0], y: [1] });
    expect(result!.i).toEqual({ x: [1], y: [0] });
  });

  it('linear easing produces identity tangents', () => {
    const result = quarEasingToLottieTangents('linear');
    expect(result).toEqual({
      o: { x: [0], y: [0] },
      i: { x: [1], y: [1] },
    });
  });
});
