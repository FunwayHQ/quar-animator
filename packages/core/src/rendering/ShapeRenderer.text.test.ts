/**
 * Tests for ShapeRenderer text reveal (typewriter) positioning
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { ShapeRenderer } from './ShapeRenderer';
import { WebGLRenderer } from './WebGLRenderer';
import { createDefaultTransform } from '../SceneGraph';
import { mat3 } from '../math';
import { createMockWebGL2Context } from '../test/setup';
import { getTextBounds } from '../font/textMetrics';
import type { TextNode } from '@quar/types';

// Square glyphs, 500 units wide on a 1000-unit em
const mockGlyph = {
  advanceWidth: 500,
  getPath: (x: number) => ({
    commands: [
      { type: 'M', x, y: 0 },
      { type: 'L', x: x + 500, y: 0 },
      { type: 'L', x: x + 500, y: 800 },
      { type: 'L', x, y: 800 },
      { type: 'Z' },
    ],
  }),
};
const mockFont = {
  unitsPerEm: 1000,
  ascender: 800,
  descender: -200,
  stringToGlyphs: (text: string) => [...text].map(() => mockGlyph),
  getKerningValue: () => 0,
};

// The font drawn with, and the font manager's count of font loads
const fonts: { current: typeof mockFont; generation: number } = {
  current: mockFont,
  generation: 0,
};

vi.mock('../font/FontManager', () => ({
  getFontManager: () => ({
    getFontOrFallback: () => fonts.current,
    get generation() {
      return fonts.generation;
    },
  }),
}));

vi.mock('../font/textMetrics', () => {
  // Width grows with the text so a re-centred prefix would shift the anchor
  const getTextBounds = vi.fn((content: string, _family: string, fontSize: number) => ({
    x: 0,
    y: -fontSize,
    width: Array.from(content).length * fontSize * 0.5,
    height: fontSize,
  }));
  return {
    getTextBounds,
    getTextNodeBounds: (node: TextNode) =>
      getTextBounds(
        node.content,
        node.fontFamily,
        node.fontSize,
        node.lineHeight,
        node.letterSpacing,
        node.textAlign
      ),
  };
});

function createTextNode(content: string, visibleCharacters?: number): TextNode {
  return {
    id: 'text-1',
    name: 'Text',
    type: 'text',
    parent: null,
    children: [],
    transform: { ...createDefaultTransform(), anchor: { x: 0.5, y: 0.5 } },
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    content,
    ...(visibleCharacters !== undefined ? { visibleCharacters } : {}),
    fontFamily: 'Inter',
    fontSize: 24,
    fontWeight: 400,
    fontStyle: 'normal',
    textAlign: 'left',
    lineHeight: 1.2,
    letterSpacing: 0,
    fills: [{ type: 'solid', color: { r: 0, g: 0, b: 0, a: 1 }, opacity: 1, visible: true }],
    strokes: [],
  };
}

describe('ShapeRenderer - text reveal', () => {
  let shapeRenderer: ShapeRenderer;
  let gl: WebGL2RenderingContext;

  beforeEach(() => {
    const canvas = document.createElement('canvas');
    gl = createMockWebGL2Context();
    canvas.getContext = vi.fn().mockReturnValue(gl);
    shapeRenderer = new ShapeRenderer(new WebGLRenderer({ canvas }));
    (getTextBounds as Mock).mockClear();
  });

  /** The model matrix the text fill was drawn with. */
  function renderModelMatrix(node: TextNode): number[] {
    (gl.uniformMatrix3fv as Mock).mockClear();
    shapeRenderer.renderNode(node, mat3.create());
    const calls = (gl.uniformMatrix3fv as Mock).mock.calls;
    return Array.from(calls[calls.length - 1]![2] as Float32Array);
  }

  it('draws text again with its own font once that font has loaded', () => {
    const vertexUpload = (node: TextNode) => {
      (gl.bufferSubData as Mock).mockClear();
      shapeRenderer.renderNode(node, mat3.create());
      const call = (gl.bufferSubData as Mock).mock.calls.find((c) => c[0] === gl.ARRAY_BUFFER);
      return Array.from(call?.[2] as Float32Array);
    };
    const node = createTextNode('Hi');
    try {
      const withFallback = vertexUpload(node);
      // Its font arrives: glyphs twice as wide
      const wideGlyph = { ...mockGlyph, advanceWidth: 1000 };
      fonts.current = { ...mockFont, stringToGlyphs: (t: string) => [...t].map(() => wideGlyph) };
      expect(vertexUpload(node)).toEqual(withFallback); // until the manager says it loaded
      fonts.generation++;
      expect(vertexUpload(node)).not.toEqual(withFallback);
    } finally {
      fonts.current = mockFont;
      fonts.generation = 0;
    }
  });

  it('draws an onion-skin ghost of text with its letters’ holes left open', () => {
    // An 'o': a 500 × 800 square with a 300 × 600 hole (wound the other way)
    const ringGlyph = {
      ...mockGlyph,
      getPath: (x: number) => ({
        commands: [
          { type: 'M', x, y: 0 },
          { type: 'L', x: x + 500, y: 0 },
          { type: 'L', x: x + 500, y: 800 },
          { type: 'L', x, y: 800 },
          { type: 'Z' },
          { type: 'M', x: x + 100, y: 100 },
          { type: 'L', x: x + 100, y: 700 },
          { type: 'L', x: x + 400, y: 700 },
          { type: 'L', x: x + 400, y: 100 },
          { type: 'Z' },
        ],
      }),
    };
    fonts.current = { ...mockFont, stringToGlyphs: (t: string) => [...t].map(() => ringGlyph) };
    try {
      (gl.bufferSubData as Mock).mockClear();
      shapeRenderer.renderGhostNode(createTextNode('o'), mat3.create(), 0.5, [1, 0, 0]);
      // The fill: the first vertex upload and the index upload after it
      const calls = (gl.bufferSubData as Mock).mock.calls;
      const vertices = calls.find((c) => c[0] === gl.ARRAY_BUFFER)?.[2] as Float32Array;
      const indices = calls.find((c) => c[0] === gl.ELEMENT_ARRAY_BUFFER)?.[2] as Uint32Array;
      let area = 0;
      for (let t = 0; t < indices.length; t += 3) {
        const [a, b, c] = [indices[t]!, indices[t + 1]!, indices[t + 2]!];
        area +=
          Math.abs(
            (vertices[b * 2]! - vertices[a * 2]!) * (vertices[c * 2 + 1]! - vertices[a * 2 + 1]!) -
              (vertices[c * 2]! - vertices[a * 2]!) * (vertices[b * 2 + 1]! - vertices[a * 2 + 1]!)
          ) / 2;
      }
      // The ring's area, 400000 − 180000 font units², at 24 / 1000 to the unit
      expect(area).toBeCloseTo(220000 * 0.024 ** 2, 1);
    } finally {
      fonts.current = mockFont;
    }
  });

  it('anchors a partially revealed text by the full content', () => {
    renderModelMatrix(createTextNode('Hello', 2));
    expect(getTextBounds).toHaveBeenCalledWith('Hello', 'Inter', 24, 1.2, 0, 'left');
  });

  it('keeps the text origin fixed while characters are revealed', () => {
    const full = renderModelMatrix(createTextNode('Hello'));
    for (const visible of [1, 2.5, 5]) {
      shapeRenderer.clearCache();
      expect(renderModelMatrix(createTextNode('Hello', visible))).toEqual(full);
    }
  });

  it('re-tessellates as more characters are revealed', () => {
    const bufferSizes: number[] = [];
    for (const visible of [1, 2, 3]) {
      (gl.bufferSubData as Mock).mockClear();
      shapeRenderer.renderNode(createTextNode('Hello', visible), mat3.create());
      const vertexUpload = (gl.bufferSubData as Mock).mock.calls.find(
        (c) => c[0] === gl.ARRAY_BUFFER
      );
      bufferSizes.push((vertexUpload?.[2] as Float32Array | undefined)?.length ?? 0);
    }
    expect(bufferSizes[0]).toBeGreaterThan(0);
    expect(bufferSizes[1]).toBeGreaterThan(bufferSizes[0]!);
    expect(bufferSizes[2]).toBeGreaterThan(bufferSizes[1]!);
  });
});
