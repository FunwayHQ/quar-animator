import { describe, it, expect } from 'vitest';
import type { Node, RectangleNode, EllipseNode, PolygonNode, Timeline } from '@quar/types';
import {
  getProperty,
  setProperty,
  getAnimatableProperties,
  detectInterpolationType,
  getInterpolator,
  evaluateTrack,
  evaluateNodeAtFrame,
  applyAnimatedValues,
} from './PropertyBinding';
import { createTimeline, createTrack, addKeyframe } from './Timeline';

// ============================================================================
// Test Helpers
// ============================================================================

function makeRectNode(overrides: Partial<RectangleNode> = {}): RectangleNode {
  return {
    id: 'rect1',
    name: 'Rectangle',
    type: 'rectangle',
    parent: null,
    children: [],
    transform: {
      position: { x: 100, y: 200 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      anchor: { x: 0.5, y: 0.5 },
      skew: { x: 0, y: 0 },
    },
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    width: 50,
    height: 30,
    cornerRadius: [0, 0, 0, 0],
    fill: { type: 'solid', color: { r: 255, g: 0, b: 0, a: 1 }, opacity: 1 },
    stroke: {
      color: { r: 0, g: 0, b: 0, a: 1 },
      width: 2,
      opacity: 1,
      cap: 'round',
      join: 'round',
      miterLimit: 10,
    },
    ...overrides,
  };
}

// ============================================================================
// getProperty
// ============================================================================

describe('getProperty', () => {
  const node = makeRectNode();

  it('gets top-level property', () => {
    expect(getProperty(node, 'opacity')).toBe(1);
    expect(getProperty(node, 'width')).toBe(50);
  });

  it('gets nested property', () => {
    expect(getProperty(node, 'transform.position.x')).toBe(100);
    expect(getProperty(node, 'transform.position.y')).toBe(200);
    expect(getProperty(node, 'transform.rotation')).toBe(0);
  });

  it('gets deeply nested property', () => {
    expect(getProperty(node, 'fill.color.r')).toBe(255);
    expect(getProperty(node, 'stroke.color.b')).toBe(0);
  });

  it('returns undefined for non-existent path', () => {
    expect(getProperty(node, 'nonexistent')).toBeUndefined();
    expect(getProperty(node, 'transform.nonexistent')).toBeUndefined();
    expect(getProperty(node, 'transform.position.z')).toBeUndefined();
  });

  it('gets object-level property', () => {
    const pos = getProperty(node, 'transform.position');
    expect(pos).toEqual({ x: 100, y: 200 });
  });
});

// ============================================================================
// setProperty
// ============================================================================

describe('setProperty', () => {
  it('sets top-level property immutably', () => {
    const node = makeRectNode();
    const updated = setProperty(node, 'opacity', 0.5);
    expect(updated.opacity).toBe(0.5);
    expect(node.opacity).toBe(1); // original unchanged
    expect(updated).not.toBe(node);
  });

  it('sets nested property immutably', () => {
    const node = makeRectNode();
    const updated = setProperty(node, 'transform.position.x', 300);
    expect(updated.transform.position.x).toBe(300);
    expect(updated.transform.position.y).toBe(200); // unchanged
    expect(node.transform.position.x).toBe(100); // original unchanged
  });

  it('sets deeply nested property', () => {
    const node = makeRectNode();
    const updated = setProperty(node, 'fill.color.r', 128);
    expect((updated as RectangleNode).fill!.color!.r).toBe(128);
    expect((node as RectangleNode).fill!.color!.r).toBe(255);
  });

  it('preserves sibling properties at each level', () => {
    const node = makeRectNode();
    const updated = setProperty(node, 'transform.position.x', 999);
    expect(updated.transform.rotation).toBe(0);
    expect(updated.transform.scale).toEqual({ x: 1, y: 1 });
    expect(updated.transform.position.y).toBe(200);
  });
});

// ============================================================================
// getAnimatableProperties
// ============================================================================

describe('getAnimatableProperties', () => {
  it('returns common properties for group nodes', () => {
    const props = getAnimatableProperties('group');
    expect(props.length).toBe(10); // common only
    expect(props.some((p) => p.path === 'transform.position.x')).toBe(true);
    expect(props.some((p) => p.path === 'opacity')).toBe(true);
  });

  it('returns shape + rectangle properties for rectangle nodes', () => {
    const props = getAnimatableProperties('rectangle');
    expect(props.some((p) => p.path === 'width')).toBe(true);
    expect(props.some((p) => p.path === 'height')).toBe(true);
    expect(props.some((p) => p.path === 'fill.color')).toBe(true);
    expect(props.some((p) => p.path === 'stroke.width')).toBe(true);
  });

  it('returns ellipse-specific properties', () => {
    const props = getAnimatableProperties('ellipse');
    expect(props.some((p) => p.path === 'radiusX')).toBe(true);
    expect(props.some((p) => p.path === 'radiusY')).toBe(true);
  });

  it('returns polygon-specific properties', () => {
    const props = getAnimatableProperties('polygon');
    expect(props.some((p) => p.path === 'radius')).toBe(true);
  });
});

// ============================================================================
// detectInterpolationType
// ============================================================================

describe('detectInterpolationType', () => {
  it('detects color properties', () => {
    expect(detectInterpolationType('fill.color')).toBe('color');
    expect(detectInterpolationType('stroke.color')).toBe('color');
  });

  it('detects vector2 properties', () => {
    expect(detectInterpolationType('transform.position')).toBe('vector2');
    expect(detectInterpolationType('transform.scale')).toBe('vector2');
  });

  it('detects number properties', () => {
    expect(detectInterpolationType('transform.position.x')).toBe('number');
    expect(detectInterpolationType('opacity')).toBe('number');
    expect(detectInterpolationType('width')).toBe('number');
    expect(detectInterpolationType('transform.rotation')).toBe('number');
    expect(detectInterpolationType('fill.opacity')).toBe('number');
    expect(detectInterpolationType('stroke.width')).toBe('number');
  });

  it('defaults to discrete for unknown properties', () => {
    expect(detectInterpolationType('unknown.prop')).toBe('discrete');
  });
});

// ============================================================================
// getInterpolator
// ============================================================================

describe('getInterpolator', () => {
  it('returns number interpolator', () => {
    const lerp = getInterpolator('number');
    expect(lerp(0, 10, 0.5)).toBe(5);
  });

  it('returns vector2 interpolator', () => {
    const lerp = getInterpolator('vector2');
    expect(lerp({ x: 0, y: 0 }, { x: 10, y: 20 }, 0.5)).toEqual({ x: 5, y: 10 });
  });

  it('returns color interpolator', () => {
    const lerp = getInterpolator('color');
    const result = lerp({ r: 0, g: 0, b: 0, a: 0 }, { r: 200, g: 100, b: 50, a: 1 }, 0.5) as {
      r: number;
      g: number;
      b: number;
      a: number;
    };
    expect(result.r).toBe(100);
    expect(result.g).toBe(50);
    expect(result.b).toBe(25);
    expect(result.a).toBe(0.5);
  });

  it('returns discrete interpolator', () => {
    const lerp = getInterpolator('discrete');
    expect(lerp('a', 'b', 0.5)).toBe('a');
    expect(lerp('a', 'b', 0.99)).toBe('a');
  });
});

// ============================================================================
// evaluateTrack
// ============================================================================

describe('evaluateTrack', () => {
  it('returns undefined for empty track', () => {
    const track = createTrack<number>('node1', 'opacity');
    expect(evaluateTrack(track, 0)).toBeUndefined();
  });

  it('returns single keyframe value', () => {
    const track = createTrack<number>('node1', 'opacity');
    addKeyframe(track, 0, 0.5);
    expect(evaluateTrack(track, 0)).toBe(0.5);
    expect(evaluateTrack(track, 10)).toBe(0.5); // hold value
  });

  it('interpolates between two number keyframes', () => {
    const track = createTrack<number>('node1', 'transform.position.x');
    addKeyframe(track, 0, 0);
    addKeyframe(track, 10, 100);
    expect(evaluateTrack(track, 5)).toBe(50);
  });

  it('interpolates color keyframes', () => {
    const track = createTrack('node1', 'fill.color');
    addKeyframe(track, 0, { r: 0, g: 0, b: 0, a: 1 });
    addKeyframe(track, 10, { r: 200, g: 100, b: 50, a: 1 });
    const result = evaluateTrack(track, 5) as { r: number; g: number; b: number; a: number };
    expect(result.r).toBe(100);
    expect(result.g).toBe(50);
    expect(result.b).toBe(25);
  });
});

// ============================================================================
// evaluateNodeAtFrame
// ============================================================================

describe('evaluateNodeAtFrame', () => {
  it('returns empty map for node with no tracks', () => {
    const timeline = createTimeline();
    const values = evaluateNodeAtFrame(timeline, 'node1', 0);
    expect(values.size).toBe(0);
  });

  it('evaluates multiple properties', () => {
    const timeline = createTimeline();
    const trackX = createTrack<number>('node1', 'transform.position.x');
    addKeyframe(trackX, 0, 0);
    addKeyframe(trackX, 10, 100);
    const trackY = createTrack<number>('node1', 'transform.position.y');
    addKeyframe(trackY, 0, 0);
    addKeyframe(trackY, 10, 200);
    timeline.tracks.push(trackX as any, trackY as any);

    const values = evaluateNodeAtFrame(timeline, 'node1', 5);
    expect(values.get('transform.position.x')).toBe(50);
    expect(values.get('transform.position.y')).toBe(100);
  });

  it('ignores tracks for other nodes', () => {
    const timeline = createTimeline();
    const track = createTrack<number>('other', 'opacity');
    addKeyframe(track, 0, 0.5);
    timeline.tracks.push(track as any);

    const values = evaluateNodeAtFrame(timeline, 'node1', 0);
    expect(values.size).toBe(0);
  });
});

// ============================================================================
// applyAnimatedValues
// ============================================================================

describe('applyAnimatedValues', () => {
  it('applies animated values to node', () => {
    const node = makeRectNode();
    const values = new Map<string, unknown>([
      ['transform.position.x', 500],
      ['opacity', 0.3],
    ]);
    const result = applyAnimatedValues(node, values);
    expect(result.transform.position.x).toBe(500);
    expect(result.opacity).toBe(0.3);
    // Original unchanged
    expect(node.transform.position.x).toBe(100);
    expect(node.opacity).toBe(1);
  });

  it('returns same node for empty map', () => {
    const node = makeRectNode();
    const result = applyAnimatedValues(node, new Map());
    expect(result).toBe(node);
  });
});
