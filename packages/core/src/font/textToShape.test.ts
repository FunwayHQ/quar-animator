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
