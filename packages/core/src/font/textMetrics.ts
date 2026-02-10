/**
 * Text Metrics for Quar Animator
 * Fast text bounds calculation for selection/hit-testing.
 * Uses opentype.js font metrics when available, Canvas 2D fallback otherwise.
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */
import type opentype from 'opentype.js';
import type { Rect } from '@quar/types';
import { getFontManager } from './FontManager';

/**
 * Get text bounds using opentype.js font metrics.
 * Returns bounds in local space (before transform).
 */
export function getTextBounds(
  content: string,
  fontFamily: string,
  fontSize: number,
  lineHeight: number = 1.2,
  letterSpacing: number = 0,
  textAlign: 'left' | 'center' | 'right' = 'left'
): Rect {
  const fm = getFontManager();
  const font = fm.getFont(fontFamily);

  if (font) {
    return getTextBoundsFromFont(content, font, fontSize, lineHeight, letterSpacing, textAlign);
  }

  // Canvas 2D fallback for system fonts
  return getTextBoundsFromCanvas(content, fontFamily, fontSize, lineHeight, letterSpacing);
}

/**
 * Get text bounds using an opentype.js font instance.
 */
function getTextBoundsFromFont(
  content: string,
  font: opentype.Font,
  fontSize: number,
  lineHeight: number,
  letterSpacing: number,
  _textAlign: 'left' | 'center' | 'right'
): Rect {
  const lines = content.split('\n');
  const scale = fontSize / font.unitsPerEm;
  const lineHeightPx = fontSize * lineHeight;
  const ascender = font.ascender * scale;

  // Measure line widths
  const lineWidths: number[] = [];
  for (const line of lines) {
    let width = 0;
    const glyphs = font.stringToGlyphs(line);
    for (let i = 0; i < glyphs.length; i++) {
      const glyph = glyphs[i]!;
      width += (glyph.advanceWidth ?? 0) * scale;
      if (i < glyphs.length - 1) {
        width += letterSpacing;
        const nextGlyph = glyphs[i + 1];
        if (nextGlyph) {
          width += font.getKerningValue(glyph, nextGlyph) * scale;
        }
      }
    }
    lineWidths.push(width);
  }

  const maxWidth = Math.max(...lineWidths, 1);
  const totalHeight = Math.max(lines.length * lineHeightPx, fontSize);

  return {
    x: 0,
    y: -(totalHeight - ascender), // Y-up: bottom of text is below origin
    width: maxWidth,
    height: totalHeight,
  };
}

/** Shared offscreen canvas for text measurement */
let measureCanvas: HTMLCanvasElement | null = null;
let measureCtx: CanvasRenderingContext2D | null = null;

function getMeasureContext(): CanvasRenderingContext2D | null {
  if (measureCtx) return measureCtx;
  if (typeof document === 'undefined') return null;
  measureCanvas = document.createElement('canvas');
  measureCanvas.width = 1;
  measureCanvas.height = 1;
  measureCtx = measureCanvas.getContext('2d');
  return measureCtx;
}

/**
 * Canvas 2D fallback for system fonts.
 */
function getTextBoundsFromCanvas(
  content: string,
  fontFamily: string,
  fontSize: number,
  lineHeight: number,
  letterSpacing: number
): Rect {
  const ctx = getMeasureContext();
  if (!ctx) {
    // SSR/test fallback: estimate bounds
    const lines = content.split('\n');
    const charWidth = fontSize * 0.6;
    const maxChars = Math.max(...lines.map((l) => l.length), 1);
    return {
      x: 0,
      y: -fontSize * lineHeight * lines.length + fontSize * 0.8,
      width: maxChars * (charWidth + letterSpacing),
      height: fontSize * lineHeight * lines.length,
    };
  }

  ctx.font = `${fontSize}px "${fontFamily}", sans-serif`;
  const lines = content.split('\n');
  const lineHeightPx = fontSize * lineHeight;

  let maxWidth = 0;
  for (const line of lines) {
    const metrics = ctx.measureText(line);
    const lineWidth = metrics.width + (line.length - 1) * letterSpacing;
    if (lineWidth > maxWidth) maxWidth = lineWidth;
  }

  const totalHeight = Math.max(lines.length * lineHeightPx, fontSize);

  return {
    x: 0,
    y: -totalHeight + fontSize * 0.8, // approximate ascender
    width: Math.max(maxWidth, 1),
    height: totalHeight,
  };
}

/**
 * Get scaled font metrics from an opentype.js font.
 */
export function getScaledMetrics(
  font: opentype.Font,
  fontSize: number
): {
  ascender: number;
  descender: number;
  lineHeight: number;
  unitsPerEm: number;
} {
  const scale = fontSize / font.unitsPerEm;
  return {
    ascender: font.ascender * scale,
    descender: font.descender * scale,
    lineHeight: (font.ascender - font.descender) * scale,
    unitsPerEm: font.unitsPerEm,
  };
}
