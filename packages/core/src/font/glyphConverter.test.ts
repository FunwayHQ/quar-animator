/**
 * Tests for glyphConverter — glyphPathToSubpaths, computeSubpathsBounds.
 * Note: textToSubpaths requires a real opentype.js Font instance and is
 * harder to unit test with the JSDOM mock — we test it via the mock font.
 */

import { describe, it, expect, vi } from 'vitest';
import { glyphPathToSubpaths, computeSubpathsBounds, textToSubpaths } from './glyphConverter';
import type { PathPoint } from '@quar/types';

// ============================================================================
// Helpers — mock opentype.Path objects
// ============================================================================

function makePath(commands: Array<Record<string, unknown>>): {
  commands: Array<Record<string, unknown>>;
} {
  return { commands };
}

// ============================================================================
// glyphPathToSubpaths
// ============================================================================

describe('glyphPathToSubpaths', () => {
  it('returns empty array for empty path', () => {
    const path = makePath([]);
    const result = glyphPathToSubpaths(path as never);
    expect(result).toEqual([]);
  });

  it('converts M L Z to a closed subpath', () => {
    const path = makePath([
      { type: 'M', x: 0, y: 0 },
      { type: 'L', x: 100, y: 0 },
      { type: 'L', x: 100, y: 100 },
      { type: 'L', x: 0, y: 100 },
      { type: 'Z' },
    ]);
    const result = glyphPathToSubpaths(path as never);
    expect(result.length).toBe(1);
    expect(result[0].length).toBe(4);
    // All points are corners with null handles
    for (const pt of result[0]) {
      expect(pt.type).toBe('corner');
      expect(pt.handleIn).toBeNull();
      expect(pt.handleOut).toBeNull();
    }
  });

  it('flips Y coordinate (Y-down to Y-up)', () => {
    const path = makePath([
      { type: 'M', x: 10, y: 20 },
      { type: 'L', x: 30, y: 40 },
      { type: 'Z' },
    ]);
    const result = glyphPathToSubpaths(path as never);
    // Y should be flipped: -20, -40
    expect(result[0][0].position).toEqual({ x: 10, y: -20 });
    expect(result[0][1].position).toEqual({ x: 30, y: -40 });
  });

  it('handles cubic bezier (C) commands', () => {
    const path = makePath([
      { type: 'M', x: 0, y: 0 },
      { type: 'C', x1: 10, y1: 20, x2: 30, y2: 40, x: 50, y: 60 },
      { type: 'Z' },
    ]);
    const result = glyphPathToSubpaths(path as never);
    expect(result.length).toBe(1);
    expect(result[0].length).toBe(2);

    // First point should have handleOut (cp1 - pos)
    const pt0 = result[0][0];
    expect(pt0.handleOut).not.toBeNull();
    expect(pt0.handleOut!.x).toBeCloseTo(10 - 0);
    expect(pt0.handleOut!.y).toBeCloseTo(-20 - 0); // Y flipped
    expect(pt0.type).toBe('smooth');

    // Second point should have handleIn (cp2 - end)
    const pt1 = result[0][1];
    expect(pt1.handleIn).not.toBeNull();
    expect(pt1.handleIn!.x).toBeCloseTo(30 - 50);
    expect(pt1.handleIn!.y).toBeCloseTo(-40 - -60); // Y flipped
    expect(pt1.type).toBe('smooth');
  });

  it('handles quadratic bezier (Q) commands converted to cubic', () => {
    const path = makePath([
      { type: 'M', x: 0, y: 0 },
      { type: 'Q', x1: 50, y1: 0, x: 100, y: 0 },
      { type: 'Z' },
    ]);
    const result = glyphPathToSubpaths(path as never);
    expect(result.length).toBe(1);
    expect(result[0].length).toBe(2);

    const pt0 = result[0][0];
    const pt1 = result[0][1];

    // Q→cubic: cp1 = prev + 2/3*(ctrl-prev), cp2 = end + 2/3*(ctrl-end)
    // ctrl = (50, 0), Y flipped → (50, 0)
    // cp1 = (0,0) + 2/3*(50,0) = (33.33, 0) → handleOut = (33.33, 0)
    expect(pt0.handleOut!.x).toBeCloseTo((50 * 2) / 3);
    expect(pt0.handleOut!.y).toBeCloseTo(0);
    expect(pt0.type).toBe('smooth');

    // cp2 = (100,0) + 2/3*(50-100,0) = (100 + (-33.33), 0) = (66.67, 0)
    // handleIn = cp2 - end = (66.67-100, 0) = (-33.33, 0)
    expect(pt1.handleIn!.x).toBeCloseTo((-50 * 2) / 3);
    expect(pt1.handleIn!.y).toBeCloseTo(0);
  });

  it('handles multiple subpaths (multiple M commands)', () => {
    const path = makePath([
      { type: 'M', x: 0, y: 0 },
      { type: 'L', x: 10, y: 0 },
      { type: 'Z' },
      { type: 'M', x: 20, y: 20 },
      { type: 'L', x: 30, y: 20 },
      { type: 'Z' },
    ]);
    const result = glyphPathToSubpaths(path as never);
    expect(result.length).toBe(2);
  });

  it('removes duplicate closing point on Z when first == last', () => {
    // When Z is encountered and last point == first point, it removes the duplicate
    const path = makePath([
      { type: 'M', x: 0, y: 0 },
      { type: 'L', x: 100, y: 0 },
      { type: 'L', x: 0, y: 0 }, // Same as start
      { type: 'Z' },
    ]);
    const result = glyphPathToSubpaths(path as never);
    expect(result.length).toBe(1);
    // Should have 2 points (the duplicate closing point removed)
    expect(result[0].length).toBe(2);
  });

  it('transfers handleIn from closing duplicate to first point', () => {
    const path = makePath([
      { type: 'M', x: 0, y: 0 },
      { type: 'C', x1: 10, y1: 10, x2: 20, y2: 20, x: 50, y: 50 },
      { type: 'C', x1: 40, y1: 40, x2: 5, y2: 5, x: 0, y: 0 }, // closes back to start
      { type: 'Z' },
    ]);
    const result = glyphPathToSubpaths(path as never);
    expect(result.length).toBe(1);
    // First point should have gotten handleIn from the closing duplicate
    const firstPt = result[0][0];
    expect(firstPt.handleIn).not.toBeNull();
  });

  it('pushes remaining open subpath when no Z at end', () => {
    const path = makePath([
      { type: 'M', x: 0, y: 0 },
      { type: 'L', x: 100, y: 0 },
      { type: 'L', x: 100, y: 100 },
      // No Z — open path
    ]);
    const result = glyphPathToSubpaths(path as never);
    expect(result.length).toBe(1);
    expect(result[0].length).toBe(3);
  });

  it('handles M followed immediately by another M', () => {
    const path = makePath([
      { type: 'M', x: 0, y: 0 },
      { type: 'M', x: 10, y: 10 },
      { type: 'L', x: 20, y: 20 },
      { type: 'Z' },
    ]);
    const result = glyphPathToSubpaths(path as never);
    // First M creates a subpath with 1 point, second M starts a new subpath
    expect(result.length).toBe(2);
  });
});

