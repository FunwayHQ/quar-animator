/**
 * Lottie Keyframe Conversion
 *
 * Pure functions converting Quar animation data → Lottie keyframe format.
 *
 * Key conversions:
 * - Y-flip: lottieY = canvasHeight - quarY (Quar Y-up → Lottie Y-down)
 * - Scale: Quar 0-1 → Lottie 0-100 (multiply by 100)
 * - Opacity: Quar 0-1 → Lottie 0-100 (multiply by 100)
 * - Colors: Quar 0-255 → Lottie 0-1 (divide by 255)
 * - Easing: cubic bezier → Lottie i/o tangents. Non-bezier → bake.
 */

import type { EasingFunction, PropertyTrack, Keyframe, Color } from '@quar/types';
import { easingToBezierPoints } from '@quar/animation';
import type {
  LottieAnimatedValue,
  LottieAnimatedMulti,
  LottieAnimatedColor,
  LottieKeyframe,
  LottieMultiKeyframe,
  LottieColorKeyframe,
} from './lottieTypes';

// ============================================================================
// Easing Conversion
// ============================================================================

export interface LottieTangents {
  i: { x: number[]; y: number[] };
  o: { x: number[]; y: number[] };
}

/**
 * Convert a Quar easing function to Lottie i/o tangent handles.
 * Returns null for non-cubic-bezier easings (bounce, elastic, etc.) that need baking.
 */
export function quarEasingToLottieTangents(easing: EasingFunction): LottieTangents | null {
  const points = easingToBezierPoints(easing);
  if (!points) return null;

  const [x1, y1, x2, y2] = points;
  return {
    o: { x: [x1], y: [y1] },
    i: { x: [x2], y: [y2] },
  };
}

/**
 * Check if an easing needs baking (non-cubic-bezier).
 */
export function easingNeedsBaking(easing: EasingFunction): boolean {
  return quarEasingToLottieTangents(easing) === null;
}

// ============================================================================
// Value Transforms
// ============================================================================

export type ValueTransform = (value: number) => number;

export const VALUE_TRANSFORMS = {
  identity: (v: number) => v,
  yFlip: (canvasH: number) => (v: number) => canvasH - v,
  scaleTo100: (v: number) => v * 100,
  opacityTo100: (v: number) => v * 100,
  colorTo01: (v: number) => v / 255,
} as const;

// ============================================================================
// Single-Value Track → Lottie
// ============================================================================

/**
 * Convert a Quar property track to a Lottie animated value (single dimension).
 */
export function trackToLottieAnimated(
  track: PropertyTrack<number> | undefined,
  defaultValue: number,
  transform: ValueTransform = VALUE_TRANSFORMS.identity
): LottieAnimatedValue {
  if (!track || track.keyframes.length === 0) {
    return { a: 0, k: transform(defaultValue) };
  }

  if (track.keyframes.length === 1) {
    return { a: 0, k: transform(track.keyframes[0].value) };
  }

  const keyframes: LottieKeyframe[] = [];
  for (let i = 0; i < track.keyframes.length; i++) {
    const kf = track.keyframes[i];
    const nextKf = track.keyframes[i + 1];
    keyframes.push(quarKeyframeToLottie(kf, nextKf, transform));
  }

  return { a: 1, k: keyframes };
}

/**
 * Convert a single Quar keyframe → Lottie keyframe format.
 */
export function quarKeyframeToLottie(
  kf: Keyframe<number>,
  nextKf: Keyframe<number> | undefined,
  transform: ValueTransform = VALUE_TRANSFORMS.identity
): LottieKeyframe {
  const result: LottieKeyframe = {
    t: kf.time,
    s: [transform(kf.value)],
  };

  if (nextKf) {
    result.e = [transform(nextKf.value)];

    // Easing is on the "after" keyframe in Quar (incoming transition)
    // so we use nextKf.easing for the segment from kf → nextKf
    const tangents = quarEasingToLottieTangents(nextKf.easing);
    if (tangents) {
      result.i = tangents.i;
      result.o = tangents.o;
    } else {
      // Hold (fallback for non-representable easings in single keyframes)
      result.h = 1;
    }
  }

  return result;
}

// ============================================================================
// Multi-Value (Position, Scale) Track → Lottie
// ============================================================================

/**
 * Convert two separate Quar tracks (X and Y) into a Lottie multi-dimensional animated value.
 */
