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

vi.mock('../font/FontManager', () => ({
  getFontManager: () => ({ getFontOrFallback: () => mockFont }),
}));

vi.mock('../font/textMetrics', () => ({
  // Width grows with the text so a re-centred prefix would shift the anchor
  getTextBounds: vi.fn((content: string, _family: string, fontSize: number) => ({
    x: 0,
    y: -fontSize,
    width: Array.from(content).length * fontSize * 0.5,
    height: fontSize,
  })),
}));

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