// ============================================================================
// computeSubpathsBounds
// ============================================================================

describe('computeSubpathsBounds', () => {
  it('returns zero rect for empty subpaths', () => {
    const result = computeSubpathsBounds([]);
    expect(result).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });

  it('computes AABB of corner points', () => {
    const subpaths: PathPoint[][] = [
      [
        { position: { x: 10, y: 20 }, handleIn: null, handleOut: null, type: 'corner' },
        { position: { x: 50, y: 80 }, handleIn: null, handleOut: null, type: 'corner' },
        { position: { x: 30, y: 40 }, handleIn: null, handleOut: null, type: 'corner' },
      ],
    ];
    const result = computeSubpathsBounds(subpaths);
    expect(result.x).toBe(10);
    expect(result.y).toBe(20);
    expect(result.width).toBe(40); // 50 - 10
    expect(result.height).toBe(60); // 80 - 20
  });

  it('includes handle endpoints in bounds', () => {
    const subpaths: PathPoint[][] = [
      [
        {
          position: { x: 0, y: 0 },
          handleIn: null,
          handleOut: { x: 200, y: 0 }, // extends right to x=200
          type: 'smooth',
        },
        {
          position: { x: 100, y: 100 },
          handleIn: { x: 0, y: -150 }, // extends down to y=-50
          handleOut: null,
          type: 'smooth',
        },
      ],
    ];
    const result = computeSubpathsBounds(subpaths);
    expect(result.x).toBe(0);
    expect(result.y).toBe(-50); // 100 + (-150) = -50
    expect(result.width).toBe(200); // 0 to 200
    expect(result.height).toBe(150); // -50 to 100
  });

  it('computes bounds across multiple subpaths', () => {
    const subpaths: PathPoint[][] = [
      [
        { position: { x: 0, y: 0 }, handleIn: null, handleOut: null, type: 'corner' },
        { position: { x: 10, y: 10 }, handleIn: null, handleOut: null, type: 'corner' },
      ],
      [
        { position: { x: 50, y: 50 }, handleIn: null, handleOut: null, type: 'corner' },
        { position: { x: 100, y: 100 }, handleIn: null, handleOut: null, type: 'corner' },
      ],
    ];
    const result = computeSubpathsBounds(subpaths);
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
    expect(result.width).toBe(100);
    expect(result.height).toBe(100);
  });

  it('enforces minimum width and height of 1', () => {
    const subpaths: PathPoint[][] = [
      [
        { position: { x: 5, y: 5 }, handleIn: null, handleOut: null, type: 'corner' },
        { position: { x: 5, y: 5 }, handleIn: null, handleOut: null, type: 'corner' },
      ],
    ];
    const result = computeSubpathsBounds(subpaths);
    expect(result.width).toBe(1);
    expect(result.height).toBe(1);
  });

  it('handles negative coordinates', () => {
    const subpaths: PathPoint[][] = [
      [
        { position: { x: -50, y: -30 }, handleIn: null, handleOut: null, type: 'corner' },
        { position: { x: 20, y: 10 }, handleIn: null, handleOut: null, type: 'corner' },
      ],
    ];
    const result = computeSubpathsBounds(subpaths);
    expect(result.x).toBe(-50);
    expect(result.y).toBe(-30);
    expect(result.width).toBe(70);
    expect(result.height).toBe(40);
  });
});

