import { describe, it, expect } from 'vitest';
import type { RectangleNode } from '@quar/types';
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
    fills: [{ type: 'solid', color: { r: 255, g: 0, b: 0, a: 1 }, opacity: 1, visible: true }],
    strokes: [
      {
        color: { r: 0, g: 0, b: 0, a: 1 },
        width: 2,
        opacity: 1,
        cap: 'round',
        join: 'round',
        miterLimit: 10,
        visible: true,
      },
    ],
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
    expect(getProperty(node, 'fills.0.color.r')).toBe(255);
    expect(getProperty(node, 'strokes.0.color.b')).toBe(0);
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
    const updated = setProperty(node, 'fills.0.color.r', 128);
    expect((updated as RectangleNode).fills[0].color!.r).toBe(128);
    expect((node as RectangleNode).fills[0].color!.r).toBe(255);
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
    expect(props.length).toBe(11); // common only (includes blendMode)
    expect(props.some((p) => p.path === 'transform.position.x')).toBe(true);
    expect(props.some((p) => p.path === 'opacity')).toBe(true);
  });

  it('returns shape + rectangle properties for rectangle nodes', () => {
    const props = getAnimatableProperties('rectangle');
    expect(props.some((p) => p.path === 'width')).toBe(true);
    expect(props.some((p) => p.path === 'height')).toBe(true);
    expect(props.some((p) => p.path === 'fills.0.color')).toBe(true);
    expect(props.some((p) => p.path === 'strokes.0.width')).toBe(true);
    expect(props.some((p) => p.path === 'fills.0.gradient.angle')).toBe(true);
    expect(props.some((p) => p.path === 'fills.0.gradient.stops.0.color')).toBe(true);
    expect(props.some((p) => p.path === 'strokes.0.gradient.angle')).toBe(true);
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
    expect(detectInterpolationType('fills.0.color')).toBe('color');
    expect(detectInterpolationType('strokes.0.color')).toBe('color');
  });

  it('detects vector2 properties', () => {
    expect(detectInterpolationType('transform.position')).toBe('vector2');
    expect(detectInterpolationType('transform.scale')).toBe('vector2');
  });

  it('detects number properties', () => {
    expect(detectInterpolationType('transform.position.x')).toBe('number');
    expect(detectInterpolationType('opacity')).toBe('number');
    expect(detectInterpolationType('width')).toBe('number');
    expect(detectInterpolationType('fills.0.opacity')).toBe('number');
    expect(detectInterpolationType('strokes.0.width')).toBe('number');
  });

  it('detects rotation property', () => {
    expect(detectInterpolationType('transform.rotation')).toBe('rotation');
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
    const track = createTrack('node1', 'fills.0.color');
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

// ============================================================================
// Gradient property support
// ============================================================================

describe('gradient property support', () => {
  function makeGradientNode(): RectangleNode {
    return {
      ...makeRectNode(),
      fills: [
        {
          type: 'gradient' as const,
          gradient: {
            type: 'linear' as const,
            stops: [
              { offset: 0, color: { r: 255, g: 0, b: 0, a: 1 } },
              { offset: 1, color: { r: 0, g: 0, b: 255, a: 1 } },
            ],
            angle: 90,
          },
          opacity: 1,
          visible: true,
        },
      ],
    };
  }

  it('getProperty reads gradient angle', () => {
    const node = makeGradientNode();
    expect(getProperty(node, 'fills.0.gradient.angle')).toBe(90);
  });

  it('getProperty reads gradient stop color', () => {
    const node = makeGradientNode();
    const color = getProperty(node, 'fills.0.gradient.stops.0.color');
    expect(color).toEqual({ r: 255, g: 0, b: 0, a: 1 });
  });

  it('getProperty reads gradient stop offset', () => {
    const node = makeGradientNode();
    expect(getProperty(node, 'fills.0.gradient.stops.1.offset')).toBe(1);
  });

  it('setProperty sets gradient angle immutably', () => {
    const node = makeGradientNode();
    const updated = setProperty(node, 'fills.0.gradient.angle', 180);
    expect(getProperty(updated, 'fills.0.gradient.angle')).toBe(180);
    expect(getProperty(node, 'fills.0.gradient.angle')).toBe(90); // original unchanged
  });

  it('detectInterpolationType detects gradient stop color as color', () => {
    expect(detectInterpolationType('fills.0.gradient.stops.0.color')).toBe('color');
    expect(detectInterpolationType('strokes.0.gradient.stops.1.color')).toBe('color');
  });

  it('detectInterpolationType detects gradient angle as number', () => {
    expect(detectInterpolationType('fills.0.gradient.angle')).toBe('number');
    expect(detectInterpolationType('strokes.0.gradient.angle')).toBe('number');
  });

  it('detectInterpolationType detects gradient stop offset as number', () => {
    expect(detectInterpolationType('fills.0.gradient.stops.0.offset')).toBe('number');
    expect(detectInterpolationType('fills.0.gradient.stops.3.offset')).toBe('number');
  });

  it('evaluateTrack interpolates gradient angle', () => {
    const track = createTrack<number>('node1', 'fills.0.gradient.angle');
    addKeyframe(track, 0, 0);
    addKeyframe(track, 10, 180);
    expect(evaluateTrack(track, 5)).toBe(90);
  });

  it('evaluateTrack interpolates gradient stop color', () => {
    const track = createTrack('node1', 'fills.0.gradient.stops.0.color');
    addKeyframe(track, 0, { r: 0, g: 0, b: 0, a: 1 });
    addKeyframe(track, 10, { r: 200, g: 100, b: 50, a: 1 });
    const result = evaluateTrack(track, 5) as { r: number; g: number; b: number; a: number };
    expect(result.r).toBe(100);
    expect(result.g).toBe(50);
    expect(result.b).toBe(25);
  });
});

// ============================================================================
// Corner radius animation support
// ============================================================================

describe('corner radius animation support', () => {
  it('getAnimatableProperties includes cornerRadius for rectangles', () => {
    const props = getAnimatableProperties('rectangle');
    expect(props.some((p) => p.path === 'cornerRadius.0')).toBe(true);
    expect(props.some((p) => p.path === 'cornerRadius.1')).toBe(true);
    expect(props.some((p) => p.path === 'cornerRadius.2')).toBe(true);
    expect(props.some((p) => p.path === 'cornerRadius.3')).toBe(true);
  });

  it('getAnimatableProperties includes cornerRadius for polygons', () => {
    const props = getAnimatableProperties('polygon');
    expect(props.some((p) => p.path === 'cornerRadius')).toBe(true);
  });

  it('detectInterpolationType recognizes cornerRadius paths as number', () => {
    expect(detectInterpolationType('cornerRadius')).toBe('number');
    expect(detectInterpolationType('cornerRadius.0')).toBe('number');
    expect(detectInterpolationType('cornerRadius.1')).toBe('number');
    expect(detectInterpolationType('cornerRadius.2')).toBe('number');
    expect(detectInterpolationType('cornerRadius.3')).toBe('number');
  });

  it('getProperty reads cornerRadius array element', () => {
    const node = makeRectNode({ cornerRadius: [5, 10, 15, 20] });
    expect(getProperty(node, 'cornerRadius.0')).toBe(5);
    expect(getProperty(node, 'cornerRadius.1')).toBe(10);
    expect(getProperty(node, 'cornerRadius.2')).toBe(15);
    expect(getProperty(node, 'cornerRadius.3')).toBe(20);
  });

  it('setProperty sets cornerRadius array element immutably', () => {
    const node = makeRectNode({ cornerRadius: [0, 0, 0, 0] });
    const updated = setProperty(node, 'cornerRadius.0', 12);
    expect(getProperty(updated, 'cornerRadius.0')).toBe(12);
    expect(getProperty(node, 'cornerRadius.0')).toBe(0); // original unchanged
  });

  it('evaluateTrack interpolates cornerRadius', () => {
    const track = createTrack<number>('node1', 'cornerRadius.0');
    addKeyframe(track, 0, 0);
    addKeyframe(track, 10, 20);
    expect(evaluateTrack(track, 5)).toBe(10);
  });
});
