/**
 * contourTriangulation — fill coverage of compound paths must match the fill
 * rule, including font outlines whose contours overlap and self-intersect.
 */

import { describe, it, expect } from 'vitest';
import {
  triangulateContours,
  triangulateGlyphContours,
  contoursInteract,
} from './contourTriangulation';
import { parseSvgPath } from '../svg/svgPathParser';
import { tessellatePathToVertices } from '../path/pathUtils';

// Glyphs from a Figma "EUREKA GROUP" text-outline export.
// R: stem+bowl outline, a separate leg overlapping the bowl, and a counter that
// starts on the stem edge and crosses itself at its chamfered corners.
const GLYPH_R =
  'M172.16 84.016V1.41602H207.442C218.927 1.41602 227.856 4.09068 234.228 9.44002C240.6 14.7107 243.786 22.0267 243.786 31.388C243.786 37.524 242.331 42.834 239.42 47.318C236.509 51.7234 232.379 55.106 227.03 57.466C221.681 59.826 215.309 61.006 207.914 61.006H182.78L191.276 52.628V84.016H172.16ZM224.67 84.016L204.02 54.044H224.434L245.32 84.016H224.67ZM191.276 54.752L182.78 45.784H206.852C212.752 45.784 217.157 44.5254 220.068 42.008C222.979 39.412 224.434 35.872 224.434 31.388C224.434 26.8254 222.979 23.2854 220.068 20.768C217.157 18.2507 212.752 16.992 206.852 16.992H182.78L191.276 7.90602V54.752Z';
const GLYPH_P =
  'M915.77 84.016V1.41602H951.523C958.918 1.41602 965.29 2.63535 970.64 5.07402C975.989 7.43401 980.119 10.856 983.03 15.34C985.94 19.824 987.396 25.1734 987.396 31.388C987.396 37.524 985.94 42.834 983.03 47.318C980.119 51.802 975.989 55.2634 970.64 57.702C965.29 60.062 958.918 61.242 951.523 61.242H926.39L934.885 52.628V84.016H915.77ZM934.885 54.752L926.39 45.666H950.462C956.362 45.666 960.767 44.4074 963.678 41.89C966.588 39.3727 968.044 35.872 968.044 31.388C968.044 26.8254 966.588 23.2854 963.678 20.768C960.767 18.2507 956.362 16.992 950.462 16.992H926.39L934.885 7.90602V54.752Z';
const GLYPH_O =
  'M763.332 85.432C756.802 85.432 750.745 84.37 745.16 82.246C739.653 80.122 734.854 77.1327 730.764 73.278C726.752 69.4233 723.605 64.9 721.324 59.708C719.121 54.516 718.02 48.852 718.02 42.716C718.02 36.58 719.121 30.916 721.324 25.724C723.605 20.532 726.791 16.0087 730.882 12.154C734.972 8.29933 739.771 5.31 745.278 3.186C750.784 1.062 756.763 0 763.214 0C769.743 0 775.722 1.062 781.15 3.186C786.656 5.31 791.416 8.29933 795.428 12.154C799.518 16.0087 802.704 20.532 804.986 25.724C807.267 30.8373 808.408 36.5013 808.408 42.716C808.408 48.852 807.267 54.5553 804.986 59.826C802.704 65.018 799.518 69.5413 795.428 73.396C791.416 77.172 786.656 80.122 781.15 82.246C775.722 84.37 769.782 85.432 763.332 85.432ZM763.214 69.148C766.911 69.148 770.294 68.5187 773.362 67.26C776.508 66.0013 779.262 64.192 781.622 61.832C783.982 59.472 785.791 56.6793 787.05 53.454C788.387 50.2287 789.056 46.6493 789.056 42.716C789.056 38.7827 788.387 35.2033 787.05 31.978C785.791 28.7527 783.982 25.96 781.622 23.6C779.34 21.24 776.626 19.4307 773.48 18.172C770.333 16.9133 766.911 16.284 763.214 16.284C759.516 16.284 756.094 16.9133 752.948 18.172C749.88 19.4307 747.166 21.24 744.806 23.6C742.446 25.96 740.597 28.7527 739.26 31.978C738.001 35.2033 737.372 38.7827 737.372 42.716C737.372 46.5707 738.001 50.15 739.26 53.454C740.597 56.6793 742.406 59.472 744.688 61.832C747.048 64.192 749.801 66.0013 752.948 67.26C756.094 68.5187 759.516 69.148 763.214 69.148Z';

