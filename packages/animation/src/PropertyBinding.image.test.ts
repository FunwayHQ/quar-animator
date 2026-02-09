import { describe, it, expect } from 'vitest';
import type { ImageNode } from '@quar/types';
import {
  getProperty,
  setProperty,
  getAnimatableProperties,
  detectInterpolationType,
  evaluateTrack,
  evaluateNodeAtFrame,
  applyAnimatedValues,
} from './PropertyBinding';
import { createTimeline, createTrack, addKeyframe } from './Timeline';

// ============================================================================
// Test Helpers
// ============================================================================

function makeImageNode(overrides: Partial<ImageNode> = {}): ImageNode {
  return {
    id: 'img1',
    name: 'Test Image',
    type: 'image',
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
    src: 'data:image/png;base64,test',
    width: 200,
    height: 150,
    naturalWidth: 200,
    naturalHeight: 150,
    cornerRadius: [0, 0, 0, 0] as [number, number, number, number],
    adjustments: {
      brightness: 0,
      contrast: 0,
      saturation: 0,
      hue: 0,
      exposure: 0,
      temperature: 0,
      tint: 0,
      blur: 0,
    },
    ...overrides,
  };
}

// ============================================================================
// getAnimatableProperties for image nodes
// ============================================================================

describe('getAnimatableProperties for image', () => {
  it('returns common properties (position, rotation, scale, opacity)', () => {
    const props = getAnimatableProperties('image');
    expect(props.some((p) => p.path === 'transform.position.x')).toBe(true);
    expect(props.some((p) => p.path === 'transform.position.y')).toBe(true);
    expect(props.some((p) => p.path === 'transform.rotation')).toBe(true);
    expect(props.some((p) => p.path === 'transform.scale.x')).toBe(true);
    expect(props.some((p) => p.path === 'transform.scale.y')).toBe(true);
    expect(props.some((p) => p.path === 'opacity')).toBe(true);
  });

  it('returns width and height properties', () => {
    const props = getAnimatableProperties('image');
    expect(props.some((p) => p.path === 'width')).toBe(true);
    expect(props.some((p) => p.path === 'height')).toBe(true);
  });

  it('returns corner radius properties for image', () => {
    const props = getAnimatableProperties('image');
    expect(props.some((p) => p.path === 'cornerRadius.0')).toBe(true);
    expect(props.some((p) => p.path === 'cornerRadius.1')).toBe(true);
    expect(props.some((p) => p.path === 'cornerRadius.2')).toBe(true);
    expect(props.some((p) => p.path === 'cornerRadius.3')).toBe(true);
  });

  it('has correct display names for corner radius properties', () => {
    const props = getAnimatableProperties('image');
    expect(props.find((p) => p.path === 'cornerRadius.0')?.displayName).toBe('Corner TL');
    expect(props.find((p) => p.path === 'cornerRadius.1')?.displayName).toBe('Corner TR');
    expect(props.find((p) => p.path === 'cornerRadius.2')?.displayName).toBe('Corner BR');
    expect(props.find((p) => p.path === 'cornerRadius.3')?.displayName).toBe('Corner BL');
  });

  it('has interpolationType "number" for corner radius properties', () => {
    const props = getAnimatableProperties('image');
    for (let i = 0; i < 4; i++) {
      const prop = props.find((p) => p.path === `cornerRadius.${i}`);
      expect(prop?.interpolationType).toBe('number');
    }
  });

  it('returns adjustment properties', () => {
    const props = getAnimatableProperties('image');
    expect(props.some((p) => p.path === 'adjustments.brightness')).toBe(true);
    expect(props.some((p) => p.path === 'adjustments.contrast')).toBe(true);
    expect(props.some((p) => p.path === 'adjustments.saturation')).toBe(true);
    expect(props.some((p) => p.path === 'adjustments.hue')).toBe(true);
    expect(props.some((p) => p.path === 'adjustments.exposure')).toBe(true);
    expect(props.some((p) => p.path === 'adjustments.temperature')).toBe(true);
  });

  it('does NOT return shape-specific fill/stroke properties', () => {
    const props = getAnimatableProperties('image');
    expect(props.some((p) => p.path === 'fills.0.color')).toBe(false);
    expect(props.some((p) => p.path === 'strokes.0.color')).toBe(false);
    expect(props.some((p) => p.path === 'strokes.0.width')).toBe(false);
  });

  it('has correct display names for adjustment properties', () => {
    const props = getAnimatableProperties('image');
    const brightnessP = props.find((p) => p.path === 'adjustments.brightness');
    expect(brightnessP?.displayName).toBe('Brightness');
    const contrastP = props.find((p) => p.path === 'adjustments.contrast');
    expect(contrastP?.displayName).toBe('Contrast');
    const hueP = props.find((p) => p.path === 'adjustments.hue');
    expect(hueP?.displayName).toBe('Hue');
  });

  it('has interpolationType "number" for all adjustment properties', () => {
    const props = getAnimatableProperties('image');
    const adjustmentPaths = [
      'adjustments.brightness',
      'adjustments.contrast',
      'adjustments.saturation',
      'adjustments.hue',
      'adjustments.exposure',
      'adjustments.temperature',
    ];
    for (const path of adjustmentPaths) {
      const prop = props.find((p) => p.path === path);
      expect(prop?.interpolationType).toBe('number');
    }
  });
});

