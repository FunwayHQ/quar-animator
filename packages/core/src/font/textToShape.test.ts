/**
 * Tests for textToShape – font weight passing (Bug 2 fix)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TextNode } from '@quar/types';
import { createDefaultTransform } from '../SceneGraph';

// Mock the FontManager before importing the module
const mockGetFontOrFallback = vi.fn().mockReturnValue(null);
vi.mock('./FontManager', () => ({
  getFontManager: () => ({
    getFontOrFallback: mockGetFontOrFallback,
  }),
}));

// Mock glyph/metric helpers so tests can control the geometry vs metric centers.
const mockTextToSubpaths = vi.fn();
const mockComputeSubpathsBounds = vi.fn();
vi.mock('./glyphConverter', () => ({
  textToSubpaths: (...args: unknown[]) => mockTextToSubpaths(...args),
  computeSubpathsBounds: (...args: unknown[]) => mockComputeSubpathsBounds(...args),
}));
const mockGetTextBounds = vi.fn();
vi.mock('./textMetrics', () => ({
  getTextBounds: (...args: unknown[]) => mockGetTextBounds(...args),
}));

// Import after mock setup
import { convertTextToPath, convertTextToPathGroup } from './textToShape';

function createTestTextNode(overrides: Partial<TextNode> = {}): TextNode {
  const transform = createDefaultTransform();
  transform.position = { x: 100, y: 200 };

  return {
    id: 'text-1',
    name: 'Test Text',
    type: 'text',
    parent: null,
    children: [],
    transform,
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    content: 'Hello',
    fontFamily: 'Inter',
    fontSize: 24,
    fontWeight: 700,
    fontStyle: 'normal',
    textAlign: 'left',
    lineHeight: 1.2,
    letterSpacing: 0,
    fills: [{ type: 'solid', color: { r: 0, g: 0, b: 0, a: 1 }, opacity: 1, visible: true }],
    strokes: [],
    ...overrides,
  };
}

describe('textToShape – font weight passing', () => {
  beforeEach(() => {
    mockGetFontOrFallback.mockClear();
    // Return null (no font) so we just verify the call arguments
    mockGetFontOrFallback.mockReturnValue(null);
  });

  it('convertTextToPath should pass fontWeight to getFontOrFallback', () => {
    const node = createTestTextNode({ fontWeight: 700 });
    convertTextToPath(node, () => 'id-1');

    expect(mockGetFontOrFallback).toHaveBeenCalledWith('Inter', 700);
  });

  it('convertTextToPath should pass fontWeight 400 for regular text', () => {
    const node = createTestTextNode({ fontWeight: 400 });
    convertTextToPath(node, () => 'id-1');

    expect(mockGetFontOrFallback).toHaveBeenCalledWith('Inter', 400);
  });

  it('convertTextToPathGroup should pass fontWeight to getFontOrFallback', () => {
    const node = createTestTextNode({ fontWeight: 700 });
    convertTextToPathGroup(node, () => 'id-1');

    expect(mockGetFontOrFallback).toHaveBeenCalledWith('Inter', 700);
  });

  it('convertTextToPathGroup should pass different font weights correctly', () => {
    const node = createTestTextNode({ fontFamily: 'Roboto', fontWeight: 300 });
    convertTextToPathGroup(node, () => 'id-1');

    expect(mockGetFontOrFallback).toHaveBeenCalledWith('Roboto', 300);
  });
});

describe('textToShape – rendered center placement (F033)', () => {
  beforeEach(() => {
    mockGetFontOrFallback.mockReturnValue({}); // truthy font so it proceeds
    mockTextToSubpaths.mockReturnValue({
      subpaths: [
        [
          { position: { x: 0, y: 0 }, handleIn: null, handleOut: null, type: 'corner' },
          { position: { x: 20, y: 0 }, handleIn: null, handleOut: null, type: 'corner' },
          { position: { x: 20, y: 20 }, handleIn: null, handleOut: null, type: 'corner' },
        ],
      ],
    });
    // Geometry center (10,10) differs from the anchored metric center (20,20).
    mockComputeSubpathsBounds.mockReturnValue({ x: 0, y: 0, width: 20, height: 20 });
    mockGetTextBounds.mockReturnValue({ x: 0, y: 0, width: 40, height: 40 });
  });

  it('offsets the path node to the rendered (anchored metric) center', () => {
    const node = convertTextToPath(createTestTextNode(), () => 'id');
    expect(node).not.toBeNull();
    // position + (geometryCenter(10,10) - anchoredMetric(20,20)) = (100-10, 200-10)
    expect(node!.transform.position.x).toBeCloseTo(90);
    expect(node!.transform.position.y).toBeCloseTo(190);
  });

  it('rotates the offset into the node local frame', () => {
    const node = convertTextToPath(
      createTestTextNode({
        transform: { ...createDefaultTransform(), position: { x: 100, y: 200 }, rotation: 90 },
      }),
      () => 'id'
    );
    expect(node).not.toBeNull();
    // offset (-10,-10) rotated 90deg -> (10,-10); (100,200)+(10,-10) = (110,190)
    expect(node!.transform.position.x).toBeCloseTo(110);
    expect(node!.transform.position.y).toBeCloseTo(190);
  });
});
