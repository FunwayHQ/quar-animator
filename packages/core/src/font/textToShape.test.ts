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

describe('textToShape conversion behavior', () => {
  beforeEach(() => {
    mockGetFontOrFallback.mockReset().mockReturnValue({});
    mockTextToSubpaths.mockReset();
    mockComputeSubpathsBounds.mockReset();
    mockGetTextBounds.mockReset().mockReturnValue({ x: 0, y: 0, width: 20, height: 10 });
  });

  it('returns null when font lookup fails or the font has no contours', () => {
    const node = createTestTextNode();
    mockGetFontOrFallback.mockReturnValue(null);
    expect(convertTextToPath(node, () => 'id')).toBeNull();
    expect(convertTextToPathGroup(node, () => 'id')).toBeNull();

    mockGetFontOrFallback.mockReturnValue({});
    mockTextToSubpaths.mockReturnValue({ subpaths: [], glyphs: [] });
    expect(convertTextToPath(node, () => 'id')).toBeNull();
    expect(convertTextToPathGroup(node, () => 'id')).toBeNull();
  });

  it('centers all contours and preserves text-node styling in the path result', () => {
    const firstContour = [
      { position: { x: 0, y: 0 }, handleIn: { x: -1, y: 0 }, handleOut: null, type: 'corner' },
      { position: { x: 20, y: 0 }, handleIn: null, handleOut: { x: 1, y: 0 }, type: 'smooth' },
    ];
    const holeContour = [
      { position: { x: 2, y: 2 }, handleIn: null, handleOut: null, type: 'corner' },
      { position: { x: 6, y: 2 }, handleIn: null, handleOut: null, type: 'corner' },
    ];
    mockTextToSubpaths.mockReturnValue({ subpaths: [firstContour, holeContour], glyphs: [] });
    mockComputeSubpathsBounds.mockReturnValue({ x: 0, y: 0, width: 20, height: 10 });
    const effects = [
      {
        id: 'blur',
        type: 'layer-blur' as const,
        visible: true,
        radius: 3,
      },
    ];
    const node = createTestTextNode({ parent: 'group-1', effects });

    const path = convertTextToPath(node, () => 'path-1');

    expect(path).toMatchObject({
      id: 'path-1',
      name: 'Test Text (Path)',
      parent: 'group-1',
      type: 'path',
      fillRule: 'evenodd',
      closed: true,
      effects,
      transform: { position: { x: 100, y: 200 }, anchor: { x: 0.5, y: 0.5 } },
    });
    expect(path!.points[0]!.position).toEqual({ x: -10, y: -5 });
    expect(path!.points[0]!.handleIn).toEqual({ x: -1, y: 0 });
    expect(path!.points[0]!.handleIn).not.toBe(firstContour[0]!.handleIn);
    expect(path!.subpaths?.[0]?.[0]?.position).toEqual({ x: -8, y: -3 });
    expect(path!.fills).not.toBe(node.fills);
    expect(mockTextToSubpaths).toHaveBeenCalledWith('Hello', expect.anything(), 24, {
      textAlign: 'left',
      lineHeight: 1.2,
      letterSpacing: 0,
    });
  });

  it('builds one centered path per glyph and positions each relative to the group', () => {
    const makeContour = (x: number) => [
      { position: { x, y: 0 }, handleIn: null, handleOut: null, type: 'corner' },
      { position: { x: x + 10, y: 10 }, handleIn: null, handleOut: null, type: 'corner' },
    ];
    const firstGlyph = makeContour(0);
    const secondGlyph = makeContour(10);
    mockTextToSubpaths.mockReturnValue({
      subpaths: [firstGlyph, secondGlyph],
      glyphs: [
        { char: 'A', subpaths: [firstGlyph] },
        { char: 'B', subpaths: [secondGlyph] },
      ],
    });
    mockComputeSubpathsBounds.mockImplementation((subpaths: (typeof firstGlyph)[]) => {
      const positions = subpaths.flatMap((contour) => contour.map((point) => point.position));
      const xs = positions.map((point) => point.x);
      const ys = positions.map((point) => point.y);
      return {
        x: Math.min(...xs),
        y: Math.min(...ys),
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys),
      };
    });

    const result = convertTextToPathGroup(
      createTestTextNode(),
      (() => {
        let nextId = 0;
        return () => `id-${++nextId}`;
      })()
    );

    expect(result?.group).toMatchObject({
      id: 'id-1',
      type: 'group',
      children: [],
      transform: { position: { x: 100, y: 200 }, anchor: { x: 0, y: 0 } },
    });
    expect(result?.children).toHaveLength(2);
    expect(result?.children[0]).toMatchObject({
      id: 'id-2',
      name: 'A',
      parent: 'id-1',
      transform: { position: { x: -5, y: 0 } },
      points: [{ position: { x: -5, y: -5 } }, { position: { x: 5, y: 5 } }],
    });
    expect(result?.children[1]).toMatchObject({
      id: 'id-3',
      name: 'B',
      transform: { position: { x: 5, y: 0 } },
    });
  });
});
