/**
 * Text Layout for Quar Animator
 * Breaks text into the lines it's drawn in: at newlines and, for text with a
 * width to wrap at, wherever a line would run past it — between words, or
 * inside a word too long for a line of its own.
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import type opentype from 'opentype.js';
import type { TextNode } from '@quar/types';

// ============================================================================
// Types
// ============================================================================

/** Width of a run of text set on one line. */
export type MeasureText = (text: string) => number;

export interface TextLine {
  /** Characters set on the line; spaces a wrap broke at are left off. */
  text: string;
  /** Index in the text, in code points, of the line's first character. */
  start: number;
  /** Set width of the line. */
  width: number;
}

/** The box text is set in: a width to wrap at, and for a fixed size, a height. */
export interface TextBox {
  width: number;
  height?: number;
}

// ============================================================================
// Text Boxes
// ============================================================================

/**
 * The box a text node is set in, or undefined for auto width text, which is
 * as wide as its longest line.
 */
export function getTextBox(
  node: Pick<TextNode, 'textResize' | 'boxWidth' | 'boxHeight'>
): TextBox | undefined {
  const { textResize, boxWidth, boxHeight } = node;
  if (textResize !== 'auto-height' && textResize !== 'fixed') return undefined;
  if (!boxWidth || !(boxWidth > 0)) return undefined;
  if (textResize === 'fixed' && boxHeight && boxHeight > 0) {
    return { width: boxWidth, height: boxHeight };
  }
  return { width: boxWidth };
}

// ============================================================================
// Measuring
// ============================================================================

/** Measure text set in an opentype.js font: advances, letter spacing and kerning. */
export function fontMeasure(
  font: opentype.Font,
  fontSize: number,
  letterSpacing: number
): MeasureText {
  const scale = fontSize / font.unitsPerEm;
  return (text) => {
    let width = 0;
    const glyphs = font.stringToGlyphs(text);
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
    return width;
  };
}

// ============================================================================
// Line Breaking
// ============================================================================

/**
 * The lines text is set in. Without a wrap width each paragraph is one line,
 * however long; with one, lines break between words to fit, and a word wider
 * than the whole width breaks between its letters.
 */
export function breakTextLines(text: string, measure: MeasureText, wrapWidth?: number): TextLine[] {
  const lines: TextLine[] = [];
  let paragraphStart = 0;
  for (const paragraph of text.split('\n')) {
    const chars = Array.from(paragraph);
    if (wrapWidth === undefined || !(wrapWidth > 0)) {
      lines.push({ text: paragraph, start: paragraphStart, width: measure(paragraph) });
    } else {
      wrapParagraph(chars, paragraphStart, measure, wrapWidth, lines);
    }
    paragraphStart += chars.length + 1; // the newline
  }
  return lines;
}

function wrapParagraph(
  chars: string[],
  offset: number,
  measure: MeasureText,
  wrapWidth: number,
  out: TextLine[]
): void {
  const slice = (from: number, to: number) => chars.slice(from, to).join('');
  const emit = (from: number, to: number) => {
    const text = slice(from, to);
    out.push({ text, start: offset + from, width: measure(text) });
  };

  // Line being filled: chars [lineStart, lineEnd) are set; spaces after it
  // only count if a word follows on the same line
  let lineStart = 0;
  let lineEnd = 0;
  let i = 0;
  while (i < chars.length) {
    if (isSpace(chars[i]!)) {
      i++;
      continue;
    }
    let wordEnd = i;
    while (wordEnd < chars.length && !isSpace(chars[wordEnd]!)) wordEnd++;

    if (lineEnd > lineStart && measure(slice(lineStart, wordEnd)) > wrapWidth) {
      // The word doesn't fit after what's on the line: it starts the next one
      emit(lineStart, lineEnd);
      lineStart = i;
    }
    // A word too wide for any line breaks between letters, a letter at least
    // per line so the text always advances
    while (measure(slice(lineStart, wordEnd)) > wrapWidth && wordEnd - lineStart > 1) {
      let fit = Math.max(lineStart + 1, i + 1);
      while (fit < wordEnd && measure(slice(lineStart, fit + 1)) <= wrapWidth) fit++;
      emit(lineStart, fit);
      lineStart = fit;
    }
    lineEnd = wordEnd;
    i = wordEnd;
  }

  // The last line (and an empty or all-space paragraph is still a line)
  emit(lineStart, lineEnd > lineStart ? lineEnd : lineStart);
}

function isSpace(char: string): boolean {
  return char === ' ' || char === '\t';
}