// ============================================================================
// detectInterpolationType for adjustment properties
// ============================================================================

describe('detectInterpolationType for image adjustments', () => {
  it('returns "number" for adjustments.brightness', () => {
    expect(detectInterpolationType('adjustments.brightness')).toBe('number');
  });

  it('returns "number" for adjustments.contrast', () => {
    expect(detectInterpolationType('adjustments.contrast')).toBe('number');
  });

  it('returns "number" for adjustments.saturation', () => {
    expect(detectInterpolationType('adjustments.saturation')).toBe('number');
  });

  it('returns "number" for adjustments.hue', () => {
    expect(detectInterpolationType('adjustments.hue')).toBe('number');
  });

  it('returns "number" for adjustments.exposure', () => {
    expect(detectInterpolationType('adjustments.exposure')).toBe('number');
  });

  it('returns "number" for adjustments.temperature', () => {
    expect(detectInterpolationType('adjustments.temperature')).toBe('number');
  });

  it('returns "number" for adjustments.tint', () => {
    expect(detectInterpolationType('adjustments.tint')).toBe('number');
  });

  it('returns "number" for adjustments.blur', () => {
    expect(detectInterpolationType('adjustments.blur')).toBe('number');
  });
});

// ============================================================================
// getProperty / setProperty for adjustment paths
// ============================================================================

describe('getProperty for image adjustment paths', () => {
  const node = makeImageNode({
    adjustments: {
      brightness: 25,
      contrast: -10,
      saturation: 50,
      hue: 30,
      exposure: 15,
      temperature: -20,
      tint: 5,
      blur: 0,
    },
  });

  it('gets adjustments.brightness', () => {
    expect(getProperty(node, 'adjustments.brightness')).toBe(25);
  });

  it('gets adjustments.contrast', () => {
    expect(getProperty(node, 'adjustments.contrast')).toBe(-10);
  });

  it('gets adjustments.saturation', () => {
    expect(getProperty(node, 'adjustments.saturation')).toBe(50);
  });

  it('gets adjustments.hue', () => {
    expect(getProperty(node, 'adjustments.hue')).toBe(30);
  });

  it('gets adjustments.exposure', () => {
    expect(getProperty(node, 'adjustments.exposure')).toBe(15);
  });

  it('gets adjustments.temperature', () => {
    expect(getProperty(node, 'adjustments.temperature')).toBe(-20);
  });

  it('gets the entire adjustments object', () => {
    const adj = getProperty(node, 'adjustments');
    expect(adj).toEqual({
      brightness: 25,
      contrast: -10,
      saturation: 50,
      hue: 30,
      exposure: 15,
      temperature: -20,
      tint: 5,
      blur: 0,
    });
  });

  it('gets image width', () => {
    expect(getProperty(node, 'width')).toBe(200);
  });

  it('gets image height', () => {
    expect(getProperty(node, 'height')).toBe(150);
  });
});