export function positionTracksToLottie(
  trackX: PropertyTrack<number> | undefined,
  trackY: PropertyTrack<number> | undefined,
  defaultX: number,
  defaultY: number,
  transformX: ValueTransform = VALUE_TRANSFORMS.identity,
  transformY: ValueTransform = VALUE_TRANSFORMS.identity
): LottieAnimatedMulti {
  const hasAnimX = trackX && trackX.keyframes.length > 1;
  const hasAnimY = trackY && trackY.keyframes.length > 1;

  const valX = trackX?.keyframes[0]?.value ?? defaultX;
  const valY = trackY?.keyframes[0]?.value ?? defaultY;

  if (!hasAnimX && !hasAnimY) {
    return { a: 0, k: [transformX(valX), transformY(valY)] };
  }

  // Collect all unique times from both tracks
  const times = collectUniqueTimes(trackX, trackY);

  const keyframes: LottieMultiKeyframe[] = [];
  for (let i = 0; i < times.length; i++) {
    const t = times[i];
    const nextT = times[i + 1];

    const xVal = sampleTrackAt(trackX, t, defaultX);
    const yVal = sampleTrackAt(trackY, t, defaultY);

    const result: LottieMultiKeyframe = {
      t,
      s: [transformX(xVal), transformY(yVal)],
    };

    if (nextT !== undefined) {
      const nextXVal = sampleTrackAt(trackX, nextT, defaultX);
      const nextYVal = sampleTrackAt(trackY, nextT, defaultY);
      result.e = [transformX(nextXVal), transformY(nextYVal)];

      // Use easing from the X track's next keyframe (or linear)
      const nextKfX = trackX?.keyframes.find((kf) => kf.time === nextT);
      const easing = nextKfX?.easing ?? 'linear';
      const tangents = quarEasingToLottieTangents(easing);
      if (tangents) {
        result.i = { x: [tangents.i.x[0], tangents.i.x[0]], y: [tangents.i.y[0], tangents.i.y[0]] };
        result.o = { x: [tangents.o.x[0], tangents.o.x[0]], y: [tangents.o.y[0], tangents.o.y[0]] };
      }
    }

    keyframes.push(result);
  }

  return { a: 1, k: keyframes };
}

/**
 * Convert a Quar color to Lottie animated color.
 */
export function colorToLottieAnimated(
  track: PropertyTrack<number> | undefined,
  defaultColor: Color | undefined,
  component: 'r' | 'g' | 'b' | 'a'
): number {
  if (track && track.keyframes.length > 0) {
    return track.keyframes[0].value / (component === 'a' ? 1 : 255);
  }
  if (!defaultColor) return component === 'a' ? 1 : 0;
  return defaultColor[component] / (component === 'a' ? 1 : 255);
}

/**
 * Build a static Lottie color from a Quar Color.
 */
export function colorToLottieStatic(color: Color | undefined): LottieAnimatedColor {
  if (!color) {
    return { a: 0, k: [0, 0, 0, 1] };
  }
  return {
    a: 0,
    k: [color.r / 255, color.g / 255, color.b / 255, color.a],
  };
}

/**
 * Build animated Lottie color from separate r/g/b/a tracks.
 */
