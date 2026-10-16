import { describe, expect, it } from 'vitest';
import type { PropertyTrack } from '@quar/types';
import { getAnimationSpans } from './AnimationSpans';
import { applyAnimationPreset } from './AnimationPresets';
import { createTimeline } from './Timeline';
import type { RectangleNode, TextNode } from '@quar/types';

function track(property: string, keyframes: Array<[number, unknown]>): PropertyTrack {
  return {
    id: `track-${property}`,
    nodeId: 'n1',
    property,
    keyframes: keyframes.map(([time, value], index) => ({
      id: `${property}-${index}`,
      time,
      value,
      easing: 'linear',
    })),
  };
}

function makeRect(): RectangleNode {
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
    opacity: 1,
    blendMode: 'normal',
    width: 100,
    height: 50,
    cornerRadius: [0, 0, 0, 0],
    fills: [],
    strokes: [],
  };
}

describe('getAnimationSpans', () => {
  it('spans the keyframes of one animation across properties', () => {
    const timeline = applyAnimationPreset(createTimeline(), makeRect(), 'pop-in', 0, 24);
    expect(getAnimationSpans(timeline.tracks)).toEqual([{ start: 0, end: 24 }]);
  });

  it('joins the beats of a multi-keyframe animation into one span', () => {
    const timeline = applyAnimationPreset(createTimeline(), makeRect(), 'bounce', 12, 24);
    // The preset panel pads frame 0 with the rest value, which holds until 12
    expect(getAnimationSpans(timeline.tracks)).toEqual([{ start: 12, end: 36 }]);
  });

  it('splits runs where Animation Sequence steps meet', () => {
    const opacity = track('opacity', [
      [0, 0],
      [24, 1],
      [48, 0],
    ]);
    // As compiled: fade in (0–24) then fade out (24–48); frame 24 is the later step's
    opacity.keyframes[0]!.sequenceStepId = 'in';
    opacity.keyframes[1]!.sequenceStepId = 'out';
    opacity.keyframes[2]!.sequenceStepId = 'out';
    expect(getAnimationSpans([opacity])).toEqual([
      { start: 0, end: 24 },
      { start: 24, end: 48 },
    ]);
    // Untagged, the same keyframes read as one continuous animation
    for (const keyframe of opacity.keyframes) delete keyframe.sequenceStepId;
    expect(getAnimationSpans([opacity])).toEqual([{ start: 0, end: 48 }]);
  });

  it('keeps animations separated by a rest apart', () => {
    const opacity = track('opacity', [
      [0, 0],
      [24, 1],
      [100, 1],
      [124, 0],
    ]);
    expect(getAnimationSpans([opacity])).toEqual([
      { start: 0, end: 24 },
      { start: 100, end: 124 },
    ]);
  });

  it('merges overlapping ranges from different properties', () => {
    const spans = getAnimationSpans([
      track('opacity', [
        [0, 0],
        [6, 1],
      ]),
      track('transform.position.x', [
        [4, 0],
        [30, 50],
      ]),
      track('transform.rotation', [
        [40, 0],
        [50, 90],
      ]),
    ]);
    expect(spans).toEqual([
      { start: 0, end: 30 },
      { start: 40, end: 50 },
    ]);
  });

  it('keeps back-to-back animations as separate spans', () => {
    const spans = getAnimationSpans([
      track('opacity', [
        [0, 0],
        [24, 1],
      ]),
      track('transform.position.x', [
        [24, 0],
        [48, 30],
      ]),
    ]);
    expect(spans).toEqual([
      { start: 0, end: 24 },
      { start: 24, end: 48 },
    ]);
  });

  it('treats a stepped word reveal as one continuous animation', () => {
    const text: TextNode = {
      ...makeRect(),
      id: 'text1',
      type: 'text',
      content: 'one two three',
      fontFamily: 'Arial',
      fontSize: 24,
      fontWeight: 400,
      fontStyle: 'normal',
      textAlign: 'left',
      lineHeight: 1.2,
      letterSpacing: 0,
    };
    const timeline = applyAnimationPreset(createTimeline(), text, 'word-reveal', 0, 30);
    expect(getAnimationSpans(timeline.tracks)).toEqual([{ start: 0, end: 30 }]);
  });

  it('ignores holds and single keyframes', () => {
    expect(
      getAnimationSpans([
        track('opacity', [
          [0, 1],
          [30, 1],
        ]),
        track('transform.rotation', [[12, 45]]),
      ])
    ).toEqual([]);
  });

  it('compares colour and vector values by content', () => {
    const color = track('fills.0.color', [
      [0, { r: 1, g: 0, b: 0, a: 1 }],
      [10, { r: 1, g: 0, b: 0, a: 1 }],
      [20, { r: 0, g: 0, b: 1, a: 1 }],
    ]);
    expect(getAnimationSpans([color])).toEqual([{ start: 10, end: 20 }]);
  });
});
