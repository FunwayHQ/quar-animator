import { describe, expect, it } from 'vitest';
import { addKeyframe, createTimeline, getOrCreateTrack } from '@quar/animation';
import { SceneGraph, createDefaultTransform } from '@quar/core';
import type { Node } from '@quar/types';

import { lengthenedToFit } from './timelineLength';

const layer = (id: string, type: string) =>
  ({
    id,
    name: id,
    type,
    parent: null,
    children: [],
    transform: createDefaultTransform(),
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    width: 10,
    height: 10,
    fills: [],
    clipContent: true,
  }) as unknown as Node;

describe('the animation tools lengthen the timeline in view', () => {
  const sg = new SceneGraph();
  sg.addNode(layer('slide', 'artboard'));
  sg.addNode(layer('box', 'rectangle'), 'slide');
  sg.addNode(layer('loose', 'rectangle'));
  const before = createTimeline({ duration: 100, artboards: { slide: { duration: 40 } } });
  // A preset wrote the box a keyframe at frame 59 (the tools lengthen the page's: 100 stays)
  const written = structuredClone(before);
  addKeyframe(getOrCreateTrack<number>(written, 'box', 'opacity'), 59, 0);

  it('in an artboard: the artboard’s, to fit its keyframes; the page’s stays', () => {
    const fields = lengthenedToFit(
      { timeline: before, timelineScope: 'slide', timelineDuration: 40 },
      written,
      sg
    );
    expect(fields.timelineDuration).toBe(60);
    expect(fields.timeline.artboards?.slide?.duration).toBe(60);
    expect(fields.timeline.duration).toBe(100);
  });

  it('on the page: the page’s, as before', () => {
    const longer = { ...written, duration: 160 };
    const fields = lengthenedToFit(
      { timeline: before, timelineScope: null, timelineDuration: 100 },
      longer,
      sg
    );
    expect(fields.timelineDuration).toBe(160);
    expect(fields.timeline).toBe(longer);
  });
});
