/**
 * Fill and stroke paint → Lottie: animated colors and gradients.
 */

import type { Color, Fill, Gradient, PropertyTrack, Timeline } from '@quar/types';
import { evaluateTrack } from '@quar/animation';
import { clampFocalPoint, linearGradientFromAngle, normalizeGradientStops } from '@quar/core';
import type {
  LottieAnimatedColor,
  LottieAnimatedMulti,
  LottieAnimatedValue,
  LottieColorKeyframe,
  LottieMultiKeyframe,
  LottieShapeFill,
  LottieShapeGradientFill,
} from './lottieTypes';
import { easingNeedsBaking, quarEasingToLottieTangents } from './lottieKeyframes';

/** A shape's local bounds in Quar's Y-up space: [minX, minY, maxX, maxY]. */
export type LocalBounds = [number, number, number, number];

const LINEAR = { i: { x: [1], y: [1] }, o: { x: [0], y: [0] } };

function rgba(color: Color): number[] {
  return [color.r / 255, color.g / 255, color.b / 255, color.a];
}

/** A color track (whole Color values) → Lottie color. */
export function colorTrackToLottie(
  track: PropertyTrack<Color> | undefined,
  fallback: Color | undefined
): LottieAnimatedColor {
  const kfs = track?.keyframes ?? [];
  if (kfs.length === 0) return { a: 0, k: fallback ? rgba(fallback) : [0, 0, 0, 1] };
  if (kfs.length === 1) return { a: 0, k: rgba(kfs[0]!.value) };

  // Bounce/elastic can't be one bezier: sample every frame instead
  if (kfs.some((kf) => easingNeedsBaking(kf.easing))) {
    const keyframes: LottieColorKeyframe[] = [];
    const first = Math.floor(kfs[0]!.time);
    const last = Math.ceil(kfs[kfs.length - 1]!.time);
    for (let frame = first; frame <= last; frame++) {
      const value = rgba(evaluateTrack(track!, frame) as Color);
      const keyframe: LottieColorKeyframe = { t: frame, s: value };
      if (frame < last) {
        keyframe.e = rgba(evaluateTrack(track!, frame + 1) as Color);
        Object.assign(keyframe, LINEAR);
      }
      keyframes.push(keyframe);
    }
    return { a: 1, k: keyframes };
  }

  const keyframes = kfs.map((kf, index): LottieColorKeyframe => {
    const next = kfs[index + 1];
    const keyframe: LottieColorKeyframe = { t: kf.time, s: rgba(kf.value) };
    if (next) {
      keyframe.e = rgba(next.value);
      // Quar keeps a segment's easing on its second keyframe
      const tangents = quarEasingToLottieTangents(next.easing);
      if (tangents) {
        keyframe.i = tangents.i;
        keyframe.o = tangents.o;
      } else {
        keyframe.h = 1;
      }
    }
    return keyframe;
  });
  return { a: 1, k: keyframes };
}

// ============================================================================
// Gradients
// ============================================================================

interface GradientGeometry {
  type: 1 | 2; // linear, radial
  start: number[];
  end: number[];
  /** [offset, r, g, b]… then [offset, alpha]… */
  stops: number[];
  count: number;
  /** Radial: the focal point as Lottie's highlight — [% of the radius, degrees]. */
  highlight?: [number, number];
}

/**
 * Lottie geometry for a Quar gradient. Quar positions gradients in the shape's
 * normalized bounds; Lottie uses local points (Y-down). A radial gradient over
 * non-square bounds is elliptical in Quar and circular in Lottie, so its
 * radius is the geometric mean of the two axes.
 */
function gradientGeometry(gradient: Gradient, bounds: LocalBounds): GradientGeometry {
  const [minX, minY, maxX, maxY] = bounds;
  const w = maxX - minX;
  const h = maxY - minY;
  const toLocal = (n: { x: number; y: number }) => [minX + n.x * w, -(minY + n.y * h)];

  const stops = normalizeGradientStops(gradient.stops);
  const colors = stops.flatMap((stop) => [stop.offset, ...rgba(stop.color).slice(0, 3)]);
  const alphas = stops.some((stop) => stop.color.a < 1)
    ? stops.flatMap((stop) => [stop.offset, stop.color.a])
    : [];

  if (gradient.type === 'radial') {
    const center = gradient.center ?? { x: 0.5, y: 0.5 };
    const radius = (gradient.radius ?? 0.5) * Math.sqrt(Math.abs(w * h));
    const start = toLocal(center);
    // The highlight is measured from the start along the start→end line (+X here)
    const focal = toLocal(clampFocalPoint(center, gradient.radius ?? 0.5, gradient.focal));
    const fx = focal[0]! - start[0]!;
    const fy = focal[1]! - start[1]!;
    const distance = Math.sqrt(fx * fx + fy * fy);
    return {
      type: 2,
      start,
      end: [start[0]! + radius, start[1]!],
      stops: [...colors, ...alphas],
      count: stops.length,
      highlight:
        radius > 0
          ? [
              Math.min(99, (distance / radius) * 100),
              distance > 0 ? (Math.atan2(fy, fx) * 180) / Math.PI : 0,
            ]
          : [0, 0],
    };
  }

  const { start, end } =
    gradient.start && gradient.end
      ? { start: gradient.start, end: gradient.end }
      : linearGradientFromAngle(gradient.angle ?? 0);
  return {
    type: 1,
    start: toLocal(start),
    end: toLocal(end),
    stops: [...colors, ...alphas],
    count: stops.length,
  };
}