function contoursFromSvg(d: string): Float32Array[] {
  return parseSvgPath(d).map((sp) => tessellatePathToVertices(sp.points, true, 1.0));
}

function square(x: number, y: number, size: number, clockwise = false): Float32Array {
  const pts = [x, y, x + size, y, x + size, y + size, x, y + size];
  if (!clockwise) return new Float32Array(pts);
  return new Float32Array([x, y, x, y + size, x + size, y + size, x + size, y]);
}

/** Winding number of point p around a closed contour. */
function winding(px: number, py: number, verts: Float32Array): number {
  let w = 0;
  const n = verts.length / 2;
  for (let i = 0; i < n; i++) {
    const ax = verts[i * 2]!;
    const ay = verts[i * 2 + 1]!;
    const bx = verts[((i + 1) % n) * 2]!;
    const by = verts[((i + 1) % n) * 2 + 1]!;
    const cross = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
    if (ay <= py) {
      if (by > py && cross > 0) w++;
    } else if (by <= py && cross < 0) {
      w--;
    }
  }
  return w;
}

function insideTriangles(px: number, py: number, vertices: Float32Array, indices: number[]) {
  for (let t = 0; t < indices.length; t += 3) {
    const [a, b, c] = [indices[t]!, indices[t + 1]!, indices[t + 2]!];
    const ax = vertices[a * 2]!;
    const ay = vertices[a * 2 + 1]!;
    const bx = vertices[b * 2]!;
    const by = vertices[b * 2 + 1]!;
    const cx = vertices[c * 2]!;
    const cy = vertices[c * 2 + 1]!;
    const d1 = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
    const d2 = (cx - bx) * (py - by) - (cy - by) * (px - bx);
    const d3 = (ax - cx) * (py - cy) - (ay - cy) * (px - cx);
    const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
    const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
    if (!(hasNeg && hasPos)) return true;
  }
  return false;
}

/** Sample a grid over the contours and count points where coverage ≠ nonzero rule. */
function nonzeroMismatches(
  contours: Float32Array[],
  step = 0.37,
  { vertices, indices } = triangulateContours(contours, 'nonzero')
): number {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const c of contours) {
    for (let i = 0; i < c.length; i += 2) {
      minX = Math.min(minX, c[i]!);
      maxX = Math.max(maxX, c[i]!);
      minY = Math.min(minY, c[i + 1]!);
      maxY = Math.max(maxY, c[i + 1]!);
    }
  }
  let mismatches = 0;
  for (let y = minY + step / 2; y < maxY; y += step) {
    for (let x = minX + step / 2; x < maxX; x += step) {
      let w = 0;
      for (const c of contours) w += winding(x, y, c);
      if ((w !== 0) !== insideTriangles(x, y, vertices, indices)) mismatches++;
    }
  }
  return mismatches;
}

