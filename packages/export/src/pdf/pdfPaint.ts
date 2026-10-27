/**
 * PDF Paint
 * Gradients as PDF shadings, worked out as the canvas's gradient shader does:
 * in the painted geometry's box (0–1 across it, Y up), at most 16 stops,
 * the colors and the opacity interpolated straight. A linear gradient is an
 * axial shading, a radial one a two-circle shading from its focal point, and
 * a conic one (which PDF has no shading for) a fan of thin triangles. PDF
 * shadings have no opacity: stops that aren't opaque come as a second,
 * gray shading of their opacity, for a soft mask.
 */

import { clampFocalPoint, linearGradientFromAngle, normalizeGradientStops } from '@quar/core';
import type { Color, Gradient, GradientStop, Vector2 } from '@quar/types';
import { pdfNumber as n, type PdfDocument } from './pdfDocument';

/** The canvas's gradient shader takes this many stops. */
const MAX_STOPS = 16;
/** Triangles a conic gradient's fan has. */
export const CONIC_WEDGES = 256;

export type GradientPaint =
  /** A gradient that draws one color everywhere (as the canvas does a zero-length one) */
  | { solid: Color }
  /** Shadings of its colors, and of its opacity when that varies */
  | { color: number; alpha: number | null };

/** The stops as the canvas draws them: sorted, within 0–1, at most 16. */
export function gradientStops(gradient: Gradient): GradientStop[] {
  return normalizeGradientStops(gradient.stops).slice(0, MAX_STOPS);
}

/** The color (with its opacity) at `t`, straight between the stops round it. */
export function colorAt(stops: GradientStop[], t: number): Color {
  const first = stops[0];
  const last = stops[stops.length - 1];
  if (!first || !last) return { r: 0, g: 0, b: 0, a: 1 };
  if (t <= first.offset) return first.color;
  if (t >= last.offset) return last.color;
  for (let i = 1; i < stops.length; i++) {
    const to = stops[i]!;
    if (t > to.offset) continue;
    const from = stops[i - 1]!;
    const span = to.offset - from.offset;
    const k = span > 0 ? (t - from.offset) / span : 0;
    const mix = (a: number, b: number) => a + (b - a) * k;
    return {
      r: mix(from.color.r, to.color.r),
      g: mix(from.color.g, to.color.g),
      b: mix(from.color.b, to.color.b),
      a: mix(from.color.a ?? 1, to.color.a ?? 1),
    };
  }
  return last.color;
}

type Channel = 'color' | 'alpha';

function channelValues(color: Color, channel: Channel): number[] {
  if (channel === 'alpha') return [Math.max(0, Math.min(1, color.a ?? 1))];
  return [color.r, color.g, color.b].map((v) => Math.max(0, Math.min(255, v)) / 255);
}

/**
 * The stops as a PDF function of t over 0–1: straight runs between them,
 * the end colors held before the first and past the last.
 */
export function stopFunction(stops: GradientStop[], channel: Channel): string {
  const points: Array<{ t: number; v: number[] }> = [];
  const first = stops[0];
  const last = stops[stops.length - 1];
  if (!first || !last)
    return stopFunction([{ offset: 0, color: { r: 0, g: 0, b: 0, a: 1 } }], channel);
  if (first.offset > 0) points.push({ t: 0, v: channelValues(first.color, channel) });
  for (const stop of stops) points.push({ t: stop.offset, v: channelValues(stop.color, channel) });
  if (last.offset < 1) points.push({ t: 1, v: channelValues(last.color, channel) });

  const pieces: string[] = [];
  const bounds: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const from = points[i - 1]!;
    const to = points[i]!;
    // Two stops in one place are a hard step: nothing runs between them
    if (to.t - from.t <= 1e-6) continue;
    if (pieces.length > 0) bounds.push(from.t);
    pieces.push(
      `<< /FunctionType 2 /Domain [0 1] /C0 [${from.v.map(n).join(' ')}] /C1 [${to.v.map(n).join(' ')}] /N 1 >>`
    );
  }
  if (pieces.length === 0) {
    const v = points[points.length - 1]!.v.map(n).join(' ');
    return `<< /FunctionType 2 /Domain [0 1] /C0 [${v}] /C1 [${v}] /N 1 >>`;
  }
  if (pieces.length === 1) return pieces[0]!;
  return (
    `<< /FunctionType 3 /Domain [0 1] /Functions [${pieces.join(' ')}] ` +
    `/Bounds [${bounds.map(n).join(' ')}] /Encode [${pieces.map(() => '0 1').join(' ')}] >>`
  );
}

/** Whether some stop isn't fully opaque. */
function varyingAlpha(stops: GradientStop[]): boolean {
  return stops.some((stop) => (stop.color.a ?? 1) < 1);
}

/** A linear gradient's ends in its box, as the shader takes them. */
function linearEnds(gradient: Gradient): { start: Vector2; end: Vector2 } {
  if (gradient.start && gradient.end) return { start: gradient.start, end: gradient.end };
  return linearGradientFromAngle(gradient.angle ?? 0);
}

