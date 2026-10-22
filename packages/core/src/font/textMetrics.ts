/**
 * Text Metrics for Quar Animator
 * Fast text bounds calculation for selection/hit-testing.
 * Uses opentype.js font metrics when available, Canvas 2D fallback otherwise.
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */
import type opentype from 'opentype.js';
import type { Rect, TextNode } from '@quar/types';
import { getFontManager } from './FontManager';
import { breakTextLines, fontMeasure, getTextBox } from './textLayout';
import type { MeasureText, TextBox, TextLine } from './textLayout';

/**
 * Get text bounds using opentype.js font metrics.
 * Returns bounds in local space (before transform): from the left of the
 * text, and from the ascender above the first baseline down. Text set in a
 * box is as wide as the box, and as tall when the box has a height.
 * Measured in the font the text is drawn in: its weight, or the fallback that
 * stands in while its family isn't loaded.
 */
export function getTextBounds(
  content: string,
  fontFamily: string,
  fontSize: number,
  lineHeight: number = 1.2,
  letterSpacing: number = 0,
  // Lines align within the bounds, so alignment doesn't change them
  _textAlign: 'left' | 'center' | 'right' = 'left',
  box?: TextBox,
  fontWeight: number = 400
): Rect {
  const fm = getFontManager();
  const font = fm.getFontOrFallback(fontFamily, fontWeight);

  if (font) {
    const ascender = font.ascender * (fontSize / font.unitsPerEm);
    return boundsFromLines(
      content,
      fontMeasure(font, fontSize, letterSpacing),
      ascender,
      fontSize,
      lineHeight,
      box
    );
  }

  // No font loaded at all yet: estimate with Canvas 2D
  return getTextBoundsFromCanvas(content, fontFamily, fontSize, lineHeight, letterSpacing, box);
}

/** Local bounds of a text node, in its box when it has one (before its anchor offset). */
export function getTextNodeBounds(node: TextNode): Rect {
  return getTextBounds(
    node.content,
    node.fontFamily,
    node.fontSize,
    node.lineHeight,
    node.letterSpacing,
    node.textAlign,
    getTextBox(node),
    node.fontWeight
  );
}

/**
 * The lines a text node is set in, wrapped in its box when it has one —
 * measured in its font, or estimated when the font isn't loaded.
 */
export function getTextNodeLines(node: TextNode): TextLine[] {
  const font = getFontManager().getFontOrFallback(node.fontFamily, node.fontWeight);
  const measure: MeasureText = font
    ? fontMeasure(font, node.fontSize, node.letterSpacing)
    : (text) => Array.from(text).length * (node.fontSize * 0.6 + node.letterSpacing);
  return breakTextLines(node.content, measure, getTextBox(node)?.width);
}

function boundsFromLines(
  content: string,
  measure: MeasureText,
  ascender: number,
  fontSize: number,
  lineHeight: number,
  box: TextBox | undefined
): Rect {
  const lines = breakTextLines(content, measure, box?.width);
  const width = box ? box.width : Math.max(...lines.map((line) => line.width), 1);
  const height = box?.height ?? Math.max(lines.length * fontSize * lineHeight, fontSize);

  return {
    x: 0,
    y: -(height - ascender), // Y-up: bottom of text is below origin
    width,
    height,
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
  letterSpacing: number,
  box: TextBox | undefined
): Rect {
  const ctx = getMeasureContext();
  if (!ctx) {
    // SSR/test fallback: estimate bounds
    const charWidth = fontSize * 0.6;
    const estimate: MeasureText = (text) => Array.from(text).length * (charWidth + letterSpacing);
    return boundsFromLines(content, estimate, fontSize * 0.8, fontSize, lineHeight, box);
  }

  ctx.font = `${fontSize}px "${fontFamily}", sans-serif`;
  const measure: MeasureText = (text) =>
    ctx.measureText(text).width + (Array.from(text).length - 1) * letterSpacing;
  return boundsFromLines(content, measure, fontSize * 0.8, fontSize, lineHeight, box); // approximate ascender
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
