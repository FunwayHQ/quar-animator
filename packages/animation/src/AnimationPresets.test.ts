import { describe, expect, it } from 'vitest';
import type { RectangleNode } from '@quar/types';
import { addKeyframe, createTimeline, getOrCreateTrack } from './Timeline';
import { applyAnimationPreset, createAnimationPresetKeyframes } from './AnimationPresets';

function makeNode(): RectangleNode {
  return {
    id: 'rect1',
    name: 'Rectangle',
    type: 'rectangle',
    parent: null,
    children: [],
    transform: {
      position: { x: 100, y: 80 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      anchor: { x: 0.5, y: 0.5 },
      skew: { x: 0, y: 0 },
    },
    visible: true,
    locked: false,
    opacity: 0.8,
    blendMode: 'normal',
    width: 100,
    height: 50,
    cornerRadius: [0, 0, 0, 0],
    fills: [],
    strokes: [],
  };
}

describe('animation presets', () => {
  it('creates entrance keyframes from the node’s current values', () => {
    const preset = createAnimationPresetKeyframes(makeNode(), 'rise-in', 10, 24);

    expect(preset.keyframes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'opacity', time: 10, value: 0 }),
        expect.objectContaining({ property: 'opacity', time: 34, value: 0.8 }),
        expect.objectContaining({ property: 'transform.position.y', time: 10, value: 32 }),
        expect.objectContaining({ property: 'transform.position.y', time: 34, value: 80 }),
      ])
    );
  });

  it('creates multi-beat emphasis and exit motion', () => {
    const node = makeNode();
    const pulse = createAnimationPresetKeyframes(node, 'pulse', 5, 24);
    const pulseScaleX = pulse.keyframes.filter(
      (keyframe) => keyframe.property === 'transform.scale.x'
    );
    expect(pulseScaleX.map((keyframe) => [keyframe.time, keyframe.value])).toEqual([
      [5, 1],
      [17, 1.12],
      [29, 1],
    ]);

    const slideOut = createAnimationPresetKeyframes(node, 'slide-out', 5, 24);
    expect(slideOut.keyframes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'opacity', time: 29, value: 0 }),
        expect.objectContaining({ property: 'transform.position.x', time: 29, value: 164 }),
      ])
    );
  });

  it('keeps earlier keyframes, replaces future ones on affected properties, and leaves other tracks intact', () => {
    const node = makeNode();
    const timeline = createTimeline({ duration: 30 });
    const xTrack = getOrCreateTrack<number>(timeline, node.id, 'transform.position.x');
    addKeyframe(xTrack, 0, 90);
    addKeyframe(xTrack, 20, 120);
    const opacityTrack = getOrCreateTrack<number>(timeline, node.id, 'opacity');
    addKeyframe(opacityTrack, 0, 0.5);
    const unrelatedTrack = getOrCreateTrack<number>(timeline, 'other', 'opacity');
    addKeyframe(unrelatedTrack, 20, 0.25);

    const updated = applyAnimationPreset(timeline, node, 'slide-in', 10, 24);

    const updatedX = updated.tracks.find(
      (track) => track.nodeId === node.id && track.property === 'transform.position.x'
    )!;
    expect(updatedX.keyframes.map((keyframe) => [keyframe.time, keyframe.value])).toEqual([
      [0, 90],
      [10, 36],
      [34, 100],
    ]);
    expect(
      updated.tracks.find((track) => track.nodeId === node.id && track.property === 'opacity')
        ?.keyframes
    ).toHaveLength(3);
    expect(
      updated.tracks.find((track) => track.nodeId === 'other' && track.property === 'opacity')
        ?.keyframes
    ).toHaveLength(1);
    expect(timeline.duration).toBe(30);
    expect(updated.duration).toBe(35);
  });

  it('holds the original value until a preset applied after frame zero begins', () => {
    const node = makeNode();
    const updated = applyAnimationPreset(createTimeline({ duration: 30 }), node, 'fade-in', 12, 24);
    const opacityTrack = updated.tracks.find((track) => track.property === 'opacity')!;

    expect(opacityTrack.keyframes.map((keyframe) => [keyframe.time, keyframe.value])).toEqual([
      [0, 0.8],
      [12, 0],
      [36, 0.8],
    ]);
  });
});
