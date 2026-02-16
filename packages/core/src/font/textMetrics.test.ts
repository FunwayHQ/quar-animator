/**
 * Tests for textMetrics — getTextBounds, getScaledMetrics.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the FontManager before importing
const mockGetFont = vi.fn();
vi.mock('./FontManager', () => ({
  getFontManager: () => ({
    getFont: mockGetFont,
  }),
}));

import { getTextBounds, getScaledMetrics } from './textMetrics';

// ============================================================================
// Helpers
// ============================================================================

function createMockFont(overrides: Record<string, unknown> = {}) {
  const mockGlyph = {
    advanceWidth: 500,
  };

  return {
    unitsPerEm: 1000,
    ascender: 800,
    descender: -200,
    stringToGlyphs: vi.fn().mockImplementation((text: string) => {
      return [...text].map(() => mockGlyph);
    }),
    getKerningValue: vi.fn().mockReturnValue(0),
    ...overrides,
  };
}

// ============================================================================
// getTextBounds
// ============================================================================

describe('getTextBounds', () => {
  beforeEach(() => {
    mockGetFont.mockReset();
  });

  describe('with opentype font', () => {
    it('returns bounds for single-line text', () => {
      const font = createMockFont();
      mockGetFont.mockReturnValue(font);

      const bounds = getTextBounds('Hello', 'TestFont', 24);
      expect(bounds.width).toBeGreaterThan(0);
      expect(bounds.height).toBeGreaterThan(0);
    });

    it('returns bounds scaled by fontSize', () => {
      const font = createMockFont();
      mockGetFont.mockReturnValue(font);

      const bounds24 = getTextBounds('A', 'TestFont', 24);
      const bounds48 = getTextBounds('A', 'TestFont', 48);
      // Width at 48px should be 2x width at 24px
      expect(bounds48.width).toBeCloseTo(bounds24.width * 2, 0);
    });

    it('includes ascender in Y positioning', () => {
      const font = createMockFont();
      mockGetFont.mockReturnValue(font);

      const bounds = getTextBounds('A', 'TestFont', 24);
      // ascender = 800 * (24/1000) = 19.2
      // totalHeight = max(1 * 28.8, 24) = 28.8
      // y = -(28.8 - 19.2) = -9.6
      expect(bounds.y).toBeCloseTo(-9.6);
    });

    it('handles multi-line text', () => {
      const font = createMockFont();
      mockGetFont.mockReturnValue(font);

      const singleLine = getTextBounds('A', 'TestFont', 24);
      const twoLines = getTextBounds('A\nB', 'TestFont', 24);
      // Two lines should be taller
      expect(twoLines.height).toBeGreaterThan(singleLine.height);
    });

    it('measures line widths separately and takes max', () => {
      const font = createMockFont();
      mockGetFont.mockReturnValue(font);

      // 'ABC' is wider than 'A'
      const bounds = getTextBounds('ABC\nA', 'TestFont', 24);
      const longerLine = getTextBounds('ABC', 'TestFont', 24);
      expect(bounds.width).toBeCloseTo(longerLine.width, 0);
    });

    it('includes letter spacing in width calculation', () => {
      const font = createMockFont();
      mockGetFont.mockReturnValue(font);

      const noSpacing = getTextBounds('AB', 'TestFont', 24, 1.2, 0);
      const withSpacing = getTextBounds('AB', 'TestFont', 24, 1.2, 10);
      expect(withSpacing.width).toBeGreaterThan(noSpacing.width);
    });

    it('accounts for kerning', () => {
      const font = createMockFont({
        getKerningValue: vi.fn().mockReturnValue(-50), // Tight kerning
      });
      mockGetFont.mockReturnValue(font);

      const bounds = getTextBounds('AB', 'TestFont', 24);
      expect(bounds.width).toBeGreaterThan(0);
    });

    it('handles empty string', () => {
      const font = createMockFont({
        stringToGlyphs: vi.fn().mockReturnValue([]),
      });
      mockGetFont.mockReturnValue(font);

      const bounds = getTextBounds('', 'TestFont', 24);
      expect(bounds.width).toBe(1); // min width
      expect(bounds.height).toBeGreaterThan(0);
    });
  });

  describe('without opentype font (Canvas 2D fallback)', () => {
    beforeEach(() => {
      mockGetFont.mockReturnValue(null);
    });

    it('returns estimated bounds for single-line text', () => {
      const bounds = getTextBounds('Hello', 'Arial', 24);
      expect(bounds.width).toBeGreaterThan(0);
      expect(bounds.height).toBeGreaterThan(0);
    });

    it('handles multi-line text', () => {
      const singleLine = getTextBounds('Hello', 'Arial', 24);
      const twoLines = getTextBounds('Hello\nWorld', 'Arial', 24);
      expect(twoLines.height).toBeGreaterThan(singleLine.height);
    });

    it('includes letter spacing', () => {
      const noSpacing = getTextBounds('AB', 'Arial', 24, 1.2, 0);
      const withSpacing = getTextBounds('AB', 'Arial', 24, 1.2, 10);
      expect(withSpacing.width).toBeGreaterThan(noSpacing.width);
    });

    it('x is always 0', () => {
      const bounds = getTextBounds('Test', 'Arial', 24);
      expect(bounds.x).toBe(0);
    });
  });
});

// ============================================================================
// getScaledMetrics
// ============================================================================

describe('getScaledMetrics', () => {
  it('returns scaled ascender', () => {
    const font = createMockFont();
    const metrics = getScaledMetrics(font as never, 24);
    // ascender = 800 * (24/1000) = 19.2
    expect(metrics.ascender).toBeCloseTo(19.2);
  });

  it('returns scaled descender', () => {
    const font = createMockFont();
    const metrics = getScaledMetrics(font as never, 24);
    // descender = -200 * (24/1000) = -4.8
    expect(metrics.descender).toBeCloseTo(-4.8);
  });

  it('returns scaled lineHeight (ascender - descender)', () => {
    const font = createMockFont();
    const metrics = getScaledMetrics(font as never, 24);
    // lineHeight = (800 - (-200)) * (24/1000) = 1000 * 0.024 = 24
    expect(metrics.lineHeight).toBeCloseTo(24);
  });

  it('returns unitsPerEm', () => {
    const font = createMockFont();
    const metrics = getScaledMetrics(font as never, 24);
    expect(metrics.unitsPerEm).toBe(1000);
  });

  it('scales correctly with different font sizes', () => {
    const font = createMockFont();
    const m12 = getScaledMetrics(font as never, 12);
    const m24 = getScaledMetrics(font as never, 24);
    expect(m24.ascender).toBeCloseTo(m12.ascender * 2);
    expect(m24.descender).toBeCloseTo(m12.descender * 2);
    expect(m24.lineHeight).toBeCloseTo(m12.lineHeight * 2);
  });

  it('handles different unitsPerEm values', () => {
    const font = createMockFont({ unitsPerEm: 2048 });
    const metrics = getScaledMetrics(font as never, 24);
    // scale = 24 / 2048
    expect(metrics.ascender).toBeCloseTo(800 * (24 / 2048));
  });
});
