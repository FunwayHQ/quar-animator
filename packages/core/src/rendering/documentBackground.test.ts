/**
 * Tests for the document background and the grid drawn on it
 */

import { describe, it, expect } from 'vitest';
import { DEFAULT_DOCUMENT_BACKGROUND, gridColorsFor, toGlColor } from './documentBackground';

describe('documentBackground', () => {
  it('converts colors to WebGL channels', () => {
    expect(toGlColor({ r: 255, g: 0, b: 51, a: 0.5 })).toEqual([1, 0, 0.2, 0.5]);
  });

  it('gives the default background the grid it always had', () => {
    const { minorColor, majorColor, axisColor } = gridColorsFor(DEFAULT_DOCUMENT_BACKGROUND);
    expect(minorColor[0]).toBeCloseTo(0.15, 2);
    expect(majorColor[0]).toBeCloseTo(0.2, 2);
    expect(axisColor[0]).toBeCloseTo(0.3, 2);
  });

  it('draws darker lines on a light background, so they still show', () => {
    const { minorColor, axisColor } = gridColorsFor({ r: 255, g: 255, b: 255, a: 1 });
    expect(minorColor[0]).toBeLessThan(1);
    expect(axisColor[0]).toBeLessThan(minorColor[0]);
  });

  it('keeps a colored background’s hue in its grid', () => {
    const { majorColor } = gridColorsFor({ r: 0, g: 40, b: 120, a: 1 });
    expect(majorColor[2]).toBeGreaterThan(majorColor[0]);
  });
});
