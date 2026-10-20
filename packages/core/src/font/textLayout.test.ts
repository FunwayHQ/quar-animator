/**
 * Tests for text layout: line breaking, wrapping and text boxes
 */

import { describe, it, expect, vi } from 'vitest';
import { breakTextLines, fontMeasure, getTextBox } from './textLayout';
import type { MeasureText } from './textLayout';

/** Every character is 10 wide. */
const measure: MeasureText = (text) => Array.from(text).length * 10;

const texts = (lines: Array<{ text: string }>) => lines.map((line) => line.text);

describe('breakTextLines', () => {
  it('sets each paragraph on one line without a wrap width', () => {
    const lines = breakTextLines('Hello world\nSecond line goes on', measure);

    expect(lines).toEqual([
      { text: 'Hello world', start: 0, width: 110 },
      { text: 'Second line goes on', start: 12, width: 190 },
    ]);
  });

  it('wraps between words to fit the width', () => {
    // 'Hello world' is 110 wide; 100 fits 'Hello' but not ' world' after it
    const lines = breakTextLines('Hello world again', measure, 100);

    expect(texts(lines)).toEqual(['Hello', 'world', 'again']);
    expect(lines.map((line) => line.start)).toEqual([0, 6, 12]);
  });

  it('keeps words together on a line while they fit', () => {
    expect(texts(breakTextLines('a b c d e f', measure, 50))).toEqual(['a b c', 'd e f']);
  });

  it('leaves off the spaces it breaks at, and counts them in the next start', () => {
    const lines = breakTextLines('one   two', measure, 40);

    expect(lines).toEqual([
      { text: 'one', start: 0, width: 30 },
      { text: 'two', start: 6, width: 30 },
    ]);
  });

  it('breaks a word wider than the box between its letters', () => {
    const lines = breakTextLines('abcdefghij xy', measure, 40);

    expect(texts(lines)).toEqual(['abcd', 'efgh', 'ij', 'xy']);
    expect(lines.map((line) => line.start)).toEqual([0, 4, 8, 11]);
  });

  it('sets at least one letter per line, however narrow the box', () => {
    expect(texts(breakTextLines('abc', measure, 1))).toEqual(['a', 'b', 'c']);
  });

  it('wraps each paragraph on its own and keeps empty ones', () => {
    const lines = breakTextLines('aa bb\n\ncc', measure, 30);

    expect(texts(lines)).toEqual(['aa', 'bb', '', 'cc']);
    expect(lines.map((line) => line.start)).toEqual([0, 3, 6, 7]);
  });

  it('counts leading spaces on the first line', () => {
    expect(texts(breakTextLines('  ab cd', measure, 40))).toEqual(['  ab', 'cd']);
  });

  it('indexes by code point, so emoji count once', () => {
    const lines = breakTextLines('😀😀 ab', measure, 20);

    expect(texts(lines)).toEqual(['😀😀', 'ab']);
    expect(lines[1]!.start).toBe(3);
  });

  it('gives empty text one empty line', () => {
    expect(breakTextLines('', measure, 50)).toEqual([{ text: '', start: 0, width: 0 }]);
  });
});

describe('getTextBox', () => {
  it('has no box for auto width text', () => {
    expect(getTextBox({})).toBeUndefined();
    expect(getTextBox({ textResize: 'auto-width', boxWidth: 100, boxHeight: 50 })).toBeUndefined();
  });

  it('wraps auto height text at its width, with no height', () => {
    expect(getTextBox({ textResize: 'auto-height', boxWidth: 100, boxHeight: 50 })).toEqual({
      width: 100,
    });
  });

  it('gives fixed size text its width and height', () => {
    expect(getTextBox({ textResize: 'fixed', boxWidth: 100, boxHeight: 50 })).toEqual({
      width: 100,
      height: 50,
    });
  });

  it('ignores a missing or empty width', () => {
    expect(getTextBox({ textResize: 'fixed', boxHeight: 50 })).toBeUndefined();
    expect(getTextBox({ textResize: 'auto-height', boxWidth: 0 })).toBeUndefined();
  });
});

describe('fontMeasure', () => {
  it('adds advances, letter spacing between glyphs, and kerning', () => {
    const glyph = { advanceWidth: 500 };
    const font = {
      unitsPerEm: 1000,
      stringToGlyphs: vi.fn((text: string) => [...text].map(() => glyph)),
      getKerningValue: vi.fn(() => -100),
    };

    // 3 glyphs × 10 + 2 gaps × (2 spacing − 2 kerning) at 20px
    expect(fontMeasure(font as never, 20, 2)('abc')).toBe(30);
  });
});
