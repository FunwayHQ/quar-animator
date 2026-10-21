/**
 * Tests for the scene's extent over its animation
 */

import { describe, it, expect } from 'vitest';
import type { Node } from '@quar/types';
import { SceneGraph, createDefaultTransform } from '@quar/core';
import { addKeyframe, createTimeline, getOrCreateTrack } from '@quar/animation';
import { getAnimatedArtworkBounds, sampleFrames } from './sceneExtent';
import { riggedArm } from './__fixtures__/riggedArm';

function square(id: string, x: number): Node {
  return {
    id,
    name: id,
    type: 'rectangle',
    parent: null,
    children: [],
    transform: { ...createDefaultTransform(), position: { x, y: 0 } },
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    width: 20,
    height: 20,
    cornerRadius: [0, 0, 0, 0],
    fills: [],
    strokes: [],
  } as Node;
}

describe('sampleFrames', () => {
  it('spreads frames evenly, both ends included', () => {
    expect(sampleFrames(0, 10, 6)).toEqual([0, 2, 4, 6, 8, 10]);
    expect(sampleFrames(0, 299).length).toBeLessThanOrEqual(61);
    expect(sampleFrames(0, 299).at(-1)).toBe(299);
    expect(sampleFrames(5, 5)).toEqual([5]);
  });
});

describe('getAnimatedArtworkBounds', () => {
  it('covers where the artwork goes, without moving the scene', () => {
    const sg = new SceneGraph();
    sg.addNode(square('ball', 0));
    const timeline = createTimeline({ duration: 60 });
    const x = getOrCreateTrack<number>(timeline, 'ball', 'transform.position.x');
    addKeyframe(x, 0, 0);
    addKeyframe(x, 59, 300);

    const bounds = getAnimatedArtworkBounds(sg, timeline, [], sampleFrames(0, 59));

    expect(bounds).toEqual({ x: -10, y: -10, width: 320, height: 20 });
    expect(sg.getNode('ball')!.transform.position.x).toBe(0);
  });

  it('is the still artwork for a scene with no animation, and null for an empty one', () => {
    const sg = new SceneGraph();
    sg.addNode(square('still', 50));
    expect(getAnimatedArtworkBounds(sg, createTimeline(), [], [0, 10])).toEqual({
      x: 40,
      y: -10,
      width: 20,
      height: 20,
    });
    expect(getAnimatedArtworkBounds(new SceneGraph(), createTimeline(), [], [0])).toBeNull();
  });
});

describe('getAnimatedArtworkBounds with a rig', () => {
  it('covers a bound shape where its bones bend it, not where it is at rest', () => {
    const { sg, timeline } = riggedArm();
    const atRest = getAnimatedArtworkBounds(sg, timeline, [], [0])!;
    expect(atRest.y + atRest.height).toBeCloseTo(20, 0);

    const bent = getAnimatedArtworkBounds(sg, timeline, [], sampleFrames(0, 10), {
      frameRate: 30,
    })!;
    // The forearm swings up past y = 60 (the shape at rest only reaches 20)
    expect(bent.y + bent.height).toBeGreaterThan(60);
    expect(bent.x).toBeCloseTo(atRest.x, 0);
  });
});