// ============================================================================
// textToSubpaths (with mock font)
// ============================================================================

describe('textToSubpaths', () => {
  function createMockFont() {
    const mockGlyph = {
      advanceWidth: 500,
      // Real opentype.js getPath(x, y, fontSize) offsets coordinates by (x, y)
      getPath: vi.fn().mockImplementation((x: number) => ({
        commands: [
          { type: 'M', x: x, y: 0 },
          { type: 'L', x: x + 500, y: 0 },
          { type: 'L', x: x + 500, y: 800 },
          { type: 'L', x: x, y: 800 },
          { type: 'Z' },
        ],
      })),
    };

    const spaceGlyph = {
      advanceWidth: 250,
      getPath: vi.fn().mockReturnValue({ commands: [] }),
    };

    return {
      unitsPerEm: 1000,
      ascender: 800,
      descender: -200,
      stringToGlyphs: vi.fn().mockImplementation((text: string) => {
        return [...text].map((c) => (c === ' ' ? spaceGlyph : mockGlyph));
      }),
      getKerningValue: vi.fn().mockReturnValue(0),
    };
  }

  it('returns subpaths, glyphs, and bounds for single character', () => {
    const font = createMockFont();
    const result = textToSubpaths('A', font as never, 24);
    expect(result.subpaths.length).toBeGreaterThan(0);
    expect(result.glyphs.length).toBe(1);
    expect(result.glyphs[0].char).toBe('A');
    expect(result.bounds).toBeDefined();
    expect(result.bounds.width).toBeGreaterThan(0);
  });

  it('handles multi-character text', () => {
    const font = createMockFont();
    const result = textToSubpaths('AB', font as never, 24);
    expect(result.glyphs.length).toBe(2);
    expect(result.glyphs[0].char).toBe('A');
    expect(result.glyphs[1].char).toBe('B');
  });

  it('handles multi-line text', () => {
    const font = createMockFont();
    const result = textToSubpaths('A\nB', font as never, 24);
    expect(result.glyphs.length).toBe(2);
    // Second line Y offset should be negative (Y-up, line below)
    const line1Y = result.glyphs[0].subpaths[0]?.[0]?.position.y ?? 0;
    const line2Y = result.glyphs[1].subpaths[0]?.[0]?.position.y ?? 0;
    expect(line2Y).toBeLessThan(line1Y);
  });

  it('skips space characters in glyphs output', () => {
    const font = createMockFont();
    const result = textToSubpaths('A B', font as never, 24);
    // Space produces no contours, so only 'A' and 'B' should be in glyphs
    expect(result.glyphs.length).toBe(2);
    expect(result.glyphs[0].char).toBe('A');
    expect(result.glyphs[1].char).toBe('B');
  });

  it('applies letter spacing (shifts glyph positions)', () => {
    const font = createMockFont();
    const resultNoSpacing = textToSubpaths('ABC', font as never, 24, { letterSpacing: 0 });
    const resultWithSpacing = textToSubpaths('ABC', font as never, 24, { letterSpacing: 50 });
    // With 3 glyphs and 50px letter spacing, the last glyph should be shifted 100px right
    // The bounds should reflect the wider spread
    expect(resultWithSpacing.bounds.width).toBeGreaterThan(resultNoSpacing.bounds.width);
  });

  it('applies center text alignment', () => {
    const font = createMockFont();
    // Two lines with different widths
    const result = textToSubpaths('AB\nA', font as never, 24, { textAlign: 'center' });
    // The shorter line should be offset to center relative to the longer line
    expect(result.subpaths.length).toBeGreaterThan(0);
  });

  it('applies right text alignment', () => {
    const font = createMockFont();
    const result = textToSubpaths('AB\nA', font as never, 24, { textAlign: 'right' });
    expect(result.subpaths.length).toBeGreaterThan(0);
  });

  it('scales points based on fontSize and unitsPerEm', () => {
    const font = createMockFont();
    const result24 = textToSubpaths('A', font as never, 24);
    const result48 = textToSubpaths('A', font as never, 48);
    // Bounds at 48px should be roughly 2x the bounds at 24px
    expect(result48.bounds.width).toBeCloseTo(result24.bounds.width * 2, 0);
  });

  it('returns empty for empty string', () => {
    const font = createMockFont();
    const result = textToSubpaths('', font as never, 24);
    expect(result.subpaths.length).toBe(0);
    expect(result.glyphs.length).toBe(0);
  });
});