describe('setProperty for image adjustment paths', () => {
  it('sets adjustments.brightness immutably', () => {
    const node = makeImageNode();
    const updated = setProperty(node, 'adjustments.brightness', 75);
    expect(getProperty(updated, 'adjustments.brightness')).toBe(75);
    expect(getProperty(node, 'adjustments.brightness')).toBe(0); // original unchanged
  });

  it('sets adjustments.contrast immutably', () => {
    const node = makeImageNode();
    const updated = setProperty(node, 'adjustments.contrast', -50);
    expect(getProperty(updated, 'adjustments.contrast')).toBe(-50);
    expect(getProperty(node, 'adjustments.contrast')).toBe(0);
  });

  it('sets adjustments.hue immutably', () => {
    const node = makeImageNode();
    const updated = setProperty(node, 'adjustments.hue', 120);
    expect(getProperty(updated, 'adjustments.hue')).toBe(120);
    expect(getProperty(node, 'adjustments.hue')).toBe(0);
  });

  it('preserves other adjustment values when setting one', () => {
    const node = makeImageNode({
      adjustments: {
        brightness: 10,
        contrast: 20,
        saturation: 30,
        hue: 40,
        exposure: 50,
        temperature: 60,
        tint: 0,
        blur: 0,
      },
    });
    const updated = setProperty(node, 'adjustments.brightness', 99);
    expect(getProperty(updated, 'adjustments.brightness')).toBe(99);
    expect(getProperty(updated, 'adjustments.contrast')).toBe(20);
    expect(getProperty(updated, 'adjustments.saturation')).toBe(30);
    expect(getProperty(updated, 'adjustments.hue')).toBe(40);
  });

  it('preserves other node properties when setting adjustment', () => {
    const node = makeImageNode();
    const updated = setProperty(node, 'adjustments.brightness', 50);
    expect(updated.width).toBe(200);
    expect(updated.height).toBe(150);
    expect(updated.opacity).toBe(1);
    expect(updated.transform.position.x).toBe(100);
  });

  it('sets image width', () => {
    const node = makeImageNode();
    const updated = setProperty(node, 'width', 400);
    expect(updated.width).toBe(400);
    expect(node.width).toBe(200); // original unchanged
  });

  it('sets image height', () => {
    const node = makeImageNode();
    const updated = setProperty(node, 'height', 300);
    expect(updated.height).toBe(300);
    expect(node.height).toBe(150);
  });
});

// ============================================================================
// evaluateTrack for adjustment properties
// ============================================================================

describe('evaluateTrack for image adjustment properties', () => {
  it('interpolates brightness between two keyframes', () => {
    const track = createTrack<number>('img1', 'adjustments.brightness');
    addKeyframe(track, 0, 0);
    addKeyframe(track, 10, 100);
    expect(evaluateTrack(track, 5)).toBe(50);
  });

  it('interpolates contrast between two keyframes', () => {
    const track = createTrack<number>('img1', 'adjustments.contrast');
    addKeyframe(track, 0, -50);
    addKeyframe(track, 10, 50);
    expect(evaluateTrack(track, 5)).toBe(0);
  });

  it('interpolates saturation between two keyframes', () => {
    const track = createTrack<number>('img1', 'adjustments.saturation');
    addKeyframe(track, 0, 0);
    addKeyframe(track, 20, 80);
    expect(evaluateTrack(track, 10)).toBe(40);
  });

  it('interpolates hue between two keyframes', () => {
    const track = createTrack<number>('img1', 'adjustments.hue');
    addKeyframe(track, 0, -180);
    addKeyframe(track, 10, 180);
    expect(evaluateTrack(track, 5)).toBe(0);
  });

  it('interpolates exposure between two keyframes', () => {
    const track = createTrack<number>('img1', 'adjustments.exposure');
    addKeyframe(track, 0, -100);
    addKeyframe(track, 10, 100);
    expect(evaluateTrack(track, 5)).toBe(0);
  });

  it('interpolates temperature between two keyframes', () => {
    const track = createTrack<number>('img1', 'adjustments.temperature');
    addKeyframe(track, 0, 0);
    addKeyframe(track, 10, 60);
    expect(evaluateTrack(track, 5)).toBe(30);
  });

  it('holds single keyframe value beyond its frame', () => {
    const track = createTrack<number>('img1', 'adjustments.brightness');
    addKeyframe(track, 0, 42);
    expect(evaluateTrack(track, 0)).toBe(42);
    expect(evaluateTrack(track, 100)).toBe(42);
  });

  it('returns undefined for empty track', () => {
    const track = createTrack<number>('img1', 'adjustments.brightness');
    expect(evaluateTrack(track, 0)).toBeUndefined();
  });
});