/**
 * A conic gradient as a fan of triangles round its center, as a free-form
 * mesh: t is 0 pointing away from the start angle's opposite (the shader's
 * atan2 + π) and runs counter-clockwise. Each wedge's tip takes its middle's
 * color, so a thin wedge is its one angle's color all along.
 */
function conicMesh(
  stops: GradientStop[],
  gradient: Gradient,
  channel: Channel
): { dictionary: string; data: Uint8Array } {
  const cx = gradient.center?.x ?? 0.5;
  const cy = gradient.center?.y ?? 0.5;
  // Far enough to take in the whole box, past the chords' sag
  const reach =
    Math.max(...[0, 1].flatMap((x) => [0, 1].map((y) => Math.hypot(x - cx, y - cy)))) + 0.1;
  const start = ((gradient.angle ?? 0) * Math.PI) / 180 - Math.PI;
  const components = channel === 'alpha' ? 1 : 3;
  const vertexBytes = 1 + 8 + components;
  const data = new Uint8Array(CONIC_WEDGES * 3 * vertexBytes);
  const view = new DataView(data.buffer);
  const span = 2 * reach;
  const xMin = cx - reach;
  const yMin = cy - reach;
  const full = 0xffffffff;
  let at = 0;
  const vertex = (x: number, y: number, t: number) => {
    view.setUint8(at, 0);
    view.setUint32(at + 1, Math.round(((x - xMin) / span) * full));
    view.setUint32(at + 5, Math.round(((y - yMin) / span) * full));
    channelValues(colorAt(stops, t), channel).forEach((v, i) => {
      view.setUint8(at + 9 + i, Math.round(v * 255));
    });
    at += vertexBytes;
  };
  for (let k = 0; k < CONIC_WEDGES; k++) {
    const a0 = start + (2 * Math.PI * k) / CONIC_WEDGES;
    const a1 = start + (2 * Math.PI * (k + 1)) / CONIC_WEDGES;
    const t0 = k / CONIC_WEDGES;
    const t1 = (k + 1) / CONIC_WEDGES;
    vertex(cx, cy, (t0 + t1) / 2);
    vertex(cx + reach * Math.cos(a0), cy + reach * Math.sin(a0), t0);
    vertex(cx + reach * Math.cos(a1), cy + reach * Math.sin(a1), t1);
  }
  const ranges = Array.from({ length: components }, () => '0 1').join(' ');
  return {
    dictionary:
      `/ShadingType 4 /ColorSpace /${channel === 'alpha' ? 'DeviceGray' : 'DeviceRGB'} ` +
      `/BitsPerCoordinate 32 /BitsPerComponent 8 /BitsPerFlag 8 ` +
      `/Decode [${n(xMin)} ${n(xMin + span)} ${n(yMin)} ${n(yMin + span)} ${ranges}]`,
    data,
  };
}

function shading(doc: PdfDocument, gradient: Gradient, stops: GradientStop[], channel: Channel) {
  const space = channel === 'alpha' ? 'DeviceGray' : 'DeviceRGB';
  if (gradient.type === 'conic') {
    const mesh = conicMesh(stops, gradient, channel);
    return doc.addStream(mesh.dictionary, mesh.data);
  }
  const fn = stopFunction(stops, channel);
  if (gradient.type === 'radial') {
    const center = gradient.center ?? { x: 0.5, y: 0.5 };
    const radius = Math.max(gradient.radius ?? 0.5, 0.001);
    const focal = clampFocalPoint(center, radius, gradient.focal);
    return doc.add(
      `<< /ShadingType 3 /ColorSpace /${space} /Coords [${n(focal.x)} ${n(focal.y)} 0 ` +
        `${n(center.x)} ${n(center.y)} ${n(radius)}] /Function ${fn} /Extend [true true] >>`
    );
  }
  const { start, end } = linearEnds(gradient);
  return doc.add(
    `<< /ShadingType 2 /ColorSpace /${space} /Coords [${n(start.x)} ${n(start.y)} ` +
      `${n(end.x)} ${n(end.y)}] /Function ${fn} /Extend [true true] >>`
  );
}

/**
 * A gradient's shadings in its box's 0–1 space: its colors, and its opacity
 * when the stops' differs — or the one color it draws everywhere.
 */
export function gradientPaint(doc: PdfDocument, gradient: Gradient): GradientPaint {
  const stops = gradientStops(gradient);
  if (gradient.type !== 'radial' && gradient.type !== 'conic') {
    // The shader draws its middle color everywhere when the ends meet
    const { start, end } = linearEnds(gradient);
    if (Math.hypot(end.x - start.x, end.y - start.y) <= 0.001) {
      return { solid: colorAt(stops, 0.5) };
    }
  }
  return {
    color: shading(doc, gradient, stops, 'color'),
    alpha: varyingAlpha(stops) ? shading(doc, gradient, stops, 'alpha') : null,
  };
}
