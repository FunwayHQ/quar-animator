/**
 * Dashes
 * A stroke's dash pattern cut out of its flattened outline, as SVG's
 * stroke-dasharray and stroke-dashoffset have it, so the canvas and raster
 * exports dash what SVG export does.
 */

/** Past this many dashes in one stroke it's drawn solid (a pattern too fine to see). */
export const MAX_DASHES = 10_000;

/** A pattern as SVG reads it: an odd count repeated once; none when it draws solid. */
function dashPattern(dashArray: readonly number[]): number[] | null {
  if (dashArray.length === 0) return null;
  if (dashArray.some((d) => !Number.isFinite(d) || d < 0)) return null;
  const pattern = dashArray.length % 2 === 1 ? [...dashArray, ...dashArray] : [...dashArray];
  return pattern.reduce((sum, d) => sum + d, 0) > 0 ? pattern : null;
}

/**
 * The stretches (from, to, in length along the outline) a pattern draws,
 * `capReach` longer at each end (a round or square cap's half width),
 * overlapping ones merged. Null when it draws the outline solid: no pattern,
 * one SVG would ignore, or more than MAX_DASHES dashes.
 */
export function dashStretches(
  length: number,
  dashArray: readonly number[],
  dashOffset = 0,
  capReach = 0
): Array<[number, number]> | null {
  const pattern = dashPattern(dashArray);
  if (!pattern || !(length > 0)) return null;
  const period = pattern.reduce((sum, d) => sum + d, 0);
  if (length / period > MAX_DASHES) return null;

  // The pattern runs from -offset (a positive offset moves it backwards)
  const phase = (((Number.isFinite(dashOffset) ? dashOffset : 0) % period) + period) % period;
  const stretches: Array<[number, number]> = [];
  let at = -phase;
  for (let i = 0; at <= length; i = (i + 1) % pattern.length) {
    const dash = pattern[i] ?? 0;
    // At the very end only a dot (shown by its cap) is still to draw
    if (i % 2 === 0 && (at < length || dash === 0)) {
      const from = Math.max(0, at - capReach);
      const to = Math.min(length, at + dash + capReach);
      if (to > from) {
        const last = stretches[stretches.length - 1];
        if (last && from <= last[1]) last[1] = Math.max(last[1], to);
        else stretches.push([from, to]);
      }
    }
    at += dash;
  }
  return stretches;
}

/**
 * The pieces of a flattened outline (x, y pairs) a dash pattern draws, each
 * an open run of points. Null when the outline is drawn solid (see
 * dashStretches).
 */
export function dashPolyline(
  points: Float32Array,
  closed: boolean,
  dashArray: readonly number[],
  dashOffset = 0,
  capReach = 0
): Float32Array[] | null {
  const count = points.length >> 1;
  if (count < 2) return null;
  const corners = closed ? count + 1 : count;
  const x = (i: number) => points[(i % count) * 2] ?? 0;
  const y = (i: number) => points[(i % count) * 2 + 1] ?? 0;
  // How far along the outline each corner is
  const along = new Float64Array(corners);
  for (let i = 1; i < corners; i++) {
    along[i] = (along[i - 1] ?? 0) + Math.hypot(x(i) - x(i - 1), y(i) - y(i - 1));
  }
  const length = along[corners - 1] ?? 0;
  const stretches = dashStretches(length, dashArray, dashOffset, capReach);
  if (!stretches) return null;

  /** The segment a distance falls on: the last corner at or before it. */
  const segmentAt = (distance: number) => {
    let low = 0;
    let high = corners - 1;
    while (low < high - 1) {
      const middle = (low + high) >> 1;
      if ((along[middle] ?? 0) <= distance) low = middle;
      else high = middle;
    }
    return low;
  };
  const pointAt = (distance: number, out: number[]) => {
    const i = segmentAt(distance);
    const start = along[i] ?? 0;
    const span = (along[i + 1] ?? start) - start;
    const t = span > 0 ? (distance - start) / span : 0;
    out.push(x(i) + (x(i + 1) - x(i)) * t, y(i) + (y(i + 1) - y(i)) * t);
    return i;
  };

  const pieces: Float32Array[] = [];
  for (const [from, to] of stretches) {
    const piece: number[] = [];
    const first = pointAt(from, piece);
    for (let i = first + 1; i < corners && (along[i] ?? 0) < to; i++) {
      piece.push(x(i), y(i));
    }
    pointAt(to, piece);
    if (piece.length >= 4) pieces.push(new Float32Array(piece));
  }
  return pieces;
}

/**
 * The alignment an open piece of this outline is stroked with to sit where
 * the whole stroke would. Widening flips inside and outside for a closed
 * outline wound one way round, and never for an open run.
 */
export function pieceAlign(
  points: Float32Array,
  closed: boolean,
  align: 'center' | 'inside' | 'outside'
): 'center' | 'inside' | 'outside' {
  if (!closed || align === 'center') return align;
  const count = points.length >> 1;
  let signedArea = 0;
  for (let i = 0; i < count; i++) {
    const j = (i + 1) % count;
    signedArea +=
      (points[i * 2] ?? 0) * (points[j * 2 + 1] ?? 0) -
      (points[j * 2] ?? 0) * (points[i * 2 + 1] ?? 0);
  }
  if (signedArea <= 0) return align;
  return align === 'inside' ? 'outside' : 'inside';
}

/**
 * A closed outline as SVG runs round a rectangle or an ellipse: clockwise on
 * screen (in the editor's Y-up space, negative signed area), from the
 * vertex nearest `start` (a rectangle's top-left, an ellipse's rightmost
 * point), so its dashes start where SVG export's do.
 */
export function clockwiseFrom(points: Float32Array, start: { x: number; y: number }): Float32Array {
  const count = points.length >> 1;
  if (count < 3) return points;
  let signedArea = 0;
  let nearest = 0;
  let nearestDistance = Infinity;
  for (let i = 0; i < count; i++) {
    const j = (i + 1) % count;
    const px = points[i * 2] ?? 0;
    const py = points[i * 2 + 1] ?? 0;
    signedArea += px * (points[j * 2 + 1] ?? 0) - (points[j * 2] ?? 0) * py;
    const distance = Math.hypot(px - start.x, py - start.y);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = i;
    }
  }
  const step = signedArea > 0 ? -1 : 1;
  const out = new Float32Array(points.length);
  for (let k = 0; k < count; k++) {
    const i = (((nearest + step * k) % count) + count) % count;
    out[k * 2] = points[i * 2] ?? 0;
    out[k * 2 + 1] = points[i * 2 + 1] ?? 0;
  }
  return out;
}