// ============================================================================
// evaluateNodeAtFrame for image adjustment properties
// ============================================================================

describe('evaluateNodeAtFrame for image adjustments', () => {
  it('evaluates multiple adjustment properties at a frame', () => {
    const timeline = createTimeline();
    const brightnessTrack = createTrack<number>('img1', 'adjustments.brightness');
    addKeyframe(brightnessTrack, 0, 0);
    addKeyframe(brightnessTrack, 10, 100);
    const contrastTrack = createTrack<number>('img1', 'adjustments.contrast');
    addKeyframe(contrastTrack, 0, -50);
    addKeyframe(contrastTrack, 10, 50);
    timeline.tracks.push(brightnessTrack as any, contrastTrack as any);

    const values = evaluateNodeAtFrame(timeline, 'img1', 5);
    expect(values.get('adjustments.brightness')).toBe(50);
    expect(values.get('adjustments.contrast')).toBe(0);
  });

  it('evaluates adjustment alongside transform properties', () => {
    const timeline = createTimeline();
    const posXTrack = createTrack<number>('img1', 'transform.position.x');
    addKeyframe(posXTrack, 0, 0);
    addKeyframe(posXTrack, 10, 200);
    const brightnessTrack = createTrack<number>('img1', 'adjustments.brightness');
    addKeyframe(brightnessTrack, 0, 0);
    addKeyframe(brightnessTrack, 10, 80);
    timeline.tracks.push(posXTrack as any, brightnessTrack as any);

    const values = evaluateNodeAtFrame(timeline, 'img1', 5);
    expect(values.get('transform.position.x')).toBe(100);
    expect(values.get('adjustments.brightness')).toBe(40);
  });

  it('ignores tracks for other nodes', () => {
    const timeline = createTimeline();
    const track = createTrack<number>('other', 'adjustments.brightness');
    addKeyframe(track, 0, 50);
    timeline.tracks.push(track as any);

    const values = evaluateNodeAtFrame(timeline, 'img1', 0);
    expect(values.size).toBe(0);
  });
});

// ============================================================================
// applyAnimatedValues for image adjustments
// ============================================================================

describe('applyAnimatedValues for image adjustments', () => {
  it('applies animated adjustment values to image node', () => {
    const node = makeImageNode();
    const values = new Map<string, unknown>([
      ['adjustments.brightness', 75],
      ['adjustments.contrast', -25],
    ]);
    const result = applyAnimatedValues(node, values);

    expect(getProperty(result, 'adjustments.brightness')).toBe(75);
    expect(getProperty(result, 'adjustments.contrast')).toBe(-25);
    // Original unchanged
    expect(getProperty(node, 'adjustments.brightness')).toBe(0);
    expect(getProperty(node, 'adjustments.contrast')).toBe(0);
  });

  it('applies mixed transform and adjustment values', () => {
    const node = makeImageNode();
    const values = new Map<string, unknown>([
      ['transform.position.x', 500],
      ['adjustments.brightness', 50],
      ['opacity', 0.5],
    ]);
    const result = applyAnimatedValues(node, values);

    expect(result.transform.position.x).toBe(500);
    expect(getProperty(result, 'adjustments.brightness')).toBe(50);
    expect(result.opacity).toBe(0.5);
  });

  it('returns same node for empty map', () => {
    const node = makeImageNode();
    const result = applyAnimatedValues(node, new Map());
    expect(result).toBe(node);
  });
});