describe('triangulateContours', () => {
  it('fills an overlapping, self-intersecting R glyph by the nonzero rule', () => {
    const contours = contoursFromSvg(GLYPH_R);
    expect(contours).toHaveLength(3);
    expect(contoursInteract(contours)).toBe(true);
    expect(nonzeroMismatches(contours)).toBe(0);
  });

  it('keeps the counter of a P glyph whose counter starts on the stem edge', () => {
    const contours = contoursFromSvg(GLYPH_P);
    expect(nonzeroMismatches(contours)).toBe(0);
    // Centre of the counter stays empty
    const { vertices, indices } = triangulateContours(contours, 'nonzero');
    expect(insideTriangles(950, 31, vertices, indices)).toBe(false);
    expect(insideTriangles(925, 31, vertices, indices)).toBe(true); // stem
  });

  it('leaves cleanly nested contours on the containment path with unchanged vertices', () => {
    const contours = contoursFromSvg(GLYPH_O);
    expect(contoursInteract(contours)).toBe(false);
    const { vertices } = triangulateContours(contours, 'nonzero');
    const total = contours.reduce((n, c) => n + c.length, 0);
    expect(vertices.length).toBe(total);
    expect(nonzeroMismatches(contours)).toBe(0);
  });

  it('merges overlapping same-direction contours instead of drawing the overlap twice', () => {
    const contours = [square(0, 0, 10), square(5, 5, 10)];
    expect(contoursInteract(contours)).toBe(true);
    const { vertices, indices } = triangulateContours(contours, 'nonzero');
    expect(nonzeroMismatches(contours, 0.29)).toBe(0);
    // Total triangle area equals the union area (100 + 100 − 25), no double cover
    let area = 0;
    for (let t = 0; t < indices.length; t += 3) {
      const [a, b, c] = [indices[t]!, indices[t + 1]!, indices[t + 2]!];
      area +=
        Math.abs(
          (vertices[b * 2]! - vertices[a * 2]!) * (vertices[c * 2 + 1]! - vertices[a * 2 + 1]!) -
            (vertices[c * 2]! - vertices[a * 2]!) * (vertices[b * 2 + 1]! - vertices[a * 2 + 1]!)
        ) / 2;
    }
    expect(area).toBeCloseTo(175, 3);
  });

  it('cuts an opposite-winding overlapping contour out of the fill', () => {
    const contours = [square(0, 0, 10), square(5, 5, 10, true)];
    expect(nonzeroMismatches(contours, 0.29)).toBe(0);
  });

  it('keeps evenodd fills on the containment path', () => {
    const contours = [square(0, 0, 10), square(5, 5, 10)];
    const { vertices } = triangulateContours(contours, 'evenodd');
    expect(vertices.length).toBe(16);
  });
});

describe('triangulateGlyphContours', () => {
  it('fills each glyph by the nonzero rule: self-crossing, overlapping and with a counter', () => {
    // A w-like single contour crossing itself: a pentagram, its middle wound twice
    const star = new Float32Array(
      [0, 2, 4, 1, 3].flatMap((k) => {
        const angle = Math.PI / 2 + (k * 2 * Math.PI) / 5;
        return [20 + 10 * Math.cos(angle), 10 + 10 * Math.sin(angle)];
      })
    );
    // An A-like crossbar over a leg, both wound the same way; an a-like counter
    const overlapping = [square(40, 0, 10), square(45, 5, 10)];
    const withCounter = [square(70, 0, 12), square(73, 3, 4, true)];
    const glyphs = [[star], overlapping, withCounter];

    const triangulated = triangulateGlyphContours(glyphs);

    expect(nonzeroMismatches(glyphs.flat(), 0.37, triangulated)).toBe(0);
    // Glyphs that don't interact keep their vertices as given
    expect(Array.from(triangulated.vertices.slice(-16))).toEqual([
      ...Array.from(withCounter[0]!),
      ...Array.from(withCounter[1]!),
    ]);
  });
});

describe('contoursInteract', () => {
  it('is false for disjoint and cleanly nested contours', () => {
    expect(contoursInteract([square(0, 0, 10), square(20, 0, 10)])).toBe(false);
    expect(contoursInteract([square(0, 0, 10), square(2, 2, 4, true)])).toBe(false);
  });

  it('detects a vertex touching another contour edge', () => {
    // Inner square's corner sits on the outer square's left edge
    const inner = new Float32Array([0, 5, 4, 3, 6, 5, 4, 7]);
    expect(contoursInteract([square(0, 0, 10), inner])).toBe(true);
  });

  it('detects a self-intersecting contour', () => {
    const bowtie = new Float32Array([0, 0, 10, 10, 10, 0, 0, 10]);
    expect(contoursInteract([bowtie])).toBe(true);
  });
});
