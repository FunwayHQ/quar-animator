import { describe, it, expect } from 'vitest';
import type { Color, Fill, Stroke } from '@quar/types';
import { addKeyframe, createTimeline, getOrCreateTrack } from '@quar/animation';
import { fillsToLottie, strokesToLottie } from './lottieConverter';
import { colorTrackToLottie } from './lottiePaint';
import type { LottieShapeFill, LottieShapeGradientFill } from './lottieTypes';

const red: Color = { r: 255, g: 0, b: 0, a: 1 };
const blue: Color = { r: 0, g: 0, b: 255, a: 1 };
const bounds: [number, number, number, number] = [-50, -25, 50, 25]; // 100 × 50, centered

function gradientFill(gradient: Fill['gradient']): Fill {
  return { type: 'gradient', gradient, opacity: 1, visible: true };
}

describe('colors', () => {
  it('animates a color track with its easing', () => {
    const timeline = createTimeline({ duration: 60 });
    const track = getOrCreateTrack<Color>(timeline, 'n1', 'fills.0.color');
    addKeyframe(track, 0, red);
    addKeyframe(track, 20, blue, 'easeInOutCubic');

    const color = colorTrackToLottie(track, red);
    expect(color.a).toBe(1);
    const [first, last] = color.k as Array<{ t: number; s: number[]; e?: number[]; i?: unknown }>;
    expect(first).toMatchObject({ t: 0, s: [1, 0, 0, 1], e: [0, 0, 1, 1] });
    expect(first!.i).toBeDefined();
    expect(last).toEqual({ t: 20, s: [0, 0, 1, 1] });
  });

  it('exports animated fill color and opacity', () => {
    const timeline = createTimeline({ duration: 60 });
    addKeyframe(getOrCreateTrack<Color>(timeline, 'n1', 'fills.0.color'), 0, red);
    addKeyframe(getOrCreateTrack<Color>(timeline, 'n1', 'fills.0.color'), 10, blue);
    addKeyframe(getOrCreateTrack<number>(timeline, 'n1', 'fills.0.opacity'), 0, 1);
    addKeyframe(getOrCreateTrack<number>(timeline, 'n1', 'fills.0.opacity'), 10, 0.5);

    const [fill] = fillsToLottie(
      [{ type: 'solid', color: red, opacity: 1, visible: true }],
      'n1',
      timeline
    ) as LottieShapeFill[];
    expect(fill!.c.a).toBe(1);
    expect((fill!.o.k as Array<{ s: number[] }>).map((kf) => kf.s[0])).toEqual([100, 50]);
  });

  it('exports animated stroke color and opacity', () => {
    const timeline = createTimeline({ duration: 60 });
    addKeyframe(getOrCreateTrack<Color>(timeline, 'n1', 'strokes.0.color'), 0, red);
    addKeyframe(getOrCreateTrack<Color>(timeline, 'n1', 'strokes.0.color'), 10, blue);
    const stroke: Stroke = {
      color: red,
      width: 2,
      opacity: 0.5,
      cap: 'round',
      join: 'round',
      visible: true,
    } as Stroke;
    const [lottieStroke] = strokesToLottie([stroke], 'n1', timeline);
    expect(lottieStroke!.c.a).toBe(1);
    expect(lottieStroke!.o).toEqual({ a: 0, k: 50 });
  });
});

describe('gradient fills', () => {
  const empty = createTimeline({ duration: 60 });
  const stops = [
    { offset: 0, color: red },
    { offset: 1, color: blue },
  ];

  it('places a linear gradient across the shape’s bounds', () => {
    const [fill] = fillsToLottie(
      [gradientFill({ type: 'linear', stops, start: { x: 0, y: 0.5 }, end: { x: 1, y: 0.5 } })],
      'n1',
      empty,
      undefined,
      bounds
    ) as LottieShapeGradientFill[];
    expect(fill).toMatchObject({
      ty: 'gf',
      t: 1,
      s: { a: 0, k: [-50, -0] },
      e: { a: 0, k: [50, -0] },
    });
    expect(fill!.g).toEqual({ p: 2, k: { a: 0, k: [0, 1, 0, 0, 1, 0, 0, 1] } });
  });

  it('derives linear start and end from an angle', () => {
    const [fill] = fillsToLottie(
      [gradientFill({ type: 'linear', stops, angle: 90 })],
      'n1',
      empty,
      undefined,
      bounds
    ) as LottieShapeGradientFill[];
    // 90° runs bottom → top in Quar's Y-up space, top → bottom… flipped to Lottie
    const s = fill!.s.k as number[];
    const e = fill!.e.k as number[];
    expect(s[0]).toBeCloseTo(0);
    expect(s[1]).toBeCloseTo(25);
    expect(e[1]).toBeCloseTo(-25);
  });

  it('exports radial gradients from their center and radius', () => {
    const [fill] = fillsToLottie(
      [gradientFill({ type: 'radial', stops, center: { x: 0.5, y: 0.5 }, radius: 0.5 })],
      'n1',
      empty,
      undefined,
      [-50, -50, 50, 50]
    ) as LottieShapeGradientFill[];
    expect(fill).toMatchObject({ t: 2, s: { k: [0, -0] }, e: { k: [50, -0] } });
  });

  it('adds alpha stops when a stop is translucent', () => {
    const [fill] = fillsToLottie(
      [
        gradientFill({
          type: 'linear',
          stops: [
            { offset: 0, color: red },
            { offset: 1, color: { ...blue, a: 0.25 } },
          ],
        }),
      ],
      'n1',
      empty,
      undefined,
      bounds
    ) as LottieShapeGradientFill[];
    expect((fill!.g.k.k as number[]).slice(8)).toEqual([0, 1, 1, 0.25]);
  });

  it('falls back to a solid fill for conic gradients', () => {
    const [fill] = fillsToLottie(
      [gradientFill({ type: 'conic', stops })],
      'n1',
      empty,
      undefined,
      bounds
    ) as LottieShapeFill[];
    expect(fill).toMatchObject({ ty: 'fl', c: { a: 0, k: [0.5, 0, 0.5, 1] } });
  });

  it('samples animated gradient properties every frame', () => {
    const timeline = createTimeline({ duration: 60 });
    const angle = getOrCreateTrack<number>(timeline, 'n1', 'fills.0.gradient.angle');
    addKeyframe(angle, 0, 0);
    addKeyframe(angle, 4, 180);
    const [fill] = fillsToLottie(
      [gradientFill({ type: 'linear', stops, angle: 0 })],
      'n1',
      timeline,
      undefined,
      bounds
    ) as LottieShapeGradientFill[];
    expect(fill!.s.a).toBe(1);
    const starts = fill!.s.k as Array<{ t: number; s: number[] }>;
    expect(starts.map((kf) => kf.t)).toEqual([0, 1, 2, 3, 4]);
    expect(starts[0]!.s[0]).toBeCloseTo(-50);
    expect(starts[4]!.s[0]).toBeCloseTo(50);
  });
});