// ============================================================================
// Image Corner Radius - get/set/animate
// ============================================================================

describe('getProperty for image cornerRadius', () => {
  const node = makeImageNode({ cornerRadius: [10, 20, 30, 40] });

  it('gets cornerRadius.0 (TL)', () => {
    expect(getProperty(node, 'cornerRadius.0')).toBe(10);
  });

  it('gets cornerRadius.1 (TR)', () => {
    expect(getProperty(node, 'cornerRadius.1')).toBe(20);
  });

  it('gets cornerRadius.2 (BR)', () => {
    expect(getProperty(node, 'cornerRadius.2')).toBe(30);
  });

  it('gets cornerRadius.3 (BL)', () => {
    expect(getProperty(node, 'cornerRadius.3')).toBe(40);
  });

  it('gets entire cornerRadius array', () => {
    expect(getProperty(node, 'cornerRadius')).toEqual([10, 20, 30, 40]);
  });
});

describe('setProperty for image cornerRadius', () => {
  it('sets cornerRadius.0 immutably', () => {
    const node = makeImageNode();
    const updated = setProperty(node, 'cornerRadius.0', 25);
    expect(getProperty(updated, 'cornerRadius.0')).toBe(25);
    expect(getProperty(node, 'cornerRadius.0')).toBe(0); // original unchanged
  });

  it('sets cornerRadius.2 immutably', () => {
    const node = makeImageNode();
    const updated = setProperty(node, 'cornerRadius.2', 50);
    expect(getProperty(updated, 'cornerRadius.2')).toBe(50);
    expect(getProperty(node, 'cornerRadius.2')).toBe(0);
  });

  it('preserves other corner values when setting one', () => {
    const node = makeImageNode({ cornerRadius: [10, 20, 30, 40] });
    const updated = setProperty(node, 'cornerRadius.1', 99);
    expect(getProperty(updated, 'cornerRadius.0')).toBe(10);
    expect(getProperty(updated, 'cornerRadius.1')).toBe(99);
    expect(getProperty(updated, 'cornerRadius.2')).toBe(30);
    expect(getProperty(updated, 'cornerRadius.3')).toBe(40);
  });
});

describe('detectInterpolationType for image cornerRadius', () => {
  it('returns "number" for cornerRadius.0', () => {
    expect(detectInterpolationType('cornerRadius.0')).toBe('number');
  });

  it('returns "number" for cornerRadius.3', () => {
    expect(detectInterpolationType('cornerRadius.3')).toBe('number');
  });
});

describe('evaluateTrack for image cornerRadius', () => {
  it('interpolates cornerRadius.0 between two keyframes', () => {
    const track = createTrack<number>('img1', 'cornerRadius.0');
    addKeyframe(track, 0, 0);
    addKeyframe(track, 10, 50);
    expect(evaluateTrack(track, 5)).toBe(25);
  });

  it('interpolates cornerRadius.2 between two keyframes', () => {
    const track = createTrack<number>('img1', 'cornerRadius.2');
    addKeyframe(track, 0, 10);
    addKeyframe(track, 20, 30);
    expect(evaluateTrack(track, 10)).toBe(20);
  });
});

describe('applyAnimatedValues for image cornerRadius', () => {
  it('applies animated corner radius values to image node', () => {
    const node = makeImageNode();
    const values = new Map<string, unknown>([
      ['cornerRadius.0', 15],
      ['cornerRadius.2', 30],
    ]);
    const result = applyAnimatedValues(node, values);

    expect(getProperty(result, 'cornerRadius.0')).toBe(15);
    expect(getProperty(result, 'cornerRadius.2')).toBe(30);
    // Untouched corners stay at 0
    expect(getProperty(result, 'cornerRadius.1')).toBe(0);
    expect(getProperty(result, 'cornerRadius.3')).toBe(0);
    // Original unchanged
    expect(getProperty(node, 'cornerRadius.0')).toBe(0);
  });
});