function averageColor(gradient: Gradient): Color {
  const stops = normalizeGradientStops(gradient.stops);
  const sum = stops.reduce(
    (acc, stop) => ({
      r: acc.r + stop.color.r,
      g: acc.g + stop.color.g,
      b: acc.b + stop.color.b,
      a: acc.a + stop.color.a,
    }),
    { r: 0, g: 0, b: 0, a: 0 }
  );
  const n = Math.max(1, stops.length);
  return { r: sum.r / n, g: sum.g / n, b: sum.b / n, a: sum.a / n };
}

function setPath(target: Record<string, unknown>, path: string[], value: unknown): void {
  let current = target;
  for (const key of path.slice(0, -1)) {
    const next = current[key];
    if (typeof next !== 'object' || next === null) return;
    current = next as Record<string, unknown>;
  }
  current[path[path.length - 1]!] = value;
}

/** One number over time, static when it doesn't change. */
function scalar(values: number[], times: number[]): LottieAnimatedValue {
  const animated = multi(
    values.map((value) => [value]),
    times
  );
  return animated.a === 0 ? { a: 0, k: values[0]! } : (animated as LottieAnimatedValue);
}

function multi(values: number[][], times: number[]): LottieAnimatedMulti {
  if (values.every((value) => value.join() === values[0]!.join())) {
    return { a: 0, k: values[0]! };
  }
  return {
    a: 1,
    k: values.map((value, index): LottieMultiKeyframe => {
      const next = values[index + 1];
      return next
        ? { t: times[index]!, s: value, e: next, ...LINEAR }
        : { t: times[index]!, s: value };
    }),
  };
}

/**
 * A gradient fill → Lottie gradient fill (conic falls back to a solid fill of
 * its average color — Lottie has no conic gradients). Animated gradient
 * properties are sampled every frame between their first and last keyframe.
 */
export function gradientFillToLottie(
  fill: Fill & { gradient: Gradient },
  fillIndex: number,
  nodeId: string,
  timeline: Timeline,
  bounds: LocalBounds,
  opacity: LottieAnimatedValue,
  fillRule?: 'nonzero' | 'evenodd'
): LottieShapeGradientFill | LottieShapeFill {
  const rule = fillRule === 'evenodd' ? { r: 2 as const } : {};
  if (fill.gradient.type === 'conic') {
    return {
      ty: 'fl',
      nm: `Fill ${fillIndex + 1}`,
      c: { a: 0, k: rgba(averageColor(fill.gradient)) },
      o: opacity,
      ...rule,
    };
  }

  const prefix = `fills.${fillIndex}.gradient.`;
  const tracks = timeline.tracks.filter(
    (track) =>
      track.nodeId === nodeId && track.property.startsWith(prefix) && track.keyframes.length > 0
  );

  let geometries: GradientGeometry[];
  let times: number[];
  if (tracks.length === 0) {
    geometries = [gradientGeometry(fill.gradient, bounds)];
    times = [0];
  } else {
    const first = Math.floor(Math.min(...tracks.map((track) => track.keyframes[0]!.time)));
    const last = Math.ceil(
      Math.max(...tracks.map((track) => track.keyframes[track.keyframes.length - 1]!.time))
    );
    geometries = [];
    times = [];
    for (let frame = first; frame <= last; frame++) {
      const gradient = structuredClone(fill.gradient) as unknown as Record<string, unknown>;
      for (const track of tracks) {
        setPath(
          gradient,
          track.property.slice(prefix.length).split('.'),
          evaluateTrack(track, frame)
        );
      }
      geometries.push(gradientGeometry(gradient as unknown as Gradient, bounds));
      times.push(frame);
    }
  }

  const base = geometries[0]!;
  // A focal point set apart from the center is Lottie's highlight
  const highlights = geometries.map((g): [number, number] => g.highlight ?? [0, 0]);
  const highlight = highlights.some(([length]) => length > 0)
    ? {
        h: scalar(
          highlights.map(([length]) => length),
          times
        ),
        a: scalar(
          highlights.map(([, angle]) => angle),
          times
        ),
      }
    : {};
  return {
    ty: 'gf',
    nm: `Gradient Fill ${fillIndex + 1}`,
    o: opacity,
    t: base.type,
    s: multi(
      geometries.map((g) => g.start),
      times
    ),
    e: multi(
      geometries.map((g) => g.end),
      times
    ),
    ...highlight,
    g: {
      p: base.count,
      k: multi(
        geometries.map((g) => g.stops),
        times
      ),
    },
    ...rule,
  };
}
