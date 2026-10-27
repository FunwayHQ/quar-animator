import { describe, expect, it } from 'vitest';

import { MAX_DASHES, clockwiseFrom, dashPolyline, dashStretches, pieceAlign } from './dashes';

const line = (...points: number[]) => new Float32Array(points);
const pairs = (piece: Float32Array | undefined) =>
  Array.from({ length: (piece?.length ?? 0) / 2 }, (_, i) => [piece?.[i * 2], piece?.[i * 2 + 1]]);

describe('dash stretches, as SVG has them', () => {
  it('repeats the pattern along the length', () => {
    expect(dashStretches(25, [5, 5])).toEqual([
      [0, 5],
      [10, 15],
      [20, 25],
    ]);
  });

  it('repeats an odd pattern once more ("5" is "5 5")', () => {
    expect(dashStretches(20, [5])).toEqual([
      [0, 5],
      [10, 15],
    ]);
    // "4 2 1" is "4 2 1 4 2 1": on 4, off 2, on 1, off 4, on 2, off 1
    expect(dashStretches(14, [4, 2, 1])).toEqual([
      [0, 4],
      [6, 7],
      [11, 13],
    ]);
  });

  it('starts the pattern `offset` along (a negative one before)', () => {
    expect(dashStretches(20, [5, 5], 3)).toEqual([
      [0, 2],
      [7, 12],
      [17, 20],
    ]);
    expect(dashStretches(20, [5, 5], -3)).toEqual([
      [3, 8],
      [13, 18],
    ]);
  });

  it('reaches a cap’s half width past each end, joining dashes that meet', () => {
    // Zero-length dashes with round caps: a dotted line
    expect(dashStretches(20, [0, 10], 0, 1)).toEqual([
      [0, 1],
      [9, 11],
      [19, 20],
    ]);
    expect(dashStretches(20, [5, 1], 0, 1)).toEqual([[0, 20]]);
  });

  it('draws solid what SVG would: no pattern, a negative value, nothing but zeros', () => {
    expect(dashStretches(20, [])).toBeNull();
    expect(dashStretches(20, [5, -1])).toBeNull();
    expect(dashStretches(20, [0, 0])).toBeNull();
    expect(dashStretches(20, [Number.NaN, 2])).toBeNull();
  });

  it('draws solid a pattern too fine to see, rather than thousands of dashes', () => {
    expect(dashStretches(MAX_DASHES * 2 - 2, [1, 1])).not.toBeNull();
    expect(dashStretches(MAX_DASHES * 20, [1, 1])).toBeNull();
  });

  it('draws nothing where every dash is empty and uncapped', () => {
    expect(dashStretches(20, [0, 10])).toEqual([]);
  });
});

describe('dashing an outline', () => {
  it('cuts the pieces out, corners and all', () => {
    // An L: 10 across, 10 up
    const pieces = dashPolyline(line(0, 0, 10, 0, 10, 10), false, [6, 2]);
    expect(pieces?.map(pairs)).toEqual([
      [
        [0, 0],
        [6, 0],
      ],
      [
        [8, 0],
        [10, 0],
        [10, 4],
      ],
      [
        [10, 6],
        [10, 10],
      ],
    ]);
  });

  it('goes round a closed outline back to its start', () => {
    // A 10 × 10 square is 40 round: dashes of 15 every 20
    const square = line(0, 0, 10, 0, 10, 10, 0, 10);
    const pieces = dashPolyline(square, true, [15, 5]);
    expect(pieces?.map(pairs)).toEqual([
      [
        [0, 0],
        [10, 0],
        [10, 5],
      ],
      [
        [10, 10],
        [0, 10],
        [0, 5],
      ],
    ]);
  });

  it('draws the outline whole when there’s no pattern', () => {
    expect(dashPolyline(line(0, 0, 10, 0), false, [])).toBeNull();
    expect(dashPolyline(line(0, 0), false, [1, 1])).toBeNull();
  });
});

describe('the side a dash is drawn on', () => {
  const clockwise = line(0, 0, 0, 10, 10, 10, 10, 0); // negative signed area
  const counter = line(0, 0, 10, 0, 10, 10, 0, 10); // positive

  it('is the whole stroke’s, though a piece is open', () => {
    // Widening flips inside and outside for a positively wound closed outline
    expect(pieceAlign(counter, true, 'inside')).toBe('outside');
    expect(pieceAlign(counter, true, 'outside')).toBe('inside');
    expect(pieceAlign(clockwise, true, 'inside')).toBe('inside');
    expect(pieceAlign(counter, true, 'center')).toBe('center');
    expect(pieceAlign(counter, false, 'inside')).toBe('inside');
  });
});

describe('a rectangle or ellipse run as SVG runs it', () => {
  it('goes clockwise on screen from the start SVG uses', () => {
    // The editor's rectangle, Y up: bottom-left, bottom-right, top-right, top-left
    const rect = line(0, 0, 10, 0, 10, 5, 0, 5);
    // SVG's: top-left, then right along the top, down, back along the bottom
    expect(pairs(clockwiseFrom(rect, { x: 0, y: 5 }))).toEqual([
      [0, 5],
      [10, 5],
      [10, 0],
      [0, 0],
    ]);
    // Already clockwise: only where it starts changes
    const clockwise = line(0, 5, 10, 5, 10, 0, 0, 0);
    expect(pairs(clockwiseFrom(clockwise, { x: 10, y: 0 }))).toEqual([
      [10, 0],
      [0, 0],
      [0, 5],
      [10, 5],
    ]);
  });
});
