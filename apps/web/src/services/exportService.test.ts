import { describe, it, expect, vi, beforeEach } from 'vitest';
import { downloadBlob, getExportFilename } from './exportService';
import type { Node, RectangleNode, ArtboardNode } from '@quar/types';

// ============================================================================
// Helpers
// ============================================================================

function makeNode(id: string, name: string): Node {
  return {
    id,
    name,
    type: 'rectangle',
    parent: null,
    children: [],
    transform: {
      position: { x: 0, y: 0 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      anchor: { x: 0, y: 0 },
      skew: { x: 0, y: 0 },
    },
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    width: 100,
    height: 50,
    cornerRadius: [0, 0, 0, 0],
    fills: [],
    strokes: [],
  } as RectangleNode;
}

// ============================================================================
// downloadBlob
// ============================================================================

describe('downloadBlob', () => {
  it('creates anchor element, clicks it, and revokes URL', () => {
    const createObjectURL = vi.fn(() => 'blob:test-url');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(globalThis, 'URL', {
      value: { createObjectURL, revokeObjectURL },
      writable: true,
    });

    const click = vi.fn();
    const appendChild = vi.fn();
    const removeChild = vi.fn();
    const createElement = vi.fn(() => ({
      href: '',
      download: '',
      click,
    }));

    vi.spyOn(document, 'createElement').mockImplementation(createElement as never);
    vi.spyOn(document.body, 'appendChild').mockImplementation(appendChild);
    vi.spyOn(document.body, 'removeChild').mockImplementation(removeChild);

    const blob = new Blob(['test'], { type: 'text/plain' });
    downloadBlob(blob, 'test.txt');

    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(createElement).toHaveBeenCalledWith('a');
    expect(click).toHaveBeenCalled();
    expect(appendChild).toHaveBeenCalled();
    expect(removeChild).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test-url');

    vi.restoreAllMocks();
  });
});

// ============================================================================
// getExportFilename
// ============================================================================

describe('getExportFilename', () => {
  it('uses node name for single node', () => {
    const nodes = [makeNode('n1', 'MyRect')];
    expect(getExportFilename(nodes, 'png')).toBe('MyRect.png');
  });

  it('sanitizes special characters in filename', () => {
    const nodes = [makeNode('n1', 'my/file:name')];
    expect(getExportFilename(nodes, 'svg')).toBe('my_file_name.svg');
  });

  it('uses selection count for multiple nodes', () => {
    const nodes = [makeNode('n1', 'A'), makeNode('n2', 'B'), makeNode('n3', 'C')];
    expect(getExportFilename(nodes, 'png')).toBe('selection-3-items.png');
  });

  it('uses "untitled" for empty name', () => {
    const nodes = [makeNode('n1', '')];
    expect(getExportFilename(nodes, 'png')).toBe('untitled.png');
  });

  it('uses artboard name for single artboard export', () => {
    const artboard: ArtboardNode = {
      id: 'art1',
      name: 'HD Canvas',
      type: 'artboard',
      parent: null,
      children: [],
      transform: {
        position: { x: 0, y: 0 },
        rotation: 0,
        scale: { x: 1, y: 1 },
        anchor: { x: 0.5, y: 0.5 },
        skew: { x: 0, y: 0 },
      },
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      width: 1920,
      height: 1080,
      backgroundColor: { r: 255, g: 255, b: 255, a: 1 },
      clipContent: true,
    };
    expect(getExportFilename([artboard], 'png')).toBe('HD Canvas.png');
    expect(getExportFilename([artboard], 'svg')).toBe('HD Canvas.svg');
  });
});
