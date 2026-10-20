/**
 * Tests for text set in a box: bounds, glyph layout, lines and placement
 */

import { describe, it, expect, vi } from 'vitest';
import type { TextNode } from '@quar/types';

/** Every glyph is half an em wide; the ascender is 0.8 em. */
const mockFont = vi.hoisted(() => {
  const glyph = {
    advanceWidth: 500,
    getPath: (x: number) => ({
      commands: [
        { type: 'M', x, y: 0 },
        { type: 'L', x: x + 400, y: 0 },
        { type: 'L', x: x + 400, y: -700 },
        { type: 'Z' },
      ],
    }),
  };
  return {
    unitsPerEm: 1000,
    ascender: 800,
    descender: -200,
    stringToGlyphs: (text: string) => [...text].map(() => glyph),
    getKerningValue: () => 0,
  };
});

vi.mock('./FontManager', () => ({
  getFontManager: () => ({ getFont: () => mockFont, getFontOrFallback: () => mockFont }),
}));

import { getTextBounds, getTextNodeBounds, getTextNodeLines } from './textMetrics';
import { textToSubpaths } from './glyphConverter';
import { getTextLocalBounds, keepTextInPlace } from './textPlacement';

function text(overrides: Partial<TextNode> = {}): TextNode {
  return {
    id: 't',
    name: 'Text',
    type: 'text',
    parent: null,
    children: [],
    transform: {
      position: { x: 100, y: 100 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      anchor: { x: 0.5, y: 0.5 },
      skew: { x: 0, y: 0 },
    },
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    content: 'Hello world',
    fontFamily: 'Inter',
    fontSize: 20, // glyphs 10 wide, lines 24 tall, ascender 16
    fontWeight: 400,
    fontStyle: 'normal',
    textAlign: 'left',
    lineHeight: 1.2,
    letterSpacing: 0,
    fills: [],
    strokes: [],
    ...overrides,
  };
}

describe('getTextBounds in a box', () => {
  it('is as wide as the box, and as tall as the wrapped lines', () => {
    // 'Hello world' (110 wide) wraps at 60 into two lines of 24
    expect(getTextBounds('Hello world', 'Inter', 20, 1.2, 0, 'left', { width: 60 })).toEqual({
      x: 0,
      y: 16 - 48,
      width: 60,
      height: 48,
    });
  });

  it('is exactly the box for a fixed size, even when the text runs past it', () => {
    const bounds = getTextBounds('Hello world', 'Inter', 20, 1.2, 0, 'left', {
      width: 60,
      height: 30,
    });
    expect(bounds).toEqual({ x: 0, y: 16 - 30, width: 60, height: 30 });
  });

  it('fits auto width text to its longest line', () => {
    expect(getTextNodeBounds(text())).toMatchObject({ width: 110, height: 24 });
  });

  it('reads the box from the node', () => {
    expect(
      getTextNodeBounds(text({ textResize: 'fixed', boxWidth: 200, boxHeight: 80 }))
    ).toMatchObject({ width: 200, height: 80 });
    expect(getTextNodeBounds(text({ textResize: 'auto-height', boxWidth: 60 }))).toMatchObject({
      width: 60,
      height: 48,
    });
  });
});

describe('getTextNodeLines', () => {
  it('wraps the text in its box', () => {
    expect(
      getTextNodeLines(text({ textResize: 'auto-height', boxWidth: 60 })).map((l) => l.text)
    ).toEqual(['Hello', 'world']);
    expect(getTextNodeLines(text()).map((l) => l.text)).toEqual(['Hello world']);
  });
});

describe('textToSubpaths with a width', () => {
  const left = (glyphs: ReturnType<typeof textToSubpaths>['glyphs'], index: number) =>
    Math.min(...glyphs.find((g) => g.charIndex === index)!.subpaths[0]!.map((p) => p.position.x));
  const baseline = (glyphs: ReturnType<typeof textToSubpaths>['glyphs'], index: number) =>
    Math.min(...glyphs.find((g) => g.charIndex === index)!.subpaths[0]!.map((p) => p.position.y));

  it('wraps glyphs onto lines and keeps their character indices', () => {
    const { glyphs } = textToSubpaths('Hello world', mockFont as never, 20, { width: 60 });

    // 'w' (index 6) starts the second line
    expect(glyphs.map((g) => g.charIndex)).toEqual([0, 1, 2, 3, 4, 6, 7, 8, 9, 10]);
    expect(left(glyphs, 6)).toBeCloseTo(0);
    expect(baseline(glyphs, 6)).toBeCloseTo(-24);
  });

  it('aligns lines within the width', () => {
    const centered = textToSubpaths('Hello world', mockFont as never, 20, {
      width: 60,
      textAlign: 'center',
    });
    const right = textToSubpaths('Hello world', mockFont as never, 20, {
      width: 60,
      textAlign: 'right',
    });

    // 'Hello' is 50 wide in a 60 box
    expect(left(centered.glyphs, 0)).toBeCloseTo(5);
    expect(left(right.glyphs, 0)).toBeCloseTo(10);
  });

  it('reveals a prefix where the full text sets it, so words do not jump lines', () => {
    // 'Hello wo' alone would fit 'wo' after 'Hello' at width 90; the full text wraps it
    const { glyphs } = textToSubpaths('Hello wo', mockFont as never, 20, {
      width: 90,
      alignmentText: 'Hello world',
    });

    expect(glyphs.map((g) => g.charIndex)).toEqual([0, 1, 2, 3, 4, 6, 7]);
    expect(baseline(glyphs, 6)).toBeCloseTo(-24);
  });
});

describe('getTextLocalBounds', () => {
  it('centers an anchored box on the position', () => {
    expect(getTextLocalBounds(text())).toEqual({ x: -55, y: -12, width: 110, height: 24 });
  });

  it('keeps unanchored text hanging from its first baseline', () => {
    const node = text({ transform: { ...text().transform, anchor: { x: 0, y: 0 } } });
    expect(getTextLocalBounds(node)).toEqual({ x: 0, y: 16 - 24, width: 110, height: 24 });
  });
});

describe('keepTextInPlace', () => {
  it('keeps the top left of left-aligned text as it grows', () => {
    const before = text({ content: 'Hi' }); // 20 × 24 centered at (100, 100)
    const after = text({ content: 'Hi there' }); // 80 wide

    const position = keepTextInPlace(before, after);

    // Top left stays at (90, 112): the center moves right by 30
    expect(position).toEqual({ x: 130, y: 100 });
  });

  it('keeps the center of centered text and the right edge of right-aligned text', () => {
    const centered = keepTextInPlace(
      text({ content: 'Hi', textAlign: 'center' }),
      text({ content: 'Hi there', textAlign: 'center' })
    );
    const right = keepTextInPlace(
      text({ content: 'Hi', textAlign: 'right' }),
      text({ content: 'Hi there', textAlign: 'right' })
    );

    expect(centered).toEqual({ x: 100, y: 100 });
    expect(right).toEqual({ x: 70, y: 100 });
  });

  it('keeps the top as wrapped text gets more lines', () => {
    const box = { textResize: 'auto-height' as const, boxWidth: 60 };
    const position = keepTextInPlace(
      text({ ...box, content: 'Hello' }),
      text({ ...box, content: 'Hello world' })
    );

    // One line more: the center moves down half a line
    expect(position).toEqual({ x: 100, y: 88 });
  });

  it('follows the text rotation and scale', () => {
    const transform = { ...text().transform, rotation: 90, scale: { x: 2, y: 2 } };
    const position = keepTextInPlace(
      text({ content: 'Hi', transform }),
      text({ content: 'Hi there', transform })
    );

    // 30 along the text's own x, doubled, then turned a quarter: straight up
    expect(position.x).toBeCloseTo(100);
    expect(position.y).toBeCloseTo(160);
  });
});