export function colorTracksToLottie(
  trackR: PropertyTrack<number> | undefined,
  trackG: PropertyTrack<number> | undefined,
  trackB: PropertyTrack<number> | undefined,
  trackA: PropertyTrack<number> | undefined,
  defaultColor: Color | undefined
): LottieAnimatedColor {
  const hasAnim = [trackR, trackG, trackB, trackA].some((t) => t && t.keyframes.length > 1);

  const defR = (defaultColor?.r ?? 0) / 255;
  const defG = (defaultColor?.g ?? 0) / 255;
  const defB = (defaultColor?.b ?? 0) / 255;
  const defA = defaultColor?.a ?? 1;

  if (!hasAnim) {
    const r = trackR?.keyframes[0] ? trackR.keyframes[0].value / 255 : defR;
    const g = trackG?.keyframes[0] ? trackG.keyframes[0].value / 255 : defG;
    const b = trackB?.keyframes[0] ? trackB.keyframes[0].value / 255 : defB;
    const a = trackA?.keyframes[0] ? trackA.keyframes[0].value : defA;
    return { a: 0, k: [r, g, b, a] };
  }

  // Collect all unique times
  const times = collectUniqueTimes(trackR, trackG, trackB, trackA);
  const keyframes: LottieColorKeyframe[] = [];

  for (let i = 0; i < times.length; i++) {
    const t = times[i];
    const nextT = times[i + 1];

    const r = sampleTrackAt(trackR, t, defaultColor?.r ?? 0) / 255;
    const g = sampleTrackAt(trackG, t, defaultColor?.g ?? 0) / 255;
    const b = sampleTrackAt(trackB, t, defaultColor?.b ?? 0) / 255;
    const a = sampleTrackAt(trackA, t, defaultColor?.a ?? 1);

    const kf: LottieColorKeyframe = {
      t,
      s: [r, g, b, a],
    };

    if (nextT !== undefined) {
      const nextR = sampleTrackAt(trackR, nextT, defaultColor?.r ?? 0) / 255;
      const nextG = sampleTrackAt(trackG, nextT, defaultColor?.g ?? 0) / 255;
      const nextB = sampleTrackAt(trackB, nextT, defaultColor?.b ?? 0) / 255;
      const nextA = sampleTrackAt(trackA, nextT, defaultColor?.a ?? 1);
      kf.e = [nextR, nextG, nextB, nextA];
    }

    keyframes.push(kf);
  }

  return { a: 1, k: keyframes };
}

// ============================================================================
// Baking (for non-bezier easings)
// ============================================================================

/**
 * Bake a track with non-bezier easings into per-frame linear keyframes.
 * This preserves visual fidelity for bounce, elastic, back, etc.
 */
export function bakeTrackToLinearKeyframes(
  track: PropertyTrack<number>,
  fps: number,
  transform: ValueTransform = VALUE_TRANSFORMS.identity
): LottieKeyframe[] {
  if (track.keyframes.length === 0) return [];
  if (track.keyframes.length === 1) {
    return [{ t: track.keyframes[0].time, s: [transform(track.keyframes[0].value)] }];
  }

  const keyframes: LottieKeyframe[] = [];
  const firstTime = track.keyframes[0].time;
  const lastTime = track.keyframes[track.keyframes.length - 1].time;

  // Add a keyframe for every frame in the range
  for (let frame = firstTime; frame <= lastTime; frame++) {
    const value = sampleTrackAt(track, frame, track.keyframes[0].value);
    const nextFrame = frame + 1;
    const nextValue =
      nextFrame <= lastTime ? sampleTrackAt(track, nextFrame, track.keyframes[0].value) : value;

    const kf: LottieKeyframe = {
      t: frame,
      s: [transform(value)],
    };

    if (frame < lastTime) {
      kf.e = [transform(nextValue)];
      // Linear tangents
      kf.i = { x: [1], y: [1] };
      kf.o = { x: [0], y: [0] };
    }

    keyframes.push(kf);
  }

  return keyframes;
}

// ============================================================================
// Helpers
// ============================================================================

function collectUniqueTimes(...tracks: (PropertyTrack | undefined)[]): number[] {
  const timeSet = new Set<number>();
  for (const track of tracks) {
    if (!track) continue;
    for (const kf of track.keyframes) {
      timeSet.add(kf.time);
    }
  }
  return Array.from(timeSet).sort((a, b) => a - b);
}

/**
 * Sample a track's value at a given frame using simple linear interpolation
 * between surrounding keyframes.
 */
function sampleTrackAt(
  track: PropertyTrack<number> | undefined,
  frame: number,
  defaultValue: number
): number {
  if (!track || track.keyframes.length === 0) return defaultValue;

  const kfs = track.keyframes;

  // Before first keyframe
  if (frame <= kfs[0].time) return kfs[0].value;
  // After last keyframe
  if (frame >= kfs[kfs.length - 1].time) return kfs[kfs.length - 1].value;

  // Find surrounding keyframes
  for (let i = 0; i < kfs.length - 1; i++) {
    if (kfs[i].time <= frame && frame <= kfs[i + 1].time) {
      const duration = kfs[i + 1].time - kfs[i].time;
      if (duration === 0) return kfs[i].value;
      const t = (frame - kfs[i].time) / duration;
      return kfs[i].value + (kfs[i + 1].value - kfs[i].value) * t;
    }
  }

  return defaultValue;
}

// Export for testing
export { sampleTrackAt, collectUniqueTimes };
