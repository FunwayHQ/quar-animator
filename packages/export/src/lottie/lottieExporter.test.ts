import { describe, it, expect } from 'vitest';
import type { Node, RectangleNode, EllipseNode, Timeline, Transform, Fill } from '@quar/types';
import { exportToLottieJson, exportLottieBlob, analyzeLottieExport } from './lottieExporter';

// ============================================================================
// Helpers
// ============================================================================

const defaultTransform: Transform = {
  position: { x: 100, y: 200 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  anchor: { x: 0.5, y: 0.5 },
  skew: { x: 0, y: 0 },
};

const solidFill: Fill = {
  type: 'solid',
  color: { r: 255, g: 0, b: 0, a: 1 },
  opacity: 1,
  visible: true,
};

const emptyTimeline: Timeline = {
  id: 'tl-1',
  name: 'Timeline',
  duration: 60,
  frameRate: 30,
  tracks: [],
  markers: [],
};

function makeRect(id: string = 'r1', name: string = 'Rect'): RectangleNode {
  return {
    id,
    name,
    type: 'rectangle',
    parent: null,
    children: [],
    transform: defaultTransform,
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    width: 100,
    height: 50,
    cornerRadius: [0, 0, 0, 0],
    fills: [solidFill],
    strokes: [],
  };
}

function makeEllipse(id: string = 'e1', name: string = 'Ellipse'): EllipseNode {
  return {
    id,
    name,
    type: 'ellipse',
    parent: null,
    children: [],
    transform: defaultTransform,
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    radiusX: 50,
    radiusY: 30,
    fills: [solidFill],
    strokes: [],
  };
}

// ============================================================================
// exportToLottieJson
// ============================================================================

describe('exportToLottieJson', () => {
  it('creates valid top-level structure', () => {
    const result = exportToLottieJson([], emptyTimeline, { width: 800, height: 600 });
    expect(result.v).toBe('5.7.4');
    expect(result.fr).toBe(30);
    expect(result.ip).toBe(0);
    expect(result.op).toBe(60);
    expect(result.w).toBe(800);
    expect(result.h).toBe(600);
    expect(result.ddd).toBe(0);
    expect(result.layers).toEqual([]);
  });

  it('converts rectangle nodes to layers', () => {
    const nodes: Node[] = [makeRect()];
    const result = exportToLottieJson(nodes, emptyTimeline, { width: 800, height: 600 });
    expect(result.layers).toHaveLength(1);
    expect(result.layers[0].ty).toBe(4);
    expect(result.layers[0].nm).toBe('Rect');
  });

  it('respects custom options', () => {
    const result = exportToLottieJson([], emptyTimeline, {
      width: 1920,
      height: 1080,
      startFrame: 10,
      endFrame: 50,
      frameRate: 60,
      name: 'My Animation',
    });
    expect(result.fr).toBe(60);
    expect(result.ip).toBe(10);
    expect(result.op).toBe(50);
    expect(result.w).toBe(1920);
    expect(result.h).toBe(1080);
    expect(result.nm).toBe('My Animation');
  });

  it('skips invisible nodes', () => {
    const visible = makeRect('r1', 'Visible');
    const hidden = makeRect('r2', 'Hidden');
    hidden.visible = false;
    const result = exportToLottieJson([visible, hidden], emptyTimeline, {
      width: 800,
      height: 600,
    });
    expect(result.layers).toHaveLength(1);
    expect(result.layers[0].nm).toBe('Visible');
  });

  it('reverses node order for Lottie render order', () => {
    const nodes: Node[] = [makeRect('r1', 'Bottom'), makeRect('r2', 'Top')];
    const result = exportToLottieJson(nodes, emptyTimeline, { width: 800, height: 600 });
    // Bottom node should come first in Lottie layers (reversed)
    expect(result.layers[0].nm).toBe('Top');
    expect(result.layers[1].nm).toBe('Bottom');
  });

  it('assigns sequential layer indices', () => {
    const nodes: Node[] = [makeRect('r1'), makeEllipse('e1')];
    const result = exportToLottieJson(nodes, emptyTimeline, { width: 800, height: 600 });
    expect(result.layers[0].ind).toBe(0);
    expect(result.layers[1].ind).toBe(1);
  });
});

// ============================================================================
// exportLottieBlob
// ============================================================================

describe('exportLottieBlob', () => {
  it('returns a JSON blob', () => {
    const blob = exportLottieBlob([makeRect()], emptyTimeline, { width: 800, height: 600 });
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/json');
    expect(blob.size).toBeGreaterThan(0);
  });
});

// ============================================================================
// analyzeLottieExport
// ============================================================================

describe('analyzeLottieExport', () => {
  it('counts supported node types', () => {
    const nodes: Node[] = [makeRect(), makeEllipse()];
    const analysis = analyzeLottieExport(nodes);
    expect(analysis.supportedCount).toBe(2);
    expect(analysis.unsupportedCount).toBe(0);
    expect(analysis.unsupportedTypes).toEqual([]);
  });

  it('identifies unsupported types', () => {
    const textNode = {
      id: 't1',
      name: 'Text',
      type: 'text' as const,
      parent: null,
      children: [],
      transform: defaultTransform,
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal' as const,
      content: 'Hello',
      fontFamily: 'Inter',
      fontSize: 16,
      fontWeight: 400,
      fontStyle: 'normal' as const,
      textAlign: 'left' as const,
      lineHeight: 1.2,
      letterSpacing: 0,
      fills: [],
      strokes: [],
    };
    const analysis = analyzeLottieExport([makeRect(), textNode]);
    expect(analysis.supportedCount).toBe(1);
    expect(analysis.unsupportedCount).toBe(1);
    expect(analysis.unsupportedTypes).toContain('text');
  });
});
